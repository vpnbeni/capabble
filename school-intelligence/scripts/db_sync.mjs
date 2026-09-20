#!/usr/bin/env node
/**
 * Cross-platform School Intelligence Postgres dump/restore (push local→cloud, pull cloud→local).
 * Usage (from repo root):
 *   node school-intelligence/scripts/db_sync.mjs push [--yes]
 *   node school-intelligence/scripts/db_sync.mjs pull [--yes]
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createInterface } from "node:readline";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SI_ROOT = join(__dirname, "..");
const ENV_FILE = join(SI_ROOT, ".env");

const mode = process.argv[2];
const yesFlag = process.argv.includes("--yes") || process.argv.includes("-y");

if (mode !== "push" && mode !== "pull") {
  console.error("Usage: node db_sync.mjs <push|pull> [--yes]");
  process.exit(1);
}

function loadDotenv(filePath) {
  const env = {};
  let text;
  try {
    text = readFileSync(filePath, "utf8");
  } catch {
    return env;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || /^\s*#/.test(line)) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

function urlToPg(url) {
  if (!url) return "";
  return url
    .replace(/^postgresql\+psycopg:\/\//, "postgresql://")
    .replace(/^postgresql\+psycopg2:\/\//, "postgresql://")
    .replace(/^postgres\+psycopg:\/\//, "postgresql://");
}

/** Neon pooler hosts often fail for pg_restore; use direct endpoint. */
function neonDirectUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("-pooler.")) {
      parsed.hostname = parsed.hostname.replace("-pooler.", ".");
    }
    parsed.searchParams.delete("channel_binding");
    return parsed.toString();
  } catch {
    return url.replace("-pooler.", ".").replace(/[?&]channel_binding=[^&]*/g, "");
  }
}

function maskUrl(url) {
  return url.replace(/(:\/\/[^:/?#]+:)[^@/?#]+@/, "$1***@");
}

function requireCmd(cmd) {
  const which = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(which, [cmd], { encoding: "utf8", shell: process.platform === "win32" });
  if (result.status !== 0) {
    console.error(`ERROR: '${cmd}' not found. Install PostgreSQL client tools (pg_dump, pg_restore, psql).`);
    process.exit(1);
  }
}

function run(cmd, args, { allowFail = false } = {}) {
  const result = spawnSync(cmd, args, { encoding: "utf8", shell: false });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0 && !allowFail) {
    process.exit(result.status ?? 1);
  }
  return result;
}

async function confirmDestructive(targetLabel) {
  if (yesFlag) return;
  console.log("");
  console.log(`WARNING: This will DESTROY existing data on: ${targetLabel}`);
  console.log("Type 'destroy' to continue:");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question("", resolve));
  rl.close();
  if (answer.trim() !== "destroy") {
    console.log("Aborted.");
    process.exit(1);
  }
}

function verifyCounts(url) {
  console.log("");
  console.log(`Verification on ${maskUrl(url)}:`);
  run("psql", [url, "-v", "ON_ERROR_STOP=1", "-c", "SELECT COUNT(*) AS public_tables FROM information_schema.tables WHERE table_schema = 'public';"]);
  run("psql", [url, "-c", "SELECT version_num AS alembic_version FROM alembic_version LIMIT 1;"], { allowFail: true });
  run("psql", [url, "-c", "SELECT COUNT(*) AS schools FROM schools;"], { allowFail: true });
}

function dumpRestore(sourceUrl, destUrl) {
  requireCmd("pg_dump");
  requireCmd("pg_restore");
  requireCmd("psql");

  const destPg = neonDirectUrl(destUrl);
  if (destPg !== destUrl) {
    console.log(`Using Neon direct endpoint for restore: ${maskUrl(destPg)}`);
  }

  const tmpDir = mkdtempSync(join(tmpdir(), "schol_sync_"));
  const dumpFile = join(tmpDir, "dump.dump");

  try {
    console.log(`Dumping source → ${dumpFile}`);
    console.log(`  from ${maskUrl(sourceUrl)}`);
    run("pg_dump", [sourceUrl, "-Fc", "--no-owner", "--no-acl", "-f", dumpFile]);

    console.log(`Restoring into ${maskUrl(destPg)}`);
    console.log("Note: Neon pooler hosts can fail for restore; direct endpoint is used when detected.");

    const restoreArgs = ["--no-owner", "--no-acl", "--clean", "--if-exists", "-d", destPg, dumpFile];
    const restore = spawnSync("pg_restore", restoreArgs, { encoding: "utf8", shell: false });
    if (restore.stdout) process.stdout.write(restore.stdout);
    if (restore.stderr) process.stderr.write(restore.stderr);

    if (restore.status !== 0) {
      console.log("pg_restore with --clean failed; wiping public schema and retrying...");
      run("psql", [destPg, "-v", "ON_ERROR_STOP=1", "-c", "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"]);
      run("pg_restore", ["--no-owner", "--no-acl", "-d", destPg, dumpFile]);
    }

    verifyCounts(destPg);
    console.log("Done.");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function main() {
  const env = loadDotenv(ENV_FILE);
  const localRaw = env.SCHOOL_INTEL_DATABASE_URL || process.env.SCHOOL_INTEL_DATABASE_URL || "";
  const cloudRaw = env.SCHOOL_INTEL_CLOUD_DATABASE_URL || process.env.SCHOOL_INTEL_CLOUD_DATABASE_URL || "";

  if (!localRaw) {
    console.error("ERROR: SCHOOL_INTEL_DATABASE_URL is not set (local).");
    console.error(`Add it to ${ENV_FILE}`);
    process.exit(1);
  }
  if (!cloudRaw) {
    console.error("ERROR: SCHOOL_INTEL_CLOUD_DATABASE_URL is not set (cloud).");
    console.error(`Add it to ${ENV_FILE} (Neon URL with sslmode=require). Do not commit .env.`);
    process.exit(1);
  }

  const localUrl = urlToPg(localRaw);
  const cloudUrl = urlToPg(cloudRaw);

  if (mode === "push") {
    console.log("=== School Intelligence: push local → cloud ===");
    console.log(`Source: ${maskUrl(localUrl)}`);
    console.log(`Dest:   ${maskUrl(cloudUrl)}`);
    await confirmDestructive("CLOUD database");
    dumpRestore(localUrl, cloudUrl);
  } else {
    console.log("=== School Intelligence: pull cloud → local ===");
    console.log(`Source: ${maskUrl(cloudUrl)}`);
    console.log(`Dest:   ${maskUrl(localUrl)}`);
    await confirmDestructive("LOCAL database");
    dumpRestore(neonDirectUrl(cloudUrl), localUrl);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

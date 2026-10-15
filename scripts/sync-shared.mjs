#!/usr/bin/env node
// Copies files from packages/shared into apps that are deployed standalone and
// therefore cannot import the workspace package (currently only server/).
//
//   node scripts/sync-shared.mjs          copy
//   node scripts/sync-shared.mjs --check  exit 1 if any copy is out of date

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const COPIES = [
  {
    from: 'packages/shared/src/tenantFeatureCatalog.json',
    to: 'server/src/constants/tenantFeatureCatalog.json',
  },
  {
    from: 'packages/shared/src/permissionCatalog.json',
    to: 'server/src/constants/permissionCatalog.json',
  },
]

const checkOnly = process.argv.includes('--check')
const stale = []

for (const { from, to } of COPIES) {
  const source = readFileSync(join(root, from), 'utf8')
  let target = null
  try {
    target = readFileSync(join(root, to), 'utf8')
  } catch {
    // missing target counts as stale
  }

  if (source === target) continue

  if (checkOnly) {
    stale.push(to)
  } else {
    writeFileSync(join(root, to), source)
    console.log(`synced ${relative(root, join(root, from))} -> ${to}`)
  }
}

if (stale.length > 0) {
  console.error('Shared files are out of date. Run `npm run sync:shared` and commit:')
  stale.forEach((file) => console.error(`  ${file}`))
  process.exit(1)
}

if (checkOnly) console.log('shared files in sync')

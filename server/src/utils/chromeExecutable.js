const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer');

/**
 * Resolve a Chrome binary for puppeteer.launch().
 *
 * Puppeteer pins an exact Chrome build per release, so after a dependency bump the
 * server can still hold only the previous build in its cache ("Could not find Chrome
 * (ver. X)"). Instead of failing, fall back to any Chrome already on the machine.
 *
 * Order: PUPPETEER_EXECUTABLE_PATH → puppeteer's pinned build → newest build in the
 * puppeteer cache → system Chrome/Chromium. Resolves to undefined to let puppeteer
 * raise its own error when nothing is found.
 */
let cachedPath;

const isFile = (p) => {
  try {
    return Boolean(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

const compareVersions = (a, b) => {
  const pa = a.split(/[^\d]+/).filter(Boolean).map(Number);
  const pb = b.split(/[^\d]+/).filter(Boolean).map(Number);
  const len = Math.max(pa.length, pb.length);
  const diff = Array.from({ length: len }, (_, i) => (pa[i] || 0) - (pb[i] || 0)).find((d) => d !== 0);
  return diff || 0;
};

// Binary inside one cached build dir, e.g. chrome/linux-152.0.7977.42/chrome-linux64/chrome
const MAC_APP_BIN = path.join('Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
const CACHE_BIN_PATHS = [
  path.join('chrome-linux64', 'chrome'),
  path.join('chrome-headless-shell-linux64', 'chrome-headless-shell'),
  path.join('chrome-mac-arm64', MAC_APP_BIN),
  path.join('chrome-mac-x64', MAC_APP_BIN),
  path.join('chrome-win64', 'chrome.exe')
];

const listDir = (dir) => {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
};

function findInPuppeteerCache() {
  const cacheDir = process.env.PUPPETEER_CACHE_DIR || path.join(os.homedir(), '.cache', 'puppeteer');

  const candidates = ['chrome', 'chrome-headless-shell'].flatMap((product) => {
    const productDir = path.join(cacheDir, product);
    return listDir(productDir).map((build) => ({
      version: build.replace(/^[a-z0-9_-]*?-(?=\d)/i, ''),
      bin: CACHE_BIN_PATHS.map((rel) => path.join(productDir, build, rel)).find(isFile)
    }));
  }).filter((c) => c.bin);

  candidates.sort((a, b) => compareVersions(b.version, a.version));
  return candidates[0]?.bin;
}

const SYSTEM_CHROME_PATHS = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
];

async function resolveChromeExecutablePath() {
  if (cachedPath && isFile(cachedPath)) return cachedPath;

  let pinned;
  try {
    pinned = await puppeteer.executablePath();
  } catch {
    pinned = undefined;
  }

  const resolved = [process.env.PUPPETEER_EXECUTABLE_PATH, pinned].find(isFile)
    || findInPuppeteerCache()
    || SYSTEM_CHROME_PATHS.find(isFile);

  if (resolved && resolved !== pinned) {
    console.warn(`[puppeteer] Pinned Chrome not found at ${pinned}; using ${resolved}. `
      + 'Run "npx puppeteer browsers install chrome" in /server to fix.');
  }

  cachedPath = resolved;
  return resolved;
}

module.exports = { resolveChromeExecutablePath };

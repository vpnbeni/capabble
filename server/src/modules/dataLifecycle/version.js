// The app version written into backup and archive manifests.
const path = require('path');
const { execFileSync } = require('child_process');

let cached = null;

const appVersion = () => {
  if (cached) return cached;
  // eslint-disable-next-line global-require
  const { version } = require('../../../package.json');
  let commit = String(process.env.GIT_COMMIT || '').trim();
  if (!commit) {
    try {
      commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: path.resolve(__dirname, '../../..'), stdio: ['ignore', 'pipe', 'ignore']
      }).toString().trim();
    } catch {
      commit = '';
    }
  }
  cached = { version, commit };
  return cached;
};

module.exports = { appVersion };

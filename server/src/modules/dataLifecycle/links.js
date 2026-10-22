// Signed, expiring download links for workspace archives (used in emails and Settings → Account).
const crypto = require('crypto');
const config = require('./config');

const sign = (archiveId, exp) => crypto
  .createHmac('sha256', `${config.linkSecret}:workspace-archive`)
  .update(`${archiveId}.${exp}`)
  .digest('base64url');

const signedDownloadUrl = (archiveId, { seconds = config.linkDays * 86400, now = Date.now() } = {}) => {
  const exp = Math.floor(now / 1000) + seconds;
  return {
    url: `${config.apiUrl}/workspace-archives/${archiveId}/download?exp=${exp}&sig=${sign(String(archiveId), exp)}`,
    expiresAt: new Date(exp * 1000)
  };
};

const verifyDownload = (archiveId, exp, sig, now = Date.now()) => {
  const expiry = Number(exp);
  if (!config.linkSecret || !Number.isFinite(expiry) || expiry * 1000 < now || typeof sig !== 'string') return false;
  const expected = Buffer.from(sign(String(archiveId), expiry));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
};

module.exports = { signedDownloadUrl, verifyDownload };

// Asks the main server (ERP) for a school's live active-student count when STDNT is on.
const http = require('http');
const https = require('https');

function getStudentCount(tenantSlug, { timeoutMs = 5000 } = {}) {
  const base = process.env.ERP_INTERNAL_URL;
  if (!base) return Promise.resolve(null);
  const url = new URL(`/internal/billing/student-count/${encodeURIComponent(tenantSlug)}`, base);
  const lib = url.protocol === 'https:' ? https : http;
  return new Promise((resolve) => {
    const req = lib.request(url, {
      method: 'GET',
      headers: { 'x-billing-service-token': process.env.BILLING_SERVICE_TOKEN || '', accept: 'application/json' },
      timeout: timeoutMs,
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          const count = json?.data?.count;
          resolve(res.statusCode === 200 && Number.isInteger(count) ? count : null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve(null));
    req.end();
  });
}

module.exports = { getStudentCount };

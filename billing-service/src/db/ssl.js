// TLS for the billing database. Neon's certificates are publicly trusted, so nothing is
// needed there. Providers with their own CA (e.g. Aiven) need DATABASE_CA_CERT: a path
// to the CA file or the PEM text itself.
const fs = require('fs');

function connectionOptions(connectionString) {
  const ca = process.env.DATABASE_CA_CERT;
  const skipVerify = String(process.env.DATABASE_SSL_SKIP_VERIFY || 'false') === 'true';
  if (!ca && !skipVerify) return { connectionString };

  if (skipVerify && process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_SSL_SKIP_VERIFY is not allowed in production; set DATABASE_CA_CERT');
  }
  // An explicit ssl object wins only when sslmode is not also in the URL.
  const url = new URL(connectionString);
  url.searchParams.delete('sslmode');
  const ssl = ca
    ? { ca: ca.includes('BEGIN CERTIFICATE') ? ca : fs.readFileSync(ca, 'utf8'), rejectUnauthorized: true }
    : { rejectUnauthorized: false };
  return { connectionString: url.toString(), ssl };
}

module.exports = { connectionOptions };

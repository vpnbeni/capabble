require('dotenv').config();

// Billing module schema and migrations (Postgres). Migrations run over the direct
// (unpooled) Neon connection: `npm run billing:db:generate` / `npm run billing:db:migrate`.
module.exports = {
  dialect: 'postgresql',
  schema: './src/modules/billing/db/schema.js',
  out: './src/modules/billing/migrations',
  schemaFilter: ['billing'],
  dbCredentials: {
    url: process.env.BILLING_DATABASE_URL_UNPOOLED || process.env.BILLING_DATABASE_URL || '',
  },
  strict: true,
  verbose: true,
};

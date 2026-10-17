require('dotenv').config();

// Migrations always run over the direct (unpooled) Neon connection.
module.exports = {
  dialect: 'postgresql',
  schema: './src/db/schema.js',
  out: './drizzle',
  schemaFilter: ['billing'],
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || '',
  },
  strict: true,
  verbose: true,
};

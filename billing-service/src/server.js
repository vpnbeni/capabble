require('dotenv').config();

const app = require('./app');
const { ping, closeDb } = require('./db/client');

const PORT = Number.parseInt(process.env.PORT || '5100', 10);

async function bootstrap() {
  if (process.env.NODE_ENV === 'production' && !process.env.BILLING_SERVICE_TOKEN) {
    throw new Error('BILLING_SERVICE_TOKEN must be set in production');
  }
  // Wakes a suspended Neon compute before the first real request needs it.
  try {
    const ms = await ping();
    console.log(`[billing-service] database reachable (${ms}ms)`);
  } catch (error) {
    console.warn('[billing-service] database not reachable yet; requests will retry', error.code || error.message);
  }

  const server = app.listen(PORT, () => {
    console.log(`[billing-service] running on port ${PORT}`);
  });

  const shutdown = async (signal) => {
    console.log(`[billing-service] ${signal} received, shutting down`);
    server.close(async () => {
      await closeDb().catch(() => {});
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((error) => {
  console.error('[billing-service] failed to start', error);
  process.exit(1);
});

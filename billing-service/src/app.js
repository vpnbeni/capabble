const express = require('express');
const morgan = require('morgan');

const internalRoutes = require('./routes/internalRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const errorHandler = require('./middleware/errorHandler');
const { ping } = require('./db/client');

const app = express();

app.disable('x-powered-by');
app.use(express.json({
  limit: '2mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
}));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

app.get('/health', async (_req, res) => {
  try {
    const latencyMs = await ping();
    res.status(200).json({ success: true, message: 'Capabble billing service is healthy', database: { ok: true, latencyMs }, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ success: false, message: 'Billing database unreachable', database: { ok: false, error: error.code || error.message }, timestamp: new Date().toISOString() });
  }
});

app.use('/webhooks', webhookRoutes);
app.use('/internal', internalRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

app.use(errorHandler);

module.exports = app;

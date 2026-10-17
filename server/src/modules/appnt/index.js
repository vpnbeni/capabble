const { mountRoutes } = require('./routes');
const listeners = require('./listeners');

module.exports = { key: 'appnt', label: 'APPNT — Appointments', mountRoutes, models: {}, listeners };

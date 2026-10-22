const { mountRoutes } = require('./routes');
const calendar = require('./calendar');
const listeners = require('./listeners');

module.exports = { key: 'appnt', label: 'APPNT — Appointments', mountRoutes, models: {}, listeners, calendar };

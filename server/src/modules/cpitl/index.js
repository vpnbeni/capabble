const { mountRoutes } = require('./routes');
const calendar = require('./calendar');

module.exports = {
  key: 'cpitl',
  label: 'CPITL — Capital & Finance',
  mountRoutes,
  models: {},
  listeners: [],
  calendar,
};

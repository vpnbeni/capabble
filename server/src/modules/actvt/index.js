const { mountRoutes } = require('./routes');
const calendar = require('./calendar');

module.exports = {
  key: 'actvt',
  label: 'ACTVT — Activities',
  mountRoutes,
  models: {},
  listeners: [],
  calendar,
};

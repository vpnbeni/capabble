const { mountRoutes } = require('./routes');

module.exports = {
  key: 'search',
  label: 'Global search (command palette)',
  mountRoutes,
  models: {},
  listeners: []
};

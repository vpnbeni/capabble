const cpitlRoutes = require('../../routes/cpitlRoutes');

const mountRoutes = (router) => {
  router.use('/cpitl', cpitlRoutes);
};

module.exports = { mountRoutes };

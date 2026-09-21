const asetsRoutes = require('../../routes/asetsRoutes');

const mountRoutes = (router) => {
  router.use('/asets', asetsRoutes);
};

module.exports = { mountRoutes };

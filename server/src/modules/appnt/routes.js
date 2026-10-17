const appntRoutes = require('../../routes/appntRoutes');

const mountRoutes = (router) => router.use('/appnt', appntRoutes);

module.exports = { mountRoutes };

const libryRoutes = require('../../routes/libryRoutes');
const mountRoutes = (router) => router.use('/libry', libryRoutes);
module.exports = { mountRoutes };

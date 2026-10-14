const express = require('express');
const { protect } = require('../../middleware/auth');
const { globalSearch } = require('./controller');

const searchRouter = express.Router();
searchRouter.get('/', protect, globalSearch);

const mountRoutes = (router) => {
  router.use('/search', searchRouter);
};

module.exports = { mountRoutes };

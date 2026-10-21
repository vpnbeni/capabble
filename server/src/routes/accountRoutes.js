const express = require('express');
const { protect } = require('../middleware/auth');
const ctrl = require('../controllers/accountClosureController');
const { requestClosureSchema } = require('../validations/accountClosureValidation');

/** Validates req.body with a Joi schema; answers with the first problem as `message`. */
const validateBody = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
  if (error) {
    const details = error.details.map((detail) => ({
      field: detail.path.join('.'),
      message: detail.message.replace(/"/g, '')
    }));
    return res.status(400).json({ success: false, message: details[0].message, details });
  }
  req.body = value;
  return next();
};

const router = express.Router();
router.use(protect);
// Closing the workspace is for administrators only, even if a custom role holds billing access.
router.use(ctrl.requireAdministrator);

router.get('/closure', ctrl.getClosure);
router.post('/closure', validateBody(requestClosureSchema), ctrl.requestClosure);
router.delete('/closure', ctrl.cancelClosure);

module.exports = router;

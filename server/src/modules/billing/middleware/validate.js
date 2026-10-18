const HttpError = require('../utils/httpError');

// Validate and normalise req[part] with a Joi schema.
module.exports = (schema, part = 'body') => (req, _res, next) => {
  const { value, error } = schema.validate(req[part] || {}, { abortEarly: false, stripUnknown: true, convert: true });
  if (error) {
    return next(new HttpError(400, error.details[0].message.replace(/"/g, ''), error.details.map((d) => ({ path: d.path.join('.'), message: d.message.replace(/"/g, '') }))));
  }
  req[part] = value;
  return next();
};

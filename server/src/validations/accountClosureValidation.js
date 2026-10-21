const Joi = require('joi');

/** POST /account/closure — the administrator types the workspace code to confirm. */
const requestClosureSchema = Joi.object({
  confirmation: Joi.string().trim().lowercase().max(63).required().messages({
    'string.empty': 'Type your workspace code to confirm',
    'any.required': 'Type your workspace code to confirm',
    'string.max': 'That doesn’t match your workspace code'
  })
});

module.exports = { requestClosureSchema };

// Postgres constraint violations become 409s with a readable message instead of 500s.
const PG_CONFLICT = new Set(['23505', '23P01']);
const PG_INVALID = new Set(['23514', '23502', '22P02', '23503']);

module.exports = (err, req, res, _next) => {
  const pg = err.cause && err.cause.code ? err.cause : err;
  let statusCode = err.statusCode || 500;
  let message = err.statusCode ? err.message : 'Internal server error';
  if (!err.statusCode && PG_CONFLICT.has(pg.code)) {
    statusCode = 409;
    message = 'That conflicts with an existing record';
  } else if (!err.statusCode && PG_INVALID.has(pg.code)) {
    statusCode = 400;
    message = 'That value is not allowed';
  }

  if (statusCode >= 500) {
    console.error('[billing] unhandled_error', {
      message: err.message,
      cause: pg.message,
      code: pg.code,
      path: req.originalUrl,
      method: req.method
    });
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(err.details ? { details: err.details } : {}),
    ...(pg.constraint ? { constraint: pg.constraint } : {})
  });
};

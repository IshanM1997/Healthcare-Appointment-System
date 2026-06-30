// src/middleware/errorHandler.js
const { ApiError } = require('../utils/apiError');

function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`No route for ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: err.message,
      details: err.details,
    });
  }

  // Unexpected error: log full detail server-side, but never leak
  // internals (stack traces, SQL, etc) to the client.
  console.error('[unhandled error]', err);
  return res.status(500).json({ error: 'Internal server error' });
}

module.exports = { notFoundHandler, errorHandler };

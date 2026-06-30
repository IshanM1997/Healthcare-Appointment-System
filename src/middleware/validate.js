// src/middleware/validate.js
// Tiny dependency-free request validator. Each route declares a list of
// required body fields (and optional type checks); this middleware
// rejects the request early with a 400 if anything is missing, instead
// of letting a malformed request fail deep inside a model/service.

const { ApiError } = require('../utils/apiError');

/**
 * @param {string[]} requiredFields - dot-free top-level field names required in req.body
 */
function requireFields(requiredFields) {
  return (req, res, next) => {
    const missing = requiredFields.filter((field) => {
      const value = req.body ? req.body[field] : undefined;
      return value === undefined || value === null || value === '';
    });

    if (missing.length > 0) {
      return next(ApiError.badRequest('Missing required fields', { missing }));
    }
    return next();
  };
}

module.exports = { requireFields };

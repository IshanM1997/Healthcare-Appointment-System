// src/middleware/auth.js
// Verifies the JWT on incoming requests and attaches the decoded user
// payload to req.user. Does NOT do authorization (role checks) — that's
// the job of accessControl.js. Keeping authentication and authorization
// separate makes both easier to reason about and test.

const { verifyToken } = require('../utils/jwt');
const { ApiError } = require('../utils/apiError');
const User = require('../models/User');

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(ApiError.unauthorized('Missing or malformed Authorization header'));
  }

  try {
    const payload = verifyToken(token);
    const user = User.findById(payload.sub);

    if (!user || !user.is_active) {
      return next(ApiError.unauthorized('Account is inactive or no longer exists'));
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };
    return next();
  } catch (err) {
    return next(ApiError.unauthorized('Invalid or expired token'));
  }
}

module.exports = { authenticate };

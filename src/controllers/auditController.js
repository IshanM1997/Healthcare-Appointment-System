// src/controllers/auditController.js
// Read-only endpoints for reviewing the HIPAA-style audit trail.
// Restricted to admin via the route's requireRole middleware.

const AuditLog = require('../models/AuditLog');
const { asyncHandler } = require('../utils/apiError');

const getAuditLogForPatient = asyncHandler(async (req, res) => {
  const logs = AuditLog.listForPatient(req.params.patientId, { limit: parseInt(req.query.limit, 10) || 100 });
  res.json({ logs });
});

const getDeniedAccessAttempts = asyncHandler(async (req, res) => {
  const logs = AuditLog.listDenied({ limit: parseInt(req.query.limit, 10) || 100 });
  res.json({ logs });
});

module.exports = { getAuditLogForPatient, getDeniedAccessAttempts };

// src/routes/auditRoutes.js
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/accessControl');
const { getAuditLogForPatient, getDeniedAccessAttempts } = require('../controllers/auditController');

const router = express.Router();

router.use(authenticate, requireRole('admin'));

router.get('/patients/:patientId', getAuditLogForPatient);
router.get('/denied', getDeniedAccessAttempts);

module.exports = router;

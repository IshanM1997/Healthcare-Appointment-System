// src/routes/prescriptionRoutes.js
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/accessControl');
const { requireFields } = require('../middleware/validate');
const {
  issuePrescription,
  listMyIssuedPrescriptions,
  cancelPrescription,
} = require('../controllers/prescriptionController');

const router = express.Router();

router.use(authenticate);

router.post(
  '/',
  requireRole('doctor', 'admin'),
  requireFields(['patientId', 'medicationName', 'dosage', 'frequency']),
  issuePrescription
);

router.get('/mine-issued', requireRole('doctor'), listMyIssuedPrescriptions);
router.post('/:prescriptionId/cancel', requireRole('doctor', 'admin'), cancelPrescription);

module.exports = router;

// src/routes/patientRoutes.js
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole, requirePatientAccess } = require('../middleware/accessControl');
const {
  getPatient,
  updatePatient,
  listPatients,
} = require('../controllers/patientController');
const { listAppointmentsForPatient } = require('../controllers/appointmentController');
const { listPrescriptionsForPatient } = require('../controllers/prescriptionController');

const router = express.Router();

router.use(authenticate);

// Administrative listing - front desk / admin only.
router.get('/', requireRole('front_desk', 'admin'), listPatients);

// Record-level access for a single patient - checked via requirePatientAccess,
// which allows: the patient themselves, any doctor with a treatment
// relationship, front_desk (operational), or admin.
router.get(
  '/:patientId',
  requirePatientAccess({ action: 'READ_PATIENT', resourceType: 'patient' }),
  getPatient
);

router.patch(
  '/:patientId',
  requirePatientAccess({ action: 'UPDATE_PATIENT', resourceType: 'patient' }),
  updatePatient
);

router.get(
  '/:patientId/appointments',
  requirePatientAccess({ action: 'READ_PATIENT_APPOINTMENTS', resourceType: 'appointment' }),
  listAppointmentsForPatient
);

router.get(
  '/:patientId/prescriptions',
  requirePatientAccess({ action: 'READ_PATIENT_PRESCRIPTIONS', resourceType: 'prescription' }),
  listPrescriptionsForPatient
);

module.exports = router;

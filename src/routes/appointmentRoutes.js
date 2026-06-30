// src/routes/appointmentRoutes.js
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireFields } = require('../middleware/validate');
const {
  bookAppointment,
  getAppointment,
  listMyAppointments,
  cancelAppointment,
  rescheduleAppointment,
  confirmAppointment,
  completeAppointment,
  markNoShow,
} = require('../controllers/appointmentController');
const { requireRole } = require('../middleware/accessControl');

const router = express.Router();

router.use(authenticate);

router.post(
  '/',
  requireFields(['patientId', 'doctorId', 'date', 'startTime']),
  bookAppointment
);

router.get('/mine', listMyAppointments);
router.get('/:appointmentId', getAppointment);

router.post('/:appointmentId/cancel', cancelAppointment);
router.post(
  '/:appointmentId/reschedule',
  requireFields(['date', 'startTime']),
  rescheduleAppointment
);

// Clinical/operational status transitions - staff only.
router.post('/:appointmentId/confirm', requireRole('front_desk', 'doctor', 'admin'), confirmAppointment);
router.post('/:appointmentId/complete', requireRole('doctor', 'admin'), completeAppointment);
router.post('/:appointmentId/no-show', requireRole('front_desk', 'doctor', 'admin'), markNoShow);

module.exports = router;

// src/routes/doctorRoutes.js
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/accessControl');
const { requireFields } = require('../middleware/validate');
const {
  listDoctors,
  getDoctor,
  addRecurringAvailability,
  listRecurringAvailability,
  removeRecurringAvailability,
  addAvailabilityException,
  getAvailableSlots,
} = require('../controllers/doctorController');

const router = express.Router();

// Public-ish within the app: any authenticated user can browse doctors
// and their open slots (this is scheduling metadata, not PHI).
router.use(authenticate);

router.get('/', listDoctors);
router.get('/:doctorId', getDoctor);
router.get('/:doctorId/availability', listRecurringAvailability);
router.get('/:doctorId/slots', getAvailableSlots);

// Managing a doctor's own schedule: doctor themselves or admin/front_desk
// (e.g. front desk often manages calendars on behalf of doctors).
router.post(
  '/:doctorId/availability',
  requireRole('doctor', 'admin', 'front_desk'),
  requireFields(['dayOfWeek', 'startTime', 'endTime']),
  addRecurringAvailability
);

router.delete(
  '/:doctorId/availability/:availabilityId',
  requireRole('doctor', 'admin', 'front_desk'),
  removeRecurringAvailability
);

router.post(
  '/:doctorId/availability/exceptions',
  requireRole('doctor', 'admin', 'front_desk'),
  requireFields(['date', 'type']),
  addAvailabilityException
);

module.exports = router;

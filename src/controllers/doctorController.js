// src/controllers/doctorController.js
const Doctor = require('../models/Doctor');
const DoctorAvailability = require('../models/DoctorAvailability');
const { asyncHandler, ApiError } = require('../utils/apiError');
const { resolveAvailableSlots } = require('../services/schedulingService');

const listDoctors = asyncHandler(async (req, res) => {
  const doctors = Doctor.list({ specialty: req.query.specialty });
  res.json({ doctors });
});

const getDoctor = asyncHandler(async (req, res) => {
  const doctor = Doctor.findById(req.params.doctorId);
  if (!doctor) throw ApiError.notFound('Doctor not found');
  res.json({ doctor });
});

const addRecurringAvailability = asyncHandler(async (req, res) => {
  const { dayOfWeek, startTime, endTime } = req.body;
  const availability = DoctorAvailability.addRecurring({
    doctorId: req.params.doctorId,
    dayOfWeek,
    startTime,
    endTime,
  });
  res.status(201).json({ availability });
});

const listRecurringAvailability = asyncHandler(async (req, res) => {
  const availability = DoctorAvailability.listRecurringForDoctor(req.params.doctorId);
  res.json({ availability });
});

const removeRecurringAvailability = asyncHandler(async (req, res) => {
  DoctorAvailability.removeRecurring(req.params.availabilityId);
  res.status(204).send();
});

const addAvailabilityException = asyncHandler(async (req, res) => {
  const { date, type, startTime, endTime, reason } = req.body;
  const exception = DoctorAvailability.addException({
    doctorId: req.params.doctorId,
    date,
    type,
    startTime,
    endTime,
    reason,
  });
  res.status(201).json({ exception });
});

const getAvailableSlots = asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) throw ApiError.badRequest('Query parameter "date" (YYYY-MM-DD) is required');

  const slots = resolveAvailableSlots(req.params.doctorId, date);
  res.json({ doctorId: req.params.doctorId, date, slots });
});

module.exports = {
  listDoctors,
  getDoctor,
  addRecurringAvailability,
  listRecurringAvailability,
  removeRecurringAvailability,
  addAvailabilityException,
  getAvailableSlots,
};

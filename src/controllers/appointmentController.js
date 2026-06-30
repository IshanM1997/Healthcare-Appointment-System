// src/controllers/appointmentController.js
const AppointmentService = require('../services/appointmentService');
const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const { asyncHandler, ApiError } = require('../utils/apiError');
const { checkPatientAccess } = require('../middleware/accessControl');

const bookAppointment = asyncHandler(async (req, res) => {
  const { patientId, doctorId, date, startTime, reason } = req.body;

  // A patient may only book for themselves; staff may book on behalf of
  // any patient they have access to.
  if (req.user.role === 'patient') {
    const own = Patient.findByUserId(req.user.id);
    if (!own || own.id !== patientId) {
      throw ApiError.forbidden('Patients can only book appointments for themselves');
    }
  }

  const appointment = AppointmentService.book({
    patientId,
    doctorId,
    date,
    startTime,
    reason,
    createdBy: req.user.id,
  });
  res.status(201).json({ appointment });
});

const getAppointment = asyncHandler(async (req, res) => {
  const appointment = Appointment.findById(req.params.appointmentId);
  if (!appointment) throw ApiError.notFound('Appointment not found');

  const allowed = checkPatientAccess(req, appointment.patient_id, {
    action: 'READ_APPOINTMENT',
    resourceType: 'appointment',
    resourceId: appointment.id,
  });
  if (!allowed) throw ApiError.forbidden('You do not have access to this appointment');

  res.json({ appointment });
});

const listMyAppointments = asyncHandler(async (req, res) => {
  if (req.user.role === 'patient') {
    const patient = Patient.findByUserId(req.user.id);
    if (!patient) throw ApiError.notFound('Patient profile not found');
    const appointments = Appointment.listForPatient(patient.id, { upcomingOnly: req.query.upcoming === 'true' });
    return res.json({ appointments });
  }

  if (req.user.role === 'doctor') {
    const doctor = Doctor.findByUserId(req.user.id);
    if (!doctor) throw ApiError.notFound('Doctor profile not found');
    const appointments = Appointment.listForDoctor(doctor.id, { from: req.query.from, to: req.query.to });
    return res.json({ appointments });
  }

  throw ApiError.badRequest('This endpoint is for patients and doctors. Front desk/admin should use /patients/:patientId/appointments or /doctors/:doctorId/appointments.');
});

const cancelAppointment = asyncHandler(async (req, res) => {
  const appointment = Appointment.findById(req.params.appointmentId);
  if (!appointment) throw ApiError.notFound('Appointment not found');

  const allowed = checkPatientAccess(req, appointment.patient_id, {
    action: 'CANCEL_APPOINTMENT',
    resourceType: 'appointment',
    resourceId: appointment.id,
  });
  if (!allowed) throw ApiError.forbidden('You do not have access to this appointment');

  const updated = AppointmentService.cancel(req.params.appointmentId, {
    cancelReason: req.body.cancelReason,
    actingUserId: req.user.id,
  });
  res.json({ appointment: updated });
});

const rescheduleAppointment = asyncHandler(async (req, res) => {
  const appointment = Appointment.findById(req.params.appointmentId);
  if (!appointment) throw ApiError.notFound('Appointment not found');

  const allowed = checkPatientAccess(req, appointment.patient_id, {
    action: 'RESCHEDULE_APPOINTMENT',
    resourceType: 'appointment',
    resourceId: appointment.id,
  });
  if (!allowed) throw ApiError.forbidden('You do not have access to this appointment');

  const updated = AppointmentService.reschedule(req.params.appointmentId, {
    date: req.body.date,
    startTime: req.body.startTime,
    actingUserId: req.user.id,
  });
  res.json({ appointment: updated });
});

const confirmAppointment = asyncHandler(async (req, res) => {
  const updated = AppointmentService.confirm(req.params.appointmentId);
  res.json({ appointment: updated });
});

const completeAppointment = asyncHandler(async (req, res) => {
  const updated = AppointmentService.complete(req.params.appointmentId);
  res.json({ appointment: updated });
});

const markNoShow = asyncHandler(async (req, res) => {
  const updated = AppointmentService.markNoShow(req.params.appointmentId);
  res.json({ appointment: updated });
});

const listAppointmentsForPatient = asyncHandler(async (req, res) => {
  const appointments = Appointment.listForPatient(req.resolvedPatientId);
  res.json({ appointments });
});

module.exports = {
  bookAppointment,
  getAppointment,
  listMyAppointments,
  cancelAppointment,
  rescheduleAppointment,
  confirmAppointment,
  completeAppointment,
  markNoShow,
  listAppointmentsForPatient,
};

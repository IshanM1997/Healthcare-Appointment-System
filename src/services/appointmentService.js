// src/services/appointmentService.js
const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const { ApiError } = require('../utils/apiError');
const { assertSlotIsBookable, combineDateAndTime } = require('./schedulingService');
const { scheduleReminderForAppointment, cancelRemindersForAppointment } = require('./smsService');

const AppointmentService = {
  /**
   * Books an appointment for a given date + start time, computing the
   * end time from the doctor's configured appointment duration. This is
   * the single write-path for creating appointments, so the conflict
   * check in schedulingService is always enforced — there's no way to
   * insert an Appointment row that bypasses it.
   */
  book({ patientId, doctorId, date, startTime, reason, createdBy }) {
    const doctor = Doctor.findById(doctorId);
    if (!doctor) throw ApiError.notFound('Doctor not found');

    const patient = Patient.findById(patientId);
    if (!patient) throw ApiError.notFound('Patient not found');

    const startAt = combineDateAndTime(date, startTime);
    const endMinutes = addMinutesToTime(startTime, doctor.appointment_duration_minutes);
    const endAt = combineDateAndTime(date, endMinutes);

    // Throws ApiError.conflict() if the slot isn't actually free.
    assertSlotIsBookable(doctorId, startAt, endAt);

    const appointment = Appointment.create({
      patientId,
      doctorId,
      startAt,
      endAt,
      reason,
      createdBy,
    });

    scheduleReminderForAppointment(appointment, patient);

    return appointment;
  },

  cancel(appointmentId, { cancelReason, actingUserId } = {}) {
    const appointment = Appointment.findById(appointmentId);
    if (!appointment) throw ApiError.notFound('Appointment not found');

    if (appointment.status === 'cancelled') {
      throw ApiError.badRequest('Appointment is already cancelled');
    }

    const updated = Appointment.updateStatus(appointmentId, 'cancelled', { cancelReason });
    cancelRemindersForAppointment(appointmentId);
    return updated;
  },

  confirm(appointmentId) {
    const appointment = Appointment.findById(appointmentId);
    if (!appointment) throw ApiError.notFound('Appointment not found');
    return Appointment.updateStatus(appointmentId, 'confirmed');
  },

  complete(appointmentId) {
    const appointment = Appointment.findById(appointmentId);
    if (!appointment) throw ApiError.notFound('Appointment not found');
    return Appointment.updateStatus(appointmentId, 'completed');
  },

  markNoShow(appointmentId) {
    const appointment = Appointment.findById(appointmentId);
    if (!appointment) throw ApiError.notFound('Appointment not found');
    return Appointment.updateStatus(appointmentId, 'no_show');
  },

  /**
   * Reschedule = cancel the old slot's hold + book a new one, expressed
   * as a single operation so callers don't have to orchestrate it
   * themselves (and so a failed re-book doesn't silently strand a
   * cancelled appointment with no replacement).
   */
  reschedule(appointmentId, { date, startTime, actingUserId }) {
    const existing = Appointment.findById(appointmentId);
    if (!existing) throw ApiError.notFound('Appointment not found');

    const newStartAt = combineDateAndTime(date, startTime);
    const doctor = Doctor.findById(existing.doctor_id);
    const newEndTime = addMinutesToTime(startTime, doctor.appointment_duration_minutes);
    const newEndAt = combineDateAndTime(date, newEndTime);

    assertSlotIsBookable(doctor.id, newStartAt, newEndAt);

    Appointment.updateStatus(appointmentId, 'cancelled', { cancelReason: 'Rescheduled to a new time' });
    cancelRemindersForAppointment(appointmentId);

    const patient = Patient.findById(existing.patient_id);
    const rebooked = Appointment.create({
      patientId: existing.patient_id,
      doctorId: existing.doctor_id,
      startAt: newStartAt,
      endAt: newEndAt,
      reason: existing.reason,
      createdBy: actingUserId,
    });
    scheduleReminderForAppointment(rebooked, patient);

    return rebooked;
  },
};

function addMinutesToTime(hhmm, minutesToAdd) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + minutesToAdd;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

module.exports = AppointmentService;

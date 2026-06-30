// src/models/Appointment.js
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');

const Appointment = {
  create({ patientId, doctorId, startAt, endAt, reason, createdBy }) {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO appointments (id, patient_id, doctor_id, start_at, end_at, reason, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, patientId, doctorId, startAt, endAt, reason || null, createdBy);
    return Appointment.findById(id);
  },

  findById(id) {
    return db.prepare(`SELECT * FROM appointments WHERE id = ?`).get(id);
  },

  /**
   * Returns all non-cancelled appointments for a doctor that fall on the
   * given UTC calendar date (YYYY-MM-DD), used for conflict checking and
   * for rendering the doctor's day view.
   */
  listForDoctorOnDate(doctorId, dateStr) {
    return db
      .prepare(
        `SELECT * FROM appointments
         WHERE doctor_id = ?
           AND status != 'cancelled'
           AND substr(start_at, 1, 10) = ?
         ORDER BY start_at`
      )
      .all(doctorId, dateStr);
  },

  /**
   * Returns all non-cancelled appointments for a doctor that could
   * possibly overlap a given range — used by the conflict checker before
   * doing precise overlap math in JS.
   */
  listActiveForDoctorInRange(doctorId, startAt, endAt) {
    return db
      .prepare(
        `SELECT * FROM appointments
         WHERE doctor_id = ?
           AND status != 'cancelled'
           AND start_at < ?
           AND end_at > ?`
      )
      .all(doctorId, endAt, startAt);
  },

  listForPatient(patientId, { upcomingOnly = false } = {}) {
    if (upcomingOnly) {
      return db
        .prepare(
          `SELECT * FROM appointments
           WHERE patient_id = ? AND status != 'cancelled'
             AND start_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now')
           ORDER BY start_at`
        )
        .all(patientId);
    }
    return db.prepare(`SELECT * FROM appointments WHERE patient_id = ? ORDER BY start_at DESC`).all(patientId);
  },

  listForDoctor(doctorId, { from, to } = {}) {
    if (from && to) {
      return db
        .prepare(
          `SELECT * FROM appointments
           WHERE doctor_id = ? AND status != 'cancelled' AND start_at >= ? AND start_at < ?
           ORDER BY start_at`
        )
        .all(doctorId, from, to);
    }
    return db.prepare(`SELECT * FROM appointments WHERE doctor_id = ? ORDER BY start_at DESC`).all(doctorId);
  },

  updateStatus(id, status, extra = {}) {
    const fields = ['status = ?'];
    const values = [status];
    if (extra.cancelReason !== undefined) {
      fields.push('cancel_reason = ?');
      values.push(extra.cancelReason);
    }
    db.prepare(
      `UPDATE appointments SET ${fields.join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
    ).run(...values, id);
    return Appointment.findById(id);
  },

  /**
   * Finds reminders that should fire soon: appointments in 'scheduled' or
   * 'confirmed' status whose start_at minus lead_minutes has passed, and
   * which don't already have a reminder sent. Used by the reminder job.
   */
  listUpcomingNeedingReminder(leadMinutes) {
    return db
      .prepare(
        `SELECT a.* FROM appointments a
         WHERE a.status IN ('scheduled', 'confirmed')
           AND a.start_at <= datetime(strftime('%Y-%m-%dT%H:%M:%fZ','now'), '+' || ? || ' minutes')
           AND a.start_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
           AND NOT EXISTS (
             SELECT 1 FROM sms_reminders r
             WHERE r.appointment_id = a.id AND r.status IN ('sent', 'dry_run')
           )`
      )
      .all(leadMinutes);
  },
};

module.exports = Appointment;

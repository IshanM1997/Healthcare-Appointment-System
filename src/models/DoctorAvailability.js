// src/models/DoctorAvailability.js
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');

const DoctorAvailability = {
  // --- Recurring weekly templates -----------------------------------
  addRecurring({ doctorId, dayOfWeek, startTime, endTime }) {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO doctor_availability (id, doctor_id, day_of_week, start_time, end_time)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, doctorId, dayOfWeek, startTime, endTime);
    return db.prepare(`SELECT * FROM doctor_availability WHERE id = ?`).get(id);
  },

  listRecurringForDoctor(doctorId) {
    return db
      .prepare(`SELECT * FROM doctor_availability WHERE doctor_id = ? ORDER BY day_of_week, start_time`)
      .all(doctorId);
  },

  listRecurringForDoctorOnDay(doctorId, dayOfWeek) {
    return db
      .prepare(`SELECT * FROM doctor_availability WHERE doctor_id = ? AND day_of_week = ? ORDER BY start_time`)
      .all(doctorId, dayOfWeek);
  },

  removeRecurring(id) {
    db.prepare(`DELETE FROM doctor_availability WHERE id = ?`).run(id);
  },

  // --- One-off exceptions (blocked time off, extra hours) -----------
  addException({ doctorId, date, type, startTime = null, endTime = null, reason = null }) {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO availability_exceptions (id, doctor_id, date, type, start_time, end_time, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, doctorId, date, type, startTime, endTime, reason);
    return db.prepare(`SELECT * FROM availability_exceptions WHERE id = ?`).get(id);
  },

  listExceptionsForDoctorOnDate(doctorId, date) {
    return db
      .prepare(`SELECT * FROM availability_exceptions WHERE doctor_id = ? AND date = ?`)
      .all(doctorId, date);
  },

  removeException(id) {
    db.prepare(`DELETE FROM availability_exceptions WHERE id = ?`).run(id);
  },
};

module.exports = DoctorAvailability;

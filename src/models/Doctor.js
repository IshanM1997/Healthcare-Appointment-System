// src/models/Doctor.js
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');

const Doctor = {
  create({ userId, firstName, lastName, specialty, licenseNumber, phone, bio, appointmentDurationMinutes = 30 }) {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO doctors (
        id, user_id, first_name, last_name, specialty, license_number, phone, bio, appointment_duration_minutes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, userId, firstName, lastName, specialty, licenseNumber, phone || null, bio || null, appointmentDurationMinutes);
    return Doctor.findById(id);
  },

  findById(id) {
    return db.prepare(`SELECT * FROM doctors WHERE id = ?`).get(id);
  },

  findByUserId(userId) {
    return db.prepare(`SELECT * FROM doctors WHERE user_id = ?`).get(userId);
  },

  list({ specialty } = {}) {
    if (specialty) {
      return db.prepare(`SELECT * FROM doctors WHERE specialty = ? ORDER BY last_name`).all(specialty);
    }
    return db.prepare(`SELECT * FROM doctors ORDER BY last_name`).all();
  },
};

module.exports = Doctor;

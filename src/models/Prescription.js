// src/models/Prescription.js
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');

const Prescription = {
  create({ appointmentId, patientId, doctorId, medicationName, dosage, frequency, durationDays, instructions }) {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO prescriptions (
        id, appointment_id, patient_id, doctor_id, medication_name, dosage, frequency, duration_days, instructions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, appointmentId || null, patientId, doctorId, medicationName, dosage, frequency,
      durationDays || null, instructions || null
    );
    return Prescription.findById(id);
  },

  findById(id) {
    return db.prepare(`SELECT * FROM prescriptions WHERE id = ?`).get(id);
  },

  listForPatient(patientId) {
    return db.prepare(`SELECT * FROM prescriptions WHERE patient_id = ? ORDER BY issued_at DESC`).all(patientId);
  },

  listForDoctor(doctorId) {
    return db.prepare(`SELECT * FROM prescriptions WHERE doctor_id = ? ORDER BY issued_at DESC`).all(doctorId);
  },

  updateStatus(id, status) {
    db.prepare(`UPDATE prescriptions SET status = ? WHERE id = ?`).run(status, id);
    return Prescription.findById(id);
  },
};

module.exports = Prescription;

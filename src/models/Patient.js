// src/models/Patient.js
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');

const Patient = {
  create({
    userId,
    firstName,
    lastName,
    dateOfBirth,
    phone,
    address,
    emergencyContactName,
    emergencyContactPhone,
    insuranceProvider,
    insurancePolicyNumber,
  }) {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO patients (
        id, user_id, first_name, last_name, date_of_birth, phone, address,
        emergency_contact_name, emergency_contact_phone,
        insurance_provider, insurance_policy_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, userId, firstName, lastName, dateOfBirth, phone, address || null,
      emergencyContactName || null, emergencyContactPhone || null,
      insuranceProvider || null, insurancePolicyNumber || null
    );
    return Patient.findById(id);
  },

  findById(id) {
    return db.prepare(`SELECT * FROM patients WHERE id = ?`).get(id);
  },

  findByUserId(userId) {
    return db.prepare(`SELECT * FROM patients WHERE user_id = ?`).get(userId);
  },

  list({ limit = 50, offset = 0 } = {}) {
    return db
      .prepare(`SELECT * FROM patients ORDER BY last_name, first_name LIMIT ? OFFSET ?`)
      .all(limit, offset);
  },

  update(id, fields) {
    const allowed = [
      'first_name', 'last_name', 'date_of_birth', 'phone', 'address',
      'emergency_contact_name', 'emergency_contact_phone',
      'insurance_provider', 'insurance_policy_number', 'medical_notes',
    ];
    const updates = Object.entries(fields).filter(([k]) => allowed.includes(k));
    if (updates.length === 0) return Patient.findById(id);

    const setClause = updates.map(([k]) => `${k} = ?`).join(', ');
    const values = updates.map(([, v]) => v);
    db.prepare(
      `UPDATE patients SET ${setClause}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
    ).run(...values, id);
    return Patient.findById(id);
  },
};

module.exports = Patient;

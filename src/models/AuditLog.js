// src/models/AuditLog.js
// Append-only log of every access to PHI (Protected Health Information).
// This is the backbone of the HIPAA-style access control story: even
// when access is "allowed", we still write a row, because real audits
// need to answer "who looked at this patient's data, and when" — not
// just "who was denied".

const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');

const AuditLog = {
  record({ actorUserId, actorRole, action, resourceType, resourceId, patientId, outcome, ipAddress, metadata }) {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO audit_logs (
        id, actor_user_id, actor_role, action, resource_type, resource_id,
        patient_id, outcome, ip_address, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, actorUserId || null, actorRole, action, resourceType, resourceId || null,
      patientId || null, outcome, ipAddress || null, metadata ? JSON.stringify(metadata) : null
    );
    return id;
  },

  listForPatient(patientId, { limit = 100 } = {}) {
    return db
      .prepare(`SELECT * FROM audit_logs WHERE patient_id = ? ORDER BY created_at DESC LIMIT ?`)
      .all(patientId, limit);
  },

  listForActor(actorUserId, { limit = 100 } = {}) {
    return db
      .prepare(`SELECT * FROM audit_logs WHERE actor_user_id = ? ORDER BY created_at DESC LIMIT ?`)
      .all(actorUserId, limit);
  },

  listDenied({ limit = 100 } = {}) {
    return db
      .prepare(`SELECT * FROM audit_logs WHERE outcome = 'denied' ORDER BY created_at DESC LIMIT ?`)
      .all(limit);
  },
};

module.exports = AuditLog;

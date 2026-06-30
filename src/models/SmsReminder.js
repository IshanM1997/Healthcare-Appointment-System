// src/models/SmsReminder.js
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');

const SmsReminder = {
  create({ appointmentId, toPhone, messageBody, scheduledFor }) {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO sms_reminders (id, appointment_id, to_phone, message_body, status, scheduled_for)
       VALUES (?, ?, ?, ?, 'queued', ?)`
    ).run(id, appointmentId, toPhone, messageBody, scheduledFor);
    return SmsReminder.findById(id);
  },

  findById(id) {
    return db.prepare(`SELECT * FROM sms_reminders WHERE id = ?`).get(id);
  },

  markSent(id, { providerSid, dryRun = false }) {
    db.prepare(
      `UPDATE sms_reminders
       SET status = ?, provider_sid = ?, sent_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?`
    ).run(dryRun ? 'dry_run' : 'sent', providerSid || null, id);
    return SmsReminder.findById(id);
  },

  markFailed(id, errorMessage) {
    db.prepare(`UPDATE sms_reminders SET status = 'failed', error_message = ? WHERE id = ?`).run(errorMessage, id);
    return SmsReminder.findById(id);
  },

  listForAppointment(appointmentId) {
    return db.prepare(`SELECT * FROM sms_reminders WHERE appointment_id = ? ORDER BY created_at DESC`).all(appointmentId);
  },
};

module.exports = SmsReminder;

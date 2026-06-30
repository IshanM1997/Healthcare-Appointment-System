// src/services/reminderJob.js
//
// A minimal in-process scheduler that periodically checks for SMS
// reminders that are due and sends them. In production this would more
// likely be a separate worker process or a cron-triggered serverless
// function reading from the same `sms_reminders` table, but the table
// design and sendReminder() logic are identical either way.

const db = require('../db/connection');
const { sendReminder } = require('./smsService');

/**
 * Finds all reminders whose scheduled_for time has passed and which are
 * still 'queued', then attempts to send each one.
 */
async function processDueReminders() {
  const due = db
    .prepare(
      `SELECT * FROM sms_reminders
       WHERE status = 'queued' AND scheduled_for <= strftime('%Y-%m-%dT%H:%M:%fZ','now')`
    )
    .all();

  const results = [];
  for (const reminder of due) {
    results.push(await sendReminder(reminder));
  }
  return results;
}

/**
 * Starts a setInterval loop calling processDueReminders(). Returns the
 * interval handle so callers (e.g. tests, or a graceful shutdown hook)
 * can clearInterval() it.
 */
function startReminderLoop(intervalMs = 60_000) {
  const handle = setInterval(() => {
    processDueReminders().catch((err) => console.error('[reminderJob] error:', err));
  }, intervalMs);
  return handle;
}

module.exports = { processDueReminders, startReminderLoop };

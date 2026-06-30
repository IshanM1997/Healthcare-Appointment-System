// src/services/smsService.js
//
// Wraps Twilio for appointment reminder SMS. Supports a "dry run" mode
// (SMS_DRY_RUN=true, the default) that logs what WOULD be sent instead
// of calling the real Twilio API — this means the project runs fully
// offline/out-of-the-box without real Twilio credentials, while keeping
// the exact same code path a production deployment would use.

const config = require('../config');
const SmsReminder = require('../models/SmsReminder');
const db = require('../db/connection');

let twilioClient = null;
function getTwilioClient() {
  if (config.twilio.dryRun) return null;
  if (!twilioClient) {
    const twilio = require('twilio');
    twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
  }
  return twilioClient;
}

function buildReminderMessage(appointment, patient) {
  const dateStr = appointment.start_at.slice(0, 10);
  const timeStr = appointment.start_at.slice(11, 16);
  return (
    `Hi ${patient.first_name}, this is a reminder of your appointment on ` +
    `${dateStr} at ${timeStr}. Reply CANCEL to cancel, or call the clinic ` +
    `if you need to reschedule.`
  );
}

/**
 * Queues a reminder row for an appointment, scheduled to fire
 * REMINDER_LEAD_MINUTES before the appointment start time. Actual
 * sending happens later via processDueReminders() (see reminderJob.js),
 * not synchronously here — mirroring how a real system would decouple
 * "decide a reminder is needed" from "deliver it at the right time".
 */
function scheduleReminderForAppointment(appointment, patient) {
  const scheduledFor = new Date(
    new Date(appointment.start_at).getTime() - config.scheduling.reminderLeadMinutes * 60 * 1000
  ).toISOString();

  return SmsReminder.create({
    appointmentId: appointment.id,
    toPhone: patient.phone,
    messageBody: buildReminderMessage(appointment, patient),
    scheduledFor,
  });
}

function cancelRemindersForAppointment(appointmentId) {
  // Reminders that haven't fired yet are simply left as 'queued' but will
  // never be picked up again once the appointment is cancelled, since
  // processDueReminders re-checks appointment status before sending.
  // Nothing to do here beyond documenting that invariant, but exposing
  // this function keeps the call sites in appointmentService explicit
  // about intent.
  return appointmentId;
}

/**
 * Actually delivers (or dry-run logs) a single due reminder. Re-checks
 * that the appointment is still active immediately before sending, so a
 * last-second cancellation doesn't result in a stray SMS.
 */
async function sendReminder(reminder) {
  const appointment = db.prepare(`SELECT * FROM appointments WHERE id = ?`).get(reminder.appointment_id);

  if (!appointment || !['scheduled', 'confirmed'].includes(appointment.status)) {
    SmsReminder.markFailed(reminder.id, 'Appointment no longer active at send time');
    return { id: reminder.id, status: 'failed' };
  }

  if (config.twilio.dryRun) {
    console.log(`[sms:dry-run] To ${reminder.to_phone}: ${reminder.message_body}`);
    return SmsReminder.markSent(reminder.id, { dryRun: true });
  }

  try {
    const client = getTwilioClient();
    const message = await client.messages.create({
      body: reminder.message_body,
      from: config.twilio.fromNumber,
      to: reminder.to_phone,
    });
    return SmsReminder.markSent(reminder.id, { providerSid: message.sid });
  } catch (err) {
    SmsReminder.markFailed(reminder.id, err.message);
    return { id: reminder.id, status: 'failed', error: err.message };
  }
}

module.exports = {
  buildReminderMessage,
  scheduleReminderForAppointment,
  cancelRemindersForAppointment,
  sendReminder,
};

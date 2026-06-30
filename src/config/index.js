// src/config/index.js
// Centralized configuration loaded from environment variables.
// Keeping all env reads in one place makes it obvious what the system
// depends on, and avoids scattering process.env.* across the codebase.

require('dotenv').config();

const required = (name, fallback) => {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value;
};

const config = {
  env: required('NODE_ENV', 'development'),
  port: parseInt(required('PORT', '3000'), 10),

  jwt: {
    secret: required('JWT_SECRET', 'dev-only-insecure-secret-change-me'),
    expiresIn: required('JWT_EXPIRES_IN', '8h'),
  },

  db: {
    path: required('DB_PATH', './data/healthcare.db'),
  },

  twilio: {
    accountSid: required('TWILIO_ACCOUNT_SID', ''),
    authToken: required('TWILIO_AUTH_TOKEN', ''),
    fromNumber: required('TWILIO_FROM_NUMBER', ''),
    dryRun: required('SMS_DRY_RUN', 'true') === 'true',
  },

  scheduling: {
    reminderLeadMinutes: parseInt(required('REMINDER_LEAD_MINUTES', '60'), 10),
    // Minimum granularity for appointment slots, in minutes.
    slotGranularityMinutes: 15,
  },

  audit: {
    retentionDays: parseInt(required('AUDIT_LOG_RETENTION_DAYS', '2190'), 10),
  },
};

module.exports = config;

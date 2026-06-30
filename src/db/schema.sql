-- src/db/schema.sql
-- Healthcare Appointment System schema.
--
-- Design notes:
-- * "users" holds authentication + role only. Role-specific PHI
--   (Protected Health Information) lives in "patients" and "doctors" so
--   that access control can be applied at the table/query level: most
--   roles never need to touch the patients table directly.
-- * Timestamps are stored as ISO-8601 strings (UTC) for portability and
--   human readability when inspecting the DB directly.
-- * Soft deletes (is_active / status columns) are used instead of hard
--   deletes for clinical records, since real healthcare systems are
--   legally required to retain historical records.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- USERS & AUTH
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,           -- uuid
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('patient', 'doctor', 'front_desk', 'admin')),
  is_active     INTEGER NOT NULL DEFAULT 1, -- 1 = active, 0 = deactivated
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------------------------------
-- PATIENTS (PHI - access-controlled)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patients (
  id              TEXT PRIMARY KEY,         -- uuid, separate from user_id on purpose
  user_id         TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  date_of_birth   TEXT NOT NULL,             -- YYYY-MM-DD
  phone           TEXT NOT NULL,
  address         TEXT,
  emergency_contact_name  TEXT,
  emergency_contact_phone TEXT,
  insurance_provider      TEXT,
  insurance_policy_number TEXT,
  medical_notes   TEXT,                      -- free-text clinical notes (sensitive)
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------------------------------
-- DOCTORS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS doctors (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  specialty       TEXT NOT NULL,
  license_number  TEXT NOT NULL UNIQUE,
  phone           TEXT,
  bio             TEXT,
  appointment_duration_minutes INTEGER NOT NULL DEFAULT 30,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------------------------------
-- DOCTOR AVAILABILITY (recurring weekly template)
-- e.g. "Dr. Lee is available Mondays 09:00-17:00"
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS doctor_availability (
  id          TEXT PRIMARY KEY,
  doctor_id   TEXT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday
  start_time  TEXT NOT NULL,   -- HH:MM (24h, local clinic time)
  end_time    TEXT NOT NULL,   -- HH:MM
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (start_time < end_time)
);

-- ---------------------------------------------------------------------
-- AVAILABILITY EXCEPTIONS (one-off overrides: time off, extra hours)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS availability_exceptions (
  id          TEXT PRIMARY KEY,
  doctor_id   TEXT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,              -- YYYY-MM-DD
  type        TEXT NOT NULL CHECK (type IN ('blocked', 'extra')),
  start_time  TEXT,                       -- required when type='extra'
  end_time    TEXT,                       -- required when type='extra'
  reason      TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------------------------------
-- APPOINTMENTS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
  id            TEXT PRIMARY KEY,
  patient_id    TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id     TEXT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  start_at      TEXT NOT NULL,   -- ISO-8601 UTC
  end_at        TEXT NOT NULL,   -- ISO-8601 UTC
  status        TEXT NOT NULL DEFAULT 'scheduled'
                CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  reason        TEXT,            -- patient-provided reason for visit
  cancel_reason TEXT,
  created_by    TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (start_at < end_at)
);

CREATE INDEX IF NOT EXISTS idx_appointments_doctor_time
  ON appointments(doctor_id, start_at, end_at);

CREATE INDEX IF NOT EXISTS idx_appointments_patient
  ON appointments(patient_id);

-- ---------------------------------------------------------------------
-- PRESCRIPTIONS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prescriptions (
  id              TEXT PRIMARY KEY,
  appointment_id  TEXT REFERENCES appointments(id) ON DELETE SET NULL,
  patient_id      TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id       TEXT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  medication_name TEXT NOT NULL,
  dosage          TEXT NOT NULL,
  frequency       TEXT NOT NULL,         -- e.g. "twice daily"
  duration_days   INTEGER,
  instructions    TEXT,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'completed', 'cancelled')),
  issued_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_patient
  ON prescriptions(patient_id);

-- ---------------------------------------------------------------------
-- SMS REMINDERS (Twilio send log)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sms_reminders (
  id              TEXT PRIMARY KEY,
  appointment_id  TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  to_phone        TEXT NOT NULL,
  message_body    TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'failed', 'dry_run')),
  provider_sid    TEXT,             -- Twilio message SID, if actually sent
  error_message   TEXT,
  scheduled_for   TEXT NOT NULL,    -- ISO-8601 UTC: when it should fire
  sent_at         TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_sms_reminders_scheduled
  ON sms_reminders(scheduled_for, status);

-- ---------------------------------------------------------------------
-- AUDIT LOGS (HIPAA-style access trail)
-- Every read or write touching PHI (patients, prescriptions, appointments)
-- should be recorded here: who, what, when, and on whose record.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id            TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_role    TEXT NOT NULL,
  action        TEXT NOT NULL,        -- e.g. 'READ_PATIENT', 'CREATE_APPOINTMENT'
  resource_type TEXT NOT NULL,        -- e.g. 'patient', 'prescription'
  resource_id   TEXT,
  patient_id    TEXT,                 -- whose PHI was touched, if applicable
  outcome       TEXT NOT NULL CHECK (outcome IN ('allowed', 'denied')),
  ip_address    TEXT,
  metadata      TEXT,                 -- JSON-encoded extra context
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_patient
  ON audit_logs(patient_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
  ON audit_logs(actor_user_id);

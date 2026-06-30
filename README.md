# Healthcare Appointment System

A backend learning project that models a small clinic: patients register, doctors publish their availability, patients (or staff) book conflict-free appointments, doctors issue prescriptions, and the system sends SMS reminders via Twilio ahead of each visit.

The project exists to teach two things in depth:

1. **Complex scheduling logic** — turning a doctor's recurring weekly hours, one-off exceptions (time off, extra hours), and already-booked appointments into a reliable, race-safe "what's actually open right now" answer.
2. **HIPAA-style data access control** — making sure that *who is asking* and *what relationship they have to the patient* determines what they can see or change, and that every access to sensitive health data leaves an audit trail.

It is a teaching artifact, not a certified HIPAA-compliant system — see [Security & Compliance Notes](#security--compliance-notes) for the gap between "HIPAA-style" patterns and real regulatory compliance.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Folder Structure](#folder-structure)
- [Architecture Overview](#architecture-overview)
- [Data Model](#data-model)
- [The Scheduling Engine](#the-scheduling-engine)
- [Access Control Model](#access-control-model)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Running Tests](#running-tests)
- [Security & Compliance Notes](#security--compliance-notes)
- [Possible Extensions](#possible-extensions)

---

## Features

- **Patient registration & profiles** — self-service signup, contact info, emergency contacts, insurance details, and clinician-only medical notes.
- **Doctor availability calendars** — recurring weekly hours (e.g. "Mondays 9–5") plus one-off exceptions for blocked time (vacation, conferences) or extra hours.
- **Conflict-free appointment booking** — the system computes real open slots from availability minus existing bookings, and re-validates at booking time so two people can never double-book the same slot.
- **Rescheduling & cancellation** — implemented as safe, atomic operations rather than ad-hoc field edits.
- **Prescriptions** — doctors issue prescriptions tied to a patient (and optionally a specific appointment); status lifecycle (active / completed / cancelled).
- **SMS reminders via Twilio** — a queued reminder is scheduled at booking time and delivered by a background job shortly before the appointment; supports a dry-run mode so the whole project runs without real Twilio credentials.
- **HIPAA-style access control** — role-based permissions (patient / doctor / front_desk / admin) layered with relationship-based checks (a doctor can only see patients they actually treat), plus field-level redaction for non-clinical roles.
- **Audit logging** — every read or write that touches a patient's protected health information (PHI) is recorded: who, what, when, and whether it was allowed or denied.

## Tech Stack

| Layer            | Choice                                   |
|-------------------|-------------------------------------------|
| Runtime           | Node.js (>=18) |
| Web framework     | Express |
| Database          | SQLite via `better-sqlite3` (single file, zero setup) |
| Auth              | JSON Web Tokens (`jsonwebtoken`) + `bcryptjs` for password hashing |
| SMS               | Twilio SDK (with a dry-run mode for offline development) |
| Testing           | Node's built-in test runner (`node --test`) |

SQLite was chosen deliberately for a teaching project: there's no database server to install, the entire database is one file you can delete and recreate, and the schema (`src/db/schema.sql`) is plain readable SQL.

## Folder Structure

```
healthcare-appointment-system/
├── package.json                  # dependencies & npm scripts (start, dev, seed, test)
├── .env.example                  # template for required environment variables
├── .gitignore
│
├── src/
│   ├── server.js                 # entry point: runs migrations, starts Express + reminder loop
│   ├── app.js                    # Express app factory (middleware, routes, error handling)
│   │
│   ├── config/
│   │   └── index.js               # single source of truth for all environment-derived config
│   │
│   ├── db/
│   │   ├── schema.sql             # full table definitions (users, patients, doctors,
│   │   │                           #   availability, appointments, prescriptions, sms,
│   │   │                           #   audit_logs) with constraints and indexes
│   │   ├── connection.js          # shared better-sqlite3 connection (WAL mode, FKs on)
│   │   ├── migrate.js             # idempotently applies schema.sql
│   │   └── seed.js                # demo data: 2 doctors, 2 patients, admin, front desk,
│   │                               #   sample appointment + prescription
│   │
│   ├── models/                    # thin data-access layer — one file per table, no business logic
│   │   ├── User.js
│   │   ├── Patient.js
│   │   ├── Doctor.js
│   │   ├── DoctorAvailability.js  # recurring weekly slots + one-off exceptions
│   │   ├── Appointment.js
│   │   ├── Prescription.js
│   │   ├── SmsReminder.js
│   │   └── AuditLog.js            # append-only HIPAA-style access trail
│   │
│   ├── services/                  # business logic lives here, independent of HTTP
│   │   ├── authService.js         # registration & login
│   │   ├── schedulingService.js   # *** the scheduling engine — see below ***
│   │   ├── appointmentService.js  # book / cancel / reschedule, calls schedulingService
│   │   ├── prescriptionService.js
│   │   ├── smsService.js          # builds reminder text, wraps Twilio (or dry-run logs)
│   │   └── reminderJob.js         # background loop that sends due reminders
│   │
│   ├── controllers/                # translates HTTP req/res into service calls
│   │   ├── authController.js
│   │   ├── patientController.js
│   │   ├── doctorController.js
│   │   ├── appointmentController.js
│   │   ├── prescriptionController.js
│   │   └── auditController.js
│   │
│   ├── routes/                     # Express routers, one per resource, mounted in index.js
│   │   ├── index.js
│   │   ├── authRoutes.js
│   │   ├── patientRoutes.js
│   │   ├── doctorRoutes.js
│   │   ├── appointmentRoutes.js
│   │   ├── prescriptionRoutes.js
│   │   └── auditRoutes.js
│   │
│   ├── middleware/
│   │   ├── auth.js                 # verifies JWT, attaches req.user
│   │   ├── accessControl.js        # *** HIPAA-style role + relationship checks ***
│   │   ├── validate.js             # simple required-field request validation
│   │   └── errorHandler.js         # central error formatting (404s, ApiError, 500s)
│   │
│   └── utils/
│       ├── apiError.js             # typed ApiError class + asyncHandler wrapper
│       ├── datetime.js             # pure date/time math used by the scheduling engine
│       ├── jwt.js                  # sign/verify helpers
│       └── password.js             # bcrypt hash/verify helpers
│
└── tests/
    ├── datetime.test.js            # unit tests for the date/time helpers
    ├── schedulingService.test.js   # integration tests: availability, conflicts, exceptions
    └── accessControl.test.js       # integration tests: role + relationship-based access
```

## Architecture Overview

The codebase follows a conventional layered structure, with the direction of dependency flowing one way:

```
routes  →  controllers  →  services  →  models  →  db/connection.js
                ↑               ↑
           middleware      (business logic;
        (auth, access      no req/res here)
         control, validation)
```

- **Routes** wire URLs + HTTP verbs to controller functions, and declare which middleware (auth, role checks, validation) must run first.
- **Controllers** are thin: they pull values out of `req`, call a service, and shape the JSON response. They contain no SQL and no business rules.
- **Services** hold the actual logic — `schedulingService.js` and `appointmentService.js` are the most important files in the project for understanding how booking really works.
- **Models** are one file per database table, exposing plain functions (`create`, `findById`, `list`, ...) that wrap SQL. They know nothing about HTTP or business rules.
- **Middleware** (`accessControl.js` especially) is where the HIPAA-style permission logic lives, deliberately separated from both routes and controllers so it can be reasoned about and tested on its own.

## Data Model

```
users (auth + role only)
 ├─ patients (1:1)   — PHI: contact info, insurance, medical_notes
 └─ doctors  (1:1)   — specialty, license, appointment duration

doctors
 ├─ doctor_availability        — recurring weekly windows (day_of_week, start_time, end_time)
 └─ availability_exceptions    — one-off 'blocked' or 'extra' windows for a specific date

appointments
 ├─ belongs to one patient and one doctor
 ├─ status: scheduled → confirmed → completed | cancelled | no_show
 └─ has zero or more sms_reminders, zero or more prescriptions

prescriptions    — issued by a doctor, for a patient, optionally tied to an appointment
sms_reminders    — one row per queued/sent/failed/dry-run reminder
audit_logs       — append-only; one row per access attempt to PHI, allowed or denied
```

Notably, `users` stores *only* authentication and role — no name, no phone number, no medical data. All of that lives in `patients` or `doctors`. This split exists specifically to make the access-control story clean: most of the system never needs to query the `patients` table at all, and the places that do are exactly the places `accessControl.js` guards.

## The Scheduling Engine

The hardest problem in this project is: *given a doctor's recurring hours, today's exceptions, and today's existing bookings, what times can a patient actually book — and how do we stop two people from booking the same slot at the same time?*

This lives almost entirely in `src/services/schedulingService.js`, and resolves in this order:

1. Start with the doctor's **recurring weekly windows** for that day of the week (e.g. "Monday 09:00–17:00").
2. **Add** any `extra` exceptions for that exact date (e.g. a Saturday morning the doctor opened up).
3. **Subtract** any `blocked` exceptions for that date (vacation, a conference, a long lunch) — partial overlaps split a window into two smaller ones rather than deleting it outright.
4. **Slice** the remaining open windows into candidate start times, stepped every 15 minutes (configurable), each as long as the doctor's configured appointment duration.
5. **Remove** any candidate that overlaps an already-booked, non-cancelled appointment.

That produces the list returned by `GET /api/doctors/:doctorId/slots?date=YYYY-MM-DD` — a convenience for clients to know what to *offer*.

The part that actually prevents double-booking is separate: `assertSlotIsBookable()` re-runs the open-window check and re-queries existing appointments for the *exact* requested time at the moment of booking, and throws a 409 Conflict if anything has changed since the client last asked for slots. `appointmentService.book()` always calls this before writing a row, so there is no code path that can create an appointment without passing the conflict check — including reschedules, which are implemented as cancel + re-book through the same guarded path.

## Access Control Model

`src/middleware/accessControl.js` implements two layers, mirroring how real healthcare systems reason about access:

1. **Role-based** (`requireRole(...)`) — is this *kind* of user even allowed to attempt this action? For example, only `doctor` or `admin` may issue a prescription.
2. **Relationship-based** (`requirePatientAccess(...)` / `checkPatientAccess(...)`) — even if your role permits the action in general, do you have a legitimate relationship to *this specific patient*?

| Role | Can access a patient's record when... |
|---|---|
| `patient` | it is their own record |
| `doctor` | they have at least one appointment (any status) with that patient |
| `front_desk` | always (operational/scheduling need) — but sensitive fields like `medical_notes` are redacted from the response |
| `admin` | always (oversight role) |

Every single access check — **allowed or denied** — writes a row to `audit_logs` via `AuditLog.record()`. This matters: a real compliance audit isn't just "show me who was denied," it's "show me everyone who looked at this patient's chart in the last year," which requires logging the *allowed* accesses too. The `/api/audit/patients/:patientId` and `/api/audit/denied` endpoints (admin-only) expose this trail.

Field-level redaction is handled separately by `redactPatientForRole()`, since "do you have access to this record" and "which fields of it can you see" are different questions — front desk staff have an operational reason to look up a patient (to schedule them) without needing to see clinical notes.

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env if you have real Twilio credentials; otherwise leave SMS_DRY_RUN=true

# 3. Start the server (this also runs database migrations automatically)
npm start
# or, for auto-restart on file changes:
npm run dev

# 4. In a separate terminal, load demo data (doctors, patients, a sample appointment)
npm run seed
```

The server listens on `http://localhost:3000` by default (`/api/...`), and a SQLite file is created at `./data/healthcare.db`.

Seeded demo accounts (all share the password `Password123!`):

| Email | Role |
|---|---|
| `admin@clinic.test` | admin |
| `frontdesk@clinic.test` | front_desk |
| `dr.lee@clinic.test` | doctor (Family Medicine) |
| `dr.patel@clinic.test` | doctor (Cardiology) |
| `alice@example.test` | patient |
| `bob@example.test` | patient |

Log in via `POST /api/auth/login` with one of these to get a JWT, then send it as `Authorization: Bearer <token>` on subsequent requests.

## Environment Variables

See `.env.example` for the full list with comments. The important ones:

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Signing secret for auth tokens — change this in any real deployment. |
| `DB_PATH` | Path to the SQLite file. |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | Real Twilio credentials, only needed if `SMS_DRY_RUN=false`. |
| `SMS_DRY_RUN` | When `true` (the default), reminders are logged to the console instead of actually sent — lets the whole project run with zero external accounts. |
| `REMINDER_LEAD_MINUTES` | How long before an appointment the SMS reminder should fire. |

## API Reference

All routes are prefixed with `/api`. Endpoints other than `/auth/*` and `/health` require `Authorization: Bearer <token>`.

**Auth**
- `POST /auth/register/patient` — self-service patient signup
- `POST /auth/register/staff` — provision a doctor / front_desk / admin account
- `POST /auth/login` — returns a JWT

**Patients** *(access-controlled per the table above)*
- `GET /patients` — list (front_desk/admin only)
- `GET /patients/:patientId` — view one patient
- `PATCH /patients/:patientId` — update (medical_notes restricted to doctor/admin)
- `GET /patients/:patientId/appointments`
- `GET /patients/:patientId/prescriptions`

**Doctors**
- `GET /doctors` — list, optional `?specialty=`
- `GET /doctors/:doctorId`
- `GET /doctors/:doctorId/availability` — recurring weekly schedule
- `POST /doctors/:doctorId/availability` — add a recurring window (doctor/admin/front_desk)
- `DELETE /doctors/:doctorId/availability/:availabilityId`
- `POST /doctors/:doctorId/availability/exceptions` — add a blocked/extra date override
- `GET /doctors/:doctorId/slots?date=YYYY-MM-DD` — computed open slots for that date

**Appointments**
- `POST /appointments` — book (`patientId`, `doctorId`, `date`, `startTime`, `reason`)
- `GET /appointments/mine` — current user's appointments (patient or doctor)
- `GET /appointments/:appointmentId`
- `POST /appointments/:appointmentId/cancel`
- `POST /appointments/:appointmentId/reschedule`
- `POST /appointments/:appointmentId/confirm` — staff only
- `POST /appointments/:appointmentId/complete` — doctor/admin
- `POST /appointments/:appointmentId/no-show` — staff only

**Prescriptions**
- `POST /prescriptions` — issue (doctor/admin only)
- `GET /prescriptions/mine-issued` — a doctor's own issued prescriptions
- `POST /prescriptions/:prescriptionId/cancel`

**Audit** *(admin only)*
- `GET /audit/patients/:patientId` — full access history for one patient
- `GET /audit/denied` — every denied access attempt system-wide

## Running Tests

```bash
npm test
```

This runs Node's built-in test runner against `tests/*.test.js`, covering:

- pure date/time math (`datetime.test.js`)
- the scheduling engine end-to-end: slot generation, exception handling, and conflict rejection (`schedulingService.test.js`)
- the access-control decision logic for every role/relationship combination, including audit log writes (`accessControl.test.js`)

Tests use a disposable SQLite file under `tests/`, never the real `data/healthcare.db`.

## Security & Compliance Notes

This project demonstrates *patterns* associated with HIPAA-style access control — role checks, relationship checks, field redaction, and audit logging — as a teaching tool. It is **not** a certified HIPAA-compliant system, and several things a real deployment would need are intentionally out of scope here:

- No encryption at rest for the SQLite file.
- No formal Business Associate Agreement story for the SMS provider.
- No automated audit log retention/deletion policy enforcement (the `AUDIT_LOG_RETENTION_DAYS` config value documents an intended policy but nothing currently purges old rows).
- Clinic-local time is treated as UTC for simplicity; a real system would handle clinic time zones explicitly.
- `JWT_SECRET` and other secrets must never be committed; `.env` is git-ignored, but rotate the default in `.env.example` before any real use.

## Possible Extensions

A few natural next steps if you want to keep building on this:

- Multi-clinic / multi-location support (a `locations` table, doctors tied to one or more locations).
- Recurring appointments (e.g. weekly physical therapy).
- A patient-facing waitlist for fully-booked doctors.
- Email reminders alongside SMS, or a notification preference per patient.
- A simple front-end (the API is fully decoupled from any UI).

// tests/schedulingService.test.js
//
// Integration tests exercising the real SQLite-backed models, using a
// throwaway database file so tests never touch real seeded data.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const TEST_DB_PATH = path.join(__dirname, '.tmp-test.db');
process.env.DB_PATH = TEST_DB_PATH;
process.env.SMS_DRY_RUN = 'true';

// Clean up any stale database file from a previous run BEFORE requiring
// any module that opens a connection to it (the db connection is opened
// eagerly at module-require time), so we never delete a file out from
// under an already-open handle.
for (const ext of ['', '-wal', '-shm']) {
  const p = TEST_DB_PATH + ext;
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// Modules are required AFTER setting env vars above, since config.js
// reads process.env at module-load time.
const migrate = require('../src/db/migrate');
const Doctor = require('../src/models/Doctor');
const User = require('../src/models/User');
const Patient = require('../src/models/Patient');
const DoctorAvailability = require('../src/models/DoctorAvailability');
const { resolveAvailableSlots, assertSlotIsBookable } = require('../src/services/schedulingService');
const AppointmentService = require('../src/services/appointmentService');
const { ApiError } = require('../src/utils/apiError');

let doctor;
let patient;

before(() => {
  migrate();

  const doctorUser = User.create({ email: 'sched-doc@test.local', passwordHash: 'x', role: 'doctor' });
  doctor = Doctor.create({
    userId: doctorUser.id,
    firstName: 'Test',
    lastName: 'Doctor',
    specialty: 'General',
    licenseNumber: 'TEST-001',
    appointmentDurationMinutes: 30,
  });

  const patientUser = User.create({ email: 'sched-patient@test.local', passwordHash: 'x', role: 'patient' });
  patient = Patient.create({
    userId: patientUser.id,
    firstName: 'Test',
    lastName: 'Patient',
    dateOfBirth: '2000-01-01',
    phone: '+15555550000',
  });

  // Monday 09:00-12:00 availability.
  DoctorAvailability.addRecurring({ doctorId: doctor.id, dayOfWeek: 1, startTime: '09:00', endTime: '12:00' });
});

after(() => {
  for (const ext of ['', '-wal', '-shm']) {
    const p = TEST_DB_PATH + ext;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});

// 2026-06-29 is a Monday in this test suite's frame of reference.
const MONDAY = '2026-06-29';

test('resolveAvailableSlots returns slots covering the full recurring window', () => {
  const slots = resolveAvailableSlots(doctor.id, MONDAY);
  assert.ok(slots.includes('09:00'));
  assert.ok(slots.includes('11:30')); // last 30-min slot fitting before 12:00
  assert.ok(!slots.includes('11:45')); // would end at 12:15, past the window
});

test('booking an appointment removes that slot from future availability', () => {
  AppointmentService.book({
    patientId: patient.id,
    doctorId: doctor.id,
    date: MONDAY,
    startTime: '09:00',
    reason: 'Test visit',
    createdBy: patient.user_id,
  });

  const slots = resolveAvailableSlots(doctor.id, MONDAY);
  assert.ok(!slots.includes('09:00'));
  assert.ok(slots.includes('09:30')); // adjacent slot still free
});

test('assertSlotIsBookable throws a conflict error for an overlapping time', () => {
  assert.throws(
    () => assertSlotIsBookable(doctor.id, `${MONDAY}T09:15:00.000Z`, `${MONDAY}T09:45:00.000Z`),
    (err) => err instanceof ApiError && err.statusCode === 409
  );
});

test('assertSlotIsBookable throws when requested time is outside availability', () => {
  assert.throws(
    () => assertSlotIsBookable(doctor.id, `${MONDAY}T13:00:00.000Z`, `${MONDAY}T13:30:00.000Z`),
    (err) => err instanceof ApiError && err.statusCode === 409
  );
});

test('a blocked exception removes overlapping slots', () => {
  DoctorAvailability.addException({
    doctorId: doctor.id,
    date: MONDAY,
    type: 'blocked',
    startTime: '10:00',
    endTime: '10:30',
    reason: 'Lunch',
  });

  const slots = resolveAvailableSlots(doctor.id, MONDAY);
  assert.ok(!slots.includes('10:00'));
  assert.ok(slots.includes('09:30'));
});

test('double-booking the same exact slot is rejected', () => {
  AppointmentService.book({
    patientId: patient.id,
    doctorId: doctor.id,
    date: MONDAY,
    startTime: '10:30',
    reason: 'First booking',
    createdBy: patient.user_id,
  });

  assert.throws(
    () =>
      AppointmentService.book({
        patientId: patient.id,
        doctorId: doctor.id,
        date: MONDAY,
        startTime: '10:30',
        reason: 'Conflicting booking',
        createdBy: patient.user_id,
      }),
    (err) => err instanceof ApiError && err.statusCode === 409
  );
});

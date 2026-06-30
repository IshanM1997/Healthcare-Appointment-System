// tests/accessControl.test.js
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const TEST_DB_PATH = path.join(__dirname, '.tmp-access-test.db');
process.env.DB_PATH = TEST_DB_PATH;

for (const ext of ['', '-wal', '-shm']) {
  const p = TEST_DB_PATH + ext;
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

const migrate = require('../src/db/migrate');
const User = require('../src/models/User');
const Patient = require('../src/models/Patient');
const Doctor = require('../src/models/Doctor');
const Appointment = require('../src/models/Appointment');
const AuditLog = require('../src/models/AuditLog');
const { checkPatientAccess } = require('../src/middleware/accessControl');

let patientA, patientB, doctorWithRelationship, doctorWithoutRelationship;
let patientAUser, patientBUser, doctorWithUser, doctorWithoutUser, frontDeskUser, adminUser;

before(() => {
  migrate();

  patientAUser = User.create({ email: 'patA@test.local', passwordHash: 'x', role: 'patient' });
  patientA = Patient.create({ userId: patientAUser.id, firstName: 'A', lastName: 'One', dateOfBirth: '1990-01-01', phone: '+1' });

  patientBUser = User.create({ email: 'patB@test.local', passwordHash: 'x', role: 'patient' });
  patientB = Patient.create({ userId: patientBUser.id, firstName: 'B', lastName: 'Two', dateOfBirth: '1991-01-01', phone: '+2' });

  doctorWithUser = User.create({ email: 'docwith@test.local', passwordHash: 'x', role: 'doctor' });
  doctorWithRelationship = Doctor.create({
    userId: doctorWithUser.id, firstName: 'Doc', lastName: 'With', specialty: 'GP', licenseNumber: 'L1',
  });

  doctorWithoutUser = User.create({ email: 'docwithout@test.local', passwordHash: 'x', role: 'doctor' });
  doctorWithoutRelationship = Doctor.create({
    userId: doctorWithoutUser.id, firstName: 'Doc', lastName: 'Without', specialty: 'GP', licenseNumber: 'L2',
  });

  frontDeskUser = User.create({ email: 'fd@test.local', passwordHash: 'x', role: 'front_desk' });
  adminUser = User.create({ email: 'admin@test.local', passwordHash: 'x', role: 'admin' });

  // Give doctorWithRelationship an appointment with patientA only.
  Appointment.create({
    patientId: patientA.id,
    doctorId: doctorWithRelationship.id,
    startAt: '2026-07-01T09:00:00.000Z',
    endAt: '2026-07-01T09:30:00.000Z',
    createdBy: patientAUser.id,
  });
});

after(() => {
  for (const ext of ['', '-wal', '-shm']) {
    const p = TEST_DB_PATH + ext;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});

function fakeReq(user) {
  return { user, ip: '127.0.0.1' };
}

test('a patient can access their own record', () => {
  const allowed = checkPatientAccess(fakeReq({ id: patientAUser.id, role: 'patient' }), patientA.id, {
    action: 'TEST', resourceType: 'patient',
  });
  assert.equal(allowed, true);
});

test('a patient cannot access another patient\'s record', () => {
  const allowed = checkPatientAccess(fakeReq({ id: patientAUser.id, role: 'patient' }), patientB.id, {
    action: 'TEST', resourceType: 'patient',
  });
  assert.equal(allowed, false);
});

test('a doctor with a treatment relationship can access the patient record', () => {
  const allowed = checkPatientAccess(fakeReq({ id: doctorWithUser.id, role: 'doctor' }), patientA.id, {
    action: 'TEST', resourceType: 'patient',
  });
  assert.equal(allowed, true);
});

test('a doctor without a treatment relationship cannot access the patient record', () => {
  const allowed = checkPatientAccess(fakeReq({ id: doctorWithoutUser.id, role: 'doctor' }), patientA.id, {
    action: 'TEST', resourceType: 'patient',
  });
  assert.equal(allowed, false);
});

test('front desk has operational access to any patient record', () => {
  const allowed = checkPatientAccess(fakeReq({ id: frontDeskUser.id, role: 'front_desk' }), patientB.id, {
    action: 'TEST', resourceType: 'patient',
  });
  assert.equal(allowed, true);
});

test('admin always has access (and it is still logged)', () => {
  const allowed = checkPatientAccess(fakeReq({ id: adminUser.id, role: 'admin' }), patientB.id, {
    action: 'TEST', resourceType: 'patient',
  });
  assert.equal(allowed, true);

  const logs = AuditLog.listForPatient(patientB.id);
  assert.ok(logs.some((l) => l.actor_role === 'admin' && l.outcome === 'allowed'));
});

test('every access decision is written to the audit log, including denials', () => {
  const before_ = AuditLog.listForPatient(patientB.id).length;
  checkPatientAccess(fakeReq({ id: patientAUser.id, role: 'patient' }), patientB.id, {
    action: 'TEST_DENIAL', resourceType: 'patient',
  });
  const after_ = AuditLog.listForPatient(patientB.id).length;
  assert.equal(after_, before_ + 1);

  const logs = AuditLog.listForPatient(patientB.id);
  assert.ok(logs.some((l) => l.action === 'TEST_DENIAL' && l.outcome === 'denied'));
});

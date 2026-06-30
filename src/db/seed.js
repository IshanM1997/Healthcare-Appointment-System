// src/db/seed.js
//
// Populates the database with a small but realistic demo dataset:
// one admin, one front-desk user, two doctors (with weekly availability
// and one exception), two patients, a booked appointment, and a
// prescription. Run with `npm run seed` after `npm run start` has
// created the schema (or it will create the schema itself first).
//
// Safe to re-run: it checks for existing emails before inserting.

const migrate = require('./migrate');
const db = require('./connection');
const { hashPassword } = require('../utils/password');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const DoctorAvailability = require('../models/DoctorAvailability');
const AppointmentService = require('../services/appointmentService');
const PrescriptionService = require('../services/prescriptionService');

const DEMO_PASSWORD = 'Password123!';

async function upsertUser(email, role) {
  const existing = User.findByEmail(email);
  if (existing) return existing;
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  return User.create({ email, passwordHash, role });
}

async function seed() {
  migrate();

  console.log('[seed] Creating demo accounts (all use password: ' + DEMO_PASSWORD + ')');

  // --- Admin & front desk -------------------------------------------
  const adminUser = await upsertUser('admin@clinic.test', 'admin');
  const frontDeskUser = await upsertUser('frontdesk@clinic.test', 'front_desk');

  // --- Doctors ---------------------------------------------------------
  let drLeeUser = User.findByEmail('dr.lee@clinic.test');
  let drLee;
  if (!drLeeUser) {
    drLeeUser = await upsertUser('dr.lee@clinic.test', 'doctor');
    drLee = Doctor.create({
      userId: drLeeUser.id,
      firstName: 'Sarah',
      lastName: 'Lee',
      specialty: 'Family Medicine',
      licenseNumber: 'MD-100234',
      phone: '+15555550101',
      bio: 'General practitioner with 12 years of experience.',
      appointmentDurationMinutes: 30,
    });
    DoctorAvailability.addRecurring({ doctorId: drLee.id, dayOfWeek: 1, startTime: '09:00', endTime: '17:00' });
    DoctorAvailability.addRecurring({ doctorId: drLee.id, dayOfWeek: 2, startTime: '09:00', endTime: '17:00' });
    DoctorAvailability.addRecurring({ doctorId: drLee.id, dayOfWeek: 3, startTime: '09:00', endTime: '13:00' });
    DoctorAvailability.addRecurring({ doctorId: drLee.id, dayOfWeek: 4, startTime: '09:00', endTime: '17:00' });
    DoctorAvailability.addRecurring({ doctorId: drLee.id, dayOfWeek: 5, startTime: '09:00', endTime: '15:00' });
  } else {
    drLee = Doctor.findByUserId(drLeeUser.id);
  }

  let drPatelUser = User.findByEmail('dr.patel@clinic.test');
  let drPatel;
  if (!drPatelUser) {
    drPatelUser = await upsertUser('dr.patel@clinic.test', 'doctor');
    drPatel = Doctor.create({
      userId: drPatelUser.id,
      firstName: 'Raj',
      lastName: 'Patel',
      specialty: 'Cardiology',
      licenseNumber: 'MD-100567',
      phone: '+15555550102',
      bio: 'Cardiologist specializing in preventive care.',
      appointmentDurationMinutes: 45,
    });
    DoctorAvailability.addRecurring({ doctorId: drPatel.id, dayOfWeek: 1, startTime: '10:00', endTime: '16:00' });
    DoctorAvailability.addRecurring({ doctorId: drPatel.id, dayOfWeek: 3, startTime: '10:00', endTime: '16:00' });
    DoctorAvailability.addRecurring({ doctorId: drPatel.id, dayOfWeek: 5, startTime: '10:00', endTime: '14:00' });

    // Example one-off exception: blocked for a half-day conference.
    DoctorAvailability.addException({
      doctorId: drPatel.id,
      date: nextWeekday(1), // next Monday
      type: 'blocked',
      startTime: '10:00',
      endTime: '12:00',
      reason: 'Conference attendance',
    });
  } else {
    drPatel = Doctor.findByUserId(drPatelUser.id);
  }

  // --- Patients --------------------------------------------------------
  let aliceUser = User.findByEmail('alice@example.test');
  let alice;
  if (!aliceUser) {
    aliceUser = await upsertUser('alice@example.test', 'patient');
    alice = Patient.create({
      userId: aliceUser.id,
      firstName: 'Alice',
      lastName: 'Nguyen',
      dateOfBirth: '1990-04-12',
      phone: '+15555550201',
      address: '12 Birch Street, Springfield',
      emergencyContactName: 'Tom Nguyen',
      emergencyContactPhone: '+15555550299',
      insuranceProvider: 'BlueCross',
      insurancePolicyNumber: 'BC-998877',
    });
  } else {
    alice = Patient.findByUserId(aliceUser.id);
  }

  let bobUser = User.findByEmail('bob@example.test');
  let bob;
  if (!bobUser) {
    bobUser = await upsertUser('bob@example.test', 'patient');
    bob = Patient.create({
      userId: bobUser.id,
      firstName: 'Bob',
      lastName: 'Martinez',
      dateOfBirth: '1985-11-02',
      phone: '+15555550202',
      address: '88 Oak Avenue, Springfield',
      emergencyContactName: 'Carla Martinez',
      emergencyContactPhone: '+15555550298',
      insuranceProvider: 'Aetna',
      insurancePolicyNumber: 'AE-554433',
    });
  } else {
    bob = Patient.findByUserId(bobUser.id);
  }

  // --- A sample appointment + prescription ------------------------------
  const existingAppointments = db
    .prepare(`SELECT * FROM appointments WHERE patient_id = ? AND doctor_id = ?`)
    .all(alice.id, drLee.id);

  if (existingAppointments.length === 0) {
    const bookingDate = nextWeekday(1); // next Monday, when Dr. Lee is available
    const appointment = AppointmentService.book({
      patientId: alice.id,
      doctorId: drLee.id,
      date: bookingDate,
      startTime: '09:00',
      reason: 'Annual check-up',
      createdBy: aliceUser.id,
    });

    PrescriptionService.issue({
      appointmentId: appointment.id,
      patientId: alice.id,
      doctorId: drLee.id,
      medicationName: 'Vitamin D3',
      dosage: '2000 IU',
      frequency: 'once daily',
      durationDays: 90,
      instructions: 'Take with food.',
    });

    console.log(`[seed] Booked sample appointment for Alice with Dr. Lee on ${bookingDate} 09:00`);
  }

  console.log('[seed] Done. Demo accounts:');
  console.log('  admin@clinic.test       (admin)');
  console.log('  frontdesk@clinic.test   (front_desk)');
  console.log('  dr.lee@clinic.test      (doctor, Family Medicine)');
  console.log('  dr.patel@clinic.test    (doctor, Cardiology)');
  console.log('  alice@example.test      (patient)');
  console.log('  bob@example.test        (patient)');
  console.log(`  password for all: ${DEMO_PASSWORD}`);
}

/**
 * Returns the YYYY-MM-DD date string of the next occurrence of the given
 * ISO day-of-week (0=Sunday..6=Saturday), strictly after today.
 */
function nextWeekday(targetDow) {
  const now = new Date();
  const result = new Date(now);
  do {
    result.setUTCDate(result.getUTCDate() + 1);
  } while (result.getUTCDay() !== targetDow);
  return result.toISOString().slice(0, 10);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  });

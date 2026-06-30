// src/services/authService.js
const User = require('../models/User');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const { hashPassword, verifyPassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');
const { ApiError } = require('../utils/apiError');

const AuthService = {
  /**
   * Registers a new patient. Doctors and front-desk/admin accounts are
   * provisioned separately (registerStaff) since they shouldn't be
   * self-serve signups in a real clinic.
   */
  async registerPatient(payload) {
    const existing = User.findByEmail(payload.email);
    if (existing) throw ApiError.conflict('An account with this email already exists');

    const passwordHash = await hashPassword(payload.password);
    const user = User.create({ email: payload.email, passwordHash, role: 'patient' });

    const patient = Patient.create({
      userId: user.id,
      firstName: payload.firstName,
      lastName: payload.lastName,
      dateOfBirth: payload.dateOfBirth,
      phone: payload.phone,
      address: payload.address,
      emergencyContactName: payload.emergencyContactName,
      emergencyContactPhone: payload.emergencyContactPhone,
      insuranceProvider: payload.insuranceProvider,
      insurancePolicyNumber: payload.insurancePolicyNumber,
    });

    return { user, patient };
  },

  /**
   * Registers staff (doctor, front_desk, admin). In a real system this
   * route would itself be locked down to admins only; it's exposed here
   * mainly so the project is runnable/seedable end-to-end.
   */
  async registerStaff(payload) {
    const existing = User.findByEmail(payload.email);
    if (existing) throw ApiError.conflict('An account with this email already exists');

    const passwordHash = await hashPassword(payload.password);
    const user = User.create({ email: payload.email, passwordHash, role: payload.role });

    let doctor = null;
    if (payload.role === 'doctor') {
      doctor = Doctor.create({
        userId: user.id,
        firstName: payload.firstName,
        lastName: payload.lastName,
        specialty: payload.specialty,
        licenseNumber: payload.licenseNumber,
        phone: payload.phone,
        bio: payload.bio,
        appointmentDurationMinutes: payload.appointmentDurationMinutes || 30,
      });
    }

    return { user, doctor };
  },

  async login({ email, password }) {
    const user = User.findByEmail(email);
    if (!user || !user.is_active) throw ApiError.unauthorized('Invalid email or password');

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) throw ApiError.unauthorized('Invalid email or password');

    const token = signToken({ sub: user.id, role: user.role });
    return { token, user: { id: user.id, email: user.email, role: user.role } };
  },
};

module.exports = AuthService;

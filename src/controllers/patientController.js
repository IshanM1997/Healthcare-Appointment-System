// src/controllers/patientController.js
const Patient = require('../models/Patient');
const { asyncHandler, ApiError } = require('../utils/apiError');
const { redactPatientForRole } = require('../middleware/accessControl');

const getPatient = asyncHandler(async (req, res) => {
  const patient = Patient.findById(req.resolvedPatientId);
  if (!patient) throw ApiError.notFound('Patient not found');
  res.json({ patient: redactPatientForRole(patient, req.user.role) });
});

const updatePatient = asyncHandler(async (req, res) => {
  // Patients may update their own contact info but not clinical fields;
  // medical_notes may only be written by doctors/admins.
  const body = { ...req.body };
  if (req.user.role !== 'doctor' && req.user.role !== 'admin') {
    delete body.medical_notes;
  }
  const updated = Patient.update(req.resolvedPatientId, body);
  res.json({ patient: redactPatientForRole(updated, req.user.role) });
});

// Listing all patients is an administrative/front-desk operation, not
// gated by requirePatientAccess (there's no single patientId), so the
// route itself restricts this to front_desk/admin via requireRole.
const listPatients = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const offset = parseInt(req.query.offset, 10) || 0;
  const patients = Patient.list({ limit, offset });
  res.json({ patients: patients.map((p) => redactPatientForRole(p, req.user.role)) });
});

module.exports = { getPatient, updatePatient, listPatients };

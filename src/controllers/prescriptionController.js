// src/controllers/prescriptionController.js
const PrescriptionService = require('../services/prescriptionService');
const Prescription = require('../models/Prescription');
const Doctor = require('../models/Doctor');
const { asyncHandler, ApiError } = require('../utils/apiError');
const { checkPatientAccess } = require('../middleware/accessControl');

const issuePrescription = asyncHandler(async (req, res) => {
  // Only the treating doctor (or admin) may issue prescriptions; enforced
  // at the route level via requireRole('doctor', 'admin'). Here we also
  // confirm the doctor has a relationship to the patient.
  const { patientId, appointmentId, medicationName, dosage, frequency, durationDays, instructions } = req.body;

  let doctorId = req.body.doctorId;
  if (req.user.role === 'doctor') {
    const doctor = Doctor.findByUserId(req.user.id);
    if (!doctor) throw ApiError.notFound('Doctor profile not found');
    doctorId = doctor.id;
  }

  const allowed = checkPatientAccess(req, patientId, {
    action: 'ISSUE_PRESCRIPTION',
    resourceType: 'prescription',
  });
  if (!allowed) throw ApiError.forbidden('You do not have a treatment relationship with this patient');

  const prescription = PrescriptionService.issue({
    appointmentId,
    patientId,
    doctorId,
    medicationName,
    dosage,
    frequency,
    durationDays,
    instructions,
  });
  res.status(201).json({ prescription });
});

const listPrescriptionsForPatient = asyncHandler(async (req, res) => {
  const prescriptions = Prescription.listForPatient(req.resolvedPatientId);
  res.json({ prescriptions });
});

const listMyIssuedPrescriptions = asyncHandler(async (req, res) => {
  const doctor = Doctor.findByUserId(req.user.id);
  if (!doctor) throw ApiError.notFound('Doctor profile not found');
  const prescriptions = Prescription.listForDoctor(doctor.id);
  res.json({ prescriptions });
});

const cancelPrescription = asyncHandler(async (req, res) => {
  const updated = PrescriptionService.cancel(req.params.prescriptionId);
  res.json({ prescription: updated });
});

module.exports = {
  issuePrescription,
  listPrescriptionsForPatient,
  listMyIssuedPrescriptions,
  cancelPrescription,
};

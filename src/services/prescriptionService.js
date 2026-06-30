// src/services/prescriptionService.js
const Prescription = require('../models/Prescription');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const { ApiError } = require('../utils/apiError');

const PrescriptionService = {
  issue({ appointmentId, patientId, doctorId, medicationName, dosage, frequency, durationDays, instructions }) {
    const doctor = Doctor.findById(doctorId);
    if (!doctor) throw ApiError.notFound('Doctor not found');

    const patient = Patient.findById(patientId);
    if (!patient) throw ApiError.notFound('Patient not found');

    return Prescription.create({
      appointmentId,
      patientId,
      doctorId,
      medicationName,
      dosage,
      frequency,
      durationDays,
      instructions,
    });
  },

  cancel(prescriptionId) {
    const prescription = Prescription.findById(prescriptionId);
    if (!prescription) throw ApiError.notFound('Prescription not found');
    return Prescription.updateStatus(prescriptionId, 'cancelled');
  },

  complete(prescriptionId) {
    const prescription = Prescription.findById(prescriptionId);
    if (!prescription) throw ApiError.notFound('Prescription not found');
    return Prescription.updateStatus(prescriptionId, 'completed');
  },
};

module.exports = PrescriptionService;

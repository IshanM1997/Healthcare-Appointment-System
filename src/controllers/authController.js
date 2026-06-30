// src/controllers/authController.js
const AuthService = require('../services/authService');
const { asyncHandler } = require('../utils/apiError');

const registerPatient = asyncHandler(async (req, res) => {
  const { user, patient } = await AuthService.registerPatient(req.body);
  res.status(201).json({
    user: { id: user.id, email: user.email, role: user.role },
    patient,
  });
});

const registerStaff = asyncHandler(async (req, res) => {
  const { user, doctor } = await AuthService.registerStaff(req.body);
  res.status(201).json({
    user: { id: user.id, email: user.email, role: user.role },
    doctor,
  });
});

const login = asyncHandler(async (req, res) => {
  const result = await AuthService.login(req.body);
  res.json(result);
});

module.exports = { registerPatient, registerStaff, login };

// src/routes/authRoutes.js
const express = require('express');
const { registerPatient, registerStaff, login } = require('../controllers/authController');
const { requireFields } = require('../middleware/validate');

const router = express.Router();

router.post(
  '/register/patient',
  requireFields(['email', 'password', 'firstName', 'lastName', 'dateOfBirth', 'phone']),
  registerPatient
);

router.post(
  '/register/staff',
  requireFields(['email', 'password', 'role', 'firstName', 'lastName']),
  registerStaff
);

router.post('/login', requireFields(['email', 'password']), login);

module.exports = router;

// src/middleware/accessControl.js
//
// HIPAA-style access control for PHI (Protected Health Information).
//
// Two layers are enforced here, mirroring how real healthcare systems
// reason about access:
//
//   1. ROLE-BASED: what kind of user is allowed to even attempt this
//      action at all (e.g. only 'doctor' and 'admin' may write
//      prescriptions).
//
//   2. RELATIONSHIP-BASED ("minimum necessary" / treatment relationship):
//      even if your role permits the action in general, you may only
//      touch a specific patient's record if you have a legitimate
//      relationship to it — you ARE that patient, you are a doctor who
//      has an appointment with that patient, or you are front desk /
//      admin staff with operational need.
//
// Every decision (allowed or denied) is written to the audit log via
// AuditLog.record, because in a real compliance setting, *allowed*
// accesses to PHI must be logged just as much as denied ones — that's
// what lets a privacy officer answer "who looked at this chart?".

const { ApiError } = require('../utils/apiError');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');
const AuditLog = require('../models/AuditLog');

/**
 * Restricts a route to a fixed set of roles. This only checks "what kind
 * of actor are you", not "do you have a relationship to this specific
 * record" — pair with requirePatientAccess for record-level checks.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());

    if (!allowedRoles.includes(req.user.role)) {
      AuditLog.record({
        actorUserId: req.user.id,
        actorRole: req.user.role,
        action: `ROLE_CHECK:${req.method}:${req.originalUrl}`,
        resourceType: 'route',
        outcome: 'denied',
        ipAddress: req.ip,
        metadata: { requiredRoles: allowedRoles },
      });
      return next(ApiError.forbidden(`This action requires one of these roles: ${allowedRoles.join(', ')}`));
    }
    return next();
  };
}

/**
 * Determines whether the requesting user has a legitimate treatment or
 * operational relationship to the given patientId, and records an audit
 * log entry either way. Throws ApiError.forbidden() if not.
 *
 * Resolution rules (most specific first):
 *  - admin            -> always allowed (oversight role), but still logged
 *  - patient          -> allowed only for their OWN patient record
 *  - front_desk        -> allowed for scheduling-relevant fields only;
 *                         full clinical notes are still redacted downstream
 *  - doctor            -> allowed only if the doctor has at least one
 *                         appointment (any status) with this patient
 */
function checkPatientAccess(req, patientId, { action, resourceType, resourceId }) {
  const { user } = req;
  let allowed = false;
  let reason = '';

  if (user.role === 'admin') {
    allowed = true;
    reason = 'admin_oversight';
  } else if (user.role === 'patient') {
    const ownPatient = Patient.findByUserId(user.id);
    allowed = !!ownPatient && ownPatient.id === patientId;
    reason = allowed ? 'self_access' : 'not_own_record';
  } else if (user.role === 'front_desk') {
    // Front desk has operational access for scheduling, but the
    // controllers themselves are responsible for not exposing
    // clinical fields (medical_notes) to this role.
    allowed = true;
    reason = 'front_desk_operational_access';
  } else if (user.role === 'doctor') {
    const doctor = Doctor.findByUserId(user.id);
    if (doctor) {
      const appts = Appointment.listForPatient(patientId).filter((a) => a.doctor_id === doctor.id);
      allowed = appts.length > 0;
      reason = allowed ? 'has_treatment_relationship' : 'no_treatment_relationship';
    } else {
      reason = 'doctor_profile_not_found';
    }
  }

  AuditLog.record({
    actorUserId: user.id,
    actorRole: user.role,
    action,
    resourceType,
    resourceId,
    patientId,
    outcome: allowed ? 'allowed' : 'denied',
    ipAddress: req.ip,
    metadata: { reason },
  });

  return allowed;
}

/**
 * Express middleware factory: enforces that req.user has a legitimate
 * relationship to the patient identified by req.params[patientIdParam]
 * (default 'patientId'). Use this on any route that reads or writes a
 * specific patient's PHI.
 */
function requirePatientAccess({ action, resourceType, patientIdParam = 'patientId' } = {}) {
  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());

    const patientId = req.params[patientIdParam] || req.body.patientId;
    if (!patientId) return next(ApiError.badRequest(`Missing ${patientIdParam}`));

    const allowed = checkPatientAccess(req, patientId, {
      action: action || `${req.method}:${req.originalUrl}`,
      resourceType: resourceType || 'patient',
      resourceId: patientId,
    });

    if (!allowed) {
      return next(ApiError.forbidden('You do not have access to this patient record'));
    }

    req.resolvedPatientId = patientId;
    return next();
  };
}

/**
 * Strips fields a role shouldn't see (e.g. front_desk should not see
 * medical_notes). Returns a shallow-copied, redacted object.
 */
function redactPatientForRole(patient, role) {
  if (!patient) return patient;
  const copy = { ...patient };

  if (role === 'front_desk') {
    delete copy.medical_notes;
    delete copy.insurance_policy_number;
  }
  return copy;
}

module.exports = {
  requireRole,
  requirePatientAccess,
  checkPatientAccess,
  redactPatientForRole,
};

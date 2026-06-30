// src/services/schedulingService.js
//
// The scheduling engine. Responsible for answering two questions:
//
//   1. "What open slots does Dr. X have on date Y?"
//      -> resolveAvailableSlots()
//
//   2. "Can I book Dr. X for this exact start/end time?"
//      -> assertSlotIsBookable() (used inside appointmentService.book)
//
// The resolution order for a given doctor + date is:
//
//   recurring weekly windows (e.g. "Mon 09:00-17:00")
//     minus  any 'blocked' exceptions for that date (time off)
//     plus   any 'extra' exceptions for that date (added hours)
//     minus  already-booked appointments (conflict exclusion)
//     sliced into candidate slots of the doctor's appointment duration,
//     stepped by the global slot granularity (default 15 min)
//
// Doing this as a pure function of (availability rows, exceptions,
// existing appointments) — rather than baking SQL date math — keeps the
// logic testable and easy to reason about.

const config = require('../config');
const Doctor = require('../models/Doctor');
const DoctorAvailability = require('../models/DoctorAvailability');
const Appointment = require('../models/Appointment');
const { ApiError } = require('../utils/apiError');
const {
  timeToMinutes,
  minutesToTime,
  dayOfWeekFromDateString,
  combineDateAndTime,
  rangesOverlap,
  isoRangesOverlap,
  generateSlots,
} = require('../utils/datetime');

/**
 * Builds the list of open [startMinutes, endMinutes) windows for a
 * doctor on a specific date, after applying blocked/extra exceptions.
 * Returns windows sorted and merged where adjacent/overlapping.
 */
function resolveOpenWindows(doctorId, dateStr) {
  const dayOfWeek = dayOfWeekFromDateString(dateStr);
  const recurring = DoctorAvailability.listRecurringForDoctorOnDay(doctorId, dayOfWeek);
  const exceptions = DoctorAvailability.listExceptionsForDoctorOnDate(doctorId, dateStr);

  let windows = recurring.map((r) => [timeToMinutes(r.start_time), timeToMinutes(r.end_time)]);

  // Apply 'extra' exceptions: add the window.
  exceptions
    .filter((e) => e.type === 'extra')
    .forEach((e) => {
      windows.push([timeToMinutes(e.start_time), timeToMinutes(e.end_time)]);
    });

  // Apply 'blocked' exceptions: subtract the window from anything it overlaps.
  const blocked = exceptions.filter((e) => e.type === 'blocked');
  for (const block of blocked) {
    const blockStart = block.start_time ? timeToMinutes(block.start_time) : 0;
    const blockEnd = block.end_time ? timeToMinutes(block.end_time) : 24 * 60;
    windows = subtractWindow(windows, blockStart, blockEnd);
  }

  return mergeWindows(windows);
}

/**
 * Subtracts [cutStart, cutEnd) from a list of [start, end) windows,
 * splitting windows that only partially overlap the cut.
 */
function subtractWindow(windows, cutStart, cutEnd) {
  const result = [];
  for (const [start, end] of windows) {
    if (!rangesOverlap(start, end, cutStart, cutEnd)) {
      result.push([start, end]);
      continue;
    }
    if (start < cutStart) result.push([start, Math.min(end, cutStart)]);
    if (end > cutEnd) result.push([Math.max(start, cutEnd), end]);
  }
  return result.filter(([s, e]) => e > s);
}

/**
 * Merges overlapping or adjacent [start, end) windows after sorting.
 */
function mergeWindows(windows) {
  const sorted = [...windows].sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

/**
 * Public API: returns an array of bookable start times ("HH:MM") for a
 * doctor on a given date, after excluding already-booked appointments.
 */
function resolveAvailableSlots(doctorId, dateStr) {
  const doctor = Doctor.findById(doctorId);
  if (!doctor) throw ApiError.notFound('Doctor not found');

  const duration = doctor.appointment_duration_minutes;
  const openWindows = resolveOpenWindows(doctorId, dateStr);
  const existingAppointments = Appointment.listForDoctorOnDate(doctorId, dateStr);

  const bookedRanges = existingAppointments.map((a) => [
    timeToMinutes(a.start_at.slice(11, 16)),
    timeToMinutes(a.end_at.slice(11, 16)),
  ]);

  const candidateSlots = [];
  for (const [windowStart, windowEnd] of openWindows) {
    const slots = generateSlots(
      minutesToTime(windowStart),
      minutesToTime(windowEnd),
      duration,
      config.scheduling.slotGranularityMinutes
    );

    for (const slotStartTime of slots) {
      const slotStart = timeToMinutes(slotStartTime);
      const slotEnd = slotStart + duration;
      const conflicts = bookedRanges.some(([bStart, bEnd]) => rangesOverlap(slotStart, slotEnd, bStart, bEnd));
      if (!conflicts) candidateSlots.push(slotStartTime);
    }
  }

  return candidateSlots.sort();
}

/**
 * Validates that an exact [startAt, endAt) ISO range is bookable for a
 * doctor: it must fall fully within an open window AND not overlap any
 * existing non-cancelled appointment. Throws ApiError.conflict() if not.
 * This is the authoritative check used at booking time — the slot list
 * above is just a convenience for clients to know what to offer.
 */
function assertSlotIsBookable(doctorId, startAtIso, endAtIso) {
  const dateStr = startAtIso.slice(0, 10);
  const startTime = startAtIso.slice(11, 16);
  const endTime = endAtIso.slice(11, 16);

  const openWindows = resolveOpenWindows(doctorId, dateStr);
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);

  const fitsInWindow = openWindows.some(([wStart, wEnd]) => startMin >= wStart && endMin <= wEnd);
  if (!fitsInWindow) {
    throw ApiError.conflict('Requested time is outside the doctor\'s available hours');
  }

  const overlapping = Appointment.listActiveForDoctorInRange(doctorId, startAtIso, endAtIso);
  const realConflict = overlapping.some((a) => isoRangesOverlap(a.start_at, a.end_at, startAtIso, endAtIso));
  if (realConflict) {
    throw ApiError.conflict('This time slot was just booked by someone else. Please choose another.');
  }
}

module.exports = {
  resolveOpenWindows,
  resolveAvailableSlots,
  assertSlotIsBookable,
  combineDateAndTime,
};

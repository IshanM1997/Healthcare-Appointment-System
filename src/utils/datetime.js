// src/utils/datetime.js
// Small set of pure helper functions for the scheduling engine.
// Everything here is deliberately framework-free so it's easy to unit test.

/**
 * Parse "HH:MM" into total minutes since midnight.
 */
function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Format total minutes since midnight back into "HH:MM".
 */
function minutesToTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Returns the day-of-week index (0=Sunday..6=Saturday) for a YYYY-MM-DD
 * date string, interpreted as a plain calendar date (no timezone shifting).
 */
function dayOfWeekFromDateString(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  // Use UTC to avoid local-timezone drift turning a date into "the day before".
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Combine a YYYY-MM-DD date string and an HH:MM time string into an
 * ISO-8601 UTC timestamp string. The system treats all clinic-local
 * times as if they were UTC for simplicity; in a production system this
 * would instead use the clinic's configured timezone (e.g. via Luxon).
 */
function combineDateAndTime(dateStr, timeStr) {
  return `${dateStr}T${timeStr}:00.000Z`;
}

/**
 * True if two [start, end) ranges (minutes-since-midnight, or comparable
 * sortable values) overlap.
 */
function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

/**
 * True if two ISO timestamp ranges overlap.
 */
function isoRangesOverlap(startAIso, endAIso, startBIso, endBIso) {
  return new Date(startAIso) < new Date(endBIso) && new Date(startBIso) < new Date(endAIso);
}

/**
 * Generate candidate appointment start times (as "HH:MM") within a
 * [windowStart, windowEnd) range, stepped by slotMinutes, such that each
 * candidate slot of length durationMinutes fits before windowEnd.
 */
function generateSlots(windowStartTime, windowEndTime, durationMinutes, slotGranularityMinutes) {
  const slots = [];
  const windowStart = timeToMinutes(windowStartTime);
  const windowEnd = timeToMinutes(windowEndTime);

  for (
    let candidate = windowStart;
    candidate + durationMinutes <= windowEnd;
    candidate += slotGranularityMinutes
  ) {
    slots.push(minutesToTime(candidate));
  }
  return slots;
}

module.exports = {
  timeToMinutes,
  minutesToTime,
  dayOfWeekFromDateString,
  combineDateAndTime,
  rangesOverlap,
  isoRangesOverlap,
  generateSlots,
};

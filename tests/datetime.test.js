// tests/datetime.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  timeToMinutes,
  minutesToTime,
  dayOfWeekFromDateString,
  rangesOverlap,
  generateSlots,
} = require('../src/utils/datetime');

test('timeToMinutes converts HH:MM correctly', () => {
  assert.equal(timeToMinutes('00:00'), 0);
  assert.equal(timeToMinutes('09:30'), 570);
  assert.equal(timeToMinutes('23:59'), 1439);
});

test('minutesToTime is the inverse of timeToMinutes', () => {
  assert.equal(minutesToTime(0), '00:00');
  assert.equal(minutesToTime(570), '09:30');
  assert.equal(minutesToTime(1439), '23:59');
});

test('dayOfWeekFromDateString returns correct ISO weekday', () => {
  // 2026-06-29 is a Monday
  assert.equal(dayOfWeekFromDateString('2026-06-29'), 1);
  // 2026-07-05 is a Sunday
  assert.equal(dayOfWeekFromDateString('2026-07-05'), 0);
});

test('rangesOverlap detects overlapping and non-overlapping ranges', () => {
  assert.equal(rangesOverlap(0, 30, 15, 45), true);
  assert.equal(rangesOverlap(0, 30, 30, 60), false); // touching, not overlapping
  assert.equal(rangesOverlap(0, 30, 31, 60), false);
  assert.equal(rangesOverlap(10, 20, 5, 25), true); // fully contained
});

test('generateSlots produces correctly spaced candidate start times', () => {
  const slots = generateSlots('09:00', '10:00', 30, 15);
  // Window is 60 minutes, 30-minute duration -> candidates at 09:00, 09:15, 09:30
  // (09:30 + 30 = 10:00 still fits; 09:45+30=10:15 would not fit)
  assert.deepEqual(slots, ['09:00', '09:15', '09:30']);
});

test('generateSlots returns empty array when window is too small', () => {
  const slots = generateSlots('09:00', '09:20', 30, 15);
  assert.deepEqual(slots, []);
});

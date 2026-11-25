const { test } = require('node:test');
const assert = require('node:assert/strict');
const { LAB, validateSession, live, locationValid } = require('../session-policy.cjs');
const now = Date.parse('2026-11-25T10:00:00+07:00');
const session = { practicalName: 'PPK', className: 'A', date: '2026-11-25', startTime: '10:01', endTime: '11:00', status: 'Berlangsung', deleted: false };
test('session times use WIB and reject past dates, past minutes and invalid calendar dates', () => {
  assert.equal(validateSession(session, now).start, now + 60000);
  for (const value of [{ startTime: '10:00' }, { date: '2026-11-24' }, { date: '2026-02-30' }, { endTime: '09:00' }, { startTime: '25:00' }]) assert.throws(() => validateSession({ ...session, ...value }, now));
});
test('live window includes start and excludes exact end, regardless of status left open', () => {
  assert.throws(() => live(session, now));
  assert.ok(live(session, now + 60000));
  assert.throws(() => live(session, now + 3600000));
  assert.throws(() => live({ ...session, deleted: true }, now + 60000));
  assert.throws(() => live({ ...session, status: 'Selesai' }, now + 60000));
});
test('FSM pin accepts inside 1 km and rejects outside, inaccurate and malformed coordinates', () => {
  const position = { latitude: LAB.latitude, longitude: LAB.longitude, accuracy: 10 };
  assert.equal(locationValid(position), 0);
  assert.ok(locationValid({ ...position, latitude: LAB.latitude + .008 }) < 1000);
  for (const value of [{ latitude: LAB.latitude + .01 }, { latitude: NaN }, { longitude: 190 }, { accuracy: null }, { accuracy: 101 }, { mocked: true }]) assert.throws(() => locationValid({ ...position, ...value }));
});

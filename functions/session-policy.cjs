const { HttpsError } = require('firebase-functions/v2/https');
const LAB = { name: 'FSM UNDIP', latitude: -7.0483968, longitude: 110.4412672, radiusMeters: 1000 };
const fail = (message) => { throw new HttpsError('failed-precondition', message); };
function times(s) {
  const start = Date.parse(`${s.date}T${s.startTime}:00+07:00`);
  const end = Date.parse(`${s.date}T${s.endTime}:00+07:00`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) fail('Jadwal sesi tidak valid.');
  return { start, end };
}
function validateSession(s, now = Date.now()) {
  if (!s || !['practicalName', 'className'].every(k => typeof s[k] === 'string' && s[k].trim().length > 0 && s[k].trim().length <= (k === 'className' ? 60 : 120))) fail('Nama praktikum dan kelas wajib diisi.');
  if (typeof s.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.date) || !Number.isFinite(Date.parse(s.date)) || new Date(s.date).toISOString().slice(0, 10) !== s.date) fail('Tanggal tidak valid.');
  if (![s.startTime, s.endTime].every(t => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t))) fail('Jam tidak valid.');
  const range = times(s);
  if (range.start <= now) fail('Tanggal dan jam mulai harus setelah waktu sekarang (WIB).');
  return range;
}
function live(s, now = Date.now()) {
  const range = times(s);
  if (s.deleted || s.status !== 'Berlangsung' || now < range.start || now >= range.end) fail('Presensi hanya tersedia selama jam sesi berlangsung.');
  return range;
}
function locationValid(p) {
  if (!p || !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude) || Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180 || !Number.isFinite(p.accuracy) || p.accuracy < 0 || p.accuracy > 100 || p.mocked === true) fail('Lokasi tidak valid atau GPS kurang akurat. Aktifkan GPS lalu coba lagi.');
  const r = Math.PI / 180;
  const h = Math.sin((p.latitude - LAB.latitude) * r / 2) ** 2 + Math.cos(p.latitude * r) * Math.cos(LAB.latitude * r) * Math.sin((p.longitude - LAB.longitude) * r / 2) ** 2;
  const distance = 2 * 6371000 * Math.asin(Math.sqrt(h));
  if (distance > LAB.radiusMeters) fail(`Kamu berada di luar radius FSM UNDIP (maksimal ${LAB.radiusMeters} m).`);
  return distance;
}
module.exports = { LAB, times, validateSession, live, locationValid, fail };

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue, Timestamp, GeoPoint } = require('firebase-admin/firestore');
const { randomBytes, createHash } = require('node:crypto');
const policy = require('./session-policy.cjs');
const hash = value => createHash('sha256').update(value).digest('hex');
const id = value => { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new HttpsError('invalid-argument', 'UID / ID tidak valid.'); return value; };
const options = { region: 'asia-southeast2', maxInstances: 10 };
function handler(role, work) {
  return onCall(options, async request => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Silakan masuk.');
    const db = getFirestore();
    return db.runTransaction(async tx => {
      const profile = (await tx.get(db.doc(`users/${request.auth.uid}`))).data();
      if (profile?.role !== role) throw new HttpsError('permission-denied', `Fitur ini hanya untuk ${role}.`);
      return work({ db, tx, uid: request.auth.uid, profile, data: request.data ?? {} });
    });
  });
}
async function owned({ db, tx, uid, data }) {
  const ref = db.doc(`sessions/${id(data.sessionId)}`);
  const s = (await tx.get(ref)).data();
  if (!s || s.deleted) policy.fail('Sesi tidak tersedia.');
  if (s.assistantId !== uid) throw new HttpsError('permission-denied', 'Sesi ini bukan milikmu.');
  return { ref, s };
}
exports.savePracticalSession = handler('Asisten', async ctx => {
  const { db, tx, uid, data } = ctx;
  const input = data.input;
  const range = policy.validateSession(input);
  if (input.assistantId !== uid) policy.fail('Masukkan UID Asprak milik akun yang sedang login.');
  const existing = data.sessionId ? await owned(ctx) : null;
  if (existing && existing.s.status !== 'Belum Dibuka') policy.fail('Hanya sesi yang belum dibuka yang dapat diubah.');
  const classId = input.classId || existing?.s.classId;
  let classRef, classData;
  if (classId) {
    if (existing && existing.s.classId !== classId) policy.fail('Kelas sesi yang sudah tersimpan tidak dapat dipindahkan.');
    classRef = db.doc(`classes/${id(classId)}`);
    classData = (await tx.get(classRef)).data();
    if (!classData || classData.deleted || classData.assistantId !== uid) policy.fail('Kelas tidak tersedia atau bukan milikmu.');
  }
  const ref = existing?.ref ?? db.collection('sessions').doc();
  const values = { practicalName: input.practicalName.trim(), className: input.className.trim(), date: input.date, startTime: input.startTime, endTime: input.endTime, assistantId: uid, startsAt: Timestamp.fromMillis(range.start), endsAt: Timestamp.fromMillis(range.end), updatedAt: FieldValue.serverTimestamp() };
  if (classId) Object.assign(values, { classId, practicalName: classData.practicumName, className: classData.name });
  if (existing) tx.update(ref, values);
  else tx.set(ref, { ...values, status: 'Belum Dibuka', deleted: false, participantIds: [], createdAt: FieldValue.serverTimestamp() });
  if (classRef && !existing) tx.update(classRef, { sessionCount: (classData.sessionCount || 0) + 1 });
  return { sessionId: ref.id };
});
exports.managePracticalClass = handler('Asisten', async ({ db, tx, uid, data }) => {
  if (!['create', 'update', 'delete'].includes(data.action)) policy.fail('Aksi kelas tidak valid.');
  const ref = data.action === 'create' ? db.collection('classes').doc() : db.doc(`classes/${id(data.classId)}`);
  const existing = data.action === 'create' ? null : (await tx.get(ref)).data();
  if (data.action !== 'create' && (!existing || existing.deleted || existing.assistantId !== uid)) policy.fail('Kelas tidak tersedia atau bukan milikmu.');
  if (data.action === 'delete') {
    if (existing.sessionCount > 0) policy.fail('Kelas masih memiliki sesi praktikum dan riwayatnya.');
    tx.update(ref, { deleted: true, updatedAt: FieldValue.serverTimestamp() });
  } else {
    if (typeof data.name !== 'string' || !data.name.trim() || data.name.trim().length > 60 || typeof data.practicumName !== 'string' || !data.practicumName.trim() || data.practicumName.trim().length > 120) policy.fail('Isi nama kelas (maks. 60) dan praktikum (maks. 120 karakter).');
    const values = { name: data.name.trim(), practicumName: data.practicumName.trim(), updatedAt: FieldValue.serverTimestamp() };
    if (existing) tx.update(ref, values);
    else tx.set(ref, { ...values, assistantId: uid, sessionCount: 0, deleted: false, createdAt: FieldValue.serverTimestamp() });
  }
  return { classId: ref.id };
});
exports.joinAssistantClass = handler('Praktikan', async ({ db, tx, uid, profile, data }) => {
  const assistantId = id(data.assistantId);
  const assistant = (await tx.get(db.doc(`users/${assistantId}`))).data();
  if (assistant?.role !== 'Asisten') policy.fail('UID tidak ditemukan atau bukan akun Asprak.');
  const ref = db.doc(`enrollments/${assistantId}_${uid}`);
  if (!(await tx.get(ref)).exists) tx.set(ref, { assistantId, studentId: uid, studentName: profile.name, studentNumber: profile.nim, assistantName: assistant.name, createdAt: FieldValue.serverTimestamp() });
  return { assistantName: assistant.name };
});
exports.changePracticalSession = handler('Asisten', async ctx => {
  const { ref, s } = await owned(ctx);
  const action = ctx.data.action;
  if (!['open', 'close', 'delete'].includes(action)) policy.fail('Aksi tidak valid.');
  if (action === 'open') {
    if (s.status !== 'Belum Dibuka') policy.fail('Sesi sudah dibuka atau selesai.');
    policy.live({ ...s, status: 'Berlangsung' });
  }
  if (action === 'close' && s.status !== 'Berlangsung') policy.fail('Sesi tidak sedang berlangsung.');
  if (action === 'delete' && s.status === 'Berlangsung') policy.fail('Tutup sesi sebelum menghapusnya.');
  ctx.tx.update(ref, { ...(action === 'delete' ? { deleted: true } : { status: action === 'open' ? 'Berlangsung' : 'Selesai' }), updatedAt: FieldValue.serverTimestamp() });
});
exports.generateAttendanceQr = handler('Asisten', async ctx => {
  const { s } = await owned(ctx);
  const now = Date.now();
  const { end } = policy.live(s, now);
  const token = randomBytes(32).toString('hex');
  const expiresAt = Math.min(now + 15 * 60 * 1000, end);
  ctx.tx.set(ctx.db.doc(`attendanceChallenges/${ctx.data.sessionId}`), { assistantId: ctx.uid, tokenHash: hash(token), expiresAt: Timestamp.fromMillis(expiresAt), createdAt: FieldValue.serverTimestamp() });
  return { payload: JSON.stringify({ kind: 'praktiku-attendance', sessionId: ctx.data.sessionId, token }), expiresAt, serverNow: now };
});
exports.submitQrAttendance = handler('Praktikan', async ({ db, tx, uid, profile, data }) => {
  const sessionId = id(data.sessionId);
  if (typeof data.token !== 'string' || !/^[a-f0-9]{64}$/.test(data.token)) policy.fail('Pindai QR presensi dari Asprak.');
  const s = (await tx.get(db.doc(`sessions/${sessionId}`))).data();
  if (!s) policy.fail('Sesi tidak ditemukan.');
  const member = await tx.get(db.doc(`enrollments/${s.assistantId}_${uid}`));
  const challenge = (await tx.get(db.doc(`attendanceChallenges/${sessionId}`))).data();
  const ref = db.doc(`attendance/${sessionId}_${uid}`);
  const existing = await tx.get(ref);
  const permission = (await tx.get(db.doc(`permissions/${sessionId}_${uid}`))).data();
  const now = Date.now();
  policy.live(s, now);
  if (!member.exists) policy.fail('Gabung kelas memakai UID Asprak terlebih dahulu.');
  if (!challenge || challenge.expiresAt.toMillis() <= now || challenge.tokenHash !== hash(data.token)) policy.fail('QR kedaluwarsa atau sudah diganti. Pindai QR terbaru dari Asprak.');
  if (existing.exists) policy.fail('Kehadiranmu sudah tercatat.');
  if (permission?.status === 'Diterima') policy.fail('Kamu sudah memiliki izin yang disetujui untuk sesi ini.');
  policy.locationValid(data.location);
  tx.set(ref, { sessionId, assistantId: s.assistantId, studentId: uid, studentName: profile.name, studentNumber: profile.nim, location: new GeoPoint(data.location.latitude, data.location.longitude), locationAccuracy: data.location.accuracy, createdAt: FieldValue.serverTimestamp() });
});

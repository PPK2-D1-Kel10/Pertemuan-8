const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, getDoc, getDocs, collection, query, where, serverTimestamp, GeoPoint } = require('firebase/firestore');

let env;
const profile = (uid, role = 'Praktikan') => ({ uid, role, email: `${uid}@example.test`, name: `Nama ${uid}`, nim: `NIM-${uid}` });
const session = (status = 'Berlangsung') => ({ practicalName: 'PPK', className: 'A', date: '2026-11-20', startTime: '08:00', endTime: '10:00', participantIds: ['student', 'other'], assistantId: 'assistant', status, deleted: false, createdAt: new Date(), updatedAt: new Date() });
function record(uid = 'student', sessionId = 'S1') { return { studentId: uid, studentName: `Nama ${uid}`, studentNumber: `NIM-${uid}`, sessionId, assistantId: 'assistant', createdAt: serverTimestamp() }; }
// Matches LAB in src/utils/attendanceValidation.ts.
const atLab = new GeoPoint(-7.0483968, 110.4412672);
function attendance(uid = 'student', sessionId = 'S1') { return { ...record(uid, sessionId), location: atLab }; }
function permission(uid = 'student') { return { ...record(uid), reason: 'Saya demam dan perlu berobat ke klinik', status: 'Menunggu Pemeriksaan', aiStatus: 'pending', aiCategory: null, reviewedAt: null, reviewedBy: null }; }
const db = (uid) => env.authenticatedContext(uid, { email: `${uid}@example.test` }).firestore();

before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run with npm run test:rules; never use a production project.');
  env = await initializeTestEnvironment({ projectId: 'demo-praktiku-rules', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const store = context.firestore();
    await Promise.all([
      ...['student', 'other', 'outsider'].map((uid) => setDoc(doc(store, 'users', uid), profile(uid))),
      ...['assistant', 'assistant2'].map((uid) => setDoc(doc(store, 'users', uid), profile(uid, 'Asisten'))),
      ...['student', 'other'].map(uid => setDoc(doc(store, 'enrollments', `assistant_${uid}`), { assistantId: 'assistant', studentId: uid })),
      setDoc(doc(store, 'attendanceChallenges', 'S1'), { assistantId: 'assistant', tokenHash: 'secret' }),
      setDoc(doc(store, 'sessions', 'S1'), session()),
      setDoc(doc(store, 'sessions', 'Closed'), session('Selesai')),
      setDoc(doc(store, 'sessions', 'Future'), session('Belum Dibuka')),
    ]);
  });
});

test('registration permits only an own Praktikan profile; role escalation is rejected', async () => {
  await assertSucceeds(setDoc(doc(db('newuser'), 'users', 'newuser'), profile('newuser')));
  await assertFails(setDoc(doc(db('attacker'), 'users', 'attacker'), profile('attacker', 'Asisten')));
  await assertFails(updateDoc(doc(db('student'), 'users', 'student'), { role: 'Asisten' }));
  await assertFails(setDoc(doc(db('student'), 'users', 'someone'), profile('someone')));
});
test('unauthenticated and unrelated accounts cannot read session data', async () => {
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'sessions', 'S1')));
  await assertFails(getDoc(doc(db('outsider'), 'sessions', 'S1')));
  await assertFails(getDoc(doc(db('assistant2'), 'sessions', 'S1')));
  await assertSucceeds(getDoc(doc(db('student'), 'sessions', 'S1')));
});
test('session queries are scoped to membership or ownership, not all sessions', async () => {
  await assertSucceeds(getDocs(query(collection(db('student'), 'sessions'), where('assistantId', '==', 'assistant'))));
  await assertSucceeds(getDocs(query(collection(db('assistant'), 'sessions'), where('assistantId', '==', 'assistant'))));
  await assertFails(getDocs(collection(db('student'), 'sessions')));
});
test('clients cannot bypass callable session, membership and QR validation', async () => {
  for (const uid of ['student', 'outsider', 'assistant', 'assistant2']) {
    await assertFails(setDoc(doc(db(uid), 'sessions', 'NewSession'), session()));
    await assertFails(updateDoc(doc(db(uid), 'sessions', 'S1'), { status: 'Selesai' }));
    await assertFails(setDoc(doc(db(uid), 'enrollments', `assistant_${uid}`), { assistantId: 'assistant', studentId: uid }));
    await assertFails(getDoc(doc(db(uid), 'attendanceChallenges', 'S1')));
    await assertFails(setDoc(doc(db(uid), 'attendance', `S1_${uid}`), attendance(uid)));
  }
});
test('record history is private and immutable', async () => {
  await env.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), 'attendance', 'S1_student'), attendance()));
  await assertSucceeds(getDoc(doc(db('student'), 'attendance', 'S1_student')));
  await assertSucceeds(getDoc(doc(db('assistant'), 'attendance', 'S1_student')));
  await assertFails(getDoc(doc(db('other'), 'attendance', 'S1_student')));
  await assertFails(updateDoc(doc(db('student'), 'attendance', 'S1_student'), { studentName: 'Forged' }));
});
test('enrollment queries are private to the student or owner', async () => {
  await assertSucceeds(getDocs(query(collection(db('student'), 'enrollments'), where('studentId', '==', 'student'))));
  await assertSucceeds(getDocs(query(collection(db('assistant'), 'enrollments'), where('assistantId', '==', 'assistant'))));
  await assertFails(getDoc(doc(db('outsider'), 'enrollments', 'assistant_student')));
});
test('managed classes are private to their owner and cannot be written directly', async () => {
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'classes', 'C1'), { assistantId: 'assistant', name: 'a1' }));
  await assertSucceeds(getDocs(query(collection(db('assistant'), 'classes'), where('assistantId', '==', 'assistant'))));
  await assertFails(getDoc(doc(db('assistant2'), 'classes', 'C1')));
  await assertFails(getDoc(doc(db('student'), 'classes', 'C1')));
  await assertFails(updateDoc(doc(db('assistant'), 'classes', 'C1'), { name: 'Changed' }));
});
test('attendance and approved leave cannot coexist; review notes are bounded', async () => {
  await setDoc(doc(db('student'), 'permissions', 'S1_student'), permission());
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'attendance', 'S1_student'), attendance()));
  const ref = doc(db('assistant'), 'permissions', 'S1_student');
  const decision = { status: 'Diterima', reviewedBy: 'assistant', reviewedAt: serverTimestamp() };
  await assertFails(updateDoc(ref, decision));
  await assertFails(updateDoc(ref, { ...decision, status: 'Ditolak', reviewNotes: 'x'.repeat(1001) }));
  await assertSucceeds(updateDoc(ref, { ...decision, status: 'Ditolak', reviewNotes: 'Sudah tercatat hadir.' }));
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'attendance', 'S1_other'), attendance('other')));
  await assertFails(setDoc(doc(db('other'), 'permissions', 'S1_other'), permission('other')));
});

test('permissions cannot be duplicated, self-approved or assigned a forged AI classification', async () => {
  const store = db('student');
  const ref = doc(store, 'permissions', 'S1_student');
  await assertFails(setDoc(ref, { ...permission(), status: 'Diterima' }));
  await assertFails(setDoc(ref, { ...permission(), aiCategory: 'Kesehatan', aiStatus: 'completed' }));
  await assertSucceeds(setDoc(ref, permission()));
  await assertFails(setDoc(ref, permission()));
  await assertFails(updateDoc(ref, { status: 'Diterima', reviewedBy: 'student', reviewedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { reason: 'Alasan baru untuk mengganti hasil AI' }));
  await assertFails(getDoc(doc(db('other'), 'permissions', 'S1_student')));
});
test('only assigned assistant can make one auditable decision, even if AI is unavailable', async () => {
  await setDoc(doc(db('student'), 'permissions', 'S1_student'), permission());
  const decision = { status: 'Diterima', reviewedBy: 'assistant', reviewedAt: serverTimestamp() };
  await assertFails(updateDoc(doc(db('assistant2'), 'permissions', 'S1_student'), { ...decision, reviewedBy: 'assistant2' }));
  const ref = doc(db('assistant'), 'permissions', 'S1_student');
  await assertFails(updateDoc(ref, { ...decision, reviewedBy: 'assistant2' }));
  await assertSucceeds(updateDoc(ref, decision));
  await assertFails(updateDoc(ref, { ...decision, status: 'Ditolak' }));
  const saved = (await getDoc(doc(db('student'), 'permissions', 'S1_student'))).data();
  assert.equal(saved.status, 'Diterima');
  assert.equal(saved.aiStatus, 'pending');
});
test('soft deletion prevents new submissions but retains readable history', async () => {
  await setDoc(doc(db('student'), 'permissions', 'S1_student'), permission());
  await env.withSecurityRulesDisabled(async context => updateDoc(doc(context.firestore(), 'sessions', 'S1'), { status: 'Selesai', deleted: true }));
  await assertFails(setDoc(doc(db('other'), 'permissions', 'S1_other'), permission('other')));
  await assertSucceeds(getDoc(doc(db('student'), 'permissions', 'S1_student')));
});

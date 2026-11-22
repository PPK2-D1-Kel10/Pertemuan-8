const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, getDoc, getDocs, collection, query, where, serverTimestamp, runTransaction, GeoPoint } = require('firebase/firestore');

let env;
const profile = (uid, role = 'Praktikan') => ({ uid, role, email: `${uid}@example.test`, name: `Nama ${uid}`, nim: `NIM-${uid}` });
const session = (status = 'Berlangsung') => ({ practicalName: 'PPK', className: 'A', date: '2026-11-20', startTime: '08:00', endTime: '10:00', participantIds: ['student', 'other'], assistantId: 'assistant', status, deleted: false, createdAt: new Date(), updatedAt: new Date() });
function record(uid = 'student', sessionId = 'S1') { return { studentId: uid, studentName: `Nama ${uid}`, studentNumber: `NIM-${uid}`, sessionId, assistantId: 'assistant', createdAt: serverTimestamp() }; }
// Matches LAB in src/utils/attendanceValidation.ts.
const atLab = new GeoPoint(-7.0486, 110.4381);
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
  await assertSucceeds(getDocs(query(collection(db('student'), 'sessions'), where('participantIds', 'array-contains', 'student'))));
  await assertSucceeds(getDocs(query(collection(db('assistant'), 'sessions'), where('assistantId', '==', 'assistant'))));
  await assertFails(getDocs(collection(db('student'), 'sessions')));
});
test('only owner can create, edit, open, close and soft-delete sessions', async () => {
  const store = db('assistant');
  const ref = doc(store, 'sessions', 'NewSession');
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(setDoc(ref, { ...session('Belum Dibuka'), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { practicalName: 'PPK 2', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db('student'), 'sessions', 'NewSession'), { status: 'Berlangsung', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db('assistant2'), 'sessions', 'NewSession'), { status: 'Berlangsung', updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { status: 'Berlangsung', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { participantIds: ['outsider'], updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { status: 'Selesai', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { status: 'Berlangsung', updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { deleted: true, updatedAt: serverTimestamp() }));
});
test('attendance is unique, self-only, timestamped by server and immutable', async () => {
  const store = db('student');
  const ref = doc(store, 'attendance', 'S1_student');
  await assertSucceeds(getDoc(ref));
  await assertFails(setDoc(doc(store, 'attendance', 'S1_other'), attendance('other')));
  await assertFails(setDoc(ref, { ...attendance(), createdAt: new Date('2000-01-01') }));
  await assertSucceeds(setDoc(ref, attendance()));
  await assertFails(setDoc(ref, attendance()));
  await assertFails(updateDoc(ref, { studentName: 'Forged' }));
  await assertFails(getDoc(doc(db('other'), 'attendance', 'S1_student')));
  await assertSucceeds(getDoc(doc(db('assistant'), 'attendance', 'S1_student')));
});
test('presensi is rejected before opening, after closing and for nonparticipants', async () => {
  for (const id of ['Closed', 'Future']) await assertFails(setDoc(doc(db('student'), 'attendance', `${id}_student`), attendance('student', id)));
  await assertFails(setDoc(doc(db('outsider'), 'attendance', 'S1_outsider'), attendance('outsider')));
});
test('attendance requires a device location inside the lab radius', async () => {
  const ref = doc(db('student'), 'attendance', 'S1_student');
  await assertFails(setDoc(ref, record()));
  await assertFails(setDoc(ref, { ...record(), location: new GeoPoint(-7.0486, 110.4400) })); // ~210 m away
  await assertSucceeds(setDoc(ref, { ...record(), location: new GeoPoint(-7.0490, 110.4381) })); // ~45 m away
});
test('simultaneous attendance transactions produce one record', async () => {
  const attempt = async () => {
    const store = db('student');
    const ref = doc(store, 'attendance', 'S1_student');
    await runTransaction(store, async (tx) => {
      const current = await tx.get(ref);
      if (current.exists()) throw new Error('duplicate');
      tx.set(ref, attendance());
    });
  };
  const results = await Promise.allSettled([attempt(), attempt()]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
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
  await updateDoc(doc(db('assistant'), 'sessions', 'S1'), { status: 'Selesai', updatedAt: serverTimestamp() });
  await updateDoc(doc(db('assistant'), 'sessions', 'S1'), { deleted: true, updatedAt: serverTimestamp() });
  await assertFails(setDoc(doc(db('other'), 'permissions', 'S1_other'), permission('other')));
  await assertSucceeds(getDoc(doc(db('student'), 'permissions', 'S1_student')));
});

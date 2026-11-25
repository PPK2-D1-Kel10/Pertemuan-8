const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { Module } = require('node:module');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signOut, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, getDoc, onSnapshot } = require('firebase/firestore');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require('firebase/functions');
const admin = require('../functions/node_modules/firebase-admin');

function loadRepository(client) {
  function load(file) {
    const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const loaded = new Module(file, module);
    loaded.filename = file;
    loaded.paths = module.paths;
    const original = loaded.require.bind(loaded);
    loaded.require = (id) => {
      if (id === './firebase') return { firebase: () => client };
      if (id.startsWith('@/')) return load(path.resolve('src', `${id.slice(2)}.ts`));
      if (id.startsWith('.')) return load(path.resolve(path.dirname(file), `${id}.ts`));
      return original(id);
    };
    loaded._compile(compiled, file);
    return loaded.exports;
  }
  return load(path.resolve('src/services/repository.ts'));
}
function observe(ref, condition) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { unsubscribe(); reject(new Error('Realtime update timed out')); }, 20000);
    const unsubscribe = onSnapshot(ref, (snapshot) => {
      if (snapshot.exists() && condition(snapshot.data())) { clearTimeout(timer); unsubscribe(); resolve(snapshot.data()); }
    }, (error) => { clearTimeout(timer); unsubscribe(); reject(error); });
  });
}

test('actual repository, Auth, realtime Firestore and AI API work together', { timeout: 90000 }, async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST, 'Emulators required');
  const projectId = 'demo-praktiku';
  const adminApp = admin.initializeApp({ projectId });
  const apps = [];
  async function client(name) {
    const app = initializeApp({ projectId, apiKey: 'demo-key', appId: name }, name);
    apps.push(app);
    const auth = getAuth(app);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const db = getFirestore(app);
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    const functions = getFunctions(app, 'asia-southeast2');
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    await createUserWithEmailAndPassword(auth, `${name}-${Date.now()}@example.test`, 'Test-only-12345');
    const context = { app, auth, db, functions };
    const repo = loadRepository(context);
    await repo.createProfile(`Nama ${name}`, `NIM-${name}`);
    return { ...context, repo };
  }
  try {
    const assistant = await client('assistant');
    const student = await client('student');
    const outsider = await client('outsider');
    const absent = await client('absent');
    await adminApp.firestore().doc(`users/${assistant.auth.currentUser.uid}`).update({ role: 'Asisten' });
    const a = (await getDoc(doc(assistant.db, 'users', assistant.auth.currentUser.uid))).data();
    const s = (await getDoc(doc(student.db, 'users', student.auth.currentUser.uid))).data();
    const absentProfile = (await getDoc(doc(absent.db, 'users', absent.auth.currentUser.uid))).data();
    const call = (client, name, data) => httpsCallable(client.functions, name)(data);
    const future = new Date(Date.now() + 7 * 3600000 + 86400000).toISOString().slice(0, 10);
    const input = { practicalName: 'Integrasi PPK', className: 'A', date: future, startTime: '08:00', endTime: '10:00', assistantId: a.uid };
    await assert.rejects(() => call(student, 'savePracticalSession', { input }));
    await assert.rejects(() => call(assistant, 'savePracticalSession', { input: { ...input, date: '2000-01-01' } }));
    await assert.rejects(() => call(assistant, 'savePracticalSession', { input: { ...input, assistantId: s.uid } }));
    await assistant.repo.saveSession(a, input);
    const managed = (await call(assistant, 'managePracticalClass', { action: 'create', name: 'a1', practicumName: 'Kelas merge' })).data;
    await assert.rejects(() => call(student, 'managePracticalClass', { action: 'create', name: 'Fake', practicumName: 'Fake' }));
    await call(assistant, 'managePracticalClass', { action: 'update', classId: managed.classId, name: 'a2', practicumName: 'Kelas merge' });
    await assistant.repo.saveSession(a, { ...input, classId: managed.classId });
    await assert.rejects(() => call(assistant, 'managePracticalClass', { action: 'delete', classId: managed.classId }));
    const emptyClass = (await call(assistant, 'managePracticalClass', { action: 'create', name: 'b1', practicumName: 'Kosong' })).data;
    await call(assistant, 'managePracticalClass', { action: 'delete', classId: emptyClass.classId });
    await assert.rejects(() => student.repo.joinClass(s.uid));
    await student.repo.joinClass(a.uid);
    await student.repo.joinClass(a.uid); // idempotent join
    await absent.repo.joinClass(a.uid);

    const sessions = await adminApp.firestore().collection('sessions').where('assistantId', '==', a.uid).get();
    const id = sessions.docs.find(d => !d.data().classId).id;
    const { LAB } = require('../functions/session-policy.cjs');
    const lab = { latitude: LAB.latitude, longitude: LAB.longitude, accuracy: 10 };
    await assert.rejects(() => assistant.repo.changeSession(id, 'open'));
    await assert.rejects(() => assistant.repo.generateQr(id));
    // Move the fixture into the current server minute; production cannot edit started sessions.
    const parts = ms => new Date(ms + 7 * 3600000).toISOString();
    const now = Date.now();
    const date = parts(now).slice(0, 10);
    await adminApp.firestore().doc(`sessions/${id}`).update({ date, startTime: parts(now).slice(11, 16), endTime: '23:59' });
    const opened = observe(doc(student.db, 'sessions', id), data => data.status === 'Berlangsung');
    await assistant.repo.changeSession(id, 'open');
    await opened;
    await assert.rejects(() => student.repo.generateQr(id));
    const first = await assistant.repo.generateQr(id);
    const firstToken = JSON.parse(first.payload).token;
    assert.ok(first.expiresAt - first.serverNow <= 15 * 60000);
    const second = await assistant.repo.generateQr(id);
    const token = JSON.parse(second.payload).token;
    await assert.rejects(() => student.repo.recordAttendance(s, id, lab, firstToken));
    await assert.rejects(() => outsider.repo.recordAttendance(s, id, lab, token));
    await assert.rejects(() => student.repo.recordAttendance(s, id, { ...lab, latitude: 0, longitude: 0 }, token), /luar radius/);
    await assert.rejects(() => student.repo.recordAttendance(s, id, { ...lab, accuracy: 500 }, token));
    await adminApp.firestore().doc(`attendanceChallenges/${id}`).update({ expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() - 1) });
    await assert.rejects(() => student.repo.recordAttendance(s, id, lab, token), /kedaluwarsa/);
    const third = await assistant.repo.generateQr(id);
    const latestToken = JSON.parse(third.payload).token;
    const attempts = await Promise.allSettled([student.repo.recordAttendance(s, id, lab, latestToken), student.repo.recordAttendance(s, id, lab, latestToken)]);
    assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 1);
    await assert.rejects(() => student.repo.recordAttendance(s, id, lab, latestToken));
    // An open status never extends the scheduled end.
    await adminApp.firestore().doc(`sessions/${id}`).update({ date: '2000-01-01' });
    await assert.rejects(() => assistant.repo.generateQr(id));
    await assert.rejects(() => student.repo.recordAttendance(s, id, lab, latestToken));
    await adminApp.firestore().doc(`sessions/${id}`).update({ date });
    await assert.rejects(() => student.repo.submitPermission(s, id, 'Sudah hadir tidak boleh mengajukan izin'));
    await absent.repo.submitPermission(absentProfile, id, 'Saya mengalami demam batuk dan perlu berobat ke klinik');
    const permissionId = `${id}_${absentProfile.uid}`;
    const classified = await httpsCallable(absent.functions, 'classifyPermission')({ permissionId });
    assert.equal(classified.data.category, 'Kesehatan');
    const saved = await observe(doc(assistant.db, 'permissions', permissionId), (data) => data.aiStatus === 'completed');
    assert.equal(saved.status, 'Menunggu Pemeriksaan');
    assert.equal(saved.reviewedBy, null);
    await assert.rejects(() => httpsCallable(outsider.functions, 'classifyPermission')({ permissionId }));
    const decision = observe(doc(absent.db, 'permissions', permissionId), (data) => data.status === 'Diterima');
    await assistant.repo.reviewPermission(a, permissionId, 'Diterima', 'Semoga lekas pulih');
    assert.equal((await decision).reviewedBy, a.uid);
    assert.equal((await getDoc(doc(absent.db, 'permissions', permissionId))).data().reviewNotes, 'Semoga lekas pulih');
    await assert.rejects(() => absent.repo.recordAttendance(absentProfile, id, lab, latestToken), /izin/);
    await assistant.repo.changeSession(id, 'close');
    await assert.rejects(() => absent.repo.submitPermission(absentProfile, id, 'Pengajuan izin kedua tidak boleh dibuat'));
    const email = absent.auth.currentUser.email;
    await signOut(absent.auth);
    await signInWithEmailAndPassword(absent.auth, email, 'Test-only-12345');
    assert.equal((await getDoc(doc(absent.db, 'permissions', permissionId))).data().status, 'Diterima');
    await assistant.repo.changeSession(id, 'delete');
    assert.equal((await getDoc(doc(student.db, 'attendance', `${id}_${s.uid}`))).data().studentId, s.uid);
  } finally {
    await Promise.all(apps.map(deleteApp));
    await adminApp.delete();
  }
});

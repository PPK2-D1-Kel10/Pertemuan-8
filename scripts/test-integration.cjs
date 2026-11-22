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
    await adminApp.firestore().doc(`users/${assistant.auth.currentUser.uid}`).update({ role: 'Asisten' });
    const a = (await getDoc(doc(assistant.db, 'users', assistant.auth.currentUser.uid))).data();
    const s = (await getDoc(doc(student.db, 'users', student.auth.currentUser.uid))).data();
    await assistant.repo.saveSession(a, { practicalName: 'Integrasi PPK', className: 'A', date: '2026-11-20', startTime: '08:00', endTime: '10:00', participantIds: [s.uid] });
    const sessions = await adminApp.firestore().collection('sessions').where('assistantId', '==', a.uid).get();
    const id = sessions.docs[0].id;
    const lab = { latitude: -7.0486, longitude: 110.4381 };
    await assert.rejects(() => student.repo.recordAttendance(s, id, lab));
    const opened = observe(doc(student.db, 'sessions', id), (data) => data.status === 'Berlangsung');
    await assistant.repo.changeSession(id, 'open');
    await opened;
    await assert.rejects(() => student.repo.recordAttendance(s, id, { latitude: 0, longitude: 0 }), /luar radius/);
    await student.repo.recordAttendance(s, id, lab);
    await assert.rejects(() => student.repo.recordAttendance(s, id, lab));
    await student.repo.submitPermission(s, id, 'Saya mengalami demam batuk dan perlu berobat ke klinik');
    const permissionId = `${id}_${s.uid}`;
    const classified = await httpsCallable(student.functions, 'classifyPermission')({ permissionId });
    assert.equal(classified.data.category, 'Kesehatan');
    const saved = await observe(doc(assistant.db, 'permissions', permissionId), (data) => data.aiStatus === 'completed');
    assert.equal(saved.status, 'Menunggu Pemeriksaan');
    assert.equal(saved.reviewedBy, null);
    await assert.rejects(() => httpsCallable(outsider.functions, 'classifyPermission')({ permissionId }));
    const decision = observe(doc(student.db, 'permissions', permissionId), (data) => data.status === 'Diterima');
    await assistant.repo.reviewPermission(a, permissionId, 'Diterima');
    assert.equal((await decision).reviewedBy, a.uid);
    await assistant.repo.changeSession(id, 'close');
    await assert.rejects(() => student.repo.submitPermission(s, id, 'Pengajuan izin kedua tidak boleh dibuat'));
    const email = student.auth.currentUser.email;
    await signOut(student.auth);
    await signInWithEmailAndPassword(student.auth, email, 'Test-only-12345');
    assert.equal((await getDoc(doc(student.db, 'permissions', permissionId))).data().status, 'Diterima');
    await assistant.repo.changeSession(id, 'delete');
    assert.equal((await getDoc(doc(student.db, 'attendance', permissionId))).data().studentId, s.uid);
  } finally {
    await Promise.all(apps.map(deleteApp));
    await adminApp.delete();
  }
});

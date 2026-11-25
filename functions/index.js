const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { classify } = require('./classifier.cjs');

initializeApp();
Object.assign(exports, require('./attendance.cjs'));
const db = getFirestore();
const region = 'asia-southeast2';

async function classifyStoredPermission(id) {
  const ref = db.collection('permissions').doc(id);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Pengajuan tidak ditemukan.');
    const data = snapshot.data();
    if (data.aiStatus === 'completed') return { category: data.aiCategory };
    const result = classify(data.reason);
    // Never modify status, reviewedBy or reviewedAt: only a human assistant decides.
    tx.update(ref, { aiStatus: 'completed', aiCategory: result.category, aiModelVersion: result.modelVersion, aiUpdatedAt: FieldValue.serverTimestamp() });
    return result;
  });
}

exports.analyzeNewPermission = onDocumentCreated({ document: 'permissions/{id}', region, maxInstances: 5, retry: true }, async (event) => {
  if (!event.data) return;
  try { await classifyStoredPermission(event.params.id); }
  catch (error) {
    // Keep the submitted request and any human decision even if classification fails.
    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(event.data.ref);
      if (snapshot.exists && snapshot.data().aiStatus !== 'completed') tx.update(event.data.ref, { aiStatus: 'failed', aiUpdatedAt: FieldValue.serverTimestamp() });
    });
    console.error('Classification failed', { permissionId: event.params.id, code: error.code ?? 'model-error' });
  }
});

exports.classifyPermission = onCall({ region, maxInstances: 5, timeoutSeconds: 30 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Silakan masuk.');
  const id = request.data?.permissionId;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,300}$/.test(id)) throw new HttpsError('invalid-argument', 'ID pengajuan tidak valid.');
  const [snapshot, profile] = await Promise.all([db.collection('permissions').doc(id).get(), db.collection('users').doc(request.auth.uid).get()]);
  if (!snapshot.exists) throw new HttpsError('not-found', 'Pengajuan tidak ditemukan.');
  const data = snapshot.data();
  if (data.studentId !== request.auth.uid && !(profile.data()?.role === 'Asisten' && data.assistantId === request.auth.uid)) throw new HttpsError('permission-denied', 'Pengajuan ini bukan milikmu.');
  return classifyStoredPermission(id);
});

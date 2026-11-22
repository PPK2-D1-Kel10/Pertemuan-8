import { collection, doc, GeoPoint, runTransaction, serverTimestamp } from 'firebase/firestore';
import { firebase } from './firebase';
import type { Profile, SessionInput, CloudSession, PermissionStatus } from '@/types/cloud';
import { validateLabRadius, type Coordinates } from '@/utils/attendanceValidation';
import { validateProfile, validateReason, validateSession } from '@/utils/inputValidation';

export async function createProfile(name: string, nim: string) {
  validateProfile(name, nim);
  const { auth, db } = firebase();
  if (!auth.currentUser?.email) throw new Error('Silakan masuk terlebih dahulu.');
  const { uid, email } = auth.currentUser;
  const ref = doc(db, 'users', uid);
  await runTransaction(db, async (tx) => {
    if ((await tx.get(ref)).exists()) return;
    tx.set(ref, { uid, email, name: name.trim(), nim: nim.trim(), role: 'Praktikan' });
  });
}

export async function saveSession(profile: Profile, input: SessionInput, id?: string) {
  validateSession(input);
  if (profile.role !== 'Asisten') throw new Error('Hanya Asisten yang dapat mengelola sesi.');
  const { db } = firebase();
  const ref = id ? doc(db, 'sessions', id) : doc(collection(db, 'sessions'));
  await runTransaction(db, async (tx) => {
    const current = await tx.get(ref);
    if (id && (!current.exists() || current.data().deleted)) throw new Error('Sesi tidak tersedia.');
    if (current.exists() && (current.data().assistantId !== profile.uid || current.data().status !== 'Belum Dibuka')) throw new Error('Hanya sesi milikmu yang belum dibuka yang dapat diubah.');
    // Validate participant identities before any write. Profiles cannot be self-promoted.
    for (const uid of input.participantIds) {
      const participant = await tx.get(doc(db, 'users', uid));
      if (!participant.exists() || participant.data().role !== 'Praktikan') throw new Error(`UID peserta tidak ditemukan atau bukan Praktikan: ${uid}`);
    }
    const values = { ...input, practicalName: input.practicalName.trim(), className: input.className.trim(), participantIds: [...new Set(input.participantIds)], updatedAt: serverTimestamp() };
    if (id) tx.update(ref, values);
    else tx.set(ref, { ...values, assistantId: profile.uid, status: 'Belum Dibuka', deleted: false, createdAt: serverTimestamp() });
  });
}

export async function changeSession(id: string, action: 'open' | 'close' | 'delete') {
  const { db } = firebase();
  const ref = doc(db, 'sessions', id);
  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists() || snapshot.data().deleted) throw new Error('Sesi tidak tersedia.');
    const status = snapshot.data().status;
    if (action === 'open' && status !== 'Belum Dibuka') throw new Error('Sesi sudah dibuka atau selesai.');
    if (action === 'close' && status !== 'Berlangsung') throw new Error('Sesi tidak sedang berlangsung.');
    if (action === 'delete' && status === 'Berlangsung') throw new Error('Tutup sesi sebelum menghapusnya.');
    // Soft deletion retains the audit trail and does not orphan attendance/permission records.
    tx.update(ref, { ...(action === 'delete' ? { deleted: true } : { status: action === 'open' ? 'Berlangsung' : 'Selesai' }), updatedAt: serverTimestamp() });
  });
}

export async function recordAttendance(profile: Profile, sessionId: string, location: Coordinates) {
  const radius = validateLabRadius(location);
  if (!radius.valid) throw new Error(radius.message);
  const { db } = firebase();
  const ref = doc(db, 'attendance', `${sessionId}_${profile.uid}`);
  await runTransaction(db, async (tx) => {
    const session = await tx.get(doc(db, 'sessions', sessionId));
    const existing = await tx.get(ref);
    if (!session.exists()) throw new Error('Sesi tidak ditemukan.');
    const data = session.data() as CloudSession;
    if (data.deleted || data.status !== 'Berlangsung') throw new Error('Sesi belum dibuka atau sudah ditutup.');
    if (!data.participantIds.includes(profile.uid)) throw new Error('Kamu bukan peserta sesi ini.');
    if (existing.exists()) throw new Error('Kehadiranmu sudah tercatat.');
    tx.set(ref, {
      sessionId, assistantId: data.assistantId, studentId: profile.uid, studentName: profile.name, studentNumber: profile.nim,
      location: new GeoPoint(location.latitude, location.longitude), createdAt: serverTimestamp(),
    });
  });
}

export async function submitPermission(profile: Profile, sessionId: string, reason: string) {
  validateReason(reason);
  const { db } = firebase();
  const ref = doc(db, 'permissions', `${sessionId}_${profile.uid}`);
  await runTransaction(db, async (tx) => {
    const session = await tx.get(doc(db, 'sessions', sessionId));
    const existing = await tx.get(ref);
    if (!session.exists() || session.data().deleted) throw new Error('Sesi tidak tersedia.');
    if (!session.data().participantIds.includes(profile.uid)) throw new Error('Kamu bukan peserta sesi ini.');
    if (existing.exists()) throw new Error('Kamu sudah mengajukan izin untuk sesi ini.');
    tx.set(ref, {
      sessionId, assistantId: session.data().assistantId, studentId: profile.uid, studentName: profile.name, studentNumber: profile.nim,
      reason: reason.trim(), status: 'Menunggu Pemeriksaan', createdAt: serverTimestamp(),
      aiStatus: 'pending', aiCategory: null, reviewedAt: null, reviewedBy: null,
    });
  });
}

export async function reviewPermission(profile: Profile, id: string, status: Exclude<PermissionStatus, 'Menunggu Pemeriksaan'>) {
  const { db } = firebase();
  const ref = doc(db, 'permissions', id);
  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists()) throw new Error('Pengajuan tidak ditemukan.');
    if (snapshot.data().status !== 'Menunggu Pemeriksaan') throw new Error('Pengajuan sudah diperiksa.');
    tx.update(ref, { status, reviewedBy: profile.uid, reviewedAt: serverTimestamp() });
  });
}

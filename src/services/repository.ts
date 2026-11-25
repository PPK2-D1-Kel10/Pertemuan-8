import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { firebase } from './firebase';
import type { Profile, SessionInput, PermissionStatus } from '@/types/cloud';
import { type Coordinates } from '@/utils/attendanceValidation';
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
  if (input.assistantId !== profile.uid) throw new Error('Masukkan UID Asprak milik akun yang sedang login.');
  await httpsCallable(firebase().functions, 'savePracticalSession')({ input, ...(id ? { sessionId: id } : {}) });
}
export async function changeSession(id: string, action: 'open' | 'close' | 'delete') {
  await httpsCallable(firebase().functions, 'changePracticalSession')({ sessionId: id, action });
}
export async function joinClass(assistantId: string) {
  await httpsCallable(firebase().functions, 'joinAssistantClass')({ assistantId: assistantId.trim() });
}
export type AttendanceQr = { payload: string; expiresAt: number; serverNow: number };
export async function generateQr(sessionId: string) {
  const result = await httpsCallable<{ sessionId: string }, AttendanceQr>(firebase().functions, 'generateAttendanceQr')({ sessionId });
  return result.data;
}
export async function recordAttendance(profile: Profile, sessionId: string, location: Coordinates, token: string) {
  await httpsCallable(firebase().functions, 'submitQrAttendance')({ sessionId, location, token });
}

export async function submitPermission(profile: Profile, sessionId: string, reason: string) {
  validateReason(reason);
  const { db } = firebase();
  const ref = doc(db, 'permissions', `${sessionId}_${profile.uid}`);
  await runTransaction(db, async (tx) => {
    const session = await tx.get(doc(db, 'sessions', sessionId));
    const existing = await tx.get(ref);
    if (!session.exists() || session.data().deleted) throw new Error('Sesi tidak tersedia.');
    if (existing.exists()) throw new Error('Kamu sudah mengajukan izin untuk sesi ini.');
    tx.set(ref, {
      sessionId, assistantId: session.data().assistantId, studentId: profile.uid, studentName: profile.name, studentNumber: profile.nim,
      reason: reason.trim(), status: 'Menunggu Pemeriksaan', createdAt: serverTimestamp(),
      aiStatus: 'pending', aiCategory: null, reviewedAt: null, reviewedBy: null,
    });
  });
}

export async function reviewPermission(profile: Profile, id: string, status: Exclude<PermissionStatus, 'Menunggu Pemeriksaan'>, reviewNotes = '') {
  if (reviewNotes.trim().length > 1000) throw new Error('Catatan maksimal 1000 karakter.');
  const { db } = firebase();
  const ref = doc(db, 'permissions', id);
  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists()) throw new Error('Pengajuan tidak ditemukan.');
    if (snapshot.data().status !== 'Menunggu Pemeriksaan') throw new Error('Pengajuan sudah diperiksa.');
    tx.update(ref, { status, reviewNotes: reviewNotes.trim(), reviewedBy: profile.uid, reviewedAt: serverTimestamp() });
  });
}

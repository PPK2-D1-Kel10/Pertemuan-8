import type { AttendanceRecord, PracticalSession, UserRole } from '../types';

type AttendanceInput = {
  studentId: string;
  role: UserRole;
  session: PracticalSession | undefined;
  attendance: readonly AttendanceRecord[];
  permissions?: readonly { sessionId: string; studentId: string; status: string }[];
};

export type AttendanceValidationResult =
  | { valid: true }
  | { valid: false; code: 'identity' | 'role' | 'session' | 'duplicate' | 'unopened' | 'closed' | 'leave_conflict'; message: string };

// Shared by the UI and reducer; the reducer always checks the latest state.
export function validateAttendance({ studentId, role, session, attendance, permissions = [] }: AttendanceInput): AttendanceValidationResult {
  if (!studentId.trim()) return { valid: false, code: 'identity', message: 'Identitas Praktikan tidak valid. Silakan login kembali.' };
  if (role !== 'Praktikan') return { valid: false, code: 'role', message: 'Presensi hanya tersedia untuk Praktikan.' };
  if (!session) return { valid: false, code: 'session', message: 'Sesi praktikum tidak ditemukan.' };
  if (permissions.some(p => p.sessionId === session.id && p.studentId === studentId && p.status === 'Diterima')) return { valid: false, code: 'leave_conflict', message: 'Presensi ditolak karena izin untuk sesi ini sudah disetujui.' };
  if (attendance.some((record) => record.sessionId === session.id && record.studentId === studentId)) {
    return { valid: false, code: 'duplicate', message: 'Kehadiranmu sudah tercatat untuk sesi ini.' };
  }
  if (session.status === 'Belum Dibuka') return { valid: false, code: 'unopened', message: 'Tunggu asisten membuka sesi presensi.' };
  if (session.status !== 'Berlangsung') return { valid: false, code: 'closed', message: 'Sesi sudah ditutup. Hubungi asisten jika ada kendala presensi.' };
  return { valid: true };
}

export type Coordinates = { latitude: number; longitude: number; accuracy?: number | null; mocked?: boolean };

// Keep synchronized with functions/session-policy.cjs.
export const LAB = { name: 'FSM UNDIP', latitude: -7.0483968, longitude: 110.4412672, radiusMeters: 1000 };

// Haversine great-circle distance in meters.
export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export function validateLabRadius(position: Coordinates) {
  const distance = distanceMeters(LAB, position);
  const rounded = Math.round(distance);
  return distance <= LAB.radiusMeters
    ? { valid: true as const, distance: rounded }
    : { valid: false as const, distance: rounded, message: `Kamu berada di luar radius laboratorium (${rounded} m dari ${LAB.name}, maksimal ${LAB.radiusMeters} m).` };
}

export function formatAttendanceTime(date: Date): string {
  return date.toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).replaceAll('.', ':');
}

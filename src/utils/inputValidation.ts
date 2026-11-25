import type { SessionInput } from '../types/cloud';

export function validateProfile(name: string, nim: string) {
  if (name.trim().length < 2 || name.trim().length > 100) throw new Error('Nama harus berisi 2–100 karakter.');
  if (!/^[a-zA-Z0-9._-]{3,30}$/.test(nim.trim())) throw new Error('NIM harus berisi 3–30 huruf/angka, titik, garis bawah, atau tanda hubung.');
}
export function validateSession(input: SessionInput) {
  if (!input.practicalName.trim() || input.practicalName.trim().length > 120) throw new Error('Nama praktikum wajib diisi, maksimal 120 karakter.');
  if (!input.className.trim() || input.className.trim().length > 60) throw new Error('Kelas wajib diisi, maksimal 60 karakter.');
  const parsed = new Date(`${input.date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== input.date) throw new Error('Tanggal harus valid dengan format YYYY-MM-DD.');
  if (![input.startTime, input.endTime].every((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)) || input.endTime <= input.startTime) throw new Error('Gunakan waktu HH:mm (WIB), dengan waktu selesai setelah mulai pada hari yang sama.');
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(input.assistantId)) throw new Error('Isi UID Asprak yang valid.');
  if (Date.parse(`${input.date}T${input.startTime}:00+07:00`) <= Date.now()) throw new Error('Tanggal dan jam mulai harus setelah waktu sekarang (WIB).');
}
export function validateReason(reason: string) {
  if (reason.trim().length < 10 || reason.trim().length > 2000) throw new Error('Alasan izin harus berisi 10–2000 karakter.');
}

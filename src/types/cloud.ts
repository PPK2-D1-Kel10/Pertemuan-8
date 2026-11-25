import type { Timestamp } from 'firebase/firestore';
import type { PracticalSession, AttendanceRecord } from './index';

export type Profile = { uid: string; email: string; name: string; nim: string; role: 'Praktikan' | 'Asisten' };
export type Enrollment = { assistantId: string; studentId: string; studentName: string; studentNumber: string; assistantName: string; createdAt: Timestamp | null };
export type PracticumClass = { id: string; name: string; practicumName: string; assistantId: string; sessionCount: number; deleted: boolean };
export type SessionInput = Pick<PracticalSession, 'practicalName' | 'className' | 'date' | 'startTime' | 'endTime'> & { assistantId: string; classId?: string };
export type CloudSession = PracticalSession & { assistantId: string; classId?: string; participantIds?: string[]; deleted: boolean };
export type CloudAttendance = AttendanceRecord & { assistantId: string; studentNumber: string; createdAt: Timestamp | null };
export type PermissionStatus = 'Menunggu Pemeriksaan' | 'Diterima' | 'Ditolak';
export type PermissionRequest = {
  id: string; sessionId: string; assistantId: string; studentId: string; studentName: string; studentNumber: string;
  reason: string; status: PermissionStatus; createdAt: Timestamp | null;
  aiStatus: 'pending' | 'completed' | 'failed'; aiCategory: string | null;
  reviewedAt: Timestamp | null; reviewedBy: string | null;
  reviewNotes?: string; aiConfidence?: number; aiExplanation?: string; aiModelVersion?: string;
};

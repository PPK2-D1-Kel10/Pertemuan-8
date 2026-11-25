// Sprint-2 class management adapted to the existing UID-based membership model.
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { firebase } from './firebase';
import type { PracticumClass } from '@/types/cloud';
export async function createClass(data: { name: string; practicumName: string; assistantUid: string; assistantName?: string }) {
  await httpsCallable(firebase().functions, 'managePracticalClass')({ action: 'create', name: data.name, practicumName: data.practicumName });
}
export async function updateClass(classId: string, data: { name: string; practicumName: string }) {
  await httpsCallable(firebase().functions, 'managePracticalClass')({ action: 'update', classId, ...data });
}
export async function deleteClass(classId: string) {
  await httpsCallable(firebase().functions, 'managePracticalClass')({ action: 'delete', classId });
}
export function subscribeClasses(callback: (classes: PracticumClass[]) => void, assistantUid: string, onError: (error: Error) => void) {
  return onSnapshot(query(collection(firebase().db, 'classes'), where('assistantId', '==', assistantUid)), snap => {
    callback(snap.docs.filter(d => !d.data().deleted).map(d => ({ ...d.data(), id: d.id }) as PracticumClass));
  }, onError);
}

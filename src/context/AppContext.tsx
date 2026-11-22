import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { firebase, firebaseConfigured } from '@/services/firebase';
import { errorMessage } from '@/services/errors';
import * as repository from '@/services/repository';
import type { CloudAttendance, CloudSession, PermissionRequest, PermissionStatus, Profile, SessionInput } from '@/types/cloud';
import { formatAttendanceTime, type Coordinates } from '@/utils/attendanceValidation';
import { validateProfile } from '@/utils/inputValidation';

type Action = { type: 'logout' } | { type: 'open' | 'close'; sessionId: string } | { type: 'attend'; sessionId: string; location: Coordinates };
type State = { username: string; role: Profile['role'] | null; sessions: CloudSession[]; attendance: CloudAttendance[] };
type AppValue = {
  state: State; profile: Profile | null; user: User | null; permissions: PermissionRequest[];
  ready: boolean; loading: boolean; busy: boolean; offline: boolean; cached: boolean; error: string;
  configured: boolean; retry: () => void;
  dispatch: (action: Action) => Promise<boolean>;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, name: string, nim: string) => Promise<boolean>;
  completeProfile: (name: string, nim: string) => Promise<boolean>;
  resetPassword: (email: string) => Promise<boolean>;
  saveSession: (input: SessionInput, id?: string) => Promise<boolean>;
  deleteSession: (id: string) => Promise<boolean>;
  submitPermission: (sessionId: string, reason: string) => Promise<boolean>;
  reviewPermission: (id: string, status: Exclude<PermissionStatus, 'Menunggu Pemeriksaan'>) => Promise<boolean>;
  retryClassification: (id: string) => Promise<boolean>;
};
const AppContext = createContext<AppValue | null>(null);

export function AppProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<CloudSession[]>([]);
  const [attendance, setAttendance] = useState<CloudAttendance[]>([]);
  const [permissions, setPermissions] = useState<PermissionRequest[]>([]);
  const [ready, setReady] = useState(!firebaseConfigured);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const lock = useRef(false);

  useEffect(() => NetInfo.addEventListener((info) => setOffline(info.isConnected === false || info.isInternetReachable === false)), []);
  useEffect(() => {
    if (!firebaseConfigured) return;
    let unsubscribeProfile = () => {};
    let generation = 0;
    let unsubscribeAuth = () => {};
    try {
      const { auth, db } = firebase();
      unsubscribeAuth = onAuthStateChanged(auth, (next) => {
        const current = ++generation;
        let lastProfileKey = '';
        unsubscribeProfile();
        setUser(next); setProfile(null); setSessions([]); setAttendance([]); setPermissions([]); setError('');
        setLoading(!!next);
        if (!next) { setReady(true); return; }
        setReady(false);
        unsubscribeProfile = onSnapshot(doc(db, 'users', next.uid), (snapshot) => {
          if (current !== generation) return;
          const nextProfile = snapshot.exists() ? snapshot.data() as Profile : null;
          const key = nextProfile ? `${nextProfile.uid}:${nextProfile.role}` : '';
          if (key !== lastProfileKey) {
            setSessions([]); setAttendance([]); setPermissions([]); setLoading(!!nextProfile);
            lastProfileKey = key;
          }
          if (!nextProfile) setLoading(false);
          setProfile(nextProfile);
          setReady(true);
        }, (err) => { if (current === generation) { setError(errorMessage(err)); setReady(true); } });
      }, (err) => { setError(errorMessage(err)); setReady(true); });
    } catch (err) {
      void Promise.resolve().then(() => { if (generation === 0) { setError(errorMessage(err)); setReady(true); } });
    }
    return () => { generation++; unsubscribeAuth(); unsubscribeProfile(); };
  }, [revision]);

  const uid = profile?.uid;
  const role = profile?.role;
  useEffect(() => {
    if (!uid || !role) return;
    const { db } = firebase();
    let active = true;
    const loaded = new Set<string>();
    const caches = new Map<string, boolean>();
    const failure = (err: unknown) => { if (active) { setError(errorMessage(err)); setLoading(false); } };
    const mark = (name: string, fromCache: boolean) => {
      loaded.add(name); caches.set(name, fromCache);
      setCached([...caches.values()].some(Boolean));
      if (loaded.size === 3) setLoading(false);
    };
    const assistant = role === 'Asisten';
    const unsubscribers = [
      onSnapshot(query(collection(db, 'sessions'), where(assistant ? 'assistantId' : 'participantIds', assistant ? '==' : 'array-contains', uid)), { includeMetadataChanges: true }, (snap) => {
        if (!active) return;
        setSessions(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as CloudSession).sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)));
        mark('sessions', snap.metadata.fromCache);
      }, failure),
      onSnapshot(query(collection(db, 'attendance'), where(assistant ? 'assistantId' : 'studentId', '==', uid)), { includeMetadataChanges: true }, (snap) => {
        if (!active) return;
        setAttendance(snap.docs.map((d) => {
          const data = d.data();
          return { ...data, id: d.id, attendanceTime: data.createdAt?.toDate ? formatAttendanceTime(data.createdAt.toDate()) : 'Menunggu server' } as CloudAttendance;
        }));
        mark('attendance', snap.metadata.fromCache);
      }, failure),
      onSnapshot(query(collection(db, 'permissions'), where(assistant ? 'assistantId' : 'studentId', '==', uid)), { includeMetadataChanges: true }, (snap) => {
        if (!active) return;
        setPermissions(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as PermissionRequest).sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)));
        mark('permissions', snap.metadata.fromCache);
      }, failure),
    ];
    return () => { active = false; unsubscribers.forEach((unsubscribe) => unsubscribe()); };
  }, [uid, role, revision]);

  async function perform(operation: () => Promise<unknown>, allowOffline = false) {
    if (lock.current) return false;
    if (offline && !allowOffline) { setError('Koneksi terputus. Sambungkan internet lalu coba lagi; perubahan belum disimpan.'); return false; }
    lock.current = true; setBusy(true); setError('');
    try { await operation(); return true; }
    catch (err) { setError(errorMessage(err)); return false; }
    finally { lock.current = false; setBusy(false); }
  }
  function requireProfile() {
    if (!profile || firebase().auth.currentUser?.uid !== profile.uid) throw new Error('Silakan masuk dan lengkapi profil terlebih dahulu.');
    return profile;
  }
  async function dispatch(action: Action) {
    return perform(async () => {
      if (action.type === 'logout') { await signOut(firebase().auth); return; }
      const current = requireProfile();
      if (action.type === 'attend') await repository.recordAttendance(current, action.sessionId, action.location);
      else await repository.changeSession(action.sessionId, action.type);
    }, action.type === 'logout');
  }
  return <AppContext.Provider value={{
    state: { username: user?.uid ?? '', role: profile?.role ?? null, sessions, attendance },
    user, profile, permissions, ready, loading, busy, offline, cached, error, configured: firebaseConfigured,
    retry: () => { setError(''); setRevision((n) => n + 1); }, dispatch,
    login: (email, password) => perform(async () => {
      if (!email.trim() || !password) throw new Error('Isi email dan kata sandi.');
      await signInWithEmailAndPassword(firebase().auth, email.trim(), password);
    }),
    register: (email, password, name, nim) => perform(async () => {
      validateProfile(name, nim);
      if (!email.trim() || password.length < 8) throw new Error('Isi email dan kata sandi minimal 8 karakter.');
      await createUserWithEmailAndPassword(firebase().auth, email.trim(), password);
      await repository.createProfile(name, nim);
    }),
    completeProfile: (name, nim) => perform(() => repository.createProfile(name, nim)),
    resetPassword: (email) => perform(async () => {
      if (!email.trim()) throw new Error('Isi email terlebih dahulu.');
      await sendPasswordResetEmail(firebase().auth, email.trim());
    }),
    saveSession: (input, id) => perform(() => repository.saveSession(requireProfile(), input, id)),
    deleteSession: (id) => perform(() => repository.changeSession(id, 'delete')),
    submitPermission: (sessionId, reason) => perform(async () => {
      const current = requireProfile();
      await repository.submitPermission(current, sessionId, reason);
      // The submission is already durable. A failed API must not turn it into a failed submission.
      try {
        await httpsCallable(firebase().functions, 'classifyPermission', { timeout: 10000 })({ permissionId: `${sessionId}_${current.uid}` });
      } catch { /* The background trigger or the explicit retry button can classify it later. */ }
    }),
    reviewPermission: (id, status) => perform(() => repository.reviewPermission(requireProfile(), id, status)),
    retryClassification: (id) => perform(async () => {
      requireProfile();
      await httpsCallable(firebase().functions, 'classifyPermission')({ permissionId: id });
    }),
  }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp harus digunakan di dalam AppProvider.');
  return value;
}

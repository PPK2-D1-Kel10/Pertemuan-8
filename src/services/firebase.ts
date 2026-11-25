import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, initializeFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { initializePersistentAuth } from './persistentAuth';

export const useEmulators = process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === 'true';
const config = useEmulators ? {
  apiKey: 'demo-api-key', authDomain: 'demo-praktiku.firebaseapp.com', projectId: 'demo-praktiku', appId: 'demo-praktiku-app',
} : {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

let instance: { auth: Auth; db: Firestore; functions: Functions } | undefined;
export const firebaseConfigured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
export function firebase() {
  if (!firebaseConfigured) throw new Error('Konfigurasi Firebase belum diisi. Ikuti FIREBASE_SETUP.md dan isi .env.local, lalu restart Expo.');
  if (!instance) {
    const existing = getApps().length > 0;
    const app = existing ? getApp() : initializeApp(config);
    const auth = existing ? getAuth(app) : initializePersistentAuth(app);
    const db = existing ? getFirestore(app) : initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
    const functions = getFunctions(app, 'asia-southeast2');
    if (useEmulators && !existing) {
      const host = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || '127.0.0.1';
      connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
      connectFirestoreEmulator(db, host, 8080);
      connectFunctionsEmulator(functions, host, 5001);
    }
    instance = { auth, db, functions };
  }
  return instance;
}

import 'server-only';
import admin from 'firebase-admin';

// Lazy init to prevent build-time evaluation error when env vars are absent during static analysis.
let _app: any | undefined;

function ensureApp() {
  if (_app) return _app;
  if (admin.apps.length) {
    _app = admin.app();
    return _app;
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
  // Only init if we actually have creds; otherwise throw at runtime usage (API route) not during build.
  if (!projectId || !clientEmail || !privateKeyRaw) {
    throw new Error('Firebase Admin not configured');
  }
  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
  _app = admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    storageBucket,
  });
  return _app;
}

export function getAdmin() {
  return ensureApp();
}

export const adminDb = () => admin.firestore(getAdmin());
export const adminStorage = () => admin.storage(getAdmin());

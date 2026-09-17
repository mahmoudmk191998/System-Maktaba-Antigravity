import admin from 'firebase-admin';
import { env } from './environment.js';
import fs from 'fs';

let firestoreInstance: admin.firestore.Firestore | null = null;
let authInstance: admin.auth.Auth | null = null;

export function initFirebaseAdmin(): { db: admin.firestore.Firestore; auth: admin.auth.Auth } {
  if (admin.apps.length > 0) {
    return {
      db: admin.firestore(),
      auth: admin.auth(),
    };
  }

  try {
    if (env.FIREBASE_SERVICE_ACCOUNT_PATH && fs.existsSync(env.FIREBASE_SERVICE_ACCOUNT_PATH)) {
      const serviceAccount = JSON.parse(fs.readFileSync(env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
      // Fix private key formatting if it has escaped \n
      const privateKey = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: env.FIREBASE_PROJECT_ID,
          clientEmail: env.FIREBASE_CLIENT_EMAIL,
          privateKey,
        }),
      });
    } else if (env.NODE_ENV === 'test') {
      // In testing without live credentials, initialize with project ID or mock
      admin.initializeApp({
        projectId: 'test-rms-project',
      });
    } else {
      // Attempt Application Default Credentials (e.g. on GCP/Cloud Run)
      admin.initializeApp();
    }

    firestoreInstance = admin.firestore();
    authInstance = admin.auth();
    console.log('✅ Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.warn('⚠️ Firebase Admin SDK initialization warning:', (error as Error).message);
    // If running in test mode without Firebase emulator, provide fallback references
    if (env.NODE_ENV === 'test') {
      try {
        if (!admin.apps.length) admin.initializeApp({ projectId: 'test-rms' });
      } catch (_) {}
    }
  }

  return {
    db: admin.firestore(),
    auth: admin.auth(),
  };
}

export const getFirestoreDb = (): admin.firestore.Firestore => {
  if (!firestoreInstance) {
    const { db } = initFirebaseAdmin();
    firestoreInstance = db;
  }
  return firestoreInstance;
};

export const getFirebaseAuth = (): admin.auth.Auth => {
  if (!authInstance) {
    const { auth } = initFirebaseAdmin();
    authInstance = auth;
  }
  return authInstance;
};

import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getEnv } from './env';

function initializeFirebaseApp() {
  const env = getEnv();

  // If already initialized, return the existing app instance
  if (getApps().length > 0) {
    return getApps()[0];
  }

  // To handle escaped newlines in the private key from env variables
  const privateKey = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

  return initializeApp({
    credential: cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

const app = initializeFirebaseApp();
export const db = getFirestore(app);

import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getEnv } from './env';

function getDbInstance(): Firestore | null {
  if (getApps().length > 0) {
    return getFirestore(getApps()[0]);
  }
  try {
    const env = getEnv();
    const privateKey = (env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, '\n');
    const app = initializeApp({
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });
    return getFirestore(app);
  } catch (err) {
    console.warn("Firebase Admin lazy init warning:", err);
    return null;
  }
}

export const db: Firestore = new Proxy({} as Firestore, {
  get(_target, prop) {
    const instance = getDbInstance();
    if (!instance) {
      return () => ({ docs: [] });
    }
    const val = (instance as any)[prop];
    return typeof val === "function" ? val.bind(instance) : val;
  },
});

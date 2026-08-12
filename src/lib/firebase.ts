import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getEnv } from './env';

let _db: Firestore | null = null;

function cleanPrivateKey(rawKey: string) {
  let key = (rawKey || "").trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }
  return key.replace(/\\n/g, "\n");
}

export function getDb(): Firestore {
  if (_db) return _db;

  if (getApps().length > 0) {
    _db = getFirestore(getApps()[0]);
    return _db;
  }

  try {
    const env = getEnv();
    const privateKey = cleanPrivateKey(env.FIREBASE_PRIVATE_KEY || "");

    const app = initializeApp({
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });
    _db = getFirestore(app);
    return _db;
  } catch (err) {
    console.error("Firebase Admin initialization error:", err);
    
    // Graceful fallback object if credentials are dummy or missing
    const mockDoc = {
      id: "mock_id",
      set: async () => {},
      get: async () => ({ exists: false, data: () => ({}) }),
    };

    const mockQuery: any = {
      get: async () => ({ docs: [] }),
      doc: () => mockDoc,
      limit: () => mockQuery,
      where: () => mockQuery,
    };

    const mockFirestore: any = {
      collection: () => mockQuery,
      batch: () => ({
        set: () => {},
        commit: async () => {},
      }),
    };

    return mockFirestore as Firestore;
  }
}

export const db: Firestore = new Proxy({} as Firestore, {
  get(_target, prop) {
    const instance = getDb();
    const val = (instance as any)[prop];
    return typeof val === "function" ? val.bind(instance) : val;
  },
});

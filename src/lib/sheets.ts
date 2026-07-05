import { db } from "./firebase";
import type {
  CampaignRow,
  ContactRow,
  EmailEventRow,
  OrganizationRow,
  SuppressionRow,
} from "./types";

export async function ensureSheetSchema() {
  // Test connection to Firestore
  await db.collection("Organizations").limit(1).get();
}

async function readCollection<T>(collectionName: string): Promise<T[]> {
  const snapshot = await db.collection(collectionName).get();
  return snapshot.docs.map((doc) => doc.data() as T);
}

async function writeCollection(collectionName: string, rows: any[]) {
  // Firestore batch limit is 500 writes
  const chunks = [];
  for (let i = 0; i < rows.length; i += 500) {
    chunks.push(rows.slice(i, i + 500));
  }

  for (const chunk of chunks) {
    const batch = db.batch();
    for (const row of chunk) {
      if (!row.id) {
        // If there is no ID, generate a random one
        row.id = db.collection(collectionName).doc().id;
      }
      const docRef = db.collection(collectionName).doc(row.id);
      batch.set(docRef, row, { merge: true });
    }
    await batch.commit();
  }
}

export async function listContacts() {
  return readCollection<ContactRow>("Contacts");
}

export async function saveContacts(rows: ContactRow[]) {
  return writeCollection("Contacts", rows);
}

export async function listOrganizations() {
  return readCollection<OrganizationRow>("Organizations");
}

export async function saveOrganizations(rows: OrganizationRow[]) {
  return writeCollection("Organizations", rows);
}

export async function listCampaigns() {
  return readCollection<CampaignRow>("Campaigns");
}

export async function saveCampaigns(rows: CampaignRow[]) {
  return writeCollection("Campaigns", rows);
}

export async function listEmailEvents() {
  return readCollection<EmailEventRow>("EmailEvents");
}

export async function saveEmailEvents(rows: EmailEventRow[]) {
  return writeCollection("EmailEvents", rows);
}

export async function listSuppressions() {
  return readCollection<SuppressionRow>("Suppressions");
}

export async function saveSuppressions(rows: SuppressionRow[]) {
  return writeCollection("Suppressions", rows);
}

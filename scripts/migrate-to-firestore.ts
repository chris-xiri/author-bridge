import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { google } from "googleapis";
import { getEnv } from "../src/lib/env";
import { db } from "../src/lib/firebase";

const TAB_HEADERS = {
  Organizations: [
    "id",
    "name",
    "libraryType",
    "schoolLevel",
    "address",
    "city",
    "state",
    "zip",
    "county",
    "website",
    "phone",
    "grades",
    "status",
    "sourceQuery",
    "sourceUrl",
    "createdAt",
    "updatedAt",
  ],
  Contacts: [
    "id",
    "orgId",
    "fullName",
    "title",
    "schoolName",
    "roleBucket",
    "roleConfidence",
    "schoolLevel",
    "email",
    "phone",
    "confidence",
    "sourceQuery",
    "sourceUrl",
    "evidence",
    "status",
    "outreachStatus",
    "unsubscribe",
    "campaignId",
    "createdAt",
    "updatedAt",
  ],
  Campaigns: ["id", "name", "subject", "body", "status", "createdAt", "updatedAt"],
  EmailEvents: [
    "id",
    "contactId",
    "campaignId",
    "eventType",
    "providerMessageId",
    "payload",
    "createdAt",
  ],
  Suppressions: ["id", "email", "domain", "reason", "createdAt"],
} as const;

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

function sheetsClient() {
  const env = getEnv();
  const auth = new google.auth.JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: SCOPES,
  });
  return google.sheets({ version: "v4", auth });
}

async function readTab(tabName: keyof typeof TAB_HEADERS): Promise<any[]> {
  const env = getEnv();
  const sheets = sheetsClient();
  const range = `${tabName}!A:ZZ`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
    range,
  });
  const rows = res.data.values ?? [];
  if (rows.length <= 1) return [];
  const headers = rows[0];
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = r[i] ?? "";
    });
    return obj;
  });
}

async function writeCollection(collectionName: string, rows: any[]) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += 500) {
    chunks.push(rows.slice(i, i + 500));
  }

  for (const chunk of chunks) {
    const batch = db.batch();
    for (const row of chunk) {
      if (!row.id) {
        row.id = db.collection(collectionName).doc().id;
      }
      const docRef = db.collection(collectionName).doc(row.id);
      batch.set(docRef, row, { merge: true });
    }
    await batch.commit();
  }
}

async function main() {
  console.log("Starting migration from Google Sheets to Firestore...");
  for (const tabName of Object.keys(TAB_HEADERS) as (keyof typeof TAB_HEADERS)[]) {
    console.log(`Reading ${tabName} from Google Sheets...`);
    const rows = await readTab(tabName);
    console.log(`Found ${rows.length} rows in ${tabName}. Writing to Firestore...`);
    await writeCollection(tabName, rows);
    console.log(`Finished migrating ${tabName}.`);
  }
  console.log("Migration complete!");
}

main().catch(console.error);

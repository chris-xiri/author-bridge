import { google } from "googleapis";
import { getEnv } from "./env";
import type {
  CampaignRow,
  ContactRow,
  EmailEventRow,
  OrganizationRow,
  SuppressionRow,
} from "./types";

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

async function readTab<T extends object>(tabName: keyof typeof TAB_HEADERS): Promise<T[]> {
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
    return obj as T;
  });
}

async function writeTab(tabName: keyof typeof TAB_HEADERS, rows: Record<string, string>[]) {
  const env = getEnv();
  const sheets = sheetsClient();
  const headers = [...TAB_HEADERS[tabName]];
  const values: string[][] = [headers, ...rows.map((row) => headers.map((h) => row[h] ?? ""))];
  await sheets.spreadsheets.values.update({
    spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
    range: `${tabName}!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

export async function ensureSheetSchema() {
  const env = getEnv();
  const sheets = sheetsClient();
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
  });
  const existing = new Set(
    (spreadsheet.data.sheets ?? []).map((s) => s.properties?.title).filter(Boolean) as string[],
  );
  const missing = Object.keys(TAB_HEADERS).filter((t) => !existing.has(t));
  if (missing.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
      requestBody: {
        requests: missing.map((title) => ({
          addSheet: {
            properties: { title },
          },
        })),
      },
    });
  }
  for (const tabName of Object.keys(TAB_HEADERS) as (keyof typeof TAB_HEADERS)[]) {
    const rows = await readTab<Record<string, string>>(tabName);
    if (!rows.length) {
      await writeTab(tabName, []);
    }
  }
}

export async function listContacts() {
  return readTab<ContactRow>("Contacts");
}

export async function saveContacts(rows: ContactRow[]) {
  return writeTab("Contacts", rows as unknown as Record<string, string>[]);
}

export async function listOrganizations() {
  return readTab<OrganizationRow>("Organizations");
}

export async function saveOrganizations(rows: OrganizationRow[]) {
  return writeTab("Organizations", rows as unknown as Record<string, string>[]);
}

export async function listCampaigns() {
  return readTab<CampaignRow>("Campaigns");
}

export async function saveCampaigns(rows: CampaignRow[]) {
  return writeTab("Campaigns", rows as unknown as Record<string, string>[]);
}

export async function listEmailEvents() {
  return readTab<EmailEventRow>("EmailEvents");
}

export async function saveEmailEvents(rows: EmailEventRow[]) {
  return writeTab("EmailEvents", rows as unknown as Record<string, string>[]);
}

export async function listSuppressions() {
  return readTab<SuppressionRow>("Suppressions");
}

export async function saveSuppressions(rows: SuppressionRow[]) {
  return writeTab("Suppressions", rows as unknown as Record<string, string>[]);
}

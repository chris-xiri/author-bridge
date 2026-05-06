const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line)) continue;
    const idx = line.indexOf("=");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim().replace(/^"(.*)"$/, "$1");
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main() {
  loadEnvLocal();
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!id || !email || !key) {
    throw new Error("Missing GOOGLE_SHEETS_SPREADSHEET_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  }

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const tabs = {
    Organizations: ["id", "name", "libraryType", "city", "state", "website", "status", "sourceQuery", "sourceUrl", "createdAt", "updatedAt"],
    Contacts: ["id", "orgId", "fullName", "title", "schoolName", "roleBucket", "roleConfidence", "schoolLevel", "email", "phone", "confidence", "sourceQuery", "sourceUrl", "evidence", "status", "outreachStatus", "unsubscribe", "campaignId", "createdAt", "updatedAt"],
    Campaigns: ["id", "name", "subject", "body", "status", "createdAt", "updatedAt"],
    EmailEvents: ["id", "contactId", "campaignId", "eventType", "providerMessageId", "payload", "createdAt"],
    Suppressions: ["id", "email", "domain", "reason", "createdAt"],
  };
  const data = Object.entries(tabs).map(([tab, headers]) => ({
    range: `${tab}!A1`,
    values: [headers],
  }));

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data,
    },
  });
  console.log("CLEARED_OK");
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});


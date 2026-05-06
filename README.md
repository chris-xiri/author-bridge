# AuthorBridge Librarian CRM

Vercel-hosted demo CRM for sourcing librarian contacts from SERP pages and sending outreach email.

## Stack

- Next.js (App Router)
- Google Sheets (source of truth)
- SerpAPI (search results)
- Resend (email delivery + webhooks)

## Required Environment Variables (Vercel)

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD_HASH` (sha256 hash of the admin password)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `SERPAPI_API_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `APP_BASE_URL`
- `RESEND_WEBHOOK_SECRET`

## Google Sheet Tabs

App auto-creates these tabs if missing:

- `Organizations`
- `Contacts`
- `Campaigns`
- `EmailEvents`
- `Suppressions`

## Local Run

```bash
npm install
npm run dev
```

Local app runs on `http://localhost:3011`.

## Test

```bash
npm run test
npm run lint
```

## Deploy (Vercel)

1. Create a new Vercel project from this repo/folder.
2. Add all environment variables.
3. Share the spreadsheet with the service account email.
4. Set Resend webhook URL to:
   - `https://<your-domain>/api/webhooks/resend`
   - include header `x-webhook-secret: <RESEND_WEBHOOK_SECRET>`

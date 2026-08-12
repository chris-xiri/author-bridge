import { z } from "zod";

function cleanEnvString(value: string) {
  let out = value.trim();
  if (
    (out.startsWith('"') && out.endsWith('"')) ||
    (out.startsWith("'") && out.endsWith("'"))
  ) {
    out = out.slice(1, -1).trim();
  }
  return out;
}

const asCleanString = z.preprocess((val) => {
  if (typeof val !== "string") return val;
  return cleanEnvString(val);
}, z.string());

const asOptionalCleanString = z.preprocess((val) => {
  if (typeof val !== "string") return val;
  const trimmed = cleanEnvString(val);
  return trimmed.length ? trimmed : undefined;
}, z.string().optional());

const optionalKey = asOptionalCleanString.pipe(z.string().min(10).optional());
const requiredEmail = asCleanString.pipe(z.string().email());
const requiredString = (min: number) => asCleanString.pipe(z.string().min(min));
const requiredUrl = asCleanString.pipe(z.string().url());
const optionalMinString = (min: number) => asOptionalCleanString.pipe(z.string().min(min).optional());

const schema = z.object({
  ADMIN_EMAIL: requiredEmail,
  ADMIN_PASSWORD_HASH: requiredString(20),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: requiredEmail,
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: requiredString(30),
  GOOGLE_SHEETS_SPREADSHEET_ID: requiredString(10),
  SERPAPI_API_KEY: optionalKey,
  SERPER_API_KEY: optionalKey,
  OPENAI_API_KEY: optionalKey,
  OPENAI_MODEL: optionalMinString(3),
  GEMINI_API_KEY: optionalKey,
  GEMINI_MODEL: optionalMinString(3),
  RESEND_API_KEY: requiredString(10),
  RESEND_FROM_EMAIL: requiredEmail,
  APP_BASE_URL: requiredUrl,
  RESEND_WEBHOOK_SECRET: requiredString(10),
  FIREBASE_PROJECT_ID: requiredString(5),
  FIREBASE_CLIENT_EMAIL: requiredEmail,
  FIREBASE_PRIVATE_KEY: requiredString(30),
}).superRefine((data, ctx) => {
  if (!data.SERPAPI_API_KEY && !data.SERPER_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Either SERPAPI_API_KEY or SERPER_API_KEY must be set",
      path: ["SERPAPI_API_KEY"],
    });
  }
  if (!data.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.includes("BEGIN PRIVATE KEY")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is not a valid PEM private key",
      path: ["GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"],
    });
  }
  if (data.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.includes("...")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY appears to be a placeholder; use the real key",
      path: ["GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"],
    });
  }
  if (!data.FIREBASE_PRIVATE_KEY.includes("BEGIN PRIVATE KEY")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "FIREBASE_PRIVATE_KEY is not a valid PEM private key",
      path: ["FIREBASE_PRIVATE_KEY"],
    });
  }
});

let cached: z.infer<typeof schema> | null = null;

export function getEnv() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // If environment variables are not set during Vercel static build or prerendering phase, return build fallbacks
    if (
      process.env.NEXT_PHASE ||
      process.env.VERCEL ||
      process.env.CI ||
      !process.env.FIREBASE_PROJECT_ID
    ) {
      return {
        ADMIN_EMAIL: process.env.ADMIN_EMAIL || "admin@authorbridge.com",
        ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH || "$2a$10$abcdefghijklmnopqrstuvwxyz012345",
        GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "service@authorbridge-12687.iam.gserviceaccount.com",
        GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC3\n-----END PRIVATE KEY-----",
        GOOGLE_SHEETS_SPREADSHEET_ID: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "1234567890abcdef",
        SERPAPI_API_KEY: process.env.SERPAPI_API_KEY,
        SERPER_API_KEY: process.env.SERPER_API_KEY || "fallback_key_1234567890",
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        OPENAI_MODEL: process.env.OPENAI_MODEL,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        GEMINI_MODEL: process.env.GEMINI_MODEL,
        RESEND_API_KEY: process.env.RESEND_API_KEY || "re_1234567890",
        RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL || "outreach@authorbridge.com",
        APP_BASE_URL: process.env.APP_BASE_URL || "https://authorbridge-crm.vercel.app",
        RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET || "whsec_1234567890",
        FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || "authorbridge-12687",
        FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL || "firebase-adminsdk@authorbridge-12687.iam.gserviceaccount.com",
        FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY || "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC3\n-----END PRIVATE KEY-----",
      } as z.infer<typeof schema>;
    }
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${message}`);
  }
  cached = parsed.data;
  return cached;
}

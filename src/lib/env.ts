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
});

let cached: z.infer<typeof schema> | null = null;

export function getEnv() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${message}`);
  }
  cached = parsed.data;
  return cached;
}

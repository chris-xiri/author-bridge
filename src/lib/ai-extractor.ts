import { getEnv } from "./env";

export interface AiExtractedContact {
  fullName: string;
  title: string;
  email: string;
  phone: string;
}

let cachedLatestModel: string | null = null;
let lastFetchedTime = 0;

export async function getLatestStableFlashModel(apiKey: string): Promise<string> {
  const CACHE_TTL = 3600 * 1000; // 1 hour
  if (cachedLatestModel && Date.now() - lastFetchedTime < CACHE_TTL) {
    return cachedLatestModel;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      { cache: "no-store", signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = (await res.json()) as {
        models?: Array<{ name: string; supportedMethods?: string[] }>;
      };
      const flashModels = (data.models ?? []).filter(
        (m) =>
          m.name.startsWith("models/gemini-") &&
          m.name.endsWith("-flash") &&
          !m.name.includes("-lite") &&
          !m.name.includes("-exp") &&
          m.supportedMethods?.includes("generateContent"),
      );

      let bestModel = "gemini-3.5-flash";
      let maxVer = 3.5;

      for (const m of flashModels) {
        const match = m.name.match(/models\/gemini-([0-9.]+)-flash/);
        if (match?.[1]) {
          const ver = parseFloat(match[1]);
          if (!isNaN(ver) && ver > maxVer) {
            maxVer = ver;
            bestModel = m.name.replace("models/", "");
          }
        }
      }
      cachedLatestModel = bestModel;
      lastFetchedTime = Date.now();
      return bestModel;
    }
  } catch (err) {
    console.error("Failed to automatically query newest Gemini model:", err);
  }

  return "gemini-3.5-flash";
}

export async function inferOrganizationNameWithAi(args: {
  html: string;
  pageUrl: string;
  pageTitle: string;
}) {
  const env = getEnv();
  const cleanedHtml = args.html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ");
  const text = cleanedHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 12000);
  const prompt = [
    "Infer the institution/school/library organization name for this page.",
    "Return one concise proper name only.",
    "Never return generic labels like 'About our Library' or 'Library'.",
    "If uncertain, return an empty string.",
    `URL: ${args.pageUrl}`,
    `Title: ${args.pageTitle}`,
    `Content: ${text}`,
  ].join("\n");

  let outputText = "";
  if (env.GEMINI_API_KEY) {
    const model = env.GEMINI_MODEL || await getLatestStableFlashModel(env.GEMINI_API_KEY);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: `${prompt}\nReturn ONLY JSON: {\"organizationName\":\"...\"}` }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
          },
        }),
        cache: "no-store",
      },
    );
    if (!res.ok) return "";
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    outputText = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  } else {
    return "";
  }

  if (!outputText) return "";
  try {
    const parsed = JSON.parse(outputText) as { organizationName?: string };
    return (parsed.organizationName ?? "").trim();
  } catch {
    return "";
  }
}

export async function extractContactsWithAi(args: {
  html: string;
  pageUrl: string;
  pageTitle: string;
}) {
  const env = getEnv();
  let preprocessedHtml = args.html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/&#64;|&commat;/gi, "@")
    .replace(/&#46;/gi, ".")
    .replace(/<a[^>]+href=["']mailto:([^"'?]+)["'][^>]*>([\s\S]*?)<\/a>/gi, " $2 (Email: $1) ")
    .replace(/href=["']mailto:([^"'?]+)["']/gi, " (Email: $1) ")
    .replace(/data-email=["']([^"']+)["']/gi, " (Email: $1) ");

  const text = preprocessedHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 45000);

  const prompt = [
    "Extract library and school staff contacts from this page text.",
    "Target personas: Library Media Specialist, School Librarian, Public Librarian, Library Director, Youth Services Librarian, Media Center Coordinator, Library Assistant, or Instructional Technology Specialist.",
    "Do NOT extract generic organization emails (e.g. info@, contact@, support@, admin@) or non-person names (e.g. 'Staff', 'Contact Us', 'Library Team').",
    "Requirements for each contact:",
    "1. fullName MUST be an actual person's first and last name.",
    "2. email MUST be a valid person email address.",
    "3. title should be verbatim or their role on the page.",
    "Return JSON only: {\"contacts\": [{\"fullName\":\"...\", \"title\":\"...\", \"email\":\"...\", \"phone\":\"...\"}]}",
    `URL: ${args.pageUrl}`,
    `Title: ${args.pageTitle}`,
    `Content: ${text}`,
  ].join("\n");

  let outputText = "";

  if (env.GEMINI_API_KEY) {
    const model = env.GEMINI_MODEL || await getLatestStableFlashModel(env.GEMINI_API_KEY);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: `${prompt}\nReturn ONLY raw JSON.` }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
        cache: "no-store",
      },
    );
    if (!res.ok) return [] as AiExtractedContact[];
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    outputText = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  } else if (env.OPENAI_API_KEY) {
    const model = env.OPENAI_MODEL || "gpt-4.1-mini";
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        input: prompt,
        text: {
          format: {
            type: "json_schema",
            name: "library_contacts",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                contacts: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      fullName: { type: "string" },
                      title: { type: "string" },
                      email: { type: "string" },
                      phone: { type: "string" },
                    },
                    required: ["fullName", "title", "email", "phone"],
                  },
                },
              },
              required: ["contacts"],
            },
          },
        },
      }),
      cache: "no-store",
    });
    if (!res.ok) return [] as AiExtractedContact[];
    const json = (await res.json()) as {
      output_text?: string;
    };
    outputText = json.output_text ?? "";
  } else {
    return [] as AiExtractedContact[];
  }
  if (!outputText) return [] as AiExtractedContact[];
  try {
    const parsed = JSON.parse(outputText) as { contacts?: AiExtractedContact[] };
    const rawList = parsed.contacts ?? [];

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const genericNameRegex = /^(staff|contact\s*us|email\s*us|library|help\s*desk|admin|info|directory|general\s*inquiries)$/i;

    return rawList.filter((c) => {
      const name = (c.fullName || "").trim();
      const email = (c.email || "").trim().toLowerCase();
      if (!name || name.length < 3 || genericNameRegex.test(name)) return false;
      if (!email || !emailRegex.test(email)) return false;
      return true;
    });
  } catch {
    return [] as AiExtractedContact[];
  }
}

import { getEnv } from "./env";
import type { Confidence, SchoolLevel } from "./types";

export interface AiExtractedContact {
  fullName: string;
  title: string;
  email: string;
  phone: string;
  schoolLevel: SchoolLevel;
  confidence: Confidence;
  evidence: string;
}

export async function inferOrganizationNameWithAi(args: {
  html: string;
  pageUrl: string;
  pageTitle: string;
}) {
  const env = getEnv();
  const text = args.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 12000);
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
    const model = env.GEMINI_MODEL || "gemini-2.0-flash";
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

function normalizeLevel(level: string): SchoolLevel {
  const v = level.toLowerCase();
  if (v === "elementary" || v === "middle" || v === "high" || v === "university") return v;
  return "unknown";
}

export async function extractContactsWithAi(args: {
  html: string;
  pageUrl: string;
  pageTitle: string;
  allowedLevels: SchoolLevel[];
}) {
  const env = getEnv();
  const text = args.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 18000);

  const prompt = [
    "Extract school/public library staff contacts from this page.",
    "Return ONLY librarian or library-media roles, not principal/dean/superintendent.",
    "Title must be verbatim from the page near that person. Do not invent or normalize titles.",
    "If no explicit title is shown for a person, use an empty string for title.",
    `Allowed levels: ${args.allowedLevels.join(", ")}.`,
    "JSON output only with key contacts: [{fullName,title,email,phone,schoolLevel,confidence,evidence}]",
    `URL: ${args.pageUrl}`,
    `Title: ${args.pageTitle}`,
    `Content: ${text}`,
  ].join("\n");

  let outputText = "";

  if (env.GEMINI_API_KEY) {
    const model = env.GEMINI_MODEL || "gemini-2.0-flash";
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
                      schoolLevel: { type: "string" },
                      confidence: { type: "string" },
                      evidence: { type: "string" },
                    },
                    required: ["fullName", "title", "email", "phone", "schoolLevel", "confidence", "evidence"],
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
    return (parsed.contacts ?? []).map((c) => ({
      ...c,
      schoolLevel: normalizeLevel(c.schoolLevel),
      confidence:
        c.confidence === "high" || c.confidence === "medium" || c.confidence === "low"
          ? c.confidence
          : ("medium" as Confidence),
    }));
  } catch {
    return [] as AiExtractedContact[];
  }
}

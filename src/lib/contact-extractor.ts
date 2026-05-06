import type { Confidence, RoleBucket, SchoolLevel } from "./types";

const TITLE_REGEX =
  /(librarian|school\s+librarian|library\s+director|library\s+manager|library\s+media\s+specialist|media\s+specialist|library\s+specialist|learning\s+commons|library\s+teaching\s+assistant|teaching\s+assistant|library\s+secretary|library\s+assistant|secretary|library\s*\/\s*tech(?:nology)?\s*ta|tech(?:nology)?\s*\/\s*library\s*ta|\blibrary\s+ta\b|\bta\b)/i;

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_REGEX = /(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g;

export interface ExtractedContact {
  fullName: string;
  title: string;
  schoolLevel: SchoolLevel;
  email: string;
  phone: string;
  confidence: Confidence;
  evidence: string;
  sourceUrl?: string;
}

const GENERIC_LOCAL_PARTS = new Set([
  "admin",
  "administrator",
  "info",
  "contact",
  "office",
  "help",
  "support",
  "webmaster",
  "noreply",
  "no-reply",
  "attendance",
  "registrar",
  "communications",
  "newsletter",
  "alerts",
  "donotreply",
  "transl",
  "translation",
]);

export function isLikelyGenericMailbox(email: string) {
  const [local = ""] = email.toLowerCase().split("@");
  if (!local) return true;
  if (GENERIC_LOCAL_PARTS.has(local)) return true;
  if (/^(admin|info|contact|office|help|support|webmaster)[._-]?\w*$/.test(local)) return true;
  if (/^(noreply|no-reply|donotreply)\w*$/.test(local)) return true;
  if (/^(sr|gre|emb|hr|it|tech|media|news)$/.test(local)) return true;
  return false;
}

export function validateDeterministicContact(input: ExtractedContact) {
  if (!input.email || isLikelyGenericMailbox(input.email)) return false;
  if (!isNamePlausible(input.fullName)) return false;
  if (!isNameAlignedWithEmail(input.fullName, input.email)) return false;
  const { roleBucket } = classifyRoleBucket(input.title, input.evidence);
  return roleBucket !== "non_library";
}

const NON_NAME_WORDS =
  /\b(library|librarian|media|specialist|teaching|assistant|technology|department|instructional|staff|office|school)\b/i;

function normalizeNameToken(token: string) {
  return token.toLowerCase().replace(/[^a-z]/g, "");
}

function extractSurname(fullName: string) {
  const cleaned = fullName.replace(/\b(ms|mrs|mr|dr)\.?\s+/gi, " ").trim();
  const parts = cleaned.split(/\s+/).map(normalizeNameToken).filter(Boolean);
  if (!parts.length) return "";
  return parts[parts.length - 1];
}

export function isNamePlausible(fullName: string) {
  if (!fullName) return false;
  if (NON_NAME_WORDS.test(fullName)) return false;
  const tokens = fullName
    .replace(/\b(ms|mrs|mr|dr)\.?\s+/gi, " ")
    .split(/\s+/)
    .map(normalizeNameToken)
    .filter(Boolean);
  if (tokens.length < 1) return false;
  return tokens.every((t) => t.length >= 2);
}

export function isNameAlignedWithEmail(fullName: string, email: string) {
  if (!fullName) return true;
  const local = email.toLowerCase().split("@")[0]?.replace(/[^a-z]/g, "") ?? "";
  if (!local) return false;
  const surname = extractSurname(fullName);
  if (!surname || surname.length < 3) return true;
  if (local.includes(surname)) return true;
  const initial = normalizeNameToken(
    fullName.replace(/\b(ms|mrs|mr|dr)\.?\s+/gi, " ").trim().charAt(0),
  );
  if (initial && local.includes(`${initial}${surname}`)) return true;
  return false;
}

export function classifyRoleBucket(title: string, evidence: string): {
  roleBucket: RoleBucket;
  roleConfidence: Confidence;
} {
  const text = `${title} ${evidence}`.toLowerCase();
  if (/(principal|assistant principal|dean|superintendent|head of school)/.test(text)) {
    return { roleBucket: "non_library", roleConfidence: "high" };
  }
  if (/(librarian|library media specialist|school librarian|media specialist|library specialist)/.test(text)) {
    return { roleBucket: "librarian_core", roleConfidence: "high" };
  }
  if (/(library teaching assistant|teaching assistant|library aide|instructional technology|learning commons|library assistant|library secretary|secretary|tech\/library ta|library\/tech ta|library ta|\bta\b)/.test(text)) {
    return { roleBucket: "library_support", roleConfidence: "medium" };
  }
  if (/\blibrary\b/.test(text)) {
    return { roleBucket: "library_support", roleConfidence: "medium" };
  }
  return { roleBucket: "non_library", roleConfidence: "medium" };
}

function guessConfidence(evidence: string): Confidence {
  if (TITLE_REGEX.test(evidence) && /@/.test(evidence)) return "high";
  return "medium";
}

const TARGET_TITLE_REGEX =
  /(librarian|library\s+media\s+specialist|media\s+specialist|library\s+specialist|school\s+librarian|learning\s+commons)/i;
const EXCLUDE_TITLE_REGEX =
  /(principal|assistant\s+principal|head\s+of\s+school|superintendent|dean)/i;

function pickNearestTitle(windowText: string, email: string) {
  const emailIndex = windowText.toLowerCase().indexOf(email.toLowerCase());
  if (emailIndex < 0) return "";

  const roleRegex = new RegExp(TITLE_REGEX.source, "gi");
  let best = "";
  let bestDistance = Number.POSITIVE_INFINITY;
  let match: RegExpExecArray | null;
  while ((match = roleRegex.exec(windowText)) !== null) {
    const roleStart = match.index;
    const roleEnd = roleStart + match[0].length;
    const distance = Math.abs(emailIndex - roleEnd);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = match[0];
    }
  }
  return best || "";
}

function pickNearestName(windowText: string, email: string) {
  const emailIndex = windowText.toLowerCase().indexOf(email.toLowerCase());
  if (emailIndex < 0) return "";
  const token = String.raw`(?:[A-Z][a-z]+|[A-Z]['-][A-Z][a-z]+|[A-Z][a-z]+['-][A-Z][a-z]+)`;
  const nameRegex = new RegExp(
    String.raw`\b(?:Ms|Mr|Mrs|Dr)\.?\s+${token}(?:\s+${token})?\b|\b${token}\s+${token}\b`,
    "g",
  );
  let best = "";
  let bestDistance = Number.POSITIVE_INFINITY;
  let match: RegExpExecArray | null;
  while ((match = nameRegex.exec(windowText)) !== null) {
    const name = match[0].trim();
    if (/library|librarian|media|assistant|director|principal|school/i.test(name)) continue;
    const distance = Math.abs(emailIndex - (match.index + name.length));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = name;
    }
  }
  return best;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pickTitleFromNameBinding(windowText: string, fullName: string) {
  if (!fullName) return "";
  const escaped = escapeRegExp(fullName);
  const patterns = [
    new RegExp(`${escaped}\\s*[:\\-–|]\\s*([^.;\\n]{1,120})`, "i"),
    new RegExp(`${escaped}\\s*\\(([^)]{1,120})\\)`, "i"),
  ];
  for (const rx of patterns) {
    const m = windowText.match(rx);
    if (!m?.[1]) continue;
    const candidate = m[1].trim();
    if (/\b(tech(?:nology)?\s*\/\s*library\s*ta|library\s*\/\s*tech(?:nology)?\s*ta)\b/i.test(candidate)) {
      return "Tech/Library TA";
    }
    if (/\blibrary\s+teaching\s+assistant\b/i.test(candidate)) return "Library Teaching Assistant";
    if (/\bteaching\s+assistant\b/i.test(candidate)) return "Teaching Assistant";
    if (/\blibrary\s+secretary\b/i.test(candidate)) return "Library Secretary";
    if (/\blibrary\s+media\s+specialist\b/i.test(candidate)) return "Library Media Specialist";
    const titleMatch = candidate.match(new RegExp(TITLE_REGEX.source, "i"));
    if (titleMatch?.[0]) return titleMatch[0];
  }
  return "";
}

export function inferSchoolLevel(source: string): SchoolLevel {
  const s = source.toLowerCase();
  if (/elementary|elem\b|primary\s+school/.test(s)) return "elementary";
  if (/middle\s+school|junior\s+high/.test(s)) return "middle";
  if (/high\s+school|senior\s+high/.test(s)) return "high";
  if (/university|college|campus/.test(s)) return "university";
  return "unknown";
}

export function isTargetLibrarianRole(title: string, evidence: string) {
  const combined = `${title} ${evidence}`;
  if (EXCLUDE_TITLE_REGEX.test(combined)) return false;
  return TARGET_TITLE_REGEX.test(combined);
}

export function extractContactsFromHtml(html: string): ExtractedContact[] {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const directEmails = text.match(EMAIL_REGEX) ?? [];
  const obfuscated = Array.from(
    text.matchAll(/([A-Z0-9._%+-]+)\s*(?:\[at\]|\(at\)|at)\s*([A-Z0-9.-]+\.[A-Z]{2,})/gi),
  ).map((m) => `${m[1]}@${m[2]}`);
  const emails = Array.from(new Set([...directEmails, ...obfuscated]));
  const phones = Array.from(new Set(text.match(PHONE_REGEX) ?? []));
  const contacts: ExtractedContact[] = [];

  for (const email of emails) {
    const idx = text.toLowerCase().indexOf(email.toLowerCase());
    const window = text.slice(Math.max(0, idx - 220), Math.min(text.length, idx + 220));
    const fullName = pickNearestName(window, email);
    const boundTitle = pickTitleFromNameBinding(window, fullName);
    const title = boundTitle || pickNearestTitle(window, email);
    if (isLikelyGenericMailbox(email)) continue;
    if (!title && !fullName) continue;
    contacts.push({
      fullName,
      title: title || "",
      schoolLevel: inferSchoolLevel(window),
      email,
      phone: phones[0] ?? "",
      confidence: guessConfidence(window),
      evidence: window.slice(0, 250),
    });
  }

  return contacts;
}

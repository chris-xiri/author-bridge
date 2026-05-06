export function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix: string) {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function emailDomain(email: string) {
  const parts = normalizeEmail(email).split("@");
  return parts[1] ?? "";
}


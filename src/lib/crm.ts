import type { CampaignRow, ContactRow, EmailEventRow, OrganizationRow, SuppressionRow } from "./types";
import { createId, emailDomain, normalizeEmail, nowIso } from "./utils";
import {
  listCampaigns,
  listContacts,
  listEmailEvents,
  listOrganizations,
  listSuppressions,
  saveCampaigns,
  saveContacts,
  saveEmailEvents,
  saveOrganizations,
  saveSuppressions,
} from "./sheets";

let contactsCache: ContactRow[] | null = null;
let organizationsCache: OrganizationRow[] | null = null;
let crmBatchMode = false;
const dirtyContacts = new Map<string, ContactRow>();
const dirtyOrganizations = new Map<string, OrganizationRow>();

function normalizeOrgKey(value: string) {
  return (value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function getContactsCached() {
  if (contactsCache) return contactsCache;
  contactsCache = await listContacts();
  return contactsCache;
}

async function getOrganizationsCached() {
  if (organizationsCache) return organizationsCache;
  organizationsCache = await listOrganizations();
  return organizationsCache;
}

export function beginCrmBatch() {
  crmBatchMode = true;
  dirtyContacts.clear();
  dirtyOrganizations.clear();
}

export async function flushCrmBatch() {
  if (dirtyOrganizations.size > 0) {
    await saveOrganizations(Array.from(dirtyOrganizations.values()));
    dirtyOrganizations.clear();
  }
  if (dirtyContacts.size > 0) {
    await saveContacts(Array.from(dirtyContacts.values()));
    dirtyContacts.clear();
  }
  crmBatchMode = false;
}

export async function upsertOrganization(input: Partial<OrganizationRow>) {
  const orgs = await getOrganizationsCached();
  const website = (input.website ?? "").trim();
  const nameKey = normalizeOrgKey(input.name ?? "");
  const cityKey = normalizeOrgKey(input.city ?? "");
  const stateKey = normalizeOrgKey(input.state ?? "");
  const existing = orgs.find((o) => {
    if (website && o.website === website) return true;
    return (
      normalizeOrgKey(o.name) === nameKey &&
      normalizeOrgKey(o.city) === cityKey &&
      normalizeOrgKey(o.state) === stateKey &&
      !!nameKey
    );
  });
  const ts = nowIso();
  if (existing) {
    let modified = false;
    const nextName = (input.name ?? "").trim();
    const currentName = (existing.name ?? "").trim();
    const weakCurrent =
      !currentName ||
      /^about\s+our\s+library$/i.test(currentName) ||
      /^library$/i.test(currentName) ||
      /^[\w.-]+\.[a-z]{2,}$/i.test(currentName);
    if (nextName && weakCurrent && nextName.toLowerCase() !== currentName.toLowerCase()) {
      existing.name = nextName;
      modified = true;
    }

    if (typeof input.address === "string" && input.address.trim()) { existing.address = input.address.trim(); modified = true; }
    if (typeof input.zip === "string" && input.zip.trim()) { existing.zip = input.zip.trim(); modified = true; }
    if (typeof input.county === "string" && input.county.trim()) { existing.county = input.county.trim(); modified = true; }
    if (typeof input.phone === "string" && input.phone.trim()) { existing.phone = input.phone.trim(); modified = true; }
    if (typeof input.grades === "string" && input.grades.trim()) { existing.grades = input.grades.trim(); modified = true; }
    if (typeof input.city === "string" && input.city.trim()) { existing.city = input.city.trim(); modified = true; }
    if (typeof input.state === "string" && input.state.trim()) { existing.state = input.state.trim(); modified = true; }

    if (modified) {
      existing.updatedAt = ts;
      if (crmBatchMode) {
        dirtyOrganizations.set(existing.id, existing);
      } else {
        await saveOrganizations([existing]);
      }
    }
    organizationsCache = orgs;
    return existing;
  }
  const row: OrganizationRow = {
    id: createId("org"),
    name: input.name ?? "",
    libraryType: (input.libraryType as OrganizationRow["libraryType"]) ?? "other",
    address: input.address ?? "",
    city: input.city ?? "",
    state: input.state ?? "",
    zip: input.zip ?? "",
    county: input.county ?? "",
    website,
    phone: input.phone ?? "",
    grades: input.grades ?? "",
    status: "active",
    sourceQuery: input.sourceQuery ?? "",
    sourceUrl: input.sourceUrl ?? "",
    createdAt: ts,
    updatedAt: ts,
  };
  orgs.push(row);
  if (crmBatchMode) {
    dirtyOrganizations.set(row.id, row);
  } else {
    await saveOrganizations([row]);
  }
  organizationsCache = orgs;
  return row;
}

export async function upsertContact(input: Partial<ContactRow>) {
  const contacts = await getContactsCached();
  const email = normalizeEmail(input.email ?? "");
  if (!email) return null;
  const existing = contacts.find((c) => normalizeEmail(c.email) === email);
  const ts = nowIso();
  if (existing) {
    existing.updatedAt = ts;
    if (typeof input.orgName === "string" && input.orgName.trim()) existing.orgName = input.orgName.trim();
    if (crmBatchMode) {
      dirtyContacts.set(existing.id, existing);
    } else {
      await saveContacts([existing]);
    }
    contactsCache = contacts;
    return existing;
  }
  const row: ContactRow = {
    id: createId("contact"),
    orgId: input.orgId ?? "",
    fullName: input.fullName ?? "",
    title: input.title ?? "",
    orgName: input.orgName ?? "",
    email,
    phone: input.phone ?? "",
    sourceQuery: input.sourceQuery ?? "",
    sourceUrl: input.sourceUrl ?? "",
    status: "pending_review",
    outreachStatus: "none",
    unsubscribe: "false",
    campaignId: input.campaignId ?? "",
    createdAt: ts,
    updatedAt: ts,
  };
  contacts.push(row);
  if (crmBatchMode) {
    dirtyContacts.set(row.id, row);
  } else {
    await saveContacts([row]);
  }
  contactsCache = contacts;
  return row;
}

export async function createCampaign(name: string, subject: string, body: string) {
  const campaigns = await listCampaigns();
  const ts = nowIso();
  const row: CampaignRow = {
    id: createId("camp"),
    name,
    subject,
    body,
    status: "draft",
    createdAt: ts,
    updatedAt: ts,
  };
  campaigns.push(row);
  await saveCampaigns(campaigns);
  return row;
}

export async function addEvent(input: Omit<EmailEventRow, "id" | "createdAt">) {
  const events = await listEmailEvents();
  const row: EmailEventRow = {
    id: createId("event"),
    createdAt: nowIso(),
    ...input,
  };
  events.push(row);
  await saveEmailEvents(events);
  return row;
}

export async function isSuppressed(email: string) {
  const suppressions = await listSuppressions();
  const normalized = normalizeEmail(email);
  const domain = emailDomain(normalized);
  return suppressions.some((s) => normalizeEmail(s.email) === normalized || s.domain === domain);
}

export async function suppressEmail(email: string, reason: string) {
  const suppressions = await listSuppressions();
  const normalized = normalizeEmail(email);
  const domain = emailDomain(normalized);
  const exists = suppressions.find((s) => normalizeEmail(s.email) === normalized);
  if (exists) return exists;
  const row: SuppressionRow = {
    id: createId("sup"),
    email: normalized,
    domain,
    reason,
    createdAt: nowIso(),
  };
  suppressions.push(row);
  await saveSuppressions(suppressions);
  return row;
}

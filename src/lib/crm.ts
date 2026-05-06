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
let contactsDirty = false;
let organizationsDirty = false;
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
}

export async function flushCrmBatch() {
  if (organizationsDirty && organizationsCache) {
    await saveOrganizations(organizationsCache);
    organizationsDirty = false;
  }
  if (contactsDirty && contactsCache) {
    await saveContacts(contactsCache);
    contactsDirty = false;
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
    const nextName = (input.name ?? "").trim();
    const currentName = (existing.name ?? "").trim();
    const weakCurrent =
      !currentName ||
      /^about\s+our\s+library$/i.test(currentName) ||
      /^library$/i.test(currentName) ||
      /^[\w.-]+\.[a-z]{2,}$/i.test(currentName);
    if (nextName && weakCurrent && nextName.toLowerCase() !== currentName.toLowerCase()) {
      existing.name = nextName;
      existing.updatedAt = ts;
      if (crmBatchMode) {
        organizationsDirty = true;
      } else {
        await saveOrganizations(orgs);
      }
      organizationsCache = orgs;
    }
    if (input.schoolLevel && (!existing.schoolLevel || existing.schoolLevel === "unknown")) {
      existing.schoolLevel = input.schoolLevel;
      existing.updatedAt = ts;
      if (crmBatchMode) {
        organizationsDirty = true;
      } else {
        await saveOrganizations(orgs);
      }
      organizationsCache = orgs;
    }
    if (typeof input.address === "string" && input.address.trim()) existing.address = input.address.trim();
    if (typeof input.zip === "string" && input.zip.trim()) existing.zip = input.zip.trim();
    if (typeof input.county === "string" && input.county.trim()) existing.county = input.county.trim();
    if (typeof input.phone === "string" && input.phone.trim()) existing.phone = input.phone.trim();
    if (typeof input.grades === "string" && input.grades.trim()) existing.grades = input.grades.trim();
    if (typeof input.city === "string" && input.city.trim()) existing.city = input.city.trim();
    if (typeof input.state === "string" && input.state.trim()) existing.state = input.state.trim();
    existing.updatedAt = ts;
    if (crmBatchMode) {
      organizationsDirty = true;
    } else {
      await saveOrganizations(orgs);
    }
    organizationsCache = orgs;
    return existing;
  }
  const row: OrganizationRow = {
    id: createId("org"),
    name: input.name ?? "",
    libraryType: (input.libraryType as OrganizationRow["libraryType"]) ?? "other",
    schoolLevel: input.schoolLevel ?? "unknown",
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
    organizationsDirty = true;
  } else {
    await saveOrganizations(orgs);
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
    if (input.evidence) existing.evidence = input.evidence;
    if (typeof input.schoolName === "string" && input.schoolName.trim()) existing.schoolName = input.schoolName.trim();
    if (crmBatchMode) {
      contactsDirty = true;
    } else {
      await saveContacts(contacts);
    }
    contactsCache = contacts;
    return existing;
  }
  const row: ContactRow = {
    id: createId("contact"),
    orgId: input.orgId ?? "",
    fullName: input.fullName ?? "",
    title: input.title ?? "",
    schoolName: input.schoolName ?? "",
    roleBucket: input.roleBucket ?? "library_support",
    roleConfidence: input.roleConfidence ?? "medium",
    schoolLevel: input.schoolLevel ?? "unknown",
    email,
    phone: input.phone ?? "",
    confidence: input.confidence ?? "medium",
    sourceQuery: input.sourceQuery ?? "",
    sourceUrl: input.sourceUrl ?? "",
    evidence: input.evidence ?? "",
    status: "pending_review",
    outreachStatus: "none",
    unsubscribe: "false",
    campaignId: input.campaignId ?? "",
    createdAt: ts,
    updatedAt: ts,
  };
  contacts.push(row);
  if (crmBatchMode) {
    contactsDirty = true;
  } else {
    await saveContacts(contacts);
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

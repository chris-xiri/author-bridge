export type ContactStatus = "pending_review" | "approved" | "rejected";
export type OutreachStatus =
  | "none"
  | "sent"
  | "bounced"
  | "replied"
  | "unsubscribed";
export type Confidence = "high" | "medium";
export type SchoolLevel = "elementary" | "middle" | "high" | "university" | "unknown";
export type RoleBucket = "librarian_core" | "library_support" | "non_library";

export interface OrganizationRow {
  id: string;
  name: string;
  libraryType: "public" | "school" | "other";
  address: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  website: string;
  phone: string;
  grades: string;
  status: "active" | "archived";
  sourceQuery: string;
  sourceUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContactRow {
  id: string;
  orgId: string;
  fullName: string;
  title: string;
  orgName: string;
  email: string;
  phone: string;
  sourceQuery: string;
  sourceUrl: string;
  status: ContactStatus;
  outreachStatus: OutreachStatus;
  unsubscribe: "true" | "false";
  campaignId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignRow {
  id: string;
  name: string;
  subject: string;
  body: string;
  status: "draft" | "sent" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface EmailEventRow {
  id: string;
  contactId: string;
  campaignId: string;
  eventType: "queued" | "sent" | "delivered" | "bounced" | "replied" | "unsubscribed";
  providerMessageId: string;
  payload: string;
  createdAt: string;
}

export interface SuppressionRow {
  id: string;
  email: string;
  domain: string;
  reason: string;
  createdAt: string;
}

export interface ProspectRunInput {
  campaignName: string;
  geoTargets: string[];
  maxResultsPerQuery?: number;
  prospectPublicLibraries?: boolean;
  prospectSchoolLibraries?: boolean;
}

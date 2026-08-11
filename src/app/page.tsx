"use client";

import { FormEvent, useEffect, useState } from "react";
import { ALL_STATES, GEO_DATA, ResolvedGeoQuery } from "@/lib/geo-data";
import { AppShell } from "@/components/app-shell";
import { GeoSearchBar } from "@/components/geo-search-bar";

type Contact = {
  id: string;
  orgName: string;
  fullName: string;
  title: string;
  email: string;
  status: string;
  outreachStatus: string;
  sourceUrl: string;
  snippet?: string;
};
type Campaign = { id: string; name: string; subject: string; body: string; status: "draft" | "sent" | "archived" };

export default function ProspectsPage() {
  const SETTINGS_STORAGE_KEY = "authorbridge.prospector.settings.v1";
  const STATE_STORAGE_KEY = "authorbridge.prospector.state.v1";
  const COUNTY_STORAGE_KEY = "authorbridge.prospector.county.v1";
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [busy, setBusy] = useState("");
  const [uiError, setUiError] = useState("");
  const [uiNotice, setUiNotice] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [previewContact, setPreviewContact] = useState<Contact | null>(null);
  const [previewData, setPreviewData] = useState<{ url: string; pageTitle: string; snippet: string; loading: boolean } | null>(null);
  const [prospectorOpen, setProspectorOpen] = useState(false);
  const [advancedTargetingOpen, setAdvancedTargetingOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>("pending_review");
  const [rejectedOpen, setRejectedOpen] = useState(false);
  const [approvedGrouped, setApprovedGrouped] = useState(true);
  const [editing, setEditing] = useState<{ id: string; field: "fullName" | "title" | "orgName" | "email" } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [countyName, setCountyName] = useState("");
  const [manualCounty, setManualCounty] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [resolvedGeo, setResolvedGeo] = useState<ResolvedGeoQuery | null>(null);
  const [prospectForm, setProspectForm] = useState({
    campaignName: "May Librarian Outreach",
    maxResultsPerQuery: 50,
    geoTargets: [] as string[],
    prospectPublicLibraries: true,
    prospectSchoolLibraries: true,
  });
  const [newGeo, setNewGeo] = useState("");

  function handleProspectGeo(geo: ResolvedGeoQuery) {
    const targets = geo.towns.length > 0 ? geo.towns : [geo.primaryLabel];
    setProspectForm((prev) => ({
      ...prev,
      geoTargets: Array.from(new Set([...prev.geoTargets, ...targets])),
    }));
    setProspectorOpen(true);
    setUiNotice(`Added ${targets.join(", ")} to prospecting targets. Click 'Run Prospector' to search!`);
  }

  async function parseJsonSafe(res: Response) {
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { error: `Invalid JSON response (${res.status})` };
    }
  }

  async function loadContacts() {
    setUiError("");
    const contactsRes = await fetch("/api/contacts");
    const contactsJson = await parseJsonSafe(contactsRes);
    if (!contactsRes.ok) {
      setUiError(contactsJson.error || "Contacts API failed");
      return;
    }
    setContacts(contactsJson.items ?? []);
  }

  async function loadCampaigns() {
    const res = await fetch("/api/campaigns");
    const body = await parseJsonSafe(res);
    if (!res.ok) {
      setUiError(body.error || "Templates API failed");
      return [] as Campaign[];
    }
    const list = ((body ?? []) as Campaign[]).filter((c) => c.status !== "archived");
    setCampaigns(list);
    return list;
  }

  useEffect(() => {
    void loadContacts();
    void loadCampaigns();
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as typeof prospectForm;
        setProspectForm((prev) => ({
          ...prev,
          ...parsed,
          geoTargets: Array.isArray(parsed.geoTargets) ? parsed.geoTargets : prev.geoTargets,
          prospectPublicLibraries: typeof parsed.prospectPublicLibraries === "boolean" ? parsed.prospectPublicLibraries : prev.prospectPublicLibraries,
          prospectSchoolLibraries: typeof parsed.prospectSchoolLibraries === "boolean" ? parsed.prospectSchoolLibraries : prev.prospectSchoolLibraries,
          maxResultsPerQuery:
            typeof parsed.maxResultsPerQuery === "number" && Number.isFinite(parsed.maxResultsPerQuery)
              ? parsed.maxResultsPerQuery
              : prev.maxResultsPerQuery,
        }));
      }
      const savedCounty = window.localStorage.getItem(COUNTY_STORAGE_KEY);
      if (savedCounty) setCountyName(savedCounty);
      const savedState = window.localStorage.getItem(STATE_STORAGE_KEY);
      if (savedState) setStateCode(savedState);
    } catch {
      // Ignore invalid cached settings.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(prospectForm));
    } catch {
      // Ignore storage failures.
    }
  }, [prospectForm]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STATE_STORAGE_KEY, stateCode);
    } catch {
      // Ignore storage failures.
    }
  }, [stateCode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(COUNTY_STORAGE_KEY, countyName);
    } catch {
      // Ignore storage failures.
    }
  }, [countyName]);

  async function runProspectRequest() {
    setBusy("prospect");
    setUiError("");
    setUiNotice(`Running prospecting across ${prospectForm.geoTargets.length} geo targets...`);
    setProgressPct(5);

    try {
      const res = await fetch("/api/prospect/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignName: prospectForm.campaignName,
          geoTargets: prospectForm.geoTargets,
          maxResultsPerQuery: prospectForm.maxResultsPerQuery,
          prospectPublicLibraries: prospectForm.prospectPublicLibraries,
          prospectSchoolLibraries: prospectForm.prospectSchoolLibraries,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        let err = text;
        try { err = JSON.parse(text).error; } catch {}
        setUiError(err || "Run prospecting failed");
        setProgressPct(0);
        setBusy("");
        return;
      }

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";
        
        for (const line of lines) {
          const eventMatch = line.match(/event:\s*(.*)/);
          const dataMatch = line.match(/data:\s*(.*)/);
          if (eventMatch && dataMatch) {
            const event = eventMatch[1].trim();
            const data = JSON.parse(dataMatch[1].trim());
            
            if (event === "progress") {
              if (data.message) setUiNotice(data.message);
              if (data.pct) setProgressPct(data.pct);
            } else if (event === "contact_found" && data.contact) {
              const foundContact = data.contact as Contact;
              setContacts((prev) => {
                if (prev.some((c) => c.email.toLowerCase() === foundContact.email.toLowerCase())) {
                  return prev;
                }
                return [foundContact, ...prev];
              });
              setUiNotice(`⚡ Live Discovered: ${foundContact.fullName} (${foundContact.email}) at ${foundContact.orgName}`);
            } else if (event === "done") {
              setProgressPct(100);
              setUiNotice(`Prospecting complete! Discovered ${data.discoveredCount ?? 0} leads across target locations.`);
            } else if (event === "error") {
              throw new Error(data.error || "Stream error");
            }
          }
        }
      }
      
      setBusy("");
      await loadContacts();
    } catch (error) {
      setUiError(error instanceof Error ? error.message : "Unexpected prospecting error");
      setProgressPct(0);
      setBusy("");
    } finally {
      setTimeout(() => setProgressPct(0), 1000);
    }
  }

  async function runProspect(e: FormEvent) {
    e.preventDefault();
    await runProspectRequest();
  }

  async function preloadSchools() {
    if (!stateCode) {
      setUiError("Select a state before preloading schools.");
      return;
    }
    setBusy("preload-schools");
    setUiError("");
    setUiNotice("");
    try {
      const res = await fetch("/api/prospect/preload-schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "national",
          stateCodes: [stateCode],
          geoTargets: prospectForm.geoTargets,
          includePublic: true,
          includePrivate: false,
          maxRecords: 75000,
        }),
      });
      const body = await parseJsonSafe(res);
      if (!res.ok) {
        setUiError(body.error || "School preload failed");
        setBusy("");
        return;
      }
      setUiNotice(
        `School preload complete. Added/updated ${body.schoolsCreatedOrUpdated ?? 0} schools after scanning ${body.scannedResults ?? 0} records.`,
      );
      setBusy("");
    } catch (error) {
      setUiError(error instanceof Error ? error.message : "School preload failed");
      setBusy("");
    }
  }

  const [toast, setToast] = useState<{ id: string; msg: string; type: "success" | "error" | "info" } | null>(null);

  function showToast(msg: string, type: "success" | "error" | "info" = "success") {
    const id = String(Date.now());
    setToast({ id, msg, type });
    setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, 2000);
  }

  async function approve(id: string) {
    const target = contacts.find((c) => c.id === id);
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: "approved" } : c))
    );
    showToast(`✓ Approved ${target?.fullName || "Contact"}`, "success");

    try {
      const res = await fetch(`/api/contacts/${id}/approve`, { method: "POST" });
      if (!res.ok) throw new Error();
    } catch {
      setContacts((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: "pending_review" } : c))
      );
      showToast(`❌ Failed to approve ${target?.fullName || "Contact"}`, "error");
    }
  }

  async function reject(id: string) {
    const target = contacts.find((c) => c.id === id);
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: "rejected" } : c))
    );
    showToast(`🚫 Rejected ${target?.fullName || "Contact"}`, "info");

    try {
      const res = await fetch(`/api/contacts/${id}/reject`, { method: "POST" });
      if (!res.ok) throw new Error();
    } catch {
      setContacts((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: "pending_review" } : c))
      );
      showToast(`❌ Failed to reject ${target?.fullName || "Contact"}`, "error");
    }
  }

  async function openSourcePreview(contact: Contact) {
    setPreviewContact(contact);
    setPreviewData({ url: contact.sourceUrl || "", pageTitle: contact.orgName, snippet: "", loading: true });

    if (!contact.sourceUrl) {
      setPreviewData({ url: "", pageTitle: contact.orgName, snippet: "No source URL recorded for this contact.", loading: false });
      return;
    }

    try {
      const res = await fetch("/api/contacts/preview-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: contact.sourceUrl, email: contact.email, fullName: contact.fullName }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setPreviewData({
          url: json.url,
          pageTitle: json.pageTitle || contact.orgName,
          snippet: json.snippet || "No textual snippet could be extracted.",
          loading: false,
        });
      } else {
        setPreviewData({
          url: contact.sourceUrl,
          pageTitle: contact.orgName,
          snippet: json.error || "Failed to load live preview snippet.",
          loading: false,
        });
      }
    } catch {
      setPreviewData({
        url: contact.sourceUrl,
        pageTitle: contact.orgName,
        snippet: "Network error loading page snippet preview.",
        loading: false,
      });
    }
  }

  async function updateContactField(id: string, field: "fullName" | "title" | "orgName" | "email", value: string) {
    const res = await fetch(`/api/contacts/${id}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    const body = await parseJsonSafe(res);
    if (!res.ok) {
      throw new Error(body?.error || "Inline update failed");
    }
    await loadContacts();
  }

  function beginInlineEdit(contact: Contact, field: "fullName" | "title" | "orgName" | "email") {
    setEditing({ id: contact.id, field });
    const current = contact[field] || "";
    setEditValue((current || "").toString());
  }

  async function commitInlineEdit(contact: Contact, field: "fullName" | "title" | "orgName" | "email") {
    const trimmed = editValue.trim();
    setEditing(null);
    try {
      if (trimmed === (contact[field] || "")) return;
      await updateContactField(contact.id, field, trimmed);
      setUiNotice("Saved.");
    } catch (error) {
      setUiError(error instanceof Error ? error.message : "Failed to save inline edit");
    }
  }

  function renderEditableCell(contact: Contact, field: "fullName" | "title" | "orgName" | "email", fallback = "—") {
    const isEditing = editing?.id === contact.id && editing.field === field;
    if (isEditing) {
      return (
        <input
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => void commitInlineEdit(contact, field)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commitInlineEdit(contact, field);
            } else if (e.key === "Escape") {
              setEditing(null);
            }
          }}
        />
      );
    }
    const displayValue = contact[field] || "";
    return (
      <span onDoubleClick={() => beginInlineEdit(contact, field)} title="Double-click to edit">
        {displayValue || fallback}
      </span>
    );
  }


  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const pending = pendingContacts;
    if (selected.size === pending.length) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(pending.map((c) => c.id)));
  }

  async function bulkApprove() {
    const targetIds = Array.from(selected);
    if (!targetIds.length) return;
    
    setSelected(new Set());
    setContacts((prev) =>
      prev.map((c) => (targetIds.includes(c.id) ? { ...c, status: "approved" } : c))
    );
    showToast(`✓ Approved ${targetIds.length} contacts!`, "success");

    await Promise.allSettled(
      targetIds.map((id) => fetch(`/api/contacts/${id}/approve`, { method: "POST" }))
    );
  }

  async function bulkReject() {
    const targetIds = Array.from(selected);
    if (!targetIds.length) return;

    setSelected(new Set());
    setContacts((prev) =>
      prev.map((c) => (targetIds.includes(c.id) ? { ...c, status: "rejected" } : c))
    );
    showToast(`🚫 Rejected ${targetIds.length} contacts!`, "info");

    await Promise.allSettled(
      targetIds.map((id) => fetch(`/api/contacts/${id}/reject`, { method: "POST" }))
    );
  }




  function splitBulkValues(value: string) {
    return value
      .split(/[\n,;|]+/)
      .map((v) => v.trim())
      .filter(Boolean);
  }

  function addBadge(
    key: "geoTargets",
    value: string,
    setter: (v: string) => void,
  ) {
    const items = splitBulkValues(value);
    if (!items.length) return;
    setProspectForm((prev) => ({
      ...prev,
      [key]: Array.from(new Set([...prev[key], ...items])),
    }));
    setter("");
  }

  function removeBadge(key: "geoTargets", value: string) {
    setProspectForm((prev) => ({ ...prev, [key]: prev[key].filter((v) => v !== value) }));
  }

  const stateOptions = ALL_STATES;
  const selectedStateGeo = GEO_DATA.find((s) => s.state === stateCode);
  const countyOptions = (selectedStateGeo?.counties ?? []).slice().sort((a, b) => a.localeCompare(b));
  const countyTowns = selectedStateGeo?.countyCityMap?.[countyName] ?? [];
  async function addCountyTowns() {
    if (!countyName) return;
    if (countyTowns.length) {
      setProspectForm((prev) => ({ ...prev, geoTargets: Array.from(new Set([...prev.geoTargets, ...countyTowns])) }));
      return;
    }
    if (!stateCode) return;
    setBusy("county-towns");
    try {
      const res = await fetch("/api/geo/county-towns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ county: countyName, state: stateCode }),
      });
      const body = await parseJsonSafe(res);
      if (!res.ok) {
        setUiError(body.error || "Could not fetch county towns");
        setBusy("");
        return;
      }
      const towns = Array.isArray(body.towns) ? (body.towns as string[]) : [];
      if (!towns.length) {
        setUiError("No towns found for that county. Add targets manually.");
        setBusy("");
        return;
      }
      setProspectForm((prev) => ({ ...prev, geoTargets: Array.from(new Set([...prev.geoTargets, ...towns])) }));
      setUiNotice(`Added ${towns.length} county towns from lookup.`);
    } catch (error) {
      setUiError(error instanceof Error ? error.message : "Could not fetch county towns");
    } finally {
      setBusy("");
    }
  }
  function addManualCountyTarget() {
    const county = manualCounty.trim();
    const state = stateCode.trim().toUpperCase();
    if (!county || !state) return;
    const normalizedCounty = /county$/i.test(county) ? county : `${county} County`;
    const target = `${normalizedCounty}, ${state}`;
    setProspectForm((prev) => ({
      ...prev,
      geoTargets: Array.from(new Set([...prev.geoTargets, target])),
    }));
    setCountyName(target);
    setManualCounty("");
  }



  const filteredContacts = contacts.filter((c) =>
    (statusFilter === "all" ? true : c.status === statusFilter),
  );
  const pendingContacts = filteredContacts.filter((c) => c.status === "pending_review");
  const decidedContacts = contacts.filter((c) =>
    c.status !== "pending_review",
  );
  const approvedContacts = decidedContacts.filter((c) => c.status === "approved");
  const rejectedContacts = decidedContacts.filter((c) => c.status === "rejected");
  const approvedBySchool = Array.from(
    approvedContacts.reduce((acc, c) => {
      const key = (c.orgName || "Unknown School").trim();
      const bucket = acc.get(key) ?? [];
      bucket.push(c);
      acc.set(key, bucket);
      return acc;
    }, new Map<string, Contact[]>()),
  ).sort((a, b) => a[0].localeCompare(b[0]));

  function lifecycleLabel(c: Contact) {
    if (c.status === "pending_review") return "pending review";
    if (c.status === "rejected") return "rejected";
    if (c.status === "approved" && c.outreachStatus === "sent") return "sent";
    if (c.status === "approved") return "approved - not sent";
    return c.status;
  }

  function lifecycleClass(c: Contact) {
    if (c.status === "rejected") return "badge-rejected";
    if (c.status === "approved" && c.outreachStatus === "sent") return "badge-sent";
    if (c.status === "approved") return "badge-approved";
    return "badge-pending_review";
  }

  async function openGmailDraft(contact: Contact) {
    const available = campaigns.length ? campaigns : await loadCampaigns();
    const template = available.find((c) => c.status === "draft") ?? available[0];
    if (!template) {
      setUiError("Create a template first.");
      return;
    }
    const subject = (template.subject || "").replaceAll("{{fullName}}", contact.fullName || "there");
    const body = (template.body || "").replaceAll("{{fullName}}", contact.fullName || "there");
    const gmailUrl =
      `https://mail.google.com/mail/?view=cm&fs=1` +
      `&to=${encodeURIComponent(contact.email)}` +
      `&su=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;
    window.open(gmailUrl, "_blank", "noopener,noreferrer");
  }

  function joinedPreview(values: string[], max = 4) {
    if (!values.length) return "None";
    if (values.length <= max) return values.join(", ");
    return `${values.slice(0, max).join(", ")} +${values.length - max} more`;
  }


  function exportApprovedCsv() {
    const approved = contacts.filter((c) => c.status === "approved");
    if (!approved.length) {
      setUiError("No approved contacts to export.");
      return;
    }
    const headers = ["Full Name", "Title", "Organization", "Email", "Source URL"];
    const rows = approved.map((c) => [
      `"${(c.fullName || "").replace(/"/g, '""')}"`,
      `"${(c.title || "").replace(/"/g, '""')}"`,
      `"${(c.orgName || "").replace(/"/g, '""')}"`,
      `"${(c.email || "").replace(/"/g, '""')}"`,
      `"${(c.sourceUrl || "").replace(/"/g, '""')}"`,
    ]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `approved_librarians_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const searchFilteredContacts = contacts.filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (!searchQuery.trim()) return true;

    const text = `${c.fullName} ${c.title} ${c.orgName} ${c.email} ${c.sourceUrl}`.toLowerCase();
    const q = searchQuery.toLowerCase().trim();

    if (text.includes(q)) return true;

    if (resolvedGeo && resolvedGeo.towns.length > 0) {
      return resolvedGeo.towns.some((t) => {
        const townClean = t.split(",")[0].toLowerCase();
        return text.includes(townClean);
      });
    }

    return false;
  });

  return (
    <AppShell title="AuthorBridge Librarian CRM" subtitle="Prospecting queue and review workflow.">
      {uiError ? <div className="error-banner">{uiError}</div> : null}
      {uiNotice ? <div className="notice-banner">{uiNotice}</div> : null}

      <div className="stats-grid">
        <div className="stat-card">
          <div>
            <div className="stat-val">{contacts.length}</div>
            <div className="stat-lbl">Total Contacts</div>
          </div>
          <div className="stat-icon" style={{ background: "#e0f2fe", color: "#0284c7" }}>👥</div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-val">{contacts.filter((c) => c.status === "pending_review").length}</div>
            <div className="stat-lbl">Pending Review</div>
          </div>
          <div className="stat-icon" style={{ background: "#fef3c7", color: "#d97706" }}>⏳</div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-val">{contacts.filter((c) => c.status === "approved").length}</div>
            <div className="stat-lbl">Approved Leads</div>
          </div>
          <div className="stat-icon" style={{ background: "#dcfce7", color: "#16a34a" }}>✅</div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-val">{prospectForm.geoTargets.length}</div>
            <div className="stat-lbl">Target Towns</div>
          </div>
          <div className="stat-icon" style={{ background: "#f3e8ff", color: "#9333ea" }}>🗺️</div>
        </div>
      </div>

      <section className="panel" id="prospects">
        <div className="header-row">
          <h2 className="section-title">Auto-Prospector Settings</h2>
          <div className="actions-inline">
            <button disabled={busy === "prospect"} type="button" onClick={runProspectRequest}>
              {busy === "prospect" ? "Running..." : "Run Prospecting"}
            </button>
            <button
              disabled={busy === "preload-schools"}
              type="button"
              className="secondary-btn"
              onClick={preloadSchools}
            >
              {busy === "preload-schools" ? "Preloading..." : "Preload Schools"}
            </button>
            <button type="button" className="secondary-btn" onClick={exportApprovedCsv}>
              Export Approved (CSV)
            </button>
            <button type="button" className="secondary-btn" onClick={() => setProspectorOpen((v) => !v)}>
              {prospectorOpen ? "Collapse" : "Expand"}
            </button>
          </div>
        </div>
        {busy === "prospect" ? (
          <div className="progress-wrap">
            <div className="progress-label">
              Prospecting in progress... {prospectForm.geoTargets.length} towns, {prospectForm.maxResultsPerQuery} results/query
            </div>
            <div className="progress-track"><div className="progress-bar" style={{ width: `${progressPct}%` }} /></div>
          </div>
        ) : null}
        {!prospectorOpen ? (
          <div className="settings-group" style={{ marginTop: 12 }}>
            <div className="filters-bar" style={{ marginBottom: 10 }}>
              <div className="filter-group">
                <span className="filter-label">State</span>
                <select
                  value={stateCode}
                  onChange={(e) => {
                    const next = e.target.value;
                    setStateCode(next);
                    setCountyName("");
                  }}
                >
                  <option value="">Select state</option>
                  {stateOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="filter-group">
                <span className="filter-label">County</span>
                <select value={countyName} onChange={(e) => setCountyName(e.target.value)}>
                  <option value="">Select county</option>
                  {countyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="filter-group">
                <span className="filter-label">County towns</span>
                <button type="button" onClick={addCountyTowns} disabled={!countyName}>Add All County Towns</button>
              </div>
              <div className="filter-group">
                <span className="filter-label">Geo targets</span>
                <div className="badge-input-wrap">
                  {prospectForm.geoTargets.map((v) => <span key={v} className="chip chip-geo" onClick={() => removeBadge("geoTargets", v)}>{v} ×</span>)}
                  <input value={newGeo} onChange={(e) => setNewGeo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addBadge("geoTargets", newGeo, setNewGeo); } }} placeholder="Add geo target(s): comma/newline + Enter" />
                </div>
              </div>

              <div className="filter-group">
                <span className="filter-label">Run options</span>
                <div className="actions-inline">
                  <input
                    aria-label="Results"
                    type="number"
                    min={0}
                    max={100}
                    value={prospectForm.maxResultsPerQuery}
                    onChange={(e) =>
                      setProspectForm({
                        ...prospectForm,
                        maxResultsPerQuery: Number.isFinite(Number(e.target.value))
                          ? Math.max(0, Math.min(100, Number(e.target.value)))
                          : 50,
                      })
                    }
                    style={{ width: 96 }}
                  />
                  <span style={{ color: "#52698f", fontSize: 13 }}>Results</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {prospectorOpen ? (
          <form onSubmit={runProspect} className="grid settings-grid">
            <div className="settings-group">
              <h3 className="settings-title">Target Libraries</h3>
              <div style={{ display: "flex", gap: "1rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <input
                    type="checkbox"
                    checked={prospectForm.prospectPublicLibraries}
                    onChange={(e) => setProspectForm({ ...prospectForm, prospectPublicLibraries: e.target.checked })}
                  />
                  Public Libraries
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <input
                    type="checkbox"
                    checked={prospectForm.prospectSchoolLibraries}
                    onChange={(e) => setProspectForm({ ...prospectForm, prospectSchoolLibraries: e.target.checked })}
                  />
                  School Libraries
                </label>
              </div>
            </div>
          </form>
        ) : null}
      </section>

      <section className="panel">
        <div style={{ marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <h2 className="section-title" style={{ marginBottom: 4 }}>Find Contacts & Organizations</h2>
            <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
              Search across saved contacts by Town, County, Zip Code, Name, Title, or Organization.
            </p>
          </div>

          <GeoSearchBar
            initialValue={searchQuery}
            onSearchChange={(q, r) => {
              setSearchQuery(q);
              setResolvedGeo(r);
            }}
            onProspectLocation={handleProspectGeo}
          />

          {searchQuery && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8fafc", padding: "0.75rem 1rem", borderRadius: "0.75rem", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 13, color: "#334155" }}>
                Found <strong>{searchFilteredContacts.length}</strong> matching contacts for &quot;<strong>{searchQuery}</strong>&quot;
                {resolvedGeo?.primaryLabel && <span style={{ color: "#64748b" }}> ({resolvedGeo.primaryLabel})</span>}
              </div>

              {searchFilteredContacts.length === 0 && resolvedGeo && (
                <button
                  type="button"
                  onClick={() => handleProspectGeo(resolvedGeo)}
                  style={{ background: "#0284c7", color: "#fff", border: "none", padding: "0.4rem 0.8rem", borderRadius: "0.5rem", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  ⚡ Prospect {resolvedGeo.primaryLabel} Now
                </button>
              )}
            </div>
          )}
        </div>

        <h2 className="section-title">Review Queue</h2>
        <div className="filters-bar">
          <div className="filter-group">
            <span className="filter-label">Status</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="pending_review">pending review</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
              <option value="all">all</option>
            </select>
          </div>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => {
              setSearchQuery("");
              setResolvedGeo(null);
              setStatusFilter("pending_review");
            }}
          >
            Reset Filters
          </button>
        </div>
        <div className="actions-inline queue-actions">
          <button type="button" className="secondary-btn" onClick={toggleSelectAll}>{selected.size ? "Clear Selection" : "Select Pending"}</button>
          <button type="button" onClick={bulkApprove} disabled={!selected.size}>Approve Selected</button>
          <button type="button" className="danger-btn" onClick={bulkReject} disabled={!selected.size}>Reject Selected</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th></th><th>Name</th><th>Title</th><th>Organization</th><th>Email</th><th>Lifecycle</th><th>Actions</th></tr></thead>
            <tbody>
              {searchFilteredContacts.map((c) => (
                <tr key={c.id}>
                  <td><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} /></td>
                  <td>{renderEditableCell(c, "fullName")}</td><td>{renderEditableCell(c, "title")}</td><td>{renderEditableCell(c, "orgName")}</td>
                  <td>{renderEditableCell(c, "email")}</td>
                  <td><span className={`badge ${lifecycleClass(c)}`}>{lifecycleLabel(c)}</span></td>
                    <td>
                      <div className="actions-inline table-actions">
                        <button type="button" className="secondary-btn" onClick={() => openSourcePreview(c)} title="Preview scraped webpage text snippet">
                          👁️ Source
                        </button>
                        {c.status !== "approved" && (
                          <button type="button" className="btn-approve" onClick={() => approve(c.id)}>✓ Approve</button>
                        )}
                        {c.status !== "rejected" && (
                          <button type="button" className="btn-reject" onClick={() => reject(c.id)}>✕ Reject</button>
                        )}
                      </div>
                    </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="header-row">
          <h2 className="section-title">Approved</h2>
          <button type="button" className="secondary-btn" onClick={() => setApprovedGrouped((v) => !v)}>
            {approvedGrouped ? "Flat List" : "Group by Organization"}
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Title</th><th>Organization</th><th>Email</th><th>Lifecycle</th><th>Actions</th></tr></thead>
            <tbody>
              {(approvedGrouped
                ? approvedBySchool.flatMap(([orgName, rows]) => [
                    { __group: true as const, orgName, count: rows.length },
                    ...rows,
                  ])
                : approvedContacts
              ).map((row, idx) => {
                if ("__group" in row) {
                  return (
                    <tr key={`group-${row.orgName}-${idx}`}>
                      <td colSpan={7} style={{ background: "#eef3fb", fontWeight: 700 }}>
                        {row.orgName} ({row.count})
                      </td>
                    </tr>
                  );
                }
                const c = row;
                return (
                <tr key={c.id}>
                  <td>{renderEditableCell(c, "fullName")}</td>
                  <td>{renderEditableCell(c, "title")}</td>
                  <td>{renderEditableCell(c, "orgName")}</td>
                  <td>{renderEditableCell(c, "email")}</td>
                  <td><span className={`badge ${lifecycleClass(c)}`}>{lifecycleLabel(c)}</span></td>
                  <td>
                    <div className="actions-inline table-actions">
                      <button
                        className="secondary-btn"
                        title="Open Gmail Draft"
                        onClick={() => openGmailDraft(c)}
                      >
                        Send
                      </button>
                      <button
                        className="secondary-btn"
                        title="Move to Rejected"
                        onClick={() => reject(c.id)}
                        style={{ padding: "6px 12px", minWidth: 28, opacity: 0.98, color: "#d92d20", background: "transparent", borderColor: "transparent", fontSize: 28, fontWeight: 700, lineHeight: 1, cursor: "pointer" }}
                      >
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="header-row">
          <h2 className="section-title">Rejected</h2>
          <button type="button" className="secondary-btn" onClick={() => setRejectedOpen((v) => !v)}>
            {rejectedOpen ? "Collapse" : "Expand"}
          </button>
        </div>
        {rejectedOpen ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Title</th><th>Organization</th><th>Email</th><th>Lifecycle</th><th>Actions</th></tr></thead>
              <tbody>
                {rejectedContacts.map((c) => (
                  <tr key={c.id}>
                    <td>{renderEditableCell(c, "fullName")}</td>
                    <td>{renderEditableCell(c, "title")}</td>
                    <td>{renderEditableCell(c, "orgName")}</td>
                    <td>{renderEditableCell(c, "email")}</td>
                    <td><span className={`badge ${lifecycleClass(c)}`}>{lifecycleLabel(c)}</span></td>
                    <td>
                      <div className="actions-inline table-actions">
                        {c.status !== "approved" && (
                          <button type="button" className="btn-approve" onClick={() => approve(c.id)}>✓ Approve</button>
                        )}
                        {c.status !== "rejected" && (
                          <button type="button" className="btn-reject" onClick={() => reject(c.id)}>✕ Reject</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {previewContact && previewData && (
        <div style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#ffffff", borderRadius: 16, width: "100%", maxWidth: 640, maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)", border: "1px solid #e2e8f0" }}>
            {/* Modal Header */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8fafc" }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#0284c7", letterSpacing: "0.05em" }}>
                  Source Page Preview
                </div>
                <h3 style={{ margin: "2px 0 0", fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
                  {previewContact.fullName} — {previewContact.title}
                </h3>
              </div>
              <button onClick={() => setPreviewContact(null)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Organization & Web Page</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b", marginTop: 2 }}>{previewData.pageTitle}</div>
                {previewData.url ? (
                  <a href={previewData.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#0284c7", wordBreak: "break-all", display: "inline-block", marginTop: 4 }}>
                    🔗 Open Original Webpage ({previewData.url}) ↗
                  </a>
                ) : null}
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 6 }}>
                  Scraped Text Snippet ({previewContact.email})
                </div>
                {previewData.loading ? (
                  <div style={{ padding: 24, textAlign: "center", color: "#64748b", fontSize: 13, background: "#f8fafc", borderRadius: 8 }}>
                    Fetching live webpage text snippet...
                  </div>
                ) : (
                  <div style={{ background: "#0f172a", color: "#e2e8f0", padding: 14, borderRadius: 10, fontSize: 13, fontFamily: "monospace", lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 240, overflowY: "auto" }}>
                    {previewData.snippet}
                  </div>
                )}
              </div>

              {/* Quick Title Edit in Modal */}
              <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", padding: 12, borderRadius: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#0369a1", marginBottom: 6 }}>Clarify / Update Title</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={previewContact.title}
                    onChange={(e) => {
                      const nextTitle = e.target.value;
                      setPreviewContact({ ...previewContact, title: nextTitle });
                      setContacts((prev) => prev.map((c) => c.id === previewContact.id ? { ...c, title: nextTitle } : c));
                    }}
                    placeholder="e.g. Library Media Specialist"
                    style={{ flex: 1, padding: "6px 10px", fontSize: 13 }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void approve(previewContact.id);
                      setPreviewContact(null);
                    }}
                    className="btn-approve"
                    style={{ whiteSpace: "nowrap" }}
                  >
                    ✓ Save & Approve
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast-pill toast-${toast.type}`}>
          <span>{toast.msg}</span>
        </div>
      )}
    </AppShell>
  );
}

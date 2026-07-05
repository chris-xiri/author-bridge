"use client";

import { FormEvent, useEffect, useState } from "react";
import { ALL_STATES, GEO_DATA } from "@/lib/geo-data";
import { AppShell } from "@/components/app-shell";

type Contact = {
  id: string;
  orgName: string;
  fullName: string;
  title: string;
  email: string;
  status: string;
  outreachStatus: string;
  sourceUrl: string;
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
  const [lastRunDebug, setLastRunDebug] = useState<Record<string, unknown> | null>(null);
  const [progressPct, setProgressPct] = useState(0);
  const [prospectorOpen, setProspectorOpen] = useState(false);
  const [advancedTargetingOpen, setAdvancedTargetingOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("pending_review");
  const [rejectedOpen, setRejectedOpen] = useState(false);
  const [approvedGrouped, setApprovedGrouped] = useState(true);
  const [editing, setEditing] = useState<{ id: string; field: "fullName" | "title" | "orgName" | "email" } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [countyName, setCountyName] = useState("");
  const [manualCounty, setManualCounty] = useState("");
  const [prospectForm, setProspectForm] = useState({
    campaignName: "May Librarian Outreach",
    maxResultsPerQuery: 50,
    geoTargets: [] as string[],
    prospectPublicLibraries: true,
    prospectSchoolLibraries: true,
  });
  const [newGeo, setNewGeo] = useState("");

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
            } else if (event === "done") {
              setProgressPct(100);
              const debug = data.debug ?? {};
              setLastRunDebug(debug);
              const perGeo = Array.isArray(debug.perGeoStats) ? (debug.perGeoStats as Array<{ geo: string; accepted: number }>) : [];
              const geosWithContacts = perGeo.filter((g) => (g.accepted ?? 0) > 0).length;
              setUiNotice(`Prospecting complete. Discovered ${data.discoveredCount ?? 0}, queued ${data.queuedForReviewCount ?? 0}. Coverage: ${geosWithContacts}/${prospectForm.geoTargets.length} towns produced contacts.`);
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
      setLastRunDebug(null);
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

  async function approve(id: string) {
    await fetch(`/api/contacts/${id}/approve`, { method: "POST" });
    await loadContacts();
  }

  async function reject(id: string) {
    await fetch(`/api/contacts/${id}/reject`, { method: "POST" });
    await loadContacts();
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
    const current = field === "schoolLevel" ? schoolLevelLabel(contact.schoolLevel) : (contact[field] || "");
    setEditValue((current || "").toString());
  }

  function normalizeSchoolLevelInput(value: string) {
    const v = value.trim().toLowerCase();
    if (v.includes("elementary")) return "elementary";
    if (v.includes("middle")) return "middle";
    if (v.includes("high")) return "high";
    if (v.includes("university") || v.includes("college")) return "university";
    return "unknown";
  }

  async function commitInlineEdit(contact: Contact, field: "fullName" | "title" | "orgName" | "email") {
    const trimmed = editValue.trim();
    setEditing(null);
    try {
      if (field === "schoolLevel") {
        const normalized = normalizeSchoolLevelInput(trimmed);
        if (normalized === (contact.schoolLevel || "unknown")) return;
        await updateContactField(contact.id, field, normalized);
        setUiNotice("Saved.");
        return;
      }
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
    const displayValue = field === "schoolLevel" ? schoolLevelLabel(contact.schoolLevel) : contact[field];
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
    for (const id of Array.from(selected)) {
      await fetch(`/api/contacts/${id}/approve`, { method: "POST" });
    }
    setSelected(new Set());
    await loadContacts();
  }

  async function bulkReject() {
    for (const id of Array.from(selected)) {
      await fetch(`/api/contacts/${id}/reject`, { method: "POST" });
    }
    setSelected(new Set());
    await loadContacts();
  }


  function toggleLevel(level: string) {
    setProspectForm((prev) => {
      const has = prev.schoolLevels.includes(level);
      return {
        ...prev,
        schoolLevels: has ? prev.schoolLevels.filter((v) => v !== level) : [...prev.schoolLevels, level],
      };
    });
  }

  function splitBulkValues(value: string) {
    return value
      .split(/[\n,;|]+/)
      .map((v) => v.trim())
      .filter(Boolean);
  }

  function addBadge(
    key: "geoTargets" | "keywords" | "includeTerms" | "excludeTerms",
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

  function removeBadge(key: "geoTargets" | "keywords" | "includeTerms" | "excludeTerms", value: string) {
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
    (levelFilter === "all" ? true : (c.schoolLevel ?? "unknown") === levelFilter) &&
    (roleFilter === "all" ? true : (c.roleBucket ?? "library_support") === roleFilter) &&
    (statusFilter === "all" ? true : c.status === statusFilter),
  );
  const pendingContacts = filteredContacts.filter((c) => c.status === "pending_review");
  const decidedContacts = contacts.filter((c) =>
    (levelFilter === "all" ? true : (c.schoolLevel ?? "unknown") === levelFilter) &&
    (roleFilter === "all" ? true : (c.roleBucket ?? "library_support") === roleFilter) &&
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

  function schoolLevelLabel(level?: string) {
    const v = (level || "unknown").toLowerCase();
    if (v === "elementary") return "Elementary School";
    if (v === "middle") return "Middle School";
    if (v === "high") return "High School";
    if (v === "university") return "University";
    return "Unknown";
  }

  return (
    <AppShell title="AuthorBridge Librarian CRM" subtitle="Prospecting queue and review workflow.">
      {uiError ? <div className="error-banner">{uiError}</div> : null}
      {uiNotice ? <div className="notice-banner">{uiNotice}</div> : null}
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
                <span className="filter-label">School levels</span>
                <div className="actions-inline level-toggles">
                  {["elementary", "middle", "high", "university"].map((level) => (
                    <button key={level} type="button" className={prospectForm.schoolLevels.includes(level) ? "toggle-on" : "toggle-off"} onClick={() => toggleLevel(level)}>
                      {prospectForm.schoolLevels.includes(level) ? "✓ " : ""}{level}
                    </button>
                  ))}
                </div>
              </div>
              <div className="filter-group">
                <span className="filter-label">Run filters</span>
                <div className="actions-inline">
                  <label>
                    <input
                      type="checkbox"
                      checked={prospectForm.schoolsOnly}
                      onChange={(e) => setProspectForm({ ...prospectForm, schoolsOnly: e.target.checked })}
                      style={{ marginRight: 8 }}
                    />
                    Schools only
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={prospectForm.strictGeo}
                      onChange={(e) => setProspectForm({ ...prospectForm, strictGeo: e.target.checked })}
                      style={{ marginRight: 8 }}
                    />
                    Strict geo
                  </label>
                  <input
                    aria-label="Results"
                    type="number"
                    min={5}
                    max={100}
                    value={prospectForm.maxResultsPerQuery}
                    onChange={(e) =>
                      setProspectForm({
                        ...prospectForm,
                        maxResultsPerQuery: Number.isFinite(Number(e.target.value))
                          ? Math.max(5, Math.min(100, Number(e.target.value)))
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
      {lastRunDebug ? (
        <section className="panel">
          <h2 className="section-title">Last Run Diagnostics</h2>
          <div className="diag-rows">
            <div className="filter-group">
              <span className="filter-label">Funnel summary</span>
              {lastRunDebug.funnel ? (
                <ul style={{ maxWidth: 1300, margin: 0, paddingLeft: 18, fontSize: 13, color: "#445b7f", lineHeight: 1.5 }}>
                  <li>Queries executed: {String((lastRunDebug.funnel as { queriesExecuted?: number }).queriesExecuted ?? 0)}</li>
                  <li>SERP results returned: {String((lastRunDebug.funnel as { serpResults?: number }).serpResults ?? 0)}</li>
                  <li>URLs visited: {String((lastRunDebug.funnel as { urlsVisited?: number }).urlsVisited ?? 0)}</li>
                  <li>Candidate contacts extracted: {String((lastRunDebug.funnel as { candidateContacts?: number }).candidateContacts ?? 0)}</li>
                  <li>Dropped duplicate email: {String((lastRunDebug.funnel as { dropped?: { duplicateEmail?: number } }).dropped?.duplicateEmail ?? 0)}</li>
                  <li>Dropped missing email: {String((lastRunDebug.funnel as { dropped?: { missingEmail?: number } }).dropped?.missingEmail ?? 0)}</li>
                  <li>Dropped role mismatch: {String((lastRunDebug.funnel as { dropped?: { role?: number } }).dropped?.role ?? 0)}</li>
                  <li>Dropped confidence: {String((lastRunDebug.funnel as { dropped?: { confidence?: number } }).dropped?.confidence ?? 0)}</li>
                  <li>Dropped schools-only filter: {String((lastRunDebug.funnel as { dropped?: { schoolsOnly?: number } }).dropped?.schoolsOnly ?? 0)}</li>
                  <li>Dropped name/email validation: {String((lastRunDebug.funnel as { dropped?: { nameEmailValidation?: number } }).dropped?.nameEmailValidation ?? 0)}</li>
                  <li>Queued final: {String((lastRunDebug.funnel as { queued?: number }).queued ?? 0)}</li>
                </ul>
              ) : (
                <div style={{ maxWidth: 900, fontSize: 13, color: "#445b7f" }}>No funnel summary available.</div>
              )}
            </div>
            <div className="filter-group">
              <span className="filter-label">1) Executed Google Queries</span>
              {Array.isArray(lastRunDebug.executedQueries) && lastRunDebug.executedQueries.length ? (
                <ul style={{ maxWidth: 1300, margin: 0, paddingLeft: 18, fontSize: 13, color: "#445b7f", lineHeight: 1.5 }}>
                  {(lastRunDebug.executedQueries as string[]).slice(0, 80).map((v, idx) => (
                    <li key={`executed-query-${idx}`}>{v}</li>
                  ))}
                </ul>
              ) : (
                <div style={{ maxWidth: 900, fontSize: 13, color: "#445b7f" }}>No query log available.</div>
              )}
            </div>
            <div className="filter-group">
              <span className="filter-label">2) Failed queries (with error reason)</span>
              {Array.isArray(lastRunDebug.failedQueryDetails) && lastRunDebug.failedQueryDetails.length ? (
                <ul style={{ maxWidth: 1300, margin: 0, paddingLeft: 18, fontSize: 13, color: "#445b7f", lineHeight: 1.5 }}>
                  {(lastRunDebug.failedQueryDetails as Array<{ query: string; error: string }>).slice(0, 40).map((v, idx) => (
                    <li key={`failed-query-${idx}`}><strong>{v.error}</strong>: {v.query}</li>
                  ))}
                </ul>
              ) : (
                Array.isArray(lastRunDebug.failedQueries) && lastRunDebug.failedQueries.length ? (
                  <ul style={{ maxWidth: 1200, margin: 0, paddingLeft: 18, fontSize: 13, color: "#445b7f", lineHeight: 1.5 }}>
                    {(lastRunDebug.failedQueries as string[]).slice(0, 20).map((v, idx) => (
                      <li key={`failed-query-legacy-${idx}`}>{v}</li>
                    ))}
                  </ul>
                ) : <div style={{ maxWidth: 900, fontSize: 13, color: "#445b7f" }}>None</div>
              )}
            </div>
            <div className="filter-group">
              <span className="filter-label">3) SERP rejected samples</span>
              {Array.isArray(lastRunDebug.serpRejectedSamples) && lastRunDebug.serpRejectedSamples.length ? (
                <ul style={{ maxWidth: 1200, margin: 0, paddingLeft: 18, fontSize: 13, color: "#445b7f", lineHeight: 1.5 }}>
                  {(lastRunDebug.serpRejectedSamples as string[]).slice(0, 20).map((v, idx) => (
                    <li key={`serp-rejected-${idx}`}>{v}</li>
                  ))}
                </ul>
              ) : (
                <div style={{ maxWidth: 900, fontSize: 13, color: "#445b7f" }}>None</div>
              )}
            </div>
            <div className="filter-group">
              <span className="filter-label">4) Schools-only filtered samples</span>
              {Array.isArray(lastRunDebug.schoolsOnlyFilteredSamples) && lastRunDebug.schoolsOnlyFilteredSamples.length ? (
                <ul style={{ maxWidth: 1200, margin: 0, paddingLeft: 18, fontSize: 13, color: "#445b7f", lineHeight: 1.5 }}>
                  {(lastRunDebug.schoolsOnlyFilteredSamples as string[]).slice(0, 20).map((v, idx) => (
                    <li key={`schools-only-${idx}`}>{v}</li>
                  ))}
                </ul>
              ) : (
                <div style={{ maxWidth: 900, fontSize: 13, color: "#445b7f" }}>None</div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      <section className="panel">
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
              {pendingContacts.map((c) => (
                <tr key={c.id}>
                  <td><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} /></td>
                  <td>{renderEditableCell(c, "fullName")}</td><td>{renderEditableCell(c, "title")}</td><td>{renderEditableCell(c, "orgName")}</td>
                  <td>{renderEditableCell(c, "email")}</td>
                  <td><span className={`badge ${lifecycleClass(c)}`}>{lifecycleLabel(c)}</span></td>
                  <td>
                    <div className="actions-inline table-actions">
                      <button onClick={() => approve(c.id)}>Approve</button>
                      <button className="danger-btn" onClick={() => reject(c.id)}>Reject</button>
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
                      <button onClick={() => approve(c.id)}>Move to Approved</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}

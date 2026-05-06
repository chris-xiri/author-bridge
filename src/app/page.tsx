"use client";

import { FormEvent, useEffect, useState } from "react";
import { ALL_STATES, GEO_DATA } from "@/lib/geo-data";
import { AppShell } from "@/components/app-shell";

type Contact = {
  id: string;
  schoolName?: string;
  fullName: string;
  title: string;
  roleBucket?: "librarian_core" | "library_support" | "non_library";
  roleConfidence?: "high" | "medium";
  schoolLevel?: string;
  email: string;
  confidence: string;
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
  const [editing, setEditing] = useState<{ id: string; field: "fullName" | "title" | "schoolName" | "schoolLevel" | "email" } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [countyName, setCountyName] = useState("");
  const [manualCounty, setManualCounty] = useState("");
  const [prospectForm, setProspectForm] = useState({
    campaignName: "May Librarian Outreach",
    maxResultsPerQuery: 50,
    geoTargets: [] as string[],
    keywords: ["school librarian", "library media specialist"],
    strictGeo: true,
    schoolsOnly: true,
    includeTerms: ["librarian", "library media specialist"],
    excludeTerms: ["principal", "assistant principal", "dean", "superintendent"],
    schoolLevels: ["elementary", "middle", "high", "university"] as string[],
  });
  const [newGeo, setNewGeo] = useState("");
  const [newKeyword, setNewKeyword] = useState("");
  const [newIncludeTerm, setNewIncludeTerm] = useState("");
  const [newExcludeTerm, setNewExcludeTerm] = useState("");

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
    if (!res.ok) return;
    const list = ((body ?? []) as Campaign[]).filter((c) => c.status !== "archived");
    setCampaigns(list);
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
          keywords: Array.isArray(parsed.keywords) ? parsed.keywords : prev.keywords,
          includeTerms: Array.isArray(parsed.includeTerms) ? parsed.includeTerms : prev.includeTerms,
          excludeTerms: Array.isArray(parsed.excludeTerms) ? parsed.excludeTerms : prev.excludeTerms,
          schoolLevels: Array.isArray(parsed.schoolLevels) ? parsed.schoolLevels : prev.schoolLevels,
          schoolsOnly: typeof parsed.schoolsOnly === "boolean" ? parsed.schoolsOnly : prev.schoolsOnly,
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
    setProgressPct(12);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000);
    try {
      const res = await fetch("/api/prospect/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          campaignName: prospectForm.campaignName,
          geoTargets: prospectForm.geoTargets,
          keywords: prospectForm.keywords,
          maxResultsPerQuery: prospectForm.maxResultsPerQuery,
          strictGeo: prospectForm.strictGeo,
          schoolsOnly: prospectForm.schoolsOnly,
          includeTerms: prospectForm.includeTerms,
          excludeTerms: prospectForm.excludeTerms,
          schoolLevels: prospectForm.schoolLevels,
        }),
      });
      const body = await parseJsonSafe(res);
      if (!res.ok) {
        setUiError(body.error || "Run prospecting failed");
        setProgressPct(0);
        setBusy("");
        return;
      }
      setProgressPct(100);
      const debug = body?.debug ?? {};
      setLastRunDebug(debug);
      const perGeo = Array.isArray(debug.perGeoStats) ? (debug.perGeoStats as Array<{ geo: string; accepted: number }>) : [];
      const geosWithContacts = perGeo.filter((g) => (g.accepted ?? 0) > 0).length;
      const blockers = [
        debug.levelFilteredCount ? `level filtered ${debug.levelFilteredCount}` : "",
        debug.roleFilteredCount ? `role filtered ${debug.roleFilteredCount}` : "",
        debug.confidenceFilteredCount ? `confidence filtered ${debug.confidenceFilteredCount}` : "",
        debug.schoolsOnlyFilteredCount ? `schools-only filtered ${debug.schoolsOnlyFilteredCount}` : "",
        debug.includeExcludeFilteredCount ? `include/exclude filtered ${debug.includeExcludeFilteredCount}` : "",
        debug.nameValidationFilteredCount ? `name/email filtered ${debug.nameValidationFilteredCount}` : "",
        debug.serpRejectedCount ? `SERP rejected ${debug.serpRejectedCount}` : "",
      ].filter(Boolean).join(", ");
      setUiNotice(
        `Prospecting complete. Discovered ${body.discoveredCount ?? 0}, queued ${body.queuedForReviewCount ?? 0}${
          body?.debug?.aiExtractedCount !== undefined ? `, AI extracted ${body.debug.aiExtractedCount}` : ""
        }. Coverage: ${geosWithContacts}/${prospectForm.geoTargets.length} towns produced contacts${
          (body.discoveredCount ?? 0) === 0 && blockers ? `. Filters: ${blockers}.` : "."
        }`,
      );
      setBusy("");
      await loadContacts();
    } catch (error) {
      setUiError(
        error instanceof Error && error.name === "AbortError"
          ? "Prospecting timed out after 180s. Try a smaller geo scope (county/town) and rerun."
          : error instanceof Error
            ? error.message
            : "Unexpected prospecting error",
      );
      setProgressPct(0);
      setBusy("");
      setLastRunDebug(null);
    } finally {
      clearTimeout(timeout);
      setTimeout(() => setProgressPct(0), 1000);
    }
  }

  async function runProspect(e: FormEvent) {
    e.preventDefault();
    await runProspectRequest();
  }

  async function preloadSchools() {
    setBusy("preload-schools");
    setUiError("");
    setUiNotice("");
    try {
      const res = await fetch("/api/prospect/preload-schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "national",
          stateCodes: [],
          geoTargets: prospectForm.geoTargets,
          includePublic: true,
          includePrivate: true,
          maxRecords: 200000,
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

  async function updateContactField(id: string, field: "fullName" | "title" | "schoolName" | "schoolLevel" | "email", value: string) {
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

  function beginInlineEdit(contact: Contact, field: "fullName" | "title" | "schoolName" | "schoolLevel" | "email") {
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

  async function commitInlineEdit(contact: Contact, field: "fullName" | "title" | "schoolName" | "schoolLevel" | "email") {
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

  function renderEditableCell(contact: Contact, field: "fullName" | "title" | "schoolName" | "schoolLevel" | "email", fallback = "—") {
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

  useEffect(() => {
    if (busy !== "prospect") return;
    const timer = setInterval(() => setProgressPct((prev) => (prev >= 92 ? prev : prev + 4)), 700);
    return () => clearInterval(timer);
  }, [busy]);

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
      const key = (c.schoolName || "Unknown School").trim();
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
              <h3 className="settings-title">Execution</h3>
              <label>Campaign Name</label>
              <input value={prospectForm.campaignName} onChange={(e) => setProspectForm({ ...prospectForm, campaignName: e.target.value })} />
              <label>Results</label>
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
              />
              <label>
                <input
                  type="checkbox"
                  checked={prospectForm.strictGeo}
                  onChange={(e) => setProspectForm({ ...prospectForm, strictGeo: e.target.checked })}
                  style={{ marginRight: 8 }}
                />
                Strict local geo match
              </label>
              <p style={{ margin: "0 0 8px 0", color: "#52698f", fontSize: 13 }}>
                Keeps results tightly tied to selected towns/county (reduces out-of-area pages, but may miss some edge cases).
              </p>
            </div>
            <div className="settings-group">
              <h3 className="settings-title">Geo Targets</h3>
              <div className="geo-builder">
                <div className="actions-inline">
                  <label>State</label>
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
                  <label>County</label>
                  <select value={countyName} onChange={(e) => setCountyName(e.target.value)}>
                    <option value="">Select county</option>
                    {countyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button type="button" onClick={() => void addCountyTowns()} disabled={!countyName || busy === "county-towns"}>
                    {busy === "county-towns" ? "Loading towns..." : "Add All County Towns"}
                  </button>
                </div>
                <div className="actions-inline" style={{ marginTop: 8 }}>
                  <label>Manual county</label>
                  <input
                    value={manualCounty}
                    onChange={(e) => setManualCounty(e.target.value)}
                    placeholder="e.g. Maricopa"
                  />
                  <button type="button" onClick={addManualCountyTarget} disabled={!stateCode || !manualCounty.trim()}>
                    Add County Target
                  </button>
                </div>
              </div>
              <div className="badge-input-wrap">
                {prospectForm.geoTargets.map((v) => <span key={v} className="chip chip-geo" onClick={() => removeBadge("geoTargets", v)}>{v} ×</span>)}
                <input value={newGeo} onChange={(e) => setNewGeo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addBadge("geoTargets", newGeo, setNewGeo); } }} placeholder="Add geo target(s): comma/newline + Enter" />
              </div>
            </div>
            <div className="settings-group">
              <div className="header-row">
                <h3 className="settings-title">Advanced targeting</h3>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setAdvancedTargetingOpen((v) => !v)}
                >
                  {advancedTargetingOpen ? "Hide" : "Show"}
                </button>
              </div>
              {advancedTargetingOpen ? (
                <>
                  <label>Keywords</label>
                  <div className="badge-input-wrap">
                    {prospectForm.keywords.map((v) => <span key={v} className="chip chip-keyword" onClick={() => removeBadge("keywords", v)}>{v} ×</span>)}
                    <input value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addBadge("keywords", newKeyword, setNewKeyword); } }} placeholder="Add keyword(s): comma/newline + Enter" />
                  </div>
                  <label>Include terms</label>
                  <div className="badge-input-wrap">
                    {prospectForm.includeTerms.map((v) => <span key={v} className="chip chip-include" onClick={() => removeBadge("includeTerms", v)}>{v} ×</span>)}
                    <input value={newIncludeTerm} onChange={(e) => setNewIncludeTerm(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addBadge("includeTerms", newIncludeTerm, setNewIncludeTerm); } }} placeholder="Add include term(s): comma/newline + Enter" />
                  </div>
                  <label>Exclude terms</label>
                  <div className="badge-input-wrap">
                    {prospectForm.excludeTerms.map((v) => <span key={v} className="chip chip-exclude" onClick={() => removeBadge("excludeTerms", v)}>{v} ×</span>)}
                    <input value={newExcludeTerm} onChange={(e) => setNewExcludeTerm(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addBadge("excludeTerms", newExcludeTerm, setNewExcludeTerm); } }} placeholder="Add exclude term(s): comma/newline + Enter" />
                  </div>
                  <label>
                    <input
                      type="checkbox"
                      checked={prospectForm.schoolsOnly}
                      onChange={(e) => setProspectForm({ ...prospectForm, schoolsOnly: e.target.checked })}
                      style={{ marginRight: 8 }}
                    />
                    Schools only (filter)
                  </label>
                  <p style={{ margin: "0 0 8px 0", color: "#52698f", fontSize: 13 }}>
                    Includes K-12/school district domains and excludes public-library style domains.
                  </p>
                </>
              ) : (
                <p style={{ margin: 0, color: "#52698f" }}>
                  Keywords and include/exclude terms are set to recommended defaults.
                </p>
              )}
            </div>
            <div className="settings-group">
              <h3 className="settings-title">School levels</h3>
              <div className="actions-inline level-toggles">
                {["elementary", "middle", "high", "university"].map((level) => (
                  <button key={level} type="button" className={prospectForm.schoolLevels.includes(level) ? "toggle-on" : "toggle-off"} onClick={() => toggleLevel(level)}>
                    {prospectForm.schoolLevels.includes(level) ? "✓ " : ""}{level}
                  </button>
                ))}
              </div>
            </div>
          </form>
        ) : null}
      </section>
      {lastRunDebug ? (
        <section className="panel">
          <h2 className="section-title">Last Run Diagnostics</h2>
          <div className="filters-bar">
            <div className="filter-group">
              <span className="filter-label">Schools-only filtered samples</span>
              {Array.isArray(lastRunDebug.schoolsOnlyFilteredSamples) && lastRunDebug.schoolsOnlyFilteredSamples.length ? (
                <ul style={{ maxWidth: 1100, margin: 0, paddingLeft: 18, fontSize: 13, color: "#445b7f", lineHeight: 1.5 }}>
                  {(lastRunDebug.schoolsOnlyFilteredSamples as string[]).slice(0, 12).map((v, idx) => (
                    <li key={`schools-only-${idx}`}>{v}</li>
                  ))}
                </ul>
              ) : (
                <div style={{ maxWidth: 900, fontSize: 13, color: "#445b7f" }}>None</div>
              )}
            </div>
            <div className="filter-group">
              <span className="filter-label">SERP rejected samples</span>
              {Array.isArray(lastRunDebug.serpRejectedSamples) && lastRunDebug.serpRejectedSamples.length ? (
                <ul style={{ maxWidth: 1100, margin: 0, paddingLeft: 18, fontSize: 13, color: "#445b7f", lineHeight: 1.5 }}>
                  {(lastRunDebug.serpRejectedSamples as string[]).slice(0, 12).map((v, idx) => (
                    <li key={`serp-rejected-${idx}`}>{v}</li>
                  ))}
                </ul>
              ) : (
                <div style={{ maxWidth: 900, fontSize: 13, color: "#445b7f" }}>None</div>
              )}
            </div>
            <div className="filter-group">
              <span className="filter-label">Failed queries</span>
              {Array.isArray(lastRunDebug.failedQueries) && lastRunDebug.failedQueries.length ? (
                <ul style={{ maxWidth: 1100, margin: 0, paddingLeft: 18, fontSize: 13, color: "#445b7f", lineHeight: 1.5 }}>
                  {(lastRunDebug.failedQueries as string[]).slice(0, 12).map((v, idx) => (
                    <li key={`failed-query-${idx}`}>{v}</li>
                  ))}
                </ul>
              ) : (
                <div style={{ maxWidth: 900, fontSize: 13, color: "#445b7f" }}>None</div>
              )}
            </div>
            <div className="filter-group">
              <span className="filter-label">Executed Google Queries</span>
              {Array.isArray(lastRunDebug.executedQueries) && lastRunDebug.executedQueries.length ? (
                <ul style={{ maxWidth: 1200, margin: 0, paddingLeft: 18, fontSize: 13, color: "#445b7f", lineHeight: 1.5 }}>
                  {(lastRunDebug.executedQueries as string[]).slice(0, 60).map((v, idx) => (
                    <li key={`executed-query-${idx}`}>{v}</li>
                  ))}
                </ul>
              ) : (
                <div style={{ maxWidth: 900, fontSize: 13, color: "#445b7f" }}>No query log available.</div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <h2 className="section-title">Review Queue</h2>
        <div className="filters-bar">
          <div className="filter-group">
            <span className="filter-label">School level</span>
            <div className="filter-chips">
              {["all", "elementary", "middle", "high", "university", "unknown"].map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  className={levelFilter === lvl ? "filter-chip active" : "filter-chip"}
                  onClick={() => setLevelFilter(lvl)}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <span className="filter-label">Role</span>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="all">all roles</option>
              <option value="librarian_core">librarian core</option>
              <option value="library_support">library support</option>
              <option value="non_library">non library</option>
            </select>
          </div>
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
              setLevelFilter("all");
              setRoleFilter("all");
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
            <thead><tr><th></th><th>Name</th><th>Title</th><th>School Name</th><th>School Level</th><th>Email</th><th>Lifecycle</th><th>Actions</th></tr></thead>
            <tbody>
              {pendingContacts.map((c) => (
                <tr key={c.id}>
                  <td><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} /></td>
                  <td>{renderEditableCell(c, "fullName")}</td><td>{renderEditableCell(c, "title")}</td><td>{renderEditableCell(c, "schoolName")}</td><td>{renderEditableCell(c, "schoolLevel")}</td>
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
            {approvedGrouped ? "Flat List" : "Group by School"}
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Title</th><th>School Name</th><th>School Level</th><th>Email</th><th>Lifecycle</th><th>Actions</th></tr></thead>
            <tbody>
              {(approvedGrouped
                ? approvedBySchool.flatMap(([schoolName, rows]) => [
                    { __group: true as const, schoolName, count: rows.length },
                    ...rows,
                  ])
                : approvedContacts
              ).map((row, idx) => {
                if ("__group" in row) {
                  return (
                    <tr key={`group-${row.schoolName}-${idx}`}>
                      <td colSpan={7} style={{ background: "#eef3fb", fontWeight: 700 }}>
                        {row.schoolName} ({row.count})
                      </td>
                    </tr>
                  );
                }
                const c = row;
                return (
                <tr key={c.id}>
                  <td>{renderEditableCell(c, "fullName")}</td>
                  <td>{renderEditableCell(c, "title")}</td>
                  <td>{renderEditableCell(c, "schoolName")}</td>
                  <td>{renderEditableCell(c, "schoolLevel")}</td>
                  <td>{renderEditableCell(c, "email")}</td>
                  <td><span className={`badge ${lifecycleClass(c)}`}>{lifecycleLabel(c)}</span></td>
                  <td>
                    <div className="actions-inline table-actions">
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
              <thead><tr><th>Name</th><th>Title</th><th>School Name</th><th>School Level</th><th>Email</th><th>Lifecycle</th><th>Actions</th></tr></thead>
              <tbody>
                {rejectedContacts.map((c) => (
                  <tr key={c.id}>
                    <td>{renderEditableCell(c, "fullName")}</td>
                    <td>{renderEditableCell(c, "title")}</td>
                    <td>{renderEditableCell(c, "schoolName")}</td>
                    <td>{renderEditableCell(c, "schoolLevel")}</td>
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

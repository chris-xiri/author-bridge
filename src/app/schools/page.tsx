"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";

type SchoolContact = {
  id: string;
  fullName: string;
  title: string;
  schoolLevel?: string;
  email: string;
  status: "pending_review" | "approved" | "rejected";
  outreachStatus: "none" | "sent" | "bounced" | "replied" | "unsubscribed";
};

type SchoolRow = {
  id: string;
  schoolName: string;
  city: string;
  state: string;
  county: string;
  zip: string;
  website: string;
  contacts: SchoolContact[];
};

function levelLabel(level?: string) {
  const v = (level ?? "unknown").toLowerCase();
  if (v === "elementary") return "Elementary School";
  if (v === "middle") return "Middle School";
  if (v === "high") return "High School";
  if (v === "university") return "University";
  return "Unknown";
}

function lifecycleLabel(c: SchoolContact) {
  if (c.status === "pending_review") return "pending review";
  if (c.status === "rejected") return "rejected";
  if (c.status === "approved" && c.outreachStatus === "sent") return "sent";
  if (c.status === "approved") return "approved - not sent";
  return c.status;
}

function lifecycleClass(c: SchoolContact) {
  if (c.status === "rejected") return "badge-rejected";
  if (c.status === "approved" && c.outreachStatus === "sent") return "badge-sent";
  if (c.status === "approved") return "badge-approved";
  return "badge-pending_review";
}

export default function SchoolsPage() {
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [uiError, setUiError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [county, setCounty] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [stateOptions, setStateOptions] = useState<string[]>([]);
  const [countyOptions, setCountyOptions] = useState<string[]>([]);
  const [cityOptions, setCityOptions] = useState<string[]>([]);

  async function parseJsonSafe(res: Response) {
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { error: `Invalid JSON response (${res.status})` };
    }
  }

  async function loadSchools() {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (state) params.set("state", state);
    if (county) params.set("county", county);
    if (city) params.set("city", city);
    if (zip.trim()) params.set("zip", zip.trim());
    const res = await fetch(`/api/schools?${params.toString()}`);
    const body = await parseJsonSafe(res);
    if (!res.ok) {
      setUiError(body.error || "Failed to load schools");
      return;
    }
    setSchools((body.items ?? []) as SchoolRow[]);
    setStateOptions((body.filters?.states ?? []) as string[]);
    setCountyOptions((body.filters?.counties ?? []) as string[]);
    setCityOptions((body.filters?.cities ?? []) as string[]);
  }

  useEffect(() => {
    void loadSchools();
  }, [q, state, county, city, zip]);

  return (
    <AppShell title="Schools" subtitle="School-centric view with contacts nested under each school.">
      {uiError ? <div className="error-banner">{uiError}</div> : null}
      <section className="panel">
        <h2 className="section-title">School Filters</h2>
        <div className="filters-bar">
          <div className="filter-group">
            <span className="filter-label">Search</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="School/contact/email..." />
          </div>
          <div className="filter-group">
            <span className="filter-label">State</span>
            <select value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">All states</option>
              {stateOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <span className="filter-label">County</span>
            <select value={county} onChange={(e) => setCounty(e.target.value)}>
              <option value="">All counties</option>
              {countyOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <span className="filter-label">City/Town</span>
            <select value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">All cities</option>
              {cityOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <span className="filter-label">ZIP</span>
            <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="e.g. 11040" />
          </div>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => {
              setQ("");
              setState("");
              setCounty("");
              setCity("");
              setZip("");
            }}
          >
            Reset
          </button>
        </div>
      </section>

      <section className="panel">
        <h2 className="section-title">All Schools ({schools.length})</h2>
      </section>

      {schools.map((group) => {
        const isOpen = expanded.has(group.id);
        const pending = group.contacts.filter((c) => c.status === "pending_review").length;
        const approved = group.contacts.filter((c) => c.status === "approved").length;
        const sent = group.contacts.filter((c) => c.status === "approved" && c.outreachStatus === "sent").length;
        return (
          <section className="panel" key={group.id}>
            <div className="header-row">
              <div>
                <h3 className="section-title" style={{ marginBottom: 4 }}>{group.schoolName}</h3>
                <div style={{ color: "#5a6c8a", fontSize: 13, marginBottom: 6 }}>
                  {[group.city, group.county, group.state, group.zip].filter(Boolean).join(" • ")}
                </div>
                <div className="actions-inline">
                  <span className="badge badge-pending_review">pending {pending}</span>
                  <span className="badge badge-approved">approved {approved}</span>
                  <span className="badge badge-sent">sent {sent}</span>
                  <span className="badge badge-none">total contacts {group.contacts.length}</span>
                </div>
              </div>
              <button
                type="button"
                className="secondary-btn"
                onClick={() =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(group.id)) next.delete(group.id);
                    else next.add(group.id);
                    return next;
                  })
                }
              >
                {isOpen ? "Collapse" : "Expand"}
              </button>
            </div>
            {isOpen ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Title</th>
                      <th>School Level</th>
                      <th>Email</th>
                      <th>Lifecycle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.contacts.map((c) => (
                      <tr key={c.id}>
                        <td>{c.fullName || "—"}</td>
                        <td>{c.title || "—"}</td>
                        <td>{levelLabel(c.schoolLevel)}</td>
                        <td>{c.email}</td>
                        <td><span className={`badge ${lifecycleClass(c)}`}>{lifecycleLabel(c)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        );
      })}
    </AppShell>
  );
}


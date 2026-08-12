"use client";

export const dynamic = "force-dynamic";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";

type Campaign = { id: string; name: string; subject: string; status: string };
type PreviewContact = {
  id: string;
  fullName: string;
  email: string;
  title: string;
  schoolLevel: string;
};

const TEMPLATE_VARIABLES = [
  { label: "Full Name", token: "{{fullName}}" },
  { label: "Email", token: "{{email}}" },
  { label: "Title", token: "{{title}}" },
  { label: "School Level", token: "{{schoolLevel}}" },
];

export default function TemplatesPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [previewContacts, setPreviewContacts] = useState<PreviewContact[]>([]);
  const [previewContactId, setPreviewContactId] = useState("");
  const [busy, setBusy] = useState("");
  const [uiError, setUiError] = useState("");
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [lastFocusedField, setLastFocusedField] = useState<"subject" | "body">("body");
  const [campaignForm, setCampaignForm] = useState({
    name: "Librarian Intro #1",
    subject: "Library partnership idea for {{fullName}}",
    body: "Hi {{fullName}},\n\nI run AuthorBridge and wanted to share a reading engagement idea for your library.",
  });

  async function parseJsonSafe(res: Response) {
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { error: `Invalid JSON response (${res.status})` };
    }
  }

  async function loadCampaigns() {
    const res = await fetch("/api/campaigns");
    const body = await parseJsonSafe(res);
    if (!res.ok) {
      setUiError(body.error || "Failed to load campaigns");
      return;
    }
    setCampaigns(body ?? []);
  }

  useEffect(() => {
    void loadCampaigns();
    void loadPreviewContacts();
  }, []);

  async function loadPreviewContacts() {
    const res = await fetch("/api/contacts?status=approved&page=1");
    const body = await parseJsonSafe(res);
    if (!res.ok) return;
    const items = ((body.items ?? []) as PreviewContact[]).slice(0, 50);
    setPreviewContacts(items);
    if (items.length && !previewContactId) setPreviewContactId(items[0].id);
  }

  async function createCampaignSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy("campaign");
    await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(campaignForm),
    });
    setBusy("");
    await loadCampaigns();
  }

  async function sendCampaign(id: string) {
    setBusy(`send-${id}`);
    await fetch(`/api/campaigns/${id}/send`, { method: "POST" });
    setBusy("");
    await loadCampaigns();
  }

  async function archiveCampaign(id: string) {
    setBusy(`archive-${id}`);
    await fetch(`/api/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "archive" }),
    });
    setBusy("");
    await loadCampaigns();
  }

  async function unarchiveCampaign(id: string) {
    setBusy(`archive-${id}`);
    await fetch(`/api/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unarchive" }),
    });
    setBusy("");
    await loadCampaigns();
  }

  async function deleteCampaign(id: string) {
    setBusy(`delete-${id}`);
    await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    setBusy("");
    await loadCampaigns();
  }

  function insertVariable(token: string, preferredField?: "subject" | "body") {
    const field = preferredField ?? lastFocusedField;
    if (field === "subject") {
      const el = subjectRef.current;
      if (!el) {
        setCampaignForm((prev) => ({ ...prev, subject: `${prev.subject}${token}` }));
        return;
      }
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;
      const next = `${campaignForm.subject.slice(0, start)}${token}${campaignForm.subject.slice(end)}`;
      setCampaignForm((prev) => ({ ...prev, subject: next }));
      requestAnimationFrame(() => {
        el.focus();
        const p = start + token.length;
        el.setSelectionRange(p, p);
      });
      return;
    }
    const el = bodyRef.current;
    if (!el) {
      setCampaignForm((prev) => ({ ...prev, body: `${prev.body}${token}` }));
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const next = `${campaignForm.body.slice(0, start)}${token}${campaignForm.body.slice(end)}`;
    setCampaignForm((prev) => ({ ...prev, body: next }));
    requestAnimationFrame(() => {
      el.focus();
      const p = start + token.length;
      el.setSelectionRange(p, p);
    });
  }

  const selectedPreviewContact =
    previewContacts.find((c) => c.id === previewContactId) ??
    ({
      id: "",
      fullName: "Sample Librarian",
      email: "sample@example.org",
      title: "Library Media Specialist",
      schoolLevel: "middle",
    } as PreviewContact);

  function renderPreview(text: string) {
    return text
      .replaceAll("{{fullName}}", selectedPreviewContact.fullName || "there")
      .replaceAll("{{email}}", selectedPreviewContact.email || "")
      .replaceAll("{{title}}", selectedPreviewContact.title || "")
      .replaceAll("{{schoolLevel}}", selectedPreviewContact.schoolLevel || "");
  }

  const activeCampaigns = campaigns.filter((c) => c.status !== "archived");
  const archivedCampaigns = campaigns.filter((c) => c.status === "archived");

  return (
    <AppShell title="Templates" subtitle="Create and send campaign templates.">
      {uiError ? <div className="error-banner">{uiError}</div> : null}
      <section className="panel">
        <h2 className="section-title">Create Template</h2>
        <div className="filters-bar">
          <div className="filter-group">
            <span className="filter-label">Insert Variable</span>
            <div className="filter-chips">
              {TEMPLATE_VARIABLES.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  className="filter-chip"
                  onClick={() => insertVariable(v.token)}
                  title={`Insert ${v.token}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <span className="filter-label">Preview Contact</span>
            <select value={previewContactId} onChange={(e) => setPreviewContactId(e.target.value)}>
              {previewContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName || c.email} - {c.email}
                </option>
              ))}
            </select>
          </div>
        </div>
        <form onSubmit={createCampaignSubmit} className="grid">
          <label>Name</label>
          <input value={campaignForm.name} onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })} />
          <label>Subject</label>
          <input
            ref={subjectRef}
            value={campaignForm.subject}
            onFocus={() => setLastFocusedField("subject")}
            onChange={(e) => setCampaignForm({ ...campaignForm, subject: e.target.value })}
          />
          <label>Body (supports {"{{fullName}}"})</label>
          <textarea
            ref={bodyRef}
            rows={4}
            onFocus={() => setLastFocusedField("body")}
            value={campaignForm.body}
            onChange={(e) => setCampaignForm({ ...campaignForm, body: e.target.value })}
          />
          <button type="submit" disabled={busy === "campaign"}>{busy === "campaign" ? "Creating..." : "Create Campaign"}</button>
        </form>
        <div className="panel" style={{ marginTop: 12 }}>
          <h3 className="section-title">Live Preview</h3>
          <p><strong>To:</strong> {selectedPreviewContact.fullName} ({selectedPreviewContact.email})</p>
          <p><strong>Subject:</strong> {renderPreview(campaignForm.subject)}</p>
          <div style={{ whiteSpace: "pre-wrap" }}>{renderPreview(campaignForm.body)}</div>
        </div>
      </section>
      <section className="panel">
        <h2 className="section-title">Active Templates</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeCampaigns.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.status}</td>
                  <td>
                    <div className="actions-inline table-actions">
                      <button onClick={() => sendCampaign(c.id)} disabled={busy === `send-${c.id}`}>{busy === `send-${c.id}` ? "Sending..." : "Send"}</button>
                      <button className="secondary-btn" onClick={() => archiveCampaign(c.id)} disabled={busy === `archive-${c.id}`}>Archive</button>
                      <button className="danger-btn" onClick={() => deleteCampaign(c.id)} disabled={busy === `delete-${c.id}`}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!activeCampaigns.length ? (
                <tr><td colSpan={3}>No active templates yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2 className="section-title">Archived Templates</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {archivedCampaigns.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.status}</td>
                  <td>
                    <div className="actions-inline table-actions">
                      <button className="secondary-btn" onClick={() => unarchiveCampaign(c.id)} disabled={busy === `archive-${c.id}`}>Restore</button>
                      <button className="danger-btn" onClick={() => deleteCampaign(c.id)} disabled={busy === `delete-${c.id}`}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!archivedCampaigns.length ? (
                <tr><td colSpan={3}>No archived templates.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

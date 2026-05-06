"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";

type EventRow = {
  id: string;
  eventType: string;
  contactId: string;
  campaignId: string;
  createdAt: string;
};

export default function TimelinePage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [uiError, setUiError] = useState("");

  async function parseJsonSafe(res: Response) {
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { error: `Invalid JSON response (${res.status})` };
    }
  }

  async function loadEvents() {
    const res = await fetch("/api/events");
    const body = await parseJsonSafe(res);
    if (!res.ok) {
      setUiError(body.error || "Failed to load events");
      return;
    }
    setEvents(body ?? []);
  }

  useEffect(() => {
    void loadEvents();
  }, []);

  return (
    <AppShell title="Timeline" subtitle="Delivery, bounce, and reply activity.">
      {uiError ? <div className="error-banner">{uiError}</div> : null}
      <section className="panel">
        <h2 className="section-title">Email Event Timeline</h2>
        <div className="list">
          {events.map((e) => (
            <div key={e.id} className="item">
              <span>{e.createdAt}</span>
              <span>{e.eventType} / {e.contactId} / {e.campaignId}</span>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

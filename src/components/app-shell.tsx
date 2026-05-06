"use client";

import { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

export function AppShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <main className="app-shell">
      <aside className="left-nav">
        <div className="nav-brand">AUTHORBRIDGE</div>
        <nav className="nav-list">
          <a className={`nav-item ${pathname === "/" ? "active" : ""}`} href="/">
            Prospects
          </a>
          <a className={`nav-item ${pathname === "/schools" ? "active" : ""}`} href="/schools">
            Schools
          </a>
          <a className={`nav-item ${pathname === "/templates" ? "active" : ""}`} href="/templates">
            Templates
          </a>
          <a className={`nav-item ${pathname === "/timeline" ? "active" : ""}`} href="/timeline">
            Timeline
          </a>
        </nav>
      </aside>
      <div className="container">
        <div className="header-row xiri-header">
          <div>
            <h1>{title}</h1>
            <p className="muted">{subtitle}</p>
          </div>
          <button onClick={logout}>Log out</button>
        </div>
        {children}
      </div>
    </main>
  );
}

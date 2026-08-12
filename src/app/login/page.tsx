"use client";

import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Invalid email or password. Please check your credentials.");
      return;
    }
    window.location.href = "/";
  }

  return (
    <main className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-brand-icon">🌉</div>
          <span className="login-logo">AuthorBridge</span>
          <span className="login-sub">CRM</span>
        </div>
        <p className="login-desc">Sign in to access librarian prospecting and outreach.</p>
        <form onSubmit={submit} className="login-form">
          <div className="login-field">
            <label htmlFor="email">Work Email</label>
            <input
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="admin@authorbridge.com"
              required
            />
          </div>
          <div className="login-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="••••••••••••"
              required
            />
          </div>
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? "Signing in..." : "Sign in to Dashboard →"}
          </button>
          {error ? <div className="login-error">{error}</div> : null}
        </form>
      </div>
    </main>
  );
}

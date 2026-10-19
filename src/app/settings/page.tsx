"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type AccountUser = {
  id: string;
  email: string;
  name?: string | null;
};

export default function SettingsPage() {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    async function loadUser() {
      try {
        const response = await fetch("/api/auth/user");
        if (!response.ok) {
          if (mounted) router.push("/login");
          return;
        }
        const data = (await response.json()) as AccountUser | null;
        if (!mounted) return;
        setUser(data);
        setName(data?.name ?? "");
      } catch {
        if (mounted) router.push("/login");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadUser();
    return () => {
      mounted = false;
    };
  }, [router]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    try {
      const response = await fetch("/api/auth/user", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Unable to update profile");
      setUser(data);
      setSuccess("Profile updated successfully.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to update profile.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  if (loading) {
    return (
      <main className="auth-page">
        <h1>Loading profile…</h1>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="auth-page">
        <h1>Account required</h1>
        <p>Please sign in to view and update your profile.</p>
        <div className="auth-actions">
          <Link href="/login">Sign in</Link>
          <Link href="/register">Create account</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page settings-page">
      <div className="settings-card">
        <div className="settings-header">
          <div>
            <p className="eyebrow">Your account</p>
            <h1>Profile settings</h1>
          </div>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="secondary-button"
          >
            Sign out
          </button>
        </div>

        <form
          onSubmit={(event) => void handleSave(event)}
          className="auth-form"
        >
          <label>
            Display name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              maxLength={80}
            />
          </label>

          <label>
            Email address
            <input value={user.email} readOnly />
          </label>

          {error && <div className="error">{error}</div>}
          {success && <div className="success">{success}</div>}

          <div className="auth-actions">
            <button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
            <Link href="/" className="secondary-link">
              Back to support
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}

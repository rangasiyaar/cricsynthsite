"use client";

import { createClient } from "@/lib/supabase";
import { useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "https://api.cricsynthesis.in";

interface Key {
  key_id: string;
  label: string | null;
  daily_limit: number;
  created_at: string;
  last_used_at: string | null;
  requests_today: number;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function KeysPage() {
  const [keys, setKeys] = useState<Key[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const copyRef = useRef<HTMLInputElement>(null);

  async function getToken(): Promise<string> {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  }

  async function loadKeys() {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/v1/user/keys`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(await res.text());
      setKeys(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load keys");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadKeys(); }, []);

  async function createKey() {
    if (!newLabel.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/v1/user/keys`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel.trim() }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail ?? "Failed"); }
      const data = await res.json();
      setNewKey(data.raw_key);
      setNewLabel("");
      await loadKeys();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create key");
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(keyId: string) {
    if (!confirm("Revoke this key? All requests using it will stop working immediately.")) return;
    setRevoking(keyId);
    try {
      const token = await getToken();
      await fetch(`${API}/v1/user/keys/${keyId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      await loadKeys();
    } catch {
      setError("Failed to revoke key");
    } finally {
      setRevoking(null);
    }
  }

  function copyKey() {
    if (newKey) {
      navigator.clipboard.writeText(newKey).catch(() => {
        if (copyRef.current) { copyRef.current.select(); document.execCommand("copy"); }
      });
    }
  }

  const s = { card: { background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "0.75rem" } as React.CSSProperties };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>API Keys</h1>
        <p className="text-sm mt-1" style={{ color: "#6b7280" }}>Create and manage keys for your applications. Max 5 keys per account.</p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl text-sm" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5" }}>
          {error}
        </div>
      )}

      {/* New key modal */}
      {newKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "#0b0e16", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center mb-4" style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h2 className="text-lg font-bold text-white mb-1">Key created</h2>
            <p className="text-sm mb-4" style={{ color: "#f87171" }}>⚠ Copy this key now — it won&apos;t be shown again.</p>
            <div className="flex gap-2 mb-5">
              <input ref={copyRef} readOnly value={newKey} className="flex-1 rounded-lg px-3 py-2 text-xs font-mono" style={{ background: "#111621", border: "1px solid rgba(255,255,255,0.08)", color: "#818cf8" }} />
              <button onClick={copyKey} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: "rgba(99,102,241,0.15)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.3)" }}>Copy</button>
            </div>
            <button onClick={() => setNewKey(null)} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg,#6366f1,#a855f7)" }}>
              Done — I&apos;ve saved it
            </button>
          </div>
        </div>
      )}

      {/* Create key form */}
      <div className="mb-8 p-5" style={s.card}>
        <h2 className="text-sm font-semibold text-white mb-3">Create a new key</h2>
        <div className="flex gap-3">
          <input
            type="text" placeholder="Key label (e.g. Production, Testing)"
            value={newLabel} onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => e.key === "Enter" && createKey()}
            maxLength={64}
            className="flex-1 rounded-lg px-3 py-2 text-sm"
            style={{ background: "#111621", border: "1px solid rgba(255,255,255,0.08)", color: "#f0f0f5" }}
          />
          <button
            onClick={createKey} disabled={creating || !newLabel.trim()}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-opacity"
            style={{ background: "linear-gradient(135deg,#6366f1,#a855f7)", opacity: creating || !newLabel.trim() ? 0.5 : 1, cursor: creating ? "not-allowed" : "pointer" }}
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
      </div>

      {/* Keys list */}
      {loading ? (
        <div className="space-y-3">
          {[1,2].map(i => <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.02)" }} />)}
        </div>
      ) : keys.length === 0 ? (
        <div className="text-center py-12" style={{ color: "#6b7280" }}>
          <p className="text-sm">No keys yet. Create one above.</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
          {/* Header */}
          <div className="grid grid-cols-[1fr_100px_100px_90px] gap-4 px-5 py-2.5" style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {["Label", "Created", "Last used", "Today"].map(h => (
              <span key={h} className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#4b5263", letterSpacing: "0.08em" }}>{h}</span>
            ))}
          </div>
          {keys.map((k, i) => (
            <div key={k.key_id} className="grid grid-cols-[1fr_100px_100px_90px] gap-4 items-center px-5 py-3.5" style={{ borderBottom: i < keys.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
              <div>
                <p className="text-sm font-medium text-white">{k.label ?? "Unnamed"}</p>
                <p className="text-xs mt-0.5 font-mono" style={{ color: "#4b5263" }}>{k.key_id.slice(0,8)}…</p>
              </div>
              <span className="text-xs" style={{ color: "#6b7280" }}>{formatDate(k.created_at)}</span>
              <span className="text-xs" style={{ color: "#6b7280" }}>{k.last_used_at ? formatDate(k.last_used_at) : "—"}</span>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-white">{k.requests_today} / {k.daily_limit}</span>
                <button
                  onClick={() => revokeKey(k.key_id)}
                  disabled={revoking === k.key_id}
                  className="text-xs px-2 py-1 rounded-md transition-colors"
                  style={{ color: "#f87171", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}
                >
                  {revoking === k.key_id ? "…" : "Revoke"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

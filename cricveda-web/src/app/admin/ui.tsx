"use client";

import type { CSSProperties, ReactNode } from "react";

export const card: CSSProperties = {
  background: "rgba(255,255,255,0.025)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: "0.75rem",
};

export const input: CSSProperties = {
  background: "#111621",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#f0f0f5",
  borderRadius: "0.5rem",
  padding: "0.5rem 0.75rem",
  fontSize: "0.875rem",
  width: "100%",
};

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        {sub && <p className="text-sm mt-1" style={{ color: "#6b7280" }}>{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9ca3b0" }}>{label}</span>
      {children}
      {hint && <span className="text-xs" style={{ color: "#4b5263" }}>{hint}</span>}
    </label>
  );
}

export function Button({
  children, onClick, disabled, variant = "primary", type = "button",
}: {
  children: ReactNode; onClick?: () => void; disabled?: boolean;
  variant?: "primary" | "ghost" | "danger"; type?: "button" | "submit";
}) {
  const styles: Record<string, CSSProperties> = {
    primary: { background: "#5980a6", color: "#fff", border: "1px solid #5980a6" },
    ghost: { background: "transparent", color: "#d1d5db", border: "1px solid rgba(255,255,255,0.15)" },
    danger: { background: "transparent", color: "#f87171", border: "1px solid rgba(248,113,113,0.4)" },
  };
  return (
    <button
      type={type} onClick={onClick} disabled={disabled}
      className="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      style={styles[variant]}
    >
      {children}
    </button>
  );
}

export function Notice({ kind, children }: { kind: "error" | "ok"; children: ReactNode }) {
  const s: CSSProperties = kind === "error"
    ? { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5" }
    : { background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", color: "#6ee7b7" };
  return <div role={kind === "error" ? "alert" : "status"} className="mb-4 p-3 rounded-lg text-sm" style={s}>{children}</div>;
}

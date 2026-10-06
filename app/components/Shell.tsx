"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function Logo() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="4" aria-hidden="true">
      <path d="M4 15L13 24L4 33" strokeLinecap="square" />
      <path d="M22 15V40M30 15V40M38 15V40M20 11H29M31 11H40" />
    </svg>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(null);
  useEffect(() => setTheme(document.documentElement.getAttribute("data-theme")), []);
  const flip = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("cs-theme", next); } catch {}
    setTheme(next);
  };
  return (
    <button className="iconbtn" onClick={flip} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}

export function Nav() {
  const path = usePathname() || "/";
  const link = (href: string, label: string, cls = "") => (
    <Link href={href} className={`${cls} ${path.startsWith(href) && href !== "/" ? "active" : ""}`}>{label}</Link>
  );
  return (
    <header className="nav">
      <div className="wrap">
        <Link href="/" className="brand" aria-label="CricSynthesis home"><Logo /><span>CricSynthesis</span></Link>
        <nav>
          {link("/#matches", "Matches")}
          {link("/patterns/", "Patterns")}
          {link("/developers/", "API", "hide-sm")}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div>
          © CricSynthesis · Simulations, not certainties. Ball-by-ball data from{" "}
          <a href="https://cricsheet.org" target="_blank" rel="noreferrer">Cricsheet</a>; playing styles from the{" "}
          <a href="https://github.com/robjhyndman/cricketdata" target="_blank" rel="noreferrer">cricketdata</a> package
          (ESPNcricinfo profiles).
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <a href="https://in.linkedin.com/company/cricsynthesis" target="_blank" rel="noreferrer">LinkedIn</a>
          <a href="https://x.com/cricsynthesis" target="_blank" rel="noreferrer">X</a>
          <a href="https://instagram.com/cricsynthesis" target="_blank" rel="noreferrer">Instagram</a>
        </div>
      </div>
    </footer>
  );
}

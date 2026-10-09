"use client";
// Nav and footer: the same markup and classes as the website's js/layout.js, so both look identical.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useUser } from "@/lib/firebase";

export function Logo() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="4" aria-hidden="true">
      <path d="M4 15L13 24L4 33" strokeLinecap="square" />
      <path d="M22 15V40M30 15V40M20 11H29M31 11H40" />
      <path className="cs-cursor" d="M38 15V40" />
    </svg>
  );
}

function Brand() {
  return <Link href="/" className="cs-brand" aria-label="CricSynthesis home"><Logo /><span>Cric<b>Synthesis</b></span></Link>;
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.getAttribute("data-theme") === "dark"), []);
  const flip = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("cs-theme", next); } catch {}
    setDark(!dark);
  };
  return (
    <button type="button" className="cs-theme-toggle" onClick={flip} aria-label={`Switch to ${dark ? "light" : "dark"} mode`} title="Switch theme">
      <svg className="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" /></svg>
      <svg className="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></svg>
    </button>
  );
}

const LINKS: [string, string][] = [["/#matches", "Matches"], ["/patterns/", "Pattern Lab"], ["/developers/", "API"],
                                   ["/docs/", "Docs"], ["/playground/", "Playground"]];

function AccountLink({ className, onClick }: { className: string; onClick?: () => void }) {
  const user = useUser();
  if (user === undefined) return <span className={className} style={{ visibility: "hidden" }}>Sign in</span>;
  return user
    ? <Link href="/account/" className={className} onClick={onClick}>Account</Link>
    : <Link href="/login/" className={className} onClick={onClick}>Sign in</Link>;
}

export function Nav() {
  const path = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 10);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => setOpen(false), [path]);
  const cls = (href: string) => `nav-link${href !== "/" && !href.startsWith("/#") && path.startsWith(href) ? " active" : ""}`;
  return (
    <nav className={`nav${scrolled ? " scrolled" : ""}`} id="mainNav">
      <div className="nav-container">
        <div className="nav-logo"><Brand /></div>
        <div className="nav-links">
          {LINKS.map(([h, l]) => <Link key={h} href={h} className={cls(h)}>{l}</Link>)}
          <AccountLink className={`${cls("/login/")} nav-signin`} />
          <ThemeToggle />
        </div>
        <div className="mobile-nav">
          <AccountLink className="mobile-nav-link" />
          <ThemeToggle />
          <button type="button" className="cs-burger" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="csDrawer" onClick={() => setOpen(!open)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"><path className="b1" d="M4 7h16" /><path className="b2" d="M4 12h16" /><path className="b3" d="M4 17h16" /></svg>
          </button>
        </div>
      </div>
      <div className="cs-drawer" id="csDrawer" hidden={!open}>
        {LINKS.map(([h, l]) => <Link key={h} href={h} onClick={() => setOpen(false)}>{l}</Link>)}
        <AccountLink className="" onClick={() => setOpen(false)} />
      </div>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-main">
          <div className="footer-brand">
            <Brand />
            <p className="footer-tagline">Every match, simulated before the first ball.</p>
          </div>
          <div className="footer-links">
            <div className="footer-column">
              <h4 className="footer-heading">Match centre</h4>
              <Link href="/#matches" className="footer-link">Upcoming matches</Link>
              <Link href="/patterns/" className="footer-link">Pattern Lab</Link>
            </div>
            <div className="footer-column">
              <h4 className="footer-heading">Developers</h4>
              <Link href="/developers/" className="footer-link">API</Link>
              <Link href="/docs/" className="footer-link">Docs</Link>
              <Link href="/playground/" className="footer-link">Playground</Link>
              <Link href="/mcp/" className="footer-link">MCP</Link>
              <Link href="/developers/#plans" className="footer-link">Plans</Link>
            </div>
            <div className="footer-column">
              <h4 className="footer-heading">Company</h4>
              <Link href="/careers/" className="footer-link">Careers</Link>
              <Link href="/contact/" className="footer-link">Contact</Link>
              <Link href="/privacy/" className="footer-link">Privacy policy</Link>
              <Link href="/terms/" className="footer-link">Terms of service</Link>
              <Link href="/credits/" className="footer-link">Data credits</Link>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p className="footer-copyright">&copy; 2026 CricSynthesis. Probabilities from simulation, not certainties.</p>
          <div className="footer-social">
            <a href="https://in.linkedin.com/company/cricsynthesis" className="social-link" aria-label="CricSynthesis on LinkedIn" target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
            </a>
            <a href="https://x.com/cricsynthesis" className="social-link" aria-label="CricSynthesis on X" target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
            </a>
            <a href="https://instagram.com/cricsynthesis" className="social-link" aria-label="CricSynthesis on Instagram" target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" stroke="none" /></svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

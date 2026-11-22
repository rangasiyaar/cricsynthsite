"use client";
// Bot check on the public forms (contact, API access, job applications): Cloudflare Turnstile, free. The widget adds a
// hidden "cf-turnstile-response" field to the form it sits in; the API checks it (edge/src/turnstile.ts). Off until the
// site key is set at build time (NEXT_PUBLIC_TURNSTILE_SITE_KEY, from the repo variable TURNSTILE_SITE_KEY).
import { useEffect, useRef } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TS = { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id: string) => void };
declare global { interface Window { turnstile?: TS } }

let loading: Promise<TS | null> | null = null;
function load(): Promise<TS | null> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((ok) => {
    const s = Object.assign(document.createElement("script"), { src: SRC, async: true, defer: true });
    s.onload = () => ok(window.turnstile ?? null);
    s.onerror = () => { loading = null; ok(null); };
    document.head.append(s);
  });
  return loading;
}

/** The token from a form's widget ("" when the check is off or not done yet). */
export const turnstileToken = (form: HTMLFormElement | FormData): string =>
  String((form instanceof FormData ? form : new FormData(form)).get("cf-turnstile-response") ?? "");

/** A new token after a failed send (each token works once). */
export const resetTurnstile = () => { try { window.turnstile?.reset(); } catch { /* not loaded */ } };

export default function Turnstile({ action }: { action: string }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!SITE_KEY || !el.current) return;
    let id = "", live = true;
    load().then((ts) => {
      if (!ts || !live || !el.current) return;
      id = ts.render(el.current, { sitekey: SITE_KEY, action, theme: "auto", size: "flexible", appearance: "interaction-only" });
    });
    return () => { live = false; if (id) window.turnstile?.remove(id); };
  }, [action]);
  return SITE_KEY ? <div ref={el} className="cs-turnstile" style={{ margin: "8px 0" }} /> : null;
}

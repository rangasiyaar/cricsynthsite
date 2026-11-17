"use client";
// Optional analytics on the website, loaded only after consent (lib/consent.ts):
//  - Google Analytics 4 (analytics consent): page views (incl. client-side navigation) and the product events below.
//  - Microsoft Clarity (recordings consent): heatmaps and session recordings, off until CLARITY_ID is set.
// Never in the Android app's web view (it will ask for its own consent), on localhost, or for bots that don't run JS.
// Ads features stay off: ad_storage / ad_user_data / ad_personalization are always denied, Google signals disabled.
import { type Consent, getConsent, onConsent } from "./consent";
import { isNative } from "./firebase";

export const GA_ID = "G-898VXQ61MC";
export const CLARITY_ID = "";            // Microsoft Clarity project id; empty = off

type Gtag = (...args: unknown[]) => void;
declare global { interface Window { dataLayer?: unknown[]; gtag?: Gtag; clarity?: (...a: unknown[]) => void } }

let gaOn = false, clarityOn = false;

const devOptIn = () => { try { return localStorage.getItem("cs-analytics-dev") === "1"; } catch { return false; } };   // test on localhost
const allowed = () => typeof window !== "undefined" && !isNative() && !location.pathname.startsWith("/m/")
  && (!/^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname) || devOptIn());

function script(src: string) {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

function startGA() {
  if (gaOn || !GA_ID) return;
  gaOn = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer!.push(arguments); } as Gtag;   // eslint-disable-line prefer-rest-params
  window.gtag("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
  window.gtag("js", new Date());
  window.gtag("config", GA_ID, { allow_google_signals: false, allow_ad_personalization_signals: false });
  script(`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`);
}

function startClarity() {
  if (clarityOn || !CLARITY_ID) return;
  clarityOn = true;
  const c = (window.clarity = window.clarity || function (...a: unknown[]) { ((c as unknown as { q: unknown[] }).q ||= []).push(a); });
  script(`https://www.clarity.ms/tag/${CLARITY_ID}`);
  c("consent");
}

function apply(c: Consent | null) {
  if (!allowed() || !c) return;
  if (c.analytics) startGA();
  else if (gaOn) window.gtag?.("consent", "update", { analytics_storage: "denied" });
  if (c.recordings) startClarity();
  else if (clarityOn) window.clarity?.("consent", false);
}

let wired = false;
/** Called once by the consent banner on page load. */
export function initAnalytics() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  apply(getConsent());
  onConsent(apply);
}

/** A product event (GA4). Dropped unless analytics consent was given. Keep params free of personal data. */
export function track(name: string, params: Record<string, string | number | boolean | undefined> = {}) {
  if (!gaOn || !window.gtag) return;
  window.gtag("event", name, params);
}

/** Whether the banner should appear here (not in the app, not on localhost). */
export const consentApplies = allowed;

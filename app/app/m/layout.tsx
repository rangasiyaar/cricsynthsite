import type { Metadata, Viewport } from "next";
import { AppRuntime } from "@/components/App";
import { seo } from "@/lib/seo";
// The app ships its fonts (latin) so the first screen never waits on, or falls back from, Google Fonts.
import "@fontsource/barlow/latin-400.css";
import "@fontsource/barlow/latin-500.css";
import "@fontsource/barlow/latin-600.css";
import "@fontsource/barlow/latin-700.css";
import "@fontsource/barlow-condensed/latin-500.css";
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "./mobile.css";

// The Android app's screens. They also open in a phone browser, but they are not pages for search engines.
export const metadata: Metadata = seo("/m/", "CricSynthesis app", "Cricket match forecasts, MatchSynth Lab and fantasy picks.", { noindex: true });
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f2f2f3" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <><AppRuntime />{children}</>;
}

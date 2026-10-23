import type { Metadata, Viewport } from "next";
import { AppRuntime } from "@/components/App";
import { seo } from "@/lib/seo";
import "./mobile.css";

// The Android app's screens. They also open in a phone browser, but they are not pages for search engines.
export const metadata: Metadata = seo("/m/", "CricSynthesis app", "Cricket match forecasts, MatchSynth Lab and fantasy picks.", { noindex: true });
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f2f2f3" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <><AppRuntime />{children}</>;
}

import type { Metadata } from "next";
import { seo } from "@/lib/seo";

export const metadata: Metadata = seo("/pricing/", "Pricing | CricSynthesis",
  "Every match's Overview is free. CricSynthesis Pro opens the full match centre and MatchSynth Lab for ₹349 a month, with one day free. API plans from ₹0.");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

import type { Metadata } from "next";
import { seo } from "@/lib/seo";

export const metadata: Metadata = seo("/pricing/", "Pricing | CricSynthesis", "The match centre is free. Pro adds the full MatchSynth Lab, free during the beta. API plans for media, fantasy and broadcast teams.");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

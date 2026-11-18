import type { Metadata } from "next";
import ProOffer from "@/components/ProOffer";
import { seo } from "@/lib/seo";

// Design preview of the CricSynthesis Pro paywall (not linked, not indexed). The subscribe buttons are placeholders
// until payments are connected.
export const metadata: Metadata = seo("/pro/", "CricSynthesis Pro", "Every insight for every match, plus MatchSynth Lab.", { noindex: true });

export default function ProPage() {
  return <ProOffer />;
}

import type { Metadata } from "next";
import ProOffer from "@/components/ProOffer";
import { seo } from "@/lib/seo";

// CricSynthesis Pro: where locked tabs and MatchSynth Lab send accounts without Pro. The full pricing page (with the
// API plans) is /pricing/; this one stays out of search to avoid a duplicate.
export const metadata: Metadata = seo("/pro/", "CricSynthesis Pro", "Every insight for every match, plus MatchSynth Lab.", { noindex: true });

export default function ProPage() {
  return <ProOffer />;
}

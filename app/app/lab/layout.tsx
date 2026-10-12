import type { Metadata } from "next";
import { seo } from "@/lib/seo";

export const metadata: Metadata = seo("/lab/", "MatchSynth Lab | CricSynthesis", "Pick the XI, set the toss and conditions, and replay the match yourself. See how the forecast shifts before a ball is bowled.");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

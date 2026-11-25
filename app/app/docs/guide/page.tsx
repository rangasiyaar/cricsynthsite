// The guide as one continuous document (content in lib/guide.ts): sticky sidebar and "On this page" follow the reader.
// Each topic also has its own page (/docs/guide/<slug>/) for search and sharing.
import type { Metadata } from "next";
import { GuideDoc } from "@/components/Guide";
import { seo } from "@/lib/seo";

export const metadata: Metadata = seo("/docs/guide/", "Guide: how to read cricket forecasts | CricSynthesis",
  "How to read every CricSynthesis forecast, from win chance and projected scores to players, grounds, fantasy teams and MatchSynth Lab.");

export default function GuideHome() {
  return <div className="page-head guide-page" style={{ paddingBottom: 80 }}><GuideDoc /></div>;
}

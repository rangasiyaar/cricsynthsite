// Guide home: every page of the guide by group (content in lib/guide.ts).
import type { Metadata } from "next";
import { GuideCards, GuideNav } from "@/components/Guide";
import { seo } from "@/lib/seo";

export const metadata: Metadata = seo("/docs/guide/", "Guide: how to read cricket forecasts | CricSynthesis",
  "How to read every CricSynthesis forecast, from win chance and projected scores to players, grounds, fantasy teams and MatchSynth Lab.");

export default function GuideHome() {
  return (
    <div className="page-head" style={{ paddingBottom: 80 }}><div className="guide-layout">
      <GuideNav />
      <div className="guide-main">
        <p className="small muted guide-crumbs"><a href="/docs/">Docs</a> / Guide</p>
        <h1>Guide</h1>
        <p className="guide-lede">What every number on a match page means, and how to use it.</p>
        <GuideCards />
      </div>
    </div></div>
  );
}

// Guide home: every page of the guide by group (content in lib/guide.ts).
import type { Metadata } from "next";
import { GuideCards, GuideNav } from "@/components/Guide";
import { seo } from "@/lib/seo";

export const metadata: Metadata = seo("/docs/guide/", "Guide: how to read cricket forecasts | CricSynthesis",
  "A plain-words guide to every CricSynthesis forecast: win chance, scores, wickets, players, grounds, fantasy teams and MatchSynth Lab, and how to use them.");

export default function GuideHome() {
  return (
    <div className="page-head" style={{ paddingBottom: 80 }}><div className="guide-layout">
      <GuideNav />
      <div className="guide-main">
        <p className="small muted guide-crumbs"><a href="/docs/">Docs</a> / Guide</p>
        <h1>The guide</h1>
        <p className="guide-lede">What every number on a match page means, how to read it, and how it helps you make better calls:
          before the toss, during a chase and when you pick your fantasy team.</p>
        <GuideCards />
      </div>
    </div></div>
  );
}

// Docs home: how to use CricSynthesis, for fans (the platform) and for developers (the API).
import type { Metadata } from "next";
import DocsTabs from "@/components/DocsTabs";
import { seo } from "@/lib/seo";

export const metadata: Metadata = seo("/docs/", "How to use CricSynthesis | Docs",
  "How to use CricSynthesis: follow a match from the forecast to the result, or build with the CricSynthesis API.");

export default function Docs() {
  return (
    <div className="page-head docs-home" style={{ paddingBottom: 80 }}>
      <h1><span>How to use CricSynthesis</span></h1>
      <p className="cs-lede">Use it to follow the game, or build with it.</p>
      <DocsTabs />
    </div>
  );
}

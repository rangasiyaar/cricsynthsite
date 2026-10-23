import { seo } from "@/lib/seo";
import type { Metadata } from "next";
// The one place the data sources are credited — Cricsheet's licence (ODC-BY 1.0) requires attribution
// in any public use of its data. Linked quietly from the footer as "Data credits".
export const metadata: Metadata = seo("/credits/", "Data credits | CricSynthesis", "The data sources and licences behind CricSynthesis.");

export default function Credits() {
  return (
    <div className="page-head" style={{ maxWidth: 760, paddingBottom: 80 }}>
      <p className="cs-eyebrow">Legal</p>
      <h1 style={{ fontSize: "clamp(40px, 5vw, 64px)" }}>Data credits</h1>
      <ul className="small" style={{ color: "var(--cs-ink-2)", lineHeight: 1.7, paddingLeft: 18, marginTop: 20 }}>
        <li>Ball-by-ball match data from <a href="https://cricsheet.org" target="_blank" rel="noreferrer">Cricsheet</a>, made available under the{" "}
          <a href="https://opendatacommons.org/licenses/by/1-0/" target="_blank" rel="noreferrer">Open Data Commons Attribution License</a>.</li>
        <li>Player batting and bowling styles from the open-source cricketdata package.</li>
      </ul>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "MCP | CricSynthesis" };

export default function Mcp() {
  return (
    <section className="cs-hero" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div>
        <p className="cs-eyebrow"><span className="cs-tag cs-tag--soon">Coming soon</span></p>
        <h1><span>CricSynthesis MCP.</span><span>Cricket for AI agents.</span></h1>
        <p className="cs-lede">A Model Context Protocol server that lets assistants and agents query match forecasts, player analytics and simulations directly from the CricSynthesis API.</p>
        <div className="cs-hero-ctas">
          <Link className="cs-btn cs-btn--primary" href="/developers/#request-access">Get notified</Link>
        </div>
      </div>
    </section>
  );
}

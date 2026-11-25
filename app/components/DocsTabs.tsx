"use client";
// Docs home: "How to use CricSynthesis" in two tabs, one for fans using the site and app, one for developers using the
// API. The open tab follows the address (#platform / #developers), so either can be linked to. Old API anchors
// (/docs/#match-forecast) still go to the API reference.
import { useEffect, useState } from "react";
import Link from "next/link";
import { guideAnchor } from "@/lib/guide";

type Tab = "platform" | "developers";
const TABS: [Tab, string][] = [["platform", "CricSynthesis platform"], ["developers", "CricSynthesis for developers"]];

type Step = { title: string; text: React.ReactNode; link?: [string, string] };

const PLATFORM: Step[] = [
  { title: "Pick a match", text: "Open Matches and choose a game. Every match we cover gets its own page a day or two before it starts.",
    link: ["/matches/", "See today's matches"] },
  { title: "Read the Overview", text: "Who's favourite, what each side should score, when wickets are likely to fall and who to watch. It's free for every match.",
    link: [guideAnchor("win-chance-and-projected-scores"), "How to read it"] },
  { title: "Go deeper with Pro", text: "Pro opens the rest of the match page: scores over by over, every player's numbers, batter v bowler, the ground and our fantasy teams.",
    link: [guideAnchor("free-and-pro"), "What Pro adds"] },
  { title: "Pick your fantasy team", text: "Use our ready-made teams as they are, or as a starting point for your own.",
    link: [guideAnchor("pick-your-fantasy-team-in-5-minutes"), "Pick a team in 5 minutes"] },
  { title: "Try your own what-ifs", text: "In MatchSynth Lab, change the toss, the pitch or a player's form, or start from any score, and see how the match plays out.",
    link: ["/lab/", "Open MatchSynth Lab"] },
  { title: "See how we did", text: "After every match, each call we made is checked against the scorecard. Hits and misses are all there.",
    link: ["/matches/?f=finished", "See results"] },
];

const DEVELOPERS: Step[] = [
  { title: "Get an API key", text: "Sign up, then create a key from your account. The free plan gives you 200 calls a day.",
    link: ["/account/", "Go to your account"] },
  { title: "Make your first call", text: <>Ask for the matches we cover. Send your key in the <code>X-API-Key</code> header.
    <pre className="docs-code">{`curl "https://api.cricsynthesis.in/v1/matches" \\\n  -H "X-API-Key: cs_live_…"`}</pre></>,
    link: ["/playground/", "Try it in the playground"] },
  { title: "Find what you need", text: "Player and ground analytics, match forecasts, win chances from any score, fantasy picks and ready-made graphics. Every endpoint is listed with its options and a sample answer.",
    link: ["/docs/api/", "Open the API reference"] },
  { title: "Use it in an AI assistant", text: "Add CricSynthesis to Claude or another assistant by its web address, and ask about any player, ground or match.",
    link: ["/mcp/", "Set up the connector"] },
  { title: "Pick a plan", text: "Start free. Move to Plus when you need more calls and clean graphics, or talk to us about Business.",
    link: ["/developers/#plans", "See plans"] },
];

function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="docs-steps">
      {steps.map((s, n) => (
        <li key={s.title}>
          <span className="docs-step-n" aria-hidden="true">{n + 1}</span>
          <div>
            <h3>{s.title}</h3>
            <div className="docs-step-text">{s.text}</div>
            {s.link && <Link className="docs-step-link" href={s.link[0]}>{s.link[1]}</Link>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function DocsTabs() {
  const [tab, setTab] = useState<Tab>("platform");
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1);
      if (h === "platform" || h === "developers") setTab(h);
      else if (h) window.location.replace(`/docs/api/#${h}`);        // an old API reference anchor
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const choose = (t: Tab) => { setTab(t); history.replaceState(null, "", `#${t}`); };

  return (
    <>
      <div className="tabs docs-tabs" role="tablist" aria-label="Who it's for">
        {TABS.map(([t, label]) => (
          <button key={t} role="tab" id={`tab-${t}`} aria-selected={tab === t} aria-controls={`panel-${t}`} onClick={() => choose(t)}>{label}</button>
        ))}
      </div>

      {tab === "platform" ? (
        <section role="tabpanel" id="panel-platform" aria-labelledby="tab-platform" className="docs-panel">
          <p className="docs-panel-lede">Follow any match from the forecast before the toss to the result.</p>
          <Steps steps={PLATFORM} />
          <div className="docs-more-row">
            <p><b>Not sure what a number means?</b> Tap the ⓘ next to it, or read the <Link href="/docs/guide/">guide</Link>.</p>
            <p><b>On your phone?</b> Get the <Link href="/app/">Android app</Link>.</p>
          </div>
        </section>
      ) : (
        <section role="tabpanel" id="panel-developers" aria-labelledby="tab-developers" className="docs-panel">
          <p className="docs-panel-lede">Bring our forecasts and analytics into your own site, app or broadcast.</p>
          <Steps steps={DEVELOPERS} />
          <div className="docs-more-row">
            <p><b>Questions or a bigger project?</b> <Link href="/contact/">Talk to us</Link>.</p>
          </div>
        </section>
      )}
    </>
  );
}

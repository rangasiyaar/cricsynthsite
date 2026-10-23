"use client";
// App help: short answers, and how to reach us.
import { MenuGroup, TopBar } from "@/components/App";
import { SITE } from "@/lib/seo";

const FAQ: [string, string][] = [
  ["Where do the forecasts come from?", "Each match is simulated ball by ball 20,000 times from past matches of the players, the ground and the competition. Win chances and projected scores are counts from those simulations."],
  ["When does a forecast change?", "When the playing XIs or the toss are announced, the match is simulated again. At the start of play the forecast is locked."],
  ["What is MatchSynth Lab?", "Change the toss, the pitch, the dew, a player's form or who can bowl, or start from any score, and the match is re-run on your phone. It is part of Pro, which is free during the beta."],
  ["How are the fantasy picks chosen?", "The best single team is the eleven with the most expected points across the simulations. The five-team combo covers different ways the match can go, with different captains."],
  ["Why can't I see a match?", "Forecasts appear once the fixture is published, usually a day or two before the start. Pull down on the match list to refresh."],
  ["How do I delete my account?", "Write to us from the contact page with the email you signed in with, and we'll delete the account and its data."],
];

export default function Help() {
  return (
    <>
      <TopBar back="/m/matches/" />
      <div className="a-title"><h1>Help</h1></div>
      <MenuGroup label="Questions">
        <div className="a-faq">
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </MenuGroup>
      <MenuGroup label="Still stuck">
        <div className="a-panel" style={{ display: "grid", gap: 12 }}>
          <p>Tell us what happened and on which match. We read every message.</p>
          <a className="a-btn" href={`${SITE}/contact/`}>Contact us</a>
        </div>
      </MenuGroup>
    </>
  );
}

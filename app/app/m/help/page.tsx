"use client";
// App help: short answers, and how to reach us.
import { MenuGroup, TopBar } from "@/components/App";
import Link from "next/link";
import { SITE } from "@/lib/seo";

const FAQ: [string, string][] = [
  ["Where do the forecasts come from?", "Each match is played out ball by ball from the past matches of the players, the ground and the competition."],
  ["When does a forecast change?", "When the playing XIs or the toss are announced."],
  ["What is MatchSynth Lab?", "Change the toss, the pitch, the dew, a player's form or who can bowl, or start from any score, and the match is re-run on your phone. It is part of CricSynthesis Pro."],
  ["What does CricSynthesis Pro cost?", "₹349 a month or ₹3,769 a year. New accounts get one day free, and you can cancel any time from Account."],
  ["What are the small league and mega league teams?", "The small league team is our single strongest XI, for contests with one entry. The six mega league teams have different captains and cover the different ways the match can go, for contests where you enter several."],
  ["Why can't I see a match?", "Forecasts appear once the fixture is published, usually a day or two before the start. Pull down on the match list to refresh."],
  ["How do I delete my account?", "Write to us from the contact page with the email you signed in with, and we'll delete the account and its data."],
];

export default function Help() {
  return (
    <>
      <TopBar back="/m/matches/" />
      <div className="a-title"><h1>Help</h1></div>
      <MenuGroup label="Guide">
        <div className="a-panel" style={{ display: "grid", gap: 12 }}>
          <p style={{ margin: 0 }}>What every number on a match page means, and how to use it.</p>
          <Link className="a-btn" href="/m/guide/">Open the guide</Link>
        </div>
      </MenuGroup>
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
          <a className="a-btn" href={`${SITE}/contact/`}>Contact us</a>
          <a className="a-pill" href={`${SITE}/about/`}>About CricSynthesis</a>
        </div>
      </MenuGroup>
    </>
  );
}

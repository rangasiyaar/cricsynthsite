"use client";
// A Pro tab opened without Pro, shown in place on the match (website and app): the tab drawn from the masked teaser
// (lib/unlock.ts teaserDoc: the players that open each section real, the rest masked). Each section on screen shows its
// top 20% clear (some figures turned into soft bars at random), then fades out; the offer sits over the middle, and there's an easy way back to the Overview. Counts each view (paywall_view) and each tap on the offer (pro_cta, source paywall).
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef } from "react";
import { loginHref } from "@/components/Gate";
import { track } from "@/lib/analytics";
import { hasPaidPro, trialAvailable, useProBilling } from "@/lib/billing";
import { usePlan } from "@/lib/firebase";
import { PRO, PRO_HIGHLIGHTS, ctaLabel, rupees } from "@/lib/pro";
import type { MatchDoc } from "@/lib/types";

// Panel copy for each tab: a headline that says what opening the tab gives, one line on why it matters, three things
// on the tab, then a button that unlocks it. Fan words (likely score, playing XI, captain pick, pitch, death overs).
type Copy = { head: string; line: string; points: string[] };
const vs = (d: MatchDoc) => d.match.teams.map((t) => t.short).join(" v ");
const ground = (d: MatchDoc) => d.match.venue ?? "this ground";
const COPY: Record<string, (d: MatchDoc) => Copy> = {
  Scores: (d) => ({ head: `Unlock the likely scores for ${vs(d)}`,
    line: "See what each side is likely to post, and how the runs will come from the powerplay to the death overs.",
    points: ["Likely totals with a range for both teams", "Your chance of each score being reached, batting first or chasing", "Runs per over and the score at every stage"] }),
  Wickets: (d) => ({ head: `Unlock the wicket overs for ${vs(d)}`,
    line: "Know when wickets are most likely to fall, before the first ball.",
    points: ["The chance of a wicket in every over", "When each wicket is likely to go down, for both sides", "Where the collapse risk sits: powerplay, middle overs or death"] }),
  Players: (d) => ({ head: `Unlock every player's forecast for ${vs(d)}`,
    line: "Runs and wickets ranges for each player in both playing XIs.",
    points: ["Run ranges for every batter, in batting order", "Wickets ranges for every bowler", "Chances of a fifty, a hundred or a duck, and who is most likely to get them out"] }),
  "Top players": (d) => ({ head: `Unlock the top run-scorer and wicket-taker picks for ${vs(d)}`,
    line: "Who is most likely to finish as top batter and top bowler in this match.",
    points: ["Top run-scorer chances for every batter", "Top wicket-taker chances for every bowler", "Both teams ranked side by side"] }),
  MVP: (d) => ({ head: `Unlock the match-winners for ${vs(d)}`,
    line: "The players most likely to decide this match, with bat, ball or both.",
    points: ["Most valuable players ranked across both XIs", "What each one is likely to add with bat and ball", "Handy for captain and vice-captain picks"] }),
  Matchups: (d) => ({ head: `Unlock the key batter v bowler battles in ${vs(d)}`,
    line: "The duels that could swing the game, and who is likely to win them.",
    points: ["Each top batter against the bowlers they will face", "The chance of a dismissal and the likely runs in every duel", "Which bowler to back against which batter"] }),
  "Venue intelligence": (d) => ({ head: `Unlock the pitch report for ${ground(d)}`,
    line: "How this ground plays, and how these two XIs suit it.",
    points: ["Average first-innings score and how often batting first wins", "Pace v spin: who takes the wickets here", "Recent matches at the ground, and how this XI bats and bowls here"] }),
  Fantasy: (d) => ({ head: `Unlock the fantasy XI for ${vs(d)}`,
    line: "A ready fantasy team with captain and vice-captain picks, built from the likely playing XIs.",
    points: ["Small league and mega league teams", "Captain and vice-captain picks with projected points", "Updated when the playing XIs and toss come in"] }),
};
const FALLBACK = (d: MatchDoc): Copy => ({ head: `Unlock the full match centre for ${vs(d)}`,
  line: "Every tab for every match we cover, plus MatchSynth Lab.", points: PRO_HIGHLIGHTS.slice(0, 3) });

// Headings, column titles, tabs and chart axes keep their numbers ("by over 10", "50+").
const FIXED = "h2, h3, h4, th, thead, button, [role=tab], svg, .cs-k, .card-head";
/** A number in [0, 1) from a string: the same string gives the same number. */
function pick(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

export default function TeaserLock({ doc, section, label, children, onBack, backHref, app = false }: {
  doc: MatchDoc; section: string; label: string; children: React.ReactNode | null;
  onBack?: () => void; backHref?: string; app?: boolean;
}) {
  const { user } = usePlan();
  const b = useProBilling(user === undefined ? undefined : user?.uid ?? null);
  const trial = trialAvailable(b), paid = hasPaidPro(b);
  useEffect(() => { track("paywall_view", { section, match_id: doc.match.id, where: app ? "app" : "web" }); }, [section, doc.match.id, app]);
  const checkout = app ? "/m/checkout/?plan=monthly" : "/checkout/?plan=monthly";
  const go = user ? checkout : app ? `/m/login/?next=${encodeURIComponent(checkout)}` : loginHref(checkout);
  const btn = app ? "a-btn" : "btn";
  const copy = (COPY[section] ?? FALLBACK)(doc);
  const box = useRef<HTMLDivElement>(null);
  // Only what fits on the screen when the tab opens. Every section shows its top 20% clear (real figures: the teaser
  // keeps the players that open each section real), with some of its figures picked at random and turned into soft
  // bars, then fades into the page colour inside its frame. Hidden players become soft bars (their figures removed).
  // The offer covers the middle 60%.
  useLayoutEffect(() => {
    const root = box.current?.querySelector<HTMLElement>(".tl-content");
    if (!root) return;
    const seed = `${doc.match.id}:${section}`;
    const shape = () => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const hits: Text[] = [], figures: Text[] = [];
      while (walker.nextNode()) {
        const t = walker.currentNode as Text, v = t.nodeValue || "";
        if (v.includes("█")) hits.push(t);
        else if (/\d/.test(v) && !t.parentElement?.closest(FIXED)) figures.push(t);
      }
      for (const t of hits) {
        const pill = document.createElement("span");
        pill.className = "tl-pill";
        t.replaceWith(pill);
        // a table or list row: its figures go too; anywhere else (a pitch, a card): only the text next to the name
        const onPitch = !!pill.closest("[class*='Pitch'], [class*='pitch']");
        const row = onPitch ? null : pill.closest("tr, li, [class*='row']") as HTMLElement | null;
        if (row) row.classList.add("tl-hide");
        else pill.parentElement?.parentElement?.classList.add("tl-soft");
      }
      // about a third of the figures that are still readable, picked from the match, tab and figure (the same ones
      // each time the tab opens)
      figures.forEach((t, i) => {
        const v = (t.nodeValue || "").trim();
        if (!v || /^\d{1,2}$/.test(v) || pick(`${seed}:${i}:${v}`) >= 0.35) return;   // ranks and counts stay
        const bar = document.createElement("span");
        bar.className = "tl-pill tl-fig";
        bar.style.width = `${Math.min(84, Math.max(26, v.length * 9))}px`;
        t.replaceWith(bar);
      });
      const cards = [...root.querySelectorAll<HTMLElement>(".card")].filter((c) => !c.parentElement?.closest(".card"));
      // React can reuse a box (a loading placeholder that becomes the tab's layout): drop the fade and marks left on
      // anything that is no longer a top-level section
      for (const f of root.querySelectorAll<HTMLElement>(".tl-fade")) if (!cards.includes(f.parentElement as HTMLElement)) f.remove();
      for (const e of root.querySelectorAll<HTMLElement>(".tl-sec")) if (!cards.includes(e)) e.classList.remove("tl-sec");
      cards.forEach((c) => {
        c.classList.add("tl-sec");
        if (!c.querySelector(":scope > .tl-fade")) {
          const f = document.createElement("div");
          f.className = "tl-fade";
          c.appendChild(f);
        }
      });
    };
    // the height on screen below the tab bar when the tab opened (a sensible height when it opens further down)
    if (box.current) {
      const top = box.current.getBoundingClientRect().top;
      const h = top > 0 && top < window.innerHeight - 320 ? window.innerHeight - top - 12 : app ? 560 : 640;
      box.current.style.setProperty("--tl-h", `${Math.round(Math.max(380, Math.min(h, 900)))}px`);
    };
    shape();
    const watch = { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] };
    const mo = new MutationObserver(() => { mo.disconnect(); shape(); mo.observe(root, watch); });
    mo.observe(root, watch);
    return () => mo.disconnect();
  }, [children, app, doc.match.id, section]);
  return (
    <div className={`tl${app ? " tl-app" : ""}`} ref={box}>
      <div className="tl-content" aria-hidden="true" inert>
        {children ?? <div className="tl-ghost"><div className="skeleton card" /><div className="skeleton card" /><div className="skeleton card" /></div>}
      </div>
      <div className="tl-over">
        <div className="tl-card" role="region" aria-label={`Unlock ${label} with CricSynthesis Pro`}>
          <span className="tl-tag">CricSynthesis Pro</span>
          <h3>{copy.head}</h3>
          <p>{copy.line}</p>
          <ul className="tl-list">{copy.points.map((l) => <li key={l}>{l}</li>)}</ul>
          {!paid && <Link className={`${btn} tl-go`} href={go} onClick={() => track("pro_cta", { source: "paywall", section, billing: "monthly", trial, where: app ? "app" : "web" })}>
            {trial ? `Unlock free for a day` : user === null ? "Sign in to unlock" : ctaLabel(false)}</Link>}
          <p className="tl-fine">{trial ? `Unlocks every Pro tab and MatchSynth Lab. Then ${rupees(PRO.monthly)} a month, cancel any time.` : `Every Pro tab and MatchSynth Lab for ${rupees(PRO.monthly)} a month. Cancel any time.`}</p>
          <div className="tl-links">
            <Link href={app ? "/m/pro/" : "/pricing/"}>Compare plans</Link>
            {onBack ? <button type="button" className="linkish" onClick={onBack}>Back to Overview</button>
              : backHref ? <Link href={backHref}>Back to Overview</Link> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

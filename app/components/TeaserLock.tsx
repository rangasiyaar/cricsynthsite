"use client";
// A Pro tab opened without Pro, shown in place on the match (website and app): the tab drawn from the masked teaser
// (lib/unlock.ts teaserDoc: about 15% real). Its first card stays (hidden players as soft bars, their figures removed),
// the other cards show only their titles over a skeleton, the offer sits just below the first card, and there's an
// easy way back to the Overview. Counts each view (paywall_view) and each tap on the offer (pro_cta, source paywall).
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef } from "react";
import { loginHref } from "@/components/Gate";
import { track } from "@/lib/analytics";
import { hasPaidPro, trialAvailable, useProBilling } from "@/lib/billing";
import { usePlan } from "@/lib/firebase";
import { PRO, ctaLabel, rupees } from "@/lib/pro";
import type { MatchDoc } from "@/lib/types";

const LINE: Record<string, (d: MatchDoc) => string> = {
  Scores: (d) => `Likely totals for ${d.match.teams.map((t) => t.short).join(" and ")}, and how the runs come over by over.`,
  Wickets: () => "The overs where wickets are most likely to fall, for both sides.",
  Players: () => "Every player rated, with runs and wickets ranges for this match.",
  "Top players": () => "Who's most likely to top-score and take the most wickets.",
  MVP: () => "The players most likely to decide this match.",
  Matchups: () => "The batter v bowler battles that could decide the game.",
  "Venue intelligence": (d) => `How ${d.match.venue ?? "this ground"} plays: scores, pace v spin, batting first or chasing.`,
  Fantasy: () => "A fantasy XI for this match, with captain and vice-captain picks.",
};

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
  const title = `${label} · ${doc.match.teams.map((t) => t.short).join(" v ")}`;
  const box = useRef<HTMLDivElement>(null);
  // The tab's first card stays as it is (its hidden players become soft bars); every other card shows only its
  // title over a skeleton, so no shuffled number is ever on screen. The offer sits just below the first card.
  useLayoutEffect(() => {
    const root = box.current?.querySelector<HTMLElement>(".tl-content");
    if (!root) return;
    const shape = () => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const hits: Text[] = [];
      while (walker.nextNode()) if ((walker.currentNode.nodeValue || "").includes("█")) hits.push(walker.currentNode as Text);
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
      const cards = [...root.querySelectorAll<HTMLElement>(".card")].filter((c) => !c.parentElement?.closest(".card"));
      cards.forEach((c, i) => c.classList.toggle("tl-stub", i > 0));
      const first = cards[0];
      if (first && box.current) {
        const cut = first.getBoundingClientRect().bottom - box.current.getBoundingClientRect().top;
        box.current.style.setProperty("--tl-cut", `${Math.round(Math.min(cut, app ? 460 : 540))}px`);   // a tall first card: cut it
      }
    };
    shape();
    const mo = new MutationObserver(() => { mo.disconnect(); shape(); mo.observe(root, { childList: true, subtree: true }); });
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [children, app]);
  return (
    <div className={`tl${app ? " tl-app" : ""}`} ref={box}>
      <div className="tl-content" aria-hidden="true" inert>
        {children ?? <div className="tl-ghost"><div className="skeleton card" /><div className="skeleton card" /><div className="skeleton card" /></div>}
      </div>
      <div className="tl-over">
        <div className="tl-card" role="region" aria-label={`${label} is part of CricSynthesis Pro`}>
          <span className="tl-tag">CricSynthesis Pro</span>
          <h3>{title}</h3>
          <p>{(LINE[section] ?? (() => "Every tab for every match we cover, plus MatchSynth Lab."))(doc)}</p>
          {!paid && <Link className={`${btn} tl-go`} href={go} onClick={() => track("pro_cta", { source: "paywall", section, billing: "monthly", trial, where: app ? "app" : "web" })}>
            {user === null ? (trial ? "Try free for a day" : "Sign in to subscribe") : trial ? "Try free for a day" : ctaLabel(false)}</Link>}
          <p className="tl-fine">{trial ? `Then ${rupees(PRO.monthly)} a month. Cancel any time.` : `${rupees(PRO.monthly)} a month. Cancel any time.`}</p>
          <div className="tl-links">
            <Link href={app ? "/m/pro/" : "/pro/"}>See everything in Pro</Link>
            {onBack ? <button type="button" className="linkish" onClick={onBack}>Back to Overview</button>
              : backHref ? <Link href={backHref}>Back to Overview</Link> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

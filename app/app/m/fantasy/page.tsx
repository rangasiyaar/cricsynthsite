"use client";
// App Fantasy tab: every upcoming and live match, each opening straight to its fantasy picks.
import Link from "next/link";
import { useMemo } from "react";
import { Badge, Empty, Loading, OfflineBar, PullToRefresh, Title, TopBar, XiTag, useFresh, useNow } from "@/components/App";
import { loadIndex, peekIndex } from "@/lib/data";
import { FORMAT } from "@/lib/format";
import { countdown, kickoffMs, startLabel, status } from "@/lib/schedule";

export default function FantasyTab() {
  const now = useNow(1000);
  const ix = useFresh("index", peekIndex, loadIndex);
  const list = useMemo(() => {
    const t = now ?? Date.now();
    return (ix.data?.matches ?? []).filter((m) => m.published).map((m) => ({ m, st: status(m, t) }))
      .filter((x) => x.st !== "finished")
      .sort((a, b) => (a.st === "live" ? 0 : 1) - (b.st === "live" ? 0 : 1)
        || (kickoffMs(a.m.date, a.m.start_time) ?? 0) - (kickoffMs(b.m.date, b.m.start_time) ?? 0));
  }, [ix.data, now]);
  return (
    <>
      <TopBar />
      <PullToRefresh onRefresh={ix.refresh} refreshing={ix.refreshing && !!ix.data} />
      <Title>Fantasy picks</Title>
      <OfflineBar show={ix.offline} onRetry={ix.refresh} />
      {ix.error && !ix.data && <Empty title="Couldn't load matches" action={<button type="button" className="a-pill" onClick={ix.refresh}>Try again</button>}>Check your connection.</Empty>}
      {!ix.data && !ix.error && <Loading />}
      {ix.data && (
        <div className="a-list">
          {list.map(({ m, st }) => {
            const left = st === "upcoming" && now !== null ? countdown(kickoffMs(m.date, m.start_time), now) : null;
            return (
              <article key={m.id} className="a-mcard">
                <Link href={`/m/match/?id=${encodeURIComponent(m.id)}&s=fantasy`} className="a-mcard-main">
                  <div className="a-mcard-head">
                    <span className="a-mcard-comp">{m.competition ?? FORMAT[m.format] ?? m.format}</span>
                    <XiTag xis={m.xis} />
                  </div>
                  <div className="a-mteams">
                    {[0, 1].map((k) => [
                      k === 1 && <div key="vs" className="a-mvs">{left ? <span className="a-countdown">{left}</span> : <span className="a-vs">v</span>}</div>,
                      <div key={k} className="a-mteam"><Badge short={m.teams[k].short} k={k} /><span className="a-mteam-name">{m.teams[k].name}</span></div>,
                    ])}
                  </div>
                  <div className="a-mcard-where">
                    <span className="a-mcard-ground">{m.venue ?? "Venue to be confirmed"}</span>
                    <span className="a-mcard-when">{startLabel(m.date, m.start_time)}</span>
                  </div>
                  <div className="a-mcard-status">
                    {st === "live" ? <span className="a-status live"><span className="dot" />Live</span> : <span className="a-status up">Upcoming</span>}
                  </div>
                </Link>
              </article>
            );
          })}
          {!list.length && <Empty title="No upcoming matches">Fantasy picks appear here once a match's forecast is ready.</Empty>}
        </div>
      )}
    </>
  );
}

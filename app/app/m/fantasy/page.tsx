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
      <Title eyebrow="Fantasy">Fantasy picks</Title>
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
                    {st === "live" ? <span className="a-status live"><span className="dot" />Live</span> : <span className="a-status up">Upcoming</span>}
                    <span className="a-mcard-comp">{m.competition ?? FORMAT[m.format] ?? m.format}</span>
                    <XiTag xis={m.xis} />
                    <span style={{ flex: 1 }} />
                    {left && <span className="a-countdown">{left}</span>}
                  </div>
                  <div className="a-mteams">
                    {m.teams.map((t, k) => (
                      <div key={t.name} className="a-mteam"><Badge short={t.short} k={k} /><span className="a-mteam-name">{t.name}</span></div>
                    ))}
                  </div>
                  <div className="a-mcard-foot"><span>{m.venue ?? "Venue to be confirmed"}</span><span>{startLabel(m.date, m.start_time)}</span></div>
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

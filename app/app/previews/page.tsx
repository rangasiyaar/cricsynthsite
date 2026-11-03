import Link from "next/link";
import { readMatch, upcomingIds } from "@/lib/build";
import { PREVIEWS_LIVE, previewPath } from "@/lib/preview";
import { seo } from "@/lib/seo";

export const metadata = seo("/previews/", "Match Previews & Predictions | CricSynthesis",
  "Written previews for every upcoming match we forecast: who will win, pitch report, playing XIs, key players and score prediction.",
  { noindex: !PREVIEWS_LIVE });

export default function Previews() {
  const docs = upcomingIds().map((id) => readMatch(id)!).sort((a, b) =>
    `${a.match.date ?? ""}${a.match.start_time ?? ""}`.localeCompare(`${b.match.date ?? ""}${b.match.start_time ?? ""}`));
  return (
    <div className="page-head blog">
      <h1><span>Match previews</span></h1>
      <p className="cs-lede">Who will win, the pitch, the XIs, the players to watch and the score to expect, for every upcoming match we forecast.</p>
      <div className="blog-list">
        {docs.length ? docs.map((d) => {
          const [a, b] = d.summary.teams.map((t) => t.name);
          const [series, no] = (d.match.competition ?? "").split(" · ");
          return (
            <Link key={d.match.id} href={previewPath(d.match.id)} className="blog-card">
              <span className="blog-meta">{[series, no].filter(Boolean).join(" · ")}{d.match.date ? ` · ${d.match.date}` : ""}</span>
              <h2>{a} vs {b}: preview and prediction</h2>
              <p>{d.insights?.[0]?.text ?? ""}</p>
            </Link>);
        }) : <p className="notice">No upcoming matches right now.</p>}
      </div>
    </div>
  );
}

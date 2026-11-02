import Link from "next/link";
import { readMatch, upcomingIds } from "@/lib/build";
import { PREVIEWS_LIVE, fantasyPath } from "@/lib/preview";
import { seo } from "@/lib/seo";

export const metadata = seo("/fantasy/", "Fantasy Cricket Predictions: Captain, Vice-Captain & Best XI | CricSynthesis",
  "Fantasy predictions for every upcoming match we forecast: best XI, captain and vice-captain, safe picks, differentials and punts.",
  { noindex: !PREVIEWS_LIVE });

export default function FantasyList() {
  const docs = upcomingIds().map((id) => readMatch(id)!).filter((d) => d.fantasy).sort((a, b) =>
    `${a.match.date ?? ""}${a.match.start_time ?? ""}`.localeCompare(`${b.match.date ?? ""}${b.match.start_time ?? ""}`));
  return (
    <div className="page-head blog">
      <p className="cs-eyebrow">Fantasy predictions</p>
      <h1><span>Fantasy picks,</span><span>by simulation.</span></h1>
      <p className="cs-lede">Best XI, captain and vice-captain, safe picks and differentials for every upcoming match we forecast.</p>
      <div className="blog-list">
        {docs.length ? docs.map((d) => {
          const [a, b] = d.summary.teams.map((t) => t.name);
          const [series, no] = (d.match.competition ?? "").split(" · ");
          const f = d.fantasy!;
          const name = (id: string) => f.players[id]?.name ?? id;
          return (
            <Link key={d.match.id} href={fantasyPath(d.match.id)} className="blog-card">
              <span className="blog-meta">{[series, no].filter(Boolean).join(" · ")}{d.match.date ? ` · ${d.match.date}` : ""}</span>
              <h2>{a} vs {b}: fantasy prediction</h2>
              <p>Captain {name(f.single.captain)}, vice-captain {name(f.single.vice_captain)}.</p>
            </Link>);
        }) : <p className="notice">No upcoming matches with fantasy picks right now.</p>}
      </div>
    </div>
  );
}

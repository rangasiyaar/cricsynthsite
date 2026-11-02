// One match's page (/match/{id}/, with /fantasy/ and /playing-xi/ opening a tab): the live match centre, with its own title
// and match data for search. The written preview and fantasy posts (/previews/, /fantasy/) carry the search text, so the
// match pages present themselves as the match centre and the tab pages point search at the main one.
import type { Metadata } from "next";
import LiveMatch from "@/components/LiveMatch";
import { readMatch } from "@/lib/build";
import { description, facts, faq, jsonLd, matchPath, type Kind } from "@/lib/matchText";
import { seo } from "@/lib/seo";

const TAB: Record<Kind, string | undefined> = { prediction: undefined, fantasy: "fantasy", xi: "players" };

export function matchMetadata(id: string, kind: Kind): Metadata {
  const doc = readMatch(id);
  if (!doc) return seo(matchPath(id, kind), "Match | CricSynthesis", "Cricket match forecast.", { noindex: true });
  const x = facts(doc);
  const label = [x.no, x.shortWhen].filter(Boolean).join(", ");
  // One canonical page per match (the tab pages point at it), titled as the match centre so it doesn't compete with the posts.
  return seo(matchPath(id), `${x.A} vs ${x.B} Match Centre${label ? `, ${label}` : ""}: Win Probability, Projections & Player Stats | CricSynthesis`,
             description(x, "prediction"));
}

export default function MatchSeoPage({ id, kind }: { id: string; kind: Kind }) {
  const doc = readMatch(id);
  if (!doc) return <LiveMatch id={id} tab={TAB[kind]} />;      // no text to write (placeholder or an odd document): the match centre alone
  const x = facts(doc);
  const qa = faq(x, kind);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(x, kind, id, qa)) }} />
      <LiveMatch id={id} tab={TAB[kind]} />

    </>
  );
}

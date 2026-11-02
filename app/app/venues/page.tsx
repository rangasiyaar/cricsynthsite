import { Hub, LinkList, hubMeta } from "@/components/Hubs";
import { venuePath, venues } from "@/lib/hubs";

export const metadata = hubMeta("/venues/", "Cricket Grounds: Pitch Reports & Match Predictions", "Pitch reports for every ground we forecast: how it plays, typical first-innings scores, and each match forecast there.", true);

export default function Page() {
  const items = [...venues().values()].map((l) => ({ href: venuePath(l[0].venue!), label: l[0].venue!, sub: `${l.length} match${l.length === 1 ? "" : "es"}` }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return <Hub crumb={["Matches", "/matches/"]} h1="Grounds & pitch reports"><LinkList items={items} /></Hub>;
}

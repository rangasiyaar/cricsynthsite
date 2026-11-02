import { Hub, LinkList, hubMeta } from "@/components/Hubs";
import { pairPath, pairs } from "@/lib/hubs";

export const metadata = hubMeta("/teams/", "Head to Head Predictions", "Every pair of teams we have forecast: the next meeting and how each forecast between them turned out.", true);

export default function Page() {
  const items = [...pairs().values()].map((l) => ({ href: pairPath(...l[0].teams), label: `${l[0].teams[0]} vs ${l[0].teams[1]}`, sub: l[0].date ?? "" }));
  return <Hub crumb={["Matches", "/matches/"]} h1="Head to head"><LinkList items={items} /></Hub>;
}

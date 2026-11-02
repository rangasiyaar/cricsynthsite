import { Hub, LinkList, hubMeta } from "@/components/Hubs";
import { series, seriesPath } from "@/lib/hubs";

export const metadata = hubMeta("/series/", "Cricket Series & League Predictions", "Every series and league we forecast, with win probabilities, projected scores and results for each match.", true);

export default function Page() {
  const items = [...series().values()].map((l) => ({ href: seriesPath(l[0].series), label: l[0].series, sub: `${l.length} match${l.length === 1 ? "" : "es"} · latest ${l[0].date ?? ""}` }));
  return <Hub crumb={["Matches", "/matches/"]} h1="Series & leagues"><LinkList items={items} /></Hub>;
}

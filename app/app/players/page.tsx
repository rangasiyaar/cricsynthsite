import { Hub, LinkList, hubMeta } from "@/components/Hubs";
import { playerPath, players } from "@/lib/hubs";

export const metadata = hubMeta("/players/", "Player Predictions: Runs, Wickets & Fantasy Points", "Projected runs, wickets and fantasy points for every player in the matches we forecast, by team.", true);

export default function Page() {
  const byTeam = new Map<string, { href: string; label: string }[]>();
  for (const p of players().values()) {
    const t = p.matches[0].team;
    byTeam.set(t, [...(byTeam.get(t) ?? []), { href: playerPath(p.name, p.id)!, label: p.name }]);
  }
  const teams = [...byTeam.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <Hub crumb={["Matches", "/matches/"]} h1="Players">
      {teams.map(([t, items]) => <section key={t}><h2>{t}</h2><LinkList items={items.sort((a, b) => a.label.localeCompare(b.label))} /></section>)}
    </Hub>
  );
}

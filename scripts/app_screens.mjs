// Phone screenshots of every live app screen, for marketing: node scripts/app_screens.mjs <site> <out dir>
// Files are numbered in the order a user meets them and named by feature; a screen taller than the phone is also
// saved whole ("-full"). The main screens are repeated in dark mode.
import { chromium, devices } from "playwright";
import { mkdirSync, readdirSync, rmSync } from "node:fs";

const [site = "https://cricsynthesis.in", out = "marketing/app-screens"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) if (f.endsWith(".png")) rmSync(`${out}/${f}`);

const get = async (p) => { try { const r = await fetch(`${site}/data/${p}`); return r.ok ? r.json() : null; } catch { return null; } };
const ix = await get("index.json");
const ms = (ix?.matches ?? []).filter((m) => m.published);
// a match with picks and a ground profile, upcoming with named XIs first
const docs = [];
for (const m of [...ms.filter((m) => m.xis && !m.status), ...ms.filter((m) => !m.status), ...ms]) {
  if (docs.some((d) => d.id === m.id)) continue;
  const d = await get(`matches/${encodeURIComponent(m.id)}.json`);
  if (d?.fantasy) docs.push({ id: m.id, venue: !!d.match.venue_id });
  if (docs.some((d) => d.venue)) break;
}
const pick = docs.find((d) => d.venue) ?? docs[0];
if (!pick) throw new Error("no published match with fantasy picks");
const done = (await get("results/index.json"))?.matches?.[0]?.id;
console.log("match:", pick.id, "result:", done);

const id = encodeURIComponent(pick.id);
const m = (s) => `/m/match/?id=${id}&s=${s}`;
const SCREENS = [
  ["01-launch-splash", "/m/", { wait: 400 }],
  ["02-home-matches-live", "/m/matches/?f=live"],
  ["03-home-matches-upcoming", "/m/matches/?f=upcoming"],
  ["04-home-matches-finished", "/m/matches/?f=finished"],
  ["05-match-menu", `/m/match/?id=${id}`],
  ["06-match-overview-win-chance-projections", m("overview")],
  ["07-match-scores-score-ranges", m("scores")],
  ["08-match-wickets-fall-of-wickets", m("wickets")],
  ["09-match-players-run-and-wicket-ranges", m("players")],
  ["10-match-top-players-top-scorer-best-bowler", m("top")],
  ["11-match-mvp-ratings", m("mvp")],
  ["12-match-batter-v-bowler-matchups", m("matchups")],
  ["13-match-venue-ground-intelligence", m("venue")],
  ["14-match-fantasy-best-xi-five-teams", m("fantasy")],
  ["15-fantasy-tab-all-matches", "/m/fantasy/"],
  ...(done ? [["16-result-forecast-v-what-happened", `/m/match/?id=${encodeURIComponent(done)}`]] : []),
  ["17-matchsynth-lab-pro", "/m/lab/"],
  ["18-menu", "/m/matches/", { menu: true }],
  ["19-match-alerts", "/m/alerts/"],
  ["20-app-settings", "/m/settings/"],
  ["21-help", "/m/help/"],
  ["22-sign-in", "/m/login/"],
];
const DARK = new Set(["02-home-matches-live", "03-home-matches-upcoming", "05-match-menu", "06-match-overview-win-chance-projections",
  "07-match-scores-score-ranges", "13-match-venue-ground-intelligence", "14-match-fantasy-best-xi-five-teams", "18-menu"]);

const browser = await chromium.launch();
for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({ ...devices["Pixel 7"], colorScheme: theme });
  const p = await ctx.newPage();
  for (const [name, path, opt = {}] of SCREENS) {
    if (theme === "dark" && !DARK.has(name)) continue;
    const file = `${out}/${name}${theme === "dark" ? "-dark" : ""}`;
    await p.goto(site + path, { waitUntil: "networkidle" }).catch(() => {});
    await p.waitForTimeout(opt.wait ?? 1800);
    if (opt.menu) { await p.locator(".a-top button").last().click().catch(() => {}); await p.waitForTimeout(800); }
    await p.screenshot({ path: `${file}.png` });
    const tall = await p.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 40);
    if (tall && !opt.menu) {
      // whole screen, top to bottom (charts animate in as they scroll into view, so scroll through first)
      await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); });
      await p.waitForTimeout(900);
      await p.screenshot({ path: `${file}-full.png`, fullPage: true });
    }
    console.log(file, tall ? "(+ full)" : "");
  }
  await ctx.close();
}
await browser.close();

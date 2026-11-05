// Phone screenshots of the live app screens (for marketing): node scripts/app_screens.mjs <site> <out dir>
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const [site = "https://cricsynthesis.in", out = "marketing/app-screens"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const ix = await (await fetch(`${site}/data/index.json`)).json();
const ms = ix.matches.filter((m) => m.published);
const has = async (m) => { try { const d = await (await fetch(`${site}/data/matches/${encodeURIComponent(m.id)}.json`)).json(); return !!d.fantasy; } catch { return false; } };
let pick = null;
for (const m of [...ms.filter((m) => m.xis), ...ms]) if (await has(m)) { pick = m; break; }
console.log("match:", pick?.id);
if (!pick) throw new Error("no published match with fantasy picks");

const browser = await chromium.launch();
async function shoot(theme) {
  const ctx = await browser.newContext({ ...devices["Pixel 7"], colorScheme: theme });
  const p = await ctx.newPage();
  const id = encodeURIComponent(pick.id);
  const screens = [
    ["01-matches", "/m/matches/"],
    ["02-fantasy-tab", "/m/fantasy/"],
    ["03-match-menu", `/m/match/?id=${id}`],
    ["04-overview", `/m/match/?id=${id}&s=overview`],
    ["05-scores", `/m/match/?id=${id}&s=scores`],
    ["06-wickets", `/m/match/?id=${id}&s=wickets`],
    ["07-players", `/m/match/?id=${id}&s=players`],
    ["08-top-players", `/m/match/?id=${id}&s=top`],
    ["09-mvp", `/m/match/?id=${id}&s=mvp`],
    ["10-matchups", `/m/match/?id=${id}&s=matchups`],
    ["11-venue", `/m/match/?id=${id}&s=venue`],
    ["12-fantasy", `/m/match/?id=${id}&s=fantasy`],
    ["13-results", "/m/matches/?f=finished"],
    ["14-lab", "/m/lab/"],
  ];
  for (const [name, path] of theme === "dark" ? screens.slice(0, 4) : screens) {
    await p.goto(site + path, { waitUntil: "networkidle" }).catch(() => {});
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `${out}/${name}${theme === "dark" ? "-dark" : ""}.png` });
    if (name === "12-fantasy" || name === "07-players") await p.screenshot({ path: `${out}/${name}-full.png`, fullPage: true });
  }
  if (theme === "light") {
    await p.goto(`${site}/m/matches/`, { waitUntil: "networkidle" });
    await p.locator(".a-top button").last().click().catch(() => {});
    await p.waitForTimeout(800);
    await p.screenshot({ path: `${out}/15-menu.png` });
  }
  await ctx.close();
}
await shoot("light");
await shoot("dark");
await browser.close();

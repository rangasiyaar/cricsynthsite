// The web half of the Android app: the Next export (app/) built to read forecasts from the live site, copied to www/.
//
//   node scripts/build-web.mjs              # build app/ and fill www/
//   node scripts/build-web.mjs --no-build   # reuse app/out as it is
//
// The app's local server answers every path without a file extension with www/index.html. So the root page sends the
// app to /m/index.html (a real file: the splash), and every other screen is reached by client-side navigation, which
// loads files with extensions.
// Note: this overwrites app/out, which is also what the website deploys; rebuild app/ before deploying the site.
import { execSync } from "node:child_process";
import { cpSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..", "..", "app");
const out = join(app, "out");
const www = join(here, "..", "www");
const DATA = process.env.CS_DATA_URL || "https://cricsynthesis.in/data";

if (!process.argv.includes("--no-build")) {
  execSync("npm run build", { cwd: app, stdio: "inherit", env: { ...process.env, NEXT_PUBLIC_DATA_URL: DATA } });
}
if (!existsSync(join(out, "m", "index.html"))) throw new Error("app/out has no /m/ screens: build app/ first");

rmSync(www, { recursive: true, force: true });
cpSync(out, www, { recursive: true });
// Published data and the Python package index are fetched from the site, and website-only pages (docs, blog, API,
// playground, site match centre and Lab, sign-in, admin) aren't part of the app. Kept: the app (m/), the shared
// scripts (_next/), and pages the app links to (results, credits, terms, privacy).
const SITE_ONLY = ["data", "pypi", "docs", "blog", "playground", "developers", "mcp", "careers", "pricing", "contact", "admin",
                   "account", "login", "lab", "match", "app", "sitemap.xml", "robots.txt", "llms.txt", "og.png", "og-logo.png", "email-logo.png"];
for (const d of SITE_ONLY) rmSync(join(www, d), { recursive: true, force: true });
writeFileSync(join(www, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>CricSynthesis</title>
<style>html{background:#f2f2f3}@media (prefers-color-scheme:dark){html{background:#111315}}</style>
<script>location.replace("/m/index.html")</script></head><body></body></html>
`);
console.log(process.argv.includes("--no-build") ? "www/ ready (from the existing app/out)" : `www/ ready (data from ${DATA})`);

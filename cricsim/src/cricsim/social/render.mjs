// Renders the six carousel slides (carousel.html filled with one match's data) as 1080x1350 JPEGs.
//   node render.mjs <data.json> <out-dir>
// Playwright comes from PLAYWRIGHT_DIR (where the workflow installed it) or the normal module path.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const req = createRequire(path.join(process.env.PLAYWRIGHT_DIR || here, "index.js"));
const { chromium } = req("playwright");
const [data, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const json = fs.readFileSync(data, "utf8").replace(/</g, "\\u003c");
const page = path.join(out, "carousel.html");
fs.writeFileSync(page, fs.readFileSync(path.join(here, "carousel.html"), "utf8").replace("__DATA__", json));
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 1080, height: 1400 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.goto("file://" + path.resolve(page), { waitUntil: "networkidle" });
await p.evaluate(() => document.fonts.ready);
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
for (let i = 1; i <= 6; i++) {
  await (await p.$("#s" + i)).screenshot({ path: path.join(out, `${i}.jpg`), type: "jpeg", quality: 92 });
}
await browser.close();

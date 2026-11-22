// Frames at 30 fps from a page with window.seek(t): node frames.cjs <html> <outdir> [fromFrame toFrame] [--alpha]
// --alpha keeps the background transparent (the overlay layer).
const { chromium } = require('playwright');
(async () => {
  const args = process.argv.slice(2), alpha = args.includes('--alpha');
  const [html, dir, a = '0', b = '450'] = args.filter((x) => x !== '--alpha');
  const br = await chromium.launch();
  const p = await br.newPage({ viewport: { width: 1080, height: 1920 } });
  await p.goto('file://' + require('path').resolve(html)); await p.waitForTimeout(1500);
  await p.evaluate(() => document.fonts.ready);
  for (let f = +a; f < +b; f++) {
    await p.evaluate((t) => window.seek(t), f / 30);
    await p.screenshot({ path: `${dir}/f${String(f).padStart(4, '0')}.png`, omitBackground: alpha });
  }
  await br.close();
})();

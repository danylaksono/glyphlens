/**
 * Regenerate the paper's raster figures from the library itself.
 *
 *   node paper/scripts/figures.mjs
 *
 * Serves the repository, opens the gallery and the paper's own figure page in
 * headless Chromium, and saves each canvas as a PNG under paper/figures/.
 * Nothing here is drawn by hand: every figure is the pipeline's output on the
 * bundled OSM extract, so a change to the library shows up in the paper the
 * next time this runs.
 *
 * Needs Playwright (global install is fine) and a Chromium it can find.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const out = path.resolve(here, '..', 'figures');
fs.mkdirSync(out, { recursive: true });

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require('playwright');
  } catch {
    const globalRoot = execSync('npm root -g').toString().trim();
    return require(path.join(globalRoot, 'playwright'));
  }
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(root, url);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

/** Gallery tiles the paper uses, by the tile's title in examples/js/gallery.js. */
const GALLERY = {
  'Category ring': 'g-category-ring',
  'The same data, as a necklace': 'g-necklace',
  'Compass rose': 'g-compass',
  'Spread, not just direction': 'g-spread',
  'Directional profiles': 'g-rose',
  'Classic necklace map': 'g-disc',
  'A ring per variable': 'g-stacked',
  'Unusual, not merely present': 'g-lq',
  'Distance decay': 'g-radial',
  'Any shape': 'g-polygon',
  'Open curve': 'g-corridor',
  'Leaders, where adjacency ran out': 'g-block-leader',
  'The ring, unrolled': 'g-unroll',
  'Marks that share a direction': 'g-upright',
  'A route, laid flat': 'g-corridor-unroll',
  'The line back to the geography': 'g-unroll-leader',
  'A lattice for a shape, not a plane': 'g-relaxed',
  'The members themselves': 'g-inclusions',
};

async function main() {
  const { chromium } = loadPlaywright();
  const server = await serve();
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 3, viewport: { width: 1400, height: 1000 } });
  page.on('pageerror', (e) => console.error('page error:', e.message));

  await page.goto(`${base}/examples/gallery.html`);
  await page.waitForFunction(() => document.querySelectorAll('#grid figure').length >= 18);
  const figures = await page.$$('#grid figure');
  let n = 0;
  for (const fig of figures) {
    const title = await fig.$eval('h2', (h) => h.textContent);
    const slug = GALLERY[title];
    if (!slug) continue;
    const canvas = await fig.$('canvas');
    await canvas.screenshot({ path: path.join(out, `${slug}.png`) });
    n++;
  }
  console.log(`gallery: ${n} tiles`);

  await page.goto(`${base}/paper/scripts/figures.html`);
  await page.waitForFunction(() => window.__figuresReady === true, null, { timeout: 60000 });
  for (const canvas of await page.$$('canvas[data-figure]')) {
    const slug = await canvas.getAttribute('data-figure');
    await canvas.screenshot({ path: path.join(out, `${slug}.png`) });
    n++;
  }
  const csv = await page.evaluate(() => window.__elasticityCsv);
  if (csv) fs.writeFileSync(path.join(out, 'elasticity.csv'), csv);
  console.log(`total: ${n} figures -> ${path.relative(root, out)}`);

  await browser.close();
  server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

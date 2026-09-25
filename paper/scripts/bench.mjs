/**
 * Timing for the implementation section.
 *
 *   node paper/scripts/bench.mjs
 *
 * Runs the pure pipeline (no rendering, no map) on the bundled OSM extract and
 * prints median wall-clock times. Numbers are machine-dependent; the paper
 * reports them with the machine they came from.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeLens } from '../../src/core/layout.js';
import { computeField, TOUCHING } from '../../src/core/field.js';
import { lattice, spacingForCount } from '../../src/core/lattice.js';
import { placeNecklace } from '../../src/core/necklace.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(fs.readFileSync(path.join(here, '../../examples/data/yogyakarta.json'), 'utf8'));
const data = doc.features;
const CENTRE = [110.3695, -7.7956];
const CATEGORY_ORDER = ['food', 'retail', 'civic', 'health'];
const getPosition = (f) => [f.lng, f.lat];

function median(fn, runs = 41) {
  for (let i = 0; i < 5; i++) fn();
  const t = [];
  for (let i = 0; i < runs; i++) {
    const s = process.hrtime.bigint();
    fn();
    t.push(Number(process.hrtime.bigint() - s) / 1e6);
  }
  t.sort((a, b) => a - b);
  return t[(t.length - 1) >> 1];
}

const binning = (mode, bins) => ({ mode, bins, category: (f) => f.category, categories: CATEGORY_ORDER });

const rows = [];
for (const bins of [8, 24, 72]) {
  rows.push([
    `lens, angular(${bins}), necklace`,
    median(() => computeLens({
      center: CENTRE, selection: { type: 'disc', radius: 1200 }, data, getPosition,
      binning: binning('angular', bins), placement: { mode: 'necklace' }, marks: { type: 'bar' },
      ring: { radius: 104 },
    })),
  ]);
}
rows.push([
  'lens, cross(8) x 4 categories, stacked',
  median(() => computeLens({
    center: CENTRE, selection: { type: 'disc', radius: 1200 }, data, getPosition,
    binning: binning('cross', 8), placement: { mode: 'stacked', by: 'category' }, marks: { type: 'bar' },
    ring: { radius: 104 },
  })),
]);

for (const count of [40, 240, 900]) {
  const spacing = spacingForCount(count, 2600, 'hex');
  const { centres, cells } = lattice({ kind: 'hex', center: CENTRE, radius: 2600, spacing });
  rows.push([
    `field, ${centres.length} lenses, angular(8)`,
    median(() => computeField({
      centres, cells, data, getPosition, spacing,
      selection: { type: 'disc', radius: spacing * TOUCHING },
      binning: binning('angular', 8), marks: { type: 'bar' }, minCount: 3, ring: { radius: 12 },
    }), 11),
  ]);
}

for (const n of [24, 72, 288]) {
  const items = Array.from({ length: n }, (_, i) => ({
    id: i, position: (Math.sin(i * 12.9898) * 43758.5453) % 1 + (i % 2 ? 0 : 0), halfWidth: 0.4 / n,
  })).map((it) => ({ ...it, position: ((it.position % 1) + 1) % 1 }));
  rows.push([`placeNecklace, n=${n} (random positions, fill 0.8)`, median(() => placeNecklace(items))]);
}

console.log(`# ${data.length} features; node ${process.version}; ${os.cpus()[0]?.model ?? 'unknown CPU'}; ${os.platform()}`);
for (const [label, ms] of rows) console.log(`${label.padEnd(52)} ${ms.toFixed(3)} ms`);

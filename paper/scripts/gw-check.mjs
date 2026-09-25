/**
 * Field mode against geographically weighted summary statistics.
 *
 *   node paper/scripts/gw-check.mjs
 *
 * A GW proportion at location c is the kernel-weighted share of a category:
 *
 *   p_k(c) = sum_i K(d(c, x_i) / h) [x_i in k]  /  sum_i K(d(c, x_i) / h)
 *
 * over *every* point x_i, with a distance-decay kernel K and a bandwidth h
 * (Brunsdon, Fotheringham & Charlton 2002; Dykes & Brunsdon 2007). This script
 * computes p_k at every centre of a hexagonal lattice twice:
 *
 *  - directly, from the formula above, over all 1,449 places of the bundled
 *    extract;
 *  - through the library's field mode (computeField) with a disc selection,
 *    that kernel, categorical binning and share normalisation. The field's
 *    spatial index, selection, weighting, binning and normalisation all sit
 *    between the data and the number.
 *
 * It reports the largest absolute difference over all centres and categories.
 * Box-car and bi-square kernels have compact support, so the two should agree
 * to rounding. The Gaussian kernel has infinite support while a lens has a
 * radius, so the field truncates it; the script shows the truncation error at
 * radii of 2h, 3h and 4h.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeField } from '../../src/core/field.js';
import { lattice, spacingForCount } from '../../src/core/lattice.js';
import { KERNELS } from '../../src/core/selection.js';
import { distance } from '../../src/core/geo.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(fs.readFileSync(path.join(here, '../../examples/data/yogyakarta.json'), 'utf8'));
const data = doc.features;
const CENTRE = [110.3695, -7.7956];
const CATEGORIES = ['food', 'retail', 'civic', 'health'];
const getPosition = (f) => [f.lng, f.lat];
const h = 600;

const spacing = spacingForCount(240, 2600, 'hex');
const { centres } = lattice({ kind: 'hex', center: CENTRE, radius: 2600, spacing });

function direct(centre, K) {
  const num = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  let den = 0;
  for (const f of data) {
    const w = K(distance(centre, getPosition(f)) / h);
    num[f.category] += w;
    den += w;
  }
  return den > 0 ? Object.fromEntries(CATEGORIES.map((c) => [c, num[c] / den])) : null;
}

function viaField(kernel, radius) {
  const { lenses } = computeField({
    centres,
    spacing,
    data,
    getPosition,
    selection: { type: 'disc', radius, kernel, bandwidth: h },
    binning: { mode: 'categorical', category: (f) => f.category, categories: CATEGORIES },
    normalisation: { mode: 'share' },
    marks: { type: 'bar' },
    ring: { radius: 12 },
    minCount: 1,
  });
  return lenses;
}

console.log(`GW proportions: ${centres.length} lattice centres, bandwidth ${h} m, ${data.length} places`);
console.log('kernel     radius   centres compared   max |field - direct|');
for (const [kernel, radii] of [['boxcar', [h]], ['bisquare', [h]], ['gaussian', [2 * h, 3 * h, 4 * h]]]) {
  for (const radius of radii) {
    const lenses = viaField(kernel, radius);
    let worst = 0;
    let compared = 0;
    for (const lens of lenses) {
      const ref = direct(lens.center, KERNELS[kernel]);
      if (!ref) continue;
      // A lens whose total weight is zero has no proportions to compare.
      if (!(lens.stats.total > 0)) continue;
      compared++;
      for (const b of lens.bins) worst = Math.max(worst, Math.abs(b.value - ref[b.key]));
    }
    console.log(`${kernel.padEnd(9)}  ${String(radius).padStart(5)} m   ${String(compared).padStart(16)}   ${worst.toExponential(2)}`);
  }
}

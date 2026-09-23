/**
 * Paper figures that the gallery does not already draw: the lens-to-glyphmap
 * continuum at four counts, and the elasticity profile behind the radius
 * control. Same bundled dataset, same pipeline, bare canvases.
 */

import { computeField, TOUCHING } from '../../src/core/field.js';
import { lattice, spacingForCount } from '../../src/core/lattice.js';
import { elasticityProfile } from '../../src/core/distribution.js';
import { LensRenderer } from '../../src/render/LensRenderer.js';
import { distance as geoDistance, bearing as geoBearing } from '../../src/core/geo.js';

const CATEGORY_ORDER = ['food', 'retail', 'civic', 'health'];
const CENTRE = [110.3695, -7.7956];
const COVER = 2600;          // metres covered by the field
const TILE = 320;            // px
const COVER_PX = 150;        // px the cover radius occupies on a tile

const out = document.getElementById('out');

function canvas(slug) {
  const c = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  c.width = TILE * dpr;
  c.height = TILE * dpr;
  c.style.width = `${TILE}px`;
  c.style.height = `${TILE}px`;
  c.dataset.figure = slug;
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, TILE, TILE);
  out.appendChild(c);
  return ctx;
}

/** The lens's own azimuthal frame, as in the gallery (docs/findings.md F-12). */
function projector(metresPerPx) {
  return (coord) => {
    const d = geoDistance(CENTRE, coord) / metresPerPx;
    const a = ((geoBearing(CENTRE, coord) - 90) / 180) * Math.PI;
    return [TILE / 2 + Math.cos(a) * d, TILE / 2 + Math.sin(a) * d];
  };
}

function drawContext(ctx, data, project) {
  // Faint members, so the reader can see what each field is summarising.
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  for (const f of data) {
    const [x, y] = project([f.lng, f.lat]);
    if (x < 0 || y < 0 || x > TILE || y > TILE) continue;
    ctx.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
  }
}

function continuum(data, count) {
  const ctx = canvas(`c-continuum-${count}`);
  const metresPerPx = COVER / COVER_PX;
  const project = projector(metresPerPx);
  drawContext(ctx, data, project);

  let centres;
  let cells;
  let spacing;
  let radius;
  if (count === 1) {
    centres = [CENTRE];
    cells = [null];
    spacing = null;
    radius = COVER * 0.45;
  } else {
    spacing = spacingForCount(count, COVER, 'hex');
    ({ centres, cells } = lattice({ kind: 'hex', center: CENTRE, radius: COVER, spacing }));
    radius = spacing * TOUCHING;
  }
  const ringPx = count === 1 ? 92 : Math.max(4, (radius / metresPerPx) * 0.62);

  const field = computeField({
    centres,
    cells: count === 1 ? null : cells,
    data,
    getPosition: (f) => [f.lng, f.lat],
    selection: { type: 'disc', radius },
    binning: { mode: 'angular', bins: count === 1 ? 16 : 8, category: (f) => f.category, categories: CATEGORY_ORDER },
    marks: { type: 'bar', barWidth: count === 1 ? 9 : Math.max(1.2, ringPx / 5) },
    minCount: count === 1 ? 1 : 3,
    spacing: spacing ?? undefined,
    ring: { radius: ringPx },
  });

  const renderer = new LensRenderer({
    preset: 'paper',
    ringRadius: ringPx,
    dimExterior: false,
    showValues: false,
    showLabels: count === 1,
    font: '500 10px ui-sans-serif, system-ui, sans-serif',
  });
  for (const layout of field.lenses) {
    const [x, y] = project(layout.center);
    renderer.draw(ctx, layout, {
      cx: x,
      cy: y,
      ringRadius: ringPx,
      selectionRadiusPx: count === 1 ? radius / metresPerPx : 0,
      scalePx: 1 / metresPerPx,
    });
  }
  return field.stats;
}

function elasticityCsv(data) {
  const distances = data.map((f) => geoDistance(CENTRE, [f.lng, f.lat]));
  const profile = elasticityProfile(distances, { maxRadius: 3000, samples: 121 });
  const rows = profile.map((p) =>
    [p.r.toFixed(1), p.count, p.elasticity.toFixed(4), p.reliable ? 1 : 0].join(','));
  return ['r,count,elasticity,reliable', ...rows].join('\n');
}

async function main() {
  const doc = await fetch('../../examples/data/yogyakarta.json').then((r) => r.json());
  const data = doc.features;
  const stats = {};
  for (const count of [1, 7, 40, 240]) stats[count] = continuum(data, count);
  window.__fieldStats = stats;
  window.__elasticityCsv = elasticityCsv(data);
  window.__figuresReady = true;
}

main().catch((err) => {
  out.textContent = `figure error: ${err.message}`;
  console.error(err);
});

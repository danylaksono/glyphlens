/**
 * Gallery — one dataset, many points in the design space.
 *
 * There is no map on this page, and that is the point. `computeLens` returns
 * plain geometry and `LensRenderer` paints it onto any 2D context, so every
 * tile here is the full pipeline running against a bare canvas. If the core had
 * quietly grown a dependency on MapLibre, this page could not exist.
 *
 * It also exercises the first thing docs/findings.md F-2 asks the core to
 * preserve — that a lens is a value, not a singleton — which is the
 * precondition for the lens-to-glyphmap continuum.
 */

import { computeLens } from '../../src/core/layout.js';
import { LensRenderer } from '../../src/render/LensRenderer.js';
import { polylineCurve } from '../../src/core/curve.js';
import { destination, distance as geoDistance, bearing as geoBearing } from '../../src/core/geo.js';

const CATEGORY_ORDER = ['food', 'retail', 'civic', 'health'];
const CENTRE = [110.3695, -7.7956];
const RADIUS = 1200;

const TILE = 300;
const RING = 104;
const SELECTION_PX = 74;

/** A transect for the corridor tile. */
const TRANSECT = [
  destination(CENTRE, 350, 1050),
  destination(CENTRE, 170, 1050),
];

/** A rough quadrilateral for the polygon tile. */
const SHAPE = [[
  destination(CENTRE, 320, 1100),
  destination(CENTRE, 40, 1100),
  destination(CENTRE, 130, 1200),
  destination(CENTRE, 230, 900),
]];

/**
 * Each tile names the path it takes through the pipeline, because the point of
 * the gallery is that these are one object with different arguments — not nine
 * different visualisations.
 */
const TILES = [
  {
    title: 'Category ring',
    note: 'The VisQuill point of the space: one aggregate per category, laid out in fixed slots. Angle carries nothing.',
    path: 'categorical · count · block · bar',
    config: {
      binning: { mode: 'categorical' },
      placement: { mode: 'block' },
      marks: { type: 'bar', barWidth: 24, reserveLabels: true },
    },
  },
  {
    title: 'The same data, as a necklace',
    note: 'Identical bins, placed at the mean bearing of their members. Angle now means direction, and the composition reading is traded for a spatial one.',
    path: 'categorical · count · necklace · bar',
    config: {
      binning: { mode: 'categorical' },
      placement: { mode: 'necklace' },
      marks: { type: 'bar', barWidth: 24, reserveLabels: true },
    },
  },
  {
    title: 'Compass rose',
    note: 'Twenty-four bearing sectors. Each bin owns its wedge, so placement cannot drift a bar into a neighbour.',
    path: 'angular(24) · count · necklace · bar',
    config: {
      binning: { mode: 'angular', bins: 24 },
      marks: { type: 'bar', barWidth: 10 },
    },
  },
  {
    title: 'Spread, not just direction',
    note: 'The arcs are each category’s angular standard deviation. A wide faint arc says the bar’s direction is not worth believing.',
    path: 'categorical · count · necklace · bar + spread',
    config: {
      binning: { mode: 'categorical' },
      marks: { type: 'bar', barWidth: 22, structure: 'spread', reserveLabels: true },
    },
  },
  {
    title: 'Directional profiles',
    note: 'When no single direction is true, the honest mark is the distribution. Petals point at true north, so roses compare with each other.',
    path: 'categorical · count · necklace · rose',
    config: {
      binning: { mode: 'categorical' },
      marks: { type: 'rose', maxRadius: 26, reserveLabels: true },
    },
  },
  {
    title: 'Classic necklace map',
    note: 'Disc symbols scaled by area, placed without overlap inside their intervals — Speckmann & Verbeek’s original, on a lens.',
    path: 'angular(16) · count · necklace · disc',
    config: {
      binning: { mode: 'angular', bins: 16 },
      marks: { type: 'disc', maxRadius: 15 },
    },
  },
  {
    title: 'A ring per variable',
    note: 'Concentric necklaces. Each mark competes only with its own category, so displacement falls to zero — paid for in radial space.',
    path: 'cross(8) · count · stacked · bar',
    config: {
      binning: { mode: 'cross', bins: 8 },
      placement: { mode: 'stacked', by: 'category', ringGap: 17 },
      marks: { type: 'bar', barWidth: 5 },
    },
  },
  {
    title: 'Unusual, not merely present',
    note: 'Location quotient against the surrounding area. Bars grow outward where a category is over-represented and inward where it is under.',
    path: 'categorical · lq · necklace · bar',
    config: {
      binning: { mode: 'categorical' },
      normalisation: { mode: 'lq' },
      marks: { type: 'bar', barWidth: 22, reserveLabels: true },
    },
  },
  {
    title: 'Distance decay',
    note: 'Bins are distance bands, normalised by ring area so the outer bands are not flattered by covering more ground.',
    path: 'radial(5) · density · block · bar',
    config: {
      binning: { mode: 'radial', rings: 5 },
      normalisation: { mode: 'density' },
      placement: { mode: 'block' },
      marks: { type: 'bar', barWidth: 26, reserveLabels: true },
    },
  },
  {
    title: 'Any shape',
    note: 'A polygon selection — an admin unit, a lasso or an isochrone are the same thing here. Bearings run from the centroid.',
    path: 'polygon · count · necklace · bar',
    config: {
      selection: { type: 'polygon', rings: SHAPE },
      binning: { mode: 'angular', bins: 16 },
      marks: { type: 'bar', barWidth: 9 },
    },
  },
  {
    title: 'Open curve',
    note: 'A corridor: position along the strip means distance travelled. The same solver, run on a polyline instead of a ring.',
    path: 'corridor · count · necklace · bar',
    config: {
      selection: { type: 'corridor', path: TRANSECT, width: 900 },
      binning: { mode: 'chainage', bins: 12 },
      marks: { type: 'bar', barWidth: 8, maxLength: 46 },
    },
    // Twelve chainage labels along 180px of strip collide; the strip itself
    // carries the ordering, so drop them at this size.
    style: { showLabels: false },
  },
  {
    title: 'The members themselves',
    note: 'Inclusions draw each place back through the aggregate, fainter where the bin is dense — so sparse structure survives binning.',
    path: 'angular(24) · count · necklace · bar + inclusions',
    config: {
      binning: { mode: 'angular', bins: 24 },
      marks: { type: 'bar', barWidth: 10, structure: 'inclusions' },
    },
  },
];

const BASE_STYLE = {
  preset: 'paper',
  ringRadius: RING,
  dimExterior: false,   // no basemap to dim
  showValues: false,
  font: '500 10px ui-sans-serif, system-ui, sans-serif',
};

/**
 * Screen position for a coordinate, in the lens's own azimuthal frame.
 *
 * The gallery has no map, so it needs some projection. Measuring bearing and
 * distance from the centre and scaling by the selection radius is the same
 * frame the lens itself reasons in (F-12), which keeps the drawn geometry
 * consistent with the placement.
 */
function projector(centre, metresPerPx, cx, cy) {
  return (coord) => {
    const d = geoDistance(centre, coord) / metresPerPx;
    const b = geoBearing(centre, coord);
    const a = ((b - 90) / 180) * Math.PI;
    return [cx + Math.cos(a) * d, cy + Math.sin(a) * d];
  };
}

async function main() {
  const doc = await fetch('data/yogyakarta.json').then((r) => r.json());
  const data = doc.features;
  const grid = document.getElementById('grid');
  document.getElementById('source').textContent =
    `${data.length.toLocaleString()} places, ${doc.name}, ${doc.retrieved}. `
    + 'Data © OpenStreetMap contributors.';

  for (const tile of TILES) {
    grid.appendChild(renderTile(tile, data));
  }
}

function renderTile(tile, data) {
  const figure = document.createElement('figure');
  figure.className = 'tile';

  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = TILE * dpr;
  canvas.height = TILE * dpr;
  canvas.style.width = `${TILE}px`;
  canvas.style.height = `${TILE}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cx = TILE / 2;
  const cy = TILE / 2;

  const selection = tile.config.selection ?? { type: 'disc', radius: RADIUS };
  const layout = computeLens({
    center: selection.type === 'disc' || selection.type === 'annulus' ? CENTRE : undefined,
    selection,
    data,
    getPosition: (f) => [f.lng, f.lat],
    binning: { category: (f) => f.category, categories: CATEGORY_ORDER, ...tile.config.binning },
    normalisation: tile.config.normalisation ?? { mode: 'count' },
    placement: tile.config.placement ?? { mode: 'necklace' },
    marks: tile.config.marks,
    ring: { radius: RING },
  });

  const metresPerPx = RADIUS / SELECTION_PX;
  const project = projector(layout.center ?? CENTRE, metresPerPx, cx, cy);

  const frame = { cx, cy, selectionRadiusPx: SELECTION_PX };
  if (selection.type === 'polygon') {
    frame.selectionRings = (selection.rings ?? []).map((r) => r.map(project));
  } else if (selection.type === 'corridor') {
    frame.curve = polylineCurve(selection.path.map(project), { closed: false });
    frame.corridorHalfWidthPx = (selection.width / 2) / metresPerPx;
    frame.selectionRadiusPx = 0;
  }

  const renderer = new LensRenderer({ ...BASE_STYLE, ...(tile.style ?? {}) });
  renderer.draw(ctx, layout, frame);

  const caption = document.createElement('figcaption');
  caption.innerHTML =
    `<h2>${tile.title}</h2><p class="note">${tile.note}</p><p class="path">${tile.path}</p>`;

  figure.append(canvas, caption);
  return figure;
}

main().catch((err) => {
  document.getElementById('source').textContent = `Could not load the sample: ${err.message}`;
});

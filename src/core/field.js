/**
 * Fields of lenses — the continuum from focus to glyphmap.
 *
 * docs/design-space.md §5 argues that a lens and a gridded glyphmap are the
 * same object at different `hSpSubset` settings: one lens is focus+context,
 * a handful are small multiples, and a lattice of them *is* a glyphmap. This
 * module is that claim made executable. The knob is **spacing** — as it
 * shrinks, the count rises and each lens shrinks with it, which is a smooth and
 * meaningful path rather than an animation between unrelated states.
 *
 * Nothing here is new machinery. `computeField` calls `computeLens` once per
 * centre, which is only possible because the core never assumed a single lens
 * (docs/findings.md F-2, property 1). What this module adds is the two things
 * a field needs and a single lens does not: somewhere to put the centres, and
 * a way to avoid rescanning the whole dataset for each one.
 */

import { computeLens } from './layout.js';
import { bin } from './binning.js';
import { profileOf } from './normalise.js';
import { scaleAt, latticeCoverage } from './lattice.js';

// Where the centres come from now lives in its own module, because there is
// more than one answer: three regular tilings and a relaxed one
// (docs/findings.md F-34, F-35). Re-exported here so a caller who thinks in
// fields need not know that.
export {
  lattice,
  hexLattice,
  relaxedLattice,
  voronoiCells,
  nearestSpacing,
  latticeCoverage,
  cellRadius,
  spacingForCount,
  touchingRadius,
  LATTICES,
} from './lattice.js';

/**
 * A uniform grid hash over the data, in a local metric frame.
 *
 * Without this, a field of `m` lenses over `n` features costs O(n·m) — 400
 * lenses over 1,449 places is half a million distance tests per frame, and a
 * real dataset is far worse. Bucketing once and querying a neighbourhood makes
 * it O(n + m·k) for small k.
 */
export function spatialIndex(features, { getPosition, origin, cellSize }) {
  const [kx, ky] = scaleAt(origin[1]);
  const cells = new Map();
  const key = (ix, iy) => `${ix},${iy}`;

  for (const feature of features) {
    const pos = getPosition(feature);
    if (!pos || !Number.isFinite(pos[0]) || !Number.isFinite(pos[1])) continue;
    const x = (pos[0] - origin[0]) * kx;
    const y = (pos[1] - origin[1]) * ky;
    const k = key(Math.floor(x / cellSize), Math.floor(y / cellSize));
    const bucket = cells.get(k);
    if (bucket) bucket.push(feature);
    else cells.set(k, [feature]);
  }

  return {
    cellSize,
    /** Features within `radius` metres of `point`, plus some slop. */
    near(point, radius) {
      const x = (point[0] - origin[0]) * kx;
      const y = (point[1] - origin[1]) * ky;
      const ix = Math.floor(x / cellSize);
      const iy = Math.floor(y / cellSize);
      // Reach as far as the radius demands: one ring of cells is only enough
      // while the lens is no wider than a cell.
      const reach = Math.max(1, Math.ceil(radius / cellSize));
      const out = [];
      for (let dx = -reach; dx <= reach; dx++) {
        for (let dy = -reach; dy <= reach; dy++) {
          const bucket = cells.get(key(ix + dx, iy + dy));
          if (bucket) out.push(...bucket);
        }
      }
      return out;
    },
  };
}

/**
 * Compute a lens at every centre.
 *
 * @param {object} config  everything `computeLens` takes, plus:
 * @param {Array<[number, number]>} config.centres
 * @param {object[]} [config.cells]     one per centre, describing its cell —
 *   carried through onto the layouts so the renderer can draw a boundary
 *   without re-deriving the lattice
 * @param {string} [config.kind='hex']  which lattice the centres came from
 * @param {number} [config.minCount=1]  skip lenses holding fewer members than this
 * @returns {{ lenses: object[], stats: object }}
 */
export function computeField(config) {
  const {
    centres = [],
    cells = null,
    kind = 'hex',
    data = [],
    getPosition = (f) => [f.lng ?? f.lon, f.lat],
    selection = { type: 'disc', radius: 400 },
    normalisation = { mode: 'count' },
    minCount = 1,
  } = config;

  if (centres.length === 0) return { lenses: [], stats: emptyStats() };

  const radius = selection.radius ?? 400;
  const index = spatialIndex(data, {
    getPosition,
    origin: centres[0],
    cellSize: Math.max(radius, 1),
  });

  // A field needs ONE baseline, not one per lens. Letting each lens derive its
  // own from its own surroundings would make every cell "average" by
  // construction and the map would say nothing. See docs/findings.md F-19.
  const spec = { ...normalisation };
  if ((spec.mode === 'lq' || spec.mode === 'delta') && !spec.baseline) {
    spec.baseline = fieldBaseline(data, config);
  }

  const lenses = [];
  let members = 0;
  let skipped = 0;

  centres.forEach((centre, i) => {
    const candidates = index.near(centre, radius);
    if (candidates.length < minCount) {
      skipped++;
      return;
    }
    const layout = computeLens({
      ...config,
      center: centre,
      selection: { ...selection, center: centre },
      data: candidates,
      normalisation: spec,
    });
    if (layout.stats.count < minCount) {
      skipped++;
      return;
    }
    members += layout.stats.count;
    // The cell rides on the layout because lenses are dropped as they are
    // computed, so their indices stop matching the centres they came from.
    lenses.push(cells?.[i] ? { ...layout, cell: cells[i] } : layout);
  });

  return {
    lenses,
    baseline: spec.baseline,
    stats: {
      centres: centres.length,
      drawn: lenses.length,
      skipped,
      members,
      spacing: config.spacing ?? null,
      radius,
      kind,
      // What the lattice does with the ground between its discs — see
      // `latticeCoverage`. Null when the caller supplied centres directly and
      // there is no spacing to reason about.
      coverage: latticeCoverage(radius, config.spacing, kind),
    },
  };
}

/**
 * The shared reference profile for a field: every feature, binned the same way
 * the lenses are. Computed once.
 */
export function fieldBaseline(data, config) {
  const { getPosition = (f) => [f.lng ?? f.lon, f.lat], binning = {} } = config;
  const items = data
    .map((feature) => {
      const pos = getPosition(feature);
      return pos ? { feature, position: pos, distance: 0, bearing: 0 } : null;
    })
    .filter(Boolean);
  return profileOf(bin(items, { ...binning, radius: 1 }));
}

function emptyStats() {
  return {
    centres: 0,
    drawn: 0,
    skipped: 0,
    members: 0,
    spacing: null,
    radius: 0,
    kind: 'hex',
    coverage: null,
  };
}

/** Ratio of lens radius to lattice spacing at which discs just touch. */
export const TOUCHING = 0.5;

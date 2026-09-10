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
import { EARTH_RADIUS, toRad } from './geo.js';
import { bin } from './binning.js';
import { profileOf } from './normalise.js';

/** Metres per degree of longitude and latitude at a given latitude. */
function scaleAt(lat) {
  return [
    (Math.PI / 180) * EARTH_RADIUS * Math.cos(toRad(lat)),
    (Math.PI / 180) * EARTH_RADIUS,
  ];
}

/**
 * A hexagonal lattice of centres covering a radius around a point.
 *
 * Hexagonal rather than square because it is what the gridded-glyphmap work
 * uses, and because every cell has six equidistant neighbours instead of a mix
 * of four near and four far — which matters once these are read as a surface.
 *
 * @param {object} options
 * @param {[number, number]} options.center  [lng, lat]
 * @param {number} options.radius            metres to cover from the centre
 * @param {number} options.spacing           metres between adjacent centres
 * @returns {Array<[number, number]>} centres, ordered top-left to bottom-right
 */
export function hexLattice({ center, radius, spacing }) {
  if (!(spacing > 0) || !(radius > 0)) return [center];
  const [kx, ky] = scaleAt(center[1]);
  const rowHeight = spacing * (Math.sqrt(3) / 2);
  const rows = Math.ceil(radius / rowHeight);
  const cols = Math.ceil(radius / spacing);

  const out = [];
  for (let r = -rows; r <= rows; r++) {
    const y = r * rowHeight;
    // Odd rows shift by half a spacing: that offset is what makes it hexagonal
    // rather than a rectangular grid with a different aspect ratio.
    const shift = (r & 1) === 0 ? 0 : spacing / 2;
    for (let c = -cols; c <= cols; c++) {
      const x = c * spacing + shift;
      if (Math.hypot(x, y) > radius) continue;
      out.push([center[0] + x / kx, center[1] + y / ky]);
    }
  }
  return out;
}

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
 * @param {number} [config.minCount=1]  skip lenses holding fewer members than this
 * @returns {{ lenses: object[], stats: object }}
 */
export function computeField(config) {
  const {
    centres = [],
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

  for (const centre of centres) {
    const candidates = index.near(centre, radius);
    if (candidates.length < minCount) {
      skipped++;
      continue;
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
      continue;
    }
    members += layout.stats.count;
    lenses.push(layout);
  }

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
      // What the lattice does with the ground between its discs — see
      // `latticeCoverage`. Null when the caller supplied centres directly and
      // there is no spacing to reason about.
      coverage: latticeCoverage(radius, config.spacing),
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
    centres: 0, drawn: 0, skipped: 0, members: 0, spacing: null, radius: 0, coverage: null,
  };
}

/**
 * Spacing that yields roughly `count` lenses over a circle of `radius`.
 *
 * The continuum control is more legible as "how many" than "how far apart", but
 * spacing is what the lattice actually takes, so this inverts it: a hexagonal
 * lattice packs about `1.103 · area / spacing²` centres into a given area.
 */
export function spacingForCount(count, radius) {
  if (!(count > 0) || !(radius > 0)) return radius;
  const area = Math.PI * radius * radius;
  return Math.sqrt((1.103 * area) / count);
}

/** Ratio of lens radius to lattice spacing at which discs just touch. */
export const TOUCHING = 0.5;

/**
 * Circumradius of a lattice cell — the Voronoi cell of the hexagonal lattice,
 * which is a regular hexagon with one vertex due north.
 *
 * This is what *tessellates*, and it is emphatically **not** the unit. A lens
 * selects a disc, so the hexagon is a statement about which centre is nearest,
 * not about what any lens counted. Drawing one while the other decides
 * membership is the whole hazard the two are worth separating for
 * (docs/findings.md F-33).
 */
export const cellRadius = (spacing) => spacing / Math.sqrt(3);

/**
 * How much of the lattice's area actually falls inside a lens.
 *
 * A hexagonal lattice of spacing `s` gives each centre `(sqrt(3)/2)·s²` of
 * ground; a disc of radius `r` covers `pi·r²` of it. At the default packing —
 * discs that touch their six neighbours — that ratio is `pi/(2·sqrt(3))`, so
 * about **9% of the map is in no lens at all** and anything standing there is
 * counted nowhere. Above 1 the discs overlap and members are counted twice.
 *
 * Neither is a bug, and both are invisible unless something says so, which is
 * why this rides on the field's stats rather than in a comment.
 */
export function latticeCoverage(radius, spacing) {
  if (!(radius > 0) || !(spacing > 0)) return null;
  return (Math.PI * radius * radius) / ((Math.sqrt(3) / 2) * spacing * spacing);
}

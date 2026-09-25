/**
 * The docked anchor: the lens's chart, taken off the map.
 *
 * The anchor axis runs ring -> arc -> straight baseline (docs/design-space.md
 * §3.4b). Docking is the next step along it: the same straight strip, drawn in
 * a panel instead of beside the selection. Nothing upstream changes: placement
 * reserves each mark's room as a fraction of the curve, so a strip of any
 * length accepts the solved layout, exactly as an unrolled ring does.
 *
 * What does change is what the chart can be read against. On the map a lens is
 * read against the map around it. Docked, it has lost that, and it needs two
 * things a lens beside its own selection never did:
 *
 *   - a **context**: what this lens would read if the study area were
 *     uniform, drawn behind each mark, so moving the lens is a scan for
 *     deviation rather than a chart that keeps rewriting itself;
 *   - a **fixed scale**: the lens's own marks are scaled to the largest
 *     value *in that lens*, which is right for a glyph and wrong for a chart
 *     whose bars are meant to be compared from one position to the next.
 *
 * Both are properties of the instrument (the data, the selection's size and
 * shape, the binning, the normalisation) and never of where the lens is. That
 * is the rule this module keeps: everything here is computed once per
 * instrument and reused as the lens moves (docs/findings.md F-37).
 */

import { computeLens } from './layout.js';
import { hullOf, lattice } from './lattice.js';
import { distance, pointInPolygon, polygonArea, polygonCentroid } from './geo.js';
import { selectionArea, normaliseRings } from './selection.js';

const defaultGetPosition = (f) => [f.lng ?? f.lon, f.lat];

/**
 * The study area a dataset implies, and how its members are distributed
 * across categories.
 *
 * With no boundary supplied, the study area is the convex hull of the data —
 * the same answer the relaxed lattice gives when nobody has drawn one
 * (docs/findings.md F-35). A hull overstates the area of a concave dataset, so
 * pass `boundary` where there is a real one.
 *
 * @param {object} config
 * @param {any[]} config.data
 * @param {(f) => [number, number]} [config.getPosition]
 * @param {(f) => string} [config.category]
 * @param {Array<Array<[number, number]>>} [config.boundary]  rings, if known
 */
export function studyArea({ data = [], getPosition = defaultGetPosition, category, boundary } = {}) {
  const positions = [];
  const byCategory = {};
  for (const f of data) {
    const p = getPosition(f);
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    positions.push(p);
    if (category) {
      const c = String(category(f));
      byCategory[c] = (byCategory[c] ?? 0) + 1;
    }
  }
  const rings = boundary ?? (positions.length >= 3 ? [hullOf(positions)] : []);
  const areaKm2 = rings.length ? polygonArea(rings) : 0;
  return {
    rings,
    areaKm2,
    count: positions.length,
    byCategory,
    centroid: rings.length ? polygonCentroid(rings) : null,
  };
}

/**
 * The area a bin covers, in km².
 *
 * A distance band states its own; a bearing sector is its share of the lens;
 * a category occupies the whole lens, since its members can be anywhere in it.
 */
function binArea(bin, layout) {
  if (Number.isFinite(bin.areaKm2)) return bin.areaKm2;
  const lens = layout.stats?.areaKm2 ?? 0;
  const mode = layout.binning?.mode;
  if (mode === 'angular' || mode === 'cross') return lens / (layout.binning.bins ?? 24);
  return lens;
}

/**
 * What each bin would read if the study area were uniform — every category at
 * its study-area density, everywhere.
 *
 * Depends on the size and shape of the selection and not on its position,
 * which is what lets it sit still behind marks that move. Keyed by bin key.
 *
 * For an intensive reading (share, density, lq) this is also the reading of
 * the study area as a whole. Only a count differs, because a count is the one
 * measure that scales with the area it is taken over (docs/findings.md F-21) —
 * which is why `wholeValues` exists alongside this and only for counts.
 *
 * Returns null where the null model says nothing useful (`z`, `delta`).
 */
export function expectedValues(layout, study) {
  const mode = layout?.normalisation?.mode ?? 'count';
  const out = new Map();
  if (!layout?.bins || !(study?.areaKm2 > 0)) return null;
  if (mode === 'z' || mode === 'delta') return null;

  const densityOf = (b) =>
    (b.category != null && study.byCategory[b.category] != null
      ? study.byCategory[b.category]
      : b.category != null ? 0 : study.count) / study.areaKm2;

  if (mode === 'lq') {
    // A location quotient is 1 by construction wherever the mix is the study
    // area's own.
    for (const b of layout.bins) out.set(b.key, 1);
    return out;
  }
  if (mode === 'density') {
    for (const b of layout.bins) out.set(b.key, densityOf(b));
    return out;
  }

  const raw = layout.bins.map((b) => densityOf(b) * binArea(b, layout));
  const total = raw.reduce((s, v) => s + v, 0);
  layout.bins.forEach((b, i) => {
    out.set(b.key, mode === 'share' ? (total > 0 ? raw[i] / total : 0) : raw[i]);
  });
  return out;
}

/**
 * The whole study area's count for each bin: the crossfilter reading, where
 * the lens highlights its part of a bar that stands for everything.
 *
 * Only defined for counts of categories. A share, a density or a quotient of
 * the whole study area is the same number as its expectation, and a bearing
 * sector of the whole study area depends on where the lens is — so there is
 * no whole to be a part of.
 */
export function wholeValues(layout, study) {
  if ((layout?.normalisation?.mode ?? 'count') !== 'count') return null;
  if (!layout?.bins?.length || layout.binning?.mode !== 'categorical') return null;
  const out = new Map();
  for (const b of layout.bins) out.set(b.key, study.byCategory[b.category] ?? 0);
  return out;
}

/**
 * A fixed value scale for a docked strip.
 *
 * Sampled, not derived: the lens is placed at centres across the study area
 * with its current size, shape, binning and normalisation, and the scale is
 * the `percentile` of the readings it gets there. It is therefore the range
 * this instrument can actually reach, which a scale fitted to one position
 * cannot know and a scale fitted to the study area as a whole overstates for a
 * count by the ratio of the two areas.
 *
 * Readings above it are clipped, and a strip should say so. A percentile below
 * 1 is deliberate: one freak position should not flatten every other. Nor
 * does a position holding fewer than `minCount` members get a say, for the
 * reason F-17 gives: a share or a quotient of three places is arithmetic, not
 * geography, and a small lens sampled at its emptiest would set the scale by
 * its noise. If too few positions qualify, all of them are used.
 *
 * @param {object} config        the lens config, as `computeLens` takes it
 * @param {object} study         from `studyArea`
 * @param {object} [options]
 * @param {number} [options.percentile=0.95]
 * @param {number} [options.maxSamples=160]  caps cost when the lens is small
 * @param {number} [options.minCount=30]     members a position needs to count
 * @param {Map}    [options.floor]           values the scale must include, e.g.
 *   the context; without it a ghost bar can be taller than the chart
 * @returns {{ max: number, samples: number, percentile: number, bound: 'samples'|'context' }}
 *   `bound` says which set the scale: the sampled readings, or the floor —
 *   the whole study area's counts always outgrow any one lens's.
 */
export function dockDomain(config, study, {
  percentile = 0.95, maxSamples = 160, minCount = 30, floor,
} = {}) {
  const floorMax = floor ? Math.max(0, ...[...floor.values()].filter(Number.isFinite)) : 0;
  const fallback = { max: niceCeil(floorMax || 1), samples: 0, percentile, bound: 'context' };
  if (!study?.rings?.length || !(study.areaKm2 > 0)) return fallback;

  const outer = study.rings[0];
  const centroid = study.centroid;
  const reach = Math.max(...outer.map((p) => distance(centroid, p)));

  // The lens's own linear size sets the natural spacing. Below it the samples
  // overlap so heavily they add nothing but cost.
  const selection = config.selection ?? { type: 'disc', radius: 800 };
  const polygon = selection.type === 'polygon' ? normaliseRings(selection) : null;
  const size = polygon
    ? Math.sqrt(Math.max(selectionArea(selection), 1e-6)) * 1000
    : selection.radius ?? 800;
  const floorSpacing = Math.sqrt((study.areaKm2 * 1e6) / (maxSamples * 0.866));
  const spacing = Math.max(size, floorSpacing);

  const centres = lattice({ kind: 'hex', center: centroid, radius: reach, spacing })
    .centres.filter((c) => pointInPolygon(c, study.rings));
  if (centres.length === 0) return fallback;

  const origin = polygon ? polygonCentroid(polygon) : null;
  const readings = [];
  for (const c of centres) {
    const sel = polygon
      ? { type: 'polygon', rings: polygon.map((ring) => ring.map(([x, y]) => [x + c[0] - origin[0], y + c[1] - origin[1]])) }
      : selection;
    const layout = computeLens({
      ...config,
      center: polygon ? undefined : c,
      selection: sel,
      // Only values are wanted; the cheapest placement will do.
      placement: { mode: 'block' },
      ring: config.ring ?? { radius: 100 },
    });
    readings.push(layout);
  }

  const qualified = readings.filter((l) => l.stats.count >= minCount);
  const used = qualified.length >= 5 ? qualified : readings;
  const perKey = new Map();
  for (const layout of used) {
    for (const b of layout.bins) {
      if (!Number.isFinite(b.value)) continue;
      if (!perKey.has(b.key)) perKey.set(b.key, []);
      perKey.get(b.key).push(b.value);
    }
  }

  let sampled = 0;
  for (const values of perKey.values()) {
    values.sort((a, b) => a - b);
    const i = Math.min(values.length - 1, Math.floor(percentile * (values.length - 1)));
    sampled = Math.max(sampled, values[i]);
  }
  return {
    max: niceCeil(Math.max(sampled, floorMax) || 1),
    samples: used.length,
    percentile,
    bound: floorMax > sampled ? 'context' : 'samples',
  };
}

/** Round up to 1, 2, 2.5 or 5 times a power of ten, so gridlines land on round numbers. */
export function niceCeil(v) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (v <= m * p * (1 + 1e-9)) return m * p;
  }
  return 10 * p;
}

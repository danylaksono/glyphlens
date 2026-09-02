/**
 * Binning — how the enclosed set is decomposed.
 *
 * VisQuill's lens only ever does `categorical`: everything inside the radius
 * collapses to one number per category, discarding where and how far. The other
 * three modes are the point of this library.
 *
 *   categorical  angle = nominal order        composition
 *   angular      angle = BEARING              anisotropy (the necklace case)
 *   radial       radius = distance band       distance decay
 *   cross        bearing x category           both
 *   chainage     position = DISTANCE ALONG    what changes along a route
 *   unit         one bin per areal unit       census geography, as a necklace
 *
 * Every bin carries `bearing` (its preferred angular position, or null when the
 * mode has none) and `interval` (its feasible arc, or null). Those two fields
 * are what the placement stage consumes.
 */

import { normaliseBearing } from './geo.js';
import { aggregate } from './areal.js';

const TAU_DEG = 360;

/**
 * Aggregate a group.
 *
 * A `measure` spec routes to `aggregate`, which knows the difference between
 * extensive and intensive quantities. Otherwise this sums `value`, or counts,
 * weighting by `item.weight` where there is one — which is 1 for every point,
 * so the point path is unchanged.
 */
function measure(items, getValue, measureSpec) {
  if (measureSpec) return aggregate(items, measureSpec);
  if (!getValue) {
    let n = 0;
    for (const it of items) n += it.weight ?? 1;
    return n;
  }
  let sum = 0;
  for (const it of items) sum += (getValue(it.feature) ?? 0) * (it.weight ?? 1);
  return sum;
}

/**
 * @param {Array<{feature, distance, bearing}>} items  output of `select`
 * @param {object} spec
 * @param {'categorical'|'angular'|'radial'|'cross'} spec.mode
 * @param {(f: any) => string} [spec.category]
 * @param {(f: any) => number} [spec.value]  omit for counts
 * @param {number} [spec.bins=24]            angular bins
 * @param {number} [spec.rings=4]            radial bins
 * @param {number} [spec.radius]             required for radial/cross
 * @param {string[]} [spec.categories]       fixes order and includes empties
 */
export function bin(items, spec) {
  switch (spec.mode) {
    case 'angular':
      return binAngular(items, spec);
    case 'radial':
      return binRadial(items, spec);
    case 'cross':
      return binCross(items, spec);
    case 'chainage':
      return binChainage(items, spec);
    case 'unit':
      return binUnits(items, spec);
    case 'categorical':
    default:
      return binCategorical(items, spec);
  }
}

export function binCategorical(items, spec = {}) {
  const getCategory = spec.category ?? ((f) => f.category ?? 'all');
  const groups = new Map();
  for (const it of items) {
    const key = String(getCategory(it.feature));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }

  const keys = spec.categories ?? [...groups.keys()].sort();
  return keys.map((key) => {
    const group = groups.get(key) ?? [];
    return {
      key,
      label: key,
      category: key,
      count: group.length,
      raw: measure(group, spec.value, spec.measure),
      items: group,
      // Nominal order carries no bearing: placement will lay these out in
      // blocks unless the caller morphs towards `angular`.
      bearing: null,
      interval: null,
      // Mean bearing is still computed, so the categorical -> angular morph
      // has a target to interpolate towards.
      meanBearing: circularMean(group.map((g) => g.bearing)),
      // How well-defined that mean direction is, in [0, 1]. A category spread
      // evenly round the lens has a mean bearing that means nothing; this is
      // what lets the renderer say so. See docs/findings.md F-6.
      concentration: circularConcentration(group.map((g) => g.bearing)),
    };
  });
}

export function binAngular(items, spec = {}) {
  const nBins = spec.bins ?? 24;
  const width = TAU_DEG / nBins;
  const getCategory = spec.category;
  const buckets = Array.from({ length: nBins }, () => []);

  for (const it of items) {
    const idx = Math.min(nBins - 1, Math.floor(normaliseBearing(it.bearing) / width));
    buckets[idx].push(it);
  }

  return buckets.map((group, i) => {
    const centre = i * width + width / 2;
    return {
      key: `b${i}`,
      label: compassLabel(centre),
      // A bearing sector mixes categories, so it has none of its own. Colouring
      // it by an arbitrary member would be a lie; use `cross` when the category
      // dimension matters. `dominant` is reported for tooltips only.
      category: null,
      dominant: getCategory && group.length ? dominantOf(group, getCategory) : null,
      count: group.length,
      raw: measure(group, spec.value, spec.measure),
      items: group,
      bearing: centre,
      // A bin owns exactly its wedge — this is a real feasible interval, so
      // placement cannot drift a bar into a neighbouring sector.
      interval: [i * width, (i + 1) * width],
      meanBearing: circularMean(group.map((g) => g.bearing)) ?? centre,
    };
  });
}

/**
 * Bins along a corridor, by distance travelled.
 *
 * The open-curve counterpart of `binAngular`: where that one owns a wedge of
 * bearings, this owns a stretch of route. Both emit a feasible `interval`, so
 * placement treats them identically — the interval is in degrees for a ring and
 * in curve parameter for a strip.
 */
export function binChainage(items, spec = {}) {
  const nBins = spec.bins ?? 20;
  const length = spec.length ?? Math.max(1, ...items.map((i) => i.chainage ?? 0));
  const step = length / nBins;
  const getCategory = spec.category;
  const buckets = Array.from({ length: nBins }, () => []);

  for (const it of items) {
    const idx = Math.min(nBins - 1, Math.max(0, Math.floor((it.chainage ?? 0) / step)));
    buckets[idx].push(it);
  }

  return buckets.map((group, i) => ({
    key: `c${i}`,
    label: `${(i * step / 1000).toFixed(1)} km`,
    category: null,
    dominant: getCategory && group.length ? dominantOf(group, getCategory) : null,
    count: group.length,
    raw: measure(group, spec.value, spec.measure),
    items: group,
    chainage: i * step + step / 2,
    // Curve parameter, so placement needs no knowledge of corridors.
    position: (i + 0.5) / nBins,
    interval: [i / nBins, (i + 1) / nBins],
    bearing: null,
    areaKm2: spec.width ? (step / 1000) * (spec.width / 1000) : undefined,
  }));
}

/**
 * One bin per areal unit — a necklace map of census geography.
 *
 * This is the mode the interval API was designed for. Each unit carries the arc
 * it actually subtends from the lens centre, so placement may slide a symbol
 * along that arc to avoid its neighbours but can never move it somewhere the
 * unit is not. Angular bins own a wedge by construction; a unit owns whatever
 * arc its geometry occupies (docs/findings.md F-1, F-21).
 */
export function binUnits(items, spec = {}) {
  const label = spec.label ?? ((f) => f.name ?? f.code ?? '');
  const key = spec.key ?? ((f) => f.code ?? f.id ?? f.name);
  const getCategory = spec.category;

  return items.map((it) => ({
    key: String(key(it.feature)),
    label: String(label(it.feature)),
    category: getCategory ? String(getCategory(it.feature)) : null,
    count: 1,
    raw: measure([it], spec.value, spec.measure),
    items: [it],
    weight: it.weight,
    bearing: it.bearing,
    // The unit's true angular extent, when it has one. A unit containing the
    // lens centre subtends everything, so it gets no interval and placement is
    // free to put it anywhere.
    interval: it.interval ?? null,
    meanBearing: it.bearing,
    // Only the part inside the lens counts towards density.
    areaKm2: (it.unitAreaKm2 ?? 0) * (it.weight ?? 1),
  }));
}

export function binRadial(items, spec = {}) {
  const rings = spec.rings ?? 4;
  const radius = spec.radius ?? Math.max(1, ...items.map((i) => i.distance));
  const step = radius / rings;
  const buckets = Array.from({ length: rings }, () => []);

  for (const it of items) {
    const idx = Math.min(rings - 1, Math.floor(it.distance / step));
    buckets[idx].push(it);
  }

  return buckets.map((group, i) => ({
    key: `r${i}`,
    label: `${Math.round(i * step)}–${Math.round((i + 1) * step)} m`,
    count: group.length,
    raw: measure(group, spec.value, spec.measure),
    items: group,
    ring: i,
    // Ring area, so radial bins can be density-normalised honestly: outer
    // rings cover far more ground than inner ones.
    areaKm2: (Math.PI * ((i + 1) * step) ** 2 - Math.PI * (i * step) ** 2) / 1e6,
    bearing: null,
    interval: null,
  }));
}

export function binCross(items, spec = {}) {
  const angular = binAngular(items, { ...spec, category: undefined });
  const getCategory = spec.category ?? ((f) => f.category ?? 'all');
  const out = [];
  for (const sector of angular) {
    const groups = new Map();
    for (const it of sector.items) {
      const key = String(getCategory(it.feature));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    }
    const keys = spec.categories ?? [...groups.keys()].sort();
    for (const key of keys) {
      const group = groups.get(key) ?? [];
      out.push({
        key: `${sector.key}:${key}`,
        label: `${key} ${sector.label}`,
        category: key,
        count: group.length,
        raw: measure(group, spec.value, spec.measure),
        items: group,
        bearing: sector.bearing,
        interval: sector.interval,
        meanBearing: circularMean(group.map((g) => g.bearing)) ?? sector.bearing,
      });
    }
  }
  return out;
}

/**
 * Resultant length of a set of bearings, in [0, 1].
 *
 * 1 means every member points the same way; 0 means they cancel out entirely
 * and the circular mean is arbitrary.
 */
export function circularConcentration(bearings) {
  if (!bearings || bearings.length === 0) return 0;
  let x = 0;
  let y = 0;
  for (const b of bearings) {
    const r = (b * Math.PI) / 180;
    x += Math.cos(r);
    y += Math.sin(r);
  }
  return Math.hypot(x, y) / bearings.length;
}

/** Most common category in a group, for reporting rather than encoding. */
function dominantOf(group, getCategory) {
  const tally = new Map();
  for (const it of group) {
    const key = String(getCategory(it.feature));
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Mean of a set of bearings, or null when empty. */
export function circularMean(bearings) {
  if (!bearings || bearings.length === 0) return null;
  let x = 0;
  let y = 0;
  for (const b of bearings) {
    const r = (b * Math.PI) / 180;
    x += Math.cos(r);
    y += Math.sin(r);
  }
  if (x === 0 && y === 0) return null;
  return normaliseBearing((Math.atan2(y, x) * 180) / Math.PI);
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export function compassLabel(bearingDeg) {
  return COMPASS[Math.round(normaliseBearing(bearingDeg) / 22.5) % 16];
}

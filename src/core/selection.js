/**
 * Selection — what the lens encloses (`hSpSubset`).
 *
 * Each selector takes features and returns the enclosed subset, annotated with
 * the two quantities every downstream stage needs: `distance` (metres from the
 * lens centre) and `bearing` (degrees, 0 = north). Those annotations are what
 * make the angular and radial binning modes possible at all.
 *
 * Currently implemented: disc, annulus, sector, corridor, polygon.
 *
 * `polygon` also covers the `lasso` and `isochrone` cases: all three are "here
 * is a shape", and they differ only in where the shape came from. Producing an
 * isochrone is a routing problem and stays the caller's job — this library
 * renders whatever polygon it is handed.
 *
 * A corridor is the one selection with no centre. Its members are annotated
 * with `chainage` (distance along the path) and `offset` (signed perpendicular
 * distance) instead, which is what lets the same binning and placement stages
 * run on a route or a coastline as on a disc.
 */

import {
  distance as geoDistance,
  bearing as geoBearing,
  bearingDelta,
  projectOntoPath,
  pathLength,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
} from './geo.js';

const defaultGetPosition = (f) =>
  Array.isArray(f) ? f : f.position ?? f.coordinates ?? [f.lng ?? f.lon ?? f.x, f.lat ?? f.y];

/**
 * @param {object} selection  `{ type, ...params }`
 * @param {[number, number]} selection.center  [lng, lat]
 * @returns {(features: any[], opts?: object) => { items: any[], area: number }}
 */
export function select(features, selection, { getPosition = defaultGetPosition } = {}) {
  if (selection.type === 'corridor') return selectCorridor(features, selection, { getPosition });
  if (selection.type === 'polygon') return selectPolygon(features, selection, { getPosition });

  const { center } = selection;
  const items = [];

  for (const feature of features) {
    const pos = getPosition(feature);
    if (!pos || !Number.isFinite(pos[0]) || !Number.isFinite(pos[1])) continue;
    const d = geoDistance(center, pos);
    const b = geoBearing(center, pos);
    if (contains(selection, d, b)) {
      items.push({ feature, position: pos, distance: d, bearing: b });
    }
  }

  return { items, area: selectionArea(selection) };
}

/**
 * Members within `width / 2` of a path.
 *
 * `distance` here is the distance *along* the corridor, not from a centre, so
 * that the radial binning and placement stages need no special case: for a
 * corridor, "how far along" plays the role that "how far out" plays for a disc.
 * `bearing` is the direction of travel at the closest point, so a corridor can
 * still drive the angular modes if a caller wants them.
 */
export function selectCorridor(features, selection, { getPosition = defaultGetPosition } = {}) {
  const { path, width = 400 } = selection;
  if (!path || path.length < 2) return { items: [], area: 0 };

  const half = width / 2;
  const length = pathLength(path);
  const items = [];

  for (const feature of features) {
    const pos = getPosition(feature);
    if (!pos || !Number.isFinite(pos[0]) || !Number.isFinite(pos[1])) continue;
    const { offset, chainage, t } = projectOntoPath(pos, path);
    if (Math.abs(offset) > half) continue;
    items.push({
      feature,
      position: pos,
      distance: chainage,
      offset,
      chainage,
      t,
      bearing: geoBearing(pos, path[Math.min(path.length - 1, 1)]),
    });
  }

  return { items, area: selectionArea({ ...selection, length }), length };
}

/**
 * Members inside an arbitrary polygon — a drawn lasso, an admin unit, an
 * isochrone.
 *
 * A polygon has no natural centre, but every downstream stage needs one to
 * measure bearing and distance from, so the area-weighted centroid is used
 * unless the caller supplies `center` explicitly. That choice is visible in the
 * reading: bearings are relative to it, so a caller with a better anchor — the
 * point an isochrone was generated from, say — should pass it.
 */
export function selectPolygon(features, selection, { getPosition = defaultGetPosition } = {}) {
  const rings = normaliseRings(selection);
  if (!rings.length) return { items: [], area: 0 };

  const center = selection.center ?? polygonCentroid(rings);
  const items = [];

  for (const feature of features) {
    const pos = getPosition(feature);
    if (!pos || !Number.isFinite(pos[0]) || !Number.isFinite(pos[1])) continue;
    if (!pointInPolygon(pos, rings)) continue;
    items.push({
      feature,
      position: pos,
      distance: geoDistance(center, pos),
      bearing: geoBearing(center, pos),
    });
  }

  return { items, area: polygonArea(rings), center, rings };
}

/**
 * Accept the shapes callers actually have: a bare ring, an array of rings, or
 * GeoJSON Polygon / MultiPolygon coordinates.
 */
export function normaliseRings(selection) {
  const raw = selection.rings ?? selection.coordinates ?? selection.polygon;
  if (!Array.isArray(raw) || raw.length === 0) return [];

  // A bare ring: [[lng, lat], ...]
  if (typeof raw[0]?.[0] === 'number') return [raw];
  // Rings: [[[lng, lat], ...], ...]
  if (typeof raw[0]?.[0]?.[0] === 'number') return raw;
  // MultiPolygon: flatten to rings. Holes still work, because the parity test
  // counts crossings across every ring.
  if (typeof raw[0]?.[0]?.[0]?.[0] === 'number') return raw.flat();
  return [];
}

/** Containment test in the (distance, bearing) frame the selection defines. */
export function contains(selection, distanceM, bearingDeg) {
  switch (selection.type) {
    case 'disc':
      return distanceM <= selection.radius;
    case 'annulus':
      return distanceM >= (selection.innerRadius ?? 0) && distanceM <= selection.radius;
    case 'corridor':
    case 'polygon':
      // These need the geometry, not a distance and a bearing, so their own
      // selectors handle containment rather than going through this test.
      return true;
    case 'sector': {
      if (distanceM > selection.radius) return false;
      if (distanceM < (selection.innerRadius ?? 0)) return false;
      const half = (selection.sweep ?? 90) / 2;
      return Math.abs(bearingDelta(selection.bearing ?? 0, bearingDeg)) <= half;
    }
    default:
      // `polygon` is handled by the caller supplying pre-filtered features,
      // until a point-in-polygon path is added.
      return distanceM <= (selection.radius ?? Infinity);
  }
}

/** Selection area in square kilometres, for density normalisation. */
export function selectionArea(selection) {
  const r = (selection.radius ?? 0) / 1000;
  const ri = (selection.innerRadius ?? 0) / 1000;
  switch (selection.type) {
    case 'disc':
      return Math.PI * r * r;
    case 'annulus':
      return Math.PI * (r * r - ri * ri);
    case 'sector':
      return (Math.PI * (r * r - ri * ri) * (selection.sweep ?? 90)) / 360;
    case 'corridor': {
      // Rectangle plus the end caps; good enough for a density denominator.
      const len = (selection.length ?? pathLength(selection.path ?? [])) / 1000;
      const w = (selection.width ?? 0) / 1000;
      return len * w + Math.PI * (w / 2) ** 2;
    }
    case 'polygon':
      return polygonArea(normaliseRings(selection));
    default:
      return selection.areaKm2 ?? Math.PI * r * r;
  }
}

/**
 * The complement of the selection out to `contextRadius`.
 *
 * This is the "exterior" effect scope from the lens design space: an
 * inside-vs-rest baseline without needing a second view.
 * See docs/design-space.md 3.7.
 */
export function selectComplement(features, selection, options = {}) {
  const { getPosition = defaultGetPosition, contextRadius = Infinity } = options;
  const { center } = selection;
  const items = [];
  const rings = selection.type === 'polygon' ? normaliseRings(selection) : null;

  for (const feature of features) {
    const pos = getPosition(feature);
    if (!pos) continue;
    const d = geoDistance(center, pos);
    if (d > contextRadius) continue;
    const b = geoBearing(center, pos);
    const inside = rings ? pointInPolygon(pos, rings) : contains(selection, d, b);
    if (!inside) {
      items.push({ feature, position: pos, distance: d, bearing: b });
    }
  }
  const outer = Number.isFinite(contextRadius) ? Math.PI * (contextRadius / 1000) ** 2 : NaN;
  return { items, area: outer - selectionArea(selection) };
}

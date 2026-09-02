/**
 * Geodesy helpers.
 *
 * Everything here works on `[lng, lat]` pairs in degrees and returns metres or
 * degrees. Screen-space conversion lives in the adapters, with the single
 * exception of `bearingToScreenAngle`, which is needed by the layout stage to
 * turn a compass bearing into a canvas angle.
 */

export const EARTH_RADIUS = 6371008.8; // metres, IUGG mean radius

export const toRad = (deg) => (deg * Math.PI) / 180;
export const toDeg = (rad) => (rad * 180) / Math.PI;

/** Great-circle distance in metres. */
export function distance([lng1, lat1], [lng2, lat2]) {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lng2 - lng1);
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Initial bearing in degrees, 0 = north, increasing clockwise. */
export function bearing([lng1, lat1], [lng2, lat2]) {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lng2 - lng1);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return normaliseBearing(toDeg(Math.atan2(y, x)));
}

/**
 * Wrap a bearing into [0, 360).
 *
 * The epsilon matters: a feature due north can come back from the trigonometry
 * as 359.999999998, and a naive wrap then files it in the *last* angular bin
 * rather than the first — visible as a bar on the wrong side of north.
 */
export function normaliseBearing(deg, epsilon = 1e-9) {
  const b = ((deg % 360) + 360) % 360;
  return b >= 360 - epsilon || b < epsilon ? 0 : b;
}

/** Point at `distanceM` along `bearingDeg` from `origin`. */
export function destination([lng, lat], bearingDeg, distanceM) {
  const delta = distanceM / EARTH_RADIUS;
  const theta = toRad(bearingDeg);
  const phi1 = toRad(lat);
  const lambda1 = toRad(lng);
  const sinPhi2 =
    Math.sin(phi1) * Math.cos(delta) +
    Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
  const phi2 = Math.asin(sinPhi2);
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * sinPhi2,
    );
  return [((toDeg(lambda2) + 540) % 360) - 180, toDeg(phi2)];
}

/**
 * Compass bearing (0 = north, clockwise) to canvas angle in radians
 * (0 = +x axis, clockwise because canvas y points down).
 */
export const bearingToScreenAngle = (bearingDeg) => toRad(bearingDeg - 90);

/** Inverse of {@link bearingToScreenAngle}. */
export const screenAngleToBearing = (rad) => (toDeg(rad) + 450) % 360;

/** Ground resolution in metres per pixel for a Web Mercator tile pyramid. */
export function metresPerPixel(lat, zoom, tileSize = 512) {
  return (
    (Math.cos(toRad(lat)) * 2 * Math.PI * EARTH_RADIUS) /
    (tileSize * 2 ** zoom)
  );
}

/** Smallest signed difference between two bearings, in (-180, 180]. */
export function bearingDelta(a, b) {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

/**
 * Project a point onto a polyline.
 *
 * Works in a local equirectangular frame scaled at the polyline's mean
 * latitude, which is accurate to well under a metre over the few kilometres a
 * corridor lens spans, and avoids dragging in a projection library.
 *
 * @param {[number, number]} point
 * @param {Array<[number, number]>} path  at least two [lng, lat] vertices
 * @returns {{ offset: number, chainage: number, t: number, closest: [number, number] }}
 *   `offset` is the perpendicular distance in metres, signed: positive to the
 *   left of the direction of travel. `chainage` is the distance along the path
 *   to the closest point, and `t` the same as a fraction of total length.
 */
export function projectOntoPath(point, path) {
  const lat0 = path.reduce((s, p) => s + p[1], 0) / path.length;
  const kx = (Math.PI / 180) * EARTH_RADIUS * Math.cos(toRad(lat0));
  const ky = (Math.PI / 180) * EARTH_RADIUS;
  const xy = ([lng, lat]) => [lng * kx, lat * ky];

  const p = xy(point);
  const verts = path.map(xy);

  let best = { offset: Infinity, chainage: 0, t: 0, closest: path[0] };
  let travelled = 0;

  for (let i = 0; i < verts.length - 1; i++) {
    const [ax, ay] = verts[i];
    const [bx, by] = verts[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const segLen = Math.hypot(dx, dy);
    if (segLen === 0) continue;

    // Parameter of the closest point on this segment, clamped to its ends.
    const u = Math.min(1, Math.max(0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / segLen ** 2));
    const cx = ax + dx * u;
    const cy = ay + dy * u;
    const dist = Math.hypot(p[0] - cx, p[1] - cy);

    if (dist < Math.abs(best.offset)) {
      // Sign from the 2D cross product: positive is left of travel.
      const side = Math.sign(dx * (p[1] - ay) - dy * (p[0] - ax)) || 1;
      best = {
        offset: dist * side,
        chainage: travelled + segLen * u,
        t: 0,
        closest: [cx / kx, cy / ky],
      };
    }
    travelled += segLen;
  }

  best.t = travelled > 0 ? best.chainage / travelled : 0;
  return best;
}

/** Total length of a polyline in metres. */
export function pathLength(path) {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += distance(path[i - 1], path[i]);
  return total;
}

/**
 * Point-in-polygon by ray casting, with holes.
 *
 * `rings` is an array of linear rings in [lng, lat]: the first is the outer
 * boundary, any others are holes. Crossings are counted across every ring and
 * the parity taken at the end, so a point inside a hole correctly falls out.
 *
 * Winding order does not matter, and rings need not be explicitly closed.
 *
 * Testing in degrees rather than a projected frame is deliberate: it is exact
 * for the meridian/parallel edges that admin boundaries are full of, and the
 * error elsewhere is the same great-circle-vs-straight-line difference that the
 * polygon's own vertices already assume.
 */
export function pointInPolygon(point, rings) {
  const [x, y] = point;
  let inside = false;
  for (const ring of rings) {
    if (!ring || ring.length < 3) continue;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/** Local equirectangular scale factors at a latitude: metres per degree. */
function localScale(lat) {
  return [
    (Math.PI / 180) * EARTH_RADIUS * Math.cos(toRad(lat)),
    (Math.PI / 180) * EARTH_RADIUS,
  ];
}

/**
 * Area of a polygon in square kilometres.
 *
 * Shoelace in a local equirectangular frame at the outer ring's mean latitude.
 * Holes subtract. Good to well under a percent at city scale; not intended for
 * continental polygons.
 */
export function polygonArea(rings) {
  if (!rings?.length) return 0;
  const outer = rings[0];
  if (!outer || outer.length < 3) return 0;
  const lat0 = outer.reduce((s, p) => s + p[1], 0) / outer.length;
  const [kx, ky] = localScale(lat0);

  const ringArea = (ring) => {
    let sum = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      sum += (ring[j][0] * kx) * (ring[i][1] * ky) - (ring[i][0] * kx) * (ring[j][1] * ky);
    }
    return Math.abs(sum) / 2;
  };

  let area = ringArea(outer);
  for (let i = 1; i < rings.length; i++) {
    if (rings[i]?.length >= 3) area -= ringArea(rings[i]);
  }
  return Math.max(0, area) / 1e6;
}

/**
 * Area-weighted centroid of a polygon's outer ring, as [lng, lat].
 *
 * Used as the lens centre when a polygon selection does not supply one — every
 * downstream stage needs a point to measure bearing and distance from. Falls
 * back to the vertex mean for degenerate (zero-area) rings.
 */
export function polygonCentroid(rings) {
  const ring = rings?.[0];
  if (!ring?.length) return [0, 0];
  if (ring.length < 3) {
    return [
      ring.reduce((s, p) => s + p[0], 0) / ring.length,
      ring.reduce((s, p) => s + p[1], 0) / ring.length,
    ];
  }

  let twiceArea = 0;
  let x = 0;
  let y = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    twiceArea += cross;
    x += (ring[j][0] + ring[i][0]) * cross;
    y += (ring[j][1] + ring[i][1]) * cross;
  }
  if (Math.abs(twiceArea) < 1e-12) {
    return [
      ring.reduce((s, p) => s + p[0], 0) / ring.length,
      ring.reduce((s, p) => s + p[1], 0) / ring.length,
    ];
  }
  return [x / (3 * twiceArea), y / (3 * twiceArea)];
}

/**
 * The angular extent of a polygon seen from a point, as [fromBearing, toBearing]
 * sweeping clockwise.
 *
 * This is Speckmann & Verbeek's feasible interval in its original form — the arc
 * a region may legitimately occupy on the necklace (docs/findings.md F-1). It is
 * unused by the point-data pipeline, where every member is a single bearing, and
 * exists because it is the primitive the area-based extension turns on.
 *
 * Returns `null` when the centre lies inside the polygon, since then the region
 * spans every direction and no interval constrains it.
 */
export function angularExtent(center, rings) {
  const ring = rings?.[0];
  if (!ring?.length) return null;
  if (pointInPolygon(center, rings)) return null;

  const bearings = ring.map((p) => toRad(bearing(center, p)));
  // Work relative to the first vertex so the sweep is unwrapped rather than
  // split at north, then take the extremes.
  const base = bearings[0];
  let min = 0;
  let max = 0;
  for (const b of bearings) {
    const d = ((((b - base) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return [normaliseBearing(toDeg(base + min)), normaliseBearing(toDeg(base + max))];
}


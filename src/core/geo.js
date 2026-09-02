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

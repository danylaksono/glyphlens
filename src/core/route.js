/**
 * Routes — turning a line somebody already has into a corridor path.
 *
 * A corridor lens is defined by a polyline, and the interesting polylines
 * already exist: a river, a railway, a bus route, a coastline, a planned cycle
 * lane, the boundary of a district. All of them arrive as GeoJSON, so the
 * library's job is to accept the shapes people actually have rather than to
 * demand an array of pairs.
 *
 * Simplification is not cosmetic here. Every member is projected onto every
 * segment of the path to get its chainage and offset, so the selection stage is
 * O(features x vertices): a 4000-vertex river against 5000 places is twenty
 * million projections per drag frame, and the lens stops being interactive
 * long before it stops being correct. Douglas-Peucker to a node budget makes
 * the cost predictable, and at corridor widths of hundreds of metres a tolerance
 * of a few tens of metres is invisible. See docs/findings.md F-29.
 */

const EARTH_RADIUS = 6371008.8;
const toRad = (d) => (d * Math.PI) / 180;

/**
 * Local equirectangular metres, good enough for simplification: the tolerance
 * is a threshold on a distance, not a measurement to report.
 */
function projector(path) {
  const lat0 = path.reduce((s, p) => s + p[1], 0) / path.length;
  const kx = (Math.PI / 180) * EARTH_RADIUS * Math.cos(toRad(lat0));
  const ky = (Math.PI / 180) * EARTH_RADIUS;
  return ([lng, lat]) => [lng * kx, lat * ky];
}

/** Perpendicular distance from `p` to the segment `a`-`b`, in projected units. */
function segmentDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const u = Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + dx * u), p[1] - (a[1] + dy * u));
}

/**
 * Douglas-Peucker, iterative so a long route cannot blow the stack.
 *
 * @param {Array<[number, number]>} path  [lng, lat] vertices
 * @param {number} tolerance              metres; vertices closer than this to
 *                                        the line they sit on are dropped
 */
export function simplifyPath(path, tolerance = 25) {
  if (!path || path.length <= 2 || !(tolerance > 0)) return path ?? [];
  const xy = projector(path);
  const pts = path.map(xy);
  const keep = new Uint8Array(path.length);
  keep[0] = 1;
  keep[path.length - 1] = 1;

  const stack = [[0, path.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    let worst = 0;
    let index = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = segmentDistance(pts[i], pts[lo], pts[hi]);
      if (d > worst) {
        worst = d;
        index = i;
      }
    }
    if (index >= 0 && worst > tolerance) {
      keep[index] = 1;
      stack.push([lo, index], [index, hi]);
    }
  }

  return path.filter((_, i) => keep[i]);
}

/**
 * Simplify until the path fits a node budget.
 *
 * The budget is the thing a caller can reason about — "keep it interactive" —
 * whereas a tolerance in metres depends on how long the route is and how
 * wiggly. Doubling from a fine tolerance converges in a handful of passes and
 * never over-simplifies a route that was already short.
 */
export function fitNodeBudget(path, maxNodes = 200, { start = 5 } = {}) {
  if (!path || path.length <= maxNodes) return path ?? [];
  let tolerance = start;
  let out = simplifyPath(path, tolerance);
  while (out.length > maxNodes && tolerance < 1e6) {
    tolerance *= 2;
    out = simplifyPath(path, tolerance);
  }
  return out;
}

/** Every LineString-like coordinate array inside a GeoJSON value. */
function collectLines(node, out = []) {
  if (!node || typeof node !== 'object') return out;

  if (Array.isArray(node.features)) {
    for (const f of node.features) collectLines(f, out);
    return out;
  }
  if (node.type === 'Feature') return collectLines(node.geometry, out);
  if (node.type === 'GeometryCollection') {
    for (const g of node.geometries ?? []) collectLines(g, out);
    return out;
  }

  const c = node.coordinates;
  if (!Array.isArray(c)) return out;
  switch (node.type) {
    case 'LineString':
      out.push(c);
      break;
    case 'MultiLineString':
      for (const part of c) out.push(part);
      break;
    // A polygon's rings are perfectly good routes: a corridor along an admin
    // boundary or a ring road is exactly the "linear feature" case, and asking
    // the user to convert it first would be pedantry.
    case 'Polygon':
      for (const ring of c) out.push(ring);
      break;
    case 'MultiPolygon':
      for (const poly of c) for (const ring of poly) out.push(ring);
      break;
    default:
      break;
  }
  return out;
}

const planarLength = (line) => {
  const xy = projector(line);
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    const a = xy(line[i - 1]);
    const b = xy(line[i]);
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
};

/**
 * A corridor path from whatever GeoJSON the user has.
 *
 * Accepts a FeatureCollection, Feature, geometry, or a bare coordinate array.
 * Multi-part geometries are common in real route data — a river split at every
 * confluence, a bus route as one feature per direction — and joining the parts
 * would invent segments that do not exist, so the **longest** part is taken and
 * the rest reported rather than silently merged.
 *
 * @returns {{ path: Array<[number, number]>, parts: number, dropped: number,
 *             nodes: number, sourceNodes: number }}
 */
export function pathFromGeoJSON(input, { maxNodes = 200 } = {}) {
  const doc = typeof input === 'string' ? JSON.parse(input) : input;
  const lines = Array.isArray(doc) && Array.isArray(doc[0])
    ? [doc]
    : collectLines(doc);

  const usable = lines
    .map((line) => line.filter(
      (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]),
    ))
    .filter((line) => line.length >= 2)
    .map((line) => line.map(([lng, lat]) => [lng, lat]));

  if (usable.length === 0) {
    throw new Error('No LineString, MultiLineString or Polygon ring found in that GeoJSON.');
  }

  usable.sort((a, b) => planarLength(b) - planarLength(a));
  const longest = usable[0];
  const path = fitNodeBudget(longest, maxNodes);

  return {
    path,
    parts: usable.length,
    dropped: usable.length - 1,
    nodes: path.length,
    sourceNodes: longest.length,
  };
}

/** Insert a vertex into a path, returning a new array. */
export function insertNode(path, index, coord) {
  const next = [...path];
  next.splice(Math.min(Math.max(index, 0), path.length), 0, coord);
  return next;
}

/** Remove a vertex, refusing to leave fewer than two. */
export function removeNode(path, index) {
  if (path.length <= 2) return path;
  return path.filter((_, i) => i !== index);
}

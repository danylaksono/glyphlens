/**
 * Delaunay triangulation, and the Voronoi diagram that is its dual.
 *
 * The relaxed lattice shipped without this: Lloyd's assignment step scanned
 * every site for every sample, and the cells were built by clipping half-planes.
 * Both are correct and neither is a triangulation, which is what
 * [F-36](../../docs/findings.md#f-36-the-triangulation-was-the-part-worth-having)
 * is about. What the triangulation adds is not accuracy but **structure**:
 *
 * - the **neighbour graph** — which cells touch which, in O(1) per site, which
 *   is a reading in its own right and turns the nearest-site search from a
 *   scan into a walk;
 * - the **convex hull**, free, which is what lets a field relax into the shape
 *   its own data occupies with nothing else supplied;
 * - the **dual**, so a Voronoi cell is assembled from circumcentres rather
 *   than carved out of a polygon.
 *
 * Bowyer–Watson, because it is the one that reads like its own definition: a
 * point is inserted by deleting every triangle whose circumcircle contains it
 * and retriangulating the hole. That property — *no point inside any
 * circumcircle* — is the whole of Delaunay, and the algorithm is it stated
 * imperatively.
 *
 * Coordinates are plain planar `[x, y]`. Geography is the caller's business:
 * `lattice.js` projects to local metres first, which is the same frame the
 * lattice and the relaxation already work in.
 */

/** A triangle's circumcentre, or `null` if its points are collinear. */
export function circumcentre([ax, ay], [bx, by], [cx, cy]) {
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  return [
    (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d,
    (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d,
  ];
}

/**
 * Is `p` strictly inside the circumcircle of `a`, `b`, `c`?
 *
 * The determinant form rather than "compute the centre and compare radii",
 * because the centre is undefined for collinear points and this is not — it
 * simply returns false, which is the answer that keeps the insertion loop
 * going. `orient` normalises the winding so the sign means the same thing
 * whichever way the triangle was built.
 */
export function inCircumcircle(p, a, b, c) {
  const orient = (ax, ay, bx, by, cx, cy) =>
    (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const sign = orient(a[0], a[1], b[0], b[1], c[0], c[1]);
  if (Math.abs(sign) < 1e-12) return false;

  const ax = a[0] - p[0];
  const ay = a[1] - p[1];
  const bx = b[0] - p[0];
  const by = b[1] - p[1];
  const cx = c[0] - p[0];
  const cy = c[1] - p[1];

  const det =
    (ax * ax + ay * ay) * (bx * cy - by * cx)
    - (bx * bx + by * by) * (ax * cy - ay * cx)
    + (cx * cx + cy * cy) * (ax * by - ay * bx);

  return sign > 0 ? det > 1e-12 : det < -1e-12;
}

const edgeKey = (i, j) => (i < j ? `${i},${j}` : `${j},${i}`);

/**
 * Triangulate a set of planar points.
 *
 * @param {Array<[number, number]>} points
 * @returns {{
 *   points: Array<[number, number]>,
 *   triangles: Array<[number, number, number]>,  vertex indices, counter-clockwise
 *   centres: Array<[number, number]|null>,       circumcentre per triangle
 *   neighbours: number[][],                      site index -> adjacent site indices
 *   edges: Array<[number, number]>,              unique Delaunay edges
 *   hull: number[],                              convex hull, counter-clockwise
 * }}
 */
export function delaunay(points) {
  const n = points?.length ?? 0;
  const empty = {
    points: points ?? [],
    triangles: [],
    centres: [],
    neighbours: Array.from({ length: n }, () => []),
    edges: [],
    hull: n === 0 ? [] : points.map((_, i) => i),
  };
  if (n < 3) return empty;

  // A super-triangle big enough to contain every point, so no insertion ever
  // has to special-case the boundary. Its own vertices are removed at the end,
  // and any triangle still touching one is by definition outside the hull.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const dx = maxX - minX || 1;
  const dy = maxY - minY || 1;
  const span = Math.max(dx, dy) * 1000;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  const work = [
    ...points,
    [midX - span, midY - span],
    [midX + span, midY - span],
    [midX, midY + span],
  ];
  let tris = [[n, n + 1, n + 2]];

  for (let i = 0; i < n; i++) {
    const p = work[i];
    const bad = [];
    const kept = [];
    for (const t of tris) {
      if (inCircumcircle(p, work[t[0]], work[t[1]], work[t[2]])) bad.push(t);
      else kept.push(t);
    }
    if (bad.length === 0) {
      // Degenerate input — duplicate or exactly collinear points. Skipping is
      // the honest response: there is no triangle to insert it into, and
      // inventing one would make the result not a triangulation.
      continue;
    }

    // The cavity's boundary is every edge belonging to exactly one bad
    // triangle; shared edges are interior and disappear with them.
    const seen = new Map();
    for (const t of bad) {
      for (const [a, b] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
        const k = edgeKey(a, b);
        if (seen.has(k)) seen.delete(k);
        else seen.set(k, [a, b]);
      }
    }
    for (const [a, b] of seen.values()) kept.push([a, b, i]);
    tris = kept;
  }

  // Drop everything still attached to the super-triangle, then normalise the
  // winding so a caller can rely on it.
  const triangles = [];
  const centres = [];
  for (const t of tris) {
    if (t[0] >= n || t[1] >= n || t[2] >= n) continue;
    const [a, b, c] = t;
    const area =
      (points[b][0] - points[a][0]) * (points[c][1] - points[a][1])
      - (points[b][1] - points[a][1]) * (points[c][0] - points[a][0]);
    const tri = area < 0 ? [a, c, b] : [a, b, c];
    triangles.push(tri);
    centres.push(circumcentre(points[tri[0]], points[tri[1]], points[tri[2]]));
  }

  const adjacency = Array.from({ length: n }, () => new Set());
  const edgeSet = new Map();
  for (const [a, b, c] of triangles) {
    for (const [i, j] of [[a, b], [b, c], [c, a]]) {
      adjacency[i].add(j);
      adjacency[j].add(i);
      edgeSet.set(edgeKey(i, j), i < j ? [i, j] : [j, i]);
    }
  }

  return {
    points,
    triangles,
    centres,
    neighbours: adjacency.map((s) => [...s]),
    edges: [...edgeSet.values()],
    hull: convexHull(points),
  };
}

/**
 * Convex hull by monotone chain, counter-clockwise.
 *
 * The hull is a Delaunay by-product in principle — the boundary edges of the
 * triangulation are the hull — but computing it directly is both cheaper and
 * usable before any triangulation exists, which is what a field needs when it
 * has data and no boundary at all.
 */
export function convexHull(points) {
  const n = points?.length ?? 0;
  if (n < 3) return points ? points.map((_, i) => i) : [];

  const order = points.map((_, i) => i).sort((i, j) =>
    (points[i][0] - points[j][0]) || (points[i][1] - points[j][1]));
  const cross = (o, a, b) =>
    (points[a][0] - points[o][0]) * (points[b][1] - points[o][1])
    - (points[a][1] - points[o][1]) * (points[b][0] - points[o][0]);

  const half = (seq) => {
    const out = [];
    for (const i of seq) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], i) <= 0) {
        out.pop();
      }
      out.push(i);
    }
    out.pop();
    return out;
  };

  const hull = [...half(order), ...half([...order].reverse())];
  return hull.length >= 3 ? hull : order;
}

/**
 * Nearest site to a point, by walking the Delaunay's neighbour graph.
 *
 * Start somewhere and keep stepping to whichever neighbour is closer. Because
 * the graph is a triangulation of the same points, that walk cannot get stuck
 * anywhere but the answer — which turns Lloyd's inner loop from "compare
 * against every site" into "compare against the six or so that touch you".
 *
 * `from` is a hint: passing the previous answer makes consecutive queries over
 * a scanline almost free, which is exactly how the sample grid is walked.
 */
export function nearestSite({ points, neighbours }, target, from = 0) {
  const n = points.length;
  if (n === 0) return -1;
  const d2 = (i) => (points[i][0] - target[0]) ** 2 + (points[i][1] - target[1]) ** 2;

  let best = Math.min(Math.max(from | 0, 0), n - 1);
  let bestD = d2(best);
  // Bounded so a malformed graph cannot spin: a walk over a triangulation
  // converges in far fewer steps than there are sites.
  for (let step = 0; step < n; step++) {
    let moved = false;
    for (const j of neighbours[best]) {
      const d = d2(j);
      if (d < bestD) {
        bestD = d;
        best = j;
        moved = true;
      }
    }
    if (!moved) return best;
  }
  return best;
}

/**
 * Voronoi cells as the dual of the triangulation, clipped to a boundary.
 *
 * The theorem that makes the triangulation worth having: a Voronoi cell is
 * bounded **only by the bisectors against its Delaunay neighbours**. Every
 * other site in the set is provably irrelevant to it. So a cell is the
 * boundary polygon clipped by six-ish half-planes rather than by n−1 of them,
 * which is the same answer for O(n) work instead of O(n²).
 *
 * Clipping the boundary *by* the cell — rather than the cell by the boundary —
 * is not a stylistic choice. Sutherland–Hodgman is only correct when the clip
 * region is convex; a half-plane always is, and a real study area very often
 * is not. Doing it the other way round silently eats the concavities: the
 * first attempt here lost 28% of the polygon that way
 * ([F-36](../../docs/findings.md#f-36-the-triangulation-was-the-part-worth-having)).
 *
 * @param {object} triangulation  from `delaunay`
 * @param {Array<Array<[number, number]>>} boundary  rings; the first is the outer
 * @returns {Array<Array<[number, number]>>} one ring per site
 */
export function voronoiFromDelaunay(triangulation, boundary) {
  const { points, neighbours } = triangulation;
  const outer = boundary?.[0];
  if (!points.length || !outer?.length) return points.map(() => []);

  return points.map((site, i) => {
    // Fewer than three points never gets triangulated, so there are no
    // neighbours to read; fall back to every rival, which is the same set.
    const rivals = neighbours[i]?.length
      ? neighbours[i]
      : points.map((_, j) => j).filter((j) => j !== i);

    let cell = outer;
    for (const j of rivals) {
      const other = points[j];
      const mx = (site[0] + other[0]) / 2;
      const my = (site[1] + other[1]) / 2;
      const dx = other[0] - site[0];
      const dy = other[1] - site[1];
      cell = clipHalfPlane(cell, (p) => -((p[0] - mx) * dx + (p[1] - my) * dy));
      if (cell.length === 0) break;
    }
    return cell;
  });
}

function clipHalfPlane(polygon, keep) {
  if (polygon.length === 0) return polygon;
  const out = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[(i + polygon.length - 1) % polygon.length];
    const b = polygon[i];
    const da = keep(a);
    const db = keep(b);
    if (db >= 0) {
      if (da < 0) out.push(mix(a, b, da, db));
      out.push(b);
    } else if (da >= 0) {
      out.push(mix(a, b, da, db));
    }
  }
  return out;
}

const mix = (a, b, da, db) => {
  const t = da / (da - db);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
};

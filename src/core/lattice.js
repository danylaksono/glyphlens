/**
 * Lattices — where a field puts its centres.
 *
 * `hexLattice` was the only answer for as long as there was only one field.
 * There are exactly three regular tilings of the plane, though, and each is a
 * different point in the design space with a different and *quantifiable*
 * cost, so the lattice is an axis rather than a constant
 * (docs/findings.md F-34).
 *
 * The naming here follows the **cell**, not the point arrangement, because the
 * cell is what a reader sees. They are duals, and confusing them is easy:
 *
 * | `kind`     | Cell      | Points are…            | Neighbours |
 * |------------|-----------|------------------------|------------|
 * | `hex`      | hexagon   | a triangular lattice   | 6 |
 * | `square`   | square    | a square lattice       | 4 |
 * | `triangle` | triangle  | a honeycomb — two interleaved triangular lattices | 3 |
 *
 * `spacing` always means the same thing: the distance to a nearest neighbour.
 * That makes one fact true of all three, which is what lets the rest of the
 * library stay ignorant of which is in use — **the disc that just touches its
 * neighbours is exactly inscribed in the cell**, at radius `spacing / 2`.
 *
 * What differs is how much of the cell that disc covers, and the spread is
 * large: 91% for a hexagon, 79% for a square, 60% for a triangle. The lattice
 * therefore sets a ceiling on how much ground a field can reach without
 * counting anything twice, and that is the reason to choose one.
 */

import { EARTH_RADIUS, toRad, pointInPolygon, polygonCentroid } from './geo.js';

/** Metres per degree of longitude and latitude at a given latitude. */
export function scaleAt(lat) {
  return [
    (Math.PI / 180) * EARTH_RADIUS * Math.cos(toRad(lat)),
    (Math.PI / 180) * EARTH_RADIUS,
  ];
}

/**
 * The three regular tilings.
 *
 * `cellArea` is the ground each centre owns, `circumradius` the distance from a
 * centre to a cell vertex, and `rotate` the canvas angle of the first vertex.
 * `density` is how many centres a unit area holds, which is what inverts a
 * count into a spacing.
 */
export const LATTICES = {
  hex: {
    label: 'Hexagonal',
    sides: 6,
    rotate: 30,
    cellArea: (s) => (Math.sqrt(3) / 2) * s * s,
    circumradius: (s) => s / Math.sqrt(3),
  },
  square: {
    label: 'Square',
    sides: 4,
    rotate: 45,
    cellArea: (s) => s * s,
    circumradius: (s) => s / Math.SQRT2,
  },
  triangle: {
    label: 'Triangular',
    sides: 3,
    // Alternates between the honeycomb's two sublattices: a triangle has no
    // half-turn symmetry, so neighbouring cells point opposite ways. Set per
    // centre by `lattice`, not read from here.
    rotate: 90,
    cellArea: (s) => ((3 * Math.sqrt(3)) / 4) * s * s,
    circumradius: (s) => s,
  },
};

const kindOf = (kind) => LATTICES[kind] ?? LATTICES.hex;

/** Radius at which neighbouring discs touch: half a spacing, for every kind. */
export const touchingRadius = (spacing) => spacing / 2;

/**
 * How much of the lattice's ground actually falls inside a lens.
 *
 * Below 1 the discs leave gaps and anything standing in them is counted
 * nowhere; above 1 they overlap and some members are counted twice. Neither is
 * a bug, and both are invisible unless something says so, which is why this
 * rides on the field's stats (docs/findings.md F-33).
 */
export function latticeCoverage(radius, spacing, kind = 'hex') {
  if (!(radius > 0) || !(spacing > 0)) return null;
  return (Math.PI * radius * radius) / kindOf(kind).cellArea(spacing);
}

/** Distance from a centre to a vertex of its cell. */
export const cellRadius = (spacing, kind = 'hex') => kindOf(kind).circumradius(spacing);

/**
 * Spacing that yields `count` centres over a circle of `radius`.
 *
 * The continuum control is more legible as "how many" than "how far apart", but
 * spacing is what the lattice actually takes, so this inverts it.
 *
 * The analytic estimate is only an estimate — a lattice clipped to a circle
 * loses the corners it would have filled, and at low counts the loss is lumpy
 * rather than proportional. So the estimate is refined by counting: the count
 * falls monotonically as the spacing grows, which makes it a bisection.
 *
 * Doing it properly rather than with a fudge factor matters for the axis it
 * serves: **comparing two lattices is only fair at the same count**, and a
 * constant tuned on hexagons gave squares a quarter fewer cells.
 */
export function spacingForCount(count, radius, kind = 'hex') {
  if (!(count > 0) || !(radius > 0)) return radius;
  const area = Math.PI * radius * radius;
  const estimate = Math.sqrt(area / (count * kindOf(kind).cellArea(1)));
  const at = (spacing) => lattice({ kind, center: [0, 0], radius, spacing }).centres.length;

  let lo = estimate / 4;
  let hi = estimate * 4;
  let best = estimate;
  let bestError = Math.abs(at(estimate) - count);

  for (let i = 0; i < 24 && bestError > 0; i++) {
    const mid = (lo + hi) / 2;
    const n = at(mid);
    const error = Math.abs(n - count);
    if (error < bestError) {
      bestError = error;
      best = mid;
    }
    if (n > count) lo = mid;
    else hi = mid;
  }
  return best;
}

/**
 * Centres on a regular lattice, covering a radius around a point.
 *
 * @returns {{ centres: Array<[number, number]>, cells: Array<object>, kind, spacing }}
 *   `cells[i]` describes the Voronoi cell of `centres[i]`: how many sides, the
 *   canvas angle of its first vertex, and its circumradius in metres.
 */
export function lattice({ kind = 'hex', center, radius, spacing }) {
  const spec = kindOf(kind);
  if (!(spacing > 0) || !(radius > 0)) {
    return {
      centres: [center],
      cells: [{ sides: spec.sides, rotate: spec.rotate, circumradius: spec.circumradius(spacing || 1) }],
      kind,
      spacing,
    };
  }

  const [kx, ky] = scaleAt(center[1]);
  const centres = [];
  const cells = [];
  const circumradius = spec.circumradius(spacing);
  const push = (x, y, rotate) => {
    if (Math.hypot(x, y) > radius) return;
    centres.push([center[0] + x / kx, center[1] + y / ky]);
    cells.push({ sides: spec.sides, rotate, circumradius });
  };

  if (kind === 'square') {
    const n = Math.ceil(radius / spacing);
    for (let r = -n; r <= n; r++) {
      for (let c = -n; c <= n; c++) push(c * spacing, r * spacing, spec.rotate);
    }
    return { centres, cells, kind, spacing };
  }

  if (kind === 'triangle') {
    // A honeycomb: a triangular lattice of spacing `d`, carrying two points per
    // cell. Each point ends up with three neighbours at `spacing`, and the two
    // sublattices' cells point opposite ways.
    const d = spacing * Math.sqrt(3);
    const rowHeight = d * (Math.sqrt(3) / 2);
    const rows = Math.ceil((radius + spacing) / rowHeight) + 1;
    const cols = Math.ceil((radius + spacing) / d) + 1;
    for (let r = -rows; r <= rows; r++) {
      const y = r * rowHeight;
      const shift = (r & 1) === 0 ? 0 : d / 2;
      for (let c = -cols; c <= cols; c++) {
        const x = c * d + shift;
        push(x, y, 90);
        push(x, y + spacing, 30);
      }
    }
    return { centres, cells, kind, spacing };
  }

  const rowHeight = spacing * (Math.sqrt(3) / 2);
  const rows = Math.ceil(radius / rowHeight);
  const cols = Math.ceil(radius / spacing);
  for (let r = -rows; r <= rows; r++) {
    const y = r * rowHeight;
    // Odd rows shift by half a spacing: that offset is what makes it hexagonal
    // rather than a rectangular grid with a different aspect ratio.
    const shift = (r & 1) === 0 ? 0 : spacing / 2;
    for (let c = -cols; c <= cols; c++) push(c * spacing + shift, y, spec.rotate);
  }
  return { centres, cells, kind, spacing };
}

/**
 * The original hexagonal lattice, unchanged.
 *
 * Kept as its own export because it is the shape most callers want and it
 * returns bare coordinates rather than the fuller description `lattice` gives.
 */
export function hexLattice({ center, radius, spacing }) {
  return lattice({ kind: 'hex', center, radius, spacing }).centres;
}

// ---------------------------------------------------------------- relaxation

/** Deterministic PRNG, because a lattice that moves between runs is not one. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A local metric frame for a polygon: metres east and north of its centroid. */
function frameFor(rings) {
  const origin = polygonCentroid(rings);
  const [kx, ky] = scaleAt(origin[1]);
  return {
    origin,
    to: ([lng, lat]) => [(lng - origin[0]) * kx, (lat - origin[1]) * ky],
    from: ([x, y]) => [origin[0] + x / kx, origin[1] + y / ky],
  };
}

/**
 * Evenly spaced centres inside an arbitrary polygon, by Lloyd's algorithm.
 *
 * A regular lattice assumes the study area is the whole plane. Real ones are
 * shapes — a city boundary, a catchment, a park — and clipping a lattice to one
 * leaves cells sliced arbitrarily at the edge, each holding a different and
 * meaningless amount of ground. Relaxation answers the same question the
 * lattice does (*where do the centres go?*) for a region that has a boundary:
 * scatter points, then repeatedly move each to the centroid of the ground
 * nearest it, and they settle into a centroidal Voronoi tessellation — evenly
 * spaced, and filling the polygon exactly.
 *
 * **Proof of concept.** The assignment step is done by sampling rather than by
 * building a Delaunay triangulation, which is what a real implementation would
 * do: it is a few dozen lines instead of a few thousand, it needs no
 * dependency, and it converges to the same place. The cells themselves are
 * exact — see `voronoiCells`. See docs/findings.md F-35 for what that costs.
 *
 * @param {object} options
 * @param {Array<Array<[number, number]>>} options.rings  outer ring first, then holes
 * @param {number} options.count        how many centres
 * @param {number} [options.iterations] cap on Lloyd passes
 * @param {number} [options.seed]       the same seed always gives the same lattice
 * @param {number} [options.tolerance]  settled when the largest move falls
 *   below this fraction of the typical spacing — of the thing being solved
 *   for, not of the sampling grid, which is a resolution the method does not
 *   have
 * @returns {{ centres, cells, kind, spacing, iterations, converged }}
 */
export function relaxedLattice({
  rings,
  count = 24,
  // Lloyd converges linearly, so forty-odd passes is ordinary and thirty is
  // not quite enough — it stops early the moment it settles, so the cap only
  // costs anything when it is genuinely needed.
  iterations = 64,
  seed = 1,
  samplesPerCell = 220,
  tolerance = 0.005,
}) {
  const outer = rings?.[0];
  if (!outer || outer.length < 3 || !(count > 0)) {
    return { centres: [], cells: [], kind: 'relaxed', spacing: 0, iterations: 0, converged: true };
  }

  const frame = frameFor(rings);
  const flat = rings.map((ring) => ring.map(frame.to));
  const xs = flat[0].map((p) => p[0]);
  const ys = flat[0].map((p) => p[1]);
  const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const inside = (p) => pointInPolygon(p, flat);

  // A sample grid over the polygon. Its resolution is set by the number of
  // cells, so the cost of relaxing 400 centres is the same as relaxing 20 —
  // and so a cell always has enough samples for its centroid to mean something.
  const width = box[2] - box[0];
  const height = box[3] - box[1];
  const target = count * samplesPerCell;
  const step = Math.max(Math.sqrt((width * height) / Math.max(target, 1)), 1e-6);
  const samples = [];
  for (let y = box[1] + step / 2; y < box[3]; y += step) {
    for (let x = box[0] + step / 2; x < box[2]; x += step) {
      if (inside([x, y])) samples.push([x, y]);
    }
  }
  if (samples.length === 0) {
    return { centres: [], cells: [], kind: 'relaxed', spacing: 0, iterations: 0, converged: true };
  }

  // Seed from the samples themselves rather than from the bounding box, so
  // every starting point is already inside the polygon however concave it is.
  const random = mulberry32(seed);
  const sites = [];
  for (let i = 0; i < count; i++) {
    sites.push([...samples[Math.floor(random() * samples.length)]]);
  }

  // The scale the answer lives at: a relaxed lattice has no single spacing, but
  // it has a typical one, and it is what both the convergence test and any lens
  // radius have to be measured against.
  const area = polygonAreaMetres(flat);
  const spacing = Math.sqrt((2 * area) / (Math.sqrt(3) * count));
  const settled = tolerance * spacing;

  let moved = Infinity;
  let pass = 0;
  const sumX = new Float64Array(count);
  const sumY = new Float64Array(count);
  const hits = new Float64Array(count);

  for (; pass < iterations && moved > settled; pass++) {
    sumX.fill(0);
    sumY.fill(0);
    hits.fill(0);

    for (const [x, y] of samples) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < count; i++) {
        const dx = x - sites[i][0];
        const dy = y - sites[i][1];
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      sumX[best] += x;
      sumY[best] += y;
      hits[best] += 1;
    }

    moved = 0;
    for (let i = 0; i < count; i++) {
      if (hits[i] === 0) {
        // A site that won no ground is inside another's territory. Rather than
        // leaving it stuck there, drop it somewhere it can compete.
        sites[i] = [...samples[Math.floor(random() * samples.length)]];
        moved = Infinity;
        continue;
      }
      let nx = sumX[i] / hits[i];
      let ny = sumY[i] / hits[i];
      // A cell that wraps around a concavity has a centroid outside the shape
      // it belongs to. Every sample is inside by construction, so the nearest
      // one is the closest legal place to stand — which keeps the guarantee
      // the caller actually cares about: a centre is always in the polygon.
      if (!inside([nx, ny])) {
        let bestD = Infinity;
        for (const [sx, sy] of samples) {
          const d = (sx - nx) ** 2 + (sy - ny) ** 2;
          if (d < bestD) {
            bestD = d;
            nx = sx;
            ny = sy;
          }
        }
      }
      moved = Math.max(moved, Math.hypot(nx - sites[i][0], ny - sites[i][1]));
      sites[i] = [nx, ny];
    }
  }

  return {
    centres: sites.map(frame.from),
    // No regular shape: a relaxed cell is whatever polygon `voronoiCells`
    // computes, and `ringIndex` is how a renderer finds its own.
    cells: sites.map((_, i) => ({
      sides: 0,
      rotate: 0,
      circumradius: spacing / Math.sqrt(3),
      ringIndex: i,
    })),
    kind: 'relaxed',
    spacing,
    iterations: pass,
    converged: moved <= settled,
  };
}

/** Signed-area magnitude of a projected ring set, in square metres. */
function polygonAreaMetres(flat) {
  const ringArea = (ring) => {
    let sum = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    }
    return Math.abs(sum) / 2;
  };
  let area = ringArea(flat[0]);
  for (let i = 1; i < flat.length; i++) area -= ringArea(flat[i]);
  return Math.max(0, area);
}

/**
 * Clip a convex-or-concave polygon by a half-plane, Sutherland–Hodgman.
 *
 * `keep(p)` is positive on the side to keep. Correct for a convex clip region
 * built up one half-plane at a time, which is exactly how a Voronoi cell is
 * defined; the boundary polygon is intersected first and may be concave, which
 * this handles for the boundary's own edges because the *clip* stays convex.
 */
function clipHalfPlane(polygon, keep) {
  if (polygon.length === 0) return polygon;
  const out = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[(i + polygon.length - 1) % polygon.length];
    const b = polygon[i];
    const da = keep(a);
    const db = keep(b);
    if (db >= 0) {
      if (da < 0) out.push(intersect(a, b, da, db));
      out.push(b);
    } else if (da >= 0) {
      out.push(intersect(a, b, da, db));
    }
  }
  return out;
}

const intersect = (a, b, da, db) => {
  const t = da / (da - db);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
};

/**
 * The exact Voronoi cell of each site, clipped to a polygon.
 *
 * Built by intersecting half-planes rather than by triangulating: a cell is the
 * set of points nearer this site than any other, which is literally one
 * half-plane per rival, so the definition is the algorithm. It is O(n²) in the
 * sites, which is the price of not carrying a Delaunay implementation, and at
 * the counts a field of lenses uses it is not a price worth optimising away.
 *
 * Unlike a lattice's cells, these **tile the polygon exactly** — that is what
 * relaxation buys, and the reason the boundary case needs it.
 *
 * @returns {Array<Array<[number, number]>>} one ring of [lng, lat] per site
 */
export function voronoiCells(centres, rings) {
  const outer = rings?.[0];
  if (!outer || outer.length < 3 || !centres?.length) return [];

  const frame = frameFor(rings);
  const boundary = outer.map(frame.to);
  const sites = centres.map(frame.to);

  return sites.map((site, i) => {
    let cell = boundary;
    for (let j = 0; j < sites.length && cell.length > 0; j++) {
      if (j === i) continue;
      const other = sites[j];
      const mx = (site[0] + other[0]) / 2;
      const my = (site[1] + other[1]) / 2;
      const dx = other[0] - site[0];
      const dy = other[1] - site[1];
      // Positive on the site's own side of the perpendicular bisector.
      cell = clipHalfPlane(cell, (p) => -((p[0] - mx) * dx + (p[1] - my) * dy));
    }
    return cell.map(frame.from);
  });
}

/** Nearest-neighbour distance for every site, in metres. */
export function nearestSpacing(centres) {
  if (!centres?.length) return [];
  const [kx, ky] = scaleAt(centres[0][1]);
  const pts = centres.map(([lng, lat]) => [lng * kx, lat * ky]);
  return pts.map((p, i) => {
    let best = Infinity;
    for (let j = 0; j < pts.length; j++) {
      if (j === i) continue;
      best = Math.min(best, Math.hypot(p[0] - pts[j][0], p[1] - pts[j][1]));
    }
    return Number.isFinite(best) ? best : 0;
  });
}

/**
 * Curves — the anchor that marks are placed on.
 *
 * The placement engine never sees a circle. It sees a `Curve`, parameterised by
 * `t` in [0, 1), and works entirely in that parameter space. That is what lets
 * the same necklace algorithm run on a lens ring, an H3 cell boundary, a
 * coastline or a route corridor without special-casing.
 *
 * See docs/findings.md F-2 (property 3) for why this matters.
 *
 * A Curve is:
 *   { closed, length, pointAt(t) -> [x, y], tangentAt(t) -> [dx, dy] (unit) }
 *
 * Coordinates are screen-space pixels. Lengths are pixels.
 */

const TAU = Math.PI * 2;

/** Wrap `t` into [0, 1). */
export const wrap01 = (t) => ((t % 1) + 1) % 1;

/**
 * Smallest signed difference between two cyclic parameters, in [-0.5, 0.5).
 *
 * Half-open at the top, which is what decides the seam: a point exactly half a
 * turn from an open curve's anchor belongs to its start, not its end.
 */
export function cyclicDelta(a, b) {
  return ((((b - a) % 1) + 1.5) % 1) - 0.5;
}

/**
 * A circle centred at (cx, cy). `t = 0` is due north and `t` increases
 * clockwise, so `t` maps directly onto a compass bearing.
 */
export function circleCurve(cx, cy, radius) {
  const length = TAU * radius;
  return {
    kind: 'circle',
    closed: true,
    length,
    cx,
    cy,
    radius,
    /** Canvas angle in radians for parameter `t`. */
    angleAt(t) {
      return wrap01(t) * TAU - Math.PI / 2;
    },
    pointAt(t) {
      const a = this.angleAt(t);
      return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
    },
    tangentAt(t) {
      const a = this.angleAt(t);
      return [-Math.sin(a), Math.cos(a)];
    },
    /** Outward unit normal — the direction a bar grows. */
    normalAt(t) {
      const a = this.angleAt(t);
      return [Math.cos(a), Math.sin(a)];
    },
  };
}

/**
 * A polyline through `points`, open or closed. Used for corridor and
 * linear-feature lenses, and for `placement: 'strip'`.
 */
export function polylineCurve(points, { closed = false } = {}) {
  const pts = closed ? [...points, points[0]] : points;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
  }
  const length = cum[cum.length - 1];

  // Locate the segment containing arc-length `s`, returning [index, local t].
  const locate = (s) => {
    if (length === 0) return [0, 0];
    const clamped = closed ? wrap01(s / length) * length : Math.min(Math.max(s, 0), length);
    let lo = 0;
    let hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= clamped) lo = mid;
      else hi = mid;
    }
    const segLen = cum[lo + 1] - cum[lo];
    return [lo, segLen === 0 ? 0 : (clamped - cum[lo]) / segLen];
  };

  return {
    kind: 'polyline',
    closed,
    length,
    points: pts,
    pointAt(t) {
      const [i, u] = locate((closed ? wrap01(t) : Math.min(Math.max(t, 0), 1)) * length);
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1] ?? pts[i];
      return [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u];
    },
    tangentAt(t) {
      const [i] = locate((closed ? wrap01(t) : Math.min(Math.max(t, 0), 1)) * length);
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1] ?? pts[i];
      const d = Math.hypot(x1 - x0, y1 - y0) || 1;
      return [(x1 - x0) / d, (y1 - y0) / d];
    },
    /** Left-hand normal, which is outward for a clockwise-wound closed curve. */
    normalAt(t) {
      const [tx, ty] = this.tangentAt(t);
      return [ty, -tx];
    },
  };
}

/**
 * A circular arc of *fixed arc length*, from a closed ring to a straight line.
 *
 * `unroll = 0` is the ring; `unroll = 1` is a straight horizontal baseline of
 * the same length; anything between is the arc you get by bending that line
 * back up. Curvature is `kappa = 1 - unroll`, so the arc's own radius is
 * `radius / kappa` and it always subtends `2*pi*kappa`.
 *
 * Holding *length* constant rather than radius is the whole trick. Placement
 * works in the cyclic parameter `t` and reserves half-widths as a fraction of
 * the curve, so if the curve keeps its length the solved layout stays valid at
 * every value of `unroll` — the unroll is a change of anchor, not a re-solve.
 * Nothing upstream of the renderer sees it. See docs/findings.md F-27.
 *
 * `at` is the parameter held fixed: that point does not move as the curve
 * opens, and the seam therefore falls at `at + 0.5`. The default holds north
 * at the top of the ring, so an unrolled lens reads as a bearing profile
 * centred on north, running west (left) through north to east (right), with
 * marks growing upwards from the baseline.
 *
 * The arc also rotates about its anchor as it opens, by exactly enough to land
 * flat. Without that, the baseline's direction would be whatever the ring's
 * tangent happened to be at the anchor — vertical for an anchor due east — and
 * moving the seam would tip the chart over. Since the rotation is proportional
 * to `unroll` it is zero for the closed ring, so the family still starts at
 * `circleCurve` exactly, and every anchor ends at the same horizontal baseline
 * with marks growing up. That is what makes `at: 'auto'` safe to use.
 *
 * Points are computed from the anchor by chord and turn rather than from the
 * arc's centre, which is what keeps it well-conditioned as the centre runs off
 * to infinity: at `unroll = 1` the arc centre is not a finite point at all.
 */
export function arcCurve(cx, cy, radius, { unroll = 0, at = 0 } = {}) {
  const u = Math.min(1, Math.max(0, unroll));
  if (u <= 0) return circleCurve(cx, cy, radius);

  const kappa = 1 - u;
  const length = TAU * radius;
  const anchor = wrap01(at);
  // Canvas angle of the anchor on the original ring, and the anchor point
  // itself — the one point shared by every curve in the family.
  const a0 = anchor * TAU - Math.PI / 2;
  const ax = cx + radius * Math.cos(a0);
  const ay = cy + radius * Math.sin(a0);
  const R = kappa > 0 ? radius / kappa : Infinity;
  // Spin the arc about its anchor as it opens, so that it lands horizontal
  // whichever parameter is held fixed. Zero at `unroll = 0` by construction.
  const base = a0 - u * (a0 + Math.PI / 2);
  const angleAt = (t) => base + cyclicDelta(anchor, t) * TAU * kappa;

  return {
    kind: 'arc',
    closed: false,
    length,
    unroll: u,
    curvature: kappa,
    anchor,
    /** Centre of the arc's own circle — not the lens centre, and infinite at `unroll = 1`. */
    cx: ax - R * Math.cos(base),
    cy: ay - R * Math.sin(base),
    radius: R,
    angleAt,
    pointAt(t) {
      const d = cyclicDelta(anchor, t);
      const half = d * Math.PI * kappa; // half the turn from the anchor
      // Chord from the anchor: 2R sin(half), written so that R never appears.
      const chord = d * length * sinc(half);
      const dir = base + half;
      return [ax - chord * Math.sin(dir), ay + chord * Math.cos(dir)];
    },
    tangentAt(t) {
      const a = angleAt(t);
      return [-Math.sin(a), Math.cos(a)];
    },
    normalAt(t) {
      const a = angleAt(t);
      return [Math.cos(a), Math.sin(a)];
    },
  };
}

const sinc = (x) => (Math.abs(x) < 1e-8 ? 1 : Math.sin(x) / x);

/**
 * The open-curve counterpart of `arcCurve`: straighten a polyline towards a
 * horizontal line of the same length.
 *
 * `unroll = 0` leaves the route where it is on the map; `unroll = 1` lays it
 * out flat, each vertex at its own chainage. The result is a *linear
 * cartogram*: chainage and offset are preserved exactly and position is not,
 * which is the trade a route profile makes and the reason the true path is
 * worth drawing behind it (docs/findings.md F-28).
 *
 * `at` is the fraction of length held fixed, so the route opens about its own
 * midpoint by default rather than sliding off one end.
 */
export function straightenPath(points, unroll, { at = 0.5 } = {}) {
  const u = Math.min(1, Math.max(0, unroll));
  if (u <= 0 || !points || points.length < 2) return points;

  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  const total = cum[cum.length - 1];
  if (!(total > 0)) return points;

  const [ax, ay] = polylineCurve(points).pointAt(at);
  const s0 = Math.min(Math.max(at, 0), 1) * total;

  return points.map((p, i) => [
    p[0] + (ax + (cum[i] - s0) - p[0]) * u,
    p[1] + (ay - p[1]) * u,
  ]);
}

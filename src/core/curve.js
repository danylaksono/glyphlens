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

/** Smallest signed difference between two cyclic parameters, in (-0.5, 0.5]. */
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

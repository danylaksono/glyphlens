/**
 * Necklace placement.
 *
 * Places symbols on a curve, as close as possible to a preferred position,
 * without overlapping, optionally confined to a feasible interval.
 *
 * After Speckmann & Verbeek, "Necklace Maps" (IEEE TVCG 16(6), 2010) and
 * "Algorithms for Necklace Maps" (IJCGA 25(1), 2015). The reference
 * implementation is the C++ one in CartoCrow; this is, as far as we can find,
 * the first JavaScript implementation. See docs/references.md.
 *
 * ## What it solves
 *
 * Given items with preferred positions `p_i` on a cyclic parameter in [0, 1)
 * and half-widths `w_i` (also in parameter units), find positions `x_i`
 * minimising `sum(v_i * (x_i - p_i)^2)` subject to non-overlap.
 *
 * ## How
 *
 * For a *fixed* cyclic order the problem is convex. Substituting
 * `y_i = x_i - c_i`, where `c_i` is the cumulative minimum spacing up to `i`,
 * turns the non-overlap constraints into a monotonicity constraint, so the
 * optimum is a weighted isotonic regression (exact, O(n)). The wrap-around
 * constraint becomes a cap on total span.
 *
 * The cyclic order that matters is the order by preferred position — any
 * crossing solution can be uncrossed without increasing cost — so we only need
 * to choose where to cut the circle. We try all n cuts and keep the cheapest:
 * O(n^2), which is nothing for the bin counts a lens uses (typically <= 72).
 *
 * ## Feasible intervals
 *
 * `interval: [lo, hi]` confines an item to an arc. For point data the interval
 * is the whole circle and only `position` matters; for an area it is the
 * angular projection of the geometry seen from the lens centre, which is
 * Speckmann & Verbeek's original primitive. Interval handling is by projection
 * onto the box between isotonic passes — approximate, unlike the unconstrained
 * case. Recorded in docs/findings.md F-1.
 */

import { isotonic, isotonicBoundedSpan } from './isotonic.js';
import { wrap01, cyclicDelta } from './curve.js';

/**
 * @typedef {object} NecklaceItem
 * @property {string|number} id
 * @property {number} position   preferred position, cyclic parameter in [0,1)
 * @property {number} halfWidth  half the space the symbol needs, in parameter units
 * @property {number} [weight]   resistance to being moved (default 1)
 * @property {[number, number]} [interval] feasible arc [lo, hi], cyclic
 */

/**
 * @param {NecklaceItem[]} items
 * @param {object} [options]
 * @param {boolean} [options.cyclic=true]
 * @param {number} [options.intervalPasses=8] projection passes for feasible intervals
 * @returns {{
 *   placements: Array<{ id, position, preferred, displacement, halfWidth, clamped }>,
 *   fill: number,        fraction of the curve consumed by symbols
 *   overflow: boolean,   true if the symbols cannot fit at all
 *   cost: number
 * }}
 */
export function placeNecklace(items, options = {}) {
  const { cyclic = true, intervalPasses = 8 } = options;
  const n = items.length;
  if (n === 0) return { placements: [], fill: 0, overflow: false, cost: 0 };

  const totalWidth = items.reduce((s, it) => s + 2 * it.halfWidth, 0);
  const fill = totalWidth;

  if (n === 1) {
    const it = items[0];
    return {
      placements: [
        {
          id: it.id,
          position: wrap01(it.position),
          preferred: wrap01(it.position),
          displacement: 0,
          halfWidth: it.halfWidth,
          clamped: false,
        },
      ],
      fill,
      overflow: totalWidth > 1,
      cost: 0,
    };
  }

  // Sorted cyclic order. Non-crossing is optimal, so this order is fixed and
  // only the cut varies.
  const order = items
    .map((it, i) => ({ it, i, p: wrap01(it.position) }))
    .sort((a, b) => a.p - b.p);

  const overflow = cyclic && totalWidth > 1;
  // If they genuinely cannot fit, shrink uniformly so the solve stays defined.
  // The caller is told via `overflow` and can re-scale properly.
  const shrink = overflow ? 1 / totalWidth : 1;

  let best = null;

  for (let cut = 0; cut < (cyclic ? n : 1); cut++) {
    const seq = [];
    for (let k = 0; k < n; k++) {
      const e = order[(cut + k) % n];
      seq.push({ ...e, w: e.it.halfWidth * shrink, v: e.it.weight ?? 1 });
    }

    // Unwrap preferred positions so they increase from the cut.
    const p = new Array(n);
    p[0] = seq[0].p;
    for (let k = 1; k < n; k++) {
      p[k] = p[k - 1] + (cyclic ? wrap01(seq[k].p - seq[k - 1].p) : seq[k].p - seq[k - 1].p);
    }

    // Cumulative minimum spacing: c[k] - c[k-1] = w[k-1] + w[k].
    const c = new Array(n);
    c[0] = 0;
    for (let k = 1; k < n; k++) c[k] = c[k - 1] + seq[k - 1].w + seq[k].w;

    const q = p.map((pi, k) => pi - c[k]);
    const v = seq.map((s) => s.v);

    // Wrap-around leaves this much slack for the chain to spread into.
    const maxSpan = cyclic ? 1 - seq[0].w - seq[n - 1].w - c[n - 1] : Infinity;

    let y =
      cyclic && Number.isFinite(maxSpan)
        ? isotonicBoundedSpan(q, v, Math.max(maxSpan, 0))
        : isotonic(q, v);

    let x = y.map((yi, k) => yi + c[k]);

    // Feasible intervals, by projection. Clamp then restore ordering; repeat.
    const hasIntervals = seq.some((s) => s.it.interval);
    if (hasIntervals) {
      for (let pass = 0; pass < intervalPasses; pass++) {
        let moved = false;
        for (let k = 0; k < n; k++) {
          const iv = seq[k].it.interval;
          if (!iv) continue;
          // Bring the interval into the same unwrapped frame as x[k].
          const base = Math.floor(x[k]);
          const lo = base + wrap01(iv[0] - (p[k] - wrap01(p[k])));
          const hi = lo + wrap01(iv[1] - iv[0]);
          const clampedX = Math.min(Math.max(x[k], lo + seq[k].w), hi - seq[k].w);
          if (Math.abs(clampedX - x[k]) > 1e-9) {
            x[k] = clampedX;
            moved = true;
          }
        }
        if (!moved) break;
        y = isotonic(
          x.map((xi, k) => xi - c[k]),
          v,
        );
        x = y.map((yi, k) => yi + c[k]);
      }
    }

    let cost = 0;
    for (let k = 0; k < n; k++) {
      const d = cyclicDelta(wrap01(x[k]), seq[k].p);
      cost += seq[k].v * d * d;
    }

    if (!best || cost < best.cost) best = { cost, seq, x };
  }

  const placements = new Array(n);
  best.seq.forEach((s, k) => {
    const pos = wrap01(best.x[k]);
    placements[s.i] = {
      id: s.it.id,
      position: pos,
      preferred: s.p,
      displacement: cyclicDelta(s.p, pos),
      halfWidth: s.it.halfWidth,
      clamped: Boolean(s.it.interval),
    };
  });

  return { placements, fill, overflow, cost: best.cost };
}

/**
 * Largest uniform symbol scale that still fits on the curve.
 *
 * `widthOf(item, scale)` returns a half-width in parameter units. Binary search
 * rather than a closed form so that any mark geometry works (disc area, bar
 * width, stacked rings) without the caller inverting anything.
 */
export function fitNecklaceScale(items, widthOf, options = {}) {
  const { targetFill = 0.92, maxScale = 64, tolerance = 1e-4 } = options;
  const total = (scale) => items.reduce((s, it) => s + 2 * widthOf(it, scale), 0);

  if (total(maxScale) <= targetFill) return maxScale;

  let lo = 0;
  let hi = maxScale;
  while (hi - lo > tolerance) {
    const mid = (lo + hi) / 2;
    if (total(mid) <= targetFill) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Convenience: place items whose preferred position is a compass bearing.
 * Bearings map onto the cyclic parameter directly, because `circleCurve` puts
 * `t = 0` at north and runs clockwise.
 */
export function placeByBearing(items, options = {}) {
  return placeNecklace(
    items.map((it) => ({ ...it, position: ((it.bearing % 360) + 360) % 360 / 360 })),
    options,
  );
}

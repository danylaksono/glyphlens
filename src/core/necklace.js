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
 * The order is fixed to the order by preferred position, so only the cut of
 * the circle has to be chosen. We try all n cuts and keep the cheapest:
 * O(n^2), which is nothing for the bin counts a lens uses (typically <= 72).
 *
 * Keeping that order is a design constraint, not a free property of the
 * optimum. A crossing solution can be uncrossed without increasing cost only
 * when all widths and all weights are equal. With unequal ones, swapping two
 * nearly coincident marks can make room for a third, and the unconstrained
 * optimum is cheaper. paper/scripts/solver-check.mjs measures this: cheaper in
 * 8-42% of clustered random instances, by a median of 3-7 degrees of RMS
 * displacement. We keep the order anyway, because on a bearing-faithful ring
 * the relative order of two marks is itself data. See docs/findings.md F-37.
 *
 * Without intervals, the order-preserving problem is solved exactly. The
 * optimum x* has at least one gap wider than its two marks need, because the
 * marks fill less than the whole curve. Cutting there, x* is feasible and the
 * wrap-around cap is slack, so the plain isotonic regression for that cut is
 * x*. Every other cut either reaches x* too or returns a feasible, costlier
 * point. So the approximate span projection (isotonicBoundedSpan) never decides
 * the result; it only keeps the losing cuts feasible. This holds for
 * displacements below half a turn, where the cyclic and unwrapped costs agree.
 *
 * ## Feasible intervals
 *
 * `interval: [lo, hi]` confines an item to an arc. For point data the interval
 * is the whole circle and only `position` matters; for an area it is the
 * angular projection of the geometry seen from the lens centre, which is
 * Speckmann & Verbeek's original primitive. Intervals become bounds on y, and
 * each cut is solved exactly by bounded isotonic regression (isotonicBounded).
 * The argument above carries over unchanged: the optimum still has a slack
 * gap, and the cut through it still meets the cap. So a cut whose solution
 * overlaps across the wrap-around is skipped. A mark wider than its own
 * interval has that interval dropped. If no cut can meet the rest, the marks
 * are placed without intervals. Either way `intervalsMet` is false.
 *
 * This replaced a clamp-and-re-solve heuristic that left an interval or
 * overlapped a neighbour in roughly one in ten wedge instances, and was a
 * median 5% costlier (paper/scripts/interval-check.mjs; docs/findings.md F-38).
 */

import { isotonic, isotonicBounded, isotonicBoundedSpan } from './isotonic.js';
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
 * @returns {{
 *   placements: Array<{ id, position, preferred, displacement, halfWidth, clamped }>,
 *   fill: number,        fraction of the curve consumed by symbols
 *   overflow: boolean,   true if the symbols cannot fit at all
 *   cost: number,
 *   intervalsMet: boolean false if some interval was not honoured: either a
 *                         mark was wider than its own interval (that interval
 *                         alone is dropped), or no placement meets them all
 *                         (the marks are then placed without intervals)
 * }}
 */
export function placeNecklace(items, options = {}) {
  const { cyclic = true } = options;
  const n = items.length;
  if (n === 0) return { placements: [], fill: 0, overflow: false, cost: 0, intervalsMet: true };

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
      intervalsMet: true,
    };
  }

  // Sorted cyclic order. It is kept fixed (see the header), so only the cut
  // varies.
  const order = items
    .map((it, i) => ({ it, i, p: wrap01(it.position) }))
    .sort((a, b) => a.p - b.p);

  const overflow = cyclic && totalWidth > 1;
  // If they genuinely cannot fit, shrink uniformly so the solve stays defined.
  // The caller is told via `overflow` and can re-scale properly.
  const shrink = overflow ? 1 / totalWidth : 1;

  // A mark wider than its own interval cannot meet it. Drop that interval
  // rather than let it make every cut infeasible; the others still hold.
  const usable = (it) => it.interval && 2 * it.halfWidth * shrink <= arcLength(it.interval, cyclic) + 1e-12;
  const hasIntervals = items.some(usable);
  const dropped = items.some((it) => it.interval && !usable(it));
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

    let y;
    if (hasIntervals) {
      // Exact: isotonic regression with each mark's interval as bounds on y.
      const lo = new Array(n);
      const hi = new Array(n);
      for (let k = 0; k < n; k++) {
        const iv = usable(seq[k].it) ? seq[k].it.interval : null;
        if (!iv) {
          lo[k] = -Infinity;
          hi[k] = Infinity;
          continue;
        }
        const [a, b] = intervalAround(iv, seq[k].p, p[k], cyclic);
        lo[k] = a + seq[k].w - c[k];
        hi[k] = b - seq[k].w - c[k];
      }
      y = isotonicBounded(q, v, lo, hi);
      // Intervals this cut cannot meet, or a solution that overlaps across the
      // cut: either way this cut is not the optimum (see the header).
      if (!y || (cyclic && y[n - 1] - y[0] > maxSpan + 1e-12)) continue;
    } else {
      y = isotonic(q, v);
      if (cyclic && y[n - 1] - y[0] > maxSpan + 1e-12) {
        // Not the optimum either, but kept feasible so that a lens whose
        // marks exactly fill the ring still gets an answer.
        y = isotonicBoundedSpan(q, v, Math.max(maxSpan, 0));
      }
    }

    const x = y.map((yi, k) => yi + c[k]);

    let cost = 0;
    for (let k = 0; k < n; k++) {
      const d = cyclicDelta(wrap01(x[k]), seq[k].p);
      cost += seq[k].v * d * d;
    }

    if (!best || cost < best.cost) best = { cost, seq, x };
  }

  if (!best) {
    // The intervals cannot all be met (or the marks cannot fit). Place without
    // them and say so, rather than return an overlapping layout.
    const relaxed = placeNecklace(
      items.map(({ interval, ...it }) => it),
      options,
    );
    return { ...relaxed, intervalsMet: false };
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

  return { placements, fill, overflow, cost: best.cost, intervalsMet: !dropped };
}

/**
 * A cyclic interval [a, b] as an arc [lo, hi] in the unwrapped frame in which
 * the preferred position `p` sits at `pUnwrapped`. The copy of the arc that
 * contains `p` is used, or the nearer copy if `p` lies outside the arc. An
 * interval of zero length is taken to be the whole curve.
 */
function arcLength([a, b], cyclic) {
  return cyclic ? wrap01(b - a) || 1 : b - a;
}

function intervalAround([a, b], p, pUnwrapped, cyclic) {
  if (!cyclic) return [a + (pUnwrapped - p), b + (pUnwrapped - p)];
  const len = arcLength([a, b], true);
  let lo = pUnwrapped - wrap01(p - a);
  if (pUnwrapped - (lo + len) > lo + 1 - pUnwrapped) lo += 1;
  return [lo, lo + len];
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

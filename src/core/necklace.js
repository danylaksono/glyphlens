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
 * `interval: [lo, hi]` confines an item to an arc, which may straddle `t = 0`.
 * For point data the interval is the whole circle and only `position` matters;
 * for an area it is the angular projection of the geometry seen from the lens
 * centre, which is Speckmann & Verbeek's original primitive. An item's whole
 * symbol is kept inside its arc, which is stricter than Speckmann & Verbeek,
 * who ask only that the symbol's centre is.
 *
 * Interval handling is by projection onto the box between isotonic passes —
 * approximate, unlike the unconstrained case. Recorded in docs/findings.md F-1
 * and measured against CartoCrow in F-37; `violation` in the result says how
 * far the answer misses the constraints.
 */

import { isotonic, isotonicBoundedSpan } from './isotonic.js';
import { wrap01, cyclicDelta } from './curve.js';

/** Constraint violations below this are numerical noise, in parameter units. */
const TOL = 1e-9;

/**
 * Length of a feasible arc `[lo, hi]`, in parameter units.
 *
 * `[0.9, 0.1]` straddles the seam and is 0.2 long. `[0, 1]` — and any arc whose
 * endpoints coincide after a full turn — is the whole curve, i.e. no constraint;
 * `[0.3, 0.3]` is a pin.
 */
function arcLength([lo, hi]) {
  const span = hi - lo;
  if (span === 0) return 0;
  return wrap01(span) === 0 ? 1 : wrap01(span);
}

/**
 * Projects `x` onto the feasible arc `iv`, for a symbol of half-width `w`.
 *
 * The arc repeats every turn, so it is lifted into the turn `x` sits in and the
 * neighbouring turns are tried too: an arc that straddles `t = 0` is nearest in
 * the turn below, and picking the lift by `floor(x)` alone sends such a symbol
 * to the far edge of its own interval.
 *
 * Returns `x` unchanged when it already fits. A symbol wider than its arc
 * cannot fit inside it at all, so it is centred on the arc instead.
 */
function projectOntoArc(x, iv, w) {
  const len = arcLength(iv);
  if (len >= 1) return x; // whole curve: no constraint
  const seed = iv[0] + Math.floor(x - iv[0]);
  let best = null;
  for (let turn = -1; turn <= 1; turn++) {
    const lo = seed + turn;
    const candidate = len <= 2 * w ? lo + len / 2 : Math.min(Math.max(x, lo + w), lo + len - w);
    if (best === null || Math.abs(candidate - x) < Math.abs(best - x)) best = candidate;
  }
  return best;
}

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
 * @param {number} [options.intervalPasses=32] projection passes for feasible
 *   intervals. The loop stops as soon as a pass changes nothing, so an
 *   unconstrained or already-converged layout never pays for the budget; only
 *   the tight cases iterate, and those are the ones that need it. At 8 the
 *   residual on a tight instance is around 1e-4 of the curve; by 32 it is at
 *   the floor of double precision.
 * @returns {{
 *   placements: Array<{ id, position, preferred, displacement, halfWidth, clamped }>,
 *                        `clamped` is true when the item's feasible interval
 *                        actually bound it during the solve,
 *   fill: number,        fraction of the curve consumed by symbols
 *   overflow: boolean,   true if the symbols cannot fit on the curve at all
 *   cost: number,
 *   violation: number    how far the result misses the constraints, in
 *                        parameter units: 0 is a placement that separates every
 *                        symbol and keeps each inside its arc. Non-zero means
 *                        the request was infeasible (arcs too narrow, or too
 *                        crowded to satisfy together) or that interval
 *                        projection did not converge. `overflow` only reports
 *                        the curve running out of room overall, so it stays
 *                        false in cases where `violation` is the only warning.
 * }}
 */
export function placeNecklace(items, options = {}) {
  const { cyclic = true, intervalPasses = 32 } = options;
  const n = items.length;
  if (n === 0) return { placements: [], fill: 0, overflow: false, cost: 0, violation: 0 };

  const totalWidth = items.reduce((s, it) => s + 2 * it.halfWidth, 0);
  const fill = totalWidth;

  if (n === 1) {
    const it = items[0];
    const preferred = wrap01(it.position);
    const placed = it.interval ? wrap01(projectOntoArc(preferred, it.interval, it.halfWidth)) : preferred;
    const displacement = cyclicDelta(preferred, placed);
    const len = it.interval ? arcLength(it.interval) : 1;
    return {
      placements: [
        {
          id: it.id,
          position: placed,
          preferred,
          displacement,
          halfWidth: it.halfWidth,
          clamped: Math.abs(displacement) > TOL,
        },
      ],
      fill,
      overflow: totalWidth > 1,
      cost: (it.weight ?? 1) * displacement * displacement,
      violation: len < 1 && len < 2 * it.halfWidth ? it.halfWidth - len / 2 : 0,
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

    const solve = (targets) =>
      cyclic && Number.isFinite(maxSpan)
        ? isotonicBoundedSpan(targets, v, Math.max(maxSpan, 0))
        : isotonic(targets, v);

    let y = solve(q);
    let x = y.map((yi, k) => yi + c[k]);

    // Feasible intervals, by projection. Clamp then restore spacing; repeat.
    const hasIntervals = seq.some((s) => s.it.interval);
    const clamped = new Array(n).fill(false);
    if (hasIntervals) {
      for (let pass = 0; pass < intervalPasses; pass++) {
        let moved = false;
        for (let k = 0; k < n; k++) {
          const iv = seq[k].it.interval;
          if (!iv) continue;
          const projected = projectOntoArc(x[k], iv, seq[k].w);
          if (Math.abs(projected - x[k]) > TOL) {
            x[k] = projected;
            clamped[k] = true;
            moved = true;
          }
        }
        if (!moved) break;
        // Restore spacing under the same constraints as the first solve. The
        // span cap is what keeps the wrap-around gap honest, so dropping it
        // here would let a clamped chain close up across the seam.
        y = solve(x.map((xi, k) => xi - c[k]));
        x = y.map((yi, k) => yi + c[k]);
      }
    }

    let cost = 0;
    for (let k = 0; k < n; k++) {
      const d = cyclicDelta(wrap01(x[k]), seq[k].p);
      cost += seq[k].v * d * d;
    }

    // Projection is approximate, so a cut can end up infeasible. Measure what
    // it leaves violated — otherwise a cheap infeasible cut beats a sound one.
    let violation = 0;
    for (let k = 1; k < n; k++) {
      violation = Math.max(violation, seq[k - 1].w + seq[k].w - (x[k] - x[k - 1]));
    }
    if (cyclic && n > 1) {
      violation = Math.max(violation, seq[n - 1].w + seq[0].w - (x[0] + 1 - x[n - 1]));
    }
    for (let k = 0; k < n; k++) {
      const iv = seq[k].it.interval;
      if (!iv) continue;
      const len = arcLength(iv);
      if (len >= 1) continue;
      violation = Math.max(violation, Math.abs(projectOntoArc(x[k], iv, seq[k].w) - x[k]));
      // An arc narrower than its own symbol cannot hold it wherever it goes.
      if (len < 2 * seq[k].w) violation = Math.max(violation, seq[k].w - len / 2);
    }

    const better =
      !best ||
      violation < best.violation - TOL ||
      (violation <= best.violation + TOL && cost < best.cost);
    if (better) best = { cost, violation, seq, x, clamped };
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
      clamped: best.clamped[k],
    };
  });

  return { placements, fill, overflow, cost: best.cost, violation: Math.max(best.violation, 0) };
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

/**
 * Weighted isotonic regression by pool-adjacent-violators (PAV).
 *
 * Finds the non-decreasing sequence `y` minimising `sum(w_i * (y_i - q_i)^2)`.
 * Exact, O(n).
 *
 * This is the workhorse behind necklace placement: after a change of variable
 * that folds each symbol's width into a cumulative offset, "place these symbols
 * near their preferred positions without overlapping, in this order" becomes
 * exactly this problem. See core/necklace.js.
 */

/**
 * @param {number[]} q  target values
 * @param {number[]} [w] weights (default 1)
 * @returns {number[]} non-decreasing fit, same length as `q`
 */
export function isotonic(q, w) {
  const n = q.length;
  if (n === 0) return [];

  // Each block holds a pooled run: its weighted mean, total weight, and size.
  const mean = new Float64Array(n);
  const weight = new Float64Array(n);
  const size = new Int32Array(n);
  let top = -1;

  for (let i = 0; i < n; i++) {
    top++;
    mean[top] = q[i];
    weight[top] = w ? w[i] : 1;
    size[top] = 1;
    // Pool backwards while the sequence would decrease.
    while (top > 0 && mean[top - 1] > mean[top]) {
      const wSum = weight[top - 1] + weight[top];
      mean[top - 1] =
        wSum === 0
          ? (mean[top - 1] + mean[top]) / 2
          : (mean[top - 1] * weight[top - 1] + mean[top] * weight[top]) / wSum;
      weight[top - 1] = wSum;
      size[top - 1] += size[top];
      top--;
    }
  }

  const out = new Array(n);
  let k = 0;
  for (let b = 0; b <= top; b++) {
    for (let j = 0; j < size[b]; j++) out[k++] = mean[b];
  }
  return out;
}

/**
 * Weighted isotonic regression with per-element bounds
 * (`lo[i] <= y[i] <= hi[i]`). Exact, O(n).
 *
 * Monotonicity lets the bounds be tightened without changing the feasible
 * set: a running maximum of `lo` from the left and a running minimum of `hi`
 * from the right. Both are then non-decreasing, so a pooled block's feasible
 * range is [lo of its last element, hi of its first]. The algorithm is
 * pool-adjacent-violators in which each block takes its weighted mean clamped
 * to that range. Clipping the unconstrained fit to the bounds is *not* the
 * same thing: for targets [0, 10, 5] with y[1] <= 6 it gives [0, 6, 7.5], and
 * the optimum is [0, 6, 6].
 *
 * Checked against Dykstra's algorithm in paper/scripts/interval-check.mjs.
 *
 * @param {number[]} q   target values
 * @param {number[]} [w] weights (default 1)
 * @param {number[]} lo  lower bounds (-Infinity for none)
 * @param {number[]} hi  upper bounds (Infinity for none)
 * @returns {number[] | null} the fit, or null if the bounds cannot all be met
 */
export function isotonicBounded(q, w, lo, hi) {
  const n = q.length;
  if (n === 0) return [];
  const L = new Float64Array(n);
  const U = new Float64Array(n);
  L[0] = lo[0];
  for (let i = 1; i < n; i++) L[i] = Math.max(lo[i], L[i - 1]);
  U[n - 1] = hi[n - 1];
  for (let i = n - 2; i >= 0; i--) U[i] = Math.min(hi[i], U[i + 1]);
  for (let i = 0; i < n; i++) if (L[i] > U[i] + 1e-12) return null;

  // Blocks on a stack: weighted sum, weighted target sum, first and last index.
  const sw = new Float64Array(n);
  const swq = new Float64Array(n);
  const from = new Int32Array(n);
  const to = new Int32Array(n);
  const val = new Float64Array(n);
  let top = -1;
  const value = (b) => {
    const mean = sw[b] === 0 ? (L[to[b]] + U[from[b]]) / 2 : swq[b] / sw[b];
    return Math.min(Math.max(mean, L[to[b]]), U[from[b]]);
  };

  for (let i = 0; i < n; i++) {
    top++;
    const wi = w ? w[i] : 1;
    sw[top] = wi;
    swq[top] = wi * q[i];
    from[top] = i;
    to[top] = i;
    val[top] = value(top);
    while (top > 0 && val[top - 1] > val[top]) {
      sw[top - 1] += sw[top];
      swq[top - 1] += swq[top];
      to[top - 1] = to[top];
      top--;
      val[top] = value(top);
    }
  }

  const out = new Array(n);
  for (let b = 0; b <= top; b++) {
    for (let i = from[b]; i <= to[b]; i++) out[i] = val[b];
  }
  return out;
}

/**
 * Isotonic regression with an additional cap on total span
 * (`y[n-1] - y[0] <= maxSpan`).
 *
 * Solved by alternating projection onto the two convex sets (monotone
 * sequences, and sequences of bounded span). The result is always feasible but
 * is not the constrained optimum: on random inputs where the cap binds, its
 * cost is up to about twice the optimum. The exact answer is plain isotonic
 * regression on targets whose end points are pulled inward by mu / w, with the
 * multiplier mu found by bisection. That is roughly ten times slower.
 *
 * The necklace does not need the exact answer. With fill below 1, the
 * order-preserving optimum always has a gap wider than required. At the cut
 * through that gap the cap is slack, so plain isotonic regression already
 * returns the optimum. A cut where the cap binds only has to produce something
 * feasible, and any feasible answer costs at least the optimum. See
 * core/necklace.js and docs/findings.md F-37.
 */
export function isotonicBoundedSpan(q, w, maxSpan, iterations = 24) {
  let y = isotonic(q, w);
  const n = y.length;
  if (n < 2) return y;

  for (let it = 0; it < iterations; it++) {
    const span = y[n - 1] - y[0];
    if (span <= maxSpan + 1e-12) break;

    // Compress towards the weighted centroid, then restore monotonicity.
    const scale = maxSpan / span;
    let wSum = 0;
    let centre = 0;
    for (let i = 0; i < n; i++) {
      const wi = w ? w[i] : 1;
      wSum += wi;
      centre += wi * y[i];
    }
    centre = wSum === 0 ? y[0] : centre / wSum;

    const compressed = y.map((v) => centre + (v - centre) * scale);
    y = isotonic(compressed, w);
  }
  return y;
}

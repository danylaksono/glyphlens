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
 * Isotonic regression with an additional cap on total span
 * (`y[n-1] - y[0] <= maxSpan`).
 *
 * Solved by alternating projection onto the two convex sets (monotone
 * sequences, and sequences of bounded span). Converges; not a closed form.
 * Only invoked when the necklace is nearly full, which is the case where the
 * packing is close to forced anyway.
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

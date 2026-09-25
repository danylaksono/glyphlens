/**
 * Feasible intervals: the necklace solver against exact references.
 *
 *   node paper/scripts/interval-check.mjs [trials] [seed]
 *
 * Angular binning gives every bin its own wedge as a feasible interval, so
 * intervals are the common case for a lens rather than an edge case. The
 * solver handles them heuristically: it solves without them, clamps each mark
 * into its interval, re-solves the isotonic regression, and repeats for up to
 * eight passes. This script measures three things:
 *
 *  - how often the heuristic's output leaves an interval or overlaps a
 *    neighbour;
 *  - how far its cost is from the order-preserving optimum;
 *  - whether a cheap exact method matches that optimum.
 *
 * Reference (exact, slow). For each cut of the cycle, with targets unwrapped
 * from the cut, the convex problem is min sum w (y - q)^2 subject to y
 * non-decreasing, box bounds from the intervals, and the wrap-around span cap.
 * Dykstra's algorithm in the w-weighted norm solves it exactly, and it is run to
 * convergence. The feasible cut with the smallest true cyclic cost is the
 * optimum.
 *
 * Candidate (exact, fast). Monotonicity lets the bounds be tightened without
 * changing the feasible set: a running maximum of the lower bounds from the
 * left, and a running minimum of the upper bounds from the right. For a least
 * squares isotonic fit with monotone bounds, the unconstrained isotonic
 * solution clipped to those bounds is optimal. The span cap is handled as for
 * the interval-free case: a cut whose clipped solution violates it is skipped.
 * This script checks both claims against the reference rather than assuming
 * them.
 *
 * Instances:
 *  - wedges: K equal sectors, each mark's interval its own sector and its
 *    preferred position a random bearing inside it (angular binning);
 *  - units: each mark's interval an arc around its preferred position, and
 *    neighbouring arcs may overlap (areal units seen from the lens centre).
 * Fill runs from 0.3 to 0.95.
 */

import { placeNecklace } from '../../src/core/necklace.js';
import { isotonic } from '../../src/core/isotonic.js';
import { cyclicDelta, wrap01 } from '../../src/core/curve.js';

const trials = Number(process.argv[2] ?? 300);
let seed = Number(process.argv[3] ?? 1);
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

const cyclicCost = (items, xs) =>
  items.reduce((s, it, i) => s + it.weight * cyclicDelta(wrap01(xs[i]), it.position) ** 2, 0);

// Per cut: order, unwrapped targets, cumulative spacing, span cap, and bounds
// on y = x - c from each mark's interval (in the same unwrapped frame).
function cuts(items) {
  const sorted = items.map((_, i) => i).sort((a, b) => items[a].position - items[b].position);
  const n = sorted.length;
  const out = [];
  for (let cut = 0; cut < n; cut++) {
    const order = [...sorted.slice(cut), ...sorted.slice(0, cut)];
    const it = order.map((i) => items[i]);
    const p = [it[0].position];
    for (let k = 1; k < n; k++) p[k] = p[k - 1] + wrap01(it[k].position - it[k - 1].position);
    const c = [0];
    for (let k = 1; k < n; k++) c[k] = c[k - 1] + it[k - 1].halfWidth + it[k].halfWidth;
    const S = 1 - it[0].halfWidth - it[n - 1].halfWidth - c[n - 1];
    const lo = [];
    const hi = [];
    it.forEach((m, k) => {
      if (!m.interval) {
        lo.push(-Infinity);
        hi.push(Infinity);
        return;
      }
      const [a, b] = m.interval;
      lo.push(p[k] - wrap01(m.position - a) + m.halfWidth - c[k]);
      hi.push(p[k] + wrap01(b - m.position) - m.halfWidth - c[k]);
    });
    out.push({ order, q: p.map((x, k) => x - c[k]), c, S, lo, hi, v: it.map((m) => m.weight) });
  }
  return out;
}

// Dykstra's algorithm: w-weighted projection of q onto monotone ∩ box ∩ span.
function dykstra({ q, v, lo, hi, S }) {
  const n = q.length;
  let x = q.slice();
  const inc = [new Array(n).fill(0), new Array(n).fill(0), new Array(n).fill(0)];
  const proj = [
    (z) => isotonic(z, v),
    (z) => z.map((zi, k) => Math.min(Math.max(zi, lo[k]), hi[k])),
    (z) => {
      const e = z[n - 1] - z[0] - S;
      if (e <= 0) return z.slice();
      const out = z.slice();
      out[0] += (e * v[n - 1]) / (v[0] + v[n - 1]);
      out[n - 1] -= (e * v[0]) / (v[0] + v[n - 1]);
      return out;
    },
  ];
  for (let it = 0; it < 200000; it++) {
    const before = x.slice();
    for (let s = 0; s < 3; s++) {
      const z = x.map((xi, k) => xi + inc[s][k]);
      const y = proj[s](z);
      inc[s] = z.map((zi, k) => zi - y[k]);
      x = y;
    }
    let d = 0;
    for (let k = 0; k < n; k++) d = Math.max(d, Math.abs(x[k] - before[k]));
    if (d < 1e-14 && it > 10) break;
  }
  return x;
}

function feasibleY(y, { lo, hi, S }, tol = 1e-9) {
  const n = y.length;
  for (let k = 0; k < n; k++) {
    if (y[k] < lo[k] - tol || y[k] > hi[k] + tol) return false;
    if (k && y[k] < y[k - 1] - tol) return false;
  }
  return y[n - 1] - y[0] <= S + tol;
}

function solveWith(items, solver) {
  let best = null;
  for (const cut of cuts(items)) {
    const y = solver(cut);
    if (!y || !feasibleY(y, cut)) continue;
    const xs = new Array(items.length);
    cut.order.forEach((i, k) => (xs[i] = y[k] + cut.c[k]));
    const cost = cyclicCost(items, xs);
    if (!best || cost < best.cost) best = { cost, xs };
  }
  return best;
}

// The fast exact candidate: pool-adjacent-violators in which each pooled
// block takes its weighted mean clamped to the block's feasible range. With
// bounds made monotone (running max of lower bounds from the left, running min
// of upper bounds from the right), a block's range is [its last L, its first U].
function boundedPav({ q, v, lo, hi }) {
  const n = q.length;
  const L = lo.slice();
  const U = hi.slice();
  for (let k = 1; k < n; k++) L[k] = Math.max(L[k], L[k - 1]);
  for (let k = n - 2; k >= 0; k--) U[k] = Math.min(U[k], U[k + 1]);
  for (let k = 0; k < n; k++) if (L[k] > U[k] + 1e-15) return null;
  const blocks = [];
  for (let k = 0; k < n; k++) {
    let b = { sw: v[k], swq: v[k] * q[k], from: k, to: k };
    const value = (b) => Math.min(Math.max(b.swq / b.sw, L[b.to]), U[b.from]);
    b.val = value(b);
    while (blocks.length && blocks[blocks.length - 1].val > b.val) {
      const a = blocks.pop();
      b = { sw: a.sw + b.sw, swq: a.swq + b.swq, from: a.from, to: b.to };
      b.val = value(b);
    }
    blocks.push(b);
  }
  const y = new Array(n);
  for (const b of blocks) for (let k = b.from; k <= b.to; k++) y[k] = b.val;
  return y;
}

function implementationFeasible(items, placements, tol = 1e-7) {
  let inside = true;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.interval) continue;
    const [a, b] = it.interval;
    const len = wrap01(b - a) || 1;
    const off = wrap01(placements[i].position - a);
    if (off < it.halfWidth - tol || off > len - it.halfWidth + tol) inside = false;
  }
  const idx = placements.map((_, i) => i).sort((a, b) => placements[a].position - placements[b].position);
  let overlap = false;
  for (let k = 0; k < idx.length; k++) {
    const a = idx[k];
    const b = idx[(k + 1) % idx.length];
    if (wrap01(placements[b].position - placements[a].position) < items[a].halfWidth + items[b].halfWidth - tol) overlap = true;
  }
  return { inside, overlap };
}

function instance(kind, n) {
  const fill = 0.3 + 0.65 * rand();
  const raw = Array.from({ length: n }, () => 1 + 4 * rand());
  const total = raw.reduce((s, r) => s + 2 * r, 0);
  const rot = kind === 'wedges' ? 0 : rand();
  return raw.map((r, i) => {
    const halfWidth = (r / total) * fill;
    const weight = 1 + 9 * rand();
    if (kind === 'wedges') {
      const a = i / n;
      const b = (i + 1) / n;
      // A wedge narrower than its mark cannot hold it; such bins are rare
      // (a mark wider than 360/K degrees) and are left unconstrained here.
      const position = a + (b - a) * (0.05 + 0.9 * rand());
      return { id: i, halfWidth, weight, position, interval: 2 * halfWidth < b - a ? [a, b] : undefined };
    }
    const position = wrap01(rot + (i + rand() * 0.8) / n);
    // Capped so an arc (at most 2 * 0.45 of the curve) never wraps onto itself.
    const half = Math.min(halfWidth + (0.2 + 1.5 * rand()) / n, 0.45);
    return { id: i, halfWidth, weight, position, interval: [wrap01(position - half * rand()), wrap01(position + half)] };
  });
}

console.log(`interval check: ${trials} instances per row, seed ${process.argv[3] ?? 1}`);
console.log('kind    n  feasible  impl out of interval  impl overlap  impl > opt (median / max rel.)  bounded PAV = opt  relaxed');
for (const kind of ['wedges', 'units']) {
  for (const n of [4, 8, 16]) {
    let feasible = 0, outside = 0, overlap = 0, worse = 0, clipOk = 0, relaxed = 0;
    const gaps = [];
    for (let t = 0; t < trials; t++) {
      const items = instance(kind, n);
      const opt = solveWith(items, dykstra);
      if (!opt) continue;
      feasible++;
      const impl = placeNecklace(items);
      if (impl.intervalsMet === false) relaxed++;
      const f = implementationFeasible(items, impl.placements);
      if (!f.inside) outside++;
      if (f.overlap) overlap++;
      const implCost = cyclicCost(items, impl.placements.map((p) => p.position));
      if (f.inside && !f.overlap && implCost > opt.cost * (1 + 1e-6) + 1e-12) {
        worse++;
        gaps.push((implCost - opt.cost) / opt.cost);
      }
      const cl = solveWith(items, boundedPav);
      if (cl && Math.abs(cl.cost - opt.cost) <= 1e-7 * Math.max(opt.cost, 1e-9) + 1e-12) clipOk++;
    }
    gaps.sort((a, b) => a - b);
    const med = gaps.length ? gaps[gaps.length >> 1] : 0;
    const max = gaps.length ? gaps[gaps.length - 1] : 0;
    console.log(
      `${kind.padEnd(6)} ${String(n).padStart(2)}  ${String(feasible).padStart(8)}  ${String(outside).padStart(20)}  ${String(overlap).padStart(12)}  ` +
        `${String(worse).padStart(5)} (${(100 * med).toFixed(1)} % / ${(100 * max).toFixed(1)} %)`.padEnd(31) +
        `${String(clipOk).padStart(6)} / ${feasible}`.padEnd(19) + `${relaxed}`,
    );
  }
}

/**
 * Exactness and order checks for the necklace solver.
 *
 *   node paper/scripts/solver-check.mjs [trials] [maxN] [seed]
 *
 * placeNecklace (src/core/necklace.js) keeps marks in the order of their
 * preferred positions. It cuts the cycle at each of the n places and, for each
 * cut, solves an isotonic regression with the targets unwrapped so that they
 * increase from the cut. When the marks nearly fill the cycle it enforces the
 * wrap-around constraint by alternating projection. This script checks three
 * things against exact references on small random instances.
 *
 *  A. Exactness for the order-preserving problem. The reference is the
 *     implementation's own formulation (every cut, targets unwrapped from the
 *     cut) with the span-capped isotonic regression solved exactly. For that
 *     problem the KKT conditions are those of plain isotonic regression on
 *     targets whose two end points are pulled inward by mu / v, so it reduces
 *     to a bisection on the multiplier mu. The check reports how often the cap
 *     binds and how far alternating projection is from the exact answer.
 *
 *  B. The cost of preserving order. The second reference drops the order
 *     constraint. It enumerates every linear order and every lift of each
 *     target by a whole turn, solves each case exactly, and keeps the lowest
 *     true cost. A lift lets a mark wind past its neighbours, which also
 *     breaks local order. The gap is reported as the weighted RMS
 *     displacement, in degrees, of the order-preserving optimum against the
 *     unconstrained one.
 *
 *  C. Feasibility. Every output is checked for overlap.
 *
 * Instances cover mark widths that differ by up to 10x and weights that differ
 * by up to 10x. Each is also run with equal widths, and with equal weights, to
 * separate the two effects, and with both equal as a control. Preferred positions are clustered so that marks
 * collide, and fills range from 0.2 to 0.97. Feasible intervals are not
 * tested.
 */

import { placeNecklace } from '../../src/core/necklace.js';
import { isotonic } from '../../src/core/isotonic.js';
import { cyclicDelta, wrap01 } from '../../src/core/curve.js';

const trials = Number(process.argv[2] ?? 200);
const maxN = Number(process.argv[3] ?? 5);
let seed = Number(process.argv[4] ?? 1);
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

// Exact: min sum v (y - q)^2 with y non-decreasing and y[n-1] - y[0] <= S.
function isoSpan(q, v, S) {
  const n = q.length;
  const at = (mu) => {
    const t = q.slice();
    t[0] += mu / v[0];
    t[n - 1] -= mu / v[n - 1];
    return isotonic(t, v);
  };
  const span = (y) => y[n - 1] - y[0];
  const free = at(0);
  if (!Number.isFinite(S) || span(free) <= S + 1e-13) return { y: free, binds: false };
  let lo = 0;
  let hi = 1;
  while (span(at(hi)) > S) hi *= 2;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (span(at(mid)) > S) lo = mid;
    else hi = mid;
  }
  return { y: at(hi), binds: true };
}

function permutations(a) {
  if (a.length <= 1) return [a];
  const out = [];
  a.forEach((x, i) => {
    for (const r of permutations([...a.slice(0, i), ...a.slice(i + 1)])) out.push([x, ...r]);
  });
  return out;
}

// Weighted squared displacement. Cyclic curves use the cyclic difference.
function cost(items, xs, cyclic) {
  let c = 0;
  items.forEach((it, i) => {
    const d = cyclic ? cyclicDelta(wrap01(xs[i]), wrap01(it.position)) : xs[i] - it.position;
    c += (it.weight ?? 1) * d * d;
  });
  return c;
}

// Solve one linear order exactly, with the target of order[j] at q-lift t[j].
function solveOrder(items, order, targets, cyclic) {
  const n = order.length;
  const w = order.map((i) => items[i].halfWidth);
  const v = order.map((i) => items[i].weight ?? 1);
  const c = [0];
  for (let k = 1; k < n; k++) c[k] = c[k - 1] + w[k - 1] + w[k];
  const S = cyclic ? 1 - w[0] - w[n - 1] - c[n - 1] : Infinity;
  if (S < 0) return null;
  const { y, binds } = isoSpan(targets.map((t, j) => t - c[j]), v, S);
  const xs = new Array(items.length);
  order.forEach((i, j) => (xs[i] = y[j] + c[j]));
  return { cost: cost(items, xs, cyclic), xs, binds };
}

// Reference A: the order-preserving problem, solved exactly.
function orderPreserving(items, cyclic) {
  const sorted = items.map((_, i) => i).sort((a, b) => items[a].position - items[b].position);
  const n = sorted.length;
  let best = null;
  for (let cut = 0; cut < (cyclic ? n : 1); cut++) {
    const order = [...sorted.slice(cut), ...sorted.slice(0, cut)];
    const t = [items[order[0]].position];
    for (let k = 1; k < n; k++) t[k] = t[k - 1] + wrap01(items[order[k]].position - items[order[k - 1]].position);
    const r = solveOrder(items, order, t, cyclic);
    if (r && (!best || r.cost < best.cost)) best = r;
  }
  return best;
}

// Reference B: any order, any winding.
function unconstrained(items, cyclic) {
  const n = items.length;
  const lifts = cyclic ? [-1, 0, 1, 2] : [0];
  let best = null;
  for (const order of permutations(items.map((_, i) => i))) {
    const m = new Array(n).fill(0);
    const recurse = (k) => {
      if (k === n) {
        const t = order.map((i, j) => items[i].position + m[j]);
        const r = solveOrder(items, order, t, cyclic);
        if (r && (!best || r.cost < best.cost)) best = r;
        return;
      }
      for (const l of lifts) {
        m[k] = l;
        recurse(k + 1);
      }
    };
    recurse(1);
  }
  return best;
}

function overlaps(items, xs, cyclic) {
  const key = (x) => (cyclic ? wrap01(x) : x);
  const idx = xs.map((_, i) => i).sort((a, b) => key(xs[a]) - key(xs[b]));
  const n = idx.length;
  for (let k = 0; k < (cyclic ? n : n - 1); k++) {
    const a = idx[k];
    const b = idx[(k + 1) % n];
    let gap = cyclic ? wrap01(xs[b] - xs[a]) : xs[b] - xs[a];
    if (gap < items[a].halfWidth + items[b].halfWidth - 1e-9) return true;
  }
  return false;
}

function instance(n, variant) {
  const fill = 0.2 + 0.77 * rand();
  const raw = Array.from({ length: n }, () => (variant === 'equal widths' || variant === 'all equal' ? 1 : 1 + 9 * rand()));
  const total = raw.reduce((s, r) => s + 2 * r, 0);
  const centres = [rand(), rand()];
  return raw.map((r, i) => ({
    id: i,
    halfWidth: (r / total) * fill,
    weight: variant === 'equal weights' || variant === 'all equal' ? 1 : 1 + 9 * rand(),
    position: wrap01(centres[i % 2] + (rand() - 0.5) * 0.25),
  }));
}

const rmsDeg = (items, c) => 360 * Math.sqrt(c / items.reduce((s, it) => s + (it.weight ?? 1), 0));
const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);

console.log(`necklace solver check: ${trials} instances per row, seed ${process.argv[4] ?? 1}; overflowing instances skipped`);
for (const cyclic of [true, false]) {
  for (const variant of ['unequal widths and weights', 'equal widths', 'equal weights', 'all equal']) {
    console.log(`\n${cyclic ? 'closed ring' : 'open curve'}, ${variant}`);
    console.log('  n  used  overlap  cap binds  impl vs exact (max rel.)  reordering helps  extra RMS disp. deg (median / max)');
    for (let n = 3; n <= maxN; n++) {
      let used = 0, overlap = 0, binds = 0, implWorse = 0, implGap = 0, helps = 0;
      const extra = [];
      for (let t = 0; t < trials; t++) {
        const items = instance(n, variant);
        const impl = placeNecklace(items, { cyclic });
        if (impl.overflow) continue;
        used++;
        // Unwrapped implementation positions, for the open curve's linear metric.
        const xs = impl.placements.map((p, i) => (cyclic ? p.position : items[i].position + p.displacement));
        if (overlaps(items, xs, cyclic)) overlap++;
        const implCost = cost(items, xs, cyclic);
        const a = orderPreserving(items, cyclic);
        if (a.binds) binds++;
        if (implCost > a.cost * (1 + 1e-6) + 1e-12) {
          implWorse++;
          implGap = Math.max(implGap, (implCost - a.cost) / a.cost);
        }
        const b = unconstrained(items, cyclic);
        if (a.cost > b.cost * (1 + 1e-6) + 1e-12) {
          helps++;
          extra.push(rmsDeg(items, a.cost) - rmsDeg(items, b.cost));
        }
      }
      console.log(
        `  ${n}  ${String(used).padStart(4)}  ${String(overlap).padStart(7)}  ${String(binds).padStart(9)}  ` +
          `${String(implWorse).padStart(6)} (${(100 * implGap).toFixed(2)} %)`.padEnd(26) +
          `${String(helps).padStart(6)} (${((100 * helps) / Math.max(used, 1)).toFixed(0)} %)`.padEnd(18) +
          `${median(extra).toFixed(1)} / ${(extra.length ? Math.max(...extra) : 0).toFixed(1)}`,
      );
    }
  }
}

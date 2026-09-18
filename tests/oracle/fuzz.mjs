/**
 * Randomised comparison against CartoCrow, so the claims are statistical rather
 * than anecdotal. Needs the oracle binary (see README.md).
 *
 *   node tests/oracle/fuzz.mjs [instances] [path/to/oracle]
 */

import { execFileSync } from 'node:child_process';
import { runOurs, validity, cost, ourMaxScale } from './model.mjs';

const TAU = Math.PI * 2;
const COUNT = Number(process.argv[2] ?? 200);
const ORACLE = process.argv[3] ?? new URL('./oracle', import.meta.url).pathname;

// Fixed seed: the same 200 instances every run.
let seed = 20260918;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

function runOracle(sc, { order = 0, aversion = 0.5 }, scale = 'auto') {
  const input = [
    `${sc.R} ${sc.buffer ?? 0} ${order} 30 ${aversion} 10 5 ${sc.beads.length}`,
    ...sc.beads.map((b) => `${b.r} ${b.from} ${b.to}`),
  ].join('\n');
  const parsed = JSON.parse(execFileSync(ORACLE, [String(scale)], { input: input + '\n' }).toString());
  return { ...parsed, angles: parsed.beads.map((b) => b.angle_rad) };
}

const rows = [];
for (let t = 0; t < COUNT; t++) {
  const n = 2 + Math.floor(rnd() * 15);
  const beads = Array.from({ length: n }, () => {
    const centre = rnd() * TAU;
    const len = 0.2 + rnd() * 2.5;
    return {
      r: 2 + rnd() * 20,
      from: ((centre - len / 2) % TAU + TAU) % TAU,
      to: ((centre + len / 2) % TAU + TAU) % TAU,
    };
  });
  const sc = { R: 100, beads };

  const fixed = runOracle(sc, { order: 0 });
  const any = runOracle(sc, { order: 1 });
  const ours = ourMaxScale(sc);

  const reference = any.optimal_scale > 1e-6 ? any.optimal_scale : fixed.optimal_scale;
  const common = Math.min(reference, ours) * 0.98;
  let head = null;
  if (common > 1e-6) {
    const theirs = runOracle(sc, { order: 1, aversion: 0.01 }, common).angles;
    // Same containment rule on both sides, or the cost comparison is not
    // like for like: CartoCrow asks only that the bead centre is in the arc.
    const mine = runOurs(sc, common, { centreSemantics: true });
    head = {
      theirCost: cost(sc, theirs), ourCost: cost(sc, mine.angles),
      theirV: validity(sc, common, theirs), ourV: validity(sc, common, mine.angles),
      sc,
    };
  }

  rows.push({
    n,
    scaleFixed: fixed.optimal_scale,
    scaleAny: any.optimal_scale,
    ours,
    fixedSelf: validity(sc, fixed.optimal_scale, fixed.angles),
    anySelf: validity(sc, any.optimal_scale, any.angles),
    head,
  });
}

const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const pct = (a, b) => `${a}/${b} (${((100 * a) / b).toFixed(1)}%)`;
const bad = (v) => v.chordOverlap > 1e-6 || v.outsideInterval > 1e-3 || v.saturated;

console.log(`${rows.length} random instances, 2..16 beads, random radii and arcs, R = 100\n`);
const fixedOverlap = rows.filter((r) => r.fixedSelf.chordOverlap > 1e-6);
const anyOverlap = rows.filter((r) => r.anySelf.chordOverlap > 1e-6);
console.log('CartoCrow beads overlap at its own optimal scale:');
console.log(`  fixed order ${pct(fixedOverlap.length, rows.length)}  median depth ${(q(fixedOverlap.map((r) => r.fixedSelf.chordOverlap), 0.5) ?? 0).toFixed(2)} world units`);
console.log(`  any order   ${pct(anyOverlap.length, rows.length)}`);

// Only instances where CartoCrow actually achieves its any-order scale are a
// fair ceiling to measure ourselves against.
const achievable = rows.filter((r) => r.scaleAny > 1e-6 && !bad(r.anySelf));
const ratios = achievable.map((r) => r.ours / r.scaleAny);
console.log(`\nlargest scale we reach, over CartoCrow's any-order scale (${achievable.length} instances where it is achieved):`);
console.log(`  min ${q(ratios, 0).toFixed(3)}  p10 ${q(ratios, 0.1).toFixed(3)}  median ${q(ratios, 0.5).toFixed(3)}  p90 ${q(ratios, 0.9).toFixed(3)}`);
console.log(`  within 5%: ${pct(ratios.filter((x) => x >= 0.95).length, ratios.length)}`);

const hh = rows.filter((r) => r.head);
const ourBetter = hh.filter((r) => r.head.ourCost <= r.head.theirCost + 1e-9);
const costRatio = hh.filter((r) => r.head.theirCost > 1e-9).map((r) => r.head.ourCost / r.head.theirCost);
console.log('\nhead to head at a commonly feasible scale:');
console.log(`  our placement breaks a constraint:   ${pct(hh.filter((r) => bad(r.head.ourV)).length, hh.length)}`);
console.log(`  their placement breaks a constraint: ${pct(hh.filter((r) => bad(r.head.theirV)).length, hh.length)}`);
console.log(`  our displacement cost <= theirs: ${pct(ourBetter.length, hh.length)}`);
console.log(`  cost ratio ours/theirs: median ${q(costRatio, 0.5).toFixed(3)}  p90 ${q(costRatio, 0.9).toFixed(3)}`);
console.log(`  our worst arc overrun: ${q(hh.map((r) => r.head.ourV.outsideInterval), 0.999).toExponential(2)} rad`);

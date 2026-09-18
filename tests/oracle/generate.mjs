/**
 * Runs both engines over `scenarios.mjs` and writes `fixture.json`.
 *
 * Needs the CartoCrow oracle binary (see README.md); everything downstream —
 * `necklace-oracle.test.mjs` — reads the captured fixture instead, so CI never
 * needs CGAL.
 *
 *   node tests/oracle/generate.mjs [path/to/oracle]
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { scenarios } from './scenarios.mjs';
import { runOurs, validity, cost, ourMaxScale, ourMaxScale as _m, angleDelta } from './model.mjs';

const ORACLE = process.argv[2] ?? new URL('./oracle', import.meta.url).pathname;
const AVERSION = 0.01; // attraction-dominant: closest CartoCrow gets to our objective

/** One run of CartoCrow. `order` 0 = fixed, 1 = any; `scale` a number or 'auto'. */
function runOracle(scenario, { order = 0, aversion = 0.5, cycles = 30 } = {}, scale = 'auto') {
  const { R, buffer = 0, beads } = scenario;
  const input = [
    `${R} ${buffer} ${order} ${cycles} ${aversion} 10 5 ${beads.length}`,
    ...beads.map((b) => `${b.r} ${b.from} ${b.to}`),
  ].join('\n');
  const out = execFileSync(ORACLE, [String(scale)], { input: input + '\n' });
  const parsed = JSON.parse(out.toString());
  return { ...parsed, angles: parsed.beads.map((b) => b.angle_rad) };
}

const out = {
  generated: new Date().toISOString().slice(0, 10),
  source: {
    repo: 'https://github.com/tue-alga/cartocrow',
    commit: execFileSync('git', ['-C', process.env.CARTOCROW ?? '.', 'rev-parse', 'HEAD'])
      .toString().trim(),
    note: 'necklace_map module; removed from CartoCrow master in de6b90c (2026-04-13)',
  },
  aversion: AVERSION,
  scenarios: {},
};

for (const [name, sc] of Object.entries(scenarios)) {
  const fixed = runOracle(sc, { order: 0 }).optimal_scale;
  const any = runOracle(sc, { order: 1 }).optimal_scale;
  const ours = ourMaxScale(sc);
  const oursCentre = ourMaxScale(sc, { centreSemantics: true });

  // Does CartoCrow's own placement obey CartoCrow's own rules at the scale
  // CartoCrow itself computed?
  const selfFixed = runOracle(sc, { order: 0, aversion: 0.5 });
  const selfAny = runOracle(sc, { order: 1, aversion: 0.5 });

  // Head to head at a scale both engines accept.
  const reference = any > 1e-6 ? any : fixed;
  const common = Math.min(reference, ours) * 0.98;
  const theirs = common > 1e-9 ? runOracle(sc, { order: 1, aversion: AVERSION }, common).angles : null;
  const mine = common > 1e-9 ? runOurs(sc, common) : null;

  out.scenarios[name] = {
    note: sc.note,
    R: sc.R,
    buffer: sc.buffer ?? 0,
    beads: sc.beads,
    scale: { cartocrowFixedOrder: fixed, cartocrowAnyOrder: any, ours, oursCentreSemantics: oursCentre },
    cartocrowSelfValidity: {
      fixedOrder: { scale: fixed, angles: selfFixed.angles, ...validity(sc, fixed, selfFixed.angles) },
      anyOrder: { scale: any, angles: selfAny.angles, ...validity(sc, any, selfAny.angles) },
    },
    headToHead: common > 1e-9 ? {
      scale: common,
      cartocrow: { angles: theirs, cost: cost(sc, theirs), ...validity(sc, common, theirs) },
      ours: { angles: mine.angles, cost: cost(sc, mine.angles), ...validity(sc, common, mine.angles) },
      maxAngleDiff: Math.max(...theirs.map((a, i) => angleDelta(a, mine.angles[i]))),
    } : null,
  };
}

writeFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');

const f = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : String(x));
console.log('\n=== largest scale factor each engine reaches ===');
console.log('scenario            cc:fixed   cc:any      ours  ours(centre)');
for (const [name, r] of Object.entries(out.scenarios)) {
  const s = r.scale;
  console.log(name.padEnd(20), f(s.cartocrowFixedOrder).padStart(8), f(s.cartocrowAnyOrder).padStart(8),
    f(s.ours).padStart(9), f(s.oursCentreSemantics).padStart(13));
}
console.log('\n=== CartoCrow at its own optimal scale: do its own beads overlap? (world units, R = 100) ===');
console.log('scenario            fixed-order  any-order');
for (const [name, r] of Object.entries(out.scenarios)) {
  console.log(name.padEnd(20), f(r.cartocrowSelfValidity.fixedOrder.chordOverlap, 3).padStart(11),
    f(r.cartocrowSelfValidity.anyOrder.chordOverlap, 3).padStart(10));
}
console.log(`\n=== head to head at a commonly feasible scale (aversion ${AVERSION}) ===`);
console.log('scenario              scale  cost:cc  cost:ours  maxAngleDiff');
for (const [name, r] of Object.entries(out.scenarios)) {
  const h = r.headToHead;
  if (!h) { console.log(name.padEnd(20), '  (no commonly feasible scale)'); continue; }
  console.log(name.padEnd(20), f(h.scale, 3).padStart(6), f(h.cartocrow.cost, 4).padStart(8),
    f(h.ours.cost, 4).padStart(9), f(h.maxAngleDiff, 4).padStart(13));
}

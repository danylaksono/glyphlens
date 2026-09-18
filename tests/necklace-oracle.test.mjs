/**
 * Our necklace engine against CartoCrow's, on captured output.
 *
 * CartoCrow (TU Eindhoven) is the reference implementation of Speckmann &
 * Verbeek's necklace maps and the only one we can check ourselves against. It is
 * C++ on CGAL, so it cannot run here: `tests/oracle/generate.mjs` runs it and
 * records what it produced in `fixture.json`, and this file replays our engine
 * over the same problems. See `tests/oracle/README.md` to rebuild the fixture.
 *
 * The two engines do not solve the same problem — CartoCrow maximises symbol
 * size then relaxes an attraction/repulsion force, we minimise displacement at a
 * size the caller picks — so what is compared here is what both must answer:
 * how large the symbols can get, whether the result obeys the constraints, and
 * how far each symbol ends up from where it wanted to be.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { runOurs, validity, cost, ourMaxScale, arcSpan } from './oracle/model.mjs';

const fixture = JSON.parse(readFileSync(new URL('./oracle/fixture.json', import.meta.url)));
const cases = Object.entries(fixture.scenarios);
const problem = (s) => ({ R: s.R, beads: s.beads, buffer: s.buffer });

test('oracle fixture covers the scenarios the comparison turned on', () => {
  assert.ok(cases.length >= 12, `only ${cases.length} scenarios in the fixture`);
  // Arcs that straddle the seam at t = 0 are what the lifting bug hid in.
  const straddles = cases.filter(([, s]) =>
    s.beads.some((b) => b.from > b.to && arcSpan(b) < Math.PI * 2 - 1e-9));
  assert.ok(straddles.length >= 2, 'no scenario exercises an arc across the seam');
});

for (const [name, s] of cases) {
  const sc = problem(s);

  test(`${name}: our placement obeys the constraints where CartoCrow's does`, () => {
    const h = s.headToHead;
    if (!h) return; // no scale both engines accept
    // CartoCrow sizes symbols up to where only their *centres* still fit in the
    // arcs; our default rule — the whole symbol inside — is then infeasible by
    // construction, and `violation` says so rather than returning a silent best
    // effort. Compare under CartoCrow's rule.
    const ours = runOurs(sc, h.scale, { centreSemantics: true });
    assert.ok(ours.violation < 1e-6, `engine reports violation ${ours.violation}`);
    // Checked again from the angles alone, independently of what the engine says.
    const v = validity(sc, h.scale, ours.angles);
    assert.ok(v.wedgeOverlap <= 1e-9, `symbols overlap by ${v.wedgeOverlap} rad`);
    assert.ok(v.outsideInterval <= 1e-3, `symbol outside its arc by ${v.outsideInterval} rad`);
  });

  test(`${name}: a reported violation of zero means the geometry really is sound`, () => {
    const h = s.headToHead;
    if (!h) return;
    // Feasibility is joint, not per symbol: arcs can each be wide enough on
    // their own and still not hold their symbols together. So the claim is one
    // directional — `violation` of zero has to mean a placement that survives an
    // independent geometric check, and an arc too narrow for its own symbol has
    // to be reported however the rest of the layout works out.
    for (const fraction of [0.25, 0.5, 0.75, 1]) {
      const scale = h.scale * fraction;
      const ours = runOurs(sc, scale); // strict rule: whole symbol inside its arc
      const tooNarrow = s.beads.some(
        (b, i) => arcSpan(b) / 2 < ours.items[i].halfWidth * Math.PI * 2 - 1e-12,
      );
      if (tooNarrow) {
        assert.ok(ours.violation > 0, `arc narrower than its symbol at ${fraction}x, violation 0`);
      }
      if (ours.violation < 1e-6) {
        const v = validity(sc, scale, ours.angles);
        assert.ok(v.wedgeOverlap <= 1e-9, `violation 0 but symbols overlap by ${v.wedgeOverlap}`);
        assert.ok(v.outsideInterval <= 1e-3, `violation 0 but a symbol is ${v.outsideInterval} outside`);
      }
    }
  });

  test(`${name}: we size symbols at least as large as CartoCrow's any-order optimum`, () => {
    const ccAny = s.scale.cartocrowAnyOrder;
    if (ccAny <= 1e-6) return; // CartoCrow returns 0 here; nothing to match
    // Same containment rule on both sides: CartoCrow asks only that the bead
    // centre is inside the arc, we keep the whole symbol inside by default.
    const ours = ourMaxScale(sc, { centreSemantics: true });
    assert.ok(ours >= ccAny * 0.99, `ours ${ours.toFixed(4)} vs CartoCrow ${ccAny.toFixed(4)}`);
  });

  test(`${name}: our symbols land no further from their targets than CartoCrow's`, () => {
    const h = s.headToHead;
    if (!h) return;
    const ours = runOurs(sc, h.scale, { centreSemantics: true });
    const ourCost = cost(sc, ours.angles);
    // 1.2x rather than 1x: interval handling is projection, so on a tight
    // instance we can settle slightly worse than CartoCrow's force relaxation.
    // Measured worst case across the fixture is 1.11x (unequal-spread).
    assert.ok(
      ourCost <= h.cartocrow.cost * 1.2 + 1e-9,
      `ours ${ourCost.toFixed(4)} rad^2 vs CartoCrow ${h.cartocrow.cost.toFixed(4)} rad^2`,
    );
  });

  test(`${name}: we do not reproduce CartoCrow's fixed-order over-scaling`, () => {
    const overlap = s.cartocrowSelfValidity.fixedOrder.chordOverlap;
    if (overlap <= 1e-6) return; // nothing wrong with it here
    // CartoCrow's fixed-order scale factor puts beads at a size at which its own
    // placement has them intersecting. Ours must stay below that size.
    const ours = ourMaxScale(sc, { centreSemantics: true });
    assert.ok(
      ours < s.scale.cartocrowFixedOrder,
      `ours ${ours.toFixed(4)} is not below the over-scaled ${s.scale.cartocrowFixedOrder.toFixed(4)}`,
    );
  });
}

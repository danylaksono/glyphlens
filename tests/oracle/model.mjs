/**
 * The bridge between CartoCrow's necklace-map model and ours.
 *
 * CartoCrow works in world units on a circle: a necklace of radius `R`, beads of
 * base radius `r_i` scaled by a factor `s`, feasible arcs `[from, to]` in
 * radians counter-clockwise. Our engine works in a cyclic parameter `t` in
 * [0, 1) and knows nothing about circles, so every comparison has to cross this
 * boundary:
 *
 *   t          = angle / 2pi
 *   halfWidth  = asin(s * r_i / R) / 2pi
 *   position   = midpoint of the feasible arc
 *
 * `asin(r/R)` is the *covering radius* — the half-angle of the wedge from the
 * necklace centre that the bead fills. It is the same quantity CartoCrow's own
 * scale-factor step uses, and it is separable, which is what our solver needs:
 * two beads clear each other when their angular gap is at least `c_i + c_j`.
 *
 * CartoCrow's *placement* step instead uses the exact chord criterion, a gap of
 * `2 asin((r_i + r_j) / 2R)`. Since asin is convex, `c_i + c_j` is never
 * smaller, so our model is the conservative one; the two coincide exactly when
 * the beads are the same size. Both measures are reported by `validity` so the
 * difference stays visible rather than hidden in a tolerance.
 *
 * The bead centre is the attraction target on both sides: CartoCrow pulls
 * towards `feasible.midpoint()`, we take the arc midpoint as `position`.
 */

import { placeNecklace } from '../../src/core/necklace.js';

export const TAU = Math.PI * 2;
export const wrapAngle = (a) => ((a % TAU) + TAU) % TAU;

/** Smallest absolute angular difference, in radians. */
export const angleDelta = (a, b) => {
  const d = Math.abs(wrapAngle(a) - wrapAngle(b));
  return Math.min(d, TAU - d);
};

/** Length of a feasible arc in radians, treating a closed arc as the full circle. */
export const arcSpan = (bead) => wrapAngle(bead.to - bead.from) || TAU;

/** The arc midpoint, which is what both engines pull a symbol towards. */
export const arcMidpoint = (bead) => wrapAngle(bead.from + arcSpan(bead) / 2);

/**
 * Our engine on a CartoCrow problem, at a given scale factor.
 *
 * `centreSemantics` widens each arc by a half-width on both sides, which turns
 * our rule (the whole symbol inside the arc) into CartoCrow's (the bead centre
 * inside the arc). Use it when comparing how *large* symbols can get; leave it
 * off when checking what our engine actually guarantees.
 */
export function runOurs(scenario, scale, { centreSemantics = false } = {}) {
  const { R, beads, buffer = 0 } = scenario;
  const items = beads.map((b, i) => {
    const span = arcSpan(b);
    const item = {
      id: i,
      position: arcMidpoint(b) / TAU,
      // CartoCrow's buffer_rad is a required extra gap between neighbours; our
      // engine has no buffer, so half of it goes into each half-width.
      halfWidth: (Math.asin(Math.min(1, (scale * b.r) / R)) + buffer / 2) / TAU,
      weight: 1,
    };
    if (span < TAU - 1e-9) {
      const pad = centreSemantics ? item.halfWidth * TAU : 0;
      if (span + 2 * pad < TAU - 1e-9) {
        item.interval = [wrapAngle(b.from - pad) / TAU, wrapAngle(b.to + pad) / TAU];
      }
    }
    return item;
  });
  const result = placeNecklace(items);
  const angles = new Array(beads.length);
  for (const p of result.placements) angles[p.id] = wrapAngle(p.position * TAU);
  return { ...result, angles, items };
}

/**
 * How badly a placement breaks the rules, in both non-overlap models.
 *
 * `chordOverlap` is in world units (how deep the discs actually intersect),
 * `wedgeOverlap` and `outsideInterval` in radians. Zero everywhere is valid.
 * `saturated` flags beads at least as large as the necklace itself, where the
 * covering-angle model stops being defined and every measure here lies.
 */
export function validity(scenario, scale, angles, { buffer = scenario.buffer ?? 0 } = {}) {
  const { R, beads } = scenario;
  const n = beads.length;
  const order = angles.map((a, i) => ({ a: wrapAngle(a), i })).sort((x, y) => x.a - y.a);

  let chordOverlap = 0;
  let wedgeOverlap = 0;
  for (let k = 0; n > 1 && k < n; k++) {
    const A = order[k];
    const B = order[(k + 1) % n];
    const gap = wrapAngle(B.a - A.a);
    const rA = scale * beads[A.i].r;
    const rB = scale * beads[B.i].r;
    chordOverlap = Math.max(chordOverlap, rA + rB - 2 * R * Math.sin(gap / 2));
    const needed = Math.asin(Math.min(1, rA / R)) + Math.asin(Math.min(1, rB / R)) + buffer;
    wedgeOverlap = Math.max(wedgeOverlap, needed - gap);
  }

  let outsideInterval = 0;
  for (let i = 0; i < n; i++) {
    const span = arcSpan(beads[i]);
    if (span >= TAU - 1e-9) continue;
    const rel = wrapAngle(angles[i] - beads[i].from);
    if (rel > span) outsideInterval = Math.max(outsideInterval, Math.min(rel - span, TAU - rel));
  }

  return {
    chordOverlap,
    wedgeOverlap,
    outsideInterval,
    saturated: beads.some((b) => scale * b.r >= R),
  };
}

/** Sum of squared angular displacement from the arc midpoint, in rad^2. */
export function cost(scenario, angles) {
  return scenario.beads.reduce((total, b, i) => {
    const d = angleDelta(angles[i], arcMidpoint(b));
    return total + d * d;
  }, 0);
}

/**
 * Largest scale at which our engine still returns a placement that obeys the rules.
 *
 * `slack` is what an arc may be overrun by and still count as inside it. It is
 * not cosmetic: interval handling is alternating projection with a fixed pass
 * budget, so a symbol settles just outside its arc by a residual that shrinks
 * with `intervalPasses`. 1e-3 rad is 0.06 degrees — below a pixel at any lens
 * size — and the residual itself is reported by `validity` as `outsideInterval`.
 */
export function ourMaxScale(
  scenario,
  { model = 'wedge', hi = 64, tol = 1e-5, centreSemantics = false, slack = 1e-3 } = {},
) {
  const ok = (s) => {
    if (s <= 0) return true;
    const { angles } = runOurs(scenario, s, { centreSemantics });
    const v = validity(scenario, s, angles);
    if (v.saturated) return false;
    const overlap = model === 'chord' ? v.chordOverlap / scenario.R : v.wedgeOverlap;
    return overlap <= 1e-7 && v.outsideInterval <= slack;
  };
  if (ok(hi)) return hi;
  let lo = 0;
  while (hi - lo > tol) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

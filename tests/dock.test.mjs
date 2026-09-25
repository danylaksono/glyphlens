/**
 * The docked strip: the lens's chart, off the map (docs/findings.md F-37).
 *
 * The property everything here protects is that a docked strip's context and
 * scale belong to the instrument and not to the position. A strip whose scale
 * followed the lens would look fine in any single screenshot and be unreadable
 * in motion, which is the only way it is used.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { computeLens } from '../src/core/layout.js';
import {
  studyArea, expectedValues, wholeValues, dockDomain, niceCeil,
} from '../src/core/dock.js';
import { DockRenderer } from '../src/render/DockRenderer.js';
import { LensRenderer } from '../src/render/LensRenderer.js';

const ORIGIN = [110.3695, -7.7956];
const CATS = ['food', 'retail', 'civic'];

// A uniform grid, so "expected if uniform" has a known answer: roughly 4 km
// square, 3,600 places, the three categories evenly mixed everywhere.
const GRID = [];
for (let i = 0; i < 60; i++) {
  for (let j = 0; j < 60; j++) {
    GRID.push({
      lng: ORIGIN[0] - 0.018 + i * 0.0006,
      lat: ORIGIN[1] - 0.018 + j * 0.0006,
      category: CATS[(i + j) % 3],
    });
  }
}

const getPosition = (f) => [f.lng, f.lat];
const category = (f) => f.category;

const config = (over = {}) => ({
  center: [...ORIGIN],
  selection: { type: 'disc', radius: 800 },
  data: GRID,
  getPosition,
  binning: { mode: 'categorical', category, categories: CATS },
  normalisation: { mode: 'count' },
  marks: { type: 'bar' },
  ring: { radius: 150 },
  ...over,
});

const study = studyArea({ data: GRID, getPosition, category });

test('the study area is the data hull, with its members counted by category', () => {
  assert.equal(study.count, GRID.length);
  assert.deepEqual(Object.keys(study.byCategory).sort(), [...CATS].sort());
  assert.equal(Object.values(study.byCategory).reduce((a, b) => a + b, 0), GRID.length);
  // 59 grid steps of ~66 m a side: about 3.9 km square.
  assert.ok(study.areaKm2 > 14 && study.areaKm2 < 16.5, `area ${study.areaKm2}`);
});

test('on uniform data, a lens reads what the null model expects', () => {
  const layout = computeLens(config());
  const expected = expectedValues(layout, study);
  for (const b of layout.bins) {
    const e = expected.get(b.key);
    assert.ok(Math.abs(b.value - e) / e < 0.12, `${b.key}: ${b.value} vs expected ${e}`);
  }
});

test('the expectation depends on the lens size, never its position', () => {
  const here = expectedValues(computeLens(config()), study);
  const there = expectedValues(computeLens(config({ center: [ORIGIN[0] + 0.01, ORIGIN[1]] })), study);
  assert.deepEqual([...here], [...there]);

  const bigger = expectedValues(computeLens(config({ selection: { type: 'disc', radius: 1600 } })), study);
  for (const [k, v] of here) assert.ok(Math.abs(bigger.get(k) / v - 4) < 1e-9, 'scales with area');
});

test('each normalisation gets the expectation it can be compared with', () => {
  const share = expectedValues(computeLens(config({ normalisation: { mode: 'share' } })), study);
  assert.ok(Math.abs([...share.values()].reduce((a, b) => a + b, 0) - 1) < 1e-9);

  const lq = expectedValues(computeLens(config({ normalisation: { mode: 'lq' } })), study);
  assert.ok([...lq.values()].every((v) => v === 1));

  const density = expectedValues(computeLens(config({ normalisation: { mode: 'density' } })), study);
  const total = [...density.values()].reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - GRID.length / study.areaKm2) < 1e-6);

  // A sector is its share of the lens, so 8 sectors expect an eighth each.
  const sectors = computeLens(config({ binning: { mode: 'angular', bins: 8 } }));
  const whole = expectedValues(computeLens(config({ binning: { mode: 'categorical' } })), study);
  const perSector = [...expectedValues(sectors, study).values()];
  const lensTotal = [...whole.values()].reduce((a, b) => a + b, 0);
  for (const v of perSector) assert.ok(Math.abs(v - lensTotal / 8) < 1e-6);

  assert.equal(expectedValues(computeLens(config({ normalisation: { mode: 'z' } })), study), null);
});

test('only a count of categories has a whole to be part of', () => {
  const counts = wholeValues(computeLens(config()), study);
  assert.deepEqual(Object.fromEntries(counts), study.byCategory);
  assert.equal(wholeValues(computeLens(config({ normalisation: { mode: 'share' } })), study), null);
  assert.equal(wholeValues(computeLens(config({ binning: { mode: 'angular', bins: 8 } })), study), null);
});

test('the scale is the same wherever the lens is', () => {
  const a = dockDomain(config(), study);
  const b = dockDomain(config({ center: [ORIGIN[0] + 0.012, ORIGIN[1] - 0.006] }), study);
  assert.deepEqual(a, b);
  assert.ok(a.samples > 5);
  assert.equal(a.bound, 'samples');
  // On uniform data the reachable range sits just above the expectation.
  const expected = Math.max(...expectedValues(computeLens(config()), study).values());
  assert.ok(a.max >= expected && a.max <= expected * 3, `${a.max} vs ${expected}`);
});

test('the scale follows the instrument: a bigger lens gets a bigger count scale', () => {
  const small = dockDomain(config({ selection: { type: 'disc', radius: 500 } }), study);
  const large = dockDomain(config({ selection: { type: 'disc', radius: 1500 } }), study);
  assert.ok(large.max > small.max);
});

test('a floor the scale must include is honoured, and says it set the scale', () => {
  const whole = wholeValues(computeLens(config()), study);
  const d = dockDomain(config(), study, { floor: whole });
  assert.ok(d.max >= Math.max(...whole.values()));
  assert.equal(d.bound, 'context');
});

test('a drawn shape is sampled as itself, moved about', () => {
  const ring = [
    [ORIGIN[0] - 0.005, ORIGIN[1] - 0.004], [ORIGIN[0] + 0.006, ORIGIN[1] - 0.003],
    [ORIGIN[0] + 0.002, ORIGIN[1] + 0.006], [ORIGIN[0] - 0.005, ORIGIN[1] - 0.004],
  ];
  const d = dockDomain(config({ center: undefined, selection: { type: 'polygon', rings: [ring] } }), study);
  assert.ok(d.samples > 5 && d.max > 0);
});

test('niceCeil lands on round numbers', () => {
  assert.equal(niceCeil(0.7), 1);
  assert.equal(niceCeil(1.6), 2);
  assert.equal(niceCeil(2.2), 2.5);
  assert.equal(niceCeil(68), 100);
  assert.equal(niceCeil(250), 250);
  assert.equal(niceCeil(0), 1);
});

// --------------------------------------------------------------- rendering

function recorder() {
  const calls = [];
  const ctx = {
    calls, canvas: { width: 800, height: 600 },
    measureText: (t) => ({ width: String(t).length * 6 }), setTransform() {},
  };
  for (const prop of ['strokeStyle', 'fillStyle', 'globalAlpha', 'lineWidth', 'font', 'textAlign', 'textBaseline']) {
    let value;
    Object.defineProperty(ctx, prop, { get: () => value, set: (v) => { value = v; } });
  }
  for (const name of ['save', 'restore', 'beginPath', 'closePath', 'fill', 'stroke', 'clip',
    'setLineDash', 'clearRect', 'rect', 'fillText', 'arc', 'moveTo', 'lineTo',
    'fillRect', 'strokeRect', 'translate', 'rotate']) {
    ctx[name] = (...args) => calls.push([name, ...args]);
  }
  return ctx;
}

const FRAME = { width: 600, height: 160, domain: 100, categories: CATS };
const bar = (over) => ({
  key: 'a', label: 'a', category: 'food', t: 0.25, halfWidth: 0.02, value: 40, unit: 'count', ...over,
});

test('in category order the strip reads as a sorted legend', () => {
  const layout = computeLens(config({ placement: { mode: 'block' } }));
  const ctx = recorder();
  // Holding t = 0.5 cuts the strip at t = 0, where the first slot begins.
  new DockRenderer().draw(ctx, layout, { ...FRAME, at: 0.5 });
  const labels = ctx.calls.filter(([n, text]) => n === 'fillText' && CATS.includes(text));
  const order = labels.sort((p, q) => p[2] - q[2]).map(([, text]) => text);
  assert.deepEqual(order, CATS);
});

test('a mark straddling the seam is drawn at both ends', () => {
  const ctx = recorder();
  const layout = { bins: [bar({ t: 0.001 })], scale: { neutral: 0 } };
  new DockRenderer().draw(ctx, layout, { ...FRAME, at: 0.5 });
  const fills = ctx.calls.filter(([n]) => n === 'fillRect');
  assert.equal(fills.length, 2);
  const xs = fills.map(([, x]) => x).sort((p, q) => p - q);
  assert.ok(xs[1] - xs[0] > 400, 'one copy at each end');
});

test('a reading above the scale is clipped to it', () => {
  const ctx = recorder();
  new DockRenderer().draw(ctx, { bins: [bar({ value: 250 })], scale: { neutral: 0 } }, FRAME);
  const [, , top] = ctx.calls.find(([n]) => n === 'fillRect');
  assert.equal(top, 18, 'bar stops at the top of the plot');
});

test('context is drawn behind the mark, and a model is dashed where data is not', () => {
  const dashesFor = (contextKind) => {
    const ctx = recorder();
    new DockRenderer().draw(ctx, { bins: [bar()], scale: { neutral: 0 } }, {
      ...FRAME, context: new Map([['a', 60]]), contextKind,
    });
    const i = ctx.calls.findIndex(([n]) => n === 'strokeRect');
    assert.ok(i >= 0, 'context outline drawn');
    return ctx.calls.slice(0, i).filter(([n, d]) => n === 'setLineDash' && d.length).length;
  };
  assert.ok(dashesFor('expected') > dashesFor('whole'));
});

test('hit testing finds the mark under the pointer', () => {
  const layout = { bins: [bar({ key: 'a', t: 0.25 }), bar({ key: 'b', t: 0.75 })], scale: { neutral: 0 } };
  const r = new DockRenderer();
  // at = 0.5: t maps straight onto the strip, between the 40 px gutter and the
  // 12 px right margin.
  const frame = { ...FRAME, at: 0.5 };
  const x = (t) => 40 + t * (600 - 40 - 12);
  assert.equal(r.hitTest(layout, frame, x(0.25), 100)?.key, 'a');
  assert.equal(r.hitTest(layout, frame, x(0.75), 100)?.key, 'b');
  assert.equal(r.hitTest(layout, frame, x(0.5), 100), null);
});

test('a brush-only lens draws its selection and nothing of its chart', () => {
  const layout = computeLens(config());
  const renderer = new LensRenderer({ showChart: false });
  const ctx = recorder();
  const frame = { cx: 300, cy: 300, selectionRadiusPx: 120 };
  renderer.draw(ctx, layout, frame);
  assert.equal(ctx.calls.filter(([n]) => n === 'fillText').length, 0, 'no labels or compass');
  assert.ok(ctx.calls.some(([n, , , r]) => n === 'arc' && r === 120), 'selection boundary');
  assert.equal(renderer.hitTest(layout, frame, 300, 140), null);
});

test('a focused bin shows its own members and no others', () => {
  const layout = computeLens(config({ selection: { type: 'disc', radius: 400 } }));
  const renderer = new LensRenderer({ maxInclusions: 1e6 });
  const dots = (focus) => {
    const ctx = recorder();
    renderer.draw(ctx, layout, { cx: 300, cy: 300, selectionRadiusPx: 120, focus });
    return ctx.calls.filter(([n, , , r]) => n === 'arc' && r === renderer.style.inclusionSize).length;
  };
  const retail = layout.bins.find((b) => b.key === 'retail');
  assert.equal(dots(null), 0, 'nothing without a focus');
  assert.equal(dots('retail'), retail.count);
});

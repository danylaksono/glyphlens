import test from 'node:test';
import assert from 'node:assert/strict';

import { arealSelect, aggregate } from '../src/core/areal.js';
import { binUnits } from '../src/core/binning.js';
import { computeLens } from '../src/core/layout.js';

/** A square unit of `sideM` metres with its south-west corner at `origin`. */
function squareUnit(origin, sideM, attrs) {
  const [lng, lat] = origin;
  const dLat = sideM / 111320;
  const dLng = sideM / (111320 * Math.cos((lat * Math.PI) / 180));
  return {
    ...attrs,
    rings: [[
      [lng, lat], [lng + dLng, lat], [lng + dLng, lat + dLat],
      [lng, lat + dLat], [lng, lat],
    ]],
  };
}

const CENTRE = [0, 0];

// ------------------------------------------------------------- selection

test('arealSelect annotates weight, anchor and angular interval', () => {
  const unit = squareUnit([0.01, 0.01], 1000, { code: 'A', pop: 500 });
  const { items } = arealSelect([unit], { type: 'disc', center: CENTRE, radius: 5000 });
  assert.equal(items.length, 1);
  const it = items[0];
  assert.equal(it.weight, 1);
  assert.ok(it.unitAreaKm2 > 0.9 && it.unitAreaKm2 < 1.1, `area ${it.unitAreaKm2}`);
  assert.ok(Array.isArray(it.interval), 'a unit off to one side subtends an arc');
  assert.ok(it.bearing > 0 && it.bearing < 90, 'north-east of the centre');
});

test('a unit containing the lens centre gets no interval', () => {
  const unit = squareUnit([-0.01, -0.01], 2000, { code: 'A' });
  const { items } = arealSelect([unit], { type: 'disc', center: CENTRE, radius: 5000 });
  assert.equal(items[0].interval, null,
    'it subtends every direction, so nothing constrains it');
});

test('centroid weighting is all or nothing', () => {
  const inside = squareUnit([0.001, 0.001], 500, { code: 'in' });
  const outside = squareUnit([0.5, 0.5], 500, { code: 'out' });
  const { items } = arealSelect([inside, outside],
    { type: 'disc', center: CENTRE, radius: 2000 });
  assert.equal(items.length, 1);
  assert.equal(items[0].feature.code, 'in');
  assert.equal(items[0].weight, 1);
});

test('area weighting gives a straddling unit a partial weight', () => {
  const unit = squareUnit([-0.018, -0.018], 4000, { code: 'straddle' });
  const selection = { type: 'disc', center: CENTRE, radius: 2000 };
  const { items } = arealSelect([unit], selection, { weighting: 'area', samples: 40 });
  assert.equal(items.length, 1);
  const w = items[0].weight;
  assert.ok(w > 0.05 && w < 0.95, `partial weight expected, got ${w}`);
});

test('area weighting approaches the analytic fraction', () => {
  // A square unit centred on the lens: the answer is the disc's area over the
  // square's, which is pi/4 of the way in.
  const unit = squareUnit([-0.018, -0.018], 4000, { code: 'cover' });
  const selection = { type: 'disc', center: CENTRE, radius: 2000 };
  const { items } = arealSelect([unit], selection, { weighting: 'area', samples: 60 });
  const expected = (Math.PI * 2 ** 2) / (4 ** 2);
  assert.ok(Math.abs(items[0].weight - expected) < 0.03,
    `got ${items[0].weight.toFixed(3)}, expected about ${expected.toFixed(3)}`);
});

test('a unit far smaller than the sample grid still resolves', () => {
  // 30 m across, sampled on a coarse grid: without the centroid fallback this
  // would catch no samples and report zero for a real unit.
  const tiny = squareUnit([0.0005, 0.0005], 30, { code: 'tiny' });
  const { items } = arealSelect([tiny],
    { type: 'disc', center: CENTRE, radius: 2000 }, { weighting: 'area', samples: 6 });
  assert.equal(items.length, 1);
  assert.equal(items[0].weight, 1);
});

// ----------------------------------------------------------- aggregation

test('extensive measures are apportioned by weight and summed', () => {
  const items = [
    { feature: { pop: 100 }, weight: 1 },
    { feature: { pop: 100 }, weight: 0.5 },
  ];
  assert.equal(aggregate(items, { value: (f) => f.pop, kind: 'extensive' }), 150);
});

test('intensive measures are averaged, never summed', () => {
  // Two units at the same rate: the answer is that rate, not twice it.
  const items = [
    { feature: { rate: 0.2, pop: 100 }, weight: 1 },
    { feature: { rate: 0.2, pop: 900 }, weight: 1 },
  ];
  const rate = aggregate(items, { value: (f) => f.rate, kind: 'intensive' });
  assert.ok(Math.abs(rate - 0.2) < 1e-9, `got ${rate}`);
});

test('intensive measures weight by their denominator, not by unit count', () => {
  // A small unit at 100% and a large one at 0%. Population-weighted the answer
  // is 1%; unweighted it is 50%, which is the wrong reading of the same data.
  const items = [
    { feature: { rate: 1, pop: 10 }, weight: 1 },
    { feature: { rate: 0, pop: 990 }, weight: 1 },
  ];
  const byPop = aggregate(items, {
    value: (f) => f.rate, kind: 'intensive', weight: (f) => f.pop,
  });
  const unweighted = aggregate(items, { value: (f) => f.rate, kind: 'intensive' });
  assert.ok(Math.abs(byPop - 0.01) < 1e-9, `population-weighted: ${byPop}`);
  assert.ok(Math.abs(unweighted - 0.5) < 1e-9, `unweighted: ${unweighted}`);
});

test('a partly-included unit keeps its rate but contributes less weight', () => {
  const items = [
    { feature: { rate: 1, pop: 100 }, weight: 0.1 },
    { feature: { rate: 0, pop: 100 }, weight: 1 },
  ];
  const rate = aggregate(items, {
    value: (f) => f.rate, kind: 'intensive', weight: (f) => f.pop,
  });
  // Half a unit still has the same rate; it just counts for less.
  assert.ok(Math.abs(rate - (0.1 / 1.1)) < 1e-9, `got ${rate}`);
});

test('aggregate over nothing is zero rather than NaN', () => {
  assert.equal(aggregate([], { value: (f) => f.pop, kind: 'extensive' }), 0);
  assert.equal(aggregate([], { value: (f) => f.rate, kind: 'intensive' }), 0);
});

// ------------------------------------------------------------- binning

test('binUnits makes one bin per unit and carries its arc', () => {
  const units = [
    squareUnit([0.01, 0.01], 800, { code: 'A', name: 'Alpha', pop: 100 }),
    squareUnit([-0.02, 0.005], 800, { code: 'B', name: 'Beta', pop: 250 }),
  ];
  const { items } = arealSelect(units, { type: 'disc', center: CENTRE, radius: 6000 });
  const bins = binUnits(items, { measure: { value: (f) => f.pop, kind: 'extensive' } });

  assert.equal(bins.length, 2);
  assert.deepEqual(bins.map((b) => b.key).sort(), ['A', 'B']);
  assert.deepEqual(bins.map((b) => b.label).sort(), ['Alpha', 'Beta']);
  assert.equal(bins.find((b) => b.key === 'B').raw, 250);
  for (const b of bins) {
    assert.ok(Array.isArray(b.interval), 'each unit carries its own arc');
    assert.ok(b.areaKm2 > 0);
  }
});

// ------------------------------------------------------------ pipeline

test('computeLens runs end to end on areal units', () => {
  const units = [
    squareUnit([0.008, 0.008], 900, { code: 'A', name: 'Alpha', pop: 100 }),
    squareUnit([-0.02, 0.004], 900, { code: 'B', name: 'Beta', pop: 250 }),
    squareUnit([0.004, -0.02], 900, { code: 'C', name: 'Gamma', pop: 400 }),
    squareUnit([0.6, 0.6], 900, { code: 'Z', name: 'Far', pop: 999 }),
  ];
  const layout = computeLens({
    center: CENTRE,
    selection: { type: 'disc', radius: 5000 },
    data: units,
    areal: {},
    binning: { measure: { value: (f) => f.pop, kind: 'extensive' } },
    placement: { mode: 'necklace' },
    marks: { type: 'bar', barWidth: 10 },
    ring: { radius: 150 },
  });
  assert.equal(layout.bins.length, 3, 'the far unit is excluded');
  assert.equal(layout.stats.total, 750);
  assert.ok(layout.stats.areaKm2 > 0, 'area comes from the units, not the disc');
  for (const b of layout.bins) assert.ok(Number.isFinite(b.t));
});

test('placement keeps an areal symbol inside the arc its unit occupies', () => {
  // Three units crowded into one quadrant: placement must separate them
  // without sliding any of them out of its own geometry. This is the whole
  // reason the solver took intervals from the first commit (F-1).
  const units = [0.006, 0.009, 0.012].map((d, i) =>
    squareUnit([d, d], 500, { code: `U${i}`, name: `U${i}`, pop: 100 }));
  const layout = computeLens({
    center: CENTRE,
    selection: { type: 'disc', radius: 5000 },
    data: units,
    areal: {},
    binning: { measure: { value: (f) => f.pop, kind: 'extensive' } },
    marks: { type: 'bar', barWidth: 14 },
    ring: { radius: 150 },
  });

  for (const b of layout.bins) {
    assert.ok(b.interval, `${b.key} has an arc`);
    const [lo, hi] = b.interval;
    const span = ((hi - lo) % 360 + 360) % 360;
    const offset = ((b.t * 360 - lo) % 360 + 360) % 360;
    assert.ok(offset <= span + 1e-6,
      `${b.key} at ${(b.t * 360).toFixed(1)}deg is outside its arc `
      + `${lo.toFixed(1)}-${hi.toFixed(1)}`);
  }
});

test('an areal lens supports the same normalisations as a point lens', () => {
  const units = [
    squareUnit([0.008, 0.008], 900, { code: 'A', name: 'A', pop: 100 }),
    squareUnit([-0.02, 0.004], 900, { code: 'B', name: 'B', pop: 300 }),
  ];
  const base = {
    center: CENTRE,
    selection: { type: 'disc', radius: 5000 },
    data: units,
    areal: {},
    binning: { measure: { value: (f) => f.pop, kind: 'extensive' } },
    marks: { type: 'bar' },
    ring: { radius: 150 },
  };
  const share = computeLens({ ...base, normalisation: { mode: 'share' } });
  assert.ok(Math.abs(share.bins.reduce((s, b) => s + b.value, 0) - 1) < 1e-9);

  const density = computeLens({ ...base, normalisation: { mode: 'density' } });
  for (const b of density.bins) {
    // Density uses each unit's own area, not the lens disc's.
    assert.ok(Math.abs(b.value - b.raw / b.areaKm2) < 1e-6);
  }
});

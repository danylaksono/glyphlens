import test from 'node:test';
import assert from 'node:assert/strict';

import { isotonic, isotonicBoundedSpan } from '../src/core/isotonic.js';
import { placeNecklace, fitNecklaceScale } from '../src/core/necklace.js';
import { cyclicDelta, wrap01, circleCurve, polylineCurve } from '../src/core/curve.js';
import {
  distance, bearing, destination, bearingDelta, normaliseBearing,
  projectOntoPath, pathLength,
  pointInPolygon, polygonArea, polygonCentroid, angularExtent,
} from '../src/core/geo.js';
import { select, selectionArea, normaliseRings } from '../src/core/selection.js';
import {
  binAngular, binCategorical, binChainage, circularMean, compassLabel,
} from '../src/core/binning.js';
import { normalise, profileOf } from '../src/core/normalise.js';
import { computeLens } from '../src/core/layout.js';
import {
  hexLattice, spatialIndex, computeField, fieldBaseline, spacingForCount,
} from '../src/core/field.js';
import { resolveStyle, resolveLod } from '../src/render/style.js';
import {
  circularStats,
  radialStats,
  lateralStats,
  elasticity,
  elasticityProfile,
  angularHistogram,
  radialHistogram,
  describeDistribution,
} from '../src/core/distribution.js';

// ----------------------------------------------------------------- isotonic

test('isotonic leaves an already-increasing sequence alone', () => {
  const q = [1, 2, 3, 4];
  assert.deepEqual(isotonic(q), q);
});

test('isotonic pools a decreasing pair into their weighted mean', () => {
  const y = isotonic([3, 1], [1, 1]);
  assert.deepEqual(y, [2, 2]);
});

test('isotonic respects weights when pooling', () => {
  const y = isotonic([3, 1], [3, 1]);
  assert.equal(y[0], 2.5); // pulled towards the heavier point
  assert.equal(y[1], 2.5);
});

test('isotonic output is non-decreasing for random input', () => {
  const q = Array.from({ length: 200 }, () => Math.random() * 10);
  const y = isotonic(q);
  for (let i = 1; i < y.length; i++) assert.ok(y[i] >= y[i - 1] - 1e-12);
});

test('isotonicBoundedSpan honours the span cap', () => {
  const y = isotonicBoundedSpan([0, 1, 2, 10], null, 2);
  assert.ok(y[y.length - 1] - y[0] <= 2 + 1e-6);
});

// ---------------------------------------------------------------- necklace

/** No two placed symbols may overlap on the cyclic curve. */
function assertNoOverlap(placements) {
  const sorted = [...placements].sort((a, b) => a.position - b.position);
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    const b = sorted[(i + 1) % sorted.length];
    const gap = Math.abs(cyclicDelta(a.position, b.position));
    assert.ok(
      gap >= a.halfWidth + b.halfWidth - 1e-6,
      `overlap between ${a.id} and ${b.id}: gap ${gap} < ${a.halfWidth + b.halfWidth}`,
    );
  }
}

test('necklace leaves well-separated symbols on their preferred bearing', () => {
  const items = [
    { id: 'n', position: 0, halfWidth: 0.02 },
    { id: 'e', position: 0.25, halfWidth: 0.02 },
    { id: 's', position: 0.5, halfWidth: 0.02 },
    { id: 'w', position: 0.75, halfWidth: 0.02 },
  ];
  const { placements, overflow } = placeNecklace(items);
  assert.equal(overflow, false);
  for (const p of placements) assert.ok(Math.abs(p.displacement) < 1e-9);
  assertNoOverlap(placements);
});

test('necklace separates colliding symbols and keeps them near the target', () => {
  const items = [
    { id: 'a', position: 0.30, halfWidth: 0.05 },
    { id: 'b', position: 0.31, halfWidth: 0.05 },
    { id: 'c', position: 0.32, halfWidth: 0.05 },
  ];
  const { placements } = placeNecklace(items);
  assertNoOverlap(placements);
  // The whole cluster stays centred on where it wanted to be.
  const mean = placements.reduce((s, p) => s + p.displacement, 0) / placements.length;
  assert.ok(Math.abs(mean) < 0.02, `cluster drifted by ${mean}`);
});

test('necklace handles a full ring without overlap', () => {
  const items = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    position: wrap01(0.2 + i * 0.001), // all bunched on one side
    halfWidth: 1 / 24 / 2,
  }));
  const { placements, fill } = placeNecklace(items);
  assert.ok(fill <= 1 + 1e-9);
  assertNoOverlap(placements);
});

test('necklace reports overflow when symbols cannot possibly fit', () => {
  const items = Array.from({ length: 10 }, (_, i) => ({
    id: i,
    position: i / 10,
    halfWidth: 0.2, // 10 * 0.4 = 4x the available curve
  }));
  assert.equal(placeNecklace(items).overflow, true);
});

test('necklace keeps symbols inside their feasible interval', () => {
  const items = [
    { id: 'a', position: 0.10, halfWidth: 0.02, interval: [0.0, 0.25] },
    { id: 'b', position: 0.12, halfWidth: 0.02, interval: [0.0, 0.25] },
    { id: 'c', position: 0.60, halfWidth: 0.02, interval: [0.5, 0.75] },
  ];
  const { placements } = placeNecklace(items);
  assertNoOverlap(placements);
  const c = placements.find((p) => p.id === 'c');
  assert.ok(c.position >= 0.5 && c.position <= 0.75);
});

test('necklace is stable: same input, same output', () => {
  const items = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    position: (i * 7) % 12 / 12,
    halfWidth: 0.03,
  }));
  const a = placeNecklace(items).placements.map((p) => p.position);
  const b = placeNecklace(items).placements.map((p) => p.position);
  assert.deepEqual(a, b);
});

test('fitNecklaceScale finds a scale that fits the target fill', () => {
  const items = Array.from({ length: 8 }, (_, i) => ({ id: i, value: i + 1 }));
  const widthOf = (it, s) => (Math.sqrt(it.value) * s) / 400;
  const scale = fitNecklaceScale(items, widthOf, { targetFill: 0.9 });
  const total = items.reduce((sum, it) => sum + 2 * widthOf(it, scale), 0);
  assert.ok(total <= 0.9 + 1e-3 && total > 0.85);
});

// --------------------------------------------------------------------- geo

test('bearing and destination round-trip', () => {
  const origin = [-0.1276, 51.5072];
  for (const b of [0, 45, 137, 270, 359]) {
    const p = destination(origin, b, 1200);
    assert.ok(Math.abs(bearingDelta(b, bearing(origin, p))) < 1e-6, `bearing ${b}`);
    assert.ok(Math.abs(distance(origin, p) - 1200) < 0.5);
  }
});

test('due north is bearing 0 and due east is 90', () => {
  const origin = [0, 0];
  assert.ok(Math.abs(bearing(origin, [0, 1])) < 1e-9);
  assert.ok(Math.abs(bearing(origin, [1, 0]) - 90) < 1e-9);
});

// ------------------------------------------------------------------ curves

test('circleCurve puts t=0 due north and runs clockwise', () => {
  const c = circleCurve(0, 0, 10);
  const [nx, ny] = c.pointAt(0);
  assert.ok(Math.abs(nx) < 1e-9 && Math.abs(ny + 10) < 1e-9); // canvas y is down
  const [ex, ey] = c.pointAt(0.25);
  assert.ok(Math.abs(ex - 10) < 1e-9 && Math.abs(ey) < 1e-9);
});

test('polylineCurve measures length and interpolates', () => {
  const c = polylineCurve([[0, 0], [10, 0], [10, 10]]);
  assert.equal(c.length, 20);
  assert.deepEqual(c.pointAt(0.5).map(Math.round), [10, 0]);
});

// --------------------------------------------------------- select and bin

const CENTRE = [-0.1276, 51.5072];
const sample = [
  { lng: destination(CENTRE, 0, 300)[0], lat: destination(CENTRE, 0, 300)[1], category: 'food' },
  { lng: destination(CENTRE, 10, 400)[0], lat: destination(CENTRE, 10, 400)[1], category: 'food' },
  { lng: destination(CENTRE, 180, 500)[0], lat: destination(CENTRE, 180, 500)[1], category: 'shop' },
  { lng: destination(CENTRE, 90, 5000)[0], lat: destination(CENTRE, 90, 5000)[1], category: 'shop' },
];

test('select keeps only what is inside the disc', () => {
  const { items } = select(sample, { type: 'disc', center: CENTRE, radius: 800 });
  assert.equal(items.length, 3);
});

test('select annotates distance and bearing', () => {
  const { items } = select(sample, { type: 'disc', center: CENTRE, radius: 800 });
  const north = items.find((i) => Math.round(i.distance) === 300);
  assert.ok(Math.abs(bearingDelta(0, north.bearing)) < 1e-6);
});

test('angular binning puts features in the wedge of their bearing', () => {
  const { items } = select(sample, { type: 'disc', center: CENTRE, radius: 800 });
  const bins = binAngular(items, { bins: 8 });
  assert.equal(bins.length, 8);
  assert.equal(bins[0].count, 2); // both northerly points
  assert.equal(bins[4].count, 1); // the southerly one
  assert.deepEqual(bins[0].interval, [0, 45]);
});

test('categorical binning still records a mean bearing for the morph', () => {
  const { items } = select(sample, { type: 'disc', center: CENTRE, radius: 800 });
  const bins = binCategorical(items, { category: (f) => f.category });
  const food = bins.find((b) => b.key === 'food');
  assert.equal(food.count, 2);
  assert.ok(food.meanBearing >= 0 && food.meanBearing <= 10);
});

test('circularMean wraps around north correctly', () => {
  assert.ok(Math.abs(circularMean([350, 10]) % 360) < 1e-6);
});

test('compassLabel names the cardinals', () => {
  assert.equal(compassLabel(0), 'N');
  assert.equal(compassLabel(90), 'E');
  assert.equal(compassLabel(181), 'S');
});

// ---------------------------------------------------------- normalisation

test('share sums to one', () => {
  const bins = [{ key: 'a', raw: 3 }, { key: 'b', raw: 1 }];
  const out = normalise(bins, { mode: 'share' });
  assert.equal(out.reduce((s, b) => s + b.value, 0), 1);
});

test('density divides by area', () => {
  const out = normalise([{ key: 'a', raw: 10 }], { mode: 'density', areaKm2: 2 });
  assert.equal(out[0].value, 5);
});

test('location quotient is 1 when the lens matches its baseline', () => {
  const bins = [{ key: 'a', raw: 2 }, { key: 'b', raw: 2 }];
  const out = normalise(bins, { mode: 'lq', baseline: { a: 50, b: 50 } });
  assert.equal(out[0].value, 1);
  assert.equal(out[0].neutral, 1);
});

test('location quotient exceeds 1 where the lens is over-represented', () => {
  const bins = [{ key: 'a', raw: 3 }, { key: 'b', raw: 1 }];
  const out = normalise(bins, { mode: 'lq', baseline: { a: 50, b: 50 } });
  assert.ok(out[0].value > 1 && out[1].value < 1);
});

test('profileOf collapses bins to a baseline by category', () => {
  const p = profileOf([
    { key: 'x', category: 'food', raw: 2 },
    { key: 'y', category: 'food', raw: 3 },
    { key: 'z', category: 'shop', raw: 1 },
  ]);
  assert.deepEqual(p, { food: 5, shop: 1 });
});

// ------------------------------------------------------------------ layout

test('computeLens produces placed, sized bins', () => {
  const layout = computeLens({
    center: CENTRE,
    selection: { type: 'disc', radius: 800 },
    data: sample,
    binning: { mode: 'angular', bins: 12 },
    placement: { mode: 'necklace' },
    marks: { type: 'bar' },
    ring: { radius: 150 },
  });
  assert.equal(layout.bins.length, 12);
  assert.equal(layout.stats.count, 3);
  for (const b of layout.bins) {
    assert.ok(Number.isFinite(b.t) && b.t >= 0 && b.t < 1);
    assert.ok(Number.isFinite(b.angle));
    assert.ok(Number.isFinite(b.size));
  }
});

test('morph at 0 is block order and at 1 is bearing order', () => {
  const base = {
    center: CENTRE,
    selection: { type: 'disc', radius: 800 },
    data: sample,
    binning: { mode: 'angular', bins: 4 },
    marks: { type: 'bar' },
    ring: { radius: 150 },
  };
  const block = computeLens({ ...base, placement: { mode: 'morph', morph: 0 } });
  const rose = computeLens({ ...base, placement: { mode: 'morph', morph: 1 } });

  // Block slots are evenly spaced regardless of where the data is.
  assert.ok(Math.abs(block.bins[0].t - 0.125) < 1e-9);
  // The rose puts the northerly bin near north.
  assert.ok(Math.min(rose.bins[0].t, 1 - rose.bins[0].t) < 0.06);
});

test('an empty lens degrades gracefully', () => {
  const layout = computeLens({
    center: CENTRE,
    selection: { type: 'disc', radius: 10 },
    data: sample,
    binning: { mode: 'angular', bins: 8 },
    marks: { type: 'bar' },
    ring: { radius: 150 },
  });
  assert.equal(layout.stats.count, 0);
  assert.equal(layout.stats.total, 0);
  for (const b of layout.bins) assert.equal(b.size, 0);
});

// ------------------------------------------------- within-unit structure

test('circularStats: identical bearings are perfectly concentrated', () => {
  const { mean, R, sd } = circularStats([90, 90, 90]);
  assert.equal(R, 1);
  assert.equal(sd, 0);
  assert.ok(Math.abs(mean - 90) < 1e-9);
});

test('circularStats: opposed bearings cancel to no direction', () => {
  const { mean, R } = circularStats([0, 180]);
  assert.ok(R < 1e-9);
  assert.equal(mean, null);
});

test('circularStats: spread widens as bearings disperse', () => {
  const tight = circularStats([88, 90, 92]);
  const loose = circularStats([40, 90, 140]);
  assert.ok(tight.R > loose.R);
  assert.ok(tight.sd < loose.sd);
});

test('circularStats: sd is capped at a half-turn', () => {
  const { sd } = circularStats([0, 90, 180, 270]);
  assert.ok(sd <= 180);
});

test('circularStats: wraps around north', () => {
  const { mean, R } = circularStats([350, 10]);
  assert.ok(R > 0.9);
  assert.ok(Math.abs(bearingDelta(0, mean)) < 1e-6);
});

test('radialStats: a uniform disc has normalised mean distance near 2/3', () => {
  // Inverse-transform sample of a uniform disc: d = R * sqrt(u).
  const radius = 1000;
  const distances = Array.from({ length: 20000 }, (_, i) =>
    radius * Math.sqrt((i + 0.5) / 20000));
  const { meanNormalised } = radialStats(distances, radius);
  assert.ok(Math.abs(meanNormalised - 2 / 3) < 0.01, `got ${meanNormalised}`);
});

test('radialStats: members hugging the rim push the mean outwards', () => {
  const inner = radialStats([100, 150, 200], 1000);
  const outer = radialStats([920, 950, 990], 1000);
  assert.ok(outer.meanNormalised > inner.meanNormalised);
  assert.equal(inner.edgeShare, 0);
  assert.equal(outer.edgeShare, 1);
});

test('radialStats: the edge band is inclusive at exactly 0.9r', () => {
  assert.equal(radialStats([900], 1000).edgeShare, 1);
  assert.equal(radialStats([899.9], 1000).edgeShare, 0);
});

test('circularStats: R never exceeds 1, so sd is never NaN', () => {
  for (const b of [0, 45, 90, 137, 180, 270, 359]) {
    const { R, sd } = circularStats(Array(7).fill(b));
    assert.ok(R <= 1, `R = ${R} for bearing ${b}`);
    assert.ok(Number.isFinite(sd) && !Object.is(sd, -0), `sd = ${sd}`);
  }
});

test('elasticity: uniform density gives E close to 2', () => {
  const radius = 1000;
  const distances = Array.from({ length: 20000 }, (_, i) =>
    radius * Math.sqrt((i + 0.5) / 20000));
  const E = elasticity(distances, radius, 0.1);
  assert.ok(Math.abs(E - 1.9) < 0.05, `got ${E}`);
});

test('elasticity: nothing near the rim gives E of zero', () => {
  assert.equal(elasticity([10, 20, 30], 1000, 0.1), 0);
});

test('elasticity: a cluster at the rim gives E well above 2', () => {
  const distances = [...Array(10).fill(100), ...Array(90).fill(980)];
  assert.ok(elasticity(distances, 1000, 0.1) > 5);
});

test('describeDistribution reports gradient direction and strength', () => {
  const items = [
    { bearing: 90, distance: 100 },
    { bearing: 92, distance: 200 },
    { bearing: 88, distance: 300 },
  ];
  const d = describeDistribution(items, { radius: 800 });
  assert.ok(Math.abs(d.gradient.bearing - 90) < 1);
  assert.ok(d.gradient.strength > 0.99);
});

test('computeLens attaches structure to every bin and to the lens', () => {
  const layout = computeLens({
    center: CENTRE,
    selection: { type: 'disc', radius: 800 },
    data: sample,
    binning: { mode: 'categorical', category: (f) => f.category },
    marks: { type: 'bar' },
    ring: { radius: 150 },
  });
  assert.ok(layout.structure, 'lens-level structure');
  assert.ok(Number.isFinite(layout.stats.elasticity));
  for (const b of layout.bins) {
    assert.ok(b.structure, `bin ${b.key} has structure`);
    assert.ok(Number.isFinite(b.spread));
    assert.ok(b.concentration >= 0 && b.concentration <= 1);
  }
});

test('a bin with one member is perfectly concentrated, not spread', () => {
  const layout = computeLens({
    center: CENTRE,
    selection: { type: 'disc', radius: 800 },
    data: sample,
    binning: { mode: 'categorical', category: (f) => f.category },
    marks: { type: 'bar' },
    ring: { radius: 150 },
  });
  const shop = layout.bins.find((b) => b.key === 'shop'); // one member inside
  assert.equal(shop.count, 1);
  assert.equal(shop.concentration, 1);
  assert.equal(shop.spread, 0);
});

test('angularHistogram: petal 0 is due north and peaks normalise to 1', () => {
  const h = angularHistogram([0, 1, 359, 90], 4);
  assert.equal(h.length, 4);
  assert.equal(Math.max(...h), 1);
  assert.ok(h[0] > h[1], 'north petal is the tallest');
});

test('angularHistogram: an empty bin is all zeroes, not NaN', () => {
  assert.deepEqual(angularHistogram([], 4), [0, 0, 0, 0]);
});

test('angularHistogram: a uniform spread has equal petals', () => {
  const h = angularHistogram([45, 135, 225, 315], 4);
  assert.deepEqual(h, [1, 1, 1, 1]);
});

test('radialHistogram: inner ring first', () => {
  const h = radialHistogram([10, 20, 900], 1000, 2);
  assert.equal(h[0], 1);       // two members in the inner half
  assert.equal(h[1], 0.5);
});

test('glyph fitting shrinks to fit but never inflates past maxRadius', () => {
  const base = {
    center: CENTRE,
    selection: { type: 'disc', radius: 800 },
    data: sample,
    binning: { mode: 'categorical', category: (f) => f.category },
    ring: { radius: 150 },
    placement: { mode: 'necklace' },
  };
  // Few bins and a modest maxRadius: nothing should be scaled up to fill the
  // ring, and nothing should be flung far off its bearing to make room.
  const layout = computeLens({ ...base, marks: { type: 'disc', maxRadius: 20 } });
  for (const b of layout.bins) assert.ok(b.size <= 20 + 1e-9, `size ${b.size}`);
  assert.ok(layout.stats.fill < 0.9);
});

test('roses carry a normalised petal profile per bin', () => {
  const layout = computeLens({
    center: CENTRE,
    selection: { type: 'disc', radius: 800 },
    data: sample,
    binning: { mode: 'categorical', category: (f) => f.category },
    marks: { type: 'rose', maxRadius: 24 },
    ring: { radius: 150 },
    structure: { roseBins: 8 },
  });
  const food = layout.bins.find((b) => b.key === 'food');
  assert.equal(food.structure.rose.length, 8);
  assert.equal(Math.max(...food.structure.rose), 1);
});

// ---------------------------------------------------- corridor / open curve

const PATH = [CENTRE, destination(CENTRE, 180, 2000)];

test('projectOntoPath returns chainage and signed offset', () => {
  // 500 m south of the centre, on the line: no offset, 500 m along.
  const onLine = destination(CENTRE, 180, 500);
  const a = projectOntoPath(onLine, PATH);
  assert.ok(Math.abs(a.offset) < 1, `offset ${a.offset}`);
  assert.ok(Math.abs(a.chainage - 500) < 2, `chainage ${a.chainage}`);
  assert.ok(Math.abs(a.t - 0.25) < 0.01);
});

test('projectOntoPath signs offset by side of travel', () => {
  const mid = destination(CENTRE, 180, 1000);
  const left = projectOntoPath(destination(mid, 90, 300), PATH);
  const right = projectOntoPath(destination(mid, 270, 300), PATH);
  assert.ok(Math.abs(Math.abs(left.offset) - 300) < 5);
  assert.ok(Math.abs(Math.abs(right.offset) - 300) < 5);
  assert.ok(Math.sign(left.offset) !== Math.sign(right.offset), 'opposite sides');
});

test('projectOntoPath clamps to the ends rather than extrapolating', () => {
  const beyond = destination(CENTRE, 180, 3000); // 1 km past the end
  const { chainage } = projectOntoPath(beyond, PATH);
  assert.ok(chainage <= pathLength(PATH) + 1e-6);
});

test('pathLength measures the whole polyline', () => {
  assert.ok(Math.abs(pathLength(PATH) - 2000) < 2);
});

test('corridor selection keeps only what is within half the width', () => {
  const mid = destination(CENTRE, 180, 1000);
  const near = destination(mid, 90, 100);
  const far = destination(mid, 90, 900);
  const data = [
    { lng: near[0], lat: near[1], category: 'food' },
    { lng: far[0], lat: far[1], category: 'food' },
  ];
  const { items } = select(data, { type: 'corridor', path: PATH, width: 400 });
  assert.equal(items.length, 1);
  assert.ok(Math.abs(items[0].chainage - 1000) < 5);
});

test('chainage bins own a stretch of route and state it in curve parameter', () => {
  // Deliberately off the bin boundaries: a point at exactly 0.3 of the route
  // sits on the 600 m edge, where sub-metre projection error decides the bin.
  const data = [0.12, 0.32, 0.37, 0.91].map((t) => {
    const p = destination(CENTRE, 180, 2000 * t);
    return { lng: p[0], lat: p[1], category: 'food' };
  });
  const { items } = select(data, { type: 'corridor', path: PATH, width: 400 });
  const bins = binChainage(items, { bins: 10, length: 2000 });
  assert.equal(bins.length, 10);
  assert.equal(bins[1].count, 1);
  assert.equal(bins[3].count, 2);  // 0.32 and 0.37 share the 600-800 m bin
  assert.equal(bins[9].count, 1);
  assert.deepEqual(bins[3].interval, [0.3, 0.4]);
  assert.ok(Math.abs(bins[3].position - 0.35) < 1e-9);
});

test('projectOntoPath is accurate to well under a metre over a few km', () => {
  // The local equirectangular frame is an approximation; this is the claim it
  // makes in its own docstring, asserted rather than assumed.
  for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const expected = 2000 * t;
    const p = destination(CENTRE, 180, expected);
    const { chainage } = projectOntoPath(p, PATH);
    assert.ok(Math.abs(chainage - expected) < 0.5,
      `at ${expected} m, off by ${(chainage - expected).toFixed(3)} m`);
  }
});

test('an open curve places marks in order without wrapping', () => {
  const data = [0.05, 0.5, 0.95].map((t) => {
    const p = destination(CENTRE, 180, 2000 * t);
    return { lng: p[0], lat: p[1], category: 'food' };
  });
  const layout = computeLens({
    selection: { type: 'corridor', path: PATH, width: 400 },
    data,
    binning: { mode: 'chainage', bins: 10 },
    marks: { type: 'bar', barWidth: 8 },
    ring: { radius: 150 },
  });
  assert.equal(layout.closed, false);
  assert.equal(layout.bins.length, 10);
  // Positions must stay monotonic along the route: no wrap-around on a strip.
  const ts = layout.bins.map((b) => b.t);
  for (let i = 1; i < ts.length; i++) assert.ok(ts[i] > ts[i - 1], `t[${i}] <= t[${i - 1}]`);
  assert.ok(ts[0] >= 0 && ts[ts.length - 1] <= 1);
});

test('corridor area is the swept rectangle plus end caps', () => {
  const area = selectionArea({ type: 'corridor', path: PATH, width: 400, length: 2000 });
  const expected = 2 * 0.4 + Math.PI * 0.2 ** 2;
  assert.ok(Math.abs(area - expected) < 1e-6, `got ${area}`);
});

// -------------------------------------------------- lateral / stacked

test('lateralStats: all on one side reads as fully one-sided', () => {
  const { bias, sidedness, mean } = lateralStats([100, 150, 200], 300);
  assert.equal(sidedness, 1);
  assert.ok(mean > 0 && bias > 0);
});

test('lateralStats: an even split reads as not one-sided', () => {
  const { sidedness, bias } = lateralStats([-200, -100, 100, 200], 300);
  assert.equal(sidedness, 0);
  assert.ok(Math.abs(bias) < 1e-9);
});

test('lateralStats: count balance and distance balance are different things', () => {
  // Two each side, but the left ones are much further out.
  const { sidedness, bias } = lateralStats([-50, -50, 280, 280], 300);
  assert.equal(sidedness, 0, 'evenly split by count');
  assert.ok(bias > 0.3, `but biased left: ${bias}`);
});

test('lateralStats: bias is clamped to the half-width', () => {
  assert.equal(lateralStats([900, 900], 300).bias, 1);
  assert.equal(lateralStats([-900, -900], 300).bias, -1);
});

test('corridor bins carry lateral structure; disc bins do not', () => {
  const mid = destination(CENTRE, 180, 1000);
  const data = [100, 200, 250].map((o) => {
    const p = destination(mid, 90, o);
    return { lng: p[0], lat: p[1], category: 'food' };
  });
  const corridor = computeLens({
    selection: { type: 'corridor', path: PATH, width: 800 },
    data,
    binning: { mode: 'chainage', bins: 4 },
    marks: { type: 'bar' },
    ring: { radius: 150 },
  });
  const occupied = corridor.bins.find((b) => b.count > 0);
  assert.ok(occupied.structure.lateral, 'corridor bin has lateral stats');
  assert.equal(occupied.structure.lateral.sidedness, 1);

  const disc = computeLens({
    center: CENTRE,
    selection: { type: 'disc', radius: 800 },
    data: sample,
    binning: { mode: 'categorical', category: (f) => f.category },
    marks: { type: 'bar' },
    ring: { radius: 150 },
  });
  assert.equal(disc.bins[0].structure.lateral, null, 'a disc has no lateral axis');
});

test('stacked placement puts each category on its own track', () => {
  const layout = computeLens({
    center: CENTRE,
    selection: { type: 'disc', radius: 800 },
    data: sample,
    binning: { mode: 'cross', bins: 8, category: (f) => f.category,
      categories: ['food', 'shop'] },
    placement: { mode: 'stacked', by: 'category', ringGap: 20 },
    marks: { type: 'bar', barWidth: 6 },
    ring: { radius: 150 },
  });
  const offsets = new Map();
  for (const b of layout.bins) {
    if (!offsets.has(b.category)) offsets.set(b.category, b.ringOffset);
    assert.equal(b.ringOffset, offsets.get(b.category),
      `${b.category} bins share one track`);
  }
  assert.equal(offsets.get('food'), 0);
  assert.equal(offsets.get('shop'), 20);
});

test('stacked tracks are solved independently, so they may overlap in angle', () => {
  const layout = computeLens({
    center: CENTRE,
    selection: { type: 'disc', radius: 800 },
    data: sample,
    binning: { mode: 'cross', bins: 8, category: (f) => f.category,
      categories: ['food', 'shop'] },
    placement: { mode: 'stacked', by: 'category' },
    marks: { type: 'bar', barWidth: 6 },
    ring: { radius: 150 },
  });
  // Bins in different tracks share angular space; only same-track bins must
  // avoid each other. That is the point of stacking.
  const byTrack = new Map();
  for (const b of layout.bins) {
    if (!b.count) continue;
    const list = byTrack.get(b.ringOffset) ?? [];
    list.push(b);
    byTrack.set(b.ringOffset, list);
  }
  for (const list of byTrack.values()) {
    const sorted = list.sort((a, b) => a.t - b.t);
    for (let i = 1; i < sorted.length; i++) {
      const gap = Math.abs(sorted[i].t - sorted[i - 1].t);
      assert.ok(gap >= sorted[i].halfWidth + sorted[i - 1].halfWidth - 1e-6,
        `same-track overlap at ${sorted[i].key}`);
    }
  }
});

test('placement modes agree on bin count and stay in range', () => {
  const base = {
    center: CENTRE,
    selection: { type: 'disc', radius: 800 },
    data: sample,
    binning: { mode: 'cross', bins: 8, category: (f) => f.category,
      categories: ['food', 'shop'] },
    marks: { type: 'bar', barWidth: 6 },
    ring: { radius: 150 },
  };
  for (const mode of ['necklace', 'block', 'stacked']) {
    const layout = computeLens({ ...base, placement: { mode } });
    assert.equal(layout.bins.length, 16, mode);
    for (const b of layout.bins) {
      assert.ok(b.t >= 0 && b.t < 1, `${mode}: t out of range (${b.t})`);
      assert.ok(Number.isFinite(b.ringOffset), `${mode}: ringOffset missing`);
    }
  }
});

// ------------------------------------------------- elasticity profile

test('elasticityProfile is ascending in radius and monotone in count', () => {
  const radius = 2000;
  const distances = Array.from({ length: 4000 }, (_, i) =>
    radius * Math.sqrt((i + 0.5) / 4000));
  const prof = elasticityProfile(distances, { maxRadius: radius, samples: 40 });
  assert.equal(prof.length, 40);
  for (let i = 1; i < prof.length; i++) {
    assert.ok(prof[i].r > prof[i - 1].r, 'radius ascends');
    assert.ok(prof[i].count >= prof[i - 1].count, 'count never falls');
  }
  assert.equal(prof[prof.length - 1].count, 4000);
});

test('elasticityProfile agrees with the scalar estimator', () => {
  const radius = 2000;
  const distances = Array.from({ length: 4000 }, (_, i) =>
    radius * Math.sqrt((i + 0.5) / 4000));
  const prof = elasticityProfile(distances, { maxRadius: radius, samples: 60 });
  const last = prof[prof.length - 1];
  assert.ok(Math.abs(last.elasticity - elasticity(distances, radius, 0.1)) < 0.05);
});

test('elasticityProfile reports uniform density as E near 2', () => {
  const radius = 2000;
  const distances = Array.from({ length: 8000 }, (_, i) =>
    radius * Math.sqrt((i + 0.5) / 8000));
  const prof = elasticityProfile(distances, { maxRadius: radius, samples: 40 })
    .filter((p) => p.reliable);
  for (const p of prof) {
    assert.ok(Math.abs(p.elasticity - 1.9) < 0.35, `E = ${p.elasticity} at r = ${p.r}`);
  }
});

test('elasticityProfile flags small-count samples as unreliable', () => {
  // Nothing inside 900 m, then a cluster: the low-radius samples have counts of
  // 0-2 and their elasticity is arithmetic noise, not geography.
  const distances = [...Array(200).fill(950), ...Array(2).fill(100)];
  const prof = elasticityProfile(distances, { maxRadius: 2000, samples: 40, minCount: 30 });
  const early = prof.filter((p) => p.r < 900);
  assert.ok(early.length > 0);
  assert.ok(early.every((p) => !p.reliable), 'sparse radii are flagged');
  assert.ok(prof.some((p) => p.reliable), 'and the dense ones are not');
});

test('elasticityProfile finds the cliff a cluster creates', () => {
  // A ring of 300 places at 1500 m: crossing it should be the sharpest change.
  const distances = [
    ...Array.from({ length: 200 }, (_, i) => 100 + (i / 200) * 600),
    ...Array(300).fill(1500),
  ];
  const prof = elasticityProfile(distances, { maxRadius: 2500, samples: 200, minCount: 30 })
    .filter((p) => p.reliable);
  const peak = prof.reduce((a, b) => (b.elasticity > a.elasticity ? b : a));
  assert.ok(Math.abs(peak.r - 1500) < 200, `peak at ${peak.r}, expected ~1500`);
});

test('elasticityProfile degrades gracefully on empty input', () => {
  assert.deepEqual(elasticityProfile([], { maxRadius: 1000 }), []);
  assert.deepEqual(elasticityProfile([100], { maxRadius: 0 }), []);
});

// ------------------------------------------------------ polygon selection

const SQUARE = [[
  [-0.14, 51.50], [-0.11, 51.50], [-0.11, 51.52], [-0.14, 51.52], [-0.14, 51.50],
]];

test('pointInPolygon: inside, outside and unclosed rings', () => {
  assert.equal(pointInPolygon([-0.125, 51.51], SQUARE), true);
  assert.equal(pointInPolygon([-0.20, 51.51], SQUARE), false);
  assert.equal(pointInPolygon([-0.125, 51.60], SQUARE), false);
  // Rings need not repeat the first vertex.
  const open = [SQUARE[0].slice(0, -1)];
  assert.equal(pointInPolygon([-0.125, 51.51], open), true);
});

test('pointInPolygon: a hole is outside', () => {
  const hole = [[-0.13, 51.505], [-0.12, 51.505], [-0.12, 51.515], [-0.13, 51.515]];
  const withHole = [SQUARE[0], hole];
  assert.equal(pointInPolygon([-0.125, 51.510], withHole), false, 'inside the hole');
  assert.equal(pointInPolygon([-0.115, 51.510], withHole), true, 'outside the hole');
});

test('pointInPolygon: winding order does not matter', () => {
  const reversed = [[...SQUARE[0]].reverse()];
  assert.equal(pointInPolygon([-0.125, 51.51], reversed), true);
});

test('polygonArea matches the rectangle it describes', () => {
  // 0.03 deg lng at 51.51 N, by 0.02 deg lat.
  const km = polygonArea(SQUARE);
  const expectedX = 0.03 * 111.32 * Math.cos((51.51 * Math.PI) / 180);
  const expectedY = 0.02 * 111.32;
  assert.ok(Math.abs(km - expectedX * expectedY) < 0.05, `got ${km}`);
});

test('polygonArea subtracts holes', () => {
  const hole = [[-0.13, 51.505], [-0.12, 51.505], [-0.12, 51.515], [-0.13, 51.515]];
  assert.ok(polygonArea([SQUARE[0], hole]) < polygonArea(SQUARE));
});

test('polygonCentroid finds the middle of a rectangle', () => {
  const [lng, lat] = polygonCentroid(SQUARE);
  assert.ok(Math.abs(lng + 0.125) < 1e-9);
  assert.ok(Math.abs(lat - 51.51) < 1e-9);
});

test('polygon selection keeps what is inside and derives a centre', () => {
  const data = [
    { lng: -0.125, lat: 51.51, category: 'food' },   // inside
    { lng: -0.115, lat: 51.505, category: 'shop' },  // inside
    { lng: -0.30, lat: 51.51, category: 'food' },    // outside
  ];
  const { items, center, area } = select(data, { type: 'polygon', rings: SQUARE });
  assert.equal(items.length, 2);
  assert.ok(Math.abs(center[0] + 0.125) < 1e-9, 'centroid used as the anchor');
  assert.ok(area > 0);
  // Every member still carries the distance and bearing the rest of the
  // pipeline needs.
  for (const it of items) {
    assert.ok(Number.isFinite(it.distance) && Number.isFinite(it.bearing));
  }
});

test('polygon selection honours an explicit centre', () => {
  const data = [{ lng: -0.125, lat: 51.515, category: 'food' }];
  const { items } = select(data, {
    type: 'polygon', rings: SQUARE, center: [-0.125, 51.505],
  });
  // Due north of the supplied centre, not of the centroid.
  assert.ok(Math.abs(bearingDelta(0, items[0].bearing)) < 1e-6);
});

test('normaliseRings accepts a bare ring, rings, and a MultiPolygon', () => {
  assert.equal(normaliseRings({ rings: SQUARE[0] }).length, 1);
  assert.equal(normaliseRings({ rings: SQUARE }).length, 1);
  assert.equal(normaliseRings({ coordinates: [SQUARE, SQUARE] }).length, 2);
  assert.deepEqual(normaliseRings({ rings: [] }), []);
});

test('computeLens runs the whole pipeline on a polygon', () => {
  const data = [
    { lng: -0.125, lat: 51.515, category: 'food' },
    { lng: -0.120, lat: 51.505, category: 'shop' },
    { lng: -0.135, lat: 51.512, category: 'food' },
    { lng: -0.30, lat: 51.51, category: 'food' },
  ];
  const layout = computeLens({
    selection: { type: 'polygon', rings: SQUARE },
    data,
    binning: { mode: 'angular', bins: 8 },
    placement: { mode: 'necklace' },
    marks: { type: 'bar' },
    ring: { radius: 150 },
  });
  assert.equal(layout.stats.count, 3);
  assert.ok(layout.center, 'a centre was resolved');
  assert.ok(layout.stats.areaKm2 > 0);
  assert.ok(layout.structure, 'within-unit structure still computed');
  for (const b of layout.bins) assert.ok(Number.isFinite(b.t));
});

test('angularExtent gives the arc a polygon occupies, and null from inside', () => {
  // Viewed from well west of the square, it subtends a modest easterly arc.
  const from = [-0.40, 51.51];
  const [lo, hi] = angularExtent(from, SQUARE);
  assert.ok(lo > 45 && lo < 135, `lo = ${lo}`);
  assert.ok(hi > 45 && hi < 135, `hi = ${hi}`);
  assert.equal(angularExtent([-0.125, 51.51], SQUARE), null, 'inside spans everything');
});

// ------------------------------------------------------------ field / continuum

const FIELD_CENTRE = [110.3695, -7.7956];

/** A ring of places 600 m out, plus a dense knot to the north. */
function fieldData() {
  const out = [];
  for (let b = 0; b < 360; b += 15) {
    const p = destination(FIELD_CENTRE, b, 600);
    out.push({ lng: p[0], lat: p[1], category: 'food' });
  }
  for (let i = 0; i < 40; i++) {
    const p = destination(FIELD_CENTRE, 350 + (i % 7), 900 + i);
    out.push({ lng: p[0], lat: p[1], category: 'retail' });
  }
  return out;
}

test('hexLattice covers the radius and offsets alternate rows', () => {
  const centres = hexLattice({ center: FIELD_CENTRE, radius: 2000, spacing: 500 });
  assert.ok(centres.length > 10, `got ${centres.length}`);
  for (const c of centres) {
    assert.ok(distance(FIELD_CENTRE, c) <= 2000 + 1, 'inside the covered radius');
  }
  // Distinct row offsets are what make it hexagonal rather than square.
  const xs = new Set(centres.map((c) => c[0].toFixed(6)));
  assert.ok(xs.size > Math.sqrt(centres.length), 'columns are not all aligned');
});

test('hexLattice degrades to a single centre without a spacing', () => {
  assert.deepEqual(hexLattice({ center: FIELD_CENTRE, radius: 2000, spacing: 0 }),
    [FIELD_CENTRE]);
});

test('spacingForCount inverts roughly to the count asked for', () => {
  for (const target of [10, 50, 200]) {
    const spacing = spacingForCount(target, 3000);
    const got = hexLattice({ center: FIELD_CENTRE, radius: 3000, spacing }).length;
    assert.ok(Math.abs(got - target) / target < 0.35,
      `asked ${target}, laid ${got}`);
  }
});

test('spatialIndex never misses a true neighbour', () => {
  // `near` is a broad phase: it may over-include, but it must never omit
  // something inside the radius, because `select` only filters what it returns.
  const data = fieldData();
  const index = spatialIndex(data, {
    getPosition: (f) => [f.lng, f.lat],
    origin: FIELD_CENTRE,
    cellSize: 500,
  });
  const radius = 700;
  const candidates = new Set(index.near(FIELD_CENTRE, radius));
  const truth = data.filter((f) => distance(FIELD_CENTRE, [f.lng, f.lat]) <= radius);
  assert.ok(truth.length > 0, 'the fixture has neighbours to find');
  for (const f of truth) assert.ok(candidates.has(f), 'no true neighbour is missed');
});

test('spatialIndex prunes distant cells on spread-out data', () => {
  // Selectivity only shows up when the data is wider than the query, so this
  // uses two clusters 20 km apart rather than the tight fixture above.
  const far = destination(FIELD_CENTRE, 90, 20000);
  const data = [
    ...fieldData(),
    ...Array.from({ length: 200 }, (_, i) => {
      const p = destination(far, i * 1.8, 300);
      return { lng: p[0], lat: p[1], category: 'food' };
    }),
  ];
  const index = spatialIndex(data, {
    getPosition: (f) => [f.lng, f.lat],
    origin: FIELD_CENTRE,
    cellSize: 500,
  });
  const near = index.near(FIELD_CENTRE, 700);
  assert.ok(near.length < data.length / 2,
    `pruned to ${near.length} of ${data.length}`);
});

test('spatialIndex reaches further when the radius exceeds a cell', () => {
  const data = fieldData();
  const index = spatialIndex(data, {
    getPosition: (f) => [f.lng, f.lat],
    origin: FIELD_CENTRE,
    cellSize: 200,   // much smaller than the query radius
  });
  // Every member is within 1 km, so a 1.2 km query must reach all of them
  // despite the small cells — this is the `reach` calculation.
  assert.equal(index.near(FIELD_CENTRE, 1200).length, data.length);
});

test('computeField lays a lens per populated centre and skips sparse ones', () => {
  const data = fieldData();
  const centres = hexLattice({ center: FIELD_CENTRE, radius: 2000, spacing: 500 });
  const field = computeField({
    centres,
    data,
    getPosition: (f) => [f.lng, f.lat],
    selection: { type: 'disc', radius: 250 },
    binning: { mode: 'angular', bins: 8 },
    marks: { type: 'bar' },
    ring: { radius: 20 },
    minCount: 3,
  });
  assert.equal(field.stats.centres, centres.length);
  assert.ok(field.lenses.length > 0, 'some cells hold data');
  assert.ok(field.stats.skipped > 0, 'and the empty ones are skipped');
  assert.equal(field.stats.drawn + field.stats.skipped, centres.length);
  for (const lens of field.lenses) {
    assert.ok(lens.stats.count >= 3, 'no lens below minCount survives');
  }
});

test('non-overlapping cells never double-count a member', () => {
  const data = fieldData();
  const spacing = 500;
  const centres = hexLattice({ center: FIELD_CENTRE, radius: 2500, spacing });
  const field = computeField({
    centres,
    data,
    getPosition: (f) => [f.lng, f.lat],
    // Radius at half the spacing: discs touch but do not overlap.
    selection: { type: 'disc', radius: spacing * 0.5 },
    binning: { mode: 'angular', bins: 8 },
    marks: { type: 'bar' },
    ring: { radius: 20 },
    minCount: 1,
  });
  assert.ok(field.stats.members <= data.length,
    `${field.stats.members} binned from ${data.length} places`);
});

test('a field shares one baseline rather than one per cell', () => {
  const data = fieldData();
  const centres = hexLattice({ center: FIELD_CENTRE, radius: 1500, spacing: 600 });
  const config = {
    centres,
    data,
    getPosition: (f) => [f.lng, f.lat],
    selection: { type: 'disc', radius: 300 },
    binning: { mode: 'categorical', category: (f) => f.category },
    normalisation: { mode: 'lq' },
    marks: { type: 'bar' },
    ring: { radius: 20 },
    minCount: 1,
  };
  const field = computeField(config);
  const expected = fieldBaseline(data, config);
  assert.deepEqual(field.baseline, expected);
  // The baseline covers every category present anywhere, not just locally.
  assert.deepEqual(Object.keys(field.baseline).sort(), ['food', 'retail']);
});

test('computeField degrades gracefully with no centres', () => {
  const field = computeField({ centres: [], data: fieldData() });
  assert.deepEqual(field.lenses, []);
  assert.equal(field.stats.drawn, 0);
});

test('level of detail sheds chrome as the ring shrinks', () => {
  const style = resolveStyle({});
  assert.equal(resolveLod(150, style), null, 'a big lens keeps everything');

  const compact = resolveLod(40, style);
  assert.equal(compact.showLabels, false);
  assert.equal(compact.compass, false);

  const minimal = resolveLod(8, style);
  assert.equal(minimal.structure, 'none', 'within-unit chrome goes too');
  assert.equal(minimal.centreDot, 0);
});

test('level of detail can be switched off entirely', () => {
  assert.equal(resolveLod(8, resolveStyle({ lod: false })), null);
});

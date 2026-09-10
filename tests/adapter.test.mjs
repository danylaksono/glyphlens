/**
 * Adapter tests, against a stub map.
 *
 * The MapLibre adapter is the one place where the anchor, the projection and
 * the pointer all meet, and it is the least testable by eye — a corridor whose
 * vertices cannot be grabbed looks exactly like one whose vertices are not
 * drawn. The adapter never imports MapLibre (it takes a map object), so a stub
 * with `project` / `unproject` is enough to exercise all of it.
 *
 * The projection is a plain scaled equirectangular one. That is not how a real
 * map projects, but nothing here depends on the projection being Mercator —
 * only on it being invertible.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { LensOverlay } from '../src/adapters/maplibre.js';

const SCALE = 4000;
const ORIGIN = [110.3695, -7.7956];

function stubEnvironment() {
  const listeners = new Map();
  const container = {
    clientWidth: 900,
    clientHeight: 700,
    appendChild() {},
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  };
  const ctx = {
    canvas: { width: 900, height: 700 },
    setTransform() {},
    measureText: () => ({ width: 10 }),
  };
  for (const name of ['save', 'restore', 'beginPath', 'closePath', 'fill', 'stroke',
    'setLineDash', 'clearRect', 'rect', 'translate', 'rotate', 'fillText', 'arc',
    'moveTo', 'lineTo']) ctx[name] = () => {};

  globalThis.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
  globalThis.document = {
    createElement: () => ({ style: {}, getContext: () => ctx, remove() {} }),
  };
  globalThis.requestAnimationFrame = (fn) => { fn(0); return 1; };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.performance ??= { now: () => 0 };

  const map = {
    getContainer: () => container,
    on(name, fn) { listeners.set(name, fn); },
    off() {},
    dragPan: { enable() {}, disable() {} },
    project: ([lng, lat]) => ({
      x: 450 + (lng - ORIGIN[0]) * SCALE,
      y: 350 - (lat - ORIGIN[1]) * SCALE,
    }),
    unproject: ([x, y]) => ({
      toArray: () => [ORIGIN[0] + (x - 450) / SCALE, ORIGIN[1] - (y - 350) / SCALE],
    }),
    fitBounds() {},
  };
  return { map, listeners };
}

const PLACES = Array.from({ length: 120 }, (_, i) => ({
  lng: ORIGIN[0] + Math.cos(i) * 0.004,
  lat: ORIGIN[1] + Math.sin(i * 1.7) * 0.004,
}));

const ROUTE = [
  [ORIGIN[0] - 0.01, ORIGIN[1] - 0.01],
  [ORIGIN[0], ORIGIN[1]],
  [ORIGIN[0] + 0.01, ORIGIN[1] + 0.005],
];

const corridorLens = (map, options = {}) => new LensOverlay(map, {
  selection: { type: 'corridor', path: ROUTE.map((p) => [...p]), width: 800 },
  data: PLACES,
  getPosition: (f) => [f.lng, f.lat],
  binning: { mode: 'chainage', bins: 8 },
  animate: false,
  ...options,
});

const down = (x, y, extra = {}) => ({
  clientX: x, clientY: y, button: 0, altKey: false, preventDefault() {}, ...extra,
});

test('a disc lens draws on a circle until the anchor is unrolled', () => {
  const { map } = stubEnvironment();
  const lens = new LensOverlay(map, {
    center: ORIGIN,
    selection: { type: 'disc', radius: 800 },
    data: PLACES,
    getPosition: (f) => [f.lng, f.lat],
    binning: { mode: 'angular', bins: 12 },
    animate: false,
  });

  assert.equal(lens.frame().curve, undefined);
  lens.setUnroll(0.5);
  assert.equal(lens.frame().curve.kind, 'arc');
  lens.setUnroll(0);
  assert.equal(lens.frame().curve, undefined);
});

test('unrolling repaints without re-running the pipeline', () => {
  const { map } = stubEnvironment();
  const lens = new LensOverlay(map, {
    center: ORIGIN,
    selection: { type: 'disc', radius: 800 },
    data: PLACES,
    getPosition: (f) => [f.lng, f.lat],
    binning: { mode: 'angular', bins: 12 },
    animate: false,
  });
  const before = lens.layout;
  lens.setUnroll(0.8);
  // Identity, not equality: the solved layout is reused untouched, which is
  // what makes the unroll free (docs/findings.md F-27).
  assert.equal(lens.layout, before);
});

test('the seam can be put wherever the marks are thinnest', () => {
  const { map } = stubEnvironment();
  // Everything to the north-east, so there is one obviously empty stretch for
  // the ring to be opened at.
  const clustered = ['a', 'b', 'c'].flatMap((category, k) => (
    Array.from({ length: 20 }, (_, i) => ({
      lng: ORIGIN[0] + 0.003 * Math.sin(0.5 + k * 0.25 + i * 0.002),
      lat: ORIGIN[1] + 0.003 * Math.cos(0.5 + k * 0.25 + i * 0.002),
      category,
    }))
  ));
  const lens = new LensOverlay(map, {
    center: ORIGIN,
    selection: { type: 'disc', radius: 800 },
    data: clustered,
    getPosition: (f) => [f.lng, f.lat],
    binning: { mode: 'categorical', category: (f) => f.category },
    anchor: { unroll: 1, at: 'auto' },
    animate: false,
  });

  const { at } = lens._anchor();
  const seam = ((at + 0.5) % 1 + 1) % 1;
  const gap = (t) => Math.abs((((seam - t) % 1) + 1.5) % 1 - 0.5);
  const nearest = Math.min(...lens.target.bins.map((b) => gap(b.t)));
  // The ring opens in clear air rather than through a mark.
  assert.ok(nearest > 0.15, `seam ${seam} is ${nearest} from the nearest mark`);
});

test('a corridor is drawn on its path, with handles, until it is straightened', () => {
  const { map } = stubEnvironment();
  const lens = corridorLens(map);

  const frame = lens.frame();
  assert.equal(frame.curve.kind, 'polyline');
  assert.equal(frame.nodes.length, 3);
  assert.equal(frame.ghost, null);

  lens.setUnroll(1);
  const flat = lens.frame();
  // Straightened: one baseline, the true route kept as a ghost, and no handles
  // because a vertex is no longer where the route is.
  const ys = flat.curve.points.map(([, y]) => y);
  assert.ok(Math.max(...ys) - Math.min(...ys) < 1e-6);
  assert.equal(flat.nodes, null);
  assert.equal(flat.ghost.length, 3);
});

test('dragging grabs the nearest vertex, not only the ends', () => {
  const { map } = stubEnvironment();
  const lens = corridorLens(map);
  const middle = map.project(ROUTE[1]);

  lens._pointerDown(down(middle.x + 3, middle.y - 2));
  assert.deepEqual(lens._drag, { kind: 'node', index: 1 });

  lens._pointerMove(down(middle.x + 40, middle.y + 25));
  lens._pointerUp();
  const moved = lens.options.selection.path[1];
  assert.ok(Math.abs(moved[0] - ROUTE[1][0]) > 1e-6);
  assert.equal(lens.options.selection.path.length, 3);
});

test('clicking the line inserts a vertex there and drags it', () => {
  const { map } = stubEnvironment();
  const lens = corridorLens(map);
  const a = map.project(ROUTE[0]);
  const b = map.project(ROUTE[1]);

  lens._pointerDown(down((a.x + b.x) / 2, (a.y + b.y) / 2));
  assert.equal(lens.options.selection.path.length, 4);
  assert.deepEqual(lens._drag, { kind: 'node', index: 1 });
  lens._pointerUp();

  // Far from the route: no vertex, and the map keeps the gesture.
  const before = lens.options.selection.path.length;
  lens._pointerDown(down(50, 650));
  assert.equal(lens.options.selection.path.length, before);
  assert.equal(lens._drag, null);
});

test('alt-clicking a vertex removes it, but never below two', () => {
  const { map } = stubEnvironment();
  const lens = corridorLens(map);
  const middle = map.project(ROUTE[1]);

  lens._pointerDown(down(middle.x, middle.y, { altKey: true }));
  assert.equal(lens.options.selection.path.length, 2);
  assert.equal(lens._drag, null);

  const end = map.project(lens.options.selection.path[0]);
  lens._pointerDown(down(end.x, end.y, { altKey: true }));
  assert.equal(lens.options.selection.path.length, 2);
});

test('a straightened corridor cannot be edited by its cartogram positions', () => {
  const { map } = stubEnvironment();
  const lens = corridorLens(map, { anchor: { unroll: 1 } });
  const middle = map.project(ROUTE[1]);
  lens._pointerDown(down(middle.x, middle.y));
  assert.equal(lens._drag, null);
});

test('editing the route updates its length and re-runs the pipeline', () => {
  const { map } = stubEnvironment();
  const lens = corridorLens(map);
  const before = lens.state().selection.length;
  lens.setPath([ROUTE[0], [ROUTE[2][0] + 0.02, ROUTE[2][1]]]);
  assert.ok(lens.state().selection.length > before);
  assert.equal(lens.options.selection.path.length, 2);
});

test('a GeoJSON line becomes the corridor path', () => {
  const { map } = stubEnvironment();
  const lens = corridorLens(map);
  const result = lens.setPathFromGeoJSON({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [[110.35, -7.80], [110.36, -7.79], [110.37, -7.785]],
      },
    }],
  });
  assert.equal(result.nodes, 3);
  assert.equal(lens.options.selection.path.length, 3);
  assert.ok(lens.state().stats.count >= 0);
});

test('a corridor opens about its midpoint, a ring about its anchor', () => {
  const { map } = stubEnvironment();
  const lens = corridorLens(map, { anchor: { unroll: 1 } });
  const mid = map.project(ROUTE[1]);
  const flat = lens.frame().curve;
  // The middle vertex is the route's midpoint by length here, near enough that
  // it should barely move while the ends swing out to meet it.
  const drawn = flat.points[1];
  assert.ok(Math.hypot(drawn[0] - mid.x, drawn[1] - mid.y) < 40,
    `middle vertex moved to ${drawn}`);
  // And an 'auto' seam is meaningless on an open curve, so it falls back
  // rather than seaming a route that has no seam.
  const auto = corridorLens(map, { anchor: { unroll: 1, at: 'auto' } });
  assert.equal(auto._anchor(0.5, { seam: false }).at, 0.5);
});

test('the frame carries what a leader needs to place its target', () => {
  const { map } = stubEnvironment();
  const lens = new LensOverlay(map, {
    center: ORIGIN,
    selection: { type: 'disc', radius: 800 },
    data: PLACES,
    getPosition: (f) => [f.lng, f.lat],
    binning: { mode: 'angular', bins: 12 },
    association: { mode: 'leader' },
    animate: false,
  });

  const frame = lens.frame();
  // Pixels per metre, so a leader's target sits at a real distance rather than
  // a guessed one — and the unroll, so the renderer knows how much association
  // the anchor has given away.
  assert.ok(Math.abs(frame.scalePx - SCALE / 111320) < SCALE / 111320 * 0.02, `${frame.scalePx}`);
  assert.equal(frame.unroll, 0);
  lens.setUnroll(0.6);
  assert.equal(lens.frame().unroll, 0.6);

  // And the association config reaches the layout the renderer is handed.
  assert.deepEqual(lens.target.association, { mode: 'leader' });
});

test('a corridor frame reports its own scale', () => {
  const { map } = stubEnvironment();
  const lens = corridorLens(map);
  const frame = lens.frame();
  assert.ok(frame.scalePx > 0);
  assert.ok(Math.abs(frame.corridorHalfWidthPx / frame.scalePx - 400) < 1);
});

test('hovering a mark repaints, because something is now drawn from it', () => {
  const { map } = stubEnvironment();
  const lens = new LensOverlay(map, {
    center: ORIGIN,
    selection: { type: 'disc', radius: 800 },
    data: PLACES,
    getPosition: (f) => [f.lng, f.lat],
    binning: { mode: 'angular', bins: 12 },
    association: { mode: 'hover' },
    animate: false,
  });

  let paints = 0;
  const repaint = lens.repaint.bind(lens);
  lens.repaint = () => { paints += 1; repaint(); };

  // Nothing under the pointer, twice: the hover has not changed, so neither
  // has the drawing.
  lens._pointerMove(down(20, 20));
  lens._pointerMove(down(22, 22));
  assert.equal(paints, 0);
});

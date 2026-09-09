/**
 * Renderer smoke tests.
 *
 * The core is pure and well covered, but the renderer is where the anchor,
 * the mark orientation and the curve kind all meet, and it is the one part
 * that cannot be checked by reading a returned object. A recording context is
 * enough: these assert that every point in the drawing design space paints
 * something, paints it in the right place, and never throws — which is exactly
 * the class of bug the unroll could introduce.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { computeLens } from '../src/core/layout.js';
import { LensRenderer } from '../src/render/LensRenderer.js';
import { arcCurve, polylineCurve, straightenPath } from '../src/core/curve.js';

/** A CanvasRenderingContext2D that records what it was asked to draw. */
function recorder() {
  const calls = [];
  const points = [];
  const ctx = {
    canvas: { width: 800, height: 600 },
    calls,
    points,
    measureText: (t) => ({ width: String(t).length * 6 }),
    setTransform() {},
  };
  const noop = ['save', 'restore', 'beginPath', 'closePath', 'fill', 'stroke',
    'setLineDash', 'clearRect', 'rect', 'translate', 'rotate', 'fillText',
    'clip', 'arc', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo'];
  for (const name of noop) {
    ctx[name] = (...args) => {
      calls.push([name, ...args]);
      if (name === 'moveTo' || name === 'lineTo' || name === 'arc') {
        points.push([args[0], args[1]]);
      }
      if (name === 'fillText') points.push([args[1], args[2]]);
    };
  }
  return ctx;
}

const PLACES = Array.from({ length: 240 }, (_, i) => {
  const angle = (i / 240) * Math.PI * 2;
  const r = 0.004 * (0.3 + ((i * 37) % 100) / 100);
  return {
    lng: 110.3695 + Math.cos(angle) * r,
    lat: -7.7956 + Math.sin(angle) * r * 0.6,
    category: ['food', 'retail', 'civic'][i % 3],
  };
});

const ringLens = (config = {}) => computeLens({
  center: [110.3695, -7.7956],
  selection: { type: 'disc', radius: 900 },
  data: PLACES,
  getPosition: (f) => [f.lng, f.lat],
  binning: { mode: 'angular', bins: 12, category: (f) => f.category },
  ring: { radius: 150 },
  ...config,
});

const corridorLens = (config = {}) => computeLens({
  selection: {
    type: 'corridor',
    path: [[110.362, -7.762], [110.370, -7.790], [110.376, -7.824]],
    width: 900,
  },
  data: PLACES,
  getPosition: (f) => [f.lng, f.lat],
  binning: { mode: 'chainage', bins: 10 },
  ring: { radius: 150 },
  ...config,
});

const bounds = (pts) => pts.reduce((b, [x, y]) => (
  Number.isFinite(x) && Number.isFinite(y)
    ? [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]
    : b
), [Infinity, Infinity, -Infinity, -Infinity]);

test('a ring lens paints at every curvature, orientation and structure', () => {
  const layout = ringLens();
  for (const unroll of [0, 0.25, 0.5, 0.9, 1]) {
    for (const orient of ['normal', 'up', 'upright']) {
      for (const structure of ['none', 'spread', 'gradient', 'inclusions', 'both']) {
        const ctx = recorder();
        const renderer = new LensRenderer({ structure });
        const marks = { ...layout.marks, orient };
        renderer.draw(ctx, { ...layout, marks }, {
          cx: 400,
          cy: 300,
          selectionRadiusPx: 120,
          curve: arcCurve(400, 300, 150, { unroll }),
        });
        assert.ok(ctx.calls.length > 20, `${unroll}/${orient}/${structure}`);
        assert.ok(
          ctx.points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)),
          `non-finite coordinate at ${unroll}/${orient}/${structure}`,
        );
      }
    }
  }
});

test('unrolling widens the drawing and flattens it onto one baseline', () => {
  const layout = ringLens();
  const paint = (unroll) => {
    const ctx = recorder();
    new LensRenderer({ structure: 'none', compass: false })
      .draw(ctx, layout, {
        cx: 400,
        cy: 300,
        selectionRadiusPx: 0,
        curve: arcCurve(400, 300, 150, { unroll }),
      });
    return bounds(ctx.points);
  };
  const closed = paint(0);
  const open = paint(1);
  const width = (b) => b[2] - b[0];
  const height = (b) => b[3] - b[1];
  // Laid out flat, the drawing spans the ring's own circumference — the length
  // is conserved, which is the property the whole unroll rests on.
  const circumference = 2 * Math.PI * 150;
  assert.ok(Math.abs(width(open) - circumference) < circumference * 0.05,
    `${width(open)} vs ${circumference}`);
  assert.ok(width(open) > width(closed) * 1.4, `${width(open)} vs ${width(closed)}`);
  // And it is much shorter: everything sits on one line, marks growing off it,
  // rather than reaching out in every direction.
  assert.ok(height(open) < height(closed) * 0.75, `${height(open)} vs ${height(closed)}`);
});

test('a corridor paints on its true path and on a straightened one', () => {
  const layout = corridorLens();
  const pts = [[120, 80], [260, 300], [300, 520]];
  for (const unroll of [0, 0.5, 1]) {
    const ctx = recorder();
    new LensRenderer({ structure: 'both' }).draw(ctx, layout, {
      cx: pts[0][0],
      cy: pts[0][1],
      selectionRadiusPx: 0,
      corridorHalfWidthPx: 40,
      curve: polylineCurve(straightenPath(pts, unroll), { closed: false }),
      ghost: unroll > 0 ? pts : null,
      nodes: unroll === 0 ? pts : null,
    });
    assert.ok(ctx.calls.length > 20);
    assert.ok(ctx.points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
  }
});

test('hit testing follows the marks through the unroll', () => {
  const layout = ringLens({ binning: { mode: 'angular', bins: 8 } });
  const renderer = new LensRenderer();
  for (const unroll of [0, 0.4, 1]) {
    const curve = arcCurve(400, 300, 150, { unroll });
    const frame = { cx: 400, cy: 300, selectionRadiusPx: 120, curve };
    const bin = layout.bins.find((b) => b.size > 8);
    // Halfway up the mark, on its own axis: inside by construction.
    const [px, py] = curve.pointAt(bin.t);
    const [nx, ny] = curve.normalAt(bin.t);
    const hit = renderer.hitTest(layout, frame, px + nx * bin.size * 0.5, py + ny * bin.size * 0.5);
    assert.equal(hit?.key, bin.key, `unroll ${unroll}`);
    // Well outside every mark.
    assert.equal(renderer.hitTest(layout, frame, 780, 580), null, `unroll ${unroll} miss`);
  }
});

test('hit testing follows the marks when they are stood upright', () => {
  const layout = ringLens({ binning: { mode: 'angular', bins: 8 } });
  const marks = { ...layout.marks, orient: 'up' };
  const renderer = new LensRenderer();
  const curve = arcCurve(400, 300, 150, { unroll: 0.6 });
  const frame = { cx: 400, cy: 300, selectionRadiusPx: 120, curve };
  const bin = layout.bins.find((b) => b.size > 8);
  const [px, py] = curve.pointAt(bin.t);
  const hit = renderer.hitTest({ ...layout, marks }, frame, px, py - bin.size * 0.5);
  assert.equal(hit?.key, bin.key);
});

test('the renderer still paints a plain ring exactly as it did', () => {
  // The unroll must be free at zero: a closed ring is drawn through the same
  // code path it always was.
  const layout = ringLens();
  const withCurve = recorder();
  const withoutCurve = recorder();
  const frame = { cx: 400, cy: 300, selectionRadiusPx: 120 };
  new LensRenderer().draw(withCurve, layout, { ...frame, curve: arcCurve(400, 300, 150, { unroll: 0 }) });
  new LensRenderer().draw(withoutCurve, layout, frame);
  assert.deepEqual(withCurve.calls, withoutCurve.calls);
});

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
import { LensRenderer, leaderAnchors, leaderGap } from '../src/render/LensRenderer.js';
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
  // Colours are recorded too: several things stroke thin lines, and telling a
  // leader from a displacement tick means knowing which pen was in hand.
  for (const prop of ['strokeStyle', 'fillStyle', 'globalAlpha', 'lineWidth']) {
    let value;
    Object.defineProperty(ctx, prop, {
      get: () => value,
      set: (v) => { value = v; calls.push([`set:${prop}`, v]); },
    });
  }
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

// ------------------------------------------------------------------ leaders

const RING_FRAME = {
  cx: 400,
  cy: 300,
  selectionRadiusPx: 120,
  scalePx: 120 / 900, // px per metre, matching the 900 m selection
};

test('a leader points at the mean position of what its mark counts', () => {
  const layout = ringLens({ binning: { mode: 'angular', bins: 8 } });
  const curve = arcCurve(400, 300, 150, { unroll: 1 });
  const bin = layout.bins.find((b) => b.count > 3);

  const [from, to] = leaderAnchors(layout, bin, curve, { ...RING_FRAME, curve });
  assert.deepEqual(from.map(Math.round), curve.pointAt(bin.t).map(Math.round));

  // The target sits at the bin's own bearing and its members' mean distance,
  // in the lens's azimuthal frame.
  const bearing = bin.meanBearing ?? bin.bearing;
  const expected = ((bearing - 90) / 180) * Math.PI;
  const actual = Math.atan2(to[1] - RING_FRAME.cy, to[0] - RING_FRAME.cx);
  assert.ok(Math.abs(Math.atan2(Math.sin(actual - expected), Math.cos(actual - expected))) < 1e-6);
  const distance = Math.hypot(to[0] - RING_FRAME.cx, to[1] - RING_FRAME.cy) / RING_FRAME.scalePx;
  assert.ok(Math.abs(distance - bin.structure.radial.mean) < 1e-6);
});

test('a leader has nothing to point at without a scale or a bearing', () => {
  const layout = ringLens({ binning: { mode: 'angular', bins: 8 } });
  const curve = arcCurve(400, 300, 150, { unroll: 1 });
  const bin = layout.bins.find((b) => b.count > 3);

  // No pixels-per-metre and no selection radius: guessing a distance would be
  // worse than drawing nothing.
  assert.equal(leaderAnchors(layout, bin, curve, { cx: 400, cy: 300 }), null);

  // Distance bands carry no direction, so there is no position to point at.
  const radial = ringLens({ binning: { mode: 'radial', rings: 4 } });
  const band = radial.bins.find((b) => b.count > 3);
  assert.equal(leaderAnchors(radial, band, curve, RING_FRAME), null);
});

test('the selection radius stands in for an explicit scale', () => {
  const layout = ringLens({ binning: { mode: 'angular', bins: 8 } });
  const curve = arcCurve(400, 300, 150, { unroll: 1 });
  const bin = layout.bins.find((b) => b.count > 3);
  const withScale = leaderAnchors(layout, bin, curve, { ...RING_FRAME, curve });
  const derived = leaderAnchors(layout, bin, curve, {
    cx: 400, cy: 300, selectionRadiusPx: 120, curve,
  });
  assert.deepEqual(derived[1].map((v) => v.toFixed(6)), withScale[1].map((v) => v.toFixed(6)));
});

test('on a straightened route the leader reaches back to the true path', () => {
  const layout = corridorLens();
  const pts = [[120, 80], [260, 300], [300, 520]];
  const curve = polylineCurve(straightenPath(pts, 1), { closed: false });
  const bin = layout.bins.find((b) => b.count > 0);
  const frame = {
    cx: pts[0][0], cy: pts[0][1], selectionRadiusPx: 0,
    corridorHalfWidthPx: 40, ghost: pts, curve,
  };

  const [, to] = leaderAnchors(layout, bin, curve, frame);
  const ghost = polylineCurve(pts, { closed: false });
  const [gx, gy] = ghost.pointAt(bin.preferredT ?? bin.t);
  // Within the corridor's half-width of the route at its own chainage.
  assert.ok(Math.hypot(to[0] - gx, to[1] - gy) <= 40 + 1e-6);
});

test('association modes decide when a leader is drawn', () => {
  const layout = ringLens({ binning: { mode: 'angular', bins: 8 } });
  const paint = (association, unroll) => {
    const ctx = recorder();
    new LensRenderer({ compass: false, structure: 'none' }).draw(
      ctx,
      { ...layout, association },
      { ...RING_FRAME, unroll, curve: arcCurve(400, 300, 150, { unroll }) },
    );
    // Leaders are the only thing that draws a filled dot away from the curve.
    return ctx.calls.filter(([name, , , r]) => name === 'arc' && r === 2).length;
  };

  // Closed ring, each mark on its own wedge: adjacency is doing the work.
  assert.equal(paint({ mode: 'auto' }, 0), 0);
  // Unrolled, it is not, so they fade in.
  assert.ok(paint({ mode: 'auto' }, 1) > 4);
  // Explicitly on, and explicitly off.
  assert.ok(paint({ mode: 'leader' }, 0) > 4);
  assert.equal(paint({ mode: 'adjacency' }, 1), 0);
  // Hover-only, with nothing hovered.
  assert.equal(paint({ mode: 'hover' }, 1), 0);
});

test('the leader measures the gap the solver does not report', () => {
  const categorical = { mode: 'categorical', category: (f) => f.category };

  // Block placement puts every mark in a nominal slot, so the solver was never
  // asked for a bearing and reports no displacement — while the marks are as
  // far from their data as they can be. That is the layout leaders exist for.
  const block = ringLens({ binning: categorical, placement: { mode: 'block' } });
  assert.ok(block.bins.every((b) => Math.abs(b.displacement ?? 0) < 1e-9));
  assert.ok(block.bins.filter((b) => leaderGap(b) > 90).length >= 2);

  // Where the solver did the moving, the two agree exactly.
  const necklace = ringLens({
    binning: categorical,
    placement: { mode: 'necklace' },
    marks: { type: 'bar', barWidth: 40 },
  });
  for (const b of necklace.bins) {
    assert.ok(Math.abs(leaderGap(b) - Math.abs(b.displacement)) < 1e-6);
  }
  assert.ok(necklace.bins.some((b) => leaderGap(b) > 6));

  // And a bin that owns its own wedge is not displaced at all.
  for (const b of ringLens({ binning: { mode: 'angular', bins: 24 } }).bins) {
    assert.ok(leaderGap(b) < 1e-6);
  }
});

test('a leader replaces the displacement tick it supersedes', () => {
  // Wide bars on three categories collide, so the solver has to slide them off
  // their bearings — the case the tick was invented for.
  const layout = ringLens({
    binning: { mode: 'categorical', category: (f) => f.category },
    placement: { mode: 'necklace' },
    marks: { type: 'bar', barWidth: 40 },
  });
  const paint = (association) => {
    const ctx = recorder();
    new LensRenderer({ compass: false, structure: 'none', displacementColor: '#f00' })
      .draw(ctx, { ...layout, association }, { ...RING_FRAME, unroll: 0 });
    // Strokes drawn with the displacement pen, whatever shape they are.
    let pen = null;
    let ticks = 0;
    for (const [name, value] of ctx.calls) {
      if (name === 'set:strokeStyle') pen = value;
      if (name === 'stroke' && pen === '#f00') ticks += 1;
    }
    const dots = ctx.calls.filter(([name, , , r]) => name === 'arc' && r === 2).length;
    return { ticks, dots };
  };

  const adjacency = paint({ mode: 'adjacency' });
  const leaders = paint({ mode: 'leader' });
  assert.ok(adjacency.ticks > 0, 'the solver should have displaced a mark');
  assert.equal(adjacency.dots, 0);
  // Every displaced mark now carries a leader instead — not both.
  assert.ok(leaders.dots >= adjacency.ticks, `${leaders.dots} leaders, ${adjacency.ticks} ticks`);
  assert.equal(leaders.ticks, 0);
});

test('level of detail measures the drawing, not the ring', () => {
  // A small ring sheds its chrome; the same ring unrolled into a strip has room
  // for it again (docs/findings.md F-30).
  const layout = ringLens({ binning: { mode: 'angular', bins: 8 } });
  const dots = (unroll) => {
    const ctx = recorder();
    new LensRenderer({ structure: 'none' }).draw(
      ctx,
      { ...layout, association: { mode: 'leader' } },
      {
        cx: 400,
        cy: 300,
        ringRadius: 46,
        selectionRadiusPx: 120,
        scalePx: 120 / 900,
        unroll,
        curve: arcCurve(400, 300, 46, { unroll }),
      },
    );
    return ctx.calls.filter(([name, , , r]) => name === 'arc' && r === 2).length;
  };
  assert.equal(dots(0), 0);
  assert.ok(dots(1) > 4);
});

// ------------------------------------------------- the within-unit frame

test('the within-unit layer follows the chart or stays on the route', () => {
  const layout = corridorLens();
  const pts = [[120, 80], [260, 300], [300, 520]];
  const straight = straightenPath(pts, 1);
  const curve = polylineCurve(straight, { closed: false });

  const members = (structureFrame) => {
    const ctx = recorder();
    new LensRenderer({ compass: false }).draw(
      ctx,
      { ...layout, marks: { ...layout.marks, structure: 'inclusions', structureFrame } },
      {
        cx: pts[0][0],
        cy: pts[0][1],
        selectionRadiusPx: 0,
        corridorHalfWidthPx: 40,
        curve,
        ghost: pts,
        unroll: 1,
        association: { mode: 'adjacency' },
      },
    );
    // Members are the only thing drawn as small filled circles.
    return ctx.calls
      .filter(([name, , , r]) => name === 'arc' && r > 0 && r < 3)
      .map(([, x, y]) => [x, y]);
  };

  const inStrip = members('unit');
  const onRoute = members('geographic');
  assert.ok(inStrip.length > 10 && onRoute.length === inStrip.length);

  const near = (p, line) => {
    let best = Infinity;
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, ay] = line[i];
      const [bx, by] = line[i + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const u = Math.min(1, Math.max(0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy)));
      best = Math.min(best, Math.hypot(p[0] - (ax + dx * u), p[1] - (ay + dy * u)));
    }
    return best;
  };
  // Each set is inside the band it was drawn against — that is the claim.
  for (const p of inStrip) assert.ok(near(p, straight) <= 41, `${p} outside the strip`);
  for (const p of onRoute) assert.ok(near(p, pts) <= 41, `${p} outside the route`);

  // And the two really are different places: the route leaves the strip, so
  // some members have to leave it too. (Only some — where the straightened
  // route still runs through its own true position, the frames agree.)
  const farFromStrip = onRoute.filter((p) => near(p, straight) > 41).length;
  const farFromRoute = inStrip.filter((p) => near(p, pts) > 41).length;
  assert.ok(farFromStrip > 0, 'geographic members never left the strip');
  assert.ok(farFromRoute > 0, 'strip members never left the route');
});

test('the two frames are the same thing until an anchor is straightened', () => {
  const layout = corridorLens();
  const pts = [[120, 80], [260, 300], [300, 520]];
  const paint = (structureFrame) => {
    const ctx = recorder();
    new LensRenderer({ compass: false }).draw(
      ctx,
      { ...layout, marks: { ...layout.marks, structure: 'both', structureFrame } },
      {
        cx: pts[0][0],
        cy: pts[0][1],
        selectionRadiusPx: 0,
        corridorHalfWidthPx: 40,
        curve: polylineCurve(pts, { closed: false }),
        ghost: null,
        unroll: 0,
      },
    );
    return ctx.calls;
  };
  assert.deepEqual(paint('unit'), paint('geographic'));
});

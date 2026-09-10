/**
 * Canvas renderer for a lens layout.
 *
 * Canvas rather than SVG because the sketches this replaces re-bound a D3 SVG
 * overlay on every `move` event, and the DOM churn was the visible stutter
 * (docs/findings.md F-3). The cost is arc text and hit-testing by hand; both
 * are here.
 *
 * The renderer is pure: give it a layout and a frame, it paints. It holds no
 * state, so a caller can paint several lenses onto one canvas — which is what
 * the small-multiples and tessellated cases will need (F-2, property 1).
 */

import { resolveStyle, resolveLod, colorFor } from './style.js';
import { circleCurve, polylineCurve, wrap01, cyclicDelta } from '../core/curve.js';

const TAU = Math.PI * 2;

export class LensRenderer {
  constructor(style = {}) {
    // The *unresolved* options are kept, not just the resolved result. Merging
    // into a resolved style makes presets one-way: every key the first resolve
    // filled in would then override the new preset, so switching from `paper`
    // to `night` would change nothing (docs/findings.md F-26).
    this._options = { ...style };
    this.style = resolveStyle(this._options);
  }

  setStyle(style) {
    this._options = { ...this._options, ...style };
    this.style = resolveStyle(this._options);
  }

  /** The options as given, before defaults and presets were applied. */
  get options() {
    return { ...this._options };
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} layout  from `computeLens`
   * @param {object} frame
   * @param {number} frame.cx  lens centre, canvas px
   * @param {number} frame.cy
   * @param {number} frame.selectionRadiusPx  geographic selection radius, in px
   * @param {number} [frame.ringRadius]       overrides the layout's ring radius
   */
  draw(ctx, layout, frame) {
    const { cx, cy, selectionRadiusPx } = frame;
    const ring = frame.ringRadius ?? layout.ring.radius;
    const curve = frame.curve ?? circleCurve(cx, cy, ring);
    // How far the anchor has been opened. A straightened corridor carries this
    // on the frame, because a polyline has no curvature to read it from.
    const unroll = frame.unroll ?? curve.unroll ?? 0;
    // A lens drawn at a dozen pixels cannot carry the chrome that reads well at
    // a hundred and fifty. Applied here rather than by the caller so a field
    // and a single lens share one rule — and measured on the drawing rather
    // than the ring, because an unrolled lens is much the bigger of the two.
    const lod = resolveLod(ring, this.style, unroll);
    const s = lod ? { ...this.style, ...lod } : this.style;
    // Helpers read the effective style for the duration of this paint, the
    // same way `_valueFloor` is shared. Cleared at the end so the renderer
    // does not carry one lens's level of detail into the next.
    this._s = s;

    // Marks are placed on a curve, never on "the ring". A disc lens supplies
    // none and gets a circle; a corridor lens supplies its projected path. This
    // is the property F-2 asks the core to preserve, exercised for real.
    // The question the renderer actually needs is not "is this a circle" but
    // "does this lens have a centre and a disc-shaped selection" — which a
    // partly unrolled ring still does, and a corridor never did. Where true
    // circular geometry is needed (annular sectors, arc text) `arcBasis` asks
    // for it directly, and gets an answer for any curvature.
    const ringLike = curve.kind !== 'polyline';
    // Which way a mark grows from its anchor. `normal` is the curve's own
    // outward normal; the rest trade adjacency for a common baseline direction
    // (docs/design-space.md 3.5).
    const orient = layout.marks?.orient ?? s.orient ?? 'normal';

    ctx.save();

    // Where the anchor has been flattened, the true geography is drawn behind
    // it: an unrolled corridor is a cartogram, and a cartogram with nothing to
    // read it against is just a chart (docs/findings.md F-28).
    if (frame.ghost?.length > 1) this._drawGhost(ctx, frame.ghost, frame.corridorHalfWidthPx);

    // A field's cell, when the caller wants to see where one lens ends and the
    // next begins. Under everything else, because it is a frame of reference
    // rather than a reading.
    if (frame.cell) this._drawCell(ctx, cx, cy, frame.cell);

    if (ringLike) {
      // A polygon selection supplies its own boundary; a disc, annulus or
      // sector is described by its radius.
      const shape = frame.selectionRings;
      if (s.dimExterior) this._drawDim(ctx, cx, cy, selectionRadiusPx, shape);

      ctx.save();
      ctx.beginPath();
      if (shape?.length) this._traceRings(ctx, shape);
      else if (selectionRadiusPx > 0) ctx.arc(cx, cy, selectionRadiusPx, 0, TAU);
      ctx.setLineDash(s.boundaryDash);
      ctx.strokeStyle = s.boundaryStroke;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    } else {
      this._drawCorridor(ctx, curve, frame.corridorHalfWidthPx);
    }

    // The anchor is a fixed-size instrument, so marks never jump on zoom.
    ctx.beginPath();
    this._tracePath(ctx, curve, ring, cx, cy);
    ctx.strokeStyle = s.ringStroke;
    ctx.lineWidth = s.ringWidth;
    ctx.stroke();

    // With 24+ sectors, labelling every bar is noise. In `auto` mode only bars
    // that carry the reading get a number.
    this._valueFloor =
      s.showValues === 'auto'
        ? Math.max(...layout.bins.map((b) => Math.abs(b.size ?? 0))) * (s.valueFloor ?? 0.35)
        : -Infinity;

    // Matches the layout's own test, so the compass appears exactly when the
    // angular axis is geographic — including categorical bins placed at their
    // mean bearing, which have no `bearing` of their own.
    const geographic = ringLike
      && layout.bins.some((b) => b.bearing != null || b.meanBearing != null);
    // The compass and the bearing axis are one legend at two curvatures, so
    // they cross-fade rather than switch: a rose of ticks inside the ring is
    // unreadable once the ring is nearly straight, and an axis strung along a
    // full circle is just a second ring.
    if (s.compass && geographic) {
      if (unroll < 0.45) this._drawCompass(ctx, cx, cy, ring, 1 - unroll / 0.45);
      if (unroll > 0.15) {
        this._drawBearingAxis(ctx, curve, Math.min(1, (unroll - 0.15) / 0.35));
      }
    }

    // One faint guide per concentric track, so a reader can tell which ring a
    // mark belongs to when tracks are close together.
    if (ringLike) {
      const tracks = [...new Set(layout.bins.map((b) => b.ringOffset ?? 0))]
        .filter((t) => t > 0);
      for (const t of tracks) {
        const guide = sampleCurve(curve, 0, 1, 4, t);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(guide[0][0], guide[0][1]);
        for (let i = 1; i < guide.length; i++) ctx.lineTo(guide[i][0], guide[i][1]);
        ctx.strokeStyle = s.ringStroke;
        ctx.globalAlpha = s.trackOpacity ?? 0.22;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
    }

    // Within-unit structure, under the marks so it never competes with the
    // value reading (docs/findings.md Q-7).
    const structure = layout.marks?.structure ?? s.structure ?? 'none';
    // Straightening an anchor asks a question the closed ring never had to
    // answer: are the members part of the *unit*, and so drawn wherever the
    // unit has been moved to, or part of the *map*, and so left where they
    // are? Both are honest and they read very differently, so it is a choice
    // rather than a default (docs/findings.md F-32). The two frames coincide
    // until an anchor is flattened, which is why nothing else has to know.
    const structureFrame = layout.marks?.structureFrame ?? s.structureFrame ?? 'unit';
    const structureCurve = structureFrame === 'geographic' && frame.ghost?.length > 1
      ? polylineCurve(frame.ghost, { closed: false })
      : curve;
    // Spread means different things on the two anchors. On a ring it is spread
    // in bearing; on a corridor it is spread *across* the route, which is a
    // reading a disc has no equivalent for (docs/findings.md F-15).
    if (!ringLike && (structure === 'spread' || structure === 'both')) {
      for (const b of layout.bins) {
        this._drawLateral(ctx, b, layout, structureCurve, frame.corridorHalfWidthPx);
      }
    }
    if (ringLike && (structure === 'spread' || structure === 'both')) {
      // Spread arcs of co-located bins land on top of each other, so with few
      // enough bins each gets its own concentric track. Past that they sit in
      // their own sectors already and staggering would only cost radius.
      const stagger = layout.bins.length <= (s.maxLabels ?? 12);
      layout.bins.forEach((b, i) => {
        const track = stagger ? i * (s.spreadStep ?? 5) : 0;
        this._drawSpread(ctx, b, layout, curve, track);
      });
    }
    if (structure === 'inclusions' || structure === 'both') {
      this._drawInclusions(
        ctx, layout, structureCurve, cx, cy, selectionRadiusPx,
        frame.corridorHalfWidthPx, ringLike,
      );
    }
    if (ringLike && (structure === 'gradient' || structure === 'both') && layout.structure) {
      this._drawGradient(ctx, layout, cx, cy, selectionRadiusPx);
    }

    // Association, under the marks and over the structure: a leader is context
    // for the mark it belongs to, never a reading of its own.
    const led = this._drawLeaders(ctx, layout, curve, frame, orient, unroll);

    for (const b of layout.bins) this._drawMark(ctx, b, layout, curve, orient, led);

    if (s.showLabels) {
      for (const b of layout.bins) this._drawLabel(ctx, b, layout, curve, orient);
    }

    // Draggable vertices, drawn last so they sit above the band. The adapter
    // only supplies them while the route is on its true geography: a node on a
    // straightened corridor is at a cartogram position and dragging it would
    // mean nothing.
    if (frame.nodes?.length) this._drawNodes(ctx, frame.nodes);

    // The centre survives the unroll: the selection has not moved, and the dot
    // is what says so.
    if (ringLike && s.centreDot > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, s.centreDot, 0, TAU);
      ctx.fillStyle = s.ringStroke;
      ctx.fill();
    }

    ctx.restore();
    // Cleared so one lens's level of detail cannot leak into the next.
    this._s = null;
  }

  /**
   * Dim everything outside the selection, so the lens reads as an aperture.
   *
   * The hole is the selection's own shape — a circle, or the polygon's rings.
   * `evenodd` handles both, and holes in the polygon come out dimmed, which is
   * correct: a hole is outside the selection.
   */
  _drawDim(ctx, cx, cy, selectionRadiusPx, rings) {
    const s = this._s ?? this.style;
    const hasShape = rings?.length > 0;
    if (!hasShape && !(selectionRadiusPx > 0)) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (hasShape) this._traceRings(ctx, rings);
    else ctx.arc(cx, cy, selectionRadiusPx, 0, TAU, true);
    ctx.fillStyle = s.dimColor;
    ctx.fill('evenodd');
    ctx.restore();
  }

  /** Trace projected polygon rings, each closed. */
  _traceRings(ctx, rings) {
    for (const ring of rings) {
      if (!ring?.length) continue;
      ctx.moveTo(ring[0][0], ring[0][1]);
      for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1]);
      ctx.closePath();
    }
  }

  /** Trace the anchor curve, whatever it is. */
  _tracePath(ctx, curve, ring, cx, cy) {
    if (curve.kind === 'circle') {
      ctx.arc(cx, cy, ring, 0, TAU);
      return;
    }
    const pts = curve.kind === 'arc' ? sampleCurve(curve) : (curve.points ?? []);
    if (pts.length === 0) return;
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  }

  /**
   * The route as it really runs, behind a straightened one.
   *
   * Faint and dashed: it is context for the strip, not a second reading, and
   * the strip is the thing carrying the data.
   */
  _drawGhost(ctx, points, halfWidthPx) {
    const s = this._s ?? this.style;
    ctx.save();

    // The corridor's own width, faintly. Without it the strip reads as a chart
    // with a plot background rather than as the same corridor drawn straight,
    // and anything inside it — members, lateral spread — reads as noise in an
    // axis instead of as provision beside a route.
    if (halfWidthPx > 0) {
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.lineWidth = halfWidthPx * 2;
      ctx.globalAlpha = s.ghostBandOpacity ?? 0.5;
      ctx.strokeStyle = s.corridorFill ?? 'rgba(20,20,25,0.07)';
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.setLineDash(s.boundaryDash);
    ctx.globalAlpha = s.ghostOpacity ?? 0.5;
    ctx.strokeStyle = s.boundaryStroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Where a field's cell begins and ends.
   *
   * Two different shapes, and the difference is the point. The **disc** is the
   * selection: the boundary that actually decided what this lens counted. The
   * **polygon** is the cell — the ground closer to this centre than to any
   * other — which is what tessellates, and which no lens ever selected.
   *
   * Drawing only the polygon would be the comfortable lie: it looks like a
   * tessellation, so it reads as though every place is in exactly one cell. On
   * a regular lattice at the default packing the discs merely touch, so the
   * corners of the cell are in no lens at all (docs/findings.md F-33).
   *
   * The cell arrives either as a regular polygon — `sides` and `rotate`, which
   * is all a lattice needs — or as an explicit `ring` of screen points, which
   * is what a relaxed lattice's Voronoi cells are, since those have no regular
   * shape at all (docs/findings.md F-35).
   */
  _drawCell(ctx, cx, cy, cell) {
    const s = this._s ?? this.style;
    ctx.save();
    ctx.strokeStyle = s.cellStroke;
    ctx.lineWidth = s.cellWidth ?? 1;
    ctx.globalAlpha = s.cellOpacity ?? 0.55;

    if (cell.ring?.length > 2) {
      ctx.beginPath();
      ctx.moveTo(cell.ring[0][0], cell.ring[0][1]);
      for (let i = 1; i < cell.ring.length; i++) ctx.lineTo(cell.ring[i][0], cell.ring[i][1]);
      ctx.closePath();
      ctx.stroke();
    } else if (cell.radius > 0 && cell.sides >= 3) {
      const step = 360 / cell.sides;
      ctx.beginPath();
      for (let i = 0; i < cell.sides; i++) {
        const a = (((cell.rotate ?? 0) + i * step) / 180) * Math.PI;
        const x = cx + Math.cos(a) * cell.radius;
        const y = cy + Math.sin(a) * cell.radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }

    if (cell.disc > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, cell.disc, 0, TAU);
      ctx.setLineDash(s.boundaryDash);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Draggable path vertices. */
  _drawNodes(ctx, nodes) {
    const s = this._s ?? this.style;
    const r = s.nodeRadius ?? 4;
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = s.ringStroke;
    ctx.fillStyle = s.nodeFill ?? 'rgba(255,255,255,0.9)';
    for (const [x, y] of nodes) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * The corridor band: the selection boundary for a lens with no centre.
   *
   * Offsetting a polyline properly needs mitring; at the widths a corridor lens
   * uses, a stroked line of twice the half-width is visually identical and has
   * no failure modes at sharp corners.
   */
  _drawCorridor(ctx, curve, halfWidthPx) {
    const s = this._s ?? this.style;
    if (!(halfWidthPx > 0)) return;
    ctx.save();
    ctx.beginPath();
    this._tracePath(ctx, curve);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Only the fill. Stroking a dashed line over the same path would dash the
    // corridor's *centreline*, not its edges, which reads as decoration rather
    // than a boundary — and a true outline needs polyline offsetting, which is
    // not worth its failure modes at sharp corners.
    ctx.lineWidth = halfWidthPx * 2;
    ctx.strokeStyle = s.corridorFill ?? 'rgba(20,20,25,0.07)';
    ctx.stroke();
    ctx.restore();
  }

  _drawCompass(ctx, cx, cy, ring, alpha = 1) {
    const s = this._s ?? this.style;
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = s.compassColor;
    ctx.fillStyle = s.compassColor;
    ctx.lineWidth = 1;
    ctx.font = s.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU - Math.PI / 2;
      const major = i % 4 === 0;
      const len = major ? s.tickLength * 1.8 : s.tickLength;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (ring - len), cy + Math.sin(a) * (ring - len));
      ctx.lineTo(cx + Math.cos(a) * ring, cy + Math.sin(a) * ring);
      ctx.stroke();
    }

    ['N', 'E', 'S', 'W'].forEach((label, i) => {
      const a = (i / 4) * TAU - Math.PI / 2;
      const r = ring - s.tickLength * 1.8 - 8;
      ctx.fillText(label, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    });
    ctx.restore();
  }

  /**
   * The compass, restated as an axis on the curve itself.
   *
   * Once the ring is unrolled there is no inside to put a compass rose in, but
   * the angular channel has not gone anywhere: it is now a position along a
   * baseline. Ticks and cardinal labels are placed at the same parameters they
   * always were, which is what makes the unroll legible as a change of anchor
   * rather than a change of encoding.
   */
  _drawBearingAxis(ctx, curve, alpha = 1) {
    const s = this._s ?? this.style;
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = s.compassColor;
    ctx.fillStyle = s.compassColor;
    ctx.lineWidth = 1;
    ctx.font = s.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < 16; i++) {
      const t = i / 16;
      const major = i % 4 === 0;
      const len = major ? s.tickLength * 1.8 : s.tickLength;
      const [x, y] = curve.pointAt(t);
      const [nx, ny] = curve.normalAt(t);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - nx * len, y - ny * len);
      ctx.stroke();
    }

    ['N', 'E', 'S', 'W'].forEach((label, i) => {
      const t = i / 4;
      const [x, y] = curve.pointAt(t);
      const [nx, ny] = curve.normalAt(t);
      const back = s.tickLength * 1.8 + 9;
      ctx.fillText(label, x - nx * back, y - ny * back);
    });
    ctx.restore();
  }

  /**
   * Angular spread of a bin's members, as an arc on the ring.
   *
   * A bar drawn at a circular mean asserts a direction. This says how much that
   * direction is worth believing: a concentrated bin gets a tight arc, a
   * diffuse one a wide faint band. It is the lens's diamond-cut steepness made
   * visible — see docs/findings.md F-10.
   */
  _drawSpread(ctx, bin, layout, curve, track = 0) {
    const s = this._s ?? this.style;
    const sd = bin.spread;
    if (!Number.isFinite(sd) || !bin.count || sd <= 0) return;

    // A half-turn of spread is "every direction"; drawing that as an arc would
    // just be a second ring.
    if (sd >= 179) return;

    // The spread is a span of *bearing*, which is a span of curve parameter —
    // so it is drawn by walking the curve rather than by sweeping an angle,
    // and it survives the unroll as the same reading on a straight axis.
    const halfT = sd / 720;
    const offset = (s.spreadOffset ?? 6) + track;
    const pts = sampleCurve(curve, bin.t - halfT, bin.t + halfT, 4, -offset);

    ctx.save();
    ctx.globalAlpha = s.spreadOpacity ?? 0.5;
    ctx.strokeStyle = s.spreadColor ?? colorFor(bin, layout, s);
    ctx.lineWidth = s.spreadWidth ?? 2.5;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();

    // End caps, so the extent is readable rather than fading ambiguously.
    ctx.lineWidth = 1;
    for (const t of [bin.t - halfT, bin.t + halfT]) {
      const [x, y] = curve.pointAt(t);
      const [nx, ny] = curve.normalAt(t);
      ctx.beginPath();
      ctx.moveTo(x - nx * (offset + 2.5), y - ny * (offset + 2.5));
      ctx.lineTo(x - nx * (offset - 2.5), y - ny * (offset - 2.5));
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Where across the corridor a bin's members sit.
   *
   * Drawn as a line perpendicular to the route spanning the mean offset plus
   * and minus one standard deviation, with a tick at the mean. A stretch whose
   * provision is all on one bank reads as a short line pushed to one side; an
   * evenly served stretch reads as a long line centred on the route.
   *
   * The count alone cannot distinguish those two, which is the whole argument
   * for the within-unit axis, restated for an open curve.
   */
  _drawLateral(ctx, bin, layout, curve, halfWidthPx) {
    const s = this._s ?? this.style;
    const lat = bin.structure?.lateral;
    if (!lat || !bin.count || !(halfWidthPx > 0)) return;

    const scale = halfWidthPx / (layout.selection?.width / 2 || 1);
    const lo = (lat.mean - lat.sd) * scale;
    const hi = (lat.mean + lat.sd) * scale;
    const mid = lat.mean * scale;

    const [bx, by] = curve.pointAt(bin.t);
    const [nx, ny] = curve.normalAt(bin.t);

    ctx.save();
    ctx.globalAlpha = s.spreadOpacity ?? 0.5;
    ctx.strokeStyle = s.spreadColor ?? colorFor(bin, layout, s);
    ctx.lineWidth = s.spreadWidth ?? 2.5;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(bx + nx * lo, by + ny * lo);
    ctx.lineTo(bx + nx * hi, by + ny * hi);
    ctx.stroke();

    // The mean sits on the line, so one-sidedness is visible at a glance.
    ctx.globalAlpha = 1;
    ctx.fillStyle = s.spreadColor ?? colorFor(bin, layout, s);
    ctx.beginPath();
    ctx.arc(bx + nx * mid, by + ny * mid, (s.spreadWidth ?? 2.5) * 0.9, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /**
   * The bin's members, drawn through the aggregate.
   *
   * After Honeycomb's *amber inclusions*: binning erases sparse structure, so
   * put the points back at an opacity driven by relative density. Dense bins
   * render faintly — the aggregate already reports them — while sparse bins
   * render firmly, because those are the ones a count is about to lose.
   *
   * Positions come from each member's own `distance` and `bearing`, so this is
   * drawn in the *lens's* azimuthal frame rather than the map's projection. For
   * a selection defined by geodesic distance that is the truthful frame, and it
   * keeps the renderer free of any map dependency (docs/findings.md F-12).
   */
  _drawInclusions(ctx, layout, curve, cx, cy, selectionRadiusPx, halfWidthPx, ringLike = true) {
    const s = this._s ?? this.style;
    // Members are placed in the lens's own azimuthal frame, which an unrolled
    // ring still has: the selection has not moved, only the chart around it.
    const radius = layout.selection?.radius ?? layout.structure?.radial?.max
      ?? Math.max(1, ...layout.bins.flatMap((b) => (b.items ?? []).map((i) => i.distance)));
    const halfWidth = (layout.selection?.width ?? 0) / 2;
    if (ringLike ? !(selectionRadiusPx > 0 && radius > 0) : !(halfWidthPx > 0 && halfWidth > 0)) {
      return;
    }

    const counts = layout.bins.map((b) => b.count ?? 0);
    const peak = Math.max(...counts, 1);
    const budget = s.maxInclusions ?? 2000;
    const total = counts.reduce((a, b) => a + b, 0);
    // Deterministic stride rather than sampling, so points do not shimmer
    // between frames.
    const stride = Math.max(1, Math.ceil(total / budget));

    ctx.save();
    for (const bin of layout.bins) {
      const items = bin.items;
      if (!items || items.length === 0) continue;

      const relative = (bin.count ?? 0) / peak;
      ctx.fillStyle = colorFor(bin, layout, s);
      ctx.globalAlpha = (s.inclusionOpacity ?? 0.55) * (1 - 0.6 * relative);

      for (let i = 0; i < items.length; i += stride) {
        const it = items[i];
        let x;
        let y;
        if (ringLike) {
          if (!Number.isFinite(it.distance) || !Number.isFinite(it.bearing)) continue;
          const r = (it.distance / radius) * selectionRadiusPx;
          const a = ((it.bearing - 90) / 180) * Math.PI;
          x = cx + Math.cos(a) * r;
          y = cy + Math.sin(a) * r;
        } else {
          // The corridor's own frame: along the route by `t`, across it by
          // `offset` — the open-curve analogue of F-12.
          if (!Number.isFinite(it.t) || !Number.isFinite(it.offset)) continue;
          const [bx, by] = curve.pointAt(it.t);
          const [nx, ny] = curve.normalAt(it.t);
          const across = (it.offset / halfWidth) * halfWidthPx;
          x = bx + nx * across;
          y = by + ny * across;
        }
        ctx.beginPath();
        ctx.arc(x, y, s.inclusionSize ?? 1.4, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /**
   * The lens-level density gradient: which way its contents lie, and how
   * strongly. The planar equivalent of Honeycomb's diamond cut, drawn inside
   * the selection because that is the unit it describes.
   */
  _drawGradient(ctx, layout, cx, cy, selectionRadiusPx) {
    const s = this._s ?? this.style;
    const { bearing, strength } = layout.structure.gradient;
    if (bearing == null || !(strength > 0)) return;

    const angle = ((bearing - 90) / 180) * Math.PI;
    const max = (selectionRadiusPx || 60) * 0.7;
    const len = max * strength;
    if (len < 3) return;

    const [tipX, tipY] = polar(cx, cy, len, angle);
    ctx.save();
    ctx.globalAlpha = s.gradientOpacity ?? 0.55;
    ctx.strokeStyle = s.gradientColor ?? s.ringStroke;
    ctx.fillStyle = s.gradientColor ?? s.ringStroke;
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    const head = 5;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(...polar(tipX, tipY, head, angle + 2.5));
    ctx.lineTo(...polar(tipX, tipY, head, angle - 2.5));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _drawMark(ctx, bin, layout, curve, orient = 'normal', led = null) {
    const s = this._s ?? this.style;
    const type = layout.marks?.type ?? 'bar';
    if (!Number.isFinite(bin.size) || bin.size <= 0.1) return;

    ctx.save();
    ctx.globalAlpha = s.markOpacity * (0.45 + 0.55 * (bin.confidence ?? 1));
    ctx.fillStyle = colorFor(bin, layout, s);

    // `ringOffset` is the concentric track this mark sits on — zero unless
    // placement is `stacked`.
    const track = bin.ringOffset ?? 0;
    const [px0, py0] = curve.pointAt(bin.t);
    const [nx, ny, tx, ty] = markAxes(curve, bin.t, orient);
    const bx = px0 + nx * track;
    const by = py0 + ny * track;
    // Curved bar edges need the circle the mark actually sits on, which is the
    // *anchor's* circle rather than the lens's — they are the same thing only
    // while the ring is closed. Beyond a few thousand pixels of radius the
    // curvature is under a tenth of a pixel across a bar, so the straight-edged
    // path is not an approximation anyone can see.
    const basis = orient === 'normal' ? arcBasis(curve) : null;

    if (type === 'rose') {
      const outer = Math.max(bin.size, s.minRoseRadius ?? 6);
      this._drawRose(ctx, bin, bx + nx * outer, by + ny * outer, outer);
    } else if (type === 'disc') {
      const [x, y] = [bx + nx * bin.size, by + ny * bin.size];
      ctx.beginPath();
      ctx.arc(x, y, bin.size, 0, TAU);
      ctx.fill();
      if (s.strokeMarks) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = s.ringStroke;
        ctx.lineWidth = 0.75;
        ctx.stroke();
      }
    } else {
      // Bars grow outward for positive values and inward for negative, so a
      // diverging normalisation reads directly off the anchor.
      const inward = (bin.signed ?? 1) < 0;
      const extent = inward ? -bin.size : bin.size;
      const half = Math.max(bin.markHalfWidthPx ?? bin.halfWidthPx, 0.5);

      if (basis) {
        // Curved edges are worth the special case on a ring: at the widths a
        // 24-sector rose uses, a straight-edged quad reads as a mistake.
        const angle = curve.angleAt(bin.t);
        const r0 = basis.radius + track;
        const r1 = r0 + extent;
        const halfAngle = half / r0;
        annularSector(ctx, basis.cx, basis.cy, Math.min(r0, r1), Math.max(r0, r1),
          angle - halfAngle, angle + halfAngle);
      } else {
        ctx.beginPath();
        ctx.moveTo(bx - tx * half, by - ty * half);
        ctx.lineTo(bx + tx * half, by + ty * half);
        ctx.lineTo(bx + tx * half + nx * extent, by + ty * half + ny * extent);
        ctx.lineTo(bx - tx * half + nx * extent, by - ty * half + ny * extent);
        ctx.closePath();
      }
      ctx.fill();
    }

    // Displacement indicator: how far placement moved this mark off its true
    // bearing. Drawn on the curve rather than at an angle, so it survives the
    // unroll. A leader says the same thing and more, so the tick is only drawn
    // where no leader was — see docs/findings.md Q-2.
    if (!led?.has(bin.key) && Math.abs(bin.displacement ?? 0) > s.displacementThreshold) {
      const trueT = bin.preferredT ?? bin.t;
      const [x, y] = curve.pointAt(trueT);
      const [ax, ay] = curve.normalAt(trueT);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = s.displacementColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - ax * 3, y - ay * 3);
      ctx.lineTo(x - ax * 9, y - ay * 9);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Leader lines: what ties a mark back to what it summarises (`hAssoc`).
   *
   * Adjacency does this for free while a mark sits on a ring around its own
   * selection, which is why the library got this far without leaders. Two
   * things break it, and they are the same break by degrees:
   *
   * - **placement**, which slides a mark off its true bearing to avoid an
   *   overlap — the residual the displacement tick was gesturing at
   *   (docs/findings.md Q-2);
   * - **the anchor**, which under `unroll` detaches the whole chart from the
   *   geography it describes (docs/findings.md F-28).
   *
   * So one encoding answers both, and `auto` fades it in exactly as adjacency
   * fades out. Returns the set of bin keys that got one, so the mark stage can
   * drop the tick it replaces.
   */
  _drawLeaders(ctx, layout, curve, frame, orient, unroll) {
    const s = this._s ?? this.style;
    const drawn = new Set();
    const assoc = { ...(s.association ?? {}), ...(layout.association ?? {}) };
    const mode = assoc.mode ?? 'auto';
    if (mode === 'adjacency' || mode === 'none' || s.leaders === false) return drawn;

    const threshold = assoc.threshold ?? s.displacementThreshold ?? 6;
    const minLength = assoc.minLength ?? s.leaderMinLength ?? 7;

    ctx.save();
    ctx.lineWidth = s.leaderWidth ?? 1;
    for (const bin of layout.bins) {
      if (!bin.count) continue;
      const hovered = frame.hovered != null && frame.hovered === bin.key;
      const displaced = leaderGap(bin) > threshold;
      // How much of the association the layout has already given away. A mark
      // still sitting on its own bearing, on a closed ring, needs no line.
      const strength = mode === 'leader' ? 1
        : mode === 'hover' ? (hovered ? 1 : 0)
          : Math.max(unroll, displaced || hovered ? 1 : 0);
      if (strength <= 0.02) continue;

      const line = leaderAnchors(layout, bin, curve, frame, orient);
      if (!line) continue;
      const [[x0, y0], [x1, y1]] = line;
      if (Math.hypot(x1 - x0, y1 - y0) < minLength) continue;

      const colour = s.leaderColor ?? colorFor(bin, layout, s);
      ctx.globalAlpha = (s.leaderOpacity ?? 0.5) * strength;
      ctx.strokeStyle = colour;
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();

      // A dot at the far end, because a bare line is ambiguous about which of
      // its ends is the claim.
      const dot = s.leaderDot ?? 2;
      if (dot > 0) {
        ctx.beginPath();
        ctx.arc(x1, y1, dot, 0, TAU);
        ctx.fill();
      }
      drawn.add(bin.key);
    }
    ctx.restore();
    return drawn;
  }

  /**
   * A miniature directional histogram for one bin, sitting at its position on
   * the necklace — the `profile` encoding.
   *
   * This is the honest mark for a diffuse bin. A bar at a circular mean claims
   * one direction; when the members are spread, no single direction is true and
   * the distribution is what is left to show (docs/findings.md Q-3).
   *
   * Petals are oriented to true north, not to the bin's own mean, so roses can
   * be compared with each other and with the compass.
   */
  _drawRose(ctx, bin, gx, gy, outer) {
    const s = this._s ?? this.style;
    const petals = bin.structure?.rose;
    if (!petals || petals.length === 0 || !bin.count) return;

    // The glyph's overall size still carries the bin's value; the petals carry
    // its internal shape. Two readings, nested.
    const step = TAU / petals.length;

    ctx.beginPath();
    for (let i = 0; i < petals.length; i++) {
      const a0 = i * step - Math.PI / 2;
      const a1 = a0 + step * (s.petalGap ?? 0.86);
      const r = Math.max(0.4, petals[i] * outer);
      ctx.moveTo(gx, gy);
      ctx.arc(gx, gy, r, a0, a1);
      ctx.closePath();
    }
    ctx.fill();

    if (s.strokeMarks) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = s.ringStroke;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }

  _drawLabel(ctx, bin, layout, curve, orient = 'normal') {
    const s = this._s ?? this.style;
    // Per-mark text only pays for itself while there are few enough marks to
    // read. Past that the compass carries the angular reading and the labels
    // would just be a ring of noise.
    if (layout.bins.length > (s.maxLabels ?? 12)) {
      if (s.showValues && bin.raw > 0) this._drawValue(ctx, bin, layout, curve, orient);
      return;
    }
    if (bin.raw === 0) return;

    const track = bin.ringOffset ?? 0;
    // Value first, label beyond it. These used to sit 3px apart, which is
    // less than the height of either, so a labelled bar always drew its name
    // through its number (docs/findings.md F-25).
    const extent = this._markExtent(bin, layout);
    const gap = s.labelGap ?? 24;
    const offset = bin.signed < 0 ? -(extent + gap) : extent + gap;
    const basis = orient === 'normal' ? arcBasis(curve) : null;
    if (basis) {
      drawArcText(ctx, bin.label, basis.cx, basis.cy,
        basis.radius + track + offset, curve.angleAt(bin.t), {
          font: s.font,
          color: s.labelColor,
        });
    } else {
      // Off a circle there is no arc to follow, so the label is set upright.
      // It also goes on the *far* side of the curve from the mark: on a ring
      // the arc text and the value sit at different radii and never meet, but
      // on a strip they share one axis and would collide.
      const [px0, py0] = curve.pointAt(bin.t);
      const [nx, ny] = markAxes(curve, bin.t, orient);
      const bx = px0 + nx * track;
      const by = py0 + ny * track;
      const back = -(s.stripLabelOffset ?? 12);
      ctx.save();
      ctx.font = s.font;
      ctx.fillStyle = s.labelColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(bin.label, bx + nx * back, by + ny * back);
      ctx.restore();
    }
    if (s.showValues) this._drawValue(ctx, bin, layout, curve, orient);
  }

  /**
   * How far a mark reaches beyond the ring. A bar grows outward from the ring,
   * so that is its size; a disc or rose is *centred* one radius out, so it
   * reaches twice as far. Getting this wrong writes labels over the glyph.
   */
  _markExtent(bin, layout) {
    const type = layout.marks?.type ?? 'bar';
    return type === 'disc' || type === 'rose' ? bin.size * 2 : bin.size;
  }

  _drawValue(ctx, bin, layout, curve, orient = 'normal') {
    const s = this._s ?? this.style;
    if (Math.abs(bin.size ?? 0) < this._valueFloor) return;
    const extent = this._markExtent(bin, layout);
    const gap = s.valueGap ?? 10;
    const along = (bin.ringOffset ?? 0) + (bin.signed < 0 ? -(extent + gap) : extent + gap);
    const [bx, by] = curve.pointAt(bin.t);
    const [nx, ny] = markAxes(curve, bin.t, orient);
    const [x, y] = [bx + nx * along, by + ny * along];
    ctx.save();
    ctx.font = s.valueFont;
    ctx.fillStyle = s.valueColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(formatValue(bin), x, y);
    ctx.restore();
  }

  /** Which bin, if any, is under a canvas point. */
  hitTest(layout, frame, px, py) {
    const ring = frame.ringRadius ?? layout.ring.radius;
    const curve = frame.curve ?? circleCurve(frame.cx, frame.cy, ring);
    // Match the level of detail the lens was painted at, so hit areas cannot
    // disagree with what is on screen.
    const lod = resolveLod(ring, this.style, frame.unroll ?? curve.unroll ?? 0);
    this._s = lod ? { ...this.style, ...lod } : this.style;
    const orient = layout.marks?.orient ?? this._s.orient ?? 'normal';
    // The polar test is exact, but only while the marks really are radial about
    // the lens centre. Unroll the anchor or stand the marks upright and the
    // footprint is an oriented rectangle instead, so the test has to be one.
    const polarTest = curve.kind === 'circle' && orient === 'normal';
    const dx = px - frame.cx;
    const dy = py - frame.cy;
    const r = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    const type = layout.marks?.type ?? 'bar';

    for (const bin of layout.bins) {
      if (!polarTest) {
        if (!Number.isFinite(bin.size) || bin.size <= 0) continue;
        const track = bin.ringOffset ?? 0;
        const [px0, py0] = curve.pointAt(bin.t);
        const [nx, ny, tx, ty] = markAxes(curve, bin.t, orient);
        const ox = px0 + nx * track;
        const oy = py0 + ny * track;
        const along = (px - ox) * nx + (py - oy) * ny;
        const across = (px - ox) * tx + (py - oy) * ty;
        if (type === 'disc' || type === 'rose') {
          if (Math.hypot(along - bin.size, across) <= Math.max(bin.size, 6)) return bin;
          continue;
        }
        const half = Math.max(bin.markHalfWidthPx ?? bin.halfWidthPx, 3);
        const lo = Math.min(0, (bin.signed ?? 1) < 0 ? -bin.size : bin.size);
        const hi = Math.max(0, (bin.signed ?? 1) < 0 ? -bin.size : bin.size);
        if (along >= lo && along <= hi && Math.abs(across) <= half) return bin;
        continue;
      }
      const track = bin.ringOffset ?? 0;
      if (type === 'disc' || type === 'rose') {
        const [x, y] = polar(frame.cx, frame.cy, ring + track + bin.size, bin.angle);
        if (Math.hypot(px - x, py - y) <= bin.size) return bin;
      } else {
        const inward = (bin.signed ?? 1) < 0;
        const base = ring + track;
        const lo = inward ? base - bin.size : base;
        const hi = inward ? base : base + bin.size;
        if (r < lo || r > hi) continue;
        const halfAngle = Math.max(bin.markHalfWidthPx ?? bin.halfWidthPx, 3) / base;
        if (Math.abs(angleDelta(bin.angle, a)) <= halfAngle) return bin;
      }
    }
    return null;
  }
}

const polar = (cx, cy, r, a) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];

/**
 * The two axes a mark is drawn in: the direction it grows, and the direction
 * its width runs. The width axis is always the growth axis turned a quarter
 * turn, so a mark stays square to itself whatever it is aligned to.
 *
 * - `normal`  — the curve's own outward normal. Radial on a ring, lateral on a
 *   route. Association is maximal: the mark points at what it summarises.
 * - `up`      — screen vertical, always. Every mark shares one baseline
 *   direction, so lengths compare directly; on a closed ring the marks in the
 *   lower half grow back across the lens, which is why this belongs with an
 *   unrolled or open anchor.
 * - `upright` — vertical, but signed by the normal, so marks never grow into
 *   the lens interior. The compromise: a shared axis, two baselines.
 */
export function markAxes(curve, t, orient = 'normal') {
  let ux;
  let uy;
  if (orient === 'up') {
    ux = 0;
    uy = -1;
  } else {
    const [nx, ny] = curve.normalAt(t);
    if (orient === 'upright') {
      ux = 0;
      uy = ny > 0 ? 1 : -1;
    } else {
      ux = nx;
      uy = ny;
    }
  }
  return [ux, uy, -uy, ux];
}

/**
 * Where a leader runs from and to, or `null` if there is nothing to point at.
 *
 * The target is **the position placement tried to honour**, at the members'
 * own mean distance from the anchor — not the rim, and not the mark's actual
 * position. So the line is precisely the association the layout gave away,
 * whether it gave it away to avoid an overlap or by unrolling the anchor.
 *
 * Everything is measured in the lens's own azimuthal frame, the same one the
 * inclusions use, so no map projection is involved (docs/findings.md F-12).
 * `frame.scalePx` is pixels per metre; without it there is no honest way to
 * place the target and the leader is skipped rather than guessed.
 */
export function leaderAnchors(layout, bin, curve, frame, orient = 'normal') {
  const track = bin.ringOffset ?? 0;
  const [bx, by] = curve.pointAt(bin.t);
  const [ux, uy] = markAxes(curve, bin.t, orient);
  const from = [bx + ux * track, by + uy * track];
  const to = leaderTarget(layout, bin, curve, frame);
  return to ? [from, to] : null;
}

/**
 * How far a mark sits from the position its data actually occupies, in degrees
 * of curve parameter.
 *
 * Deliberately not `bin.displacement`, which is the necklace solver's own
 * residual — how far it had to move a mark from the position it was *asked*
 * for. Under block placement it asks for a nominal slot, so the solver reports
 * no displacement at all while every mark is as far from its bearing as it can
 * be. That is the layout where association is most missing, so the leader has
 * to measure the gap itself.
 */
export function leaderGap(bin) {
  const bearing = bin.meanBearing ?? bin.bearing;
  const trueT = bin.position != null || bearing == null
    ? bin.preferredT ?? bin.t
    : wrap01(bearing / 360);
  return Math.abs(cyclicDelta(bin.t, trueT)) * 360;
}

function leaderTarget(layout, bin, curve, frame) {
  // The parameter the mark was placed *for*, which is what it is a summary of.
  const t = bin.preferredT ?? bin.t;

  if (curve.kind === 'polyline') {
    // On a route, the geography is the route: the true path where the anchor
    // has been straightened away from it, the drawn one otherwise.
    const source = frame.ghost?.length > 1
      ? polylineCurve(frame.ghost, { closed: false })
      : curve;
    const [x, y] = source.pointAt(t);
    const halfWidth = (layout.selection?.width ?? 0) / 2;
    const mean = bin.structure?.lateral?.mean;
    if (!(halfWidth > 0) || !Number.isFinite(mean) || !(frame.corridorHalfWidthPx > 0)) {
      return [x, y];
    }
    const [nx, ny] = source.normalAt(t);
    const across = (mean / halfWidth) * frame.corridorHalfWidthPx;
    return [x + nx * across, y + ny * across];
  }

  // A ring's angular axis only means bearing when the bins carry one, and the
  // members' own circular mean is not a substitute: a distance band's members
  // run all the way round, so their mean direction is the arbitrary number
  // F-6 warns about and a leader drawn to it would be a confident lie.
  const bearing = bin.meanBearing ?? bin.bearing;
  if (bearing == null || frame.cx == null) return null;

  const scale = frame.scalePx
    ?? (frame.selectionRadiusPx > 0 && layout.selection?.radius > 0
      ? frame.selectionRadiusPx / layout.selection.radius
      : 0);
  const distance = bin.structure?.radial?.mean;
  if (!(scale > 0) || !Number.isFinite(distance) || distance <= 0) return null;

  const a = ((bearing - 90) / 180) * Math.PI;
  return [frame.cx + Math.cos(a) * distance * scale, frame.cy + Math.sin(a) * distance * scale];
}

/**
 * The circle a mark sits on, if drawing it as an annular sector is still worth
 * doing. An unrolling ring's radius runs off to infinity, and past a few
 * thousand pixels the curvature across one mark is under a tenth of a pixel —
 * so the cutoff is where the special case stops buying anything, not where it
 * stops being defined.
 */
export function arcBasis(curve, maxRadius = 4000) {
  const r = curve.radius;
  if (!curve.angleAt || !Number.isFinite(r) || r > maxRadius) return null;
  return { cx: curve.cx, cy: curve.cy, radius: r };
}

/** Points along a curve, offset along its normal, at roughly `step` pixels. */
export function sampleCurve(curve, t0 = 0, t1 = 1, step = 3, offset = 0) {
  const span = Math.abs(t1 - t0) * curve.length;
  const n = Math.max(2, Math.min(720, Math.ceil(span / step)));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    const [x, y] = curve.pointAt(t);
    if (offset === 0) {
      out.push([x, y]);
    } else {
      const [nx, ny] = curve.normalAt(t);
      out.push([x + nx * offset, y + ny * offset]);
    }
  }
  return out;
}

const angleDelta = (a, b) => ((((b - a) % TAU) + TAU + Math.PI) % TAU) - Math.PI;

function annularSector(ctx, cx, cy, r0, r1, a0, a1) {
  ctx.beginPath();
  ctx.arc(cx, cy, r1, a0, a1);
  ctx.arc(cx, cy, r0, a1, a0, true);
  ctx.closePath();
}

/** Text set along an arc, flipped on the lower half so it stays readable. */
export function drawArcText(ctx, text, cx, cy, radius, angle, { font, color } = {}) {
  ctx.save();
  if (font) ctx.font = font;
  if (color) ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Flip on the *lower* half, not the left. Tangential text is upright at the
  // top and upside down at the bottom, so the half that needs reversing is the
  // one where sin is positive (canvas y points down). Testing cos instead
  // flipped the left half, which left labels at the bottom of the ring
  // inverted — subtle with short names near the top, obvious with a ring of
  // district names (docs/findings.md F-25).
  const flip = Math.sin(angle) > 0;
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((s, w) => s + w, 0);
  const dir = flip ? -1 : 1;

  let travelled = -total / 2;
  for (let i = 0; i < chars.length; i++) {
    const at = angle + (dir * (travelled + widths[i] / 2)) / radius;
    ctx.save();
    ctx.translate(cx + Math.cos(at) * radius, cy + Math.sin(at) * radius);
    ctx.rotate(at + (flip ? -Math.PI / 2 : Math.PI / 2));
    ctx.fillText(chars[i], 0, 0);
    ctx.restore();
    travelled += widths[i];
  }
  ctx.restore();
}

function formatValue(bin) {
  const v = bin.value;
  if (!Number.isFinite(v)) return '–';
  if (bin.unit === 'LQ') return v.toFixed(1);
  if (bin.unit === 'share') return `${Math.round(v * 100)}%`;
  if (bin.unit === 'z') return v.toFixed(1);
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return Math.abs(v) < 10 && !Number.isInteger(v) ? v.toFixed(1) : String(Math.round(v));
}

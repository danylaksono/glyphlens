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

import { resolveStyle, colorFor } from './style.js';
import { circleCurve } from '../core/curve.js';

const TAU = Math.PI * 2;

export class LensRenderer {
  constructor(style = {}) {
    this.style = resolveStyle(style);
  }

  setStyle(style) {
    this.style = resolveStyle({ ...this.style, ...style });
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
    const s = this.style;
    const { cx, cy, selectionRadiusPx } = frame;
    const ring = frame.ringRadius ?? layout.ring.radius;

    // Marks are placed on a curve, never on "the ring". A disc lens supplies
    // none and gets a circle; a corridor lens supplies its projected path. This
    // is the property F-2 asks the core to preserve, exercised for real.
    const curve = frame.curve ?? circleCurve(cx, cy, ring);
    const onCircle = curve.kind === 'circle';

    ctx.save();

    if (onCircle) {
      if (s.dimExterior) this._drawDim(ctx, cx, cy, ring, selectionRadiusPx);

      // Geographic selection boundary — this one scales with the map.
      if (Number.isFinite(selectionRadiusPx) && selectionRadiusPx > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, selectionRadiusPx, 0, TAU);
        ctx.setLineDash(s.boundaryDash);
        ctx.strokeStyle = s.boundaryStroke;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
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
    const geographic = onCircle
      && layout.bins.some((b) => b.bearing != null || b.meanBearing != null);
    if (s.compass && geographic) this._drawCompass(ctx, cx, cy, ring);

    // One faint guide per concentric track, so a reader can tell which ring a
    // mark belongs to when tracks are close together.
    if (onCircle) {
      const tracks = [...new Set(layout.bins.map((b) => b.ringOffset ?? 0))]
        .filter((t) => t > 0);
      for (const t of tracks) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, ring + t, 0, TAU);
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
    // Spread means different things on the two anchors. On a ring it is spread
    // in bearing; on a corridor it is spread *across* the route, which is a
    // reading a disc has no equivalent for (docs/findings.md F-15).
    if (!onCircle && (structure === 'spread' || structure === 'both')) {
      for (const b of layout.bins) {
        this._drawLateral(ctx, b, layout, curve, frame.corridorHalfWidthPx);
      }
    }
    if (onCircle && (structure === 'spread' || structure === 'both')) {
      // Spread arcs of co-located bins land on top of each other, so with few
      // enough bins each gets its own concentric track. Past that they sit in
      // their own sectors already and staggering would only cost radius.
      const stagger = layout.bins.length <= (s.maxLabels ?? 12);
      layout.bins.forEach((b, i) => {
        const track = stagger ? i * (s.spreadStep ?? 5) : 0;
        this._drawSpread(ctx, b, layout, cx, cy, ring, track);
      });
    }
    if (structure === 'inclusions' || structure === 'both') {
      this._drawInclusions(
        ctx, layout, curve, cx, cy, selectionRadiusPx, frame.corridorHalfWidthPx,
      );
    }
    if (onCircle && (structure === 'gradient' || structure === 'both') && layout.structure) {
      this._drawGradient(ctx, layout, cx, cy, selectionRadiusPx);
    }

    for (const b of layout.bins) this._drawMark(ctx, b, layout, curve, cx, cy, ring);

    if (s.showLabels) {
      for (const b of layout.bins) {
        this._drawLabel(ctx, b, layout, curve, cx, cy, ring, geographic);
      }
    }

    if (onCircle) {
      ctx.beginPath();
      ctx.arc(cx, cy, s.centreDot, 0, TAU);
      ctx.fillStyle = s.ringStroke;
      ctx.fill();
    }

    ctx.restore();
  }

  _drawDim(ctx, cx, cy, ring, selectionRadiusPx) {
    const s = this.style;
    const hole = Math.max(selectionRadiusPx || 0, 0);
    if (hole <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.arc(cx, cy, hole, 0, TAU, true); // reverse winding punches the hole
    ctx.fillStyle = s.dimColor;
    ctx.fill();
    ctx.restore();
  }

  /** Trace the anchor curve, whatever it is. */
  _tracePath(ctx, curve, ring, cx, cy) {
    if (curve.kind === 'circle') {
      ctx.arc(cx, cy, ring, 0, TAU);
      return;
    }
    const pts = curve.points ?? [];
    if (pts.length === 0) return;
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  }

  /**
   * The corridor band: the selection boundary for a lens with no centre.
   *
   * Offsetting a polyline properly needs mitring; at the widths a corridor lens
   * uses, a stroked line of twice the half-width is visually identical and has
   * no failure modes at sharp corners.
   */
  _drawCorridor(ctx, curve, halfWidthPx) {
    const s = this.style;
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

  _drawCompass(ctx, cx, cy, ring) {
    const s = this.style;
    ctx.save();
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
   * Angular spread of a bin's members, as an arc on the ring.
   *
   * A bar drawn at a circular mean asserts a direction. This says how much that
   * direction is worth believing: a concentrated bin gets a tight arc, a
   * diffuse one a wide faint band. It is the lens's diamond-cut steepness made
   * visible — see docs/findings.md F-10.
   */
  _drawSpread(ctx, bin, layout, cx, cy, ring, track = 0) {
    const s = this.style;
    const sd = bin.spread;
    if (!Number.isFinite(sd) || !bin.count || sd <= 0) return;

    // A half-turn of spread is "every direction"; drawing that as an arc would
    // just be a second ring.
    if (sd >= 179) return;

    const half = (sd / 360) * TAU;
    const r = ring - (s.spreadOffset ?? 6) - track;
    ctx.save();
    ctx.globalAlpha = s.spreadOpacity ?? 0.5;
    ctx.strokeStyle = s.spreadColor ?? colorFor(bin, layout, s);
    ctx.lineWidth = s.spreadWidth ?? 2.5;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.arc(cx, cy, r, bin.angle - half, bin.angle + half);
    ctx.stroke();

    // End caps, so the extent is readable rather than fading ambiguously.
    ctx.lineWidth = 1;
    for (const a of [bin.angle - half, bin.angle + half]) {
      ctx.beginPath();
      ctx.moveTo(...polar(cx, cy, r - 2.5, a));
      ctx.lineTo(...polar(cx, cy, r + 2.5, a));
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
    const s = this.style;
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
  _drawInclusions(ctx, layout, curve, cx, cy, selectionRadiusPx, halfWidthPx) {
    const s = this.style;
    const onCircle = curve.kind === 'circle';
    const radius = layout.selection?.radius;
    const halfWidth = (layout.selection?.width ?? 0) / 2;
    if (onCircle ? !(selectionRadiusPx > 0 && radius > 0) : !(halfWidthPx > 0 && halfWidth > 0)) {
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
        if (onCircle) {
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
    const s = this.style;
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

  _drawMark(ctx, bin, layout, curve, cx, cy, ring) {
    const s = this.style;
    const type = layout.marks?.type ?? 'bar';
    if (!Number.isFinite(bin.size) || bin.size <= 0.1) return;
    const onCircle = curve.kind === 'circle';

    ctx.save();
    ctx.globalAlpha = s.markOpacity * (0.45 + 0.55 * (bin.confidence ?? 1));
    ctx.fillStyle = colorFor(bin, layout, s);

    // `ringOffset` is the concentric track this mark sits on — zero unless
    // placement is `stacked`.
    const track = bin.ringOffset ?? 0;
    const [px0, py0] = curve.pointAt(bin.t);
    const [nx, ny] = curve.normalAt(bin.t);
    const bx = px0 + nx * track;
    const by = py0 + ny * track;

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
      const half = Math.max(bin.halfWidthPx, 0.5);

      if (onCircle) {
        // Curved edges are worth the special case on a ring: at the widths a
        // 24-sector rose uses, a straight-edged quad reads as a mistake.
        const r0 = ring + track;
        const r1 = r0 + extent;
        const halfAngle = half / r0;
        annularSector(ctx, cx, cy, Math.min(r0, r1), Math.max(r0, r1),
          bin.angle - halfAngle, bin.angle + halfAngle);
      } else {
        const [tx, ty] = curve.tangentAt(bin.t);
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
    // bearing. Unresolved policy question — see docs/findings.md Q-2.
    if (onCircle && Math.abs(bin.displacement ?? 0) > s.displacementThreshold) {
      const trueAngle = (bin.preferredT ?? bin.t) * TAU - Math.PI / 2;
      ctx.globalAlpha = 1;
      ctx.strokeStyle = s.displacementColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(...polar(cx, cy, ring - 3, trueAngle));
      ctx.lineTo(...polar(cx, cy, ring - 9, trueAngle));
      ctx.stroke();
    }

    ctx.restore();
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
    const s = this.style;
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

  _drawLabel(ctx, bin, layout, curve, cx, cy, ring, geographic) {
    const s = this.style;
    // Per-mark text only pays for itself while there are few enough marks to
    // read. Past that the compass carries the angular reading and the labels
    // would just be a ring of noise.
    if (layout.bins.length > (s.maxLabels ?? 12)) {
      if (s.showValues && bin.raw > 0) this._drawValue(ctx, bin, layout, curve, cx, cy, ring);
      return;
    }
    if (bin.raw === 0) return;

    const track = bin.ringOffset ?? 0;
    const offset = bin.signed < 0 ? 10 : this._markExtent(bin, layout) + 12;
    if (curve.kind === 'circle') {
      drawArcText(ctx, bin.label, cx, cy, ring + track + offset, bin.angle, {
        font: s.font,
        color: s.labelColor,
      });
    } else {
      // Off a circle there is no arc to follow, so the label is set upright.
      // It also goes on the *far* side of the curve from the mark: on a ring
      // the arc text and the value sit at different radii and never meet, but
      // on a strip they share one axis and would collide.
      const [px0, py0] = curve.pointAt(bin.t);
      const [nx, ny] = curve.normalAt(bin.t);
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
    if (s.showValues) this._drawValue(ctx, bin, layout, curve, cx, cy, ring);
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

  _drawValue(ctx, bin, layout, curve, cx, cy, ring) {
    const s = this.style;
    if (Math.abs(bin.size ?? 0) < this._valueFloor) return;
    const extent = this._markExtent(bin, layout);
    const along = (bin.ringOffset ?? 0) + (bin.signed < 0 ? -extent - 9 : extent + 9);
    const [bx, by] = curve.pointAt(bin.t);
    const [nx, ny] = curve.normalAt(bin.t);
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
    const onCircle = curve.kind === 'circle';
    const dx = px - frame.cx;
    const dy = py - frame.cy;
    const r = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    const type = layout.marks?.type ?? 'bar';

    for (const bin of layout.bins) {
      if (!onCircle) {
        // Off a circle, test against the mark's own footprint directly.
        const [bx, by] = curve.pointAt(bin.t);
        const [nx, ny] = curve.normalAt(bin.t);
        const mid = bin.size / 2;
        const cxm = bx + nx * mid;
        const cym = by + ny * mid;
        if (Math.hypot(px - cxm, py - cym) <= Math.max(bin.halfWidthPx, mid, 6)) return bin;
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
        const halfAngle = Math.max(bin.halfWidthPx, 3) / base;
        if (Math.abs(angleDelta(bin.angle, a)) <= halfAngle) return bin;
      }
    }
    return null;
  }
}

const polar = (cx, cy, r, a) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];

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

  const flip = Math.cos(angle) < 0;
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

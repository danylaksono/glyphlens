/**
 * Canvas renderer for a docked strip — a lens layout drawn off the map.
 *
 * This is the unrolled anchor of docs/design-space.md §3.4b, taken one step
 * further: a straight baseline, as `unroll = 1` draws, but in a panel rather
 * than beside the selection. The layout is not recomputed. Placement reserved
 * each mark's room as a fraction of the curve, so the strip scales those
 * fractions to its own width and the marks cannot overlap here if they did not
 * overlap on the ring.
 *
 * Two things differ from the lens renderer, deliberately:
 *
 *   - **The scale is supplied, not derived.** A lens scales its marks to its
 *     own largest value, which is right for a glyph and wrong for a chart
 *     that is watched while the lens moves — every bar would change length
 *     for reasons that have nothing to do with the data under it. The caller
 *     passes `domain`, which should depend on the instrument and not on the
 *     position (see `dockDomain` in core/dock.js).
 *   - **Colour is by category, never by value.** The lens uses a diverging
 *     ramp for quotients, fitted to the lens; fitted colour has the same
 *     problem as a fitted scale.
 *
 * Like `LensRenderer` it holds no state: give it a layout and a frame, it
 * paints.
 */

import { resolveStyle } from './style.js';
import { wrap01 } from '../core/curve.js';

export class DockRenderer {
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
   * @param {number} frame.width            canvas CSS px
   * @param {number} frame.height
   * @param {number} frame.domain           the value at the top of the plot
   * @param {Map}    [frame.context]        key -> context value, drawn behind each mark
   * @param {'expected'|'whole'} [frame.contextKind]  a model is outlined dashed, data solid
   * @param {number} [frame.at=0]           the parameter held fixed; the seam is opposite
   * @param {number} [frame.bearingAlpha=0] how visible the compass axis is
   * @param {string} [frame.hovered]        key of the emphasised mark
   * @param {string[]} [frame.categories]   fixes colour order
   */
  draw(ctx, layout, frame) {
    const s = this.style;
    const g = geometry(frame);
    const domain = frame.domain > 0 ? frame.domain : 1;
    const yOf = (v) => g.base - Math.min(1, Math.max(0, v / domain)) * g.plotH;
    const bins = layout?.bins ?? [];
    const labelled = bins.length <= (s.maxLabels ?? 12);
    const anyHover = frame.hovered != null && bins.some((b) => b.key === frame.hovered);

    ctx.save();
    ctx.font = s.font;

    // Gridlines at round fractions of a fixed domain. They are the evidence
    // that the scale is not moving, so they are always drawn.
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const u of [0, 0.5, 1]) {
      const y = g.base - u * g.plotH;
      ctx.beginPath();
      ctx.moveTo(g.x0, y);
      ctx.lineTo(g.x1, y);
      ctx.strokeStyle = u === 0 ? s.ringStroke : 'rgba(20,20,25,0.1)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = 'rgba(20,20,25,0.5)';
      ctx.fillText(formatTick(u * domain), g.x0 - 6, y);
    }

    // A quotient's neutral value is a reading in its own right.
    const neutral = layout?.scale?.neutral;
    if (neutral > 0 && neutral < domain) {
      const y = yOf(neutral);
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(g.x0, y);
      ctx.lineTo(g.x1, y);
      ctx.strokeStyle = 'rgba(20,20,25,0.45)';
      ctx.stroke();
      ctx.restore();
    }

    // Everything on the strip is clipped to it: a mark straddling the seam is
    // drawn at both ends, as the unrolled ring would cut it.
    ctx.save();
    ctx.beginPath();
    ctx.rect(g.x0, 0, g.plotW, frame.height);
    ctx.clip();

    for (const b of bins) {
      const colour = colourOf(b, frame, s);
      const w = markWidth(b, g);
      const faded = anyHover && b.key !== frame.hovered;
      const ctxValue = frame.context?.get(b.key);
      const top = yOf(b.value);
      const clipped = Number.isFinite(b.value) ? b.value > domain : b.value === Infinity;

      for (const x of copies(b, frame, g)) {
        // Context behind the mark, a little wider, so the mark reads as filling
        // it — the highlighter reading.
        if (Number.isFinite(ctxValue) && !(neutral > 0 && ctxValue === neutral)) {
          const cy = yOf(ctxValue);
          ctx.save();
          ctx.globalAlpha = faded ? 0.4 : 1;
          ctx.fillStyle = 'rgba(20,20,25,0.06)';
          ctx.fillRect(x - w / 2 - 3, cy, w + 6, g.base - cy);
          ctx.strokeStyle = 'rgba(20,20,25,0.45)';
          ctx.lineWidth = 1;
          // A model is not an observation, and should not be drawn as one.
          if (frame.contextKind !== 'whole') ctx.setLineDash([3, 2]);
          ctx.strokeRect(x - w / 2 - 3 + 0.5, cy + 0.5, w + 5, g.base - cy);
          ctx.restore();
        }

        if (b.value > 0 || b.value === Infinity) {
          ctx.globalAlpha = faded ? 0.3 : s.markOpacity;
          ctx.fillStyle = colour;
          ctx.fillRect(x - w / 2, top, w, g.base - top);
          ctx.globalAlpha = 1;
          if (clipped) {
            // Off the top of a fixed scale: say so rather than pretend it fits.
            ctx.beginPath();
            ctx.moveTo(x - 4, g.top + 2);
            ctx.lineTo(x + 4, g.top + 2);
            ctx.lineTo(x, g.top - 4);
            ctx.closePath();
            ctx.fillStyle = s.valueColor;
            ctx.fill();
          }
        }

        const hot = b.key === frame.hovered;
        if (labelled || hot) {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.font = s.valueFont;
          ctx.fillStyle = s.valueColor;
          ctx.globalAlpha = faded ? 0.35 : 1;
          const label = formatValue(b);
          ctx.fillText(label, x, Math.max(g.top + 10, (clipped ? g.top : top) - 3));
          ctx.font = s.font;
          ctx.textBaseline = 'top';
          ctx.fillStyle = s.labelColor;
          ctx.fillText(String(b.label ?? b.key), x, g.base + 4);
          ctx.globalAlpha = 1;
        }
      }
    }
    ctx.restore();

    // The compass as an axis — the same legend the unrolled lens strings along
    // its baseline (docs/findings.md F-30), faded to nothing where the strip is
    // in category order and bearing means nothing.
    const alpha = frame.bearingAlpha ?? 0;
    if (alpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = s.compassColor;
      ctx.fillStyle = 'rgba(20,20,25,0.55)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
      for (let deg = 0; deg < 360; deg += 45) {
        const f = wrap01(deg / 360 - seamOf(frame));
        const xs = [g.x0 + f * g.plotW];
        if (f < 1e-6) xs.push(g.x1); // the seam: both ends are the same bearing
        for (const x of xs) {
          ctx.beginPath();
          ctx.moveTo(x, g.base);
          ctx.lineTo(x, g.base + (names[deg] ? 6 : 3));
          ctx.stroke();
          if (names[deg]) ctx.fillText(names[deg], x, g.base + 19);
        }
      }
      ctx.restore();
    }

    ctx.restore();
  }

  /** The bin whose mark (or the column above its label) is under the point. */
  hitTest(layout, frame, px, py) {
    const g = geometry(frame);
    if (px < g.x0 || px > g.x1 || py < 0 || py > g.base + 18) return null;
    let best = null;
    let bestD = Infinity;
    for (const b of layout?.bins ?? []) {
      const reach = markWidth(b, g) / 2 + 4;
      for (const x of copies(b, frame, g)) {
        const d = Math.abs(px - x);
        if (d <= reach && d < bestD) {
          best = b;
          bestD = d;
        }
      }
    }
    return best;
  }
}

// ------------------------------------------------------------------ helpers

function geometry(frame) {
  const left = 40;
  const right = 12;
  const top = 18;
  const bottom = (frame.bearingAlpha ?? 0) > 0.01 ? 36 : 22;
  const x0 = left;
  const x1 = Math.max(left + 1, frame.width - right);
  const base = Math.max(top + 1, frame.height - bottom);
  return { x0, x1, plotW: x1 - x0, top, base, plotH: base - top };
}

/** Where the strip is cut: opposite the parameter held fixed, as `arcCurve` does. */
const seamOf = (frame) => wrap01((frame.at ?? 0) + 0.5);

/**
 * A mark is as wide as the room placement reserved for it, less a margin.
 *
 * On the ring that room holds a label beside the bar; on the strip the label
 * goes underneath, so the room is free for the bar itself. Scaling the
 * reservation, rather than the bar's own pixel width, is what keeps the
 * non-overlap guarantee on a strip of a different length.
 */
function markWidth(bin, g) {
  const reserved = 2 * (bin.halfWidth ?? 0.01) * g.plotW;
  return Math.max(3, Math.min(64, reserved * 0.72));
}

/** The x positions a mark is drawn at: once, or twice if it straddles the seam. */
function copies(bin, frame, g) {
  const f = wrap01((bin.t ?? 0) - seamOf(frame));
  const x = g.x0 + f * g.plotW;
  const half = markWidth(bin, g) / 2 + 3;
  const out = [x];
  if (x - half < g.x0) out.push(x + g.plotW);
  if (x + half > g.x1) out.push(x - g.plotW);
  return out;
}

function colourOf(bin, frame, s) {
  if (bin.color) return bin.color;
  if (bin.category == null) return s.markColor ?? s.palette[0];
  const i = frame.categories?.indexOf(bin.category) ?? -1;
  return s.palette[(i < 0 ? 0 : i) % s.palette.length];
}

function formatTick(v) {
  if (v === 0) return '0';
  if (v >= 100) return Math.round(v).toLocaleString();
  return String(Number(v.toPrecision(3)));
}

function formatValue(bin) {
  const v = bin.value;
  if (v === Infinity) return '∞';
  if (!Number.isFinite(v)) return '–';
  const unit = bin.unit;
  if (unit === 'share') return `${Math.round(v * 100)}%`;
  if (unit === 'count') return Math.round(v).toLocaleString();
  return v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(v >= 10 ? 0 : v >= 1 ? 1 : 2);
}

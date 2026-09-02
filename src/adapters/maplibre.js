/**
 * MapLibre GL adapter.
 *
 * Puts a canvas over the map and keeps a lens on it. The split that matters:
 *
 *   recompute()  runs the pipeline. Only on data / centre / radius / config
 *                change — never on viewport change.
 *   repaint()    draws. On every move, zoom and resize.
 *
 * The ring is a fixed-size instrument in screen pixels, so panning and zooming
 * never reflow the layout; only the dashed geographic boundary inside it
 * changes size. That is both smoother than recomputing and the honest reading
 * of `glyphScale: 'screen'` (docs/design-space.md 3.5).
 *
 * **Using this with deck.gl.** The common setup — deck.gl rendering data over a
 * MapLibre map, via MapboxOverlay — already works: pass the same MapLibre map
 * here and the lens draws on its own canvas above deck's. What is *not*
 * implemented is a standalone Deck (no MapLibre underneath); that needs a
 * second adapter supplying `project`/`unproject` from a Deck viewport plus
 * `onViewStateChange` in place of the map events. Nothing in the core or the
 * renderer would change — they take a curve and screen coordinates and know
 * nothing about maps.
 */

import { computeLens, lerpLayout } from '../core/layout.js';
import { LensRenderer } from '../render/LensRenderer.js';
import { destination, distance, pathLength } from '../core/geo.js';
import { normaliseRings } from '../core/selection.js';
import { polylineCurve } from '../core/curve.js';

export class LensOverlay {
  /**
   * @param {import('maplibre-gl').Map} map
   * @param {object} options  everything `computeLens` takes, plus:
   * @param {object} [options.style]      renderer style / preset
   * @param {boolean} [options.draggable=true]
   * @param {(bin, event) => void} [options.onHover]
   * @param {(bin, event) => void} [options.onClick]
   * @param {(state) => void} [options.onChange]  fired after every recompute
   */
  constructor(map, options = {}) {
    this.map = map;
    this.options = {
      binning: { mode: 'angular', bins: 24 },
      normalisation: { mode: 'count' },
      placement: { mode: 'necklace' },
      marks: { type: 'bar' },
      draggable: true,
      ...options,
    };
    this.renderer = new LensRenderer(options.style);
    this.layout = null;
    this._drag = null;
    this._transition = null;

    this._mount();
    this._bind();
    this.recompute();
  }

  // ---------------------------------------------------------------- mounting

  _mount() {
    const container = this.map.getContainer();
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '2',
    });
    container.appendChild(canvas);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._resize();
  }

  _resize() {
    const { clientWidth: w, clientHeight: h } = this.map.getContainer();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._css = { w, h };
  }

  _bind() {
    this._onRender = () => this.repaint();
    this._onResize = () => {
      this._resize();
      this.repaint();
    };
    this.map.on('render', this._onRender);
    this.map.on('resize', this._onResize);

    // Only a geographic anchor needs this; a ring lens is zoom-invariant.
    this._onZoomEnd = () => {
      if (this.options.selection?.type === 'corridor') this._scheduleRecompute();
    };
    this.map.on('zoomend', this._onZoomEnd);

    if (this.options.draggable) {
      const el = this.map.getContainer();
      this._onDown = (e) => this._pointerDown(e);
      this._onMove = (e) => this._pointerMove(e);
      this._onUp = () => this._pointerUp();
      el.addEventListener('pointerdown', this._onDown);
      window.addEventListener('pointermove', this._onMove);
      window.addEventListener('pointerup', this._onUp);
    }
  }

  destroy() {
    this.map.off('render', this._onRender);
    this.map.off('resize', this._onResize);
    this.map.off('zoomend', this._onZoomEnd);
    if (this.options.draggable) {
      const el = this.map.getContainer();
      el.removeEventListener('pointerdown', this._onDown);
      window.removeEventListener('pointermove', this._onMove);
      window.removeEventListener('pointerup', this._onUp);
    }
    this.canvas.remove();
  }

  // ----------------------------------------------------------------- updates

  /** Run the pipeline. Call after changing data, centre, radius or config. */
  recompute() {
    const o = this.options;
    // A corridor's anchor is geographic, so its on-screen length — and hence
    // how much room each mark has — changes with zoom. That is the opposite of
    // the ring, which is fixed in pixels (F-9), and it is why a corridor lens
    // recomputes on zoom while a disc lens does not. See docs/findings.md F-14.
    const curveLength = this._curveLengthPx();
    const next = computeLens({
      center: o.center,
      selection: o.selection,
      data: o.data ?? [],
      getPosition: o.getPosition,
      binning: o.binning,
      normalisation: o.normalisation,
      placement: curveLength ? { ...o.placement, curveLength } : o.placement,
      marks: o.marks,
      structure: o.structure,
      ring: { radius: this.renderer.style.ringRadius },
    });

    // `target` is the settled layout. `layout` may lag behind it mid-transition,
    // so anything reporting numbers must read `target`, not `layout`.
    this.target = next;
    if (this.layout && o.animate !== false) this._animateTo(next);
    else this.layout = next;

    this.options.onChange?.(this.state());
    this.repaint();
    return next;
  }

  /** Merge config and recompute. */
  update(patch = {}) {
    for (const [k, v] of Object.entries(patch)) {
      this.options[k] =
        v && typeof v === 'object' && !Array.isArray(v) && this.options[k]
          ? { ...this.options[k], ...v }
          : v;
    }
    if (patch.style) this.renderer.setStyle(patch.style);
    return this.recompute();
  }

  setCenter(center) {
    return this.update({ center });
  }

  setRadius(radiusM) {
    return this.update({ selection: { ...this.options.selection, radius: radiusM } });
  }

  setData(data) {
    return this.update({ data });
  }

  /**
   * Morph the angular axis between nominal order (0) and true bearing (1).
   * The interaction the library exists for — see docs/design-space.md 3.2.
   */
  setMorph(u) {
    return this.update({ placement: { mode: 'morph', morph: u } });
  }

  state() {
    const settled = this.target ?? this.layout;
    return {
      center: this.options.center,
      radius: this.options.selection?.radius,
      // The resolved selection, not the one passed in: `computeLens` fills in
      // derived values such as a corridor's length.
      selection: settled?.selection,
      structure: settled?.structure,
      stats: settled?.stats,
      bins: settled?.bins,
    };
  }

  // ------------------------------------------------------------------ paint

  /** Projected length of a corridor path in pixels, or null for a disc lens. */
  _curveLengthPx() {
    const sel = this.options.selection;
    if (sel?.type !== 'corridor' || !(sel.path?.length >= 2)) return null;
    let total = 0;
    for (let i = 1; i < sel.path.length; i++) {
      const a = this.map.project(sel.path[i - 1]);
      const b = this.map.project(sel.path[i]);
      total += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return total;
  }

  frame() {
    const selection = this.options.selection;

    // A corridor has no centre: its anchor is the projected path itself, so the
    // curve is rebuilt each paint while the layout stays untouched.
    if (selection.type === 'corridor' && selection.path?.length >= 2) {
      const pts = selection.path.map((c) => {
        const q = this.map.project(c);
        return [q.x, q.y];
      });
      const mid = selection.path[Math.floor(selection.path.length / 2)];
      const a = this.map.project(mid);
      const b = this.map.project(destination(mid, 90, selection.width / 2));
      return {
        cx: pts[0][0],
        cy: pts[0][1],
        curve: polylineCurve(pts, { closed: false }),
        corridorHalfWidthPx: Math.hypot(b.x - a.x, b.y - a.y),
        selectionRadiusPx: 0,
      };
    }

    // A polygon carries its own boundary and its centre is the centroid the
    // layout resolved, so there is no radius to project.
    if (selection.type === 'polygon') {
      const centre = this.target?.center ?? selection.center;
      const p = centre ? this.map.project(centre) : { x: 0, y: 0 };
      const rings = normaliseRings(selection).map((ring) =>
        ring.map((c) => {
          const q = this.map.project(c);
          return [q.x, q.y];
        }));
      return { cx: p.x, cy: p.y, selectionRings: rings, selectionRadiusPx: 0 };
    }

    const p = this.map.project(this.options.center);
    // Radius in pixels, measured along a real geodesic so it stays correct at
    // high latitudes rather than assuming a local metres-per-pixel constant.
    const edge = this.map.project(destination(this.options.center, 90, selection.radius));
    return {
      cx: p.x,
      cy: p.y,
      selectionRadiusPx: Math.hypot(edge.x - p.x, edge.y - p.y),
    };
  }

  repaint() {
    if (!this.layout || !this._css) return;
    this.ctx.clearRect(0, 0, this._css.w, this._css.h);
    this.renderer.draw(this.ctx, this.layout, this.frame());
  }

  _animateTo(next, duration = 320) {
    const from = this.layout;
    const start = performance.now();
    cancelAnimationFrame(this._transition);
    const tick = (now) => {
      const u = Math.min(1, (now - start) / duration);
      const eased = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
      this.layout = u >= 1 ? next : lerpLayout(from, next, eased);
      this.repaint();
      if (u < 1) this._transition = requestAnimationFrame(tick);
    };
    this._transition = requestAnimationFrame(tick);
  }

  // -------------------------------------------------------------- interaction

  _localPoint(e) {
    const r = this.map.getContainer().getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _pointerDown(e) {
    const { x, y } = this._localPoint(e);
    const f = this.frame();

    if (this.options.selection.type === 'corridor') {
      // Grab whichever endpoint is nearest, so a transect can be re-aimed.
      const pts = this.options.selection.path;
      const ends = [0, pts.length - 1].map((i) => {
        const q = this.map.project(pts[i]);
        return { i, d: Math.hypot(x - q.x, y - q.y) };
      });
      const nearest = ends.sort((a, b) => a.d - b.d)[0];
      if (nearest.d > 16) return;
      this._drag = { kind: 'endpoint', index: nearest.i };
      this.map.dragPan.disable();
      e.preventDefault();
      return;
    }

    const d = Math.hypot(x - f.cx, y - f.cy);
    if (d < 14) this._drag = { kind: 'move' };
    else if (Math.abs(d - f.selectionRadiusPx) < 10) this._drag = { kind: 'resize' };
    else return;

    this.map.dragPan.disable();
    e.preventDefault();
  }

  _pointerMove(e) {
    const { x, y } = this._localPoint(e);

    if (!this._drag) {
      const bin = this.layout && this.renderer.hitTest(this.layout, this.frame(), x, y);
      if (bin !== this._hovered) {
        this._hovered = bin;
        this.options.onHover?.(bin, e);
        this.canvas.style.cursor = bin ? 'pointer' : '';
      }
      return;
    }

    // Dragging changes the selection at pointer rate, so coalesce to one
    // pipeline run per frame and skip the transition — animating towards a
    // target that moves every frame just adds lag (docs/findings.md F-3).
    if (this._drag.kind === 'endpoint') {
      const path = [...this.options.selection.path];
      path[this._drag.index] = this.map.unproject([x, y]).toArray();
      this.options.selection = {
        ...this.options.selection,
        path,
        length: pathLength(path),
      };
    } else if (this._drag.kind === 'move') {
      this.options.center = this.map.unproject([x, y]).toArray();
    } else {
      const next = distance(this.options.center, this.map.unproject([x, y]).toArray());
      this.options.selection = {
        ...this.options.selection,
        radius: Math.max(50, Math.round(next)),
      };
    }
    this._scheduleRecompute();
  }

  _scheduleRecompute() {
    if (this._pending) return;
    this._pending = requestAnimationFrame(() => {
      this._pending = null;
      const animate = this.options.animate;
      this.options.animate = false;
      this.recompute();
      this.options.animate = animate;
    });
  }

  _pointerUp() {
    if (!this._drag) return;
    this._drag = null;
    this.map.dragPan.enable();
  }
}

/** Convenience wrapper. */
export function addLens(map, options) {
  return new LensOverlay(map, options);
}

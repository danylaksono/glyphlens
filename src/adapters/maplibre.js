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
import { computeField, TOUCHING } from '../core/field.js';
import {
  lattice, relaxedLattice, voronoiCells, latticeNeighbours, hullOf, spacingForCount,
} from '../core/lattice.js';
import { LensRenderer } from '../render/LensRenderer.js';
import { destination, distance, pathLength } from '../core/geo.js';
import { normaliseRings } from '../core/selection.js';
import { arcCurve, polylineCurve, straightenPath, wrap01 } from '../core/curve.js';
import { insertNode, removeNode, pathFromGeoJSON } from '../core/route.js';

export class LensOverlay {
  /**
   * @param {import('maplibre-gl').Map} map
   * @param {object} options  everything `computeLens` takes, plus:
   * @param {object} [options.style]      renderer style / preset
   * @param {object} [options.anchor]     `{ unroll: 0..1, at }` — the curve the
   *   marks are drawn on. `unroll` opens the ring into a straight baseline of
   *   the same length, and straightens a corridor onto its own chainage; `at`
   *   is the parameter held fixed, or `'auto'` to seam at the widest gap.
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
    // Null rather than undefined: a hover change is now a repaint, and an
    // unset field would make the first pointer move over empty map count as
    // one.
    this._hovered = null;
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
      association: o.association,
      structure: o.structure,
      areal: o.areal,
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

  /**
   * Open the anchor from a closed ring (0) to a straight baseline (1).
   *
   * Deliberately not `update()`: the anchor is a drawing decision, and the
   * curve keeps its length at every value, so the solved placement stays valid
   * and there is nothing to recompute. That is what makes this cheap enough to
   * drive from a slider on a field of lenses (docs/findings.md F-27).
   */
  setUnroll(u, at) {
    this.options.anchor = {
      ...this.options.anchor,
      unroll: Math.min(1, Math.max(0, u)),
      ...(at === undefined ? {} : { at }),
    };
    this.repaint();
    return this.layout;
  }

  /** Replace the corridor path — from an edit, a preset or an imported line. */
  setPath(path) {
    return this.update({
      selection: { ...this.options.selection, path, length: pathLength(path) },
    });
  }

  /**
   * Take the corridor path from a GeoJSON line the caller already has.
   *
   * Returns what the import did — how many parts were found, how far the route
   * was simplified — because both are things the analyst should see rather
   * than discover from a lens that has quietly become slow or coarse.
   */
  setPathFromGeoJSON(doc, options) {
    const result = pathFromGeoJSON(doc, options);
    this.setPath(result.path);
    return result;
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

  /**
   * How far the anchor is unrolled, and the parameter held fixed.
   *
   * The default differs by anchor: a ring holds north at the top of the screen,
   * while an open curve opens about its own midpoint rather than sliding away
   * from one end. An open curve also has no seam to place — its ends are
   * already its ends — so `'auto'` means nothing there and falls back.
   */
  _anchor(defaultAt = 0, { seam = true } = {}) {
    const { unroll = 0, at = defaultAt } = this.options.anchor ?? {};
    const u = Math.min(1, Math.max(0, unroll));
    if (at !== 'auto') return { unroll: u, at };

    // Seam the ring at the widest empty stretch, so opening it never cuts a
    // mark in half. Read off the settled layout, not the animating one, so the
    // seam does not wander during a transition.
    const bins = seam ? (this.target ?? this.layout)?.bins ?? [] : [];
    if (bins.length < 2) return { unroll: u, at: defaultAt };
    const ts = bins.map((b) => b.t).sort((a, b) => a - b);
    let gap = ts[0] + 1 - ts[ts.length - 1];
    let widest = wrap01(ts[ts.length - 1] + gap / 2);
    for (let i = 1; i < ts.length; i++) {
      const d = ts[i] - ts[i - 1];
      if (d > gap) {
        gap = d;
        widest = ts[i - 1] + d / 2;
      }
    }
    return { unroll: u, at: wrap01(widest + 0.5) };
  }

  frame() {
    const selection = this.options.selection;
    const onRoute = selection.type === 'corridor' && selection.path?.length >= 2;
    const { unroll, at } = onRoute ? this._anchor(0.5, { seam: false }) : this._anchor(0);

    // A corridor has no centre: its anchor is the projected path itself, so the
    // curve is rebuilt each paint while the layout stays untouched.
    if (onRoute) {
      const pts = selection.path.map((c) => {
        const q = this.map.project(c);
        return [q.x, q.y];
      });
      const mid = selection.path[Math.floor(selection.path.length / 2)];
      const a = this.map.project(mid);
      const b = this.map.project(destination(mid, 90, selection.width / 2));
      // Straightening a route is the open-curve form of unrolling a ring: the
      // strip keeps every member's chainage and offset and gives up its
      // position, which is a linear cartogram (docs/findings.md F-28).
      const drawn = straightenPath(pts, unroll, { at });
      const halfWidthPx = Math.hypot(b.x - a.x, b.y - a.y);
      return {
        cx: pts[0][0],
        cy: pts[0][1],
        curve: polylineCurve(drawn, { closed: false }),
        unroll,
        ghost: unroll > 0.02 ? pts : null,
        // A vertex on a straightened route is at a cartogram position, so it
        // stops being something you can meaningfully drag.
        nodes: this.options.draggable && unroll <= 0.02 ? pts : null,
        corridorHalfWidthPx: halfWidthPx,
        // Pixels per metre, which is what puts a leader's target at a real
        // distance rather than a guessed one.
        scalePx: halfWidthPx / (selection.width / 2),
        selectionRadiusPx: 0,
        hovered: this._hovered?.key,
      };
    }

    // The ring, at whatever curvature the anchor asks for. At `unroll = 0` this
    // is `circleCurve` exactly, so nothing about the default path changes.
    const ringRadius = this.layout?.ring?.radius ?? this.renderer.style.ringRadius;
    const anchorCurve = (cx, cy) =>
      (unroll > 0 ? arcCurve(cx, cy, ringRadius, { unroll, at }) : undefined);

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
      // A polygon has no radius to derive a scale from, so it is measured
      // directly. Without it a leader has no honest length.
      const east = centre ? this.map.project(destination(centre, 90, 100)) : p;
      return {
        cx: p.x,
        cy: p.y,
        curve: anchorCurve(p.x, p.y),
        unroll,
        selectionRings: rings,
        selectionRadiusPx: 0,
        scalePx: Math.hypot(east.x - p.x, east.y - p.y) / 100,
        hovered: this._hovered?.key,
      };
    }

    const p = this.map.project(this.options.center);
    // Radius in pixels, measured along a real geodesic so it stays correct at
    // high latitudes rather than assuming a local metres-per-pixel constant.
    const edge = this.map.project(destination(this.options.center, 90, selection.radius));
    const radiusPx = Math.hypot(edge.x - p.x, edge.y - p.y);
    return {
      cx: p.x,
      cy: p.y,
      curve: anchorCurve(p.x, p.y),
      unroll,
      selectionRadiusPx: radiusPx,
      scalePx: selection.radius > 0 ? radiusPx / selection.radius : 0,
      hovered: this._hovered?.key,
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
      // A straightened corridor is a cartogram: the vertices on screen are not
      // where the route is, so editing is off until it is rolled back up.
      if ((this.options.anchor?.unroll ?? 0) > 0.02) return;
      if (e.button !== 0) return;

      // Every vertex is a handle, not just the two ends. A transect is a
      // two-node special case of a route, and a route that can only be
      // re-aimed rather than shaped cannot follow a river or a ring road —
      // which is most of the linear features worth lensing.
      const pts = this.options.selection.path;
      const screen = pts.map((c) => {
        const q = this.map.project(c);
        return [q.x, q.y];
      });

      let nearest = { i: -1, d: Infinity };
      screen.forEach(([qx, qy], i) => {
        const d = Math.hypot(x - qx, y - qy);
        if (d < nearest.d) nearest = { i, d };
      });

      if (nearest.d <= 14) {
        // Alt-click removes a node, which is the only way to get back down to
        // a simpler route once one has been shaped.
        if (e.altKey && pts.length > 2) {
          this.options.selection = {
            ...this.options.selection,
            path: removeNode(pts, nearest.i),
          };
          this.options.selection.length = pathLength(this.options.selection.path);
          this._scheduleRecompute();
          e.preventDefault();
          return;
        }
        this._drag = { kind: 'node', index: nearest.i };
        this.map.dragPan.disable();
        e.preventDefault();
        return;
      }

      // Otherwise, grabbing the line itself inserts a vertex there and drags
      // it — the same gesture as every polyline editor, and it means shaping a
      // route needs no mode switch.
      const hit = nearestSegment([x, y], screen);
      if (hit.d <= 10) {
        const path = insertNode(pts, hit.index + 1, this.map.unproject([x, y]).toArray());
        this.options.selection = { ...this.options.selection, path, length: pathLength(path) };
        this._drag = { kind: 'node', index: hit.index + 1 };
        this.map.dragPan.disable();
        this._scheduleRecompute();
        e.preventDefault();
      }
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
        // The hovered mark is now something the renderer draws from, so a
        // change of hover is a repaint — once per change, not per move.
        this.repaint();
      }
      return;
    }

    // Dragging changes the selection at pointer rate, so coalesce to one
    // pipeline run per frame and skip the transition — animating towards a
    // target that moves every frame just adds lag (docs/findings.md F-3).
    if (this._drag.kind === 'node') {
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

/** Closest segment of a projected polyline to a point, and how far away it is. */
function nearestSegment([px, py], points) {
  let best = { index: 0, d: Infinity, at: 0 };
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const u = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2));
    const d = Math.hypot(px - (ax + dx * u), py - (ay + dy * u));
    if (d < best.d) best = { index: i, d, at: u };
  }
  return best;
}

/** Convenience wrapper. */
export function addLens(map, options) {
  return new LensOverlay(map, options);
}

/**
 * A field of lenses on a map — the tessellated end of the continuum.
 *
 * Deliberately a separate class rather than a mode on `LensOverlay`: a field
 * has no drag, no hover target and no single centre, so sharing that machinery
 * would mean guarding half of it. What it *does* share is everything that
 * matters — the same `computeLens`, the same solver, the same renderer — which
 * is the whole claim of docs/design-space.md §5.
 *
 * The control is `count`. Spacing follows from it, the lens radius follows from
 * spacing, and the ring shrinks with the radius so the glyphs stay inside their
 * cells. Turn it down to one and you have a single lens; turn it up and the
 * same object is a gridded glyphmap.
 */
export class FieldOverlay {
  constructor(map, options = {}) {
    this.map = map;
    this.options = {
      count: 60,
      coverRadius: 4000,
      packing: TOUCHING,
      // Which tiling the centres sit on: 'hex' (default), 'square',
      // 'triangle', or 'relaxed' for a Lloyd-relaxed lattice inside
      // `boundary`. See docs/findings.md F-34 and F-35.
      lattice: 'hex',
      // `false` | 'selection' (the disc each lens actually counted) |
      // 'lattice' (the cell of ground nearest this centre) | 'both' |
      // 'delaunay' (the triangulation: which cells are neighbours).
      cells: false,
      minCount: 3,
      binning: { mode: 'angular', bins: 12 },
      normalisation: { mode: 'count' },
      placement: { mode: 'necklace' },
      marks: { type: 'bar', barWidth: 3 },
      ...options,
    };
    this.renderer = new LensRenderer(options.style);
    this.field = { lenses: [], stats: null };

    this._mount();
    this._bind();
    this.recompute();
  }

  _mount() {
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, {
      position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '2',
    });
    this.map.getContainer().appendChild(canvas);
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
    this._onResize = () => { this._resize(); this.repaint(); };
    // Unlike a single lens, a field's ring radius is tied to a geographic
    // spacing, so its layout genuinely depends on zoom (the same asymmetry as
    // the corridor, docs/findings.md F-14).
    this._onZoomEnd = () => this.recompute();
    this.map.on('render', this._onRender);
    this.map.on('resize', this._onResize);
    this.map.on('zoomend', this._onZoomEnd);
  }

  destroy() {
    this.map.off('render', this._onRender);
    this.map.off('resize', this._onResize);
    this.map.off('zoomend', this._onZoomEnd);
    this.canvas.remove();
  }

  /** Metres per screen pixel at the map's current centre and zoom. */
  _metresPerPixel() {
    const c = this.map.getCenter().toArray();
    const a = this.map.project(c);
    const b = this.map.project(destination(c, 90, 1000));
    const px = Math.hypot(b.x - a.x, b.y - a.y);
    return px > 0 ? 1000 / px : 1;
  }

  recompute() {
    const o = this.options;
    const centre = o.center ?? this.map.getCenter().toArray();
    const kind = o.lattice ?? 'hex';

    // A relaxed lattice fills a shape rather than covering a radius, so it is
    // the one kind that needs a boundary — and it derives its own spacing from
    // that shape's area rather than being told one.
    const built = kind === 'relaxed'
      ? this._relaxed(o)
      : lattice({
        kind,
        center: centre,
        radius: o.coverRadius,
        spacing: spacingForCount(o.count, o.coverRadius, kind),
      });

    const { centres, cells: cellSpecs } = built;
    const spacing = built.spacing;
    const radius = spacing * o.packing;

    // The ring is sized so a lens and its marks stay inside the cell it
    // represents. Without this the glyphs of neighbouring cells overlap and the
    // field stops reading as a surface.
    const mpp = this._metresPerPixel();
    const ringRadius = Math.max(4, (radius / mpp) * (o.ringFraction ?? 0.55));

    this.field = computeField({
      centres,
      cells: cellSpecs,
      kind: built.kind,
      data: o.data ?? [],
      getPosition: o.getPosition,
      selection: { type: 'disc', radius },
      binning: o.binning,
      normalisation: o.normalisation,
      placement: o.placement,
      marks: o.marks,
      areal: o.areal,
      minCount: o.minCount,
      spacing,
      ring: { radius: ringRadius },
    });

    this._ringRadius = ringRadius;
    this._mpp = mpp;
    // The disc is one number for the whole field; the cell's shape comes from
    // the lattice, per centre, and rides on each layout.
    this._cellDiscPx = radius / mpp;
    // A relaxed lattice has no regular cell, so its boundaries are the real
    // Voronoi polygons, clipped to the shape. Computed once per recompute
    // rather than per paint: it is O(n²) and the centres do not move.
    this._cellRings = kind === 'relaxed' && this._relaxedCache
      ? voronoiCells(centres, this._relaxedCache.rings)
      : null;
    // The triangulation is a field-level reading rather than a lens's chrome —
    // it is about which cells are adjacent — so it is kept here and drawn
    // once, under everything.
    this._edges = kind === 'relaxed' ? latticeNeighbours(centres).edges : null;
    this._centres = centres;
    this.options.onChange?.(this.state());
    this.repaint();
    return this.field;
  }

  update(patch = {}) {
    for (const [k, v] of Object.entries(patch)) {
      this.options[k] = v && typeof v === 'object' && !Array.isArray(v) && this.options[k]
        ? { ...this.options[k], ...v }
        : v;
    }
    if (patch.style) this.renderer.setStyle(patch.style);
    return this.recompute();
  }

  setCount(count) {
    return this.update({ count: Math.max(1, Math.round(count)) });
  }

  /**
   * Show where one cell ends and the next begins: `'selection'` for the disc
   * each lens actually counted, `'lattice'` for the hexagon of ground nearest
   * this centre, `'both'`, or `false`.
   *
   * A repaint, not a recompute — the cells are a frame of reference, and
   * nothing about the field depends on whether they are drawn.
   */
  setCells(cells) {
    this.options.cells = cells;
    this.repaint();
    return this.field;
  }

  state() {
    return {
      stats: this.field.stats,
      ringRadius: this._ringRadius,
      count: this.options.count,
      lattice: this.field.stats?.kind,
      // The disc every lens counted, and the typical cell it sits in, so a
      // caller can report both without re-deriving the lattice.
      cell: {
        disc: this._cellDiscPx,
        radius: (this.field.lenses[0]?.cell?.circumradius ?? 0) / (this._mpp || 1),
      },
    };
  }

  /**
   * A relaxed lattice, computed once per shape rather than once per zoom.
   *
   * Nothing about it depends on the viewport — the centres are geographic and
   * the relaxation is expensive — so re-running it on every `zoomend`, which
   * is what a field otherwise does, would be both wasteful and visibly
   * unstable: a different seed path would settle somewhere slightly different.
   */
  _relaxed(o) {
    // With no boundary supplied, the study area is the shape the data itself
    // occupies. A convex hull is a better default than a circle around the
    // mean, and it is free from the same triangulation the relaxation uses —
    // which is what makes `relaxed` usable with nothing but data.
    const rings = o.boundary
      ? normaliseRings({ rings: o.boundary })
      : [hullOf((o.data ?? []).map(o.getPosition ?? ((f) => [f.lng ?? f.lon, f.lat])))];

    const key = `${o.count}|${o.seed ?? 1}|${o.iterations ?? ''}|${rings[0]?.length}|`
      + `${JSON.stringify(rings[0]?.slice(0, 4))}`;
    if (this._relaxedCache?.key !== key) {
      const value = relaxedLattice({
        rings,
        count: o.count,
        ...(o.iterations ? { iterations: o.iterations } : {}),
        seed: o.seed ?? 1,
      });
      this._relaxedCache = { key, value, rings };
    }
    return this._relaxedCache.value;
  }

  /**
   * The triangulation over the field's centres.
   *
   * On a regular lattice this would be redundant — every centre has the same
   * six neighbours by construction. On a relaxed one it is the only way to see
   * which readings are next to which, and it is the graph the relaxation
   * itself walks (docs/findings.md F-36).
   */
  _drawEdges(ctx) {
    const s = this.renderer.style;
    const at = (c) => {
      const p = this.map.project(c);
      return [p.x, p.y];
    };
    ctx.save();
    ctx.strokeStyle = s.cellStroke;
    ctx.globalAlpha = (s.cellOpacity ?? 0.55) * 0.7;
    ctx.lineWidth = s.cellWidth ?? 1;
    ctx.beginPath();
    for (const [i, j] of this._edges) {
      const a = at(this._centres[i]);
      const b = at(this._centres[j]);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** One cell's screen geometry: the disc it counted, and the ground it owns. */
  _cellFor(layout, wantDisc, wantCell) {
    const spec = layout.cell;
    const ring = wantCell && spec?.ringIndex != null
      ? this._cellRings?.[spec.ringIndex]?.map((c) => {
        const q = this.map.project(c);
        return [q.x, q.y];
      })
      : null;
    return {
      disc: wantDisc ? this._cellDiscPx : 0,
      radius: wantCell && spec ? spec.circumradius / this._mpp : 0,
      sides: spec?.sides ?? 0,
      rotate: spec?.rotate ?? 0,
      ring,
    };
  }

  repaint() {
    if (!this._css) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this._css.w, this._css.h);

    const ring = this._ringRadius;
    const cells = this.options.cells;
    const wantDisc = cells === 'selection' || cells === 'both';
    const wantCell = cells === 'lattice' || cells === 'both';

    // The Delaunay edges, under everything: a field-level statement about
    // which cells are adjacent, not a per-lens one.
    if (cells === 'delaunay' && this._edges?.length) this._drawEdges(ctx);
    // Cull against the cell rather than the ring once one is drawn: a cell is
    // nearly twice the ring's radius, so the old margin clipped its outline.
    const pad = Math.max(ring, cells ? this._cellDiscPx * 2 : 0) * 3;
    for (const layout of this.field.lenses) {
      const p = this.map.project(layout.center);
      // Cheap cull: a field can hold thousands of lenses and most of them are
      // off screen at any moment.
      if (p.x < -pad || p.y < -pad || p.x > this._css.w + pad || p.y > this._css.h + pad) {
        continue;
      }
      this.renderer.draw(ctx, layout, {
        cx: p.x,
        cy: p.y,
        ringRadius: ring,
        selectionRadiusPx: 0,
        cell: cells ? this._cellFor(layout, wantDisc, wantCell) : null,
      });
    }
  }
}

/** Convenience wrapper. */
export function addField(map, options) {
  return new FieldOverlay(map, options);
}


/*! glyphlens | MIT | https://github.com/danylaksono/glyphlens */
var glyphlens = (function (exports) {
  'use strict';

  /**
   * Geodesy helpers.
   *
   * Everything here works on `[lng, lat]` pairs in degrees and returns metres or
   * degrees. Screen-space conversion lives in the adapters, with the single
   * exception of `bearingToScreenAngle`, which is needed by the layout stage to
   * turn a compass bearing into a canvas angle.
   */

  const EARTH_RADIUS$1 = 6371008.8; // metres, IUGG mean radius

  const toRad$1 = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;

  /** Great-circle distance in metres. */
  function distance([lng1, lat1], [lng2, lat2]) {
    const phi1 = toRad$1(lat1);
    const phi2 = toRad$1(lat2);
    const dPhi = toRad$1(lat2 - lat1);
    const dLambda = toRad$1(lng2 - lng1);
    const a =
      Math.sin(dPhi / 2) ** 2 +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
    return 2 * EARTH_RADIUS$1 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /** Initial bearing in degrees, 0 = north, increasing clockwise. */
  function bearing([lng1, lat1], [lng2, lat2]) {
    const phi1 = toRad$1(lat1);
    const phi2 = toRad$1(lat2);
    const dLambda = toRad$1(lng2 - lng1);
    const y = Math.sin(dLambda) * Math.cos(phi2);
    const x =
      Math.cos(phi1) * Math.sin(phi2) -
      Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
    return normaliseBearing(toDeg(Math.atan2(y, x)));
  }

  /**
   * Wrap a bearing into [0, 360).
   *
   * The epsilon matters: a feature due north can come back from the trigonometry
   * as 359.999999998, and a naive wrap then files it in the *last* angular bin
   * rather than the first — visible as a bar on the wrong side of north.
   */
  function normaliseBearing(deg, epsilon = 1e-9) {
    const b = ((deg % 360) + 360) % 360;
    return b >= 360 - epsilon || b < epsilon ? 0 : b;
  }

  /** Point at `distanceM` along `bearingDeg` from `origin`. */
  function destination([lng, lat], bearingDeg, distanceM) {
    const delta = distanceM / EARTH_RADIUS$1;
    const theta = toRad$1(bearingDeg);
    const phi1 = toRad$1(lat);
    const lambda1 = toRad$1(lng);
    const sinPhi2 =
      Math.sin(phi1) * Math.cos(delta) +
      Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
    const phi2 = Math.asin(sinPhi2);
    const lambda2 =
      lambda1 +
      Math.atan2(
        Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
        Math.cos(delta) - Math.sin(phi1) * sinPhi2,
      );
    return [((toDeg(lambda2) + 540) % 360) - 180, toDeg(phi2)];
  }

  /**
   * Compass bearing (0 = north, clockwise) to canvas angle in radians
   * (0 = +x axis, clockwise because canvas y points down).
   */
  const bearingToScreenAngle = (bearingDeg) => toRad$1(bearingDeg - 90);

  /** Inverse of {@link bearingToScreenAngle}. */
  const screenAngleToBearing = (rad) => (toDeg(rad) + 450) % 360;

  /** Ground resolution in metres per pixel for a Web Mercator tile pyramid. */
  function metresPerPixel(lat, zoom, tileSize = 512) {
    return (
      (Math.cos(toRad$1(lat)) * 2 * Math.PI * EARTH_RADIUS$1) /
      (tileSize * 2 ** zoom)
    );
  }

  /** Smallest signed difference between two bearings, in (-180, 180]. */
  function bearingDelta(a, b) {
    return ((((b - a) % 360) + 540) % 360) - 180;
  }

  /**
   * Project a point onto a polyline.
   *
   * Works in a local equirectangular frame scaled at the polyline's mean
   * latitude, which is accurate to well under a metre over the few kilometres a
   * corridor lens spans, and avoids dragging in a projection library.
   *
   * @param {[number, number]} point
   * @param {Array<[number, number]>} path  at least two [lng, lat] vertices
   * @returns {{ offset: number, chainage: number, t: number, closest: [number, number] }}
   *   `offset` is the perpendicular distance in metres, signed: positive to the
   *   left of the direction of travel. `chainage` is the distance along the path
   *   to the closest point, and `t` the same as a fraction of total length.
   */
  function projectOntoPath(point, path) {
    const lat0 = path.reduce((s, p) => s + p[1], 0) / path.length;
    const kx = (Math.PI / 180) * EARTH_RADIUS$1 * Math.cos(toRad$1(lat0));
    const ky = (Math.PI / 180) * EARTH_RADIUS$1;
    const xy = ([lng, lat]) => [lng * kx, lat * ky];

    const p = xy(point);
    const verts = path.map(xy);

    let best = { offset: Infinity, chainage: 0, t: 0, closest: path[0] };
    let travelled = 0;

    for (let i = 0; i < verts.length - 1; i++) {
      const [ax, ay] = verts[i];
      const [bx, by] = verts[i + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const segLen = Math.hypot(dx, dy);
      if (segLen === 0) continue;

      // Parameter of the closest point on this segment, clamped to its ends.
      const u = Math.min(1, Math.max(0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / segLen ** 2));
      const cx = ax + dx * u;
      const cy = ay + dy * u;
      const dist = Math.hypot(p[0] - cx, p[1] - cy);

      if (dist < Math.abs(best.offset)) {
        // Sign from the 2D cross product: positive is left of travel.
        const side = Math.sign(dx * (p[1] - ay) - dy * (p[0] - ax)) || 1;
        best = {
          offset: dist * side,
          chainage: travelled + segLen * u,
          t: 0,
          closest: [cx / kx, cy / ky],
        };
      }
      travelled += segLen;
    }

    best.t = travelled > 0 ? best.chainage / travelled : 0;
    return best;
  }

  /** Total length of a polyline in metres. */
  function pathLength(path) {
    let total = 0;
    for (let i = 1; i < path.length; i++) total += distance(path[i - 1], path[i]);
    return total;
  }

  /**
   * Point-in-polygon by ray casting, with holes.
   *
   * `rings` is an array of linear rings in [lng, lat]: the first is the outer
   * boundary, any others are holes. Crossings are counted across every ring and
   * the parity taken at the end, so a point inside a hole correctly falls out.
   *
   * Winding order does not matter, and rings need not be explicitly closed.
   *
   * Testing in degrees rather than a projected frame is deliberate: it is exact
   * for the meridian/parallel edges that admin boundaries are full of, and the
   * error elsewhere is the same great-circle-vs-straight-line difference that the
   * polygon's own vertices already assume.
   */
  function pointInPolygon(point, rings) {
    const [x, y] = point;
    let inside = false;
    for (const ring of rings) {
      if (!ring || ring.length < 3) continue;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
          inside = !inside;
        }
      }
    }
    return inside;
  }

  /** Local equirectangular scale factors at a latitude: metres per degree. */
  function localScale(lat) {
    return [
      (Math.PI / 180) * EARTH_RADIUS$1 * Math.cos(toRad$1(lat)),
      (Math.PI / 180) * EARTH_RADIUS$1,
    ];
  }

  /**
   * Area of a polygon in square kilometres.
   *
   * Shoelace in a local equirectangular frame at the outer ring's mean latitude.
   * Holes subtract. Good to well under a percent at city scale; not intended for
   * continental polygons.
   */
  function polygonArea(rings) {
    if (!rings?.length) return 0;
    const outer = rings[0];
    if (!outer || outer.length < 3) return 0;
    const lat0 = outer.reduce((s, p) => s + p[1], 0) / outer.length;
    const [kx, ky] = localScale(lat0);

    const ringArea = (ring) => {
      let sum = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        sum += (ring[j][0] * kx) * (ring[i][1] * ky) - (ring[i][0] * kx) * (ring[j][1] * ky);
      }
      return Math.abs(sum) / 2;
    };

    let area = ringArea(outer);
    for (let i = 1; i < rings.length; i++) {
      if (rings[i]?.length >= 3) area -= ringArea(rings[i]);
    }
    return Math.max(0, area) / 1e6;
  }

  /**
   * Area-weighted centroid of a polygon's outer ring, as [lng, lat].
   *
   * Used as the lens centre when a polygon selection does not supply one — every
   * downstream stage needs a point to measure bearing and distance from. Falls
   * back to the vertex mean for degenerate (zero-area) rings.
   */
  function polygonCentroid(rings) {
    const ring = rings?.[0];
    if (!ring?.length) return [0, 0];
    if (ring.length < 3) {
      return [
        ring.reduce((s, p) => s + p[0], 0) / ring.length,
        ring.reduce((s, p) => s + p[1], 0) / ring.length,
      ];
    }

    let twiceArea = 0;
    let x = 0;
    let y = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      twiceArea += cross;
      x += (ring[j][0] + ring[i][0]) * cross;
      y += (ring[j][1] + ring[i][1]) * cross;
    }
    if (Math.abs(twiceArea) < 1e-12) {
      return [
        ring.reduce((s, p) => s + p[0], 0) / ring.length,
        ring.reduce((s, p) => s + p[1], 0) / ring.length,
      ];
    }
    return [x / (3 * twiceArea), y / (3 * twiceArea)];
  }

  /**
   * The angular extent of a polygon seen from a point, as [fromBearing, toBearing]
   * sweeping clockwise.
   *
   * This is Speckmann & Verbeek's feasible interval in its original form — the arc
   * a region may legitimately occupy on the necklace (docs/findings.md F-1). It is
   * unused by the point-data pipeline, where every member is a single bearing, and
   * exists because it is the primitive the area-based extension turns on.
   *
   * Returns `null` when the centre lies inside the polygon, since then the region
   * spans every direction and no interval constrains it.
   */
  function angularExtent(center, rings) {
    const ring = rings?.[0];
    if (!ring?.length) return null;
    if (pointInPolygon(center, rings)) return null;

    const bearings = ring.map((p) => toRad$1(bearing(center, p)));
    // Work relative to the first vertex so the sweep is unwrapped rather than
    // split at north, then take the extremes.
    const base = bearings[0];
    let min = 0;
    let max = 0;
    for (const b of bearings) {
      const d = ((((b - base) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      if (d < min) min = d;
      if (d > max) max = d;
    }
    return [normaliseBearing(toDeg(base + min)), normaliseBearing(toDeg(base + max))];
  }

  var geo = /*#__PURE__*/Object.freeze({
    __proto__: null,
    EARTH_RADIUS: EARTH_RADIUS$1,
    angularExtent: angularExtent,
    bearing: bearing,
    bearingDelta: bearingDelta,
    bearingToScreenAngle: bearingToScreenAngle,
    destination: destination,
    distance: distance,
    metresPerPixel: metresPerPixel,
    normaliseBearing: normaliseBearing,
    pathLength: pathLength,
    pointInPolygon: pointInPolygon,
    polygonArea: polygonArea,
    polygonCentroid: polygonCentroid,
    projectOntoPath: projectOntoPath,
    screenAngleToBearing: screenAngleToBearing,
    toDeg: toDeg,
    toRad: toRad$1
  });

  /**
   * Selection — what the lens encloses (`hSpSubset`).
   *
   * Each selector takes features and returns the enclosed subset, annotated with
   * the two quantities every downstream stage needs: `distance` (metres from the
   * lens centre) and `bearing` (degrees, 0 = north). Those annotations are what
   * make the angular and radial binning modes possible at all.
   *
   * Currently implemented: disc, annulus, sector, corridor, polygon.
   *
   * `polygon` also covers the `lasso` and `isochrone` cases: all three are "here
   * is a shape", and they differ only in where the shape came from. Producing an
   * isochrone is a routing problem and stays the caller's job — this library
   * renders whatever polygon it is handed.
   *
   * A corridor is the one selection with no centre. Its members are annotated
   * with `chainage` (distance along the path) and `offset` (signed perpendicular
   * distance) instead, which is what lets the same binning and placement stages
   * run on a route or a coastline as on a disc.
   */


  const defaultGetPosition = (f) =>
    Array.isArray(f) ? f : f.position ?? f.coordinates ?? [f.lng ?? f.lon ?? f.x, f.lat ?? f.y];

  /**
   * @param {object} selection  `{ type, ...params }`
   * @param {[number, number]} selection.center  [lng, lat]
   * @returns {(features: any[], opts?: object) => { items: any[], area: number }}
   */
  function select(features, selection, { getPosition = defaultGetPosition } = {}) {
    if (selection.type === 'corridor') return selectCorridor(features, selection, { getPosition });
    if (selection.type === 'polygon') return selectPolygon(features, selection, { getPosition });

    const { center } = selection;
    const items = [];

    for (const feature of features) {
      const pos = getPosition(feature);
      if (!pos || !Number.isFinite(pos[0]) || !Number.isFinite(pos[1])) continue;
      const d = distance(center, pos);
      const b = bearing(center, pos);
      if (contains(selection, d, b)) {
        items.push({ feature, position: pos, distance: d, bearing: b });
      }
    }

    return { items, area: selectionArea(selection) };
  }

  /**
   * Members within `width / 2` of a path.
   *
   * `distance` here is the distance *along* the corridor, not from a centre, so
   * that the radial binning and placement stages need no special case: for a
   * corridor, "how far along" plays the role that "how far out" plays for a disc.
   * `bearing` is the direction of travel at the closest point, so a corridor can
   * still drive the angular modes if a caller wants them.
   */
  function selectCorridor(features, selection, { getPosition = defaultGetPosition } = {}) {
    const { path, width = 400 } = selection;
    if (!path || path.length < 2) return { items: [], area: 0 };

    const half = width / 2;
    const length = pathLength(path);
    const items = [];

    for (const feature of features) {
      const pos = getPosition(feature);
      if (!pos || !Number.isFinite(pos[0]) || !Number.isFinite(pos[1])) continue;
      const { offset, chainage, t } = projectOntoPath(pos, path);
      if (Math.abs(offset) > half) continue;
      items.push({
        feature,
        position: pos,
        distance: chainage,
        offset,
        chainage,
        t,
        bearing: bearing(pos, path[Math.min(path.length - 1, 1)]),
      });
    }

    return { items, area: selectionArea({ ...selection, length }), length };
  }

  /**
   * Members inside an arbitrary polygon — a drawn lasso, an admin unit, an
   * isochrone.
   *
   * A polygon has no natural centre, but every downstream stage needs one to
   * measure bearing and distance from, so the area-weighted centroid is used
   * unless the caller supplies `center` explicitly. That choice is visible in the
   * reading: bearings are relative to it, so a caller with a better anchor — the
   * point an isochrone was generated from, say — should pass it.
   */
  function selectPolygon(features, selection, { getPosition = defaultGetPosition } = {}) {
    const rings = normaliseRings(selection);
    if (!rings.length) return { items: [], area: 0 };

    const center = selection.center ?? polygonCentroid(rings);
    const items = [];

    for (const feature of features) {
      const pos = getPosition(feature);
      if (!pos || !Number.isFinite(pos[0]) || !Number.isFinite(pos[1])) continue;
      if (!pointInPolygon(pos, rings)) continue;
      items.push({
        feature,
        position: pos,
        distance: distance(center, pos),
        bearing: bearing(center, pos),
      });
    }

    return { items, area: polygonArea(rings), center, rings };
  }

  /**
   * Accept the shapes callers actually have: a bare ring, an array of rings, or
   * GeoJSON Polygon / MultiPolygon coordinates.
   */
  function normaliseRings(selection) {
    const raw = selection.rings ?? selection.coordinates ?? selection.polygon;
    if (!Array.isArray(raw) || raw.length === 0) return [];

    // A bare ring: [[lng, lat], ...]
    if (typeof raw[0]?.[0] === 'number') return [raw];
    // Rings: [[[lng, lat], ...], ...]
    if (typeof raw[0]?.[0]?.[0] === 'number') return raw;
    // MultiPolygon: flatten to rings. Holes still work, because the parity test
    // counts crossings across every ring.
    if (typeof raw[0]?.[0]?.[0]?.[0] === 'number') return raw.flat();
    return [];
  }

  /** Containment test in the (distance, bearing) frame the selection defines. */
  function contains(selection, distanceM, bearingDeg) {
    switch (selection.type) {
      case 'disc':
        return distanceM <= selection.radius;
      case 'annulus':
        return distanceM >= (selection.innerRadius ?? 0) && distanceM <= selection.radius;
      case 'corridor':
      case 'polygon':
        // These need the geometry, not a distance and a bearing, so their own
        // selectors handle containment rather than going through this test.
        return true;
      case 'sector': {
        if (distanceM > selection.radius) return false;
        if (distanceM < (selection.innerRadius ?? 0)) return false;
        const half = (selection.sweep ?? 90) / 2;
        return Math.abs(bearingDelta(selection.bearing ?? 0, bearingDeg)) <= half;
      }
      default:
        // `polygon` is handled by the caller supplying pre-filtered features,
        // until a point-in-polygon path is added.
        return distanceM <= (selection.radius ?? Infinity);
    }
  }

  /** Selection area in square kilometres, for density normalisation. */
  function selectionArea(selection) {
    const r = (selection.radius ?? 0) / 1000;
    const ri = (selection.innerRadius ?? 0) / 1000;
    switch (selection.type) {
      case 'disc':
        return Math.PI * r * r;
      case 'annulus':
        return Math.PI * (r * r - ri * ri);
      case 'sector':
        return (Math.PI * (r * r - ri * ri) * (selection.sweep ?? 90)) / 360;
      case 'corridor': {
        // Rectangle plus the end caps; good enough for a density denominator.
        const len = (selection.length ?? pathLength(selection.path ?? [])) / 1000;
        const w = (selection.width ?? 0) / 1000;
        return len * w + Math.PI * (w / 2) ** 2;
      }
      case 'polygon':
        return polygonArea(normaliseRings(selection));
      default:
        return selection.areaKm2 ?? Math.PI * r * r;
    }
  }

  /**
   * The complement of the selection out to `contextRadius`.
   *
   * This is the "exterior" effect scope from the lens design space: an
   * inside-vs-rest baseline without needing a second view.
   * See docs/design-space.md 3.7.
   */
  function selectComplement(features, selection, options = {}) {
    const { getPosition = defaultGetPosition, contextRadius = Infinity } = options;
    const { center } = selection;
    const items = [];
    const rings = selection.type === 'polygon' ? normaliseRings(selection) : null;

    for (const feature of features) {
      const pos = getPosition(feature);
      if (!pos) continue;
      const d = distance(center, pos);
      if (d > contextRadius) continue;
      const b = bearing(center, pos);
      const inside = rings ? pointInPolygon(pos, rings) : contains(selection, d, b);
      if (!inside) {
        items.push({ feature, position: pos, distance: d, bearing: b });
      }
    }
    const outer = Number.isFinite(contextRadius) ? Math.PI * (contextRadius / 1000) ** 2 : NaN;
    return { items, area: outer - selectionArea(selection) };
  }

  /**
   * Area-based statistical data.
   *
   * Everything else in this library treats a member as a point: it has one
   * position, it is either inside the lens or outside it, and its bearing is a
   * single number. Census geography breaks all three. An LSOA is a polygon that
   * can lie partly inside the lens, it subtends an *arc* rather than a direction,
   * and its attributes cannot all be added up.
   *
   * This module supplies what that needs, and nothing more — the binning,
   * normalisation, placement and rendering stages are unchanged. The reason they
   * can be is docs/findings.md F-1: the necklace engine has taken a feasible
   * *interval* rather than a preferred angle since the first commit, precisely so
   * that areal units would be the general case and points the degenerate one.
   * `angularExtent` (core/geo.js) was built ahead of any consumer for this.
   *
   * Two things here are easy to get wrong and expensive to get wrong quietly:
   *
   *   1. **Partial containment.** A unit straddling the lens boundary contributes
   *      part of itself, not all or nothing — unless you choose otherwise, which
   *      is a legitimate and common choice, so both are offered explicitly.
   *   2. **Extensive vs intensive.** Counts can be apportioned and summed; rates,
   *      medians and densities cannot. Summing a column of percentages is the
   *      classic census-visualisation bug, and nothing about the number itself
   *      says which kind it is. See docs/findings.md F-21.
   */


  const defaultGetGeometry = (f) => f.rings ?? f.coordinates ?? f.geometry?.coordinates;

  /**
   * The share of a polygon that lies inside a selection, in [0, 1].
   *
   * Estimated by testing a deterministic grid of sample points over the
   * polygon's bounding box, rather than by clipping. Clipping a polygon against a
   * disc exactly means either an analytic circle-polygon intersection or a
   * general clipper, and neither is worth a dependency or the corner cases for a
   * weight that feeds a visual encoding.
   *
   * Deterministic rather than random so the value does not shimmer between
   * frames as the lens moves. Accuracy is roughly one part in `samples`, so the
   * default is honest to a percent or two; raise it if the weight is load-bearing.
   */
  function areaFractionInside(rings, selection, { samples = 24 } = {}) {
    const outer = rings?.[0];
    if (!outer?.length) return 0;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of outer) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    const centre = selection.center;
    let inPolygon = 0;
    let inBoth = 0;

    for (let i = 0; i < samples; i++) {
      // Cell centres, not edges: sampling the boundary biases thin polygons.
      const x = minX + ((i + 0.5) / samples) * (maxX - minX);
      for (let j = 0; j < samples; j++) {
        const y = minY + ((j + 0.5) / samples) * (maxY - minY);
        if (!pointInPolygon([x, y], rings)) continue;
        inPolygon++;
        const d = distance(centre, [x, y]);
        const b = bearing(centre, [x, y]);
        if (contains(selection, d, b)) inBoth++;
      }
    }

    // A unit far smaller than the sample spacing can catch no samples at all.
    // Falling back to its centroid is better than reporting zero for a real unit.
    if (inPolygon === 0) {
      const c = polygonCentroid(rings);
      return contains(selection, distance(centre, c), bearing(centre, c)) ? 1 : 0;
    }
    return inBoth / inPolygon;
  }

  /**
   * Select areal units against a lens.
   *
   * @param {any[]} features
   * @param {object} selection            must carry `center`
   * @param {object} [options]
   * @param {(f:any)=>any} [options.getGeometry]  rings, or GeoJSON coordinates
   * @param {(f:any)=>[number,number]} [options.getAnchor]
   *   where the unit "is" for bearing and distance. Defaults to the geometric
   *   centroid; pass the population-weighted centroid when you have it, because
   *   for an elongated or concave unit the two disagree and the bearing is the
   *   reading (docs/findings.md Q-3).
   * @param {'centroid'|'area'} [options.weighting='centroid']
   * @param {number} [options.samples=24]  grid resolution for area weighting
   * @param {number} [options.minWeight=0.001]  drop units barely inside
   */
  function arealSelect(features, selection, options = {}) {
    const {
      getGeometry = defaultGetGeometry,
      getAnchor,
      weighting = 'centroid',
      samples = 24,
      minWeight = 0.001,
    } = options;

    const centre = selection.center;
    const items = [];
    let areaKm2 = 0;

    for (const feature of features) {
      const rings = normaliseRings({ rings: getGeometry(feature) });
      if (!rings.length) continue;

      const anchor = getAnchor?.(feature) ?? polygonCentroid(rings);
      const d = distance(centre, anchor);
      const b = bearing(centre, anchor);

      const weight = weighting === 'area'
        ? areaFractionInside(rings, selection, { samples })
        : (contains(selection, d, b) ? 1 : 0);
      if (weight <= minWeight) continue;

      const unitArea = polygonArea(rings);
      areaKm2 += unitArea * weight;

      items.push({
        feature,
        position: anchor,
        distance: d,
        bearing: b,
        weight,
        rings,
        unitAreaKm2: unitArea,
        // The arc this unit subtends from the lens centre: Speckmann & Verbeek's
        // feasible interval in its original form. `null` when the centre is
        // inside the unit, since then it constrains nothing.
        interval: angularExtent(centre, rings),
      });
    }

    return { items, area: areaKm2 };
  }

  /**
   * Aggregate a measure over areal units.
   *
   * The distinction this exists for:
   *
   *   **extensive** — counts, totals, populations. Apportionable: a unit half
   *   inside the lens contributes half its people. Summed.
   *
   *   **intensive** — rates, shares, medians, densities. *Not* apportionable and
   *   emphatically not summable: half of a unit still has the same unemployment
   *   rate, and adding two rates together is meaningless. Averaged, weighted by
   *   whatever the rate is a rate *of* — population, households, area.
   *
   * Nothing about a number says which kind it is, so `kind` is required rather
   * than guessed. Guessing wrong produces a plausible-looking map that is simply
   * false, which is worse than an error.
   *
   * @param {Array} items                 from `arealSelect`
   * @param {object} measure
   * @param {(f:any)=>number} measure.value
   * @param {'extensive'|'intensive'} measure.kind
   * @param {(f:any)=>number} [measure.weight]  denominator for intensive measures
   */
  function aggregate(items, measure) {
    if (!items.length) return 0;
    const { value, kind = 'extensive', weight } = measure;

    if (kind === 'intensive') {
      // Weighted mean. Without a denominator this falls back to weighting by the
      // share of each unit inside the lens, which is an area-weighted mean —
      // defensible, but a population-weighted one is usually what is wanted.
      let num = 0;
      let den = 0;
      for (const it of items) {
        const w = (weight?.(it.feature) ?? 1) * it.weight;
        num += (value(it.feature) ?? 0) * w;
        den += w;
      }
      return den > 0 ? num / den : 0;
    }

    let total = 0;
    for (const it of items) total += (value(it.feature) ?? 0) * it.weight;
    return total;
  }

  /**
   * A measure spec for a plain count of units, which is always extensive.
   * Useful as a default so `binUnits` has something to aggregate.
   */
  const UNIT_COUNT = { value: () => 1, kind: 'extensive' };

  /**
   * Binning — how the enclosed set is decomposed.
   *
   * VisQuill's lens only ever does `categorical`: everything inside the radius
   * collapses to one number per category, discarding where and how far. The other
   * three modes are the point of this library.
   *
   *   categorical  angle = nominal order        composition
   *   angular      angle = BEARING              anisotropy (the necklace case)
   *   radial       radius = distance band       distance decay
   *   cross        bearing x category           both
   *   chainage     position = DISTANCE ALONG    what changes along a route
   *   unit         one bin per areal unit       census geography, as a necklace
   *
   * Every bin carries `bearing` (its preferred angular position, or null when the
   * mode has none) and `interval` (its feasible arc, or null). Those two fields
   * are what the placement stage consumes.
   */


  const TAU_DEG = 360;

  /**
   * Aggregate a group.
   *
   * A `measure` spec routes to `aggregate`, which knows the difference between
   * extensive and intensive quantities. Otherwise this sums `value`, or counts,
   * weighting by `item.weight` where there is one — which is 1 for every point,
   * so the point path is unchanged.
   */
  function measure(items, getValue, measureSpec) {
    if (measureSpec) return aggregate(items, measureSpec);
    if (!getValue) {
      let n = 0;
      for (const it of items) n += it.weight ?? 1;
      return n;
    }
    let sum = 0;
    for (const it of items) sum += (getValue(it.feature) ?? 0) * (it.weight ?? 1);
    return sum;
  }

  /**
   * @param {Array<{feature, distance, bearing}>} items  output of `select`
   * @param {object} spec
   * @param {'categorical'|'angular'|'radial'|'cross'} spec.mode
   * @param {(f: any) => string} [spec.category]
   * @param {(f: any) => number} [spec.value]  omit for counts
   * @param {number} [spec.bins=24]            angular bins
   * @param {number} [spec.rings=4]            radial bins
   * @param {number} [spec.radius]             required for radial/cross
   * @param {string[]} [spec.categories]       fixes order and includes empties
   */
  function bin(items, spec) {
    switch (spec.mode) {
      case 'angular':
        return binAngular(items, spec);
      case 'radial':
        return binRadial(items, spec);
      case 'cross':
        return binCross(items, spec);
      case 'chainage':
        return binChainage(items, spec);
      case 'unit':
        return binUnits(items, spec);
      case 'categorical':
      default:
        return binCategorical(items, spec);
    }
  }

  function binCategorical(items, spec = {}) {
    const getCategory = spec.category ?? ((f) => f.category ?? 'all');
    const groups = new Map();
    for (const it of items) {
      const key = String(getCategory(it.feature));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    }

    const keys = spec.categories ?? [...groups.keys()].sort();
    return keys.map((key) => {
      const group = groups.get(key) ?? [];
      return {
        key,
        label: key,
        category: key,
        count: group.length,
        raw: measure(group, spec.value, spec.measure),
        items: group,
        // Nominal order carries no bearing: placement will lay these out in
        // blocks unless the caller morphs towards `angular`.
        bearing: null,
        interval: null,
        // Mean bearing is still computed, so the categorical -> angular morph
        // has a target to interpolate towards.
        meanBearing: circularMean(group.map((g) => g.bearing)),
        // How well-defined that mean direction is, in [0, 1]. A category spread
        // evenly round the lens has a mean bearing that means nothing; this is
        // what lets the renderer say so. See docs/findings.md F-6.
        concentration: circularConcentration(group.map((g) => g.bearing)),
      };
    });
  }

  function binAngular(items, spec = {}) {
    const nBins = spec.bins ?? 24;
    const width = TAU_DEG / nBins;
    const getCategory = spec.category;
    const buckets = Array.from({ length: nBins }, () => []);

    for (const it of items) {
      const idx = Math.min(nBins - 1, Math.floor(normaliseBearing(it.bearing) / width));
      buckets[idx].push(it);
    }

    return buckets.map((group, i) => {
      const centre = i * width + width / 2;
      return {
        key: `b${i}`,
        label: compassLabel(centre),
        // A bearing sector mixes categories, so it has none of its own. Colouring
        // it by an arbitrary member would be a lie; use `cross` when the category
        // dimension matters. `dominant` is reported for tooltips only.
        category: null,
        dominant: getCategory && group.length ? dominantOf(group, getCategory) : null,
        count: group.length,
        raw: measure(group, spec.value, spec.measure),
        items: group,
        bearing: centre,
        // A bin owns exactly its wedge — this is a real feasible interval, so
        // placement cannot drift a bar into a neighbouring sector.
        interval: [i * width, (i + 1) * width],
        meanBearing: circularMean(group.map((g) => g.bearing)) ?? centre,
      };
    });
  }

  /**
   * Bins along a corridor, by distance travelled.
   *
   * The open-curve counterpart of `binAngular`: where that one owns a wedge of
   * bearings, this owns a stretch of route. Both emit a feasible `interval`, so
   * placement treats them identically — the interval is in degrees for a ring and
   * in curve parameter for a strip.
   */
  function binChainage(items, spec = {}) {
    const nBins = spec.bins ?? 20;
    const length = spec.length ?? Math.max(1, ...items.map((i) => i.chainage ?? 0));
    const step = length / nBins;
    const getCategory = spec.category;
    const buckets = Array.from({ length: nBins }, () => []);

    for (const it of items) {
      const idx = Math.min(nBins - 1, Math.max(0, Math.floor((it.chainage ?? 0) / step)));
      buckets[idx].push(it);
    }

    return buckets.map((group, i) => ({
      key: `c${i}`,
      label: `${(i * step / 1000).toFixed(1)} km`,
      category: null,
      dominant: getCategory && group.length ? dominantOf(group, getCategory) : null,
      count: group.length,
      raw: measure(group, spec.value, spec.measure),
      items: group,
      chainage: i * step + step / 2,
      // Curve parameter, so placement needs no knowledge of corridors.
      position: (i + 0.5) / nBins,
      interval: [i / nBins, (i + 1) / nBins],
      bearing: null,
      areaKm2: spec.width ? (step / 1000) * (spec.width / 1000) : undefined,
    }));
  }

  /**
   * One bin per areal unit — a necklace map of census geography.
   *
   * This is the mode the interval API was designed for. Each unit carries the arc
   * it actually subtends from the lens centre, so placement may slide a symbol
   * along that arc to avoid its neighbours but can never move it somewhere the
   * unit is not. Angular bins own a wedge by construction; a unit owns whatever
   * arc its geometry occupies (docs/findings.md F-1, F-21).
   */
  function binUnits(items, spec = {}) {
    const label = spec.label ?? ((f) => f.name ?? f.code ?? '');
    const key = spec.key ?? ((f) => f.code ?? f.id ?? f.name);
    const getCategory = spec.category;

    return items.map((it) => ({
      key: String(key(it.feature)),
      label: String(label(it.feature)),
      category: getCategory ? String(getCategory(it.feature)) : null,
      count: 1,
      raw: measure([it], spec.value, spec.measure),
      items: [it],
      weight: it.weight,
      bearing: it.bearing,
      // The unit's true angular extent, when it has one. A unit containing the
      // lens centre subtends everything, so it gets no interval and placement is
      // free to put it anywhere.
      interval: it.interval ?? null,
      meanBearing: it.bearing,
      // Only the part inside the lens counts towards density.
      areaKm2: (it.unitAreaKm2 ?? 0) * (it.weight ?? 1),
    }));
  }

  function binRadial(items, spec = {}) {
    const rings = spec.rings ?? 4;
    const radius = spec.radius ?? Math.max(1, ...items.map((i) => i.distance));
    const step = radius / rings;
    const buckets = Array.from({ length: rings }, () => []);

    for (const it of items) {
      const idx = Math.min(rings - 1, Math.floor(it.distance / step));
      buckets[idx].push(it);
    }

    return buckets.map((group, i) => ({
      key: `r${i}`,
      label: `${Math.round(i * step)}–${Math.round((i + 1) * step)} m`,
      count: group.length,
      raw: measure(group, spec.value, spec.measure),
      items: group,
      ring: i,
      // Ring area, so radial bins can be density-normalised honestly: outer
      // rings cover far more ground than inner ones.
      areaKm2: (Math.PI * ((i + 1) * step) ** 2 - Math.PI * (i * step) ** 2) / 1e6,
      bearing: null,
      interval: null,
    }));
  }

  function binCross(items, spec = {}) {
    const angular = binAngular(items, { ...spec, category: undefined });
    const getCategory = spec.category ?? ((f) => f.category ?? 'all');
    const out = [];
    for (const sector of angular) {
      const groups = new Map();
      for (const it of sector.items) {
        const key = String(getCategory(it.feature));
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(it);
      }
      const keys = spec.categories ?? [...groups.keys()].sort();
      for (const key of keys) {
        const group = groups.get(key) ?? [];
        out.push({
          key: `${sector.key}:${key}`,
          label: `${key} ${sector.label}`,
          category: key,
          count: group.length,
          raw: measure(group, spec.value, spec.measure),
          items: group,
          bearing: sector.bearing,
          interval: sector.interval,
          meanBearing: circularMean(group.map((g) => g.bearing)) ?? sector.bearing,
        });
      }
    }
    return out;
  }

  /**
   * Resultant length of a set of bearings, in [0, 1].
   *
   * 1 means every member points the same way; 0 means they cancel out entirely
   * and the circular mean is arbitrary.
   */
  function circularConcentration(bearings) {
    if (!bearings || bearings.length === 0) return 0;
    let x = 0;
    let y = 0;
    for (const b of bearings) {
      const r = (b * Math.PI) / 180;
      x += Math.cos(r);
      y += Math.sin(r);
    }
    return Math.hypot(x, y) / bearings.length;
  }

  /** Most common category in a group, for reporting rather than encoding. */
  function dominantOf(group, getCategory) {
    const tally = new Map();
    for (const it of group) {
      const key = String(getCategory(it.feature));
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }

  /** Mean of a set of bearings, or null when empty. */
  function circularMean(bearings) {
    if (!bearings || bearings.length === 0) return null;
    let x = 0;
    let y = 0;
    for (const b of bearings) {
      const r = (b * Math.PI) / 180;
      x += Math.cos(r);
      y += Math.sin(r);
    }
    if (x === 0 && y === 0) return null;
    return normaliseBearing((Math.atan2(y, x) * 180) / Math.PI);
  }

  const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

  function compassLabel(bearingDeg) {
    return COMPASS[Math.round(normaliseBearing(bearingDeg) / 22.5) % 16];
  }

  /**
   * Normalisation (`hVarProj`) — and MAUP honesty.
   *
   * A radius slider silently confounds count with area, so this is a pipeline
   * stage rather than a formatting option. `lq` is the one that makes a small
   * lens meaningful: it answers "what is this place unusually full of", which is
   * usually the actual question.
   *
   * Every mode writes `value` (what gets encoded) and leaves `raw` intact, so a
   * tooltip can always show the count behind a normalised bar.
   */

  /**
   * @param {Array} bins  output of `bin()`
   * @param {object} spec
   * @param {'count'|'density'|'share'|'lq'|'z'|'delta'} spec.mode
   * @param {number} [spec.areaKm2]              selection area, for `density`
   * @param {Record<string, number>} [spec.baseline]  reference profile, keyed by bin key
   *                                                  (or by category, for cross bins)
   * @param {'zero'|'one'} [spec.centre]         where the neutral value sits
   */
  function normalise(bins, spec = {}) {
    const mode = spec.mode ?? 'count';
    const total = bins.reduce((s, b) => s + b.raw, 0);

    switch (mode) {
      case 'density': {
        return bins.map((b) => {
          const area = b.areaKm2 ?? spec.areaKm2 ?? 1;
          return { ...b, value: area > 0 ? b.raw / area : 0, unit: 'per km²' };
        });
      }

      case 'share': {
        return bins.map((b) => ({
          ...b,
          value: total > 0 ? b.raw / total : 0,
          unit: 'share',
        }));
      }

      case 'lq': {
        // Location quotient: the bin's share here, over its share in the
        // baseline. 1 means "as expected"; 2 means "twice as concentrated".
        const baseline = spec.baseline ?? {};
        const baseTotal = Object.values(baseline).reduce((s, v) => s + v, 0);
        return bins.map((b) => {
          const key = b.category ?? b.key;
          const localShare = total > 0 ? b.raw / total : 0;
          const baseShare = baseTotal > 0 ? (baseline[key] ?? 0) / baseTotal : 0;
          return {
            ...b,
            value: baseShare > 0 ? localShare / baseShare : localShare > 0 ? Infinity : 0,
            neutral: 1,
            unit: 'LQ',
          };
        });
      }

      case 'z': {
        const values = bins.map((b) => b.raw);
        const mean = values.reduce((s, v) => s + v, 0) / (values.length || 1);
        const sd = Math.sqrt(
          values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length || 1),
        );
        return bins.map((b) => ({
          ...b,
          value: sd > 0 ? (b.raw - mean) / sd : 0,
          neutral: 0,
          unit: 'z',
        }));
      }

      case 'delta': {
        const baseline = spec.baseline ?? {};
        return bins.map((b) => {
          const key = b.category ?? b.key;
          return {
            ...b,
            value: b.raw - (baseline[key] ?? 0),
            neutral: 0,
            unit: 'Δ',
          };
        });
      }

      case 'count':
      default:
        return bins.map((b) => ({ ...b, value: b.raw, unit: 'count' }));
    }
  }

  /** Build a baseline profile from bins, for `lq`/`delta`/`z` against another lens. */
  function profileOf(bins) {
    const out = {};
    for (const b of bins) {
      const key = b.category ?? b.key;
      out[key] = (out[key] ?? 0) + b.raw;
    }
    return out;
  }

  /**
   * Weighted within-bin variance, as a confidence channel.
   *
   * After Kawakami et al. (HexTiles, 2024): a bin whose members disagree should
   * not read as confidently as one whose members agree. Returned in [0, 1], where
   * 1 is most confident.
   */
  function confidence(bins, getValue) {
    if (!getValue) return bins.map((b) => ({ ...b, confidence: b.count > 0 ? 1 : 0 }));
    const spreads = bins.map((b) => {
      if (b.count < 2) return 0;
      const vals = b.items.map((it) => getValue(it.feature) ?? 0);
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      return Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
    });
    const maxSpread = Math.max(...spreads, 0);
    return bins.map((b, i) => ({
      ...b,
      confidence: maxSpread > 0 ? 1 - spreads[i] / maxSpread : b.count > 0 ? 1 : 0,
    }));
  }

  /**
   * Weighted isotonic regression by pool-adjacent-violators (PAV).
   *
   * Finds the non-decreasing sequence `y` minimising `sum(w_i * (y_i - q_i)^2)`.
   * Exact, O(n).
   *
   * This is the workhorse behind necklace placement: after a change of variable
   * that folds each symbol's width into a cumulative offset, "place these symbols
   * near their preferred positions without overlapping, in this order" becomes
   * exactly this problem. See core/necklace.js.
   */

  /**
   * @param {number[]} q  target values
   * @param {number[]} [w] weights (default 1)
   * @returns {number[]} non-decreasing fit, same length as `q`
   */
  function isotonic(q, w) {
    const n = q.length;
    if (n === 0) return [];

    // Each block holds a pooled run: its weighted mean, total weight, and size.
    const mean = new Float64Array(n);
    const weight = new Float64Array(n);
    const size = new Int32Array(n);
    let top = -1;

    for (let i = 0; i < n; i++) {
      top++;
      mean[top] = q[i];
      weight[top] = w ? w[i] : 1;
      size[top] = 1;
      // Pool backwards while the sequence would decrease.
      while (top > 0 && mean[top - 1] > mean[top]) {
        const wSum = weight[top - 1] + weight[top];
        mean[top - 1] =
          wSum === 0
            ? (mean[top - 1] + mean[top]) / 2
            : (mean[top - 1] * weight[top - 1] + mean[top] * weight[top]) / wSum;
        weight[top - 1] = wSum;
        size[top - 1] += size[top];
        top--;
      }
    }

    const out = new Array(n);
    let k = 0;
    for (let b = 0; b <= top; b++) {
      for (let j = 0; j < size[b]; j++) out[k++] = mean[b];
    }
    return out;
  }

  /**
   * Isotonic regression with an additional cap on total span
   * (`y[n-1] - y[0] <= maxSpan`).
   *
   * Solved by alternating projection onto the two convex sets (monotone
   * sequences, and sequences of bounded span). Converges; not a closed form.
   * Only invoked when the necklace is nearly full, which is the case where the
   * packing is close to forced anyway.
   */
  function isotonicBoundedSpan(q, w, maxSpan, iterations = 24) {
    let y = isotonic(q, w);
    const n = y.length;
    if (n < 2) return y;

    for (let it = 0; it < iterations; it++) {
      const span = y[n - 1] - y[0];
      if (span <= maxSpan + 1e-12) break;

      // Compress towards the weighted centroid, then restore monotonicity.
      const scale = maxSpan / span;
      let wSum = 0;
      let centre = 0;
      for (let i = 0; i < n; i++) {
        const wi = w ? w[i] : 1;
        wSum += wi;
        centre += wi * y[i];
      }
      centre = wSum === 0 ? y[0] : centre / wSum;

      const compressed = y.map((v) => centre + (v - centre) * scale);
      y = isotonic(compressed, w);
    }
    return y;
  }

  /**
   * Curves — the anchor that marks are placed on.
   *
   * The placement engine never sees a circle. It sees a `Curve`, parameterised by
   * `t` in [0, 1), and works entirely in that parameter space. That is what lets
   * the same necklace algorithm run on a lens ring, an H3 cell boundary, a
   * coastline or a route corridor without special-casing.
   *
   * See docs/findings.md F-2 (property 3) for why this matters.
   *
   * A Curve is:
   *   { closed, length, pointAt(t) -> [x, y], tangentAt(t) -> [dx, dy] (unit) }
   *
   * Coordinates are screen-space pixels. Lengths are pixels.
   */

  const TAU$2 = Math.PI * 2;

  /** Wrap `t` into [0, 1). */
  const wrap01 = (t) => ((t % 1) + 1) % 1;

  /**
   * Smallest signed difference between two cyclic parameters, in [-0.5, 0.5).
   *
   * Half-open at the top, which is what decides the seam: a point exactly half a
   * turn from an open curve's anchor belongs to its start, not its end.
   */
  function cyclicDelta(a, b) {
    return ((((b - a) % 1) + 1.5) % 1) - 0.5;
  }

  /**
   * A circle centred at (cx, cy). `t = 0` is due north and `t` increases
   * clockwise, so `t` maps directly onto a compass bearing.
   */
  function circleCurve(cx, cy, radius) {
    const length = TAU$2 * radius;
    return {
      kind: 'circle',
      closed: true,
      length,
      cx,
      cy,
      radius,
      /** Canvas angle in radians for parameter `t`. */
      angleAt(t) {
        return wrap01(t) * TAU$2 - Math.PI / 2;
      },
      pointAt(t) {
        const a = this.angleAt(t);
        return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
      },
      tangentAt(t) {
        const a = this.angleAt(t);
        return [-Math.sin(a), Math.cos(a)];
      },
      /** Outward unit normal — the direction a bar grows. */
      normalAt(t) {
        const a = this.angleAt(t);
        return [Math.cos(a), Math.sin(a)];
      },
    };
  }

  /**
   * A polyline through `points`, open or closed. Used for corridor and
   * linear-feature lenses, and for `placement: 'strip'`.
   */
  function polylineCurve(points, { closed = false } = {}) {
    const pts = closed ? [...points, points[0]] : points;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0];
      const dy = pts[i][1] - pts[i - 1][1];
      cum.push(cum[i - 1] + Math.hypot(dx, dy));
    }
    const length = cum[cum.length - 1];

    // Locate the segment containing arc-length `s`, returning [index, local t].
    const locate = (s) => {
      if (length === 0) return [0, 0];
      const clamped = closed ? wrap01(s / length) * length : Math.min(Math.max(s, 0), length);
      let lo = 0;
      let hi = cum.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] <= clamped) lo = mid;
        else hi = mid;
      }
      const segLen = cum[lo + 1] - cum[lo];
      return [lo, segLen === 0 ? 0 : (clamped - cum[lo]) / segLen];
    };

    return {
      kind: 'polyline',
      closed,
      length,
      points: pts,
      pointAt(t) {
        const [i, u] = locate((closed ? wrap01(t) : Math.min(Math.max(t, 0), 1)) * length);
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[i + 1] ?? pts[i];
        return [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u];
      },
      tangentAt(t) {
        const [i] = locate((closed ? wrap01(t) : Math.min(Math.max(t, 0), 1)) * length);
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[i + 1] ?? pts[i];
        const d = Math.hypot(x1 - x0, y1 - y0) || 1;
        return [(x1 - x0) / d, (y1 - y0) / d];
      },
      /** Left-hand normal, which is outward for a clockwise-wound closed curve. */
      normalAt(t) {
        const [tx, ty] = this.tangentAt(t);
        return [ty, -tx];
      },
    };
  }

  /**
   * A circular arc of *fixed arc length*, from a closed ring to a straight line.
   *
   * `unroll = 0` is the ring; `unroll = 1` is a straight horizontal baseline of
   * the same length; anything between is the arc you get by bending that line
   * back up. Curvature is `kappa = 1 - unroll`, so the arc's own radius is
   * `radius / kappa` and it always subtends `2*pi*kappa`.
   *
   * Holding *length* constant rather than radius is the whole trick. Placement
   * works in the cyclic parameter `t` and reserves half-widths as a fraction of
   * the curve, so if the curve keeps its length the solved layout stays valid at
   * every value of `unroll` — the unroll is a change of anchor, not a re-solve.
   * Nothing upstream of the renderer sees it. See docs/findings.md F-27.
   *
   * `at` is the parameter held fixed: that point does not move as the curve
   * opens, and the seam therefore falls at `at + 0.5`. The default holds north
   * at the top of the ring, so an unrolled lens reads as a bearing profile
   * centred on north, running west (left) through north to east (right), with
   * marks growing upwards from the baseline.
   *
   * The arc also rotates about its anchor as it opens, by exactly enough to land
   * flat. Without that, the baseline's direction would be whatever the ring's
   * tangent happened to be at the anchor — vertical for an anchor due east — and
   * moving the seam would tip the chart over. Since the rotation is proportional
   * to `unroll` it is zero for the closed ring, so the family still starts at
   * `circleCurve` exactly, and every anchor ends at the same horizontal baseline
   * with marks growing up. That is what makes `at: 'auto'` safe to use.
   *
   * Points are computed from the anchor by chord and turn rather than from the
   * arc's centre, which is what keeps it well-conditioned as the centre runs off
   * to infinity: at `unroll = 1` the arc centre is not a finite point at all.
   */
  function arcCurve(cx, cy, radius, { unroll = 0, at = 0 } = {}) {
    const u = Math.min(1, Math.max(0, unroll));
    if (u <= 0) return circleCurve(cx, cy, radius);

    const kappa = 1 - u;
    const length = TAU$2 * radius;
    const anchor = wrap01(at);
    // Canvas angle of the anchor on the original ring, and the anchor point
    // itself — the one point shared by every curve in the family.
    const a0 = anchor * TAU$2 - Math.PI / 2;
    const ax = cx + radius * Math.cos(a0);
    const ay = cy + radius * Math.sin(a0);
    const R = kappa > 0 ? radius / kappa : Infinity;
    // Spin the arc about its anchor as it opens, so that it lands horizontal
    // whichever parameter is held fixed. Zero at `unroll = 0` by construction.
    const base = a0 - u * (a0 + Math.PI / 2);
    const angleAt = (t) => base + cyclicDelta(anchor, t) * TAU$2 * kappa;

    return {
      kind: 'arc',
      closed: false,
      length,
      unroll: u,
      curvature: kappa,
      anchor,
      /** Centre of the arc's own circle — not the lens centre, and infinite at `unroll = 1`. */
      cx: ax - R * Math.cos(base),
      cy: ay - R * Math.sin(base),
      radius: R,
      angleAt,
      pointAt(t) {
        const d = cyclicDelta(anchor, t);
        const half = d * Math.PI * kappa; // half the turn from the anchor
        // Chord from the anchor: 2R sin(half), written so that R never appears.
        const chord = d * length * sinc(half);
        const dir = base + half;
        return [ax - chord * Math.sin(dir), ay + chord * Math.cos(dir)];
      },
      tangentAt(t) {
        const a = angleAt(t);
        return [-Math.sin(a), Math.cos(a)];
      },
      normalAt(t) {
        const a = angleAt(t);
        return [Math.cos(a), Math.sin(a)];
      },
    };
  }

  const sinc = (x) => (Math.abs(x) < 1e-8 ? 1 : Math.sin(x) / x);

  /**
   * The open-curve counterpart of `arcCurve`: straighten a polyline towards a
   * horizontal line of the same length.
   *
   * `unroll = 0` leaves the route where it is on the map; `unroll = 1` lays it
   * out flat, each vertex at its own chainage. The result is a *linear
   * cartogram*: chainage and offset are preserved exactly and position is not,
   * which is the trade a route profile makes and the reason the true path is
   * worth drawing behind it (docs/findings.md F-28).
   *
   * `at` is the fraction of length held fixed, so the route opens about its own
   * midpoint by default rather than sliding off one end.
   */
  function straightenPath(points, unroll, { at = 0.5 } = {}) {
    const u = Math.min(1, Math.max(0, unroll));
    if (u <= 0 || !points || points.length < 2) return points;

    const cum = [0];
    for (let i = 1; i < points.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    }
    const total = cum[cum.length - 1];
    if (!(total > 0)) return points;

    const [ax, ay] = polylineCurve(points).pointAt(at);
    const s0 = Math.min(Math.max(at, 0), 1) * total;

    return points.map((p, i) => [
      p[0] + (ax + (cum[i] - s0) - p[0]) * u,
      p[1] + (ay - p[1]) * u,
    ]);
  }

  /**
   * Necklace placement.
   *
   * Places symbols on a curve, as close as possible to a preferred position,
   * without overlapping, optionally confined to a feasible interval.
   *
   * After Speckmann & Verbeek, "Necklace Maps" (IEEE TVCG 16(6), 2010) and
   * "Algorithms for Necklace Maps" (IJCGA 25(1), 2015). The reference
   * implementation is the C++ one in CartoCrow; this is, as far as we can find,
   * the first JavaScript implementation. See docs/references.md.
   *
   * ## What it solves
   *
   * Given items with preferred positions `p_i` on a cyclic parameter in [0, 1)
   * and half-widths `w_i` (also in parameter units), find positions `x_i`
   * minimising `sum(v_i * (x_i - p_i)^2)` subject to non-overlap.
   *
   * ## How
   *
   * For a *fixed* cyclic order the problem is convex. Substituting
   * `y_i = x_i - c_i`, where `c_i` is the cumulative minimum spacing up to `i`,
   * turns the non-overlap constraints into a monotonicity constraint, so the
   * optimum is a weighted isotonic regression (exact, O(n)). The wrap-around
   * constraint becomes a cap on total span.
   *
   * The cyclic order that matters is the order by preferred position — any
   * crossing solution can be uncrossed without increasing cost — so we only need
   * to choose where to cut the circle. We try all n cuts and keep the cheapest:
   * O(n^2), which is nothing for the bin counts a lens uses (typically <= 72).
   *
   * ## Feasible intervals
   *
   * `interval: [lo, hi]` confines an item to an arc. For point data the interval
   * is the whole circle and only `position` matters; for an area it is the
   * angular projection of the geometry seen from the lens centre, which is
   * Speckmann & Verbeek's original primitive. Interval handling is by projection
   * onto the box between isotonic passes — approximate, unlike the unconstrained
   * case. Recorded in docs/findings.md F-1.
   */


  /**
   * @typedef {object} NecklaceItem
   * @property {string|number} id
   * @property {number} position   preferred position, cyclic parameter in [0,1)
   * @property {number} halfWidth  half the space the symbol needs, in parameter units
   * @property {number} [weight]   resistance to being moved (default 1)
   * @property {[number, number]} [interval] feasible arc [lo, hi], cyclic
   */

  /**
   * @param {NecklaceItem[]} items
   * @param {object} [options]
   * @param {boolean} [options.cyclic=true]
   * @param {number} [options.intervalPasses=8] projection passes for feasible intervals
   * @returns {{
   *   placements: Array<{ id, position, preferred, displacement, halfWidth, clamped }>,
   *   fill: number,        fraction of the curve consumed by symbols
   *   overflow: boolean,   true if the symbols cannot fit at all
   *   cost: number
   * }}
   */
  function placeNecklace(items, options = {}) {
    const { cyclic = true, intervalPasses = 8 } = options;
    const n = items.length;
    if (n === 0) return { placements: [], fill: 0, overflow: false, cost: 0 };

    const totalWidth = items.reduce((s, it) => s + 2 * it.halfWidth, 0);
    const fill = totalWidth;

    if (n === 1) {
      const it = items[0];
      return {
        placements: [
          {
            id: it.id,
            position: wrap01(it.position),
            preferred: wrap01(it.position),
            displacement: 0,
            halfWidth: it.halfWidth,
            clamped: false,
          },
        ],
        fill,
        overflow: totalWidth > 1,
        cost: 0,
      };
    }

    // Sorted cyclic order. Non-crossing is optimal, so this order is fixed and
    // only the cut varies.
    const order = items
      .map((it, i) => ({ it, i, p: wrap01(it.position) }))
      .sort((a, b) => a.p - b.p);

    const overflow = cyclic && totalWidth > 1;
    // If they genuinely cannot fit, shrink uniformly so the solve stays defined.
    // The caller is told via `overflow` and can re-scale properly.
    const shrink = overflow ? 1 / totalWidth : 1;

    let best = null;

    for (let cut = 0; cut < (cyclic ? n : 1); cut++) {
      const seq = [];
      for (let k = 0; k < n; k++) {
        const e = order[(cut + k) % n];
        seq.push({ ...e, w: e.it.halfWidth * shrink, v: e.it.weight ?? 1 });
      }

      // Unwrap preferred positions so they increase from the cut.
      const p = new Array(n);
      p[0] = seq[0].p;
      for (let k = 1; k < n; k++) {
        p[k] = p[k - 1] + (cyclic ? wrap01(seq[k].p - seq[k - 1].p) : seq[k].p - seq[k - 1].p);
      }

      // Cumulative minimum spacing: c[k] - c[k-1] = w[k-1] + w[k].
      const c = new Array(n);
      c[0] = 0;
      for (let k = 1; k < n; k++) c[k] = c[k - 1] + seq[k - 1].w + seq[k].w;

      const q = p.map((pi, k) => pi - c[k]);
      const v = seq.map((s) => s.v);

      // Wrap-around leaves this much slack for the chain to spread into.
      const maxSpan = cyclic ? 1 - seq[0].w - seq[n - 1].w - c[n - 1] : Infinity;

      let y =
        cyclic && Number.isFinite(maxSpan)
          ? isotonicBoundedSpan(q, v, Math.max(maxSpan, 0))
          : isotonic(q, v);

      let x = y.map((yi, k) => yi + c[k]);

      // Feasible intervals, by projection. Clamp then restore ordering; repeat.
      const hasIntervals = seq.some((s) => s.it.interval);
      if (hasIntervals) {
        for (let pass = 0; pass < intervalPasses; pass++) {
          let moved = false;
          for (let k = 0; k < n; k++) {
            const iv = seq[k].it.interval;
            if (!iv) continue;
            // Bring the interval into the same unwrapped frame as x[k].
            const base = Math.floor(x[k]);
            const lo = base + wrap01(iv[0] - (p[k] - wrap01(p[k])));
            const hi = lo + wrap01(iv[1] - iv[0]);
            const clampedX = Math.min(Math.max(x[k], lo + seq[k].w), hi - seq[k].w);
            if (Math.abs(clampedX - x[k]) > 1e-9) {
              x[k] = clampedX;
              moved = true;
            }
          }
          if (!moved) break;
          y = isotonic(
            x.map((xi, k) => xi - c[k]),
            v,
          );
          x = y.map((yi, k) => yi + c[k]);
        }
      }

      let cost = 0;
      for (let k = 0; k < n; k++) {
        const d = cyclicDelta(wrap01(x[k]), seq[k].p);
        cost += seq[k].v * d * d;
      }

      if (!best || cost < best.cost) best = { cost, seq, x };
    }

    const placements = new Array(n);
    best.seq.forEach((s, k) => {
      const pos = wrap01(best.x[k]);
      placements[s.i] = {
        id: s.it.id,
        position: pos,
        preferred: s.p,
        displacement: cyclicDelta(s.p, pos),
        halfWidth: s.it.halfWidth,
        clamped: Boolean(s.it.interval),
      };
    });

    return { placements, fill, overflow, cost: best.cost };
  }

  /**
   * Largest uniform symbol scale that still fits on the curve.
   *
   * `widthOf(item, scale)` returns a half-width in parameter units. Binary search
   * rather than a closed form so that any mark geometry works (disc area, bar
   * width, stacked rings) without the caller inverting anything.
   */
  function fitNecklaceScale(items, widthOf, options = {}) {
    const { targetFill = 0.92, maxScale = 64, tolerance = 1e-4 } = options;
    const total = (scale) => items.reduce((s, it) => s + 2 * widthOf(it, scale), 0);

    if (total(maxScale) <= targetFill) return maxScale;

    let lo = 0;
    let hi = maxScale;
    while (hi - lo > tolerance) {
      const mid = (lo + hi) / 2;
      if (total(mid) <= targetFill) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  /**
   * Convenience: place items whose preferred position is a compass bearing.
   * Bearings map onto the cyclic parameter directly, because `circleCurve` puts
   * `t = 0` at north and runs clockwise.
   */
  function placeByBearing(items, options = {}) {
    return placeNecklace(
      items.map((it) => ({ ...it, position: ((it.bearing % 360) + 360) % 360 / 360 })),
      options,
    );
  }

  /**
   * Within-unit structure — how a bin's members are distributed *inside* it.
   *
   * A bin's aggregate hides whether its members are spread evenly across the unit
   * or piled in one corner, and that difference is what makes the aggregate
   * fragile to how the unit was drawn. This module computes the second, parallel
   * summary that the design space calls the MAUP channel
   * (docs/design-space.md §4).
   *
   * The lineage is hexagonal: Honeycomb Plots (Trautner et al. 2022) fit a
   * regression plane to the point density inside each hexagon and cut a pyramid
   * along it — the *diamond cut* — so the glyph leans towards the steepest
   * descent. HexTiles (Kawakami et al. 2024) derive a per-tile confidence from
   * within-tile variance and argue it as MAUP mitigation.
   *
   * A lens gets this more cheaply than a hexagon can, and the reason is
   * structural: a hexagon has no privileged origin, so Honeycomb must fit an
   * arbitrary plane. A lens is already a polar coordinate system centred on a
   * point the user chose, so its internal distribution decomposes without any
   * fitting into **bearing** (which way) and **distance** (how far). The diamond
   * cut's direction-and-steepness is, here, just the circular mean and resultant
   * length. See docs/findings.md F-10.
   */

  const DEG = 180 / Math.PI;

  /**
   * Circular summary of a set of bearings.
   *
   * `R` is the resultant length in [0, 1]: 1 when every member points the same
   * way, 0 when they cancel and `mean` is arbitrary. It is the lens's equivalent
   * of the diamond cut's steepness.
   *
   * @returns {{ mean: number|null, R: number, sd: number, n: number }}
   *   `mean` in degrees, `sd` the circular standard deviation in degrees.
   */
  function circularStats(bearings) {
    const n = bearings.length;
    if (n === 0) return { mean: null, R: 0, sd: 180, n: 0 };

    let x = 0;
    let y = 0;
    for (const b of bearings) {
      const r = b / DEG;
      x += Math.cos(r);
      y += Math.sin(r);
    }
    // Clamp: identical bearings can give a resultant a float ulp above n, and
    // R > 1 would make log(R) positive and the standard deviation NaN.
    const R = Math.min(1, Math.hypot(x, y) / n);
    const mean = R < 1e-12 ? null : ((Math.atan2(y, x) * DEG) % 360 + 360) % 360;

    // Circular standard deviation, sqrt(-2 ln R). Diverges as R -> 0, so cap at a
    // half-turn: beyond that "spread" means "all directions" and the number stops
    // carrying information. Math.max drops the -0 that sqrt(-0) returns at R = 1.
    const sd = R < 1e-6 ? 180 : Math.max(0, Math.min(180, Math.sqrt(-2 * Math.log(R)) * DEG));

    return { mean, R, sd, n };
  }

  /**
   * Radial summary: where members sit between the centre and the edge.
   *
   * `meanNormalised` is 0.667 for a uniform disc (the mean of r over area), so
   * values below that mean the members are pulled inwards and above it that they
   * hug the rim.
   */
  function radialStats(distances, radius) {
    const n = distances.length;
    if (n === 0) {
      return { mean: 0, meanNormalised: 0, sd: 0, cv: 0, edgeShare: 0, n: 0 };
    }
    const mean = distances.reduce((s, d) => s + d, 0) / n;
    const variance = distances.reduce((s, d) => s + (d - mean) ** 2, 0) / n;
    const sd = Math.sqrt(variance);
    const outer = radius * 0.9;
    return {
      mean,
      meanNormalised: radius > 0 ? mean / radius : 0,
      sd,
      cv: mean > 0 ? sd / mean : 0,
      edgeShare: distances.filter((d) => d >= outer).length / n,
      n,
    };
  }

  /**
   * Lateral summary for a corridor: which side of the route the members lie on.
   *
   * This is the corridor's counterpart to `circularStats`, and it has no
   * equivalent on a disc. A stretch of route whose provision sits entirely on one
   * bank is a real finding that a count erases completely — see
   * docs/findings.md F-15.
   *
   * `bias` is the mean offset as a fraction of the half-width, in [-1, 1]:
   * negative is right of travel, positive is left. `sidedness` is the mean of the
   * signs, in [0, 1]: 1 means every member is on the same side, 0 means they are
   * evenly split. The two differ — members can be balanced in count but not in
   * distance, or vice versa.
   */
  function lateralStats(offsets, halfWidth) {
    const n = offsets.length;
    if (n === 0) {
      return { mean: 0, sd: 0, bias: 0, sidedness: 0, n: 0 };
    }
    const mean = offsets.reduce((s, o) => s + o, 0) / n;
    const sd = Math.sqrt(offsets.reduce((s, o) => s + (o - mean) ** 2, 0) / n);
    const signSum = offsets.reduce((s, o) => s + Math.sign(o), 0);
    return {
      mean,
      sd,
      bias: halfWidth > 0 ? Math.max(-1, Math.min(1, mean / halfWidth)) : 0,
      sidedness: Math.abs(signSum) / n,
      n,
    };
  }

  /**
   * Elasticity of the count with respect to the lens radius.
   *
   *   E = (dV/V) / (dr/r)
   *
   * How much the aggregate moves per proportional change in radius — i.e. how
   * much the reading depends on a radius the analyst picked arbitrarily. Because
   * every member's distance is already known, this needs no resampling.
   *
   * `dV/dr` is estimated from the count in the outermost band of width
   * `edgeBand * radius`, so
   *
   *   E ~ n_edge / (edgeBand * n_total)
   *
   * Reference values, for `edgeBand = 0.1`:
   *   E ~ 2   uniform density; the count is mostly tracking area
   *   E ~ 0   everything is already well inside; widening adds nothing
   *   E >> 2  a cluster sits just beyond the rim and the reading is about to jump
   *
   * See docs/findings.md F-11.
   */
  function elasticity(distances, radius, edgeBand = 0.1) {
    const n = distances.length;
    if (n === 0 || radius <= 0) return 0;
    const inner = radius * (1 - edgeBand);
    const edge = distances.filter((d) => d >= inner && d <= radius).length;
    return edge / (edgeBand * n);
  }

  /**
   * Elasticity sampled across a range of radii.
   *
   * The point of this is that it does not depend on the radius currently set: it
   * describes the whole distance distribution around a centre, so it can be
   * computed once per centre and drawn *on the radius control itself*. The
   * analyst then sees where the cliffs are before moving the slider, rather than
   * discovering them by moving it. See docs/findings.md F-17.
   *
   * Distances are sorted once and swept by binary search, so this costs
   * O(n log n + samples log n) rather than O(n x samples).
   *
   * Samples below `minCount` members are flagged `reliable: false`. The estimator
   * is a ratio of counts and is meaningless at small n — see F-17.
   *
   * @returns {Array<{ r, count, share, elasticity }>} ascending by radius
   */
  function elasticityProfile(distances, options = {}) {
    const {
      maxRadius, minRadius = 0, samples = 96, edgeBand = 0.1, minCount = 30,
    } = options;
    const sorted = [...distances].sort((a, b) => a - b);
    const total = sorted.length;
    const top = maxRadius ?? sorted[total - 1] ?? 0;
    // No data means no profile, rather than a flat line of zeroes a caller might
    // draw as if it said something.
    if (total === 0 || !(top > minRadius) || samples < 2) return [];

    /** Members within radius r. */
    const countWithin = (r) => {
      let lo = 0;
      let hi = total;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (sorted[mid] <= r) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };

    const out = [];
    for (let i = 0; i < samples; i++) {
      const r = minRadius + ((top - minRadius) * i) / (samples - 1);
      const count = countWithin(r);
      const inner = countWithin(r * (1 - edgeBand));
      out.push({
        r,
        count,
        share: total > 0 ? count / total : 0,
        // The same estimator as `elasticity`, so a point on this curve agrees
        // with the live readout at that radius.
        elasticity: count > 0 ? (count - inner) / (edgeBand * count) : 0,
        // The estimator is a ratio of counts, so it is wild when counts are
        // small: a single member inside the edge band of a lens holding one
        // member reports E = 10 regardless of the geography. Callers should not
        // draw or read unreliable samples as cliffs. See docs/findings.md F-17.
        reliable: count >= minCount,
      });
    }
    return out;
  }

  /**
   * Angular histogram of a set of bearings, normalised to a peak of 1.
   *
   * Bearings are binned in **absolute** terms, so petal 0 is always due north.
   * Orienting each rose to its own mean would make individual glyphs tidier and
   * make comparison between them meaningless, which is the opposite of the point.
   *
   * @returns {number[]} `nBins` values in [0, 1], starting at north, clockwise
   */
  function angularHistogram(bearings, nBins = 12) {
    const counts = new Array(nBins).fill(0);
    if (bearings.length === 0) return counts;
    const width = 360 / nBins;
    for (const b of bearings) {
      const idx = Math.min(nBins - 1, Math.floor((((b % 360) + 360) % 360) / width));
      counts[idx] += 1;
    }
    const peak = Math.max(...counts);
    return peak > 0 ? counts.map((c) => c / peak) : counts;
  }

  /** Radial histogram, normalised to a peak of 1. Inner ring first. */
  function radialHistogram(distances, radius, nBins = 5) {
    const counts = new Array(nBins).fill(0);
    if (distances.length === 0 || radius <= 0) return counts;
    const step = radius / nBins;
    for (const d of distances) {
      counts[Math.min(nBins - 1, Math.floor(d / step))] += 1;
    }
    const peak = Math.max(...counts);
    return peak > 0 ? counts.map((c) => c / peak) : counts;
  }

  /**
   * Full within-unit description of one bin.
   *
   * @param {Array<{bearing:number, distance:number}>} items  annotated by `select`
   * @param {object} options
   * @param {number} options.radius        selection radius, metres
   * @param {number} [options.edgeBand]    band width for the elasticity estimate
   * @param {(f:any)=>number} [options.value]  optional measure, for variance
   * @param {number} [options.roseBins]        petals for the angular histogram
   * @param {number} [options.ringBins]        bands for the radial histogram
   * @param {number} [options.halfWidth]       corridor half-width, for lateral stats
   */
  function describeDistribution(items, options = {}) {
    const {
      radius, edgeBand = 0.1, value, roseBins = 12, ringBins = 5, halfWidth,
    } = options;
    const circular = circularStats(items.map((it) => it.bearing));
    const radial = radialStats(items.map((it) => it.distance), radius);
    const E = elasticity(items.map((it) => it.distance), radius, edgeBand);

    // Dispersion of the measure itself, when there is one — the HexTiles
    // within-unit variance. Normalised by the mean so it is comparable across
    // bins of different magnitude.
    let dispersion = 0;
    if (value && items.length > 1) {
      const vals = items.map((it) => value(it.feature) ?? 0);
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
      dispersion = mean !== 0 ? Math.abs(sd / mean) : 0;
    }

    // Corridors annotate members with a signed offset; discs do not. Computing
    // this only when the data supports it keeps `lateral` a reliable signal of
    // "this bin sits on an open curve".
    const offsets = items.map((it) => it.offset).filter(Number.isFinite);
    const lateral = offsets.length ? lateralStats(offsets, halfWidth ?? 0) : null;

    return {
      circular,
      radial,
      lateral,
      elasticity: E,
      dispersion,
      // The diamond-cut pair: which way the members lie, and how strongly.
      gradient: { bearing: circular.mean, strength: circular.R },
      // The full internal distribution, for the `profile` encoding. A mean and a
      // spread are summaries of this; when a bin is diffuse enough that both
      // mislead, this is what remains honest. See docs/findings.md Q-3.
      rose: angularHistogram(items.map((it) => it.bearing), roseBins),
      rings: radialHistogram(items.map((it) => it.distance), radius, ringBins),
    };
  }

  /**
   * Annotate bins with their within-unit structure.
   *
   * A separate stage rather than part of binning, because it is a parallel output
   * — the aggregate and the distribution are two different readings of the same
   * members, and the pipeline should say so.
   */
  function describeBins(bins, options) {
    return bins.map((b) => {
      const structure = describeDistribution(b.items ?? [], options);
      return {
        ...b,
        structure,
        // Promoted for the placement and rendering stages, which need them often.
        concentration: structure.circular.R,
        spread: structure.circular.sd,
      };
    });
  }

  /**
   * The pipeline.
   *
   *   selection -> binning -> normalisation -> placement -> marks
   *
   * `computeLens` runs all five and returns a plain geometry object. It draws
   * nothing, touches no DOM and knows about no map. That separation is what makes
   * the two headline interactions possible: two layouts computed with different
   * configs can simply be interpolated (`lerpLayout`), which is how both the
   * categorical <-> angular morph and, later, the focus <-> tessellation morph
   * work. See docs/findings.md F-2.
   *
   * Sizes are in pixels; the caller supplies the ring radius. Positions are
   * emitted as curve parameters `t` in [0, 1), so the same layout can be drawn on
   * a circle, a coastline or a route.
   */


  const TAU$1 = Math.PI * 2;

  /**
   * @param {object} config
   * @param {[number, number]} config.center            [lng, lat]
   * @param {object} config.selection                   `{ type, radius, ... }` (center is filled in)
   * @param {any[]} config.data
   * @param {object} [config.binning]                   `{ mode, bins, rings, category, value }`
   * @param {object} [config.normalisation]             `{ mode, baseline }`
   * @param {object} [config.placement]                 `{ mode, morph, gap, groupGap }`
   * @param {object} [config.marks]                     `{ type, maxLength, barWidth, minWidth }`
   * @param {object} [config.association]               `{ mode, threshold }` — how a mark
   *   is tied back to what it summarises. Carried through untouched: association
   *   is drawn, not solved.
   * @param {object} config.ring                        `{ radius }` in pixels
   * @param {(f:any)=>[number,number]} [config.getPosition]
   * @returns {object} layout
   */
  function computeLens(config) {
    const {
      center,
      data = [],
      ring,
      getPosition,
      binning: binSpec = { mode: 'categorical' },
      normalisation: normSpec = { mode: 'count' },
      placement: placeSpec = { mode: 'necklace' },
      marks: markSpec = { type: 'bar' },
    } = config;

    const selection = { ...config.selection, center };
    const ringRadius = ring?.radius ?? 140;
    const circumference = TAU$1 * ringRadius;

    // 1. selection
    //
    // Areal members need their own selector: they can be partly inside, they
    // carry a weight, and they subtend an arc rather than a bearing. Everything
    // downstream sees the same annotated items either way.
    const sel = config.areal
      ? arealSelect(data, selection, { ...config.areal, getAnchor: config.areal.getAnchor })
      : select(data, selection, { getPosition });
    const { items } = sel;
    if (sel.length != null) selection.length = sel.length;
    // A polygon has no centre until its centroid is computed, and everything
    // downstream measures bearing and distance from one. Adopt what the selector
    // resolved so the layout, the structure stage and the renderer all agree.
    const anchor = center ?? sel.center ?? null;
    if (sel.center && !selection.center) selection.center = sel.center;
    // For areal data the meaningful denominator is the land actually covered by
    // the selected units, not the lens disc — much of a disc over a coastline or
    // a park is not in any unit at all.
    const areaKm2 = config.areal ? (sel.area ?? 0) : selectionArea(selection);

    // 2. binning
    let bins = bin(items, {
      ...binSpec,
      radius: selection.radius,
      length: selection.length ?? sel.length,
      width: selection.width,
      // After the spread, not before: an absent `binSpec.mode` would otherwise
      // overwrite this with undefined. An areal lens defaults to one bin per
      // unit, which is the reading census geography supports and the one the
      // interval API exists for.
      mode: config.areal ? (binSpec.mode ?? 'unit') : binSpec.mode,
    });

    // 2b. within-unit structure — the parallel summary of how each bin's members
    // are distributed inside it, rather than only how many there are.
    // docs/design-space.md §4.
    // A polygon's "radius" for radial statistics is the distance to its furthest
    // member: the one scale on which "how far out" means anything for a shape
    // that has no radius of its own.
    const nominalRadius = selection.radius
      ?? Math.max(1, ...items.map((i) => i.distance));

    bins = describeBins(bins, {
      radius: nominalRadius,
      value: binSpec.value,
      edgeBand: config.structure?.edgeBand,
      roseBins: config.structure?.roseBins,
      ringBins: config.structure?.ringBins,
      halfWidth: selection.width != null ? selection.width / 2 : undefined,
    });

    // 3. normalisation
    let baseline = normSpec.baseline;
    if (!baseline && (normSpec.mode === 'lq' || normSpec.mode === 'delta')) {
      // Default baseline is the exterior: inside-vs-rest, the "exterior effect
      // scope" of the lens design space. See docs/design-space.md 3.7.
      // A polygon has no radius to scale a context from, so fall back to a
      // radius that encloses roughly four times its area.
      const nominalRadius = selection.radius
        ?? Math.sqrt((areaKm2 * 1e6) / Math.PI) * 2;
      const outer = selectComplement(data, { ...selection, center: anchor }, {
        getPosition,
        contextRadius: normSpec.contextRadius ?? nominalRadius * 4,
      });
      baseline = profileOf(bin(outer.items, { ...binSpec, radius: selection.radius }));
    }
    bins = normalise(bins, { ...normSpec, areaKm2, baseline });
    bins = confidence(bins, binSpec.value);

    // 4 + 5. placement and mark sizing (coupled: a mark's size determines how
    // much room it needs on the curve, which is what placement solves for).
    // A corridor has no centre, so its curve is open: marks run from one end of
    // the route to the other rather than wrapping. This is the only thing the
    // pipeline needs to know about the difference.
    const closed = placeSpec.closed ?? selection.type !== 'corridor';
    const laid = layoutMarks(bins, {
      placement: placeSpec,
      marks: markSpec,
      ringRadius,
      circumference: closed ? circumference : (placeSpec.curveLength ?? circumference),
      closed,
    });

    const total = bins.reduce((s, b) => s + b.raw, 0);
    // Lens-level structure: the whole selection treated as one unit. This is the
    // diamond-cut reading for the lens itself, and the MAUP elasticity of the
    // reading as a whole.
    const lensStructure = describeBins(
      [{ key: '__lens__', items, raw: total }],
      {
        radius: nominalRadius,
        value: binSpec.value,
        edgeBand: config.structure?.edgeBand,
        roseBins: config.structure?.roseBins,
        ringBins: config.structure?.ringBins,
        halfWidth: selection.width != null ? selection.width / 2 : undefined,
      },
    )[0].structure;

    return {
      center: anchor,
      selection,
      ring: { radius: ringRadius },
      binning: binSpec,
      normalisation: { ...normSpec, mode: normSpec.mode ?? 'count' },
      marks: markSpec,
      // The association stage computes nothing — a leader is drawn from
      // quantities the binning and placement stages already produced. It rides
      // on the layout so the renderer needs no second channel for it.
      association: config.association,
      bins: laid.bins,
      scale: laid.scale,
      closed,
      structure: lensStructure,
      stats: {
        total,
        count: items.length,
        areaKm2,
        elasticity: lensStructure.elasticity,
        concentration: lensStructure.circular.R,
        fill: laid.fill,
        overflow: laid.overflow,
        maxDisplacement: laid.bins.reduce(
          (m, b) => Math.max(m, Math.abs(b.displacement ?? 0)),
          0,
        ),
      },
    };
  }

  function layoutMarks(bins, { placement, marks, ringRadius, circumference, closed = true }) {
    const mode = placement.mode ?? 'necklace';
    const markType = marks.type ?? 'bar';
    const maxLength = marks.maxLength ?? ringRadius * 0.55;
    const values = bins.map((b) => (Number.isFinite(b.value) ? b.value : 0));
    const neutral = bins[0]?.neutral ?? 0;
    const extent = Math.max(
      1e-9,
      ...values.map((v) => Math.abs(v - neutral)),
    );

    // Mark size in pixels.
    //
    // `sizeBy` resolves a real tension for glyphs that nest two readings. A rose
    // carries the aggregate in its size and the distribution in its petals, so
    // sizing by value makes the distribution unreadable for exactly the small
    // categories whose direction is most in doubt. Roses therefore default to
    // equal size, with the aggregate left to the label; discs and bars default to
    // value. See docs/findings.md F-13.
    const sizeBy = marks.sizeBy ?? (markType === 'rose' ? 'equal' : 'value');
    const sizeOf = (b) => {
      if (sizeBy === 'equal') {
        return b.count > 0 ? (marks.maxRadius ?? maxLength / 2) : 0;
      }
      const v = Number.isFinite(b.value) ? b.value : 0;
      if (markType === 'disc' || markType === 'rose') {
        // Area proportional to value, as in a classic necklace map. A rose is
        // sized the same way: the glyph's extent carries the aggregate, its
        // petals carry the internal distribution.
        return Math.sqrt(Math.abs(v - neutral) / extent) * (marks.maxRadius ?? maxLength / 2);
      }
      return (Math.abs(v - neutral) / extent) * maxLength;
    };

    // Half-width along the curve, in parameter units.
    const barWidth = marks.barWidth ?? 14;
    // A labelled mark needs room for its label, not just its bar — otherwise
    // placement resolves the bars and leaves the text overlapping. Text is
    // measured by character count because the core has no canvas; that is an
    // approximation, deliberately generous.
    // Off by default: reserving label room for 32 cross-bins whose labels are
    // never drawn overflows the ring for no reason. Turn it on when each mark
    // really does get a label.
    const labelWidth = (b) =>
      !marks.reserveLabels || !b.label
        ? 0
        : String(b.label).length * (marks.labelCharWidth ?? 6.2);
    const radialGlyph = markType === 'disc' || markType === 'rose';
    const halfWidthOf = (b, scale = 1, curveLen = circumference) => {
      const px = radialGlyph
        ? Math.max(sizeOf(b) * scale, labelWidth(b) / 2)
        : Math.max(barWidth * scale, labelWidth(b)) / 2;
      return Math.max(px, marks.minWidth ?? 1) / curveLen;
    };

    let placements;
    let fill = 0;
    let overflow = false;

    // Block layout: equal angular slots, VisQuill-style. Also the fallback target
    // for the morph, and the only sensible layout when bins carry no bearing.
    const blockPositions = bins.map((_, i) => (i + 0.5) / bins.length);

    // Categorical bins have no `bearing` of their own but do carry the mean
    // bearing of their members, which is exactly what the necklace needs. Without
    // this, the categorical -> angular morph has nothing to move towards and
    // silently does nothing.
    // A bin may state its curve parameter directly (chainage bins do) or imply it
    // from a bearing (angular and categorical bins do). Either way placement sees
    // the same thing: a preferred position in [0, 1) and an optional interval.
    const hasPosition = bins.some((b) => b.position != null);
    const hasBearings = bins.some((b) => b.bearing != null || b.meanBearing != null);
    const anchored = hasPosition || hasBearings;
    const wantNecklace = (mode === 'necklace' || mode === 'morph') && anchored;
    const wantStacked = mode === 'stacked' && anchored;

    const preferredOf = (b) =>
      b.position != null ? b.position : wrap01((b.meanBearing ?? b.bearing ?? 0) / 360);
    const intervalOf = (b) => {
      if (!b.interval) return undefined;
      // Chainage bins already speak in curve parameter; angular bins in degrees.
      return b.position != null
        ? [b.interval[0], b.interval[1]]
        : [wrap01(b.interval[0] / 360), wrap01(b.interval[1] / 360)];
    };

    // Concentric necklaces, one track per variable — the multivariate extension
    // the necklace-map follow-up literature anticipates. Each track is solved
    // independently, and an outer track genuinely has more room, so half-widths
    // are computed against that track's own circumference rather than the base
    // ring's. See docs/findings.md F-16.
    const ringOffsets = new Array(bins.length).fill(0);

    if (wantStacked) {
      const key = placement.by ?? 'category';
      const tracks = [];
      for (const b of bins) {
        const g = b[key] ?? '_';
        if (!tracks.includes(g)) tracks.push(g);
      }
      const gap = placement.ringGap ?? 20;
      placements = new Array(bins.length);

      tracks.forEach((track, gi) => {
        const offset = gi * gap;
        const trackLen = closed ? TAU$1 * (ringRadius + offset) : circumference;
        const idx = [];
        bins.forEach((b, i) => {
          if ((b[key] ?? '_') === track) idx.push(i);
        });

        const result = placeNecklace(
          idx.map((i) => ({
            id: i,
            position: preferredOf(bins[i]),
            halfWidth: halfWidthOf(bins[i], 1, trackLen),
            weight: Math.max(bins[i].raw, 1e-6),
            interval: intervalOf(bins[i]),
          })),
          { cyclic: closed },
        );

        result.placements.forEach((pl) => {
          placements[pl.id] = pl;
          ringOffsets[pl.id] = offset;
        });
        fill = Math.max(fill, result.fill);
        overflow = overflow || result.overflow;
      });
    } else if (wantNecklace) {
      let scale = 1;
      if (radialGlyph) {
        // Capped at 1: `marks.maxRadius` is the caller's statement of how big the
        // largest glyph should be, so fitting may only shrink glyphs to make them
        // fit the curve — never inflate them to fill it. Without the cap, a lens
        // with few bins blows each glyph up until the ring is full, and placement
        // then has to fling them far off their true bearings to cope.
        scale = fitNecklaceScale(bins, (b, s) => halfWidthOf(b, s), {
          targetFill: placement.targetFill ?? 0.9,
          maxScale: 1,
        });
      }
      const result = placeNecklace(
        bins.map((b, i) => ({
          id: i,
          // Prefer the bin's actual mean bearing where we have one: a bin's
          // members are rarely spread evenly across its wedge.
          position: preferredOf(b),
          halfWidth: halfWidthOf(b, scale),
          weight: Math.max(b.raw, 1e-6),
          interval: intervalOf(b),
        })),
        { cyclic: closed },
      );
      placements = result.placements;
      fill = result.fill;
      overflow = result.overflow;
      if (radialGlyph) marks = { ...marks, _scale: scale };
    } else {
      placements = bins.map((b, i) => ({
        id: i,
        position: blockPositions[i],
        preferred: blockPositions[i],
        displacement: 0,
        halfWidth: halfWidthOf(b),
        clamped: false,
      }));
      fill = placements.reduce((s, p) => s + 2 * p.halfWidth, 0);
    }

    // Morph blends block and necklace positions. `u = 0` is the sorted legend,
    // `u = 1` is the compass rose.
    const u = mode === 'morph' ? clamp01(placement.morph ?? 0) : mode === 'necklace' ? 1 : 0;

    const out = bins.map((b, i) => {
      const p = placements[i];
      const t =
        mode === 'morph' && anchored
          ? wrap01(lerpCyclic(blockPositions[i], p.position, u))
          : p.position;
      const scale = radialGlyph ? (marks._scale ?? 1) : 1;
      // When a mark sits at a mean bearing rather than in a fixed wedge, its
      // position is only as trustworthy as that mean is concentrated.
      const directional = wantNecklace && b.interval == null && b.concentration != null;
      return {
        ...b,
        confidence: directional
          ? Math.min(b.confidence ?? 1, b.concentration)
          : b.confidence,
        t,
        angle: t * TAU$1 - Math.PI / 2, // canvas radians
        preferredT: p.preferred,
        ringOffset: ringOffsets[i],
        displacement: (p.displacement ?? 0) * 360, // degrees, for Q-2
        size: sizeOf(b) * scale,
        halfWidth: p.halfWidth,
        // Two different widths, deliberately. `halfWidthPx` is the footprint
        // placement reserved, which includes room for a label; `markHalfWidthPx`
        // is how wide the mark itself should be drawn. Conflating them makes a
        // bar as wide as its own label, which is very obvious with long names
        // and easy to miss with short ones (docs/findings.md F-22).
        halfWidthPx: p.halfWidth * circumference,
        markHalfWidthPx: radialGlyph
          ? sizeOf(b) * scale
          : Math.max(barWidth * (marks._scale ?? 1), marks.minWidth ?? 1) / 2,
        signed: (Number.isFinite(b.value) ? b.value : 0) - neutral,
      };
    });

    return { bins: out, scale: { extent, neutral, maxLength }, fill, overflow };
  }

  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  /** Interpolate two cyclic parameters the short way round. */
  function lerpCyclic(a, b, u) {
    const d = ((((b - a) % 1) + 1.5) % 1) - 0.5;
    return a + d * u;
  }

  /**
   * Interpolate two layouts computed from the same bins.
   *
   * Used for animated transitions between configurations — the categorical <->
   * angular morph, normalisation changes, and later the focus <-> tessellation
   * transition. Bins are matched by `key`; anything unmatched is dropped.
   */
  function lerpLayout(a, b, u) {
    const byKey = new Map(b.bins.map((x) => [x.key, x]));
    const bins = a.bins
      .filter((x) => byKey.has(x.key))
      .map((x) => {
        const y = byKey.get(x.key);
        const t = wrap01(lerpCyclic(x.t, y.t, u));
        return {
          ...y,
          t,
          angle: t * TAU$1 - Math.PI / 2,
          size: x.size + (y.size - x.size) * u,
          halfWidthPx: x.halfWidthPx + (y.halfWidthPx - x.halfWidthPx) * u,
          value: x.value + (y.value - x.value) * u,
        };
      });
    return { ...b, bins };
  }

  /**
   * Fields of lenses — the continuum from focus to glyphmap.
   *
   * docs/design-space.md §5 argues that a lens and a gridded glyphmap are the
   * same object at different `hSpSubset` settings: one lens is focus+context,
   * a handful are small multiples, and a lattice of them *is* a glyphmap. This
   * module is that claim made executable. The knob is **spacing** — as it
   * shrinks, the count rises and each lens shrinks with it, which is a smooth and
   * meaningful path rather than an animation between unrelated states.
   *
   * Nothing here is new machinery. `computeField` calls `computeLens` once per
   * centre, which is only possible because the core never assumed a single lens
   * (docs/findings.md F-2, property 1). What this module adds is the two things
   * a field needs and a single lens does not: somewhere to put the centres, and
   * a way to avoid rescanning the whole dataset for each one.
   */


  /** Metres per degree of longitude and latitude at a given latitude. */
  function scaleAt(lat) {
    return [
      (Math.PI / 180) * EARTH_RADIUS$1 * Math.cos(toRad$1(lat)),
      (Math.PI / 180) * EARTH_RADIUS$1,
    ];
  }

  /**
   * A hexagonal lattice of centres covering a radius around a point.
   *
   * Hexagonal rather than square because it is what the gridded-glyphmap work
   * uses, and because every cell has six equidistant neighbours instead of a mix
   * of four near and four far — which matters once these are read as a surface.
   *
   * @param {object} options
   * @param {[number, number]} options.center  [lng, lat]
   * @param {number} options.radius            metres to cover from the centre
   * @param {number} options.spacing           metres between adjacent centres
   * @returns {Array<[number, number]>} centres, ordered top-left to bottom-right
   */
  function hexLattice({ center, radius, spacing }) {
    if (!(spacing > 0) || !(radius > 0)) return [center];
    const [kx, ky] = scaleAt(center[1]);
    const rowHeight = spacing * (Math.sqrt(3) / 2);
    const rows = Math.ceil(radius / rowHeight);
    const cols = Math.ceil(radius / spacing);

    const out = [];
    for (let r = -rows; r <= rows; r++) {
      const y = r * rowHeight;
      // Odd rows shift by half a spacing: that offset is what makes it hexagonal
      // rather than a rectangular grid with a different aspect ratio.
      const shift = (r & 1) === 0 ? 0 : spacing / 2;
      for (let c = -cols; c <= cols; c++) {
        const x = c * spacing + shift;
        if (Math.hypot(x, y) > radius) continue;
        out.push([center[0] + x / kx, center[1] + y / ky]);
      }
    }
    return out;
  }

  /**
   * A uniform grid hash over the data, in a local metric frame.
   *
   * Without this, a field of `m` lenses over `n` features costs O(n·m) — 400
   * lenses over 1,449 places is half a million distance tests per frame, and a
   * real dataset is far worse. Bucketing once and querying a neighbourhood makes
   * it O(n + m·k) for small k.
   */
  function spatialIndex(features, { getPosition, origin, cellSize }) {
    const [kx, ky] = scaleAt(origin[1]);
    const cells = new Map();
    const key = (ix, iy) => `${ix},${iy}`;

    for (const feature of features) {
      const pos = getPosition(feature);
      if (!pos || !Number.isFinite(pos[0]) || !Number.isFinite(pos[1])) continue;
      const x = (pos[0] - origin[0]) * kx;
      const y = (pos[1] - origin[1]) * ky;
      const k = key(Math.floor(x / cellSize), Math.floor(y / cellSize));
      const bucket = cells.get(k);
      if (bucket) bucket.push(feature);
      else cells.set(k, [feature]);
    }

    return {
      cellSize,
      /** Features within `radius` metres of `point`, plus some slop. */
      near(point, radius) {
        const x = (point[0] - origin[0]) * kx;
        const y = (point[1] - origin[1]) * ky;
        const ix = Math.floor(x / cellSize);
        const iy = Math.floor(y / cellSize);
        // Reach as far as the radius demands: one ring of cells is only enough
        // while the lens is no wider than a cell.
        const reach = Math.max(1, Math.ceil(radius / cellSize));
        const out = [];
        for (let dx = -reach; dx <= reach; dx++) {
          for (let dy = -reach; dy <= reach; dy++) {
            const bucket = cells.get(key(ix + dx, iy + dy));
            if (bucket) out.push(...bucket);
          }
        }
        return out;
      },
    };
  }

  /**
   * Compute a lens at every centre.
   *
   * @param {object} config  everything `computeLens` takes, plus:
   * @param {Array<[number, number]>} config.centres
   * @param {number} [config.minCount=1]  skip lenses holding fewer members than this
   * @returns {{ lenses: object[], stats: object }}
   */
  function computeField(config) {
    const {
      centres = [],
      data = [],
      getPosition = (f) => [f.lng ?? f.lon, f.lat],
      selection = { type: 'disc', radius: 400 },
      normalisation = { mode: 'count' },
      minCount = 1,
    } = config;

    if (centres.length === 0) return { lenses: [], stats: emptyStats() };

    const radius = selection.radius ?? 400;
    const index = spatialIndex(data, {
      getPosition,
      origin: centres[0],
      cellSize: Math.max(radius, 1),
    });

    // A field needs ONE baseline, not one per lens. Letting each lens derive its
    // own from its own surroundings would make every cell "average" by
    // construction and the map would say nothing. See docs/findings.md F-19.
    const spec = { ...normalisation };
    if ((spec.mode === 'lq' || spec.mode === 'delta') && !spec.baseline) {
      spec.baseline = fieldBaseline(data, config);
    }

    const lenses = [];
    let members = 0;
    let skipped = 0;

    for (const centre of centres) {
      const candidates = index.near(centre, radius);
      if (candidates.length < minCount) {
        skipped++;
        continue;
      }
      const layout = computeLens({
        ...config,
        center: centre,
        selection: { ...selection, center: centre },
        data: candidates,
        normalisation: spec,
      });
      if (layout.stats.count < minCount) {
        skipped++;
        continue;
      }
      members += layout.stats.count;
      lenses.push(layout);
    }

    return {
      lenses,
      baseline: spec.baseline,
      stats: {
        centres: centres.length,
        drawn: lenses.length,
        skipped,
        members,
        spacing: config.spacing ?? null,
        radius,
      },
    };
  }

  /**
   * The shared reference profile for a field: every feature, binned the same way
   * the lenses are. Computed once.
   */
  function fieldBaseline(data, config) {
    const { getPosition = (f) => [f.lng ?? f.lon, f.lat], binning = {} } = config;
    const items = data
      .map((feature) => {
        const pos = getPosition(feature);
        return pos ? { feature, position: pos, distance: 0, bearing: 0 } : null;
      })
      .filter(Boolean);
    return profileOf(bin(items, { ...binning, radius: 1 }));
  }

  function emptyStats() {
    return { centres: 0, drawn: 0, skipped: 0, members: 0, spacing: null, radius: 0 };
  }

  /**
   * Spacing that yields roughly `count` lenses over a circle of `radius`.
   *
   * The continuum control is more legible as "how many" than "how far apart", but
   * spacing is what the lattice actually takes, so this inverts it: a hexagonal
   * lattice packs about `1.103 · area / spacing²` centres into a given area.
   */
  function spacingForCount(count, radius) {
    if (!(count > 0) || !(radius > 0)) return radius;
    const area = Math.PI * radius * radius;
    return Math.sqrt((1.103 * area) / count);
  }

  /** Ratio of lens radius to lattice spacing at which discs just touch. */
  const TOUCHING = 0.5;

  /**
   * Style tokens and presets.
   *
   * Defaults encode the things that make a lens read well, recorded in
   * docs/findings.md F-4: a stable ring, quiet chrome, a desaturated exterior so
   * the lens reads as an aperture rather than an overlay.
   */

  /** Okabe–Ito, colour-vision-deficiency safe. */
  const CATEGORICAL = [
    '#0072B2', '#E69F00', '#009E73', '#CC79A7',
    '#56B4E9', '#D55E00', '#F0E442', '#7A7A7A',
  ];

  /** Diverging, for `lq` / `z` / `delta` where a neutral value exists. */
  const DIVERGING = { low: '#B2452E', mid: '#E8E4DC', high: '#2C6E8F' };

  const DEFAULT_STYLE = {
    // Frame
    ringRadius: 150,
    ringStroke: 'rgba(20,20,25,0.85)',
    ringWidth: 1.25,
    trackOpacity: 0.22,   // guide rings for stacked (concentric) placement
    boundaryStroke: 'rgba(20,20,25,0.45)',
    boundaryDash: [3, 4],
    corridorFill: 'rgba(20,20,25,0.07)',
    centreDot: 3,
    // The route as it really runs, drawn behind a straightened one, and the
    // handles that shape it.
    ghostOpacity: 0.5,
    ghostBandOpacity: 0.5,   // the true corridor's width behind a straightened one
    nodeRadius: 4,
    nodeFill: 'rgba(255,255,255,0.9)',

    // Exterior
    dimExterior: true,
    dimColor: 'rgba(248,247,244,0.62)',

    // Marks
    barWidth: 13,
    barRadius: 2,
    markOpacity: 0.92,
    strokeMarks: false,
    // Which way a mark grows: 'normal' (the curve's outward normal), 'up'
    // (screen vertical, one shared baseline direction) or 'upright' (vertical,
    // but never growing back into the lens). See docs/design-space.md §3.5.
    orient: 'normal',

    // Compass — only drawn when the angular axis is geographic, because that is
    // the only time it is telling the truth.
    compass: true,
    compassColor: 'rgba(20,20,25,0.35)',
    tickLength: 5,

    // Type
    font: '500 11px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
    labelColor: 'rgba(20,20,25,0.72)',
    valueFont: '600 10px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
    valueColor: 'rgba(20,20,25,0.85)',
    showValues: 'auto', // true | false | 'auto' (label only the bars that carry the reading)
    valueFloor: 0.35,   // 'auto' threshold, as a fraction of the largest mark
    showLabels: true,
    // Distance beyond the mark's tip for each. The label must clear the value,
    // not merely the mark, or the two overlap (docs/findings.md F-25).
    valueGap: 10,
    labelGap: 24,
    maxLabels: 12,      // beyond this many marks, drop per-mark labels
    lod: true,          // shed chrome as the ring shrinks (see resolveLod)
    lodFull: 60,        // px: full chrome at or above this ring radius
    lodCompact: 26,     // px: marks + ring only below this
    stripLabelOffset: 12, // label inset on the far side of an open curve, px

    // Within-unit structure (docs/design-space.md §4).
    // 'none' | 'spread' | 'gradient' | 'inclusions' | 'both'
    structure: 'none',
    // Which frame the within-unit layer is drawn in once an anchor has been
    // straightened: 'unit' keeps the members inside the unit they belong to,
    // wherever it has been moved to; 'geographic' leaves them on the true path.
    // Identical until something is unrolled. See docs/findings.md F-32.
    structureFrame: 'unit',
    inclusionOpacity: 0.8,
    inclusionSize: 1.6,
    maxInclusions: 2000,
    minRoseRadius: 9,
    petalGap: 0.86,
    spreadColor: null,      // null = the mark's own colour
    spreadWidth: 2.5,
    spreadOpacity: 0.5,
    spreadOffset: 6,        // inset from the ring, px
    spreadStep: 5,          // extra inset per bin, so co-located arcs don't collide
    gradientColor: null,
    gradientOpacity: 0.55,

    // Displacement indicator — see docs/findings.md Q-2. A tick back to the true
    // bearing whenever placement has moved a mark more than this many degrees.
    // Under the default association mode a leader replaces it, and this is the
    // threshold that decides when one is drawn.
    displacementThreshold: 6,
    displacementColor: 'rgba(20,20,25,0.3)',

    // Association (docs/design-space.md §3.6). `mode`: 'auto' draws a leader
    // wherever adjacency has broken down — a displaced mark, or an anchor that
    // has been opened — and fades them in with the unroll; 'leader' always;
    // 'hover' only for the mark under the pointer; 'adjacency' never, leaving
    // the displacement tick.
    association: { mode: 'auto' },
    leaders: true,          // level of detail shuts them off; see resolveLod
    leaderColor: null,      // null = the mark's own colour
    leaderOpacity: 0.5,
    leaderWidth: 1,
    leaderDot: 2,           // marker at the target end, px
    leaderMinLength: 7,     // below this the leader says nothing adjacency didn't

    palette: CATEGORICAL,
    markColor: null, // single hue for bins with no category (bearing / distance)
    diverging: DIVERGING,
  };

  const PRESETS = {
    /** Light, paper-like. The default. */
    paper: {},
    /** For dark basemaps. */
    night: {
      ringStroke: 'rgba(240,240,245,0.8)',
      nodeFill: 'rgba(20,22,28,0.9)',
      boundaryStroke: 'rgba(240,240,245,0.4)',
      dimColor: 'rgba(12,14,20,0.6)',
      labelColor: 'rgba(240,240,245,0.75)',
      valueColor: 'rgba(240,240,245,0.9)',
      compassColor: 'rgba(240,240,245,0.35)',
      displacementColor: 'rgba(240,240,245,0.3)',
    },
    /** Emphasises within-unit distribution over the aggregate. */
    structure: {
      structure: 'both',
      markOpacity: 0.75,
      showValues: false,
    },
    /** Everything on: aggregate, spread, gradient and the raw members. */
    forensic: {
      structure: 'both',
      inclusionOpacity: 0.7,
      markOpacity: 0.8,
      showValues: false,
      strokeMarks: true,
    },
    /** Chrome-free, for figures and export. */
    minimal: {
      dimExterior: false,
      showValues: false,
      compass: false,
      boundaryStroke: 'rgba(20,20,25,0.25)',
    },
  };

  /**
   * Level of detail from the size a lens is actually being drawn at.
   *
   * docs/findings.md F-2 deferred this as "what the tessellated case will
   * actually need", and it does: at 400 lenses each ring is a dozen pixels, and
   * chrome that reads well at 150px — compass, labels, values, spread arcs, the
   * centre dot — becomes a grey smear that hides the marks it surrounds.
   *
   * The thresholds are deliberately coarse. Chrome either fits or it does not,
   * and interpolating it produces a band of sizes where everything is present and
   * nothing is legible.
   *
   * The size that matters is **how far the drawing reaches**, not the ring's
   * radius, and unrolling the anchor separates the two: a closed ring wraps its
   * whole length into a footprint of 2r, while the same length laid flat spans
   * 2*pi*r. So the radius is scaled towards its own half-length as the anchor
   * opens — an identity at `unroll = 0`, and the reason a small lens stops
   * shedding chrome once it has been opened into a strip that has room for it
   * (docs/findings.md F-30).
   */
  function resolveLod(ringRadius, style, unroll = 0) {
    if (style.lod === false) return null;
    const r = (ringRadius ?? style.ringRadius) * (1 + Math.min(1, Math.max(0, unroll)) * (Math.PI - 1));
    if (r >= (style.lodFull ?? 60)) return null;              // full chrome
    if (r >= (style.lodCompact ?? 26)) {
      return {
        showLabels: false, showValues: false, compass: false, centreDot: 1.5, leaders: false,
      };
    }
    // Marks only. At this size the field is read as a surface, not as
    // individual charts, and everything else is noise.
    return {
      showLabels: false,
      showValues: false,
      compass: false,
      leaders: false,
      structure: 'none',
      centreDot: 0,
      ringWidth: 0.6,
      boundaryStroke: 'transparent',
      dimExterior: false,
    };
  }

  function resolveStyle(style = {}) {
    const preset = typeof style.preset === 'string' ? PRESETS[style.preset] ?? {} : {};
    return { ...DEFAULT_STYLE, ...preset, ...style };
  }

  /**
   * Colour for a bin. Categorical bins get a stable palette slot; bins with a
   * neutral value (LQ, z, delta) get a diverging ramp around it.
   */
  function colorFor(bin, layout, style) {
    if (bin.color) return bin.color;

    const neutral = layout.scale?.neutral;
    const isDiverging = neutral != null && layout.normalisation?.mode !== 'count'
      && layout.normalisation?.mode !== 'density'
      && layout.normalisation?.mode !== 'share';

    if (isDiverging) {
      const extent = layout.scale.extent || 1;
      const u = Math.max(-1, Math.min(1, (bin.signed ?? 0) / extent));
      return mix(style.diverging.mid, u >= 0 ? style.diverging.high : style.diverging.low, Math.abs(u));
    }

    // No category means no category colour. Bearing and distance bins are all
    // the same quantity measured in different places, so they share one hue —
    // giving each its own would invent a categorical dimension that isn't there.
    if (bin.category == null) return style.markColor ?? style.palette[0];

    const keys = layout._categoryOrder ?? (layout._categoryOrder = categoryOrder(layout));
    const idx = keys.indexOf(bin.category);
    return style.palette[(idx < 0 ? 0 : idx) % style.palette.length];
  }

  function categoryOrder(layout) {
    const seen = [];
    for (const b of layout.bins) {
      if (b.category != null && !seen.includes(b.category)) seen.push(b.category);
    }
    return seen;
  }

  function mix(a, b, u) {
    const pa = parseHex(a);
    const pb = parseHex(b);
    const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * u));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  function parseHex(hex) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  }

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


  const TAU = Math.PI * 2;

  class LensRenderer {
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
  function markAxes(curve, t, orient = 'normal') {
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
  function leaderAnchors(layout, bin, curve, frame, orient = 'normal') {
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
  function leaderGap(bin) {
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
  function arcBasis(curve, maxRadius = 4000) {
    const r = curve.radius;
    if (!curve.angleAt || !Number.isFinite(r) || r > maxRadius) return null;
    return { cx: curve.cx, cy: curve.cy, radius: r };
  }

  /** Points along a curve, offset along its normal, at roughly `step` pixels. */
  function sampleCurve(curve, t0 = 0, t1 = 1, step = 3, offset = 0) {
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
  function drawArcText(ctx, text, cx, cy, radius, angle, { font, color } = {}) {
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

  /**
   * Routes — turning a line somebody already has into a corridor path.
   *
   * A corridor lens is defined by a polyline, and the interesting polylines
   * already exist: a river, a railway, a bus route, a coastline, a planned cycle
   * lane, the boundary of a district. All of them arrive as GeoJSON, so the
   * library's job is to accept the shapes people actually have rather than to
   * demand an array of pairs.
   *
   * Simplification is not cosmetic here. Every member is projected onto every
   * segment of the path to get its chainage and offset, so the selection stage is
   * O(features x vertices): a 4000-vertex river against 5000 places is twenty
   * million projections per drag frame, and the lens stops being interactive
   * long before it stops being correct. Douglas-Peucker to a node budget makes
   * the cost predictable, and at corridor widths of hundreds of metres a tolerance
   * of a few tens of metres is invisible. See docs/findings.md F-29.
   */

  const EARTH_RADIUS = 6371008.8;
  const toRad = (d) => (d * Math.PI) / 180;

  /**
   * Local equirectangular metres, good enough for simplification: the tolerance
   * is a threshold on a distance, not a measurement to report.
   */
  function projector(path) {
    const lat0 = path.reduce((s, p) => s + p[1], 0) / path.length;
    const kx = (Math.PI / 180) * EARTH_RADIUS * Math.cos(toRad(lat0));
    const ky = (Math.PI / 180) * EARTH_RADIUS;
    return ([lng, lat]) => [lng * kx, lat * ky];
  }

  /** Perpendicular distance from `p` to the segment `a`-`b`, in projected units. */
  function segmentDistance(p, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    const u = Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    return Math.hypot(p[0] - (a[0] + dx * u), p[1] - (a[1] + dy * u));
  }

  /**
   * Douglas-Peucker, iterative so a long route cannot blow the stack.
   *
   * @param {Array<[number, number]>} path  [lng, lat] vertices
   * @param {number} tolerance              metres; vertices closer than this to
   *                                        the line they sit on are dropped
   */
  function simplifyPath(path, tolerance = 25) {
    if (!path || path.length <= 2 || !(tolerance > 0)) return path ?? [];
    const xy = projector(path);
    const pts = path.map(xy);
    const keep = new Uint8Array(path.length);
    keep[0] = 1;
    keep[path.length - 1] = 1;

    const stack = [[0, path.length - 1]];
    while (stack.length) {
      const [lo, hi] = stack.pop();
      let worst = 0;
      let index = -1;
      for (let i = lo + 1; i < hi; i++) {
        const d = segmentDistance(pts[i], pts[lo], pts[hi]);
        if (d > worst) {
          worst = d;
          index = i;
        }
      }
      if (index >= 0 && worst > tolerance) {
        keep[index] = 1;
        stack.push([lo, index], [index, hi]);
      }
    }

    return path.filter((_, i) => keep[i]);
  }

  /**
   * Simplify until the path fits a node budget.
   *
   * The budget is the thing a caller can reason about — "keep it interactive" —
   * whereas a tolerance in metres depends on how long the route is and how
   * wiggly. Doubling from a fine tolerance converges in a handful of passes and
   * never over-simplifies a route that was already short.
   */
  function fitNodeBudget(path, maxNodes = 200, { start = 5 } = {}) {
    if (!path || path.length <= maxNodes) return path ?? [];
    let tolerance = start;
    let out = simplifyPath(path, tolerance);
    while (out.length > maxNodes && tolerance < 1e6) {
      tolerance *= 2;
      out = simplifyPath(path, tolerance);
    }
    return out;
  }

  /** Every LineString-like coordinate array inside a GeoJSON value. */
  function collectLines(node, out = []) {
    if (!node || typeof node !== 'object') return out;

    if (Array.isArray(node.features)) {
      for (const f of node.features) collectLines(f, out);
      return out;
    }
    if (node.type === 'Feature') return collectLines(node.geometry, out);
    if (node.type === 'GeometryCollection') {
      for (const g of node.geometries ?? []) collectLines(g, out);
      return out;
    }

    const c = node.coordinates;
    if (!Array.isArray(c)) return out;
    switch (node.type) {
      case 'LineString':
        out.push(c);
        break;
      case 'MultiLineString':
        for (const part of c) out.push(part);
        break;
      // A polygon's rings are perfectly good routes: a corridor along an admin
      // boundary or a ring road is exactly the "linear feature" case, and asking
      // the user to convert it first would be pedantry.
      case 'Polygon':
        for (const ring of c) out.push(ring);
        break;
      case 'MultiPolygon':
        for (const poly of c) for (const ring of poly) out.push(ring);
        break;
    }
    return out;
  }

  const planarLength = (line) => {
    const xy = projector(line);
    let total = 0;
    for (let i = 1; i < line.length; i++) {
      const a = xy(line[i - 1]);
      const b = xy(line[i]);
      total += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    return total;
  };

  /**
   * A corridor path from whatever GeoJSON the user has.
   *
   * Accepts a FeatureCollection, Feature, geometry, or a bare coordinate array.
   * Multi-part geometries are common in real route data — a river split at every
   * confluence, a bus route as one feature per direction — and joining the parts
   * would invent segments that do not exist, so the **longest** part is taken and
   * the rest reported rather than silently merged.
   *
   * @returns {{ path: Array<[number, number]>, parts: number, dropped: number,
   *             nodes: number, sourceNodes: number }}
   */
  function pathFromGeoJSON(input, { maxNodes = 200 } = {}) {
    const doc = typeof input === 'string' ? JSON.parse(input) : input;
    const lines = Array.isArray(doc) && Array.isArray(doc[0])
      ? [doc]
      : collectLines(doc);

    const usable = lines
      .map((line) => line.filter(
        (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]),
      ))
      .filter((line) => line.length >= 2)
      .map((line) => line.map(([lng, lat]) => [lng, lat]));

    if (usable.length === 0) {
      throw new Error('No LineString, MultiLineString or Polygon ring found in that GeoJSON.');
    }

    usable.sort((a, b) => planarLength(b) - planarLength(a));
    const longest = usable[0];
    const path = fitNodeBudget(longest, maxNodes);

    return {
      path,
      parts: usable.length,
      dropped: usable.length - 1,
      nodes: path.length,
      sourceNodes: longest.length,
    };
  }

  /** Insert a vertex into a path, returning a new array. */
  function insertNode(path, index, coord) {
    const next = [...path];
    next.splice(Math.min(Math.max(index, 0), path.length), 0, coord);
    return next;
  }

  /** Remove a vertex, refusing to leave fewer than two. */
  function removeNode(path, index) {
    if (path.length <= 2) return path;
    return path.filter((_, i) => i !== index);
  }

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


  class LensOverlay {
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
  function addLens(map, options) {
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
  class FieldOverlay {
    constructor(map, options = {}) {
      this.map = map;
      this.options = {
        count: 60,
        coverRadius: 4000,
        packing: TOUCHING,
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
      const spacing = spacingForCount(o.count, o.coverRadius);
      const radius = spacing * o.packing;

      const centres = hexLattice({ center: centre, radius: o.coverRadius, spacing });

      // The ring is sized so a lens and its marks stay inside the cell it
      // represents. Without this the glyphs of neighbouring cells overlap and the
      // field stops reading as a surface.
      const mpp = this._metresPerPixel();
      const ringRadius = Math.max(4, (radius / mpp) * (o.ringFraction ?? 0.55));

      this.field = computeField({
        centres,
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

    state() {
      return {
        stats: this.field.stats,
        ringRadius: this._ringRadius,
        count: this.options.count,
      };
    }

    repaint() {
      if (!this._css) return;
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this._css.w, this._css.h);

      const ring = this._ringRadius;
      const pad = ring * 3;
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
        });
      }
    }
  }

  /** Convenience wrapper. */
  function addField(map, options) {
    return new FieldOverlay(map, options);
  }

  exports.CATEGORICAL = CATEGORICAL;
  exports.DEFAULT_STYLE = DEFAULT_STYLE;
  exports.DIVERGING = DIVERGING;
  exports.FieldOverlay = FieldOverlay;
  exports.LensOverlay = LensOverlay;
  exports.LensRenderer = LensRenderer;
  exports.PRESETS = PRESETS;
  exports.TOUCHING = TOUCHING;
  exports.UNIT_COUNT = UNIT_COUNT;
  exports.addField = addField;
  exports.addLens = addLens;
  exports.aggregate = aggregate;
  exports.angularHistogram = angularHistogram;
  exports.arcBasis = arcBasis;
  exports.arcCurve = arcCurve;
  exports.areaFractionInside = areaFractionInside;
  exports.arealSelect = arealSelect;
  exports.bin = bin;
  exports.binAngular = binAngular;
  exports.binCategorical = binCategorical;
  exports.binCross = binCross;
  exports.binRadial = binRadial;
  exports.binUnits = binUnits;
  exports.circleCurve = circleCurve;
  exports.circularMean = circularMean;
  exports.circularStats = circularStats;
  exports.colorFor = colorFor;
  exports.compassLabel = compassLabel;
  exports.computeField = computeField;
  exports.computeLens = computeLens;
  exports.confidence = confidence;
  exports.contains = contains;
  exports.cyclicDelta = cyclicDelta;
  exports.describeBins = describeBins;
  exports.describeDistribution = describeDistribution;
  exports.drawArcText = drawArcText;
  exports.elasticity = elasticity;
  exports.elasticityProfile = elasticityProfile;
  exports.fieldBaseline = fieldBaseline;
  exports.fitNecklaceScale = fitNecklaceScale;
  exports.fitNodeBudget = fitNodeBudget;
  exports.geo = geo;
  exports.hexLattice = hexLattice;
  exports.insertNode = insertNode;
  exports.isotonic = isotonic;
  exports.isotonicBoundedSpan = isotonicBoundedSpan;
  exports.lateralStats = lateralStats;
  exports.lerpCyclic = lerpCyclic;
  exports.lerpLayout = lerpLayout;
  exports.markAxes = markAxes;
  exports.normalise = normalise;
  exports.normaliseRings = normaliseRings;
  exports.pathFromGeoJSON = pathFromGeoJSON;
  exports.placeByBearing = placeByBearing;
  exports.placeNecklace = placeNecklace;
  exports.polylineCurve = polylineCurve;
  exports.profileOf = profileOf;
  exports.radialHistogram = radialHistogram;
  exports.radialStats = radialStats;
  exports.removeNode = removeNode;
  exports.resolveStyle = resolveStyle;
  exports.sampleCurve = sampleCurve;
  exports.select = select;
  exports.selectComplement = selectComplement;
  exports.selectCorridor = selectCorridor;
  exports.selectPolygon = selectPolygon;
  exports.selectionArea = selectionArea;
  exports.simplifyPath = simplifyPath;
  exports.spacingForCount = spacingForCount;
  exports.spatialIndex = spatialIndex;
  exports.straightenPath = straightenPath;
  exports.wrap01 = wrap01;

  return exports;

})({});

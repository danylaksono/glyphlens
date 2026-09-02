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

import {
  distance as geoDistance,
  bearing as geoBearing,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  angularExtent,
} from './geo.js';
import { contains, normaliseRings } from './selection.js';

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
export function areaFractionInside(rings, selection, { samples = 24 } = {}) {
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
      const d = geoDistance(centre, [x, y]);
      const b = geoBearing(centre, [x, y]);
      if (contains(selection, d, b)) inBoth++;
    }
  }

  // A unit far smaller than the sample spacing can catch no samples at all.
  // Falling back to its centroid is better than reporting zero for a real unit.
  if (inPolygon === 0) {
    const c = polygonCentroid(rings);
    return contains(selection, geoDistance(centre, c), geoBearing(centre, c)) ? 1 : 0;
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
export function arealSelect(features, selection, options = {}) {
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
    const d = geoDistance(centre, anchor);
    const b = geoBearing(centre, anchor);

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
export function aggregate(items, measure) {
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
export const UNIT_COUNT = { value: () => 1, kind: 'extensive' };

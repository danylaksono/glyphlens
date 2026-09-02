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
export function circularStats(bearings) {
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
export function radialStats(distances, radius) {
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
export function lateralStats(offsets, halfWidth) {
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
export function elasticity(distances, radius, edgeBand = 0.1) {
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
export function elasticityProfile(distances, options = {}) {
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
export function angularHistogram(bearings, nBins = 12) {
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
export function radialHistogram(distances, radius, nBins = 5) {
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
export function describeDistribution(items, options = {}) {
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
export function describeBins(bins, options) {
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

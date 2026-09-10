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

import { select, selectComplement, selectionArea } from './selection.js';
import { arealSelect } from './areal.js';
import { bin } from './binning.js';
import { normalise, confidence, profileOf } from './normalise.js';
import { placeNecklace, fitNecklaceScale } from './necklace.js';
import { describeBins } from './distribution.js';
import { wrap01 } from './curve.js';

const TAU = Math.PI * 2;

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
export function computeLens(config) {
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
  const circumference = TAU * ringRadius;

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
      const trackLen = closed ? TAU * (ringRadius + offset) : circumference;
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
      angle: t * TAU - Math.PI / 2, // canvas radians
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
export function lerpCyclic(a, b, u) {
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
export function lerpLayout(a, b, u) {
  const byKey = new Map(b.bins.map((x) => [x.key, x]));
  const bins = a.bins
    .filter((x) => byKey.has(x.key))
    .map((x) => {
      const y = byKey.get(x.key);
      const t = wrap01(lerpCyclic(x.t, y.t, u));
      return {
        ...y,
        t,
        angle: t * TAU - Math.PI / 2,
        size: x.size + (y.size - x.size) * u,
        halfWidthPx: x.halfWidthPx + (y.halfWidthPx - x.halfWidthPx) * u,
        value: x.value + (y.value - x.value) * u,
      };
    });
  return { ...b, bins };
}

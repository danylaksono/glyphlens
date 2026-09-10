/**
 * Style tokens and presets.
 *
 * Defaults encode the things that make a lens read well, recorded in
 * docs/findings.md F-4: a stable ring, quiet chrome, a desaturated exterior so
 * the lens reads as an aperture rather than an overlay.
 */

/** Okabe–Ito, colour-vision-deficiency safe. */
export const CATEGORICAL = [
  '#0072B2', '#E69F00', '#009E73', '#CC79A7',
  '#56B4E9', '#D55E00', '#F0E442', '#7A7A7A',
];

/** Diverging, for `lq` / `z` / `delta` where a neutral value exists. */
export const DIVERGING = { low: '#B2452E', mid: '#E8E4DC', high: '#2C6E8F' };

export const DEFAULT_STYLE = {
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

export const PRESETS = {
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
export function resolveLod(ringRadius, style, unroll = 0) {
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

export function resolveStyle(style = {}) {
  const preset = typeof style.preset === 'string' ? PRESETS[style.preset] ?? {} : {};
  return { ...DEFAULT_STYLE, ...preset, ...style };
}

/**
 * Colour for a bin. Categorical bins get a stable palette slot; bins with a
 * neutral value (LQ, z, delta) get a diverging ramp around it.
 */
export function colorFor(bin, layout, style) {
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

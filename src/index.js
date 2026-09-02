/**
 * glyphlens
 *
 * Composable multivariate map lenses for MapLibre.
 *
 * The library treats a lens as a path through six stages —
 * selection, binning, normalisation, placement, marks, association — so that
 * configurations which are separate products elsewhere fall out of the same
 * core. See docs/design-space.md.
 *
 * Its distinguishing move is that angular position on the ring can mean
 * *bearing* rather than category order, placed by a JavaScript implementation
 * of Speckmann & Verbeek's necklace maps (docs/references.md).
 *
 * Quick start (MapLibre):
 *
 *   import { addLens } from 'glyphlens/maplibre';
 *
 *   const lens = addLens(map, {
 *     center: [-0.1276, 51.5072],
 *     selection: { type: 'disc', radius: 800 },
 *     data: places,                                  // [{ lng, lat, category }]
 *     binning: { mode: 'angular', bins: 24 },
 *     placement: { mode: 'necklace' },
 *     marks: { type: 'bar' },
 *   });
 *
 *   lens.setMorph(0);   // back to a categorical ring
 */

// Adapters
export { LensOverlay, addLens } from './adapters/maplibre.js';

// Pipeline
export { computeLens, lerpLayout, lerpCyclic } from './core/layout.js';
export { select, selectComplement, selectionArea, contains } from './core/selection.js';
export {
  bin,
  binCategorical,
  binAngular,
  binRadial,
  binCross,
  circularMean,
  compassLabel,
} from './core/binning.js';
export { normalise, profileOf, confidence } from './core/normalise.js';
export {
  circularStats,
  radialStats,
  lateralStats,
  elasticity,
  elasticityProfile,
  angularHistogram,
  radialHistogram,
  describeDistribution,
  describeBins,
} from './core/distribution.js';

// Placement
export { placeNecklace, placeByBearing, fitNecklaceScale } from './core/necklace.js';
export { isotonic, isotonicBoundedSpan } from './core/isotonic.js';

// Geometry
export { circleCurve, polylineCurve, wrap01, cyclicDelta } from './core/curve.js';
export * as geo from './core/geo.js';

// Rendering
export { LensRenderer, drawArcText } from './render/LensRenderer.js';
export {
  DEFAULT_STYLE,
  PRESETS,
  CATEGORICAL,
  DIVERGING,
  resolveStyle,
  colorFor,
} from './render/style.js';

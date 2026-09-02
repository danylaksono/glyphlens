# glyphlens

Composable multivariate map lenses for MapLibre — with, as far as we can find,
the first JavaScript implementation of **necklace-map placement**.

> In VisQuill the ring is a legend. Here the ring is a **necklace**: angular
> position means *bearing*, not category order. A bar at 11 o'clock means the
> data it summarises lies to the northwest.

**Try it:** [ring lens](examples/) · [corridor lens](examples/corridor.html) —
live, no build step, and they fall back to a bundled OSM extract when Overpass
is down.

Zero dependencies in the core. Plain ESM.

**Status:** early prototype (v0.1). The API will move.

---

## Why

A radial lens spends its most valuable channel — angle — on nominal category
order. This library makes that channel carry geography instead, and treats the
rest of the lens as a set of independent choices rather than a fixed design.

Every configuration is a path through six stages:

```
selection -> binning -> normalisation -> placement -> marks -> association
```

Which means a compass rose, a classic necklace map, a VisQuill-style category
ring and a distance-decay profile are all the same object with different
arguments. The reasoning behind each stage is in
[docs/design-space.md](docs/design-space.md); the running record of decisions,
evidence and open questions is in [docs/findings.md](docs/findings.md).

## Install / run

```bash
npm run dev     # -> http://localhost:5180/examples/
npm test        # node --test (68 tests, no dependencies)
```

There is no build step. The examples import `../../src/` directly, which is
also why they work unchanged on GitHub Pages.

## Use

```js
import { addLens } from 'glyphlens/maplibre';

const lens = addLens(map, {
  center: [110.3695, -7.7956],
  selection: { type: 'disc', radius: 800 },
  data: places,                              // [{ lng, lat, category }]
  getPosition: (f) => [f.lng, f.lat],

  binning:       { mode: 'angular', bins: 24 },
  normalisation: { mode: 'count' },
  placement:     { mode: 'necklace' },
  marks:         { type: 'bar' },
});

lens.setMorph(0);            // animate back to a categorical ring
lens.setRadius(1500);
lens.update({ normalisation: { mode: 'lq' } });
```

Drag the lens centre to move it, or its dashed edge to resize.

### Options

| Stage | Values | Notes |
|---|---|---|
| `selection.type` | `disc` · `annulus` · `sector` · `corridor` · `polygon` | `polygon` also covers lasso and isochrone |
| `binning.mode` | `categorical` · `angular` · `radial` · `cross` · `chainage` | `angular` = bearing sectors; `chainage` = along a corridor |
| `normalisation.mode` | `count` · `density` · `share` · `lq` · `z` · `delta` | `lq` baselines against the lens's surroundings by default |
| `placement.mode` | `necklace` · `block` · `morph` · `stacked` | `morph: 0..1` blends block and necklace; `stacked` gives each variable its own ring |
| `marks.type` | `bar` · `disc` · `rose` | `disc` sizes by area (classic necklace); `rose` is a directional profile |
| `marks.sizeBy` | `value` · `equal` | which reading owns size; roses default to `equal` |
| `marks.structure` | `none` · `spread` · `gradient` · `inclusions` · `both` | within-unit distribution (see below) |
| `style.preset` | `paper` · `night` · `minimal` · `structure` | |

### Any shape: polygon, lasso, isochrone

These are one selection, because they differ only in where the shape came from:

```js
lens.update({
  selection: { type: 'polygon', rings: [[[lng, lat], ...]] },  // or GeoJSON coords
});
```

Rings accept a bare ring, an array of rings (first outer, rest holes), or
GeoJSON `Polygon` / `MultiPolygon` coordinates. A polygon has no centre, so the
area-weighted centroid is resolved as the anchor every bearing is measured
from — pass `center` if you have a better one, such as the origin an isochrone
was generated from.

Producing an isochrone is a routing problem and stays outside this library;
hand it the resulting polygon and it lenses like any other shape. The ring demo
has a lasso tool that draws one by hand.

### Stacked: a necklace per variable

```js
lens.update({
  binning:   { mode: 'cross', bins: 8 },        // bearing x category
  placement: { mode: 'stacked', by: 'category', ringGap: 22 },
});
```

Each variable gets its own concentric necklace, solved independently. The
trade is explicit rather than a free win: stacking buys **exact angular
fidelity** — displacement drops to zero, because a mark only competes with its
own variable — and pays in radial space and in cross-variable comparability.
If displacement is unacceptable for your task, stack rather than tune the
solver.

### Corridors: the same lens on an open curve

Placement anchors to a curve, not to a centre, so a route works exactly like a
ring — the solver, binning, normalisation and within-unit stages are unchanged:

```js
const lens = addLens(map, {
  selection: { type: 'corridor', path: [[lng, lat], [lng, lat]], width: 600 },
  data: places,
  binning: { mode: 'chainage', bins: 18 },   // bins are stretches of route
  placement: { mode: 'necklace' },           // solved on an open curve
  marks: { type: 'bar' },
});
```

Members are annotated with `chainage` (distance along) and a signed `offset`
(perpendicular distance, positive to the left of travel) instead of distance and
bearing. Endpoints are draggable. See [examples/corridor.html](examples/corridor.html).

A corridor has an axis a disc does not: **which side**. `structure: 'spread'` on
an open curve draws the lateral distribution rather than the angular one, and
each bin reports `bias` (mean offset, signed) alongside `sidedness` (how
one-sided by count). Those disagree when provision is balanced by count but not
by distance, so both are kept. One-sided provision along a river or a railway is
common and a count erases it entirely.

One asymmetry worth knowing: a ring is fixed in screen pixels, but a corridor is
a real route on the ground, so its anchor is geographic and a corridor lens
recomputes on zoom while a disc lens does not.

### Within-unit structure

An aggregate hides whether its members are spread evenly across the unit or
piled in one corner — and that difference is what makes the number fragile to
how the unit was drawn. Following Honeycomb Plots' *diamond cut* and HexTiles'
confidence encoding, every bin also carries a summary of its internal
distribution:

```js
lens.update({ marks: { structure: 'both' } });

layout.bins[0].structure;
// { circular: { mean, R, sd, n },      // which way, how concentrated
//   radial:   { mean, meanNormalised, cv, edgeShare },
//   elasticity,                        // d(count)/d(radius), scaled
//   gradient: { bearing, strength } }  // the diamond-cut pair
```

Four ways to show it:

- **`spread`** draws the circular standard deviation as an arc, so a bar whose
  direction is not worth believing says so;
- **`gradient`** draws the lens-level density gradient as an arrow — direction
  and strength, the diamond-cut pair;
- **`inclusions`** draws the members back through the aggregate, fainter where
  the bin is dense and firmer where it is sparse, after Honeycomb's amber
  inclusions;
- **`marks.type: 'rose'`** replaces each mark with its own angular histogram —
  the full distribution, for when no single direction is true.

On a corridor, `spread` becomes lateral rather than angular, and `inclusions`
place members from their own chainage and offset.

Roses are oriented to true north rather than to their own mean, so they stay
comparable with each other and with the compass. They default to `sizeBy:
'equal'`: a rose sized by value is illegible for exactly the small bins whose
direction is least certain.

A lens gets this more cheaply than a hexagon can. A hexagon has no privileged
origin, so Honeycomb must fit a regression plane; a lens is already a polar
coordinate system centred on a point the user chose, so its internal
distribution decomposes into bearing and distance with no fitting at all. The
same geometry means `inclusions` needs no map projection — members are placed
from their own distance and bearing, which reproduces exactly the geodesic
circle the selection asserts.

**Elasticity** falls out of the same geometry: `E = (dV/V)/(dr/r)` says how much
the reading depends on the radius the analyst happened to pick. `E ≈ 2` is
uniform density; `E ≫ 2` means a cluster sits just outside the rim and the
number is about to jump.

Because that curve does not depend on the radius currently set, it can be drawn
**on the radius control itself** — so the cliffs are visible before you drag
onto one:

```js
import { elasticityProfile } from 'glyphlens';

const profile = elasticityProfile(distances, { maxRadius: 3000, samples: 120 });
// [{ r, count, share, elasticity, reliable }, ...]
```

`reliable` matters: the estimator is a ratio of counts and is meaningless at
small n, so don't plot or read samples below the floor as cliffs. The ring demo
draws only the reliable span and shades the rest. See
[docs/design-space.md §4](docs/design-space.md#4-within-unit-structure--the-maup-channel).

### Using the placement engine on its own

The necklace solver has no dependency on maps, canvas or the rest of the
library:

```js
import { placeNecklace } from 'glyphlens/necklace';

const { placements, overflow } = placeNecklace([
  { id: 'a', position: 0.30, halfWidth: 0.05 },  // cyclic parameter in [0,1)
  { id: 'b', position: 0.31, halfWidth: 0.05 },
  { id: 'c', position: 0.32, halfWidth: 0.05, interval: [0.25, 0.5] },
]);
```

Each result carries the `displacement` from its preferred position, so you can
decide what to do when placement has had to move a symbol far off its true
bearing — an open question, not a solved one
([Q-2](docs/findings.md#q-2-how-much-angular-displacement-is-acceptable)).

## Layout

```
src/core/      pure pipeline — no DOM, no map, no framework
  necklace.js    placement (Speckmann–Verbeek, via isotonic regression)
  isotonic.js    weighted PAV, exact
  distribution.js  within-unit structure: circular stats, MAUP elasticity
  layout.js      composes the six stages into a plain geometry object
src/render/    canvas renderer + style tokens
src/adapters/  maplibre (deck.gl over MapLibre works today; standalone
               Deck would need a second adapter — see adapters/maplibre.js)
examples/      ring lens + corridor lens demos (with a bundled extract,
               so they work when Overpass is down)
docs/          design space, findings, references
sketches/      the pre-library prototypes this grew out of
```

The core returns geometry and draws nothing. Two layouts can therefore be
interpolated (`lerpLayout`), which is how the block ↔ necklace morph works and
how the lens ↔ gridded-glyphmap continuum will work later.

## What this is not

Not a reimplementation of VisQuill. VisQuill is a reactive-geometry kit and its
lens gallery is a demo of it; the contribution here is composable cartographic
strategy, not constraint solving. See
[F-5](docs/findings.md#f-5-visquill-is-not-the-competitor-it-looks-like).

## Background

Built on the multivariate area-based statistical cartography design space from
the STAR review by Slingsby, Laksono & Jianu
(<https://multivariate-cartography.netlify.app/>), and on necklace maps
(Speckmann & Verbeek 2010, 2015), with the within-unit encoding following
Honeycomb Plots (Trautner et al. 2022) and HexTiles (Kawakami et al. 2024).
Full citations in
[docs/references.md](docs/references.md).

## Licence

MIT © Dany Laksono

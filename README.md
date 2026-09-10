# glyphlens

Composable multivariate map lenses for MapLibre — with, as far as we can find,
the first JavaScript implementation of **necklace-map placement**.

> In VisQuill the ring is a legend. Here the ring is a **necklace**: angular
> position means *bearing*, not category order. A bar at 11 o'clock means the
> data it summarises lies to the northwest.

**Try it:** [gallery](examples/gallery.html) — seventeen points in the design space,
one dataset · [continuum](examples/continuum.html) — one lens to a gridded
glyphmap on one slider · [ring lens](examples/) ·
[corridor lens](examples/corridor.html) — shape a route or drop in a GeoJSON
line ·
[areal lens](examples/areal.html) — census-style geography.
Live, no build step, and the interactive demos fall back to a bundled OSM
extract when Overpass is down.

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
npm test        # node --test (167 tests, no runtime dependencies)
npm run build   # -> dist/ browser bundles (rollup, a devDependency)
```

The library itself needs no build: the `exports` map points bundlers and the
examples straight at the ESM sources in `src/`, which is why the examples work
unchanged on GitHub Pages.

### Loading it in a browser

`dist/` is committed, so the bundles are served straight from the live site with
nothing having to run a build:

```html
<!-- plain script tag: defines window.glyphlens -->
<script src="https://danylaksono.is-a.dev/glyphlens/dist/glyphlens.global.min.js"></script>

<!-- or as a module -->
<script type="module">
  import { computeLens } from 'https://danylaksono.is-a.dev/glyphlens/dist/glyphlens.esm.js';
</script>
```

That URL tracks `main`, so pin a copy if you need stability.

**Not on a CDN yet.** jsDelivr's `gh/` path only serves public repositories and
this one is private, so `cdn.jsdelivr.net/gh/danylaksono/glyphlens` 404s. Making
the repo public would enable it immediately (the committed `dist/` is what makes
that work with no build on their side); publishing to npm would enable the
shorter `npm/glyphlens` path as well.

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
| `anchor.unroll` | `0..1` | `0` is the closed ring, `1` a straight baseline of the same length |
| `anchor.at` | parameter · `'auto'` | the point held fixed as the curve opens; `'auto'` seams at the widest gap |
| `marks.type` | `bar` · `disc` · `rose` | `disc` sizes by area (classic necklace); `rose` is a directional profile |
| `marks.orient` | `normal` · `up` · `upright` | which way a mark grows: outward, screen-up, or vertical but never inward |
| `marks.sizeBy` | `value` · `equal` | which reading owns size; roses default to `equal` |
| `association.mode` | `auto` · `leader` · `hover` · `adjacency` | leader lines back to what a mark summarises; `auto` draws them where adjacency has gone |
| `marks.structure` | `none` · `spread` · `gradient` · `inclusions` · `both` | within-unit distribution (see below) |
| `style.preset` | `paper` · `night` · `minimal` · `structure` · `forensic` | switchable at runtime |
| `style` toggles | `showLabels` · `showValues` · `compass` · `dimExterior` · `ringRadius` · `labelGap` · `valueGap` | all live-updatable via `lens.update({ style })` |

### Unrolling: the same lens on a straight axis

A ring spends angle on bearing, and pays for it — every bar grows from a
different baseline in a different direction, so lengths are hard to compare.
Opening the ring into a straight axis of the same length fixes that without
changing anything else:

```js
lens.setUnroll(1);          // 0 = closed ring, 1 = straight baseline
lens.setUnroll(0.5, 'auto');  // half open, seamed at the widest gap
```

**Nothing is recomputed.** Placement solves in a curve's parameter space and
reserves each mark's room as a fraction of the curve, so any curve of the same
length accepts the same solution: `setUnroll` repaints, and a closed ring paints
identically with or without the new anchor. The unroll therefore composes with
everything above it — areal units, stacked rings, `lq`, roses — for free.

What you trade is association. On a ring a mark points at the part of the map it
summarises; on an axis it does not, which is what makes leader lines a
requirement rather than a nicety
([F-28](docs/findings.md#f-28-a-straightened-anchor-is-a-cartogram-and-should-say-so)).
The compass follows the marks across: at high curvature it becomes an axis of
the same ticks and cardinals strung along the curve.

Independently, `marks.orient` says which way a mark grows — `normal` (outward,
the default), `up` (screen vertical, one shared baseline) or `upright`
(vertical, but never growing back across the lens). `up` is what a bar chart
does, and belongs with an open or unrolled anchor.

### Leaders: putting the association back

Adjacency is not really an encoding — it is luck. A mark on a ring around its
own selection points at what it summarises for free, and two things spend that:
placement sliding a mark off its bearing, and the anchor unrolling away from
the map. A leader answers both.

```js
lens.update({ association: { mode: 'auto' } });   // the default
```

`auto` draws a leader wherever adjacency has gone — a displaced mark, or an
opened anchor — and fades them in with `unroll`. `leader` always, `hover` only
under the pointer, `adjacency` never.

The line runs from the mark to **the position placement tried to honour, at its
members' own mean distance from the anchor**, so its length is exactly the
association that was given away. It is drawn in the lens's own azimuthal frame,
so no projection is involved, and it declines to draw rather than guess: a
distance-band or nominal-slot bin has no direction to point in, and a lens with
no pixels-per-metre scale has no distance to point at.

The trigger is the gap between where a mark is and where its data is — not the
solver's reported displacement, which is zero under `block` placement even
though every mark is as far from its bearing as it can be. So dragging the
morph slider from bearing back to category order fades the leaders in as the
bars leave their bearings.

### Fields: one lens, or a glyphmap

A lens and a gridded glyphmap are the same object at different settings, so a
field is a loop over `computeLens` rather than a second implementation:

```js
import { addField } from 'glyphlens/maplibre';

const field = addField(map, {
  center: [110.3695, -7.7956],
  data: places,
  coverRadius: 4200,
  count: 60,            // 1 = focus lens; a few = small multiples; many = glyphmap
  minCount: 3,          // don't draw cells with almost nothing in them
  binning: { mode: 'angular', bins: 12 },
});

field.setCount(300);
```

Two things worth knowing. A field derives **one** shared baseline for `lq` and
`delta` — per-cell baselines would make every cell average by construction. And
the renderer sheds chrome as rings shrink; below about ten pixels the glyph
stops carrying multivariate information and the field reads as a density
surface, which is the resolution limit of the technique rather than a bug.

### Areal units: census-style geography

Members can be polygons rather than points. Each unit is placed on the arc it
actually subtends from the lens centre — Speckmann & Verbeek's necklace map, on
real geography:

```js
const lens = addLens(map, {
  center: [110.3695, -7.7956],
  selection: { type: 'disc', radius: 2600 },
  data: districts,                        // [{ name, rings: [[[lng, lat], ...]], pop }]

  areal: { weighting: 'centroid' },       // or 'area' for partial containment
  binning: {
    measure: { value: (f) => f.pop, kind: 'extensive' },
    label: (f) => f.name,
  },
});
```

**`kind` is required, and it matters more than anything else here.** Counts are
*extensive*: apportionable and summable, so a district half inside contributes
half its people. Rates, shares and medians are *intensive*: half a district has
the same unemployment rate, and adding two rates together is meaningless. They
are averaged, weighted by whatever the rate is a rate of:

```js
{ value: (f) => f.unemployed / f.workforce, kind: 'intensive', weight: (f) => f.workforce }
```

Nothing about a number says which kind it is, so the library will not guess —
guessing wrong gives a confident, plausible, wrong map.

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
bearing. See [examples/corridor.html](examples/corridor.html).

**The route is the interesting part, so it is editable.** Every vertex is a drag
handle, clicking the line inserts one, and alt-clicking removes one. The linear
features worth lensing already exist as GeoJSON, so hand one over:

```js
import { pathFromGeoJSON } from 'glyphlens';

const { path, nodes, sourceNodes } = pathFromGeoJSON(doc, { maxNodes: 200 });
lens.setPath(path);
// or, in one step:
lens.setPathFromGeoJSON(doc);
```

`LineString`, `MultiLineString` and polygon rings all work; multi-part
geometries are **not** joined, because that invents segments the data does not
have, so the longest part is taken and the rest reported. Simplification is not
cosmetic: chainage costs O(features x vertices), so a four-thousand-vertex river
makes the lens unusable long before it makes it wrong. The import says what it
did.

A corridor unrolls too, and it is the same control: `setUnroll(1)` lays the
route out flat on its own chainage — the route profile, with the true path kept
behind it as a ghost. That is a **linear cartogram** rather than a map, so node
editing switches off while it is straightened.

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
  curve.js       the anchors: ring, arc, polyline — and the unroll between them
  route.js       GeoJSON lines in, simplified corridor paths out
  distribution.js  within-unit structure: circular stats, MAUP elasticity
  field.js       lattices, spatial index — the lens/glyphmap continuum
  layout.js      composes the six stages into a plain geometry object
src/render/    canvas renderer + style tokens
src/adapters/  maplibre (deck.gl over MapLibre works today; standalone
               Deck would need a second adapter — see adapters/maplibre.js)
examples/      gallery (no map at all) + ring and corridor demos, with a
               bundled extract so they work when Overpass is down
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

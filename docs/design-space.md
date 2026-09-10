# The design space of lens-based multivariate cartography

Working design document for **glyphlens** — a browser JS library for interactive
multivariate map lenses, built on MapLibre / deck.gl.

Status: living document. Decisions land here; open questions and evidence go to
[findings.md](findings.md); citations to [references.md](references.md).

---

## 1. Where this sits

The library is a deliberate extension of one small cell of the multivariate
area-based statistical cartography design space reviewed in Slingsby, Laksono &
Jianu (STAR), summarised in Chapter 4 of the dissertation and browsable at
<https://multivariate-cartography.netlify.app/>.

That review names five **primary** strategies (`pJuxta`, `pMultiFill`,
`pChartIn`, `pChartEx`, `pDynamic`) and seven **helper** strategies (`hSpProj`,
`hSpAggr`, `hSpSubset`, `hVarProj`, `hVarSubset`, `hVarAggr`, `hAssoc`).

In that notation, essentially every VisQuill lens in their gallery is the same
point in the space:

```
pDynamic( pChartEx, hSpSubset ) + hAssoc
```

A disc selection; one aggregate per category; radial bars laid out in fixed
angular blocks; association by adjacency to the disc. The 23 gallery items vary
the *data* and the *curve* (closed ring vs. open profile), not the strategy.

**glyphlens exists to make the rest of that cell — and its neighbours —
reachable by composition, rather than by rewriting a bespoke visualisation each
time.**

## 2. The core claim

> In VisQuill the ring is a **legend**. Here the ring is a **necklace**.

A radial layout spends its most valuable channel — angular position — on nominal
category order. A bar at 11 o'clock means nothing geographic. The central move of
this library is to make **angle mean bearing**: a bar at 11 o'clock means the
data it summarises lies to the northwest of the lens centre.

This turns an ex-situ mini-chart into a *geographically faithful* ex-situ
mini-chart, which is a thinly-occupied region between `pChartIn` and `pChartEx`.
It also converts `hAssoc` from a decoration (leader lines, colour matching) into
a property of the layout itself.

The rigorous machinery already exists: **necklace maps** (Speckmann & Verbeek
2010; 2015). Regions are projected onto intervals of a closed curve surrounding
the map; symbols are scaled by value and placed without overlap inside their
intervals. There is a C++ reference implementation in CartoCrow but, as far as we
can find, **no usable JavaScript implementation** — so the placement engine is a
contribution on its own, independent of the lens.

## 3. The composable pipeline

Every configuration in this library is a path through six stages. This is the API
shape and the design-space axis list at the same time.

```
selection -> binning -> normalisation -> placement -> anchor -> marks -> association
```

The anchor sits between placement and marks because placement solves in a
curve's parameter space and the anchor decides what curve that is — see §3.4b.

### 3.1 Selection — what the lens encloses (`hSpSubset`)

| Value | Notes |
|---|---|
| `disc` | Euclidean radius. VisQuill's only shape. |
| `annulus` | Ring of a distance band; isolates "the 800–1600 m belt". |
| `sector` | Wedge; directional interrogation. |
| `polygon` | Any ring set: an admin unit, an LSOA, a catchment. |
| `corridor` | Buffer along a linestring (route, river, coastline). |
| `lasso` | Freehand — a `polygon` the analyst drew. |
| `isochrone` | **Travel-time walkshed** — a `polygon` a router produced. |

The 2025 *Spatially-Embedded Lens Visualization* design space (45 papers, seven
dimensions) flags **data-driven dynamic shape** as understudied. For urban data
that gap is not abstract: an isochrone lens is both more defensible
cartographically than a Euclidean disc and, as far as we can tell, undone as a
lens.

The last three rows are one implementation. They differ only in where the shape
came from, so the library takes rings and asks no questions; an isochrone is
lensed like any polygon, while *computing* one stays a routing problem outside
this library. A polygon has no centre and no radius, so the centroid is resolved
as the anchor (overridable) and a nominal scale is derived for the stages that
need one. See
[F-18](findings.md#f-18-three-reserved-selections-turned-out-to-be-one).

The same argument applies to corridors, and is the reason a route is editable
rather than configured. The linear features worth lensing — a river, a railway,
a bus route, a coastline, a boundary — are shapes that already exist, so the
library takes a GeoJSON `LineString`, `MultiLineString` or polygon ring, and
lets every vertex of the resulting path be dragged, inserted or removed. What
it will not do is join multi-part geometries: a river split at every confluence
would gain segments that are not in the data. The one real constraint is
computational rather than cartographic — chainage is O(features x vertices), so
an imported route is simplified to a node budget and told the analyst about it
([F-29](findings.md#f-29-an-imported-route-has-to-be-simplified-for-complexity-not-for-looks)).

### 3.2 Binning — how the enclosed set is decomposed

This is VisQuill's real weakness. Everything inside the radius collapses to one
number per category, discarding *where* and *how far*.

| Value | Angular axis means | Reveals |
|---|---|---|
| `categorical` | nominal order | composition (VisQuill's default) |
| `angular` | **bearing** | anisotropy — which way the supply is |
| `radial` | (radius axis) distance band | distance decay |
| `cross` | bearing × category | both, at the cost of density |
| `chainage` | (position along an open curve) | what changes along a route |

`angular` is the necklace case. `radial` gives the "how fast does provision fall
off" profile that a single-radius aggregate cannot express.

**The interaction that sells this:** morph the angular axis continuously between
`categorical` and `angular`. Same bars, one eased transition from *sorted legend*
to *compass rose*. It is novel, cheap to demo, and it visually teaches the
distinction the design space is built on.

### 3.3 Normalisation — `hVarProj`, and MAUP honesty

A radius slider silently confounds count with area. Normalisation is therefore a
first-class stage, not a formatting option.

| Value | Definition |
|---|---|
| `count` | raw n |
| `density` | n / km² |
| `share` | proportion of lens total |
| `lq` | **location quotient** vs. a baseline profile |
| `z` | z-score vs. baseline |
| `delta` | signed difference vs. a reference lens / time / global profile |

`lq` is the one that makes a small lens meaningful — it answers "what is this
place *unusually* full of", which is almost always the actual question.

Kawakami et al. (HexTiles, 2024) additionally argue for an explicit per-unit
**confidence encoding** derived from within-unit weighted variance. Worth
carrying as an optional channel on every mark.

### 3.4 Placement — where marks go on the curve

| Value | Notes |
|---|---|
| `block` | fixed angular blocks per category (VisQuill) |
| `necklace` | Speckmann–Verbeek placement at preferred bearings |
| `stacked` | concentric necklaces, one per variable |
| `strip` | placed along an open curve → profile chart |

Necklace theory does not require a circle: the curve can be a coastline, a river,
a route corridor. VisQuill's "linear feature" gallery items therefore fall out as
`strip` on an open curve rather than existing as a separate product — and that
is now built rather than asserted. A corridor lens reuses the solver, the
binning, the normalisation and the within-unit stages unchanged; only the
selection, the binning mode and the renderer's coordinate handling differ
([F-14](findings.md#f-14-the-curve-abstraction-held-and-a-corridors-anchor-is-geographic)).

**Multi-necklace / concentric necklaces** is the natural multivariate extension,
anticipated in the necklace-map follow-up literature and now built as
`placement: 'stacked'`. It is not strictly better than a single ring: it buys
exact angular fidelity — displacement falls to zero, because each mark competes
only with its own variable — and pays in radial space and in cross-variable
comparability. See
[F-16](findings.md#f-16-stacking-trades-radius-for-angular-fidelity).

### 3.4b The anchor — what the placement is drawn on

Placement solves in the cyclic parameter of a curve and reserves each mark's
room as a *fraction of that curve*. Nothing in it assumes a circle. So the curve
itself is a free axis, and the interesting thing to vary is its **curvature**.

| `anchor.unroll` | Curve | Reading |
|---|---|---|
| `0` | closed ring | bearing as angle; marks point at what they summarise |
| `0..1` | arc of the same length | the transition, which is the argument |
| `1` | straight baseline | bearing as position; marks share one baseline |

Holding *length* constant rather than radius is what makes this free: the
solved placement stays valid at every curvature, so unrolling never re-runs the
pipeline and never interpolates two layouts. It is a change of anchor, not a
re-solve
([F-27](findings.md#f-27-unrolling-the-ring-is-a-change-of-anchor-not-a-re-solve)).

The trade is exact and worth stating, because it is the one the ring has been
making silently all along:

- a **ring** keeps adjacency — the strongest form of `hAssoc`, and the reason
  §2 works at all — and pays for it in comparability, because every bar grows
  from a different baseline in a different direction;
- a **straight axis** makes lengths directly comparable, gives labels somewhere
  to go, and puts bearings in a scannable left-to-right order — and pays in
  adjacency, which is what makes leader lines go from a nicety to a
  requirement.

`anchor.at` is the parameter held fixed as the curve opens; the seam falls
opposite it. The default holds north at the top, so an unrolled lens reads
west - north - east across the page with marks growing up. `at: 'auto'` puts
the seam in the widest gap between marks, so opening the ring never cuts one in
half.

**The open curve gets the same axis.** A corridor is straightened onto its own
chainage by the same control, which is the route profile that VisQuill's linear
gallery items draw by hand. It is also a *linear cartogram* — chainage and
offset survive, position does not — so the true path stays behind it and vertex
editing switches off while it is straightened
([F-28](findings.md#f-28-a-straightened-anchor-is-a-cartogram-and-should-say-so)).

Two smaller consequences fall out of the same idea. The compass becomes an
**axis** at high curvature — the same ticks and cardinals, strung along the
curve rather than around a centre — which says the angular channel has changed
anchor rather than disappeared
([F-30](findings.md#f-30-the-compass-and-the-axis-are-one-legend-at-two-curvatures)).
And an unrolled lens is a strip, which means several of them stack: the natural
next step is *n* lenses sharing one baseline, which is the small-multiples cell
of §5 with a common scale rather than a common shape.

### 3.5 Marks

`bar` (radial bar, length ∝ value) · `disc` (area ∝ value — the classic necklace
map symbol) · `rose` (miniature angular histogram — the `profile` encoding of
§4) · `wedge` · `spark` (mini line/area, for temporal or radial profiles) ·
`stream` (mirrored streamgraph, reusing the Chapter 6 temporal glyph).

A glyph that nests two readings needs `sizeBy` to say which one owns size:
`'value'` puts the aggregate in the size, `'equal'` hands it to the label and
gives every glyph the same footprint. Roses default to `'equal'`, because a rose
sized by value is illegible for exactly the small bins whose direction is least
certain ([F-13](findings.md#f-13-nested-glyphs-force-a-choice-about-what-size-means)).

Two orthogonal scaling regimes, both legitimate, so both exposed:

- `glyphScale: 'screen'` — constant pixel size, geographic anchor (comparable across zoom)
- `glyphScale: 'geographic'` — scales with the map (preserves spatial extent)

And, independently of the anchor, **which way a mark grows** — a second and
weaker way to buy the same comparability the unroll buys:

| `marks.orient` | Growth direction | Trade |
|---|---|---|
| `normal` | the curve's outward normal | maximal association; every mark on its own baseline |
| `up` | screen vertical, always | one shared baseline; on a closed ring the lower marks grow back across the lens |
| `upright` | vertical, signed by the normal | a shared *axis* with two baselines, and nothing growing into the interior |

`up` belongs with an open or unrolled anchor, where it is simply what a bar
chart does. `upright` is the compromise that keeps a closed ring usable: the
marks share a direction, so lengths compare by eye, and none of them crosses
the selection they are describing.

### 3.6 Association — `hAssoc`

`adjacency` (free, and strengthened by necklace placement) · `leader` lines ·
`colour` · `brush` (lens as a brush driving linked views).

Adjacency is not an encoding so much as a piece of luck: a mark sitting on a
ring around its own selection points at what it summarises without anything
being drawn. Two things spend that luck, and they are the same thing by
degrees — **placement**, which slides a mark off its bearing to avoid an
overlap, and **the anchor** (§3.4b), which under `unroll` detaches the whole
chart from the geography. So one encoding answers both.

| `association.mode` | Draws a leader |
|---|---|
| `auto` (default) | where adjacency has gone: a displaced mark, or an opened anchor — fading in with `unroll` |
| `leader` | always |
| `hover` | only for the mark under the pointer |
| `adjacency` | never; the displacement tick stands in |

A leader runs from the mark to **the position placement tried to honour, at its
members' own mean distance from the anchor**, in the lens's azimuthal frame —
so its length *is* the association that was given away, and no map projection
is involved. It refuses to draw where it would have to guess: a bin with no
bearing (a distance band, a nominal slot) has no direction to point in, and a
lens with no pixels-per-metre scale has no distance to point at.

The trigger is the gap between where a mark is and where its data is, which is
**not** the solver's reported displacement: `block` placement asks for a
nominal slot, so the solver reports no displacement at all while every mark is
as far from its bearing as it can be
([F-31](findings.md#f-31-the-leader-is-the-residual-of-both-things-that-break-adjacency)).
Measured properly, the morph of §3.2 gains a second reading: drag the angular
axis from bearing back to category order and the leaders fade in as the bars
leave their bearings, so what is being given up and what is compensating for it
are visible in one gesture.

### 3.7 Effect scope

The lens design space also distinguishes **interior / exterior / separate view**
effect scope, and notes exterior is thin in 2D. Cheap and analytically strong:

- inner ring = inside the lens, outer ring = rest of the study area → an instant
  baseline without a second view;
- combined with `normalisation: 'delta'` or `'lq'`, this is a comparison lens
  rather than a counting lens.

## 4. Within-unit structure — the MAUP channel

Every stage in §3 produces one number per bin. That number hides whether the
things it counts are spread evenly across the unit or piled in one corner — and
that difference is exactly what makes an aggregate fragile to how the unit was
drawn. This section is a second, parallel output of the binning stage: alongside
the aggregate, each bin also carries a summary of **how its members are
distributed inside it**.

### 4.1 Where the idea comes from

Two hexagon-based techniques get there first, from different directions.

**Honeycomb Plots** (Trautner et al., VMV 2022) attack the fact that a flat
hexplot tile implies its contents are uniform. Their **diamond cut** fits a
regression plane to the point density *within* each tile and cuts a hexagonal
pyramid along that plane; the resulting glyph leans towards the steepest
descent, and the narrower and more one-sided it becomes, the steeper the
within-tile trend. Their **amber inclusions** blend the raw points back through
the aggregate at an opacity driven by relative density, so sparse structure that
binning would erase stays visible. Their **relief mosaic** is a separate,
between-tile cue (ambient occlusion over the value field).

**HexTiles** (Kawakami et al. 2024) attack the same gap from the statistical
side: a weighted within-tile variance becomes a per-tile **confidence** value,
argued explicitly as MAUP mitigation — the variability inside a unit is
information that aggregation destroys, and it should be on the page.

The two are the same move. Encode the distribution *inside* the unit, not only
the summary *of* it.

### 4.2 Why a lens does this better than a hexagon

A hexagon has no privileged origin or orientation, so Honeycomb has to fit an
arbitrary regression plane and then find a way to draw a plane inside a polygon.

**A lens already is a polar coordinate system centred on a point the user
chose.** Its within-unit distribution decomposes, without any fitting, into two
axes that already mean something:

- **bearing** — which way the contents lie;
- **distance** — how far out they are.

So the diamond cut's "direction and steepness of the internal gradient" is, for
a lens, just the circular mean and the resultant length of the member bearings —
quantities we compute anyway. What Honeycomb needs a regression plane and a 3D
metaphor for, a lens gets from its own geometry, and can draw in the plane.

This is the strongest form of the library's core claim. §2 says angle should
mean bearing. This says: *and the spread about that angle is itself data.*

### 4.3 The axis

| Value | What it encodes | Lineage |
| --- | --- | --- |
| `none` | flat aggregate | classic hexplot; VisQuill |
| `spread` | dispersion about the mark: angular on a ring, **lateral** on a corridor | — |
| `gradient` | internal density gradient: direction + steepness | diamond cut |
| `profile` | the full internal distribution (mini-rose, radial spark) | — |
| `inclusions` | raw members drawn through the aggregate | amber inclusions |
| `confidence` | within-unit variance, as opacity or texture | HexTiles |

The circular statistics that carry this:

- **circular mean** `θ̄` — the direction the members lie in;
- **resultant length** `R ∈ [0,1]` — how concentrated they are about it.
  `R = 1` is a single direction; `R → 0` means they cancel and `θ̄` is
  arbitrary;
- **circular standard deviation** `√(−2 ln R)` — the angular spread, which is
  what `spread` draws.

`R` is the lens's diamond-cut steepness. A bar drawn at `θ̄` with low `R` is
asserting a direction that is not there, which is precisely what
[F-6](findings.md#f-6-a-categorys-mean-bearing-is-often-not-a-direction) caught
in the first build. Encoding `R` turns that failure into a reading.

### 4.4 The corridor's second axis

A disc is symmetric about its centre, so "which side" is not a question it can
ask. A corridor has a direction of travel, so it has a left and a right, and its
within-unit structure gains an axis the ring does not have:

- **`bias`** — mean offset as a fraction of the half-width, signed;
- **`sidedness`** — the mean of the signs, in [0, 1].

These disagree in the case that matters. Provision balanced by *count* but not by
*distance* — two places hard against the route on one side, two far out on the
other — has `sidedness = 0` and a clearly non-zero `bias`. Reporting either
alone would hide it.

Straightening the anchor (§3.4b) splits this layer in two, because it moves the
unit. `marks.structureFrame` says which the members belong to: `unit` (default)
draws them wherever the unit went, keeping every member's true chainage and
offset and putting them back *through* their own aggregate; `geographic` leaves
them on the true path, so the strip carries only the aggregates and the leaders
tie the two together. The frames are identical until something is unrolled.

The default is not the intuitive answer and is the better one: on a bent route
"left of travel" rotates with every bend, and one-sidedness — the reading this
axis exists for — is far easier to see on a straight band where left is always
up ([F-32](findings.md#f-32-a-straightened-anchor-splits-the-within-unit-layer-in-two)).

One-sided provision along a river, a railway or a single-sided main road is
common and analytically important, and a count for that stretch erases it
entirely. See [F-15](findings.md#f-15-a-corridor-has-a-second-axis-a-disc-does-not).

### 4.5 MAUP, stated sharply

A lens makes the modifiable areal unit problem unusually tractable, because the
unit is modifiable *by a slider the user is already holding*. The radius control
is a live MAUP instrument.

That suggests an indicator no hexagon-based technique can easily offer:
**elasticity of the aggregate with respect to the unit** —

```
E = (dV/V) / (dr/r)
```

how much the encoded value moves per proportional change in radius. Because
every member's distance is already known, this is computable exactly and
cheaply, with no resampling. A value with `E ≈ 2` (uniform density, area-driven)
behaves very differently from one with `E ≈ 0` (everything is already inside;
widening the lens adds nothing) or `E ≫ 2` (a cluster sitting just outside the
current edge). Reporting it says how much the reading depends on a choice the
analyst made arbitrarily.

Built, and it lives **on the radius control** rather than on the marks. The
curve is independent of the radius currently set — it describes the distance
distribution around the centre — so it is computed once per centre and merely
re-marked as the slider moves. The analyst sees the cliffs before choosing a
radius instead of discovering them by dragging onto one.

One caveat, found by plotting it: the estimator is a ratio of counts and is
meaningless at small n, so samples below a member floor are flagged unreliable
and not drawn. See
[F-17](findings.md#f-17-the-control-can-be-the-chart-but-the-estimator-needs-a-floor).

## 5. The continuum

Treat *how many lenses* as a knob rather than a feature:

```
1 lens                 N lenses                 tessellation
focus+context     ->   small multiples    ->    gridded glyphmap
pDynamic+hSpSubset     + pJuxta                 pChartIn + hSpProj
```

At the limit — one lens per H3 cell — the library *is* a gridded-glyphmap, the
technique developed in Chapters 5–7. So the lens and the glyph map are the same
object at different `hSpSubset` settings, with a smooth animated path between
them.

That is a stronger contribution than any individual lens variant, and it is the
direct sequel to Chapter 4's argument that the analytical value of the framework
is *combinability*.

**Built.** `computeField` calls `computeLens` once per lattice centre and
changes nothing else — the binning, the normalisation, the solver and the
renderer are the same code at every position on the knob. Only two things had to
be added, and neither is a lens concept: a hexagonal lattice for the centres,
and a spatial index so a field of *m* lenses over *n* features does not cost
O(n·m). The three preconditions recorded in
[F-2](findings.md#f-2-what-the-continuum-needs-from-the-core) all paid off.

Two things it settled:

- A field must share **one** baseline. `lq` defaults to "relative to the lens's
  own surroundings", which is right for one lens and catastrophic when tiled —
  every cell would be average by construction and the map would say nothing
  ([F-19](findings.md#f-19-a-field-needs-one-baseline-not-one-per-cell)).
- The continuum has a **usable range**, not an infinite one. Below roughly ten
  pixels of ring radius the glyph stops carrying multivariate information and
  the field becomes a density map with texture. That is the spatial-vs-
  multivariate resolution trade-off Chapter 4 names, met in practice
  ([F-20](findings.md#f-20-the-continuum-holds-and-stops-being-multivariate-around-ten-pixels)).

Level of detail — deferred in F-2 as "what the tessellated case will actually
need" — turned out to be the real constraint, and is now a coarse two-step
shedding of chrome as the ring shrinks.

Related, and cheaper: **lens trail** — sweep a lens along a route and stack each
position's glyph into a strip. This derives VisQuill's Rhine/Kungsleden-style
profiles from the lens rather than treating them as a separate chart type.

The anchor axis (§3.4b) is what makes the middle of the continuum work.
Small multiples of rings are hard to compare — each one is a circle with its
own baselines — but small multiples of *unrolled* rings are a stack of profiles
sharing an x-axis of bearing, which is a chart people already know how to read.
That is the remaining unbuilt cell in the table below, and it is now a layout
problem rather than a design one.

## 6. Area-based statistical data

Point data (OSM, Overture places) was the starting target. **Area-based
statistics** — LSOA/OA census, IMD, EPC — is the actual subject of the STAR
review, and closing that loop is what connects this library back to Chapter 4.

Built. What changed, and what did not:

- **Selection** is areal intersection, not point containment. `arealSelect`
  offers both standard answers to partial containment: count a unit in full if
  its centroid is inside, or weight it by the share of its area that is. The
  second is estimated by deterministic grid sampling rather than clipping —
  clipping a polygon against a disc exactly is not worth a dependency for a
  weight that feeds a visual encoding.
- **The feasible interval is now the unit's real angular extent**, so a symbol
  may slide along the arc its district occupies but can never leave it. This is
  Speckmann–Verbeek's original formulation, and it needed no change to the
  solver — see below.
- **Binning** gains `unit`: one bin per areal unit, which is the reading census
  geography actually supports.
- **Aggregation** distinguishes **extensive** from **intensive** measures, and
  requires the caller to say which. Counts apportion and sum; rates, shares and
  medians do neither. Summing a column of percentages is the classic
  census-visualisation bug and it produces a plausible-looking map that is
  simply wrong
  ([F-21](findings.md#f-21-nothing-about-a-number-says-whether-it-can-be-added-up)).

**What did not change is the result worth having.** The solver, the placement
stage, the normalisation stage and the renderer's mark drawing are untouched.
[F-1](findings.md#f-1-the-interval-api-is-load-bearing) argued on day one that
the engine should take intervals rather than angles precisely so that areal
units would be the general case and points the degenerate one; that call, and
the decision to build `angularExtent` ahead of any consumer, both paid off
exactly as predicted
([F-23](findings.md#f-23-the-interval-api-paid-off-exactly-as-f-1-predicted)).

Still open: **aggregation hierarchies** (`hSpAggr`: OA → LSOA → MSOA → LAD), and
population-weighted centroids as the anchor, which the demo cannot show because
its units carry no population.

## 7. What is built

As of v0.1, against the axes above.

| Stage | Implemented | Reserved |
| --- | --- | --- |
| Selection | `disc`, `annulus`, `sector`, `corridor`, `polygon` (= lasso = isochrone), areal units, exterior complement | — |
| Binning | `categorical`, `angular`, `radial`, `cross`, `chainage`, `unit` | — |
| Normalisation | `count`, `density`, `share`, `lq`, `z`, `delta`, confidence; extensive/intensive measures | — |
| Placement | `necklace`, `block`, `morph`, `stacked`, `strip` (open curves) | — |
| Anchor | ring, arc, straight axis (`unroll`), straightened corridor, `at: 'auto'` seam | — |
| Marks | `bar`, `disc`, `rose`; `orient: normal / up / upright` | `wedge`, `spark`, `stream` |
| Association | `adjacency`, `leader` (`auto` / always / hover), brush hooks, displacement indicator | `colour` ramps |
| Within-unit | `spread` (angular + lateral), `gradient`, `inclusions`, `profile`, `confidence`, elasticity; `structureFrame` | — |
| Curves | circle, arc, polyline (open + closed), marks placed on any | — |
| Routes | GeoJSON import, node editing, simplification to a budget | — |
| Continuum | hex lattice, spatial index, fields of lenses, level of detail | small-multiples layout (non-geographic) |

`examples/gallery.html` shows seventeen of these combinations side by side on one
dataset, each captioned with the path it takes through the pipeline. It is the
most direct evidence for the framework's central claim — that these are one
object with different arguments rather than a set of separate techniques — and
it runs with no map on the page, which is a standing test that the core has not
grown a rendering dependency.

The necklace solver (`src/core/necklace.js`) is complete for the cyclic case
including feasible intervals, with 30 tests covering non-overlap, stability and
overflow. Interval handling is by projection and therefore approximate; the
unconstrained case is exact.

Within-unit structure (§4) is computed for every bin *and* for the lens as a
whole: circular mean and resultant length, circular standard deviation, radial
mean and coefficient of variation, edge share, measure dispersion, and
elasticity. All six values of §4.3 are implemented:

- `spread` — circular SD as a per-bin arc, staggered onto concentric tracks so
  co-located bins stay distinguishable;
- `gradient` — the lens-level diamond-cut pair as an arrow, length ∝ *R*;
- `inclusions` — the members drawn through the aggregate, opacity inversely
  scaled by the bin's relative density, positioned in the lens's own azimuthal
  frame rather than the map's projection ([F-12](findings.md#f-12-inclusions-are-drawn-in-the-lenss-own-frame-not-the-maps));
- `profile` — the `rose` mark, a per-bin angular histogram oriented to true
  north so roses stay comparable with each other and with the compass;
- `confidence` — within-bin dispersion, capping mark opacity;
- elasticity, per bin and for the lens.

Three things the first working builds changed in this document's assumptions,
all written up in [findings.md](findings.md):

- **F-6** — a category's circular mean is only a direction when its members are
  concentrated. The categorical → bearing morph is therefore strongest for
  spatially *segregated* categories, and `cross` is the honest multivariate
  view. This is a scope limit on the core claim in §2, and it should be stated
  as one.
- **F-9** — the ring is a fixed-size screen instrument, and the geographic
  selection boundary is drawn separately. This is what removes the jank, and it
  makes `glyphScale: 'screen'` the default rather than an option.
- **F-10 / F-11** — which is why §4 exists at all. The concentration that F-6
  treated as an error term is a diamond cut, and a lens can measure its own MAUP
  sensitivity exactly because the unit is a slider the analyst is holding.

## 8. Non-goals

- Not a charting library, and not a reimplementation of VisQuill's constraint
  solver. Reactive geometry is their contribution; composable cartographic
  strategy is this one.
- No React / D3 dependency in the core. Adapters only.
- No server. Everything runs in the browser, consistent with the client-side
  computation argument in Chapter 7.

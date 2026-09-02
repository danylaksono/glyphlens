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
selection -> binning -> normalisation -> placement -> marks -> association
```

### 3.1 Selection — what the lens encloses (`hSpSubset`)

| Value | Notes |
|---|---|
| `disc` | Euclidean radius. VisQuill's only shape. |
| `annulus` | Ring of a distance band; isolates "the 800–1600 m belt". |
| `sector` | Wedge; directional interrogation. |
| `polygon` | Snap to an admin unit / LSOA / catchment. |
| `corridor` | Buffer along a linestring (route, river, coastline). |
| `lasso` | Freehand. |
| `isochrone` | **Travel-time walkshed.** |

The 2025 *Spatially-Embedded Lens Visualization* design space (45 papers, seven
dimensions) flags **data-driven dynamic shape** as understudied. For urban data
that gap is not abstract: an isochrone lens is both more defensible
cartographically than a Euclidean disc and, as far as we can tell, undone as a
lens. Reserved as a headline extension.

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

### 3.6 Association — `hAssoc`

`adjacency` (default, and strengthened by necklace placement) · `leader` lines ·
`colour` · `brush` (lens as a brush driving linked views).

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

## 5. The continuum (recorded now, built later)

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
is *combinability*. It is deferred, not dropped: see
[findings.md](findings.md#f-2-what-the-continuum-needs-from-the-core) for what
must stay true in the core for it to be reachable later.

Related, and cheaper: **lens trail** — sweep a lens along a route and stack each
position's glyph into a strip. This derives VisQuill's Rhine/Kungsleden-style
profiles from the lens rather than treating them as a separate chart type.

## 6. Area-based statistical data (deferred)

The current target is point / feature data (OSM, Overture places). The intended
later extension is **area-based statistics** — LSOA/OA census, IMD, EPC — which
is the actual subject of the STAR review and would close the loop with Chapter 4.

What changes:

- **Selection** becomes areal intersection, not point containment. Units are
  partly inside the lens, so weighting is required (area weight, or
  population-weighted centroid).
- **Binning** by bearing uses the unit's population-weighted centroid, and the
  necklace *feasible interval* becomes the true angular projection of the unit's
  geometry as seen from the lens centre — which is exactly Speckmann–Verbeek's
  original formulation. The point case is the degenerate one.
- **MAUP** stops being a footnote. `lq` against a national or regional baseline
  becomes the default rather than an option.
- **Aggregation** (`hSpAggr`) needs a hierarchy: OA → LSOA → MSOA → LAD.

This is why the necklace engine takes *intervals*, not just angles, from day one
even though the point case only needs a preferred angle — see
[findings.md](findings.md#f-1-the-interval-api-is-load-bearing). Getting that
shape right now makes the census extension a data-adapter problem later, rather
than a rewrite.

## 7. What is built

As of v0.1, against the axes above.

| Stage | Implemented | Reserved |
| --- | --- | --- |
| Selection | `disc`, `annulus`, `sector`, `corridor`, exterior complement | `polygon`, `lasso`, `isochrone` |
| Binning | `categorical`, `angular`, `radial`, `cross`, `chainage` | — |
| Normalisation | `count`, `density`, `share`, `lq`, `z`, `delta`, confidence | — |
| Placement | `necklace`, `block`, `morph`, `stacked`, `strip` (open curves) | — |
| Marks | `bar`, `disc` | `wedge`, `spark`, `stream` |
| Association | `adjacency`, brush hooks, displacement indicator | `leader` |
| Within-unit | `spread` (angular + lateral), `gradient`, `inclusions`, `profile`, `confidence`, elasticity | — |
| Curves | circle, polyline (open + closed), marks placed on either | — |

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

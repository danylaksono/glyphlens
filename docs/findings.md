# Findings log

Running record of decisions, evidence and open questions. The intent is that if
this work later becomes a paper supporting Chapter 4, the argument is already
written down rather than reconstructed from commits.

Newest entries at the bottom of each section. Each finding is dated and states
what it changes.

---

## Decisions taken

### D-1. Necklace first, continuum later

Recorded 2026-09-02.

Two candidate headline contributions: (a) geographically faithful necklace
placement, (b) the lens ↔ glyphmap continuum. Chose (a) first.

**Why:** it is self-contained, immediately visible in a demo, and genuinely
missing from the JS ecosystem — the only reference implementation is C++
(CartoCrow). The continuum depends on placement being solid anyway, so this
ordering has no rework cost provided the core stays multi-instance capable
(see [F-2](#f-2-what-the-continuum-needs-from-the-core)).

### D-2. Product first, paper later

Recorded 2026-09-02.

Build a working library; record findings as we go so the design-study writeup
is recoverable. Consequence for how we work: every non-obvious design choice
gets an entry here, even when the code is obvious.

### D-3. Point data now, area-based statistics later

Recorded 2026-09-02.

Demo targets OSM/Overture points. LSOA/OA census is the intended extension
because it is what the STAR review is actually about. The API is being shaped
now so that this is an adapter change — see
[F-1](#f-1-the-interval-api-is-load-bearing).

### D-4. Zero-dependency ESM core, canvas rendering, adapters at the edge

Recorded 2026-09-02.

Matches `waterlines` and `geomorpher`. Core is pure functions over plain
objects with no map, no DOM and no framework; MapLibre and deck.gl are adapters;
rendering is canvas rather than SVG.

**Why canvas over SVG:** the existing sketches re-render a D3 SVG overlay on
every `move` and `zoom` event, and DOM churn is the main source of the jank
(see [F-3](#f-3-why-the-sketches-feel-janky)). Canvas also keeps the core free
of D3.

**Cost, accepted:** arc-following labels and hit-testing have to be written by
hand rather than delegated to SVG. Hit-testing is done analytically against the
layout objects, which the core already produces.

**Standing test, added later:** `examples/gallery.html` runs the whole pipeline
on bare canvases with no map on the page at all. If the core ever grows a
dependency on MapLibre, that page stops working — which makes this decision
enforced rather than merely asserted.

---

## Findings

### F-1. The interval API is load-bearing

Recorded 2026-09-02.

The necklace engine accepts, for each item, a **feasible interval**
`[lo, hi]` plus a **preferred angle**, not merely an angle.

For point data the interval is the whole circle and only the preferred angle
matters, so this looks like unnecessary generality. It is not:

- In Speckmann & Verbeek's original formulation the interval *is* the primitive
  — it is the angular projection of a region's geometry as seen from the
  necklace centre. The point case is the degenerate one, not the general one.
- For area-based statistics (LSOA polygons) the interval is the real constraint:
  a symbol for an LSOA must sit within the angular wedge that LSOA actually
  occupies, or the association is a lie.
- Sector and corridor selections also produce genuine intervals.

Taking intervals from day one is what makes the census extension a data-adapter
problem rather than a rewrite. **This is the single most important shape
decision in the library.**

### F-2. What the continuum needs from the core

Recorded 2026-09-02.

For the lens ↔ small-multiples ↔ gridded-glyphmap continuum
([design-space §5](design-space.md#5-the-continuum-recorded-now-built-later)) to
be reachable later without a rewrite, three properties must hold now:

1. **A lens is a value, not a singleton.** Nothing in the core may assume one
   lens. `computeLens()` returns a layout object; the renderer draws a list of
   them. Being able to draw 400 cheap lenses is the tessellated case.
2. **Layout is separate from rendering.** The layout stage must produce plain
   geometry (angles, radii, positions) with no drawing side effects, so the same
   layout can be interpolated between two configurations and then drawn. The
   categorical ↔ angular morph and the focus ↔ tessellation morph are both
   "interpolate two layout objects".
3. **Anchor is a curve, not a centre.** Placement targets a `Curve` interface
   (`pointAt`, `tangentAt`, `length`, `closed`). A circle, an H3 cell boundary,
   a coastline and a route are then the same thing to the placement engine, and
   `strip` placement on an open curve costs nothing extra.

Deferred deliberately: level-of-detail and glyph simplification at small sizes,
which is what the tessellated case will actually need
(cf. Jankowski et al., *Multivariate Maps*).

### F-3. Why the sketches feel janky

Recorded 2026-09-02.

Diagnosis of `app.js` and `original_glylens.html`. Not a rendering-technology
problem:

1. **Network in the interaction loop.** `app.js` fires an Overpass query on
   `moveend` (debounced) and re-tallies raw points in JS. Overpass latency is
   seconds and highly variable, so the lens is often showing stale numbers while
   the user is still moving.
2. **Full re-render on every frame-ish event.** The D3 SVG overlay is rebuilt on
   `move` and `zoom`. Re-binding and re-creating DOM nodes at pointer rate is
   the visible stutter.
3. **Unstable geometry.** The ring radius is derived from the current selection
   radius, so bars and labels jump as the slider moves. VisQuill looks smooth
   partly because its ring radius is *fixed* and only bar lengths animate.

Fixes adopted:

- Precompute. Overture/OSM GeoParquet → H3 aggregates → DuckDB-WASM; a lens
  query becomes a hex-set lookup with partial-cell weighting rather than a point
  scan. Same stack as Chapter 7.
- Split coordinate regimes: data in deck.gl (GPU, geographic), lens frame and
  glyphs in a screen-space canvas overlay.
- Separate layout from paint; only recompute layout when the *selection* changes,
  not when the *viewport* changes.

### F-4. What actually makes VisQuill look good

Recorded 2026-09-02.

Recorded because it is cheap to reproduce and easy to omit. Mechanically:

- fixed ring radius; bars grow inward/outward from it, so the ring never jumps;
- fixed angular blocks per category, so labels never collide and never reflow;
- labels set along the arc, with a readable-side flip past the horizontal;
- transitions eased on *value* change only, never on viewport change;
- basemap desaturated outside the lens — the lens reads as an aperture rather
  than an overlay;
- generous type and muted palette; bars have rounded caps.

The necklace layout gives up the second of these by construction: bars move as
data moves. This is a real cost, and mitigating it is the main visual-design
risk of the whole approach. Mitigations to try: hysteresis on placement,
minimum-displacement ordering, and animating placement changes rather than
snapping.

### F-5. VisQuill is not the competitor it looks like

Recorded 2026-09-02.

VisQuill is a reactive-geometry kit (a constraint solver over points, shapes and
values); the lens gallery is a *demo* of it. So "don't duplicate VisQuill" is
not really about lenses. The two projects differ in what they are *about*:
reactive geometry vs. composable cartographic strategy. Confirmed from
<https://visquill.com/product/> — self-described as "not a charting library",
Lab examples MIT.

Practical consequence: no reason to reimplement constraint solving. Placement
here is a small number of purpose-built cartographic algorithms, not a general
solver.

### F-6. A category's mean bearing is often not a direction

Recorded 2026-09-02.

Discovered on the first working build, and the most interesting thing to come
out of it.

The categorical → bearing morph places each category's bar at the circular mean
of its members' bearings. On Yogyakarta amenity data all four categories landed
within ~20° of each other, to the northwest — because the *whole* dataset is
denser to the northwest. The rose collapsed into a bundle, and the composition
reading (which the categorical ring gave for free) was lost without anything
being gained.

This is not a bug. It is a property of the encoding: **a circular mean is only a
direction when the distribution is concentrated.** For a category spread right
round the lens, the mean bearing is arbitrary, and drawing a bar there at full
strength asserts something false.

Responses taken:

- `binCategorical` now also returns `concentration` — the resultant length
  *R* ∈ [0, 1] of the member bearings. *R* = 1 means every member points the
  same way; *R* → 0 means they cancel and the mean is meaningless.
- When a mark is positioned by mean bearing (rather than confined to a wedge),
  its opacity is capped by *R*. A bar whose direction is not well defined is
  drawn faint, and visibly so.

Consequences for the design space:

- The categorical → bearing morph is strongest where categories are **spatially
  segregated**, and weakest where they are co-located. That is a claim about
  when the technique applies, and it should be stated as a limitation rather
  than discovered by a reader.
- `cross` (bearing × category) is the honest multivariate view: each category
  gets one bar *per sector*, so a diffuse category shows as a spread of bars
  rather than one misplaced one. In the demo it reads far better than the
  morphed categorical ring.
- This sharpens [Q-3](#q-3-bearing-from-what): the answer is probably not "a
  bearing" at all for diffuse distributions. A directional *distribution* per
  category — a small rose per category, or a concentration-weighted arc rather
  than a bar — may be the better mark.

### F-7. Placement must reserve room for labels, not just marks

Recorded 2026-09-02.

The first build separated the bars correctly and left their labels overlapping.
Obvious in hindsight: the necklace solver was given the bar width as the
half-width, but the thing that actually collides on screen is the label.

Fixed by folding an estimated label width into the half-width passed to
placement. Two caveats worth recording:

- The core has no canvas, so label width is estimated from character count
  (`length * 6.2px`). Deliberately generous. A renderer-side measurement pass
  would be exact but would couple layout to a drawing context, which
  [F-2](#f-2-what-the-continuum-needs-from-the-core) says not to do.
- Reserving label room must be **off** unless labels are actually drawn.
  Reserving it for 32 cross-bins whose labels the renderer suppresses overflowed
  the ring at 192% fill. Both the reservation and the renderer's decision to
  label are now driven by how many marks there are, not by the binning mode.

### F-8. Bearing needs an epsilon at north

Recorded 2026-09-02.

A feature due north round-tripped through the trigonometry as bearing
359.999999998, and a naive `((x % 360) + 360) % 360` filed it in the *last*
angular bin — a bar on the wrong side of north. Caught by a round-trip test, not
by looking at the map, which is an argument for the round-trip test.

All bearing wrapping now goes through `normaliseBearing`, which snaps within
1e-9° of 360 to 0. Boundary features remain genuinely ambiguous; this only
removes the artefact.

### F-9. The ring is a fixed-size instrument

Recorded 2026-09-02.

Decision taken while writing the MapLibre adapter, and it resolved the jank
question more cleanly than expected.

The ring radius is a constant in *screen pixels*. The geographic selection
boundary is drawn separately, as a dashed circle that scales with zoom. So:

- panning and zooming never change the layout — only `repaint` runs, never
  `recompute`;
- bars never jump on zoom, which is one of the things VisQuill gets right
  ([F-4](#f-4-what-actually-makes-visquill-look-good));
- it is the honest reading of `glyphScale: 'screen'`.

The cost is that the ring and the geographic circle are different sizes, and the
relationship between them changes with zoom. In practice this reads fine — the
ring is legibly an instrument rather than a map feature — but it is a design
choice a reviewer would reasonably question.

Dragging still changes the selection at pointer rate, so those recomputes are
coalesced to one per frame and transitions are suppressed while dragging;
animating towards a target that moves every frame only adds lag.

### F-10. The bearing problem is an encoding, not a limitation

Recorded 2026-09-02.

Reframes [F-6](#f-6-a-categorys-mean-bearing-is-often-not-a-direction), and
opens a new axis in the design space.

F-6 treated low concentration as a failure mode: a category whose members are
spread round the lens has a mean bearing that means nothing, so drawing a bar
there asserts something false. The response was defensive — fade the bar.

That is backwards. **How the members are distributed inside the unit is itself
data**, and two hexagon techniques already treat it that way:

- **Honeycomb Plots** (Trautner et al. 2022) fit a regression plane to the point
  density inside each hexagon and cut a pyramid along it — the *diamond cut*.
  The glyph leans towards the steepest descent, and gets narrower and more
  one-sided as the internal trend steepens. Their motivating sentence could be
  ours: uniform distributions within tiles cannot be told apart from clusters or
  trends when the counts match.
- **HexTiles** (Kawakami et al. 2024) derive a per-tile confidence from weighted
  within-tile variance and argue it explicitly as MAUP mitigation.

Mapping that onto the lens: the pair (`meanBearing`, `concentration`) that F-6
produced **is** a diamond cut. `meanBearing` is the gradient direction;
`concentration` (resultant length *R*) is its steepness. We had already computed
the encoding and then thrown it away as an error term.

**The lens does this better than a hexagon, and the reason is structural.** A
hexagon has no privileged origin or orientation, so Honeycomb must fit an
arbitrary plane and then find a way to render a plane inside a polygon — hence
the pyramid and the 3D metaphor. A lens is *already* a polar coordinate system
centred on a point the user chose, so its within-unit distribution decomposes
without any fitting into bearing and distance, both of which already mean
something to the reader. What Honeycomb needs a regression plane for, a lens
gets from its own geometry, and can draw in the plane.

Consequences:

- New design-space axis, [§4](design-space.md#4-within-unit-structure--the-maup-channel):
  `none` · `spread` · `gradient` · `profile` · `inclusions` · `confidence`.
- `concentration` stops being only an opacity cap and becomes an encodable
  channel in its own right — `spread` draws the circular standard deviation
  `√(−2 ln R)` as an arc, so a diffuse category reads as a wide faint arc and a
  concentrated one as a tight mark.
- This strengthens rather than weakens §2's core claim. Angle means bearing;
  spread about that angle is also data.
- It also answers [Q-3](#q-3-bearing-from-what) in the affirmative direction:
  the honest answer for a diffuse category is not a better point estimate of
  direction but a *distribution*.

### F-11. A lens makes MAUP directly measurable

Recorded 2026-09-02.

Following from F-10. The modifiable areal unit problem is usually diagnosed by
resampling — recompute at several unit sizes and see what moves. A lens does not
need that, because every member's distance from the centre is already known and
the unit is modifiable by a slider the user is holding.

So the elasticity of the aggregate with respect to the unit,

```text
E = (dV/V) / (dr/r)
```

is computable exactly, cheaply, at every frame. It reads as: how much does this
number depend on a radius I picked arbitrarily?

- `E ≈ 2` — uniform density; the count is tracking area and little else.
- `E ≈ 0` — everything is already inside; widening changes nothing.
- `E ≫ 2` — a cluster sits just beyond the current edge, and the reading is
  about to change sharply. This is the case worth flagging.

No hexagon-based technique can offer this as cheaply, because its unit is fixed
at bin time. It is a genuine advantage of the lens as a *unit*, not merely as an
interaction. Whether it belongs on the glyph or in a readout is
[Q-6](#q-6-is-elasticity-a-reading-or-a-diagnostic).

### F-12. Inclusions are drawn in the lens's own frame, not the map's

Recorded 2026-09-02.

The `inclusions` encoding draws a bin's members through its aggregate, after
Honeycomb's amber inclusions. The obvious implementation projects each member's
coordinates — but that would give the renderer a map dependency, which
[D-4](#d-4-zero-dependency-esm-core-canvas-rendering-adapters-at-the-edge) rules
out.

It is not needed. Every member already carries `distance` and `bearing` from the
selection stage, so a point can be placed at
`polar(centre, distance / radius × radiusPx, bearing)` — an azimuthal
equidistant projection about the lens centre, computed from data we already had.

This is not a workaround, it is the more correct frame. The selection is defined
by **geodesic distance** from the centre, so drawing its members in the lens's
own azimuthal frame reproduces exactly the geometry the selection asserts. Under
Web Mercator a "800 m disc" is not drawn as a circle at all away from the
equator; here it is, and every point inside it sits at its true distance and
bearing.

Same pattern as [F-10](#f-10-the-bearing-problem-is-an-encoding-not-a-limitation):
the lens's polar geometry keeps turning out to be the thing that makes the work
cheap. Worth stating as a general property rather than rediscovering per
feature.

### F-13. Nested glyphs force a choice about what size means

Recorded 2026-09-02.

A rose carries two readings at once: its **size** is the bin's aggregate, its
**petals** are the bin's internal distribution. Sizing by value therefore makes
the distribution unreadable for exactly the bins whose direction is most in
doubt — the small ones. In the first build the `health` rose was a 9px glyph
with 12 petals, i.e. no reading at all, while `food` was legible.

That is not a bug to tune away; it is the nesting itself. Resolved by making it
an explicit choice, `marks.sizeBy`:

- `'value'` — size carries the aggregate. Correct when comparing magnitudes
  matters more than reading each shape. Default for `bar` and `disc`.
- `'equal'` — every glyph gets the same size and the aggregate moves to the
  label. Default for `rose`, because a rose exists to show the distribution and
  the count is one number a label states perfectly well.

The general rule this suggests: **when a glyph nests two readings, the outer one
should not be a size channel** unless every instance stays above the legibility
floor for the inner one.

Two related fixes fell out of the same build:

- `fitNecklaceScale` was scaling glyphs *up* to fill the ring, so a lens with
  four categories inflated each glyph until placement had to fling them 157° off
  their bearings. The fit is now capped at 1: `marks.maxRadius` is the caller's
  statement of size, and fitting may only shrink.
- A bar grows outward *from* the ring, but a disc or rose is *centred* one radius
  out, so it reaches twice as far. Labels were positioned as if every mark were a
  bar, and so were written over the glyphs.

### F-14. The curve abstraction held, and a corridor's anchor is geographic

Recorded 2026-09-02.

[F-2](#f-2-what-the-continuum-needs-from-the-core) claimed that anchoring
placement to a `Curve` rather than a centre would make a route, a coastline and
a ring the same thing to the engine. Until now nothing tested that, so it was an
assertion. The corridor lens tests it, and it holds: **the necklace solver,
binning, normalisation and within-unit stages needed no changes at all.**

What was actually needed:

- a new selection (`corridor`), annotating members with `chainage` and a signed
  `offset` instead of distance and bearing;
- a new binning mode (`chainage`), whose bins own a stretch of route the way
  angular bins own a wedge — and which emit the same `interval`, so placement
  cannot tell the difference;
- `cyclic: false` in the solver, which already existed and was untested;
- renderer work, which was the bulk of it: marks now place via
  `curve.pointAt(t)` and grow along `curve.normalAt(t)` instead of assuming
  polar coordinates.

Bins now state a preferred position either directly (`position`, chainage bins)
or implicitly via a bearing (angular and categorical bins). Placement resolves
both to the same thing. That is the seam the continuum will later run through.

**The asymmetry worth recording:** a ring is fixed in screen pixels
([F-9](#f-9-the-ring-is-a-fixed-size-instrument)), but a corridor's anchor is
*geographic* — it is a real route on the ground, so its on-screen length, and
therefore how much room each mark has, changes with zoom. A corridor lens
consequently recomputes on `zoomend` while a disc lens never does. Both are
right for what they are; the library should not pretend they are the same.

Two smaller notes:

- `projectOntoPath` works in a local equirectangular frame scaled at the path's
  mean latitude. Accurate to well under 0.5 m over 2 km, now asserted by a test
  rather than assumed. It is not suitable for continental-scale paths.
- Drawing the corridor band exposed a small self-deception: stroking a dashed
  line over the band's path dashes its *centreline*, not its edges. A true
  outline needs polyline offsetting with mitring, which has real failure modes
  at sharp corners; the band is drawn as fill plus centreline instead, which is
  honest about what it is showing.

### F-15. A corridor has a second axis a disc does not

Recorded 2026-09-02. Resolves [Q-8](#q-8-what-is-within-unit-structure-for-a-corridor).

Within-unit structure on a ring is spread in **bearing**. On a corridor it is
spread **across** the route — and that turns out to be the more interesting of
the two, because it has no equivalent on a disc at all.

A disc is symmetric about its centre, so "which side" is not a question it can
ask. A corridor has a direction of travel, and therefore a left and a right. A
stretch of route whose provision sits entirely on one bank is a real and common
finding — a river, a railway, a main road with development on one side only —
and the count for that stretch erases it completely.

Two measures, because they are genuinely different:

- **`bias`** — mean offset as a fraction of the half-width, in [-1, 1]. Signed,
  positive to the left of travel.
- **`sidedness`** — mean of the signs, in [0, 1]. 1 means every member is on the
  same side.

They disagree in the case that matters: four places, two each side, but the left
pair far out and the right pair hard against the route, is *balanced by count*
(`sidedness = 0`) and *biased by distance* (`bias > 0.3`). Reporting only one of
them would hide that. There is a test for exactly this case.

Drawn as a line perpendicular to the route spanning mean ± one standard
deviation, with a dot at the mean. Short and pushed to one side reads as
one-sided; long and centred reads as evenly served.

Inclusions gained the same treatment: on a corridor, members are placed from
their own `t` and `offset` — the open-curve analogue of
[F-12](#f-12-inclusions-are-drawn-in-the-lenss-own-frame-not-the-maps). Both
anchors now draw their members in their own frame.

### F-16. Stacking trades radius for angular fidelity

Recorded 2026-09-02.

`placement: 'stacked'` gives each category its own concentric necklace — the
multivariate extension the necklace-map follow-up literature anticipates, and
the last unbuilt value on the placement axis.

The implementation is small because the tracks are independent: each is solved
by the same solver, with half-widths computed against **that track's own
circumference**, since an outer ring genuinely has more room. The renderer needed
one new idea — `ringOffset`, a per-mark offset along the curve normal — and that
works unchanged on a polyline, so a stacked corridor is free.

The result worth recording is what it does to displacement. On a single ring,
marks compete for angular space and placement pushes them off their true
bearings; that is the central cost of the whole approach
([F-4](#f-4-what-actually-makes-visquill-look-good),
[Q-2](#q-2-how-much-angular-displacement-is-acceptable)). Stacked, each mark
competes only with its own category, and on the Yogyakarta data **maximum
displacement falls to 0°**. Every bar sits exactly where its data is.

So the trade is explicit:

| | single necklace | stacked |
| --- | --- | --- |
| angular fidelity | marks displaced to fit | exact |
| radial space | one ring | one ring per variable |
| cross-variable comparison | shared axis, directly comparable | different radii, arc length per degree differs |
| legibility ceiling | many marks on one ring | few variables before rings crowd |

That is a real answer to Q-2 rather than a mitigation of it: if displacement is
unacceptable for the task, stack instead of tuning the solver. It costs radius
and makes cross-track comparison harder, and the design space should say so
rather than presenting stacking as strictly better.

### F-17. The control can be the chart, but the estimator needs a floor

Recorded 2026-09-02. Resolves [Q-6](#q-6-is-elasticity-a-reading-or-a-diagnostic).

Q-6 asked whether elasticity belongs on the mark, in a readout, or on the radius
slider itself. The third option turned out to be both the most useful and the
easiest, because of a property that was not obvious until it was written down:

**The elasticity curve does not depend on the radius currently set.** It
describes the whole distance distribution around a centre, so it is computed
once per centre and merely *re-marked* when the slider moves. Drawing it on the
control costs nothing per interaction, and it inverts the workflow: instead of
discovering a cliff by dragging onto it, the analyst sees where the cliffs are
before choosing. `elasticityProfile` sorts once and sweeps by binary search, so
it is O(n log n + samples log n).

Plotting it across all radii immediately exposed a flaw the scalar version had
been hiding. **The estimator is a ratio of counts, so it is meaningless at small
n.** At the low end of the slider the lens holds one or two members, and
`(count - inner) / (edgeBand * count)` reports E = 10 for arithmetic reasons
rather than geographic ones. The first render was dominated by a spike that
meant nothing at all.

That is a real limitation of the MAUP-elasticity idea in
[F-11](#f-11-a-lens-makes-maup-directly-measurable), not just of its plot, and
it would have been easy to ship without noticing — the live readout is usually
computed at a radius holding hundreds of members, where the estimator is fine.

Response: every sample carries `reliable` (default floor 30 members), the demo
draws only the reliable span and shades the rest, and an empty input returns an
empty profile rather than a flat line of zeroes a caller might draw as if it
said something. The floor is a rough one — the edge band holds roughly 19% of a
uniform disc's members, so 30 total is only ~6 in the band — and a caller
wanting a tighter guarantee should raise `minCount`.

Worth generalising: **plotting a derived statistic across its whole domain is a
good way to find where it stops being valid.** The scalar had been correct
everywhere we had looked, which is not the same as correct.

### F-18. Three reserved selections turned out to be one

Recorded 2026-09-02.

`polygon`, `lasso` and `isochrone` were listed as three separate reserved values
on the selection axis. Building the first closed all three, because they differ
only in **where the shape came from**, not in what the lens does with it:

- `polygon` — an admin unit, an LSOA, a catchment;
- `lasso` — a shape the analyst drew;
- `isochrone` — a shape a router produced.

So the library takes rings and asks no questions. Producing an isochrone is a
routing problem — the `walk` app in this author's `apps` repo does it with
Overpass, Dijkstra and a concave hull — and pulling that in would have cost the
zero-dependency core for no gain in what the lens can express. The design space
now says isochrone lensing is supported and isochrone *computation* is not.

Two things the implementation forced into the open:

**A polygon has no centre, and everything downstream needs one.** Bearing and
distance are measured from somewhere, so `selectPolygon` resolves the
area-weighted centroid unless the caller supplies `center`. That choice is
visible in the reading rather than neutral — every bearing is relative to it —
so a caller with a better anchor (the origin an isochrone was generated from,
say) should pass it, and the API makes that easy. The resolved centre is
returned and propagated so the layout, the structure stage and the renderer all
agree on it.

**A polygon has no radius either**, which several stages quietly assumed.
Radial statistics, the `lq` context radius and the density denominator all
needed a nominal scale; they now derive one (furthest member, or the radius of a
circle of equivalent area) rather than reading `selection.radius` and getting
`undefined`. That is the same class of assumption the corridor exposed in
[F-14](#f-14-the-curve-abstraction-held-and-a-corridors-anchor-is-geographic):
each new selection shape finds one more place where the disc was being assumed.

Also built, deliberately ahead of any consumer: `angularExtent(center, rings)`,
the arc a polygon subtends from a point. Nothing calls it — the point-data
pipeline gives every member a single bearing — but it is Speckmann & Verbeek's
feasible interval in its original form, and it is the primitive the area-based
extension turns on ([F-1](#f-1-the-interval-api-is-load-bearing)). It returns
`null` when the centre is inside the polygon, since a region enclosing the
viewer constrains nothing. Building it now, with tests, means the census work
starts from a tested primitive rather than a claim.

### F-19. A field needs one baseline, not one per cell

Recorded 2026-09-02.

`computeLens` defaults the `lq` baseline to the lens's own surroundings — the
"exterior effect scope" of the design space, and the right default for a single
lens, because the question is "what is unusual *here* relative to nearby".

Applied unchanged to a field, that default is quietly catastrophic. Every cell
would be compared to its own neighbourhood, so every cell would come out close
to average by construction, and the map would say nothing at all. The failure is
worse than a wrong answer because it looks plausible: a smooth field of values
near 1.

`computeField` therefore derives one baseline from the whole dataset and passes
it to every lens. It also computes it once rather than per cell, which matters —
the per-lens default calls `selectComplement` over all data, so a 400-cell field
would have scanned the dataset 400 times.

The general shape of this: **a default that encodes "relative to context" has to
be re-examined the moment the same object is tiled**, because tiling changes what
the context is. Worth checking the other defaults against the field case as they
accumulate.

### F-20. The continuum holds, and stops being multivariate around ten pixels

Recorded 2026-09-02.

[Design space §5](design-space.md#5-the-continuum-recorded-now-built-later)
claimed a lens and a gridded glyphmap are the same object at different
`hSpSubset` settings. Built, and the claim holds: `computeField` calls
`computeLens` once per lattice centre and changes nothing else. The binning, the
normalisation, the necklace solver and the renderer are the same code at every
position on the slider. Only two things had to be added, and neither is a lens
concept: somewhere to put the centres, and a spatial index so a field of `m`
lenses over `n` features does not cost O(n·m).

The three preconditions [F-2](#f-2-what-the-continuum-needs-from-the-core)
recorded all paid off, which is the more useful result — they were written down
before there was anything to test them against:

1. *A lens is a value, not a singleton.* `computeField` is a loop. Nothing
   needed changing.
2. *Layout is separate from rendering.* The field renders by calling `draw` per
   layout with a different frame.
3. *Anchor is a curve.* Not exercised here, but the reason a stacked or corridor
   field would also be free.

**Where it stops working.** The deferred item in F-2 was level of detail, and it
turned out to be the real constraint. Chrome that reads at 150px — compass,
labels, values, spread arcs, the centre dot — is a grey smear at 20px, so
`resolveLod` sheds it in two coarse steps. Interpolating instead produces a band
of sizes where everything is present and nothing is legible.

But below roughly **ten pixels of ring radius** the glyph stops carrying
multivariate information at all. The bars are a pixel or two; what remains is
essentially a density map with texture. That is not a bug to tune away — it is
the resolution limit of the in-situ mini-chart strategy, and it is exactly the
trade-off Chapter 4 names between spatial resolution and multivariate
resolution. The honest framing is that the continuum has a **usable** range
rather than an infinite one, and the field is most informative in the middle of
it, around 20–40px, where a cell is still a chart but the eye reads the surface.

A related effect worth keeping: at high counts most cells fall below `minCount`
and are not drawn. The field then shows where the data *is* as well as what it
is like, which is a reading a full tessellation would hide.

### F-21. Nothing about a number says whether it can be added up

Recorded 2026-09-02.

The single most consequential thing in the areal work, and it is not geometric.

Census attributes come in two kinds, and the distinction is invisible in the
data:

- **Extensive** — counts, totals, population. Apportionable and summable. A
  district half inside the lens contributes half its people.
- **Intensive** — rates, shares, medians, densities. Neither apportionable nor
  summable. Half a district has the *same* unemployment rate, and adding two
  rates together means nothing at all.

Summing a column of percentages is the classic census-visualisation bug, and it
produces a map that looks entirely plausible. So `measure.kind` is **required**
rather than inferred: guessing wrong yields a confident, wrong picture, which is
worse than an error.

Intensive measures are averaged weighted by whatever the rate is a rate *of* —
population, households, area. That denominator matters more than it looks. A
small district at 100% and a large one at 0% averages to 1% population-weighted
and 50% unweighted; both are arithmetic, only one is the answer. There is a test
for exactly that pair.

Partial containment composes with this correctly: a unit 10% inside keeps its
rate and contributes a tenth of the weight, rather than a tenth of the rate.

### F-22. A mark's width is not the room placement reserved for it

Recorded 2026-09-02.

[F-7](#f-7-placement-must-reserve-room-for-labels-not-just-marks) folded label
width into the half-width handed to the solver, so labelled marks would stop
colliding. That was right, but the renderer then drew each bar at that same
half-width — so **a bar came out as wide as its own label**.

With four short category names it looked like a deliberate style. With eleven
Indonesian district names it was unmistakable: the ring became a solid band.

Two different quantities were sharing one field. The layout now emits both:
`halfWidthPx`, the footprint placement reserved, and `markHalfWidthPx`, how wide
the mark should actually be drawn. Hit testing follows the drawn mark, not the
reservation, so the target matches what is on screen.

The near-miss is the lesson: the bug was present from the moment F-7 landed and
survived several demos, because the data it was wrong on happened to have short
labels. Real data with long names exposed it immediately.

### F-23. The interval API paid off exactly as F-1 predicted

Recorded 2026-09-02.

[F-1](#f-1-the-interval-api-is-load-bearing) argued, on the first day, that the
necklace engine should take a feasible *interval* rather than a preferred angle
— even though the point-data pipeline only ever needed the angle — because for
areal units the interval is the real constraint and the point case is the
degenerate one. `angularExtent` was then built in
[F-18](#f-18-three-reserved-selections-turned-out-to-be-one) ahead of any
consumer, which is normally a thing worth avoiding.

Both calls were right. Adding census geography needed **no change to the solver,
the placement stage, the normalisation stage or the renderer's mark drawing**.
What it needed was a selector that understands polygons, an aggregation rule
that understands rates, and one binning mode. A test asserts the property the
whole design turned on: with three units crowded into one quadrant, placement
separates their symbols and none of them leaves the arc its own geometry
occupies.

Worth stating plainly because the reverse is the usual outcome: a general
mechanism designed before its general case usually turns out to have been
designed for the wrong generality. This one did not, and the reason is that F-1
was derived from Speckmann & Verbeek's actual formulation rather than from a
guess about what might be needed later.

### F-24. Web Mercator is not an area

Recorded 2026-09-02.

Mine, in the data preparation rather than the library. Building the district
fixture I computed each unit's area in EPSG:3857, and the numbers were 2.6% too
large — Web Mercator inflates area by `1/cos²(latitude)`, which even at 7.8°
south is enough to notice.

It surfaced because two figures on the page disagreed: the lens total divided by
the covered area did not match the area-weighted mean density, and the ratio was
exactly the inflation factor. Recomputed in UTM zone 49S.

Two things worth keeping from it. Cross-checking one derived figure against
another computed a different way is a cheap and effective error detector — the
discrepancy was 2%, small enough to shrug at and large enough to be a real bug.
And a projection chosen for *display* is almost never the right one for
*measurement*.

### F-25. Two label bugs that only long names exposed

Recorded 2026-09-02.

Reported from the areal demo: names and numbers printed through each other.
Two separate faults, both present for a long time, both invisible on the data
they had been tested against.

**The value and the label were 3px apart.** The label sat at
`mark tip + 12`, the value at `mark tip + 9`. Three pixels is less than the
height of either, so any labelled mark drew its name across its number. It had
never been noticed because the point demos label four short category names on a
150px ring, where the collision looks like tight kerning. Eleven Indonesian
district names made it unmistakable. They are now stacked — value nearest the
mark, label beyond it — with both gaps as style tokens.

**Arc text flipped on the wrong half.** `drawArcText` reversed the text where
`cos(angle) < 0`, i.e. the *left* half. Tangential text is upright at the top of
a ring and upside down at the bottom, so the half needing reversal is where
`sin(angle) > 0` — the bottom. Labels along the lower arc had been printing
inverted. Again invisible in earlier demos, whose labels clustered near the top
because the data did.

The pattern in both: **a rendering bug that depends on the data will hide behind
a fixture that does not vary**. Every demo until now used the same four short
category names on the same city. The first genuinely different labels — long,
numerous, distributed right around the ring — found both faults immediately.

### F-26. A resolved style cannot take a new preset

Recorded 2026-09-02.

Adding a basemap switcher to the demos meant swapping the lens between the
`paper` and `night` presets at runtime, and nothing happened.

`resolveStyle` merges `{ ...DEFAULT_STYLE, ...preset, ...explicit }`, which is
right. But `setStyle` was merging the new options into the *already resolved*
style — so every key the first resolve had filled in, resolved from `paper`,
sat in the "explicit" position and overrode the incoming preset. Presets were
therefore one-way: whichever was set at construction was permanent.

The renderer now keeps the unresolved options and re-resolves from them, so a
preset can be replaced while genuinely explicit overrides still win over it.
Exposed as a `options` getter, since "what was actually asked for" is different
information from "what it resolved to" and the distinction was what went wrong.

Worth generalising: **merging into a resolved value destroys the layering the
resolution encoded.** If defaults, presets and overrides have a precedence
order, the unresolved inputs are what has to be kept.

---

### F-27. Unrolling the ring is a change of anchor, not a re-solve

Recorded 2026-09-09.

The ring spends angular position on bearing, which is the library's whole
argument, but it pays for it: bar lengths on a circle are compared across a
gap, each one from a different baseline pointing a different way. The obvious
fix — lay the marks out along a straight axis — sounds like a second layout
engine.

It is not. Placement never sees a circle; it sees a `Curve` and solves in the
cyclic parameter `t`, reserving half-widths as a *fraction of the curve*
(F-2, property 3). So any curve of the same length accepts the same solution
unchanged. `arcCurve` is that family: a circular arc of fixed arc length whose
curvature runs from a closed ring to a straight line, with `unroll = 0`
returning `circleCurve` itself.

The consequences are larger than the change:

- **The unroll never runs the pipeline.** `setUnroll` repaints. There is no
  animation to interpolate between two layouts, because there is only one
  layout; a renderer test asserts that a closed ring paints an identical call
  sequence with and without the new curve.
- **It composes with everything.** Every stage above the renderer is untouched,
  so unrolling works on an areal necklace, a stacked lens, an `lq`
  normalisation and a rose the same way, for free.
- **It is the honest form of a comparison the ring was making badly.** The
  same marks, the same positions, on an axis where length is legible.

Two things had to be got right. The arc is computed from its anchor by chord
and turn rather than from its own centre, because that centre runs off to
infinity as the curve straightens and is not a finite point at `unroll = 1`.
And the arc **rotates about its anchor as it opens**, by exactly enough to
land horizontal: without that, the baseline's direction would be whatever the
ring's tangent happened to be at the anchor — vertical for an anchor due east —
and moving the seam would tip the chart over.

Opening a closed curve creates a seam, which is a real discontinuity in `t`
and lands opposite the anchor. `at: 'auto'` puts it in the widest gap between
marks so that opening the ring never cuts one in half. That in turn depended on
a detail the docstring had backwards: `cyclicDelta` returns `[-0.5, 0.5)`, not
`(-0.5, 0.5]`, so a point exactly half a turn from the anchor belongs to the
curve's start rather than its end. Corrected.

What it costs is stated in [F-28](#f-28-a-straightened-anchor-is-a-cartogram-and-should-say-so).

### F-28. A straightened anchor is a cartogram, and should say so

Recorded 2026-09-09.

The corridor's counterpart of unrolling a ring is straightening a route:
`straightenPath` interpolates each projected vertex towards its own chainage on
a horizontal line of the same length. It is the reading that route profiles
have always wanted — what changes along this river, without the river's bends
squeezing and stretching the axis.

But it is not a map any more. Distance along and offset across survive exactly;
**position does not**. That is the defining move of a linear cartogram, and it
has two consequences the implementation has to take seriously:

- The true path is drawn behind the straightened one as a ghost. A cartogram
  with nothing to read it against is just a chart.
- **Node editing switches off once the route is straightened.** A vertex on a
  straightened corridor is at a cartogram position, so dragging it would be a
  gesture with no defensible meaning. The adapter stops emitting handles above
  a threshold of 2% unroll and refuses the drag.

The same argument applies more weakly to an unrolled ring — the selection stays
exactly where it was on the map, so only the chart has moved — which is why
the disc boundary, the centre dot, the gradient arrow and the inclusions are
all still drawn in place. That asymmetry is worth noticing: **unrolling a ring
detaches the chart from the geography; straightening a corridor moves the
geography itself.**

This is also the first thing in the library that makes `association: 'leader'`
more than a reserved word. Adjacency was doing all the work of `hAssoc` while
the marks sat on a ring around their own selection; once the anchor is opened,
adjacency degrades with `unroll` and something has to replace it. Leader lines
from each mark back to its true bearing — the displacement indicator
generalised — are the obvious candidate, and the renderer already draws that
tick on the curve rather than at an angle so it survives the unroll.

### F-29. An imported route has to be simplified for complexity, not for looks

Recorded 2026-09-09.

A two-point transect is the least interesting corridor there is; the linear
features worth lensing — rivers, railways, bus routes, boundaries — are shapes
somebody already has as GeoJSON. Accepting them turned out to be mostly
housekeeping (`pathFromGeoJSON` takes a FeatureCollection, a Feature, a bare
geometry, a MultiLineString or a polygon ring), with one real constraint
underneath.

Selection projects every member onto every segment of the path to get its
chainage and offset, so it is O(features x vertices). A 4,000-vertex river
against 5,000 places is twenty million projections *per drag frame*. The lens
stops being interactive long before it stops being correct, and the failure
looks like a slow map rather than like a data problem.

So imported routes are simplified to a node budget (Douglas-Peucker, tolerance
doubled until the budget is met, 200 nodes by default). At corridor widths of
hundreds of metres a tolerance of tens of metres is invisible — but it is still
a change to the analyst's data, so the import reports what it did: how many
parts were found, how many nodes survived, how many there were.

Multi-part geometries are **not** joined. A river split at every confluence or
a bus route with one feature per direction would gain segments that are not in
the data, and a corridor is a claim about a continuous path. The longest part
is taken and the rest reported.

The same reasoning makes every vertex a drag handle rather than only the two
endpoints. A route that can be re-aimed but not shaped cannot follow anything,
which defeats the purpose of importing one.

### F-30. The compass and the axis are one legend at two curvatures

Recorded 2026-09-09.

A compass rose is drawn inside the ring, and an unrolled ring has no inside.
The reflex was to hide it — but the angular channel has not gone anywhere, it
has become a position along a baseline, so the compass becomes an *axis*: the
same sixteen ticks and four cardinal labels, placed at the same parameters,
strung along the curve instead of around a centre. They cross-fade with
`unroll`, which is what makes the transition read as a change of anchor rather
than a change of encoding.

Building it exposed a real limit in the level-of-detail rule, and the first fix
for that was wrong in an instructive way.

Chrome is shed by ring radius (F-20). A lens at 40px radius unrolls into a
250px strip that reads perfectly well and was having its axis suppressed for
being small, so the axis got its own floor, on the curve's length. That worked,
and the stated moral was that different chrome needs different room.

Then leader lines ([F-31](#f-31-the-leader-is-the-residual-of-both-things-that-break-adjacency))
hit exactly the same wall, and a second special case would have been a pattern
rather than a coincidence. The real error was in the measure, not in the rule:
**level of detail is about how far the drawing reaches, and unrolling makes a
lens bigger without changing its radius.** A closed ring wraps its whole length
into a footprint of `2r`; the same length laid flat spans `2*pi*r`. So the
radius is scaled towards its own half-length as the anchor opens —

```
effective = r * (1 + unroll * (pi - 1))
```

— an identity for every closed ring, so fields and default lenses are
untouched, and the length floor and its token are gone. One measure, one rule,
and the chrome that a strip has room for comes back on its own.

### F-31. The leader is the residual of both things that break adjacency

Recorded 2026-09-10.

Association (`hAssoc`) had been free up to now, and that was luck rather than
design: a mark sitting on a ring around its own selection points at what it
summarises without anything being drawn. Two things spend that, and they turn
out to be the same thing by degrees —

- **placement**, which slides a mark off its true bearing to avoid an overlap;
- **the anchor**, which under `unroll` detaches the whole chart from the
  geography ([F-28](#f-28-a-straightened-anchor-is-a-cartogram-and-should-say-so)).

So one encoding answers both, and the `auto` mode fades leaders in exactly as
adjacency fades out: a mark that is still on its own bearing, on a closed ring,
gets no line, and every mark gets one by the time the ring is a straight axis.

**Where the leader points is the whole design.** Not at the rim, not at the
mark's own position, but at *the position placement tried to honour, at the
members' own mean distance from the anchor* — so the line is precisely the
association that was given away, and its length is how much. It is drawn in the
lens's azimuthal frame, so like inclusions it needs no map projection
([F-12](#f-12-inclusions-are-drawn-in-the-lenss-own-frame-not-the-maps)).

Two things it refuses to do, both for the same reason — a leader is a claim
about where something is, and a guessed claim is worse than none:

- **No bearing, no leader.** A distance-band or nominal-slot bin has no
  direction. Its members *do* have a circular mean, and using that as a
  fallback was the first implementation — but a distance band's members run all
  the way round, so their mean direction is exactly the arbitrary number
  [F-6](#f-6-a-categorys-mean-bearing-is-often-not-a-direction) warns about.
  A confident line to a meaningless bearing is the worst thing on this list.
- **No scale, no leader.** Without pixels per metre there is no honest distance
  to place the target at, so a lens that cannot supply one — a field cell —
  simply gets none.

The find that made it work was that `bin.displacement` is the wrong measure to
trigger on. That is the *solver's* residual: how far it had to move a mark from
the position it was asked for. Under `block` placement it is asked for a
nominal slot, so it reports zero displacement while every mark sits as far from
its data as it can — 120 degrees away, in the demo — which is the layout where
association is most missing. The leader therefore measures the gap itself,
between where a mark is and where its data is, and the two agree exactly
wherever the solver was the one doing the moving.

That has a pleasing consequence for the morph
([§3.2](design-space.md#32-binning--how-the-enclosed-set-is-decomposed)): drag
the angular axis from bearing back to nominal order and the leaders **fade in
as the bars leave their bearings**, so the encoding being given up and the
encoding compensating for it are visible in the same gesture.

It also answers [Q-2](#q-2-how-much-angular-displacement-is-acceptable) in
part. Of the three options recorded there — cap it, encode it, indicate it —
the answer is encode it, and the displacement tick that stood in for this is
now drawn only where no leader replaced it. What stays open is the *policy*
question: at what displacement a symbol should be dropped or merged rather than
drawn with a longer line.

### F-32. A straightened anchor splits the within-unit layer in two

Recorded 2026-09-10, from a reader's question about the corridor demo: are the
members drawn inside the corridor, or inside the baseline? It looked like the
baseline, and that looked wrong.

They were right about the behaviour and it is worth stating exactly why it is
not wrong, because the question turns out to name a real fork.

Straightening a corridor moves the *unit*. So when the within-unit layer is
drawn — the members as inclusions, the lateral spread — there are two honest
answers to where they go, and until now the renderer had silently taken one:

- **`unit`** — the members belong to the unit and go wherever the unit went.
  Every member keeps its true chainage and offset, which are the only two
  quantities a corridor lens reads, so nothing about the reading is lost. It is
  also the only frame in which inclusions do their job at all: their whole point
  (Honeycomb's amber inclusions,
  [F-12](#f-12-inclusions-are-drawn-in-the-lenss-own-frame-not-the-maps)) is to
  show the distribution *through* the aggregate, and members two hundred pixels
  from their own bar are a scatterplot, not an inclusion.
- **`geographic`** — the members belong to the map and stay on the true path.
  The strip then carries only the aggregates, and the leaders tie the two
  together. This is the classic strip-map layout: a profile beside a map.

`unit` stays the default, and on the reading a corridor lens exists for it is
not merely defensible but better. One-sidedness
([F-15](#f-15-a-corridor-has-a-second-axis-a-disc-does-not)) is the thing a
count erases, and on a bent route "left of travel" rotates with every bend and
is genuinely hard to see. Straightened, left is always up. **The cartogram is
the better frame for the reading the encoding was built for**, which is not the
answer intuition gives.

The confusion itself was a legitimate finding, though, and it was not about the
members. A straightened corridor was being drawn as a grey band with a thin
dashed line somewhere else on the map, so the band read as a *chart's plot
background* rather than as the corridor, and anything inside it read as noise
in an axis. The fix was to the ghost, not the members: the true path now carries
the corridor's own width, faintly, so the strip is visibly the same shape drawn
straight. **A cartogram has to show what it is a cartogram of** — F-28 said
that about the path, and the path alone was not enough.

The two frames are identical until an anchor is flattened, which is why nothing
above the renderer has to know about the distinction, and why it can be a style
token rather than a pipeline stage.

### F-33. A field's cells tessellate and its lenses do not

Recorded 2026-09-10, from a reader's question about the continuum: where is the
boundary of each circle, does it fill the space, is it a Delaunay triangulation?

None of the above, and the question was better than the implementation. A field
puts its centres on a **hexagonal lattice** and gives each one a **disc** of
`spacing × packing`. There is no triangulation and no Voronoi partition of the
data; the hexagon is only implied, as the set of ground nearer this centre than
any other.

So there are two shapes per cell and they are not the same shape:

- the **disc** is the selection — the boundary that actually decided what this
  lens counted;
- the **hexagon** is the lattice cell — what tessellates, and what no lens ever
  selected.

At the default packing (`TOUCHING`, 0.5) the disc is exactly *inscribed* in the
hexagon: they agree at six points and nowhere else, and the corners are outside
every disc. A hexagonal lattice gives each centre `(√3/2)·s²` of ground and a
touching disc covers `π·(s/2)²` of it, so **coverage is π/(2√3) ≈ 90.7%** and
about **9% of the map is in no lens at all**. Anything standing in those curved
triangles is counted nowhere. Push packing past `1/√3 ≈ 0.577` and it inverts:
the discs overlap, coverage exceeds 1, and members are counted twice.

Neither is a defect — both are the ordinary consequence of sampling a plane
with discs — but both were **invisible**, because the field drew no boundary at
all (`selectionRadiusPx: 0`). A glyph map with no cell edges reads as though it
partitions the ground, which is the one thing it does not do.

Fixed by making it visible rather than by changing it. `cells` draws the disc,
the hexagon, or both, and `stats.coverage` reports the number. Drawing only the
hexagon would be the comfortable lie — it looks like a tessellation, so it reads
as though every place is in exactly one cell — which is why the two are separate
values rather than one "show cells" toggle.

Two smaller things fell out. The repaint cull was sized on the ring, which is
just over half a cell, so cell outlines were clipped near the edge of the
viewport until it was sized on whichever is larger. And cell outlines are
deliberately **not** shed by level of detail: they are asked for explicitly, and
at four hundred cells the honeycomb is exactly the thing being asked about.

The general lesson is the one [F-19](#f-19-a-field-needs-one-baseline-not-one-per-cell)
started: **a field inherits every one of a lens's choices and makes them harder
to see.** One lens with a dashed boundary is obviously a disc over a map; four
hundred of them with no boundary look like a partition of it.

### F-34. The lattice is an axis, and the choice costs measurable ground

Recorded 2026-09-11, prompted by the obvious follow-up to F-33: if the hexagon
is only one tiling, why is it the only one?

No good reason, and there are exactly three regular tilings. Naming them is the
first hazard, because the tiling and the point arrangement are **duals** and
the words collide:

| `kind` | Cell | The points are | Neighbours |
| --- | --- | --- | --- |
| `hex` | hexagon | a *triangular* lattice | 6 |
| `square` | square | a square lattice | 4 |
| `triangle` | triangle | a *honeycomb* — two interleaved triangular lattices | 3 |

The library names them after the **cell**, because that is what a reader sees.
The third is the one that surprises: triangular cells come from a honeycomb
arrangement of centres, which is what makes it a pair of interleaved lattices
rather than one.

Keeping `spacing` meaning "distance to a nearest neighbour" makes one fact true
of all three, and it is what lets everything downstream stay ignorant of which
is in use: **the disc that just touches its neighbours is exactly inscribed in
the cell**, at `spacing / 2`, for every tiling.

What differs is how much of the cell that disc covers, and the spread is much
larger than intuition suggests:

| Cell | Coverage at touching | |
| --- | --- | --- |
| hexagon | `π/(2√3)` | 90.7% |
| square | `π/4` | 78.5% |
| triangle | `π/(3√3)` | 60.5% |

So the lattice sets a **ceiling on how much ground a field can reach without
counting anything twice**, and that ceiling is the reason to choose one. It
also retrospectively justifies the hexagonal default, which until now was
justified only by "it is what the gridded-glyphmap work uses".

Two things the build corrected:

- A triangle has no half-turn symmetry, so the honeycomb's two sublattices
  point opposite ways. Cells carry their own rotation rather than reading it
  from the tiling, or they cannot tile.
- `spacingForCount` inverted a count using a constant fitted to hexagons, which
  gave squares a quarter fewer cells than asked for. It now refines the
  analytic estimate by counting — the count falls monotonically with spacing,
  so it is a bisection. That matters more than it sounds: **comparing two
  lattices is only fair at the same count**, and the axis exists to be
  compared.

### F-35. Relaxation is the lattice for a shape rather than a plane

Recorded 2026-09-11. Proof of concept, at the reader's suggestion and with
their scope: the space this opens is much larger than what is built here.

Every lattice in F-34 assumes the study area is the whole plane. Real ones are
shapes — a city boundary, a catchment, a park — and clipping a lattice to one
leaves the edge cells sliced arbitrarily, each holding a different and
meaningless amount of ground. That is a real defect and not a cosmetic one: an
edge cell's count is a fact about where the lattice happened to fall.

**Lloyd's algorithm** answers the same question the lattice does — *where do
the centres go?* — for a region that has a boundary. Scatter points, repeatedly
move each to the centroid of the ground nearest it, and they settle into a
centroidal Voronoi tessellation: evenly spaced, and filling the shape exactly.
The cells are not congruent, which is the price, and they tile the polygon with
no gaps and no overlaps, which is what a clipped lattice cannot do at all.

Two implementation choices worth recording, because they pull in opposite
directions:

- **The assignment step is sampled, not triangulated.** A real implementation
  builds a Delaunay triangulation; this walks a sample grid and takes the
  nearest site. It converges to the same place, is a few dozen lines instead of
  a few thousand, and keeps the zero-dependency core. It costs
  O(passes × samples × sites), which is why it is memoised per shape rather
  than recomputed per zoom.
- **The cells themselves are exact.** A Voronoi cell is *by definition* the
  intersection of one half-plane per rival, so clipping the boundary polygon
  against each bisector is the definition rather than an approximation. O(n²)
  in the sites, and at the counts a field uses that is not worth optimising.

Three things only showed up once it ran:

- A cell that wraps around a **concavity** has a centroid outside the shape it
  belongs to, so sites escaped the polygon. Every sample is inside by
  construction, so the nearest sample is the closest legal place to stand.
- The convergence tolerance was a hundredth of a *sample step* — a precision
  the discretisation cannot resolve, so it never reported convergence.
  Expressed against the spacing being solved for, it settles in forty-odd
  passes. **A tolerance belongs to the quantity being solved for, not to the
  machinery solving it.**
- Lloyd converges linearly, so a cap of 32 passes stopped it just short. It
  exits early the moment it settles, so a higher cap costs nothing when it is
  not needed.

What this opens and does not answer: whether cells should be **weighted** by
data density rather than area (a capacity-constrained Voronoi, which would give
every lens a similar number of members instead of a similar amount of ground);
whether the lens radius should follow each cell's own nearest-neighbour
distance rather than one field-wide spacing; and whether an irregular lattice
costs the reader the very thing a regular one buys, which is that every glyph
is comparable because every cell is identical. That last is the question that
matters and none of this settles it.

### F-36. The triangulation was the part worth having

Recorded 2026-09-11, after the reader pointed out that the Delaunay they had
asked for twice had not been built.

They were right, and the substitution was recorded in a code comment rather
than raised. [F-35](#f-35-relaxation-is-the-lattice-for-a-shape-rather-than-a-plane)
built Lloyd's assignment by **sampling** and the cells by clipping against
**every rival**, and argued that a triangulation was a few thousand lines not
worth carrying. Both parts of that were wrong: Bowyer–Watson is about a hundred
and fifty lines, and what a triangulation buys is not accuracy — the old cells
were already exact — but **structure**.

Three things fall out of it, and each replaces something clumsier:

- **The neighbour graph.** A Voronoi cell is bounded *only* by the bisectors
  against its Delaunay neighbours; every other site is provably irrelevant to
  it. Measured on the demo lattice that is 4.8 bisectors per cell instead of
  19, so the cell construction went from O(n²) to O(n) with the same answer to
  five parts in 10¹⁴. **The theorem is the optimisation.**
- **The walk.** Lloyd's inner loop asked "which site is nearest" for every
  sample and answered it by scanning every site. Over a triangulation it is a
  walk to whichever neighbour is closer, which cannot stall anywhere but the
  answer. Relaxing sixty cells went from ~400ms to 122ms, and the cap on passes
  could then be raised to where it actually converges — three hundred cells now
  settle in 112 passes where before they silently stopped short.
- **The hull, free.** Which is what finally made `relaxed` usable: with no
  boundary supplied, the study area is the convex hull of the data itself. A
  field can now relax into the shape its own data occupies with nothing else
  provided, which is why it can sit in the continuum demo at all — the reason
  it had been missing there.

Two mistakes worth keeping:

- The first dual built each cell from the **circumcentres** around its site and
  clipped that to the boundary. It lost 28% of the polygon. Sutherland–Hodgman
  is only correct when the *clip region* is convex — a half-plane always is, a
  study area very often is not. Clipping the boundary **by** the cell rather
  than the cell **by** the boundary is not a matter of taste.
- The cross-check against the old O(n²) construction failed at first for a real
  reason, not a rounding one: the test compared in raw lng/lat while the
  library triangulates in projected metres. **Delaunay is not invariant under
  anisotropic scaling** — at 60° latitude a degree of longitude is half a
  degree of latitude, and the diagonal of a quad flips between the two metrics.
  There is now a test that asserts exactly that, because it is the kind of
  thing that looks like it cannot matter.

The general lesson is about the substitution rather than the algorithm. Writing
"a real implementation would use a Delaunay triangulation" in a docstring
recorded the gap honestly and buried it: a comment is where a decision goes to
be agreed with, not where it goes to be reviewed. **When a request is answered
by something adjacent to it, that belongs in the reply, not in the source.**

---

## Open questions

### Q-1. Does geographic angle actually help anyone?

The core claim of the library is a design conjecture, not an established
result — and Chapter 4 explicitly identifies the empirical gap for glyph-map
designs. The comparison to run eventually: categorical-angle vs.
geographic-angle rings, on tasks of the form "which direction should I walk for
X" and "is provision here isotropic". Until then the claim stays framed as a
design conjecture.

### Q-2. How much angular displacement is acceptable? — encoding answered

Necklace placement moves a symbol off its true bearing to avoid overlap. There
must be a point at which the position is misleading. Options: cap displacement
and drop/merge symbols beyond it; encode displacement (e.g. a leader tick back
to the true bearing); or show a residual indicator.

The **encoding** half is answered by
[F-31](#f-31-the-leader-is-the-residual-of-both-things-that-break-adjacency):
a leader back to the position the mark was placed for, drawn wherever the gap
exceeds a threshold, and generalised so it also covers the association lost by
unrolling the anchor. The engine still reports per-item displacement.

The **policy** half is still open: a leader makes a badly displaced symbol
honest, not correct. At some gap the right answer is to merge two symbols or
drop one, and nothing here says where that is.

### Q-3. Bearing from what?

For points, bearing from the lens centre is obvious. For areas, candidates are
the population-weighted centroid, the geometric centroid, or the full angular
projection with the symbol placed at the interval midpoint. These disagree for
elongated or concave units.

### Q-4. Where does the baseline for `lq` come from?

City, region, national, or the complement of the lens? Each answers a different
question, and the choice materially changes the reading. Probably needs to be
explicit and visible in the UI rather than a config default.

### Q-5. Naming

Package is currently `glyphlens`, after the `original_glylens.html` sketch.
Alternatives considered: `lenskit` (too generic), `necklace` (understates the
lens), `carto-lens`. Not settled; renaming is cheap until publication.

### Q-6. Is elasticity a reading or a diagnostic? — answered

Answered by [F-17](#f-17-the-control-can-be-the-chart-but-the-estimator-needs-a-floor):
on the control. Kept here for the reasoning.

[F-11](#f-11-a-lens-makes-maup-directly-measurable) shows the elasticity of the
aggregate with respect to the lens radius is cheap to compute exactly. Unclear
where it belongs.

As a **reading**, it is a per-bin channel — each bar could carry how sensitive
it is to the radius, which is honest but adds a third quantity to a mark that
already carries value and spread.

As a **diagnostic**, it is one number for the whole lens, shown in a readout,
warning the analyst when the radius they picked happens to sit on a cliff.

Leaning towards the diagnostic, with the per-bin values available on hover.
A third option worth testing: make the radius slider itself show the elasticity
profile, so the analyst can see where the cliffs are before moving it — the
control becomes the chart. That is the most interesting version and the least
proven.

It was the right one, and cheaper than expected: the curve is independent of the
current radius, so it is computed once per centre. It also broke the estimator
in a way the scalar had hidden — see F-17.

### Q-7. Does `spread` compete with value for attention?

The `spread` arc and the bar length are both anchored on the ring and both
angular-adjacent. If the arc is too prominent it will be read as the value.
Needs testing at realistic bin counts; the current implementation deliberately
keeps it low-contrast and behind the mark.

### Q-8. What is within-unit structure for a corridor? — answered

Answered by [F-15](#f-15-a-corridor-has-a-second-axis-a-disc-does-not);
kept here for the reasoning that led to it.

The `spread` and `gradient` encodings are statements about bearings, so they
only mean something on a ring, and the renderer currently skips them on an open
curve. A corridor's members do have internal structure, but it is a different
pair: spread **along** the route (chainage variance within a bin) and spread
**across** it (the signed `offset` distribution — is this stretch's provision on
one side or both?).

The offset distribution looks like the more interesting of the two, and it has
no equivalent on a disc. A one-sided corridor bin — everything on the north bank
of a river, say — is a real finding that the count alone erases.

That guess held. Built as `lateralStats`, with `bias` and `sidedness` kept
separate because they disagree in the case that matters.

### Q-9. Which reading is the unroll actually better for?

The ring and the straight axis carry the same numbers, and each is better at
something the other is bad at. The ring keeps adjacency — a mark points at the
part of the map it summarises — and reads as one object against its own
selection. The axis makes lengths comparable, gives labels somewhere to go, and
puts the bearings in a fixed left-to-right order that can be scanned.

The guess is that the split follows the task: "which way should I walk for X"
wants the ring, "rank these directions" or "is there a run of similar
directions" wants the axis, and the transition itself teaches that they are the
same data. That is a testable claim and belongs in the same study as
[Q-1](#q-1-does-geographic-angle-actually-help-anyone), which it complicates:
the comparison is no longer categorical-angle against geographic-angle, but a
2x2 with the anchor.

Unresolved, and deliberately so — the library ships the axis as a knob rather
than picking a default beyond `unroll: 0`.

### Q-10. What is the right default for a wiggly route?

A corridor's straightened form is unambiguously easier to read, and
unambiguously not a map ([F-28](#f-28-a-straightened-anchor-is-a-cartogram-and-should-say-so)).
For a route with a lot of bends, the on-map form is arguably the misleading
one: chainage is compressed where the route doubles back, so equal stretches of
route occupy unequal stretches of screen and the eye reads the wrong profile.

That suggests the default might depend on the route's sinuosity — straight
enough, draw it in place; convoluted enough, straighten it and keep the ghost.
Making a default depend on the data is the sort of thing that is helpful once
and baffling thereafter, so it stays manual until there is evidence.

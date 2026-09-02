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

---

## Open questions

### Q-1. Does geographic angle actually help anyone?

The core claim of the library is a design conjecture, not an established
result — and Chapter 4 explicitly identifies the empirical gap for glyph-map
designs. The comparison to run eventually: categorical-angle vs.
geographic-angle rings, on tasks of the form "which direction should I walk for
X" and "is provision here isotropic". Until then the claim stays framed as a
design conjecture.

### Q-2. How much angular displacement is acceptable?

Necklace placement moves a symbol off its true bearing to avoid overlap. There
must be a point at which the position is misleading. Options: cap displacement
and drop/merge symbols beyond it; encode displacement (e.g. a leader tick back
to the true bearing); or show a residual indicator. **Currently unresolved** —
the engine reports per-item displacement so a policy can be chosen later.

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

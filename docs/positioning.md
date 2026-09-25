# Positioning: what glyphlens can claim, and against what

Working document for turning glyphlens into a research contribution. It sits
between [design-space.md](design-space.md) (the design) and the draft paper in
[`../paper/`](../paper/) (the argument). Written 2026-09-23.

Every citation here was checked against its registry record (Crossref, or
DataCite for Eurographics/Dagstuhl/arXiv DOIs), and every claim *about* a paper
carries the level of evidence behind it:

| Mark | Meaning |
| --- | --- |
| **F** | read in the full text (version of record, or an author copy — noted) |
| **A** | abstract only |
| **M** | bibliographic record only; nothing about the content is verified |
| **W** | web pages (no paper), with the access date |
| ⚠︎ | a claim we make that is not yet fully supported — says what would settle it |

The per-paper verification notes, with quotes and page references, are in
[`../paper/citation-audit.md`](../paper/citation-audit.md).

---

## 1. The claim, in one paragraph

A lens that *summarises* the data under it has to answer two questions a
magnifying lens does not: what to summarise, and where to put the summary.
Tominski et al.'s lens model — selection σ, lens function λ, join ⋈ — leaves both
inside two black boxes. glyphlens opens them: **λ = marks ∘ normalisation ∘
binning** and **⋈ = association ∘ anchor ∘ placement**. In the resulting
seven-stage space a category ring, a bearing-faithful necklace, a route profile
and a gridded glyphmap are points reached by changing arguments. The part of the
space that is new is where **the lens boundary itself carries data**: a ring
whose angle means bearing, marks displaced minimally rather than dropped, a
leader that appears exactly where adjacency was given away, a ring that unrolls
into an axis without re-solving, and a radius control that shows how fragile the
reading is.

What is *not* claimed: the statistics (local counts, geographically weighted
summaries, the log–log slope of a local K), the tessellated end of the continuum
(gridded glyphmaps exist), or labels on a circular focus boundary (that is a
mature algorithmic literature).

## 2. Where it sits in the lens design spaces

**Tominski et al.** (EuroVis 2014 STAR; CGF 2017 extended survey) — the σ/λ/⋈
model. **F** (both). glyphlens is a *refinement* of it, not a rival: σ is kept;
λ and ⋈ each split into three. Details that matter when citing it:

- the 2014 STAR has σ and ⋈ but writes "a lens function" — the symbol **λ first
  appears in the 2017 version**, so cite 2017 for the notation;
- 2017 adds a five-axis conceptual schema with **effect extent: lens interior,
  side effects, separate view** (Mota et al.'s *effect scope* refines it);
- both list the same four future directions — Lenses and Interaction (incl.
  "flexibly combine lenses … on the fly"), Novel Environments, Exploration and
  Manipulation, **Lenses as Universal Tools** ("lack of a unified toolkit").
  glyphlens speaks to combination and toolkits. Neither survey lists
  data-driven/adaptive lenses or evaluation as a future direction, so do not
  claim they call for either.

**Mota, Sharlin & Alim** (arXiv 2503.23441, 2025) — seven dimensions over 45
papers (2006–2020). **F** (read in full, 2026-09-22). Two of their dimensions do
not have a value for what glyphlens does:

- *Effect scope* is interior, exterior or separate view. A necklace ring is none
  of these: it sits **on the boundary**, and the boundary's parameter (bearing)
  carries data. Candidate new value: **boundary**.
- *Effect encoding* is thematic *or* spatially based. A necklace is **thematic
  marks under a spatial layout** — a hybrid their dichotomy does not name.

Their corpus contains a TVCG paper already called **GlyphLens** (Tong, Li &
Shen, TVCG 23(1), 2017 — 3D glyph occlusion). The library must be renamed before
anything is submitted (open question Q-5 in findings.md now has a forcing reason).

> Correction recorded in references.md: this paper was previously credited to
> "Chen, Z. et al.". Chen et al. 2017 is an immersive-urban-analytics paper in
> its reference list.

## 3. Prior art, by community

The closest precedents are mostly *not called lenses*. They sit in boundary
labelling, off-screen visualisation, radial cartography, glyph maps and spatial
statistics.

### 3.1 Labels around a circular focus region — the algorithmic twin

| Work | What it already does | What is left for glyphlens | Ev. |
| --- | --- | --- | --- |
| Fekete & Plaisant 1999, *Excentric Labeling* (CHI) | labels of objects in a cursor-centred circle, connected by lines, updated as the cursor moves; labels in **left/right stacks**, bearing used only to *order* them; aggregation is a count plus sample labels, a summary glyph proposed as future work | the future-work glyph, placed at bearing | F (HCIL tech-report version) |
| Bertini, Rigamonti & Lalanne 2009, *Extended Excentric Labeling* (CGF) | movable lens, labels around it on lines; extensions for high/uneven density and "summary statistics" | ⚠︎ what those statistics are and how drawn is unverified (paywalled) | A |
| Fink, Haunert, Schulz, Spoerhase & Wolff 2012, *Algorithms for Labeling Focus Regions* (TVCG) | labels **on the circular boundary** with straight/Bézier leaders; a *radial* model fixes each label's port at its site's bearing; a clustering variant labels one representative per cluster; optimises the focus position | conflicts in the radial model are resolved by **dropping** labels, not displacing them; marks are labels, not aggregates | F |
| Haunert & Hermes 2014 (MapInteract) | every leader points at the centre; one position per label; max-weight independent set; real-time JavaScript | same: dropping, not displacement | A |
| Heinsohn, Gerasch & Kaufmann 2014 (PacificVis) | boundary labelling for a **moving** focus region, mental-map preservation (biological networks) | — | A |
| Niedermann & Haunert 2019 (Int. J. Cartography) | fisheye displacement of labels out of a circular focus, optimised when the focus stops; bundled leaders; smooth motion | — | A |
| Bekos, Niedermann & Nöllenburg 2019 (CGF survey) | taxonomy; contour labelling on circles; radial leaders | — | F (arXiv v2) |
| Bonerath et al. 2024, *Boundary Labeling in a Circular Orbit* (GD, LIPIcs) | labels as arcs in an annulus around a circle; straight and orbital-radial leaders; minimum total leader length; polynomial and NP-hard variants | label position is free (not tied to bearing); no aggregation | F |
| Wallinger et al. 2026, *Clarity and Computational Efficiency of Orbital Boundary Labeling* (PacificVis) | within-subject study, n = 54: straight leaders faster than orbital-radial at similar accuracy; no overall preference | our leaders are straight — consistent | F (arXiv v1, not the IEEE version) |

**The sharpest contrast.** In every verified paper in this group a label stands
for one object, a leader is always drawn, and a bearing conflict is resolved by
selection (drop a label) or by freeing the position entirely. glyphlens marks are
*aggregates*, are *displaced minimally* from their bearing (isotonic regression),
and draw a leader *only where the gap between mark and data exceeds a
threshold* — so the leader encodes the residual. No verified paper in this group
draws a leader only when the label is displaced.

### 3.2 Off-screen indicators — the same idea at the viewport edge

| Work | What it already does | What it means for glyphlens | Ev. |
| --- | --- | --- | --- |
| Halo (Baudisch & Rosenholtz 2003), City Lights (Zellweger et al. 2003), EdgeRadar (Gustafson & Irani 2007), Wedge (Gustafson et al. 2008), Ambient Grids (Jäckle et al. 2015) | proxies at the viewport border that encode the **direction** of off-screen objects; EdgeRadar and Ambient Grids use a dedicated border region; Ambient Grids **aggregates** into border grid cells | the bearing-on-a-boundary idea at the viewport scale; cite as a group | M (+ Jäckle 2017's classification, which is F) |
| **Jäckle, Fuchs & Reiterer 2017**, *Topology-Preserving Off-screen Visualization* (arXiv) | 18 participants, rectangular border: localisation judgements nearer the **orthographic** back-projection in 94.4 % of cases (error 78 px vs 183 px), 17/18 found it more intuitive; *but* the authors note radial projection is the familiar one when there is a point of interest (navigation) | the closest evidence **against** direction-preserving placement. Transfer is partial: on a circle, radial *is* the boundary normal, and a lens centre is a point of interest. The study (§6) is the test | F (arXiv v1; no published version found) |
| **Tominski 2016**, *CompaRing* (EuroVis short) | a ring of < 10 slots holding copies of objects; each slot's **arc points towards the original**, wider for further; experts *suggested* laying slots out by direction — not built | the nearest "ring with direction cues" in vis; its unbuilt suggestion is glyphlens's default | F |
| Danyluk, Jenny, Ens & Willett 2026, *Ring maps* for AR navigation (CaGIS) | ring-shaped egocentric maps for pedestrian AR navigation | how landmarks are placed is unverified | A (partial) |

Checked and left out: Jäckle, Fuchs & Keim 2016 (Star Glyph Insets). The
"placed along the ray from the viewport centre" claim could not be checked in
the text, so it is not used.

### 3.3 Map lenses and probes that aggregate

| Work | What it already does | What is left for glyphlens | Ev. |
| --- | --- | --- | --- |
| **Tominski, Schumann, Andrienko & Andrienko 2012**, *Stacking-Based Visualization of Trajectory Attribute Data* (TVCG) — the **time lens** | a movable, resizable **query circle on a map wrapped in a ring of aggregates**; the ring is segmented into **cyclic time bins** (months, weekdays, hours) filled by count or duration | **the closest academic precedent.** There, angle means time; here it means bearing | F (author copy; ring placement around the circle strongly implied, not stated) |
| **VisQuill Lens** (product; browser app and Power BI visual) | "each lens aggregates the data beneath it into a live bar chart" around the rim; up to three lenses on a map | **a shipped version of the aggregating ring lens.** Its pages do not say what angle encodes; the open-source Lab blueprint spaces one bar per category evenly along the arc — category order | W (pages 2026-09-23; demos not run) |
| Butkiewicz et al. 2008, *Probes* (TVCG) | region + a **separate, user-placed pane** of local charts, linked by a line or shared colour; union/comparison panes | nothing attached to the boundary; nothing encodes direction | F |
| Butkiewicz et al. 2010, *Alleviating the MAUP within Probe-Based Analyses* (CGF) | alerts when regions being compared differ unfairly (> 2 SD on a dimension); overview/adjustment panels; semi-automatic boundary edits | **explicitly does not address the scale component** ("We do not address this component in our system"). Nothing shows how an aggregate varies with probe size, and nothing sits at a resize control — so the elasticity-on-the-slider idea is *not* anticipated here | F (anonymised EuroVis submission, not the published version) |
| Krüger et al. 2013, *TrajectoryLenses* (CGF) | map lenses combined by set operations; aggregated attributes "in the vicinity of the lens or adjacent colour-matching panels" | — | A (+ verbatim excerpts; open copy withdrawn) |
| Karnick et al. 2010, *Route Visualization Using Detail Lenses* (TVCG) | detail views on the **map border in route order**; cost includes direction coherence between consecutive lenses; leaders only to the first and last lens | a loose precedent for direction-preserving placement around a frame | F (preprint) |
| Dumas, McGuffin & Chassé 2015, *VectorLens* (TVCG) | a ring around the lens **whose angle means direction** — as a *selection control* for curves, not a chart; no maps | — | F |
| Zhang et al. 2020, *ClusterLens* (CHI EA) | re-aggregation inside the lens at a finer resolution; no ring, no charts | — | F |
| Ellis, Bertini & Dix 2005, *Sampling Lens* (CHI EA) | random sampling inside a region; aggregates listed as future work; scatterplots, not maps | — | F |
| Scheepens et al. 2016 (TVCG) | selection widget by area and direction range; set expressions; annotation windows | — | A |
| Ma et al. 2020, *GTMapLens* (CGF) | movable lenses over geo-text | what is shown, and where, unverified | A |
| Tong, Li & Shen 2017, *GlyphLens* (TVCG) | view-dependent lens that pulls occluding 3D glyphs aside | name collision only | A |

### 3.4 Radial and necklace maps

| Work | What it already does | What is left for glyphlens | Ev. |
| --- | --- | --- | --- |
| **Speckmann & Verbeek 2010**, *Necklace Maps* (TVCG) | regions projected onto **intervals** of a star-shaped curve around the map; proportional symbols without overlap inside their intervals; centroid, wedge and density-dependent intervals; nested/disjoint necklaces; **maximise a common scale**, then centre by forces. "necklace maps do not need leaders"; association "is weaker … Interactivity can help" | glyphlens is the interactive, local version with a different objective: minimise squared displacement at fixed mark size, and **conditional** leaders | F (author PDF) |
| **Speckmann & Verbeek 2015**, *Algorithms for Necklace Maps* (IJCGA) | fixed order O(n log n); any order NP-hard for wedge intervals; FPT in interval thickness; **ordering by region bearing is not generally optimal** for max scale (tight ½-approximation) | a warning for glyphlens's sorted-order assumption (different objective, so not a counterexample) | F (accepted manuscript) |
| Stewart et al. 2011, *ring maps* (IJHG) | evenly spaced spokes, one per county, in attribute rings around a base map; **a leader for every spoke**; name "limited representation of spatial topology in rings" as the main limitation, and interactive ring maps as the remedy | glyphlens's conditional leaders sit between necklace maps (none) and ring maps (all) | F |
| Draper, Livnat & Riesenfeld 2009 (TVCG) | survey of radial methods | background | M |

Checked and left out: Battersby et al. 2011 (J. Maps), whose PDF would not
fetch, and Zhao, Forer & Harvey 2008, for which only secondary mentions were
seen.

### 3.5 Glyph maps, within-cell encodings, glyph theory

| Work | What it already does | What is left | Ev. |
| --- | --- | --- | --- |
| Slingsby 2018, *Tilemaps for Summarising Multivariate Geographical Variation* (VISREG workshop at VIS; no DOI, City eprint 20884) | regular glyph arrays for multivariate geographical variation; **proposes** tilemaps of GW-statistics outputs (not demonstrated); already proposes interactive grid resizing/panning to expose MAUP and a distance-decay kernel **larger than the tiles** | the single lens at the other end, and bearing decomposition inside each cell | F |
| Slingsby, Reeve & Harris 2023, *Gridded Glyphmaps …COVID-19* (VIS short) | grid fixed in **screen** space, data re-aggregated on zoom (so a cell's geographic size changes); names within-cell heterogeneity as future work; notes MAUP vulnerability | within-unit structure is exactly that future work | F |
| Laksono, Slingsby & Jianu 2024 (EuroVis short) | gridded glyphmaps for GMCDA; rose/bar/line glyph designs; no user study | — | F |
| Wickham et al. 2012, *Glyph-maps* (Environmetrics) | temporal glyphs at the data's own grid locations | — | F (preprint) + A |
| McNabb & Laramee 2019 (*Information*) | glyph placement at hierarchical centroids with LOD, zoom, smooth transitions | — | A + F (preprint) |
| Trautner et al. 2022, *Honeycomb Plots* (VMV) | **diamond cut** = regression plane of within-tile density (from KDE normals); between-subject study, n = 42, strong evidence for slope tasks; amber inclusions *not* tested | glyphlens gets bearing + resultant length without fitting | F |
| Kawakami, Yuniar & Ma 2024, *HexTiles* (arXiv only) | weighted within-tile variance → per-tile confidence, argued as MAUP mitigation; **no formula given**; study n = 7 *without* the variance encoding, no significant effects | the confidence claim is weaker than it reads; cite with care | F |
| Ward 2002 (IVS) | data-driven vs structure-driven placement; regular-grid glyphs over a field are *data-driven* | necklace placement: structure-driven layout with a data-driven preferred position | F (author MS) |
| Borgo et al. 2013 (EG STAR); Fuchs et al. 2017 (TVCG) | glyph guidelines; 64 controlled studies reviewed, layout and map backgrounds barely studied | the evidence gap our study targets | F |
| Boeing 2019 (Applied Network Science) | polar histograms of **street bearings** per city, orientation entropy | note: bearing *of edges*, not bearing *from a centre* | F (arXiv) |
| Gleicher et al. 2011 (IVS) | juxtaposition / superposition / explicit encoding | `delta` is explicit encoding; inside-vs-rest ring is superposition | A |

### 3.6 Scale, MAUP and point-pattern statistics

| Work | What it already does | What it means for glyphlens | Ev. |
| --- | --- | --- | --- |
| Brunsdon, Fotheringham & Charlton 2002, *GW summary statistics* (CEUS) | local summary statistics by geographical kernel weighting | **field mode is this** (with a uniform kernel) — concede it | A (whether it names a uniform kernel: unverified) |
| Brunsdon, Fotheringham & Charlton 1996, *GWR* (Geog. Analysis) | origin of GW methods | background only | A |
| **Dykes & Brunsdon 2007**, *Geographically Weighted Visualization* (TVCG) | GW mean is "simply a moving spatial window mean smoother"; **scalograms** across bandwidth; statistics "could … be centred on any points, such as those comprising a regular grid"; **directed GW weighting** sharpened towards a principal direction at 30° clock points | the **bearing decomposition has a statistical precedent** here — concede it. What is left is *placing* each direction's summary at its bearing on the lens boundary. Note: Gaussian kernel; bandwidth precomputed, not a slider | F (City eprint author version) |
| Goodwin, Dykes, Slingsby & Turkay 2016 (TVCG) | local correlation varying with scale and geography; links scale to MAUP | — | F |
| Openshaw 1984, CATMOG 38 | defines the scale and aggregation problems | cite as *reviewing/defining*, not introducing, MAUP | F (scan) |
| Fotheringham & Wong 1991 (EPA) | MAUP unpredictable in multivariate analysis | — | A |
| Ripley 1977 (JRSS-B) | K(t) = πt² under Poisson; simulation envelopes | the uniform reference for elasticity; the L-function is *not* in the paper body | F |
| Getis & Franklin 1987 (Ecology) | second-order analysis "from the perspective of each individual point" | the local version; formula unverified | A |
| Wiegand & Moloney 2004 (Oikos) | Ripley's K and the O-ring statistic as complementary; null models | ring vs circle; envelopes | A |
| Yamu, de Roo & Frankhauser 2016 (EPB) | radial analysis: N(ε) = a ε^D around a freely chosen centre | elasticity is this log–log slope; a methods paper by Frankhauser would be a better citation | F |
| **Willett, Heer & Agrawala 2007**, *Scented Widgets* (TVCG) | visualizations embedded in controls such as sliders | the elasticity-on-the-slider idea is an instance; cite it | F |
| Anselin 1995, LISA | local decomposition of global statistics | background | A |

## 4. What we claim, what we concede

| # | Claim | Status | Against |
| --- | --- | --- | --- |
| 1 | The σ/λ/⋈ refinement into seven stages, with the lens ↔ glyphmap continuum as one object | **novel as a model** — needs descriptive evidence (coding a corpus) and generative evidence (the gallery) | Tominski; Mota |
| 2 | "Boundary" as an effect scope, and thematic-marks-under-spatial-layout as an encoding | **novel as a design-space value** | Mota |
| 3 | Aggregates on the lens boundary at their true bearing, displaced minimally | **novel in combination** — the geometry exists in labelling (radial model), the placement exists in necklace maps, and **aggregating rings around a movable map lens exist** (the time lens; VisQuill Lens) but order their marks by time or category | Fink; Haunert & Hermes; Speckmann & Verbeek; Tominski 2012; VisQuill |
| 4 | Leader drawn where the mark–data gap exceeds a threshold, so its length is the lost association; one mechanism for both placement and unrolling | **appears novel** — no verified labelling paper draws leaders conditionally | group C |
| 5 | Ring ↔ axis unroll with no re-solve (placement in curve parameter, length held) | **no prior art found** (search not exhaustive) | — |
| 6 | Within-unit structure from the lens's polar frame (spread, gradient, rose, inclusions; bias/sidedness on corridors) | **novel as a lens feature**; the idea of encoding within-cell structure is Honeycomb's and HexTiles' | Trautner; Kawakami |
| 7 | Elasticity on the radius control | **concede the statistic** (Ripley's K under CSR; point-centred analysis; mass–radius slope); claim the *interface use*, with a shape-aware reference and envelopes. Butkiewicz 2010 explicitly leaves the scale component aside, so it is not a precedent for this | Ripley; Getis & Franklin; Yamu et al.; scented widgets |
| 8 | Field mode | **concede** GW summary statistics with a box-car kernel (Dykes & Brunsdon already note GW statistics can be centred on a regular grid), shown as a tilemap; **concede** direction-dependent statistics (directed GW weighting). Claim the placement of each direction's summary at its bearing, and one model across the continuum | Brunsdon 2002; Dykes & Brunsdon 2007; Slingsby 2018 |
| 9 | First JavaScript necklace-map implementation | a search claim — record where and when we searched; the solver is exact only in the common case | CartoCrow |

## 5. Objections a reviewer will raise, and the answer

1. **"This is boundary labelling."** — Labels stand for one object and conflicts
   are dropped; our marks are aggregates, displaced not dropped, with a residual
   leader. Cite Fink 2012 and Haunert & Hermes 2014 as the geometric precedent,
   explicitly.
1b. **"This is the time lens / VisQuill Lens."** — Both put aggregates on a ring
   around a movable map lens; in both, angle carries order (time; category). The
   contribution is making angle carry *bearing*, and everything that follows from
   that (displacement, residual leaders, unrolling, within-unit spread). Name both.
2. **"Field mode is GW summary statistics — and directed GW statistics already
   decompose by direction."** — Yes to both (Brunsdon 2002; Dykes & Brunsdon
   2007). Implement bi-square and Gaussian kernels and show the field reproduces
   GW summary statistics exactly; what remains is where each direction's summary
   is *drawn* (at its bearing, on the lens boundary) and the one-object continuum.
3. **"Elasticity is the local K slope."** — Yes: E = d ln N / d ln r, and under
   complete spatial randomness N ∝ r², so E = 2 (Ripley's K(t) = πt²). Claim the
   interface use.
   Fix two things first: the implemented estimator's uniform value is **2 − b =
   1.9**, not 2 (backward difference over a band b = 0.1), and the reference is
   shape-dependent (report E / (d ln A / d ln r), which is 1 under uniformity for
   every shape).
4. **"Does bearing on the ring help anyone?"** — Unknown; that is the study
   (§6). The closest evidence (Jäckle 2017: orthographic beat radial on a
   rectangular border) cuts the other way. It transfers only partly to a circular
   lens, which is a reason to run the study, not to avoid it.
5. **"Multivariate?"** — Most demos summarise one categorical variable by count.
   Either show a genuinely multivariate census case or narrow the title.
6. **"Why these seven stages?"** — Because they are a factorisation of an
   existing model (σ/λ/⋈), and each has at least two values that change the
   reading. Show that removing any stage makes two coded techniques
   indistinguishable.

## 6. The study

A within-subjects 2 × 2 — **angle** (category order vs bearing) × **anchor**
(ring vs unrolled with leaders) — plus a displacement factor (0–45°) for the open
policy question Q-2. Tasks with computable ground truth: direction (angular
error), isotropy (vs resultant length), comparison, composition (where the
category ring should win — so a direction win is not bought silently), and
association (click the ground a mark summarises). Hypotheses and details are in
the paper draft, §7. Synthetic stimuli with controlled anisotropy plus real OSM
extracts; N from a pilot-based power analysis; pre-registered.

## 7. Papers, venues, order

1. **Flagship — design space + technique + study** (IEEE VIS → TVCG, or
   EuroVis → CGF). Descriptive power: code 40–60 techniques into the seven
   stages, double-coded. Generative power: the gallery. Evaluative power: the
   study. The draft in `../paper/` is this paper, minus the study results and
   the full coding.
2. **The study on its own** (VIS short / EuroVis short) if the flagship slips.
3. **Elasticity as a scale cue** (GIScience, CaGIS) — only after the shape-aware
   reference and envelopes are in, and positioned against Butkiewicz 2010.
4. **JOSS** for the library and solver once the repository is public.

## 8. Before anything is submitted

- [ ] Rename the library (GlyphLens is taken).
- [x] Fix misattributions in references.md (Mota et al.; McNabb & Laramee).
- [x] VisQuill's product URL (`/product/` → `/products`) and a dated addendum to
      F-5: VisQuill *ships* an aggregating map lens, so it is a direct precedent.
- [x] Re-measure F-6 on the bundled extract (the four category means are *not*
      within 20° there; retail 302°, food 329°, health 42°, civic 182°) —
      addendum added; the paper reports the bundled numbers.
- [x] MoleView's author order is Hurter, Ersoy, Telea (several surveys have it
      wrong; the paper's bib has it right).
- [x] Fix the packing thresholds in README / design-space / findings: overlap
      begins above 0.5, gaps close at 1/√3; in between, a field does both.
- [ ] Report elasticity against its true uniform value (2 − b) or switch to a
      centred estimator; add the shape-aware reference and envelopes.
- [ ] Kernels for field mode; show equivalence with GW summary statistics.
- [ ] Solver: prove or test that order-by-preferred-position is optimal for
      unequal widths and weights; replace alternating projection with Dykstra's
      algorithm (or report the gap); intervals.
- [ ] Double-code the corpus for the descriptive table.
- [ ] Make the repository public, or deposit a snapshot with a DOI.
- [ ] Run the study.

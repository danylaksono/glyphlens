# References

Sources behind [design-space.md](design-space.md) and [findings.md](findings.md).
Grouped by the role they play in the design, not alphabetically.

---

## Necklace maps — the placement engine

- **Speckmann, B. & Verbeek, K. (2010). Necklace Maps.** *IEEE TVCG* 16(6),
  881–889. <https://research.tue.nl/en/publications/necklace-maps/>
  The original formulation: project regions onto intervals of a closed curve
  surrounding the map; scale symbols by value; place without overlap inside
  their intervals. This is the source of the interval-based API in
  `src/core/necklace.js`.

- **Speckmann, B. & Verbeek, K. (2015). Algorithms for Necklace Maps.**
  *International Journal of Computational Geometry and Applications* 25(1),
  15–36.
  The algorithmic follow-up: feasibility for a fixed cyclic order, and the
  binary search on symbol scale. Also the origin of the concentric / multiple
  necklace idea used for `placement: 'stacked'`.

- **CartoCrow — Algorithmic Thematic Mapping**, Applied Geometric Algorithms
  Group, TU Eindhoven. <https://algo.win.tue.nl/software/cartocrow/>
  C++ library plus CLI and web frontend; contains the reference necklace map
  implementation alongside flow maps, chorematic maps and isoline
  simplification. Source: <https://github.com/tue-alga>
  Useful as a correctness oracle. No JS port exists, which is why we wrote one.

## Interactive lenses

- **Chen, Z. et al. (2025). Spatially-Embedded Lens Visualization: A Design
  Space.** arXiv:2503.23441. <https://arxiv.org/abs/2503.23441>
  45 papers over 15 years, seven dimensions: *position/orientation/scale*,
  *shape*, *dimensionality*, *effect scope*, *effect imagery*, *effect
  encoding*, *viewpoint dependency*. Two cells we deliberately target:
  **data-driven dynamic shape** (the isochrone lens) and **exterior effect
  scope** (the inside-vs-rest baseline ring). Most of their stated open
  opportunities are 3D/immersive and out of scope here.

- **Tominski, C., Gladisch, S., Kister, U., Dachselt, R. & Schumann, H. (2017).
  Interactive Lenses for Visualization: An Extended Survey.** *Computer Graphics
  Forum* 36(6), 173–200.
  The survey the 2025 design space builds on. Establishes the lens as a general
  interaction primitive across temporal, geospatial, flow, volume, multivariate
  and graph data.

- **Bier, E., Stone, M., Pier, K., Buxton, W. & DeRose, T. (1993). Toolglass and
  Magic Lenses.** SIGGRAPH.
  Origin of the magic lens. Relevant mainly for the interior/exterior effect
  distinction.

## Multivariate cartography — the framing

- **Slingsby, A., Laksono, D. & Jianu, R. (2026). STAR: Multivariate Area-Based
  Statistical Cartography.** (submitted)
  Source of the primary/helper strategy framework and the notation used
  throughout. Companion repository:
  <https://multivariate-cartography.netlify.app/>

- **Laksono, D. (dissertation), Chapter 4 — The Design Space of Multivariate
  Geospatial Visualisation.**
  `D:/Dissertation/dissertation/chapter04.tex`. The framing this library
  extends; also the source of the "helper strategies are where the substantive
  design work happens" argument that motivates making normalisation and
  placement first-class pipeline stages.

- **Laksono, D., Slingsby, A. & Jianu, R. Gridded-glyphmaps for supporting
  Geographic Multicriteria Decision Analysis.**
  <https://openaccess.city.ac.uk/id/eprint/33111/>
  The tessellated limit of the continuum in §4 of the design space.

- **Slingsby, A. (2018, 2023). Tilemaps / Gridded-glyphmaps.**
  `hSpProj` as a response to glyph overlap — the precedent for treating layout
  regularity as a design move rather than an implementation detail.

## Within-unit structure

The lineage behind [design-space §4](design-space.md#4-within-unit-structure--the-maup-channel).
Both of these encode the distribution *inside* a spatial unit rather than only
the summary *of* it, and between them they are the reason that section exists.

- **Trautner, T., Sbardellati, M., Stoppel, S. & Bruckner, S. (2022). Honeycomb
  Plots: Visual Enhancements for Hexagonal Maps.** VMV 2022 (Best Paper).
  <https://vis.uib.no/publications/Trautner-2022-HCP/> ·
  [PDF](https://vis.uib.no/wp-content/papercite-data/pdfs/Trautner-2022-HCP.pdf)

  Three separable techniques, only one of which is within-unit:
  - **Diamond cut** — *the* within-tile encoding. Fits a regression plane to the
    point density inside each hexagon, then cuts a hexagonal pyramid along that
    plane. The glyph leans towards the steepest descent; the narrower and more
    one-sided it becomes, the steeper the internal trend. Their motivating
    observation is ours: a flat tile implies its contents are uniform, and
    "uniform distributions within tiles cannot be distinguished from clusters or
    trends if their numbers of points match."
  - **Amber inclusions** — raw points blended back through the tile via
    Porter–Duff `over`, at an opacity driven by relative density, so sparse
    structure survives aggregation.
  - **Relief mosaic** — ambient occlusion over the value field. A *between*-tile
    cue, not a within-tile one; noted so the three are not conflated.

  Their user study found the diamond-cut metaphor effective for judging
  within-tile trend, which is the closest thing to evidence we have for the
  `gradient` encoding.

- **Kawakami, Y., Yuniar, S. & Ma, K.-L. (2024). HexTiles and Semantic Icons for
  MAUP-Aware Multivariate Geospatial Visualizations.** arXiv:2407.16897.
  <https://arxiv.org/pdf/2407.16897>

  The same move from the statistical side: weighted within-tile variance becomes
  a per-tile **confidence** value, argued explicitly as MAUP mitigation — the
  variability inside a unit is information aggregation destroys, and it belongs
  on the page. Evaluated against square glyphs with a user study plus ecologist
  and hydrologist feedback. The abstract does not give the exact weighting, so
  our implementation uses a normalised within-bin standard deviation and says so.

- **Circular statistics** — Mardia & Jupp, *Directional Statistics* (2000), for
  the resultant length *R* and circular standard deviation `√(−2 ln R)` used as
  the lens's equivalent of diamond-cut steepness.

- **Openshaw, S. (1984). The Modifiable Areal Unit Problem.** CATMOG 38.
  The problem all of the above are responding to.

- **Nusrat, S. & Kobourov, S. (2016). The State of the Art in Cartograms.**
  *Computer Graphics Forum.* Background for `hSpProj`.

- **Ward, M. (2002). A Taxonomy of Glyph Placement Strategies.** *Information
  Visualization* 1(3–4).
  Data-driven vs. structure-driven placement. Necklace placement is a
  structure-driven strategy with a data-driven anchor, which is a combination
  Ward's taxonomy does not cleanly name.

- **Borgo, R. et al. (2013). Glyph-based Visualization.** *Eurographics STAR*;
  and **Fuchs, J. et al. (2017). A Systematic Review of Experimental Studies on
  Data Glyphs.** *IEEE TVCG.*
  Design dimensions and what little empirical evidence exists for glyph
  comparison tasks.

- **Bertin, J. (1967). Sémiologie Graphique.** Visual variables; the reason
  spending angular position on nominal order is a waste.

## Comparison and baselines

- **Gleicher, M. et al. (2011). Visual Comparison for Information
  Visualization.** *Information Visualization* 10(4).
  Juxtapose / superimpose / explicit-encode. `normalisation: 'delta'` is the
  explicit-encode option; the inside-vs-rest ring is superimposition.

- **Location quotient** — standard regional-economics measure; used here as the
  default normalisation for area-based data because it makes small selections
  interpretable against a baseline.

## Prior art we are extending

- **VisQuill.** <https://visquill.com/> · Gallery:
  <https://visquill.com/gallery/>
  A TypeScript "reactive geometry" kit (GDK): declarative constraints over
  points, shapes and values, so geometry/data/interaction stay in sync. Lab
  examples MIT-licensed. Explicitly "not a charting library".
  **Read of the gallery (23 items):** all are
  `pDynamic(pChartEx, hSpSubset) + hAssoc`; variation is in data and in closed
  ring vs. open profile curve. Angular position is nominal throughout — which is
  the gap this library targets.

- **Jankowski, P. et al. / Multivariate Maps — A Glyph-Placement Algorithm to
  Support Multivariate Geospatial Visualization.** *Information* 10(10), 302.
  <https://doi.org/10.3390/info10100302>
  Guided glyph placement with level-of-detail, dynamic zooming and smooth
  transitions. Closest prior art for the tessellated end of the continuum.

- **Ring maps / linked micromaps** — the `pChartEx` precedents named in the STAR
  review; ring maps in particular are `block` placement on a closed curve, i.e.
  the layout we are replacing with `necklace`.

## Data sources for the demo

- **Overture Maps Foundation** — cloud-native GeoParquet, six themes (addresses,
  base, buildings, divisions, places, transportation).
  <https://registry.opendata.aws/overture/> ·
  <https://github.com/OvertureMaps>
- **source.coop** — 60+ GeoParquet datasets, HTTP range-request friendly.
- **Wherobots — Making Overture Maps Data More Efficient With GeoParquet.**
  <https://wherobots.com/blog/overture-maps-data-cloud-native-geoparquet-apache-sedona/>
  Partitioning strategy; relevant to what we can range-request from the browser.
- **Daylight → Overture migration** (Daylight retired Nov 2024); Overture now
  carries the QA'd OSM distribution.
  <https://openstreetmap.us/events/mapping-usa/2025/goodbye-daylight-hello-overture/>
- **Overpass API** — used by the current sketches. Fine for interactive
  prototyping, not for the smooth demo; see
  [findings.md](findings.md#f-3-why-the-sketches-feel-janky).

## Later — area-based statistics

- ONS Open Geography Portal — OA/LSOA/MSOA/LAD boundaries and lookups,
  population-weighted centroids.
- Census 2021 bulk tables; English Indices of Multiple Deprivation; EPC
  Open Data.

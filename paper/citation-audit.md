# Citation audit

The verification record behind `references.bib` and every claim the draft makes
about a source. Keep it with the paper until submission, and re-run it when the
bibliography changes.

## How it was done

1. **Registry record.**
   - Every DOI was resolved against Crossref, or against DataCite for the
     Eurographics (10.2312), Dagstuhl (10.4230) and arXiv (10.48550) DOIs.
   - Bib fields were copied from that record, corrected only where the record is
     known to be wrong. Each correction is noted in a comment above the entry.
2. **Claims.** For each source, the specific things the draft says about it were
   checked against its text, and each claim got an evidence level:
   - **FULLTEXT** — the paper itself was read, either the version of record or an
     author copy, as noted;
   - **ABSTRACT** — only the abstract was read;
   - **METADATA-ONLY** — only the bibliographic record was checked;
   - **SECONDARY** — what another paper, itself read in full, says about this one.
3. **Where claims are recorded.** The per-group notes below give quotes and page
   or section references. The draft's appendix summarises them, and every claim
   resting on less than the full text is marked in the draft with `\doubt{…}`.
4. **Final registry check (2026-09-25).** All 67 DOIs were re-resolved in three
   batch queries (57 Crossref, 10 DataCite), and every registered title matches
   its bib entry. For seven ACM entries Crossref stores only the main title
   ("Halo", "Wedge", "City lights", "JellyLens", "Toolglass and magic lenses",
   "Excentric labeling", "The sampling lens"); the bib adds the subtitle printed
   on the paper.
5. **Entries without a DOI.** There are four, and each has a URL that was loaded:
   - `visquill` — web pages, accessed 2026-09-23;
   - `slingsby2018tilemaps` — City Research Online eprint 20884, a workshop paper
     with no DOI;
   - `openshaw1984maup` — the QMRG CATMOG archive scan;
   - `cartocrow` — the TU Eindhoven project page, accessed 2026-09-25. It
     lists the necklace-map algorithms with their two papers' DOIs, and links
     the source at https://github.com/tue-alga/cartocrow. It names no paper
     for the framework itself.

Some sources were checked and then left out of the bibliography:
- Nusrat & Kobourov 2016, verified (group E2) but not cited;
- Battersby et al. 2011, Zhao et al. 2008 and Jäckle et al. 2016 (Star Glyph
  Insets), whose content could not be checked (group D).

To repeat the checks:

```bash
node paper/scripts/check-bib.mjs            # keys, DOI/URL presence, unused entries
node paper/scripts/check-bib.mjs --online   # + resolve every DOI and compare titles
```

The online mode needs network access to api.crossref.org and api.datacite.org.

## Corrections this audit made to earlier material

- **arXiv 2503.23441.** The authors are Mota, Sharlin & Alim, not "Chen, Z. et
  al." (docs/references.md).
- **Information 10(10):302.** The authors are McNabb & Laramee, not "Jankowski"
  (docs/references.md, findings.md).
- **MoleView.** The author order is Hurter, Ersoy, Telea. Several surveys print it
  wrongly.
- **Butkiewicz et al. 2010.** It explicitly excludes the scale component of MAUP,
  so it is not a precedent for elasticity on the radius control.
- **Tominski et al.** The λ symbol is from the 2017 CGF version, not the 2014 STAR.
- **HexTiles.** It gives no weighting formula, and its 7-person study tested the
  tiles *without* the variance encoding.
- **Honeycomb Plots.** The "uniform distributions … cannot be distinguished"
  sentence is about colour-only hexbins; amber inclusions were not tested.
- **Slingsby 2018.** GW-statistics tilemaps are proposed, not demonstrated.
- **Jäckle et al. 2017.** The 94.4 % preference for orthographic projection comes
  from a rectangular viewport border with 18 participants. The authors note that
  radial projection is the familiar one when there is a point of interest.
- **Speckmann & Verbeek 2015.** Ordering symbols by region bearing is not
  generally optimal for their max-scale objective. That is a warning for the
  solver's sorted-order assumption.

## Closed on 2026-09-25

- **The solver's order assumption.** It is not optimal with unequal widths or
  weights. It is kept as a stated constraint and measured by
  `paper/scripts/solver-check.mjs` (docs/findings.md F-37).
- **CartoCrow.** Now cited by its project page.
- **"No earlier JavaScript implementation."** The claim now records where and
  when we searched (paper §6).

## Still open (as of 2026-09-25)

The group notes below were written while checking was still going on, so some
of them say "pending" or "not yet verified". Where no update follows such a
note, the item is still open. The draft marks each open item with `\doubt{…}`.

- **Brunsdon et al. 1996 and 2002.** Only the abstracts were read; the full
  texts are paywalled. The draft does not say that either paper names a uniform
  (box-car) kernel. The moving-window reading is quoted from Dykes & Brunsdon
  2007 instead.
- **Wallinger et al. 2026.** The participant count (n = 54) comes from arXiv
  v1. On 2026-09-25 the version of record was checked: the DOI resolves in
  Crossref and the TU Wien repository gives its abstract. The abstract confirms
  similar accuracy for both leader types and faster responses with straight
  leaders.
- **Bertini et al. 2009; Krüger et al. 2013; Ma et al. 2020; Scheepens et al.
  2016.** Evidence is at abstract level, and the draft uses them only for what
  their abstracts say.
- **Danyluk et al. 2026.** Only part of the abstract was seen. It is cited as
  an augmented-reality ring map, and for nothing about placement.
- **Off-screen indicators** (Halo, City Lights, EdgeRadar, Wedge, Ambient
  Grids). These rest on registry metadata plus the classification in Jäckle et
  al. 2017, and the draft cites them only as a group.

---

# Group A: citation verification (lens models, design-space methodology, named lenses)

Evidence levels: FULLTEXT (read in the paper itself), ABSTRACT (publisher, PubMed or Europe PMC abstract only), METADATA-ONLY.
"p." means the page of the PDF that was read. For author preprints this can differ from the published page numbers.

Status: all 12 items checked. Nothing is left marked NOT YET CHECKED.

---

## 1. bier1993toolglass
**Metadata:** Crossref `10.1145/166117.166126`. Authors in order: Eric A. Bier, Maureen C. Stone, Ken Pier, William Buxton, Tony D. DeRose. Crossref title "Toolglass and magic lenses", subtitle "the see-through interface". Proc. 20th Annual Conf. on Computer Graphics and Interactive Techniques (SIGGRAPH '93), ACM, pp. 73–80, Sept 1993.
**Full text read:** author PDF (classes.cc.gatech.edu/AY2013/cs4470_fall/readings/magic-lenses.pdf). It is headed "Published as: … Proceedings of Siggraph '93 … pages 73-80".

**Claim: introduces magic lenses as movable see-through filters that change how the objects beneath them are presented. SUPPORTED (FULLTEXT)**
- Abstract, p.1: "These widgets may incorporate visual filters, called Magic Lens filters, that modify the presentation of application objects to reveal hidden information, to enhance data of interest, or to suppress distracting information."
- §1, p.1: "Each lens is a screen region together with an operator, such as 'magnification' or 'render in wireframe,' performed on objects viewed in the region."
- On movability, §1: "The user positions a Toolglass sheet over desired objects and then points through the widgets and lenses."

**Surprises:** Crossref records `is-identical-to 10.1145/3596711.3596719`, which is the 2023 ACM "Seminal Graphics Papers" reprint. Cite the original DOI. The paper also already describes composing lenses by overlapping them (§6 "Composing Widgets and Lenses"; §8 lists general composition as future work).

---

## 2. bier1994taxonomy
**Metadata:** Crossref `10.1145/191666.191786`. Authors: Eric A. Bier, Maureen C. Stone, Ken Fishkin, William Buxton, Thomas Baudel. Proc. SIGCHI Conf. on Human Factors in Computing Systems (CHI '94), ACM, pp. 358–364, 24 Apr 1994.
**Full text read:** author PDF (lri.fr/~mbl/ENS/DEA-IHM/papers/see-through-chi94.pdf). It is headed "Published as: … Proceedings of CHI '94 … pp. 358-364".

**Claim: proposes a taxonomy of see-through tools. SUPPORTED (FULLTEXT)**
- Abstract: "This paper presents a taxonomy of see-through tools that considers variations in each of the steps they perform."
- Table 1, "14 Taxonomy Axes and Typical Values". The 14 axes are grouped under five operational steps:
  - **Trigger:** trigger type.
  - **Action:** input transparency, data direction, data magnitude, application independence, application, operation class, composition (append / prepend / modify).
  - **Appearance:** output transparency, lens presence.
  - **Motion:** moves with.
  - **Instantiation:** customization, persistence, complexity.
- Summary section: "this taxonomy does provide an initial map of the design space for see-through tools."

**Caveat:** this is a taxonomy of see-through tools in general (click-through tools plus Magic Lens filters), not of lenses specifically. "Lens presence" is one of the 14 axes, and the paper says "we discuss filters only briefly in this paper." Do not describe it as a taxonomy of lenses.

**Surprises:** several other DOIs share this title. Do not use them.
- CHI '94 Conference Companion, abstract only: 10.1145/259963.260404, p. 225.
- CHI '95 Companion: 10.1145/223355.223753, pp. 411–412, with a different author list (Bier, Fishkin, Pier, Stone).
- 1995 reprint in *Readings in Human–Computer Interaction*: 10.1016/b978-0-08-051574-8.50054-6, pp. 517–523. Crossref misspells Buxton as "Buxtonf" in this record.

---

## 3. fox1998composing
**Metadata:** Crossref `10.1145/274644.274714`. Author: David Fox. Proc. SIGCHI Conf. on Human Factors in Computing Systems (CHI '98), pp. 519–525, 1998. The byline gives the affiliation as NYU Media Research Lab.
**Full text read:** ACM DL PDF, pp. 1–3 of 7.

**Claim: addresses how overlapping lenses combine their effects. SUPPORTED (FULLTEXT)**
- Abstract: "none of these methods solve the problem of composing lenses in a general way. A method which solves all these problems is described here. By substituting delegation for the more conventional class inheritance, a simple and elegant solution emerges."
- Prior Work: the promise of Magic Lenses is limited by the lack of a basis that "allows the composition of two or more lenses placed on top of one another to perform more complex operations."

**Note:** the contribution is an implementation or programming model (delegation-based lenses in the Tabula Rasa ZUI, built on a CLOS-like object system). It is not a visual or perceptual model of how combined effects should look.

---

## 4. tominski2014star
**Metadata:** DOI `10.2312/eurovisstar.20141172` is registered with **DataCite, not Crossref** (Crossref returns 404). Verified via api.datacite.org.
- Authors: Christian Tominski, Stefan Gladisch, Ulrike Kister, Raimund Dachselt, Heidrun Schumann.
- Title: "A Survey on Interactive Lenses in Visualization".
- Publisher: The Eurographics Association. Container: "EuroVis - STARs", ISBN 978-3-03868-028-4, 2014, 20 pages.
- EG handle: 10.2312/eurovisstar.20141172.043-062, which gives pages 43–62.
- The PDF header reads "Eurographics Conference on Visualization (EuroVis) (2014) STAR – State of The Art Report; R. Borgo, R. Maciejewski, and I. Viola (Editors)".

**Full text read:** the given PDF (mt.inf.tu-dresden.de/cnt/uploads/STARLenses-EuroVis-2014.pdf): §§1–3 and §§5–6, plus the reference appendix.

**(a) Model: selection σ, lens function λ, join ⋈ attached to the visualization pipeline. PARTLY (FULLTEXT)**
- The model itself is present. §2.1, p.3: "a visualization lens can be modeled as an additional lens pipeline that is attached to a standard pipeline… The first is a selection (denoted σ)… The second is a join (denoted ⋈)."
- However, the 2014 STAR does **not** use the symbol λ. It writes "a lens function" (the §2.1 discussion lists "a selection σ, a lens function, and a join ⋈"). The λ notation first appears in the 2017 CGF version. If the draft writes λ, cite tominski2017survey for the notation.

**(b) Selection, function and join can act at different pipeline stages. SUPPORTED (FULLTEXT)**
- §2.1: "The visualization pipeline describes how data is transformed from a data source (DS) via data tables (DT) and visual abstractions (VA) to a visualization view (V)."
- §2.1 Discussion: "all these operations can be carried out at different stages of the visualization pipeline."
- The first stage is named "data source (DS)", not "data".

**(c) Lenses classified by data type and by user task. SUPPORTED (FULLTEXT)**
- §3.1, p.7: data types are temporal, geo-spatial, volume, flow, "multidimensional and multivariate", graph, "text and document".
- §3.2, p.8: tasks follow Yi et al.'s seven intents: select, explore, reconfigure, encode, abstract/elaborate, filter, connect.
- Table 1 (p.9) cross-classifies 40+ techniques by data type and task. §1 states the data set is "inspired by Shneiderman's taxonomy".

**(d) Open challenges. Section 5 "Directions for Future Work" (pp.13–14) has exactly four headings (FULLTEXT):**
1. **Lenses and Interaction.** Quotes Maureen Stone on the need to "Position the lens, work through the lens, and (possibly) parameterize the lens", then adds "the need to flexibly combine lenses to create new lens functions on the fly."
2. **Lenses in Novel Visualization Environments.** Covers touch, gaze, and large or multi-display setups; collaborative multi-user lenses; private and shared lenses; "combining individual lenses to a greater whole".
3. **Lenses for Exploration and Manipulation.** Covers data editing (EditLens) and insert/update/delete operations.
4. **Lenses as Universal Tools.** "wide adoption of lens approaches is currently hindered by the lack of a unified toolkit"; goals are "implement-once-and-reuse-many-times" development and "lenses as a service".

How the four candidate topics map onto these headings:
- **Composition / combination: YES.** In §5 under Lenses and Interaction and Novel Environments. Also §2.1: combining lens functions "remains a challenge to be addressed in the future as discussed in Section 5" (cites Fox98).
- **Data-driven / adaptive lenses: NO.** Not a future direction. Self-adapting lenses (smart lenses, JellyLens) appear only as existing work in §2.2 "Shape".
- **Authoring / toolkits: YES for toolkits** (Lenses as Universal Tools). Authoring is not named as such; the closest wording is "making lenses easy to apply and customize".
- **Evaluation: NO.** Evaluation or user studies of lenses is not among the §5 directions.

**(e) Effects shown outside the lens. SUPPORTED (FULLTEXT)**
- §2: "A lens might affect the visualization beyond the confines of the spatial selection or even show spatial selection and effect separately."
- §2.1: joins at early pipeline stages "can have side effects on the base visualization" (Layout Lens). "In a most relaxed sense of a lens, the result of the lens function can even be shown separately" (Time lens, Fig. 6b).
- In 2014 this is discussion only. There is no named "effect extent" category yet.

---

## 5. tominski2017survey
**Metadata:** Crossref `10.1111/cgf.12871`.
- Authors: Tominski, Gladisch, Kister, Dachselt, Schumann. Crossref gives initials only; the .bib uses full given names from the DataCite record of the 2014 STAR by the same team.
- Computer Graphics Forum 36(6):173–200.
- Published online 18 May 2016 (Crossref `issued` = 2016-05-18). Print issue September 2017.

**Full text read:** author preprint (vca.informatik.uni-rostock.de/~ct/publications/Tominski17LensesExtended.pdf). It is marked "This is a PREPRINT. The DEFINITE version is available at https://doi.org/10.1111/cgf.12871". Page numbers below are preprint pages 1–28, not CGF pages 173–200.

**(a) σ / λ / ⋈ model. SUPPORTED (FULLTEXT)**
- Fig. 4 caption, p.4: "A lens pipeline implements a lens function λ to generate a lens affect. The lens pipeline is attached to a standard visualization pipeline via a selection σ and join ⋈." ("affect" is sic in the original.)

**(b) Pipeline stages. SUPPORTED (FULLTEXT)**
- §2.3 "Stages of Selection and Join": "The selection and join may gather input and return output at any stage. The lens function may generate the lens effect by implementing any subset of the pipeline."
- The stages are DS, DT, VA and V.

**(c) Data types and tasks. SUPPORTED (FULLTEXT)**
- §3.1, p.8: temporal, geospatial, flow, volume, multivariate, graph, text and document data.
- §3.2: Yi et al.'s seven intents.
- Table 3 "Practical" block: data type, user task, display setting, interaction modality.

**(d) Open challenges. Section 7 "Future Directions" (p.19) has the same four headings as 2014 (FULLTEXT):** Lenses and Interaction; Lenses in Novel Visualization Environments; Lenses for Exploration and Manipulation; Lenses as Universal Tools. The text is almost unchanged.
- **Composition: YES.** Same "flexibly combine lenses … on the fly" sentence. §2.3 "Combining Lenses" also says flexibly combining arbitrary lenses "is considerably more difficult [Fox98]… remains a challenge to be addressed in the future as discussed in Section 7."
- **Toolkits: YES.** Same "lack of a unified toolkit" text.
- **Data-driven / adaptive lenses: NO** as a future direction. §5 does call self-adjusting lenses "Quite intriguing from a research perspective", and "Adjustability: none, interactive, self-adjusting" is a taxonomy category.
- **Evaluation: NO.** Not a §7 direction.
- One small future task outside §7, from §6: "It remains a task for future work to create such profiles for all lenses in existence."

**(e) Effects outside the lens, and the "effect extent" schema. SUPPORTED (FULLTEXT)**
- Table 3 (p.16), "Conceptual" block: "Effect extent: Lens interior, side effects, separate view".
- §5: "the peculiarity of lenses for visualization to show the lens effect beyond the lens interior. This is captured in the new Effect extent category."
- The full conceptual block is: effect class (suppress, alter, enrich); effect extent; adjustability (none, interactive, self-adjusting); selection σ stage (DS, DT, VA, V); join ⋈ stage (DS, DT, VA, V).
- §2.3 "Lens Interior, Exterior, and Border" discusses the three display regions.
- This confirms what Mota et al. report: their Table 1 calls it Tominski et al.'s "five-axis conceptual schema".

**Other notes:**
- Table 2 reproduces Bier et al.'s 14 axes.
- §5 says the Effect class category "is a refinement of Bier et al.'s Operation class".
- The appendix glosses Fox98 as "A generic model for composing multiple lens functions via delegation, rather than inheritance."

---

## 6. mota2025design
**Metadata:** arXiv abs page loaded. arXiv:2503.23441 [cs.GR]; v1 30 Mar 2025, v2 6 Jun 2025. Authors: Roberta Mota, Ehud Sharlin, Usman Alim (all University of Calgary). arXiv DOI 10.48550/arXiv.2503.23441. License CC BY 4.0.
**Full text read:** v2, via alphaXiv.

**Published version: NONE FOUND as of 2026-09-23.** Four checks:
1. The arXiv abs page has no journal-ref and no DOI link.
2. Crossref `query.bibliographic` (title plus authors) and `query.title` + `query.author=Mota` return no matching record.
3. Semantic Scholar (arXiv:2503.23441) lists the venue only as arXiv (DBLP journals/corr/abs-2503-23441).
4. A web search found only arXiv copies.

The v2 PDF uses the IEEE TVCG template with placeholder fields ("Digital Object Identifier: xx.xxxx/TVCG.201x.xxxxxxx"), so it was probably prepared for TVCG, but no published DOI exists. **Cite it as the arXiv preprint.**

Do not confuse it with a different paper by the same group: Mota, Silva, Miranda, Alim, Sharlin, Ferreira, "Occlusion-Free Conformal Lensing for Spatiotemporal Visualization in 3D Urban Analytics", IEEE TVCG 32(5):4174–4184, 2026, doi 10.1109/TVCG.2026.3679888 (Crossref).

**(a) Seven dimensions. SUPPORTED (FULLTEXT)**
- Table 1 (p.2) lists: Pos, Ori & Scale (interactive, semi-automated); Shape (fixed, user- or data-driven dynamic); Dimensionality (2D, 2.5D, 3D); Effect Scope (interior, exterior, separate view); Effect Imagery (2D, 3D, Decal); Effect Encoding (thematic, spatially-based); Viewpoint Dependency (invariant, view-dependent).
- Caption: "Our design space comprises seven dimensions (bottom) and expands upon Tominski et al.'s five-axis conceptual schema [57] (top)."

**(b) Effect scope values. SUPPORTED (FULLTEXT)**
- §3.4: "The lens effect scope refers to the area within the visualization where the lens applies its effect, which can be classified as lens interior, lens exterior, or separate view."
- §3: Effect Scope "is a refinement of the Effect Extent class from the previous conceptual schema".

**(c) Effect encoding. SUPPORTED (FULLTEXT)**
- §3.6: "The lens effect enconding can be classified either as thematic or spatially-based" ("enconding" is sic).
- Thematic "draws from information visualization and refers to abstract representations". Spatially-based "draws from scientific visualization and concerns physically-based data representations".

**(d) Corpus. SUPPORTED (FULLTEXT)**
- §3 criteria: "C1. Papers published in the past 15 years, from 2006 to 2020."
- Methodology: "we used a snowball sampling technique starting with the seminal paper by Bier et al. [8]… we stopped… once this process reached saturation". "derived our design space through open coding, based on consensus among all authors."
- 45 papers (Abstract; Fig. 4).
- Oddity: the text says "three inclusion criteria" but lists C1–C4.

**(e) Section 5 "Discussion, Research Directions & Limitations": understudied regions (FULLTEXT, pp.7–8)**
- **Position, Orientation & Scale.** 35/45 papers are fully interactive. 9 of 10 semi-automated techniques are 2D or conventional. Opportunities: assisted placement for immersive or 3D lenses, and "novel semi-automated 3D spatial layouts" for cascaded separate views.
- **Shape.** 34/45 are fixed-shape. Dynamic user- or data-driven shapes are "a widely underexplored area (3 papers)". The call is for lenses whose shape "dynamically adapts to the geometry or data of interest", with continuity from focus to context.
- **Effect Imagery.** 42/45 use 2D images, 3 use 3D, 2 use decal. Opportunities: "3D images with distinctive visual abstraction or interaction idioms", and "combining different categories of lens images (2 out of 45 papers)" for multi-geometry data.
- **Viewpoint Dependency.** Only 4 papers are view-responsive. Opportunities: view-sensitive designs that adapt emphasis, effect and function; immersive lenses "situated outside users' personal space"; perspective-sensitive lenses for shared or collaborative work.
- **Limitations.** The paper says it is "not a comprehensive literature survey" and that the corpus was built by manual search and annotation.
- Effect Scope, Effect Encoding and Dimensionality have **no** Section 5 paragraph.
- Related gap stated elsewhere: §4 says the generative use case "was motivated by the observed scarcity of research on composite lenses", and §4 is called a demonstration of "descriptive and generative utility".

**Surprise:** the paper spells Tominski as "Tominsky" once (§3).

---

## 7. dai2026mapping
**Metadata:** Crossref `10.1109/TVCG.2026.3675300`, confirmed.
- **Authors confirmed:** Zichun Dai, Yechun Peng, Nan Cao, Yang Shi (Tongji University).
- IEEE TVCG 32(7):5895–5910, July 2026. The Crossref record was created 18 Mar 2026 (early access).
- Europe PMC (PMID 41849163) agrees and marks it "Subscription required", not open access.

**Full text: CANNOT ACCESS.** IEEE Xplore blocks with a bot check, and no preprint (arXiv, OSF or author page) was found.

What the abstract supports (ABSTRACT):
- They reviewed visualization design-space research, "identifying three distinct research threads".
- They refined the corpus to "49 papers".
- They "proposed a systematic approach to design space construction, synthesized from an analysis of practices spanning five phases: exploration, data collection, creation, evaluation, and communication."

**Claims:**
- **Phases: SUPPORTED (ABSTRACT).** The five phases above.
- **What it recommends for validating or evaluating a design space, and how prior papers show descriptive / generative / evaluative power: CANNOT ACCESS.** The abstract names an "evaluation" phase but gives no content.
- **Corpus coding practices such as multiple coders: CANNOT ACCESS.**
- METADATA-ONLY hint, which is not evidence of content: the Crossref reference list includes Beaudouin-Lafon 2004 (10.1145/989863.989865), Braun & Clarke thematic analysis (10.1191/1478088706qp0630a), PRISMA 2020 (10.1136/BMJ.N71) and McNabb & Laramee's survey guide. The paper is therefore likely to discuss these, but no claim about its content can be verified.

---

## 8. beaudouinlafon2004designing
**Metadata:** Crossref `10.1145/989863.989865`. Michel Beaudouin-Lafon (Université Paris-Sud). Proc. Working Conf. on Advanced Visual Interfaces (AVI '04), Gallipoli, Italy, pp. 15–22, 25 May 2004.
**Full text read:** PDF at iihm.imag.fr/blanch/…/2004-BeaudouinLafon-InteractionNotInterfaces.pdf. The page footers are 15–22, matching the proceedings.

**Claim: an interaction model should be evaluated by its descriptive, evaluative and generative power. SUPPORTED (FULLTEXT, §2.2, p.17)**
- "Interaction models can be evaluated along three dimensions: 1) descriptive power: the ability to describe a significant range of existing interfaces; 2) evaluative power: the ability to help assess multiple design alternatives; and 3) generative power: the ability to help designers create new designs."
- Also §3: "Taxonomies are useful for cataloguing existing techniques, identifying gaps and looking for possible new candidates." This is relevant if the draft applies the three criteria to a design space or taxonomy.

---

## 9. ledo2018toolkits
**Metadata:** Crossref `10.1145/3173574.3173610`. Authors: David Ledo, Steven Houben, Jo Vermeulen, Nicolai Marquardt, Lora Oehlberg, Saul Greenberg. Proc. 2018 CHI Conf. on Human Factors in Computing Systems (CHI '18), pp. 1–17, 19 Apr 2018.
- The author PDF says "Paper 36, 17 pages". The first three authors "contributed equally".

**Full text read:** UCL Discovery PDF (discovery.ucl.ac.uk/10053385/1/pn1203-ledo-2.pdf).

**Claim: names evaluation strategies for toolkits. SUPPORTED (FULLTEXT)**
- Intro: "Based on an analysis of 68 representative toolkit papers… We identify four types of evaluation strategies: (1) demonstration, (2) usage, (3) technical benchmarks, and (4) heuristics."
- The section headings name them TYPE 1 DEMONSTRATION, TYPE 2 USAGE, TYPE 3 TECHNICAL PERFORMANCE and TYPE 4 HEURISTICS. The Discussion summarises them as demonstrations (what a toolkit can do), usage (who can use it and how), technical evaluations (how well it performs) and heuristics (how far it meets standard guidelines).
- Techniques mentioned in the parts read:
  - Demonstration: individual instances, collections as case studies or design-space explorations, code snippets and how-to scenarios.
  - Usage: usability studies, walkthroughs, interviews, "take home" studies.
  - Technical: "Benchmarking Against Thresholds" and "Benchmarking Against State-of-the-Art".
  - Heuristics: "checklists, discussion, and as a basis for usage studies". The heuristic sets used are Olsen's and Blackwell & Green's Cognitive Dimensions.
- Useful detail: "66 out of 68 papers used demonstrations". Demonstrations may be a design space exploration "which enumerates design possibilities… and gives examples from different points in that space."

---

## 10. tong2017glyphlens
**Metadata:** Crossref `10.1109/TVCG.2016.2599049`. Authors: Xin Tong, Cheng Li, Han-Wei Shen. IEEE TVCG 23(1):891–900, Jan 2017 (online Aug 2016; IEEE VIS 2016 issue). Europe PMC / PubMed 27875203 agrees.

**Full text: not accessed** (IEEE paywall). Abstract read via Europe PMC.

**Claim: a lens for 3D glyph visualizations that manages occlusion by removing or displacing occluding glyphs. SUPPORTED (ABSTRACT)**
- "we propose a view-dependent interactive 3D lens that removes the occluding glyphs by pulling the glyphs aside through the animation. We provide two space deformation models and two lens shape models to displace the glyphs based on their spatial distributions."
- Also: "we attenuate the brightness of the glyphs inside the lens based on their depths to provide more depth cue."
- "Removes" in the abstract means displacement, not deletion. The glyphs are "pulled aside" and "are still visible as the context information".

---

## 11. hurter2011moleview
**Metadata:** Crossref `10.1109/TVCG.2011.223`. IEEE TVCG 17(12):2600–2609, Dec 2011.
- **Author order is Christophe Hurter, Ozan Ersoy, Alexandru Telea.** Three sources agree: the PDF byline, Crossref (C. Hurter, O. Ersoy, Alexandru Telea) and Hurter's project page.
- **The draft's order (Hurter, Telea, Ersoy) is WRONG.** The same wrong order appears in the reference lists of Tominski 2014/2017 and Mota 2025, so it has propagated.

**Full text read:** author PDF (recherche.enac.fr/~hurter/MoleView/MoleViewInfoVis2011.pdf), pp. 1–3 of 10.

**Claim: a semantic lens that moves or filters elements inside it based on attributes. SUPPORTED, with a wording caveat (FULLTEXT)**
- Abstract: "we propose a semantic lens which selects a specific spatial and attribute-related data range. The lens keeps the selected data in focus unchanged and continuously deforms the data out of the selection range".
- Intro: "Instead of hiding the elements in the lens which fail passing the attribute filter, we use a dynamic re-layouting technique to smoothly push these away from the lens".
- Caveat: elements are filtered by attribute range and then **moved** toward the lens periphery, not hidden. Say "moves" or "pushes aside" rather than "filters out".

---

## 12. pindat2012jellylens
**Metadata:** Crossref `10.1145/2380116.2380150`. Crossref title "JellyLens", subtitle "content-aware adaptive lenses". Authors: Cyprien Pindat, Emmanuel Pietriga, Olivier Chapuis, Claude Puech. Proc. 25th Annual ACM Symp. on User Interface Software and Technology (UIST '12), Cambridge, MA, pp. 261–270, Oct 2012.
**Full text read:** ACM DL PDF, pp. 1–2 of 10.

**Claim: the lens shape adapts to the content (the geometry of features) under it. SUPPORTED (FULLTEXT)**
- Abstract: "JellyLenses dynamically adapt to the shape of the objects of interest, providing detail-in-context visualizations of higher relevance by optimizing what regions fall into the focus, context and spatially-distorted transition regions."
- Intro: techniques "that dynamically adapt to the geometry of object(s) of interest". There are two variants: PathLens and AreaLens.
- It is a magnification (distortion) lens, and the paper includes a controlled experiment against fisheye lenses.

---

## Summary of problems
- **hurter2011moleview:** author order in the draft is wrong. The correct order is Hurter, Ersoy, Telea (fixed in A.bib).
- **tominski2014star (a):** the λ symbol is not in the 2014 STAR (PARTLY). The model is the same; cite 2017 for the notation.
- **tominski2014star and 2017 (d):** neither survey lists data-driven or adaptive lenses or evaluation as future directions. Composition and toolkits are listed.
- **dai2026mapping:** full text is not accessible. Only the five-phase claim is verifiable (ABSTRACT). Recommendations on evaluation or validation, use of descriptive/generative/evaluative power, and multiple coders are CANNOT ACCESS.
- **tong2017glyphlens:** verified at ABSTRACT level only.
- **mota2025design:** no peer-reviewed version found (arXiv, Crossref and Semantic Scholar checked); cite it as the arXiv preprint.
- **bier1994taxonomy:** it is a taxonomy of see-through tools, not of lenses. Beware the look-alike DOIs (CHI '94 companion abstract, CHI '95 companion, 1995 Readings reprint).


---

# Group B: citation and claim verification (lenses and probes on maps that aggregate or summarise)

Verified 2026-09-23. Crossref JSON was fetched via Firecrawl from `api.crossref.org/works/<DOI>`. Full text was read with alphaXiv's PDF/page reader, or with Firecrawl for the ACM HTML. Quotes are verbatim from the source named on each line.

Evidence levels: **FULLTEXT** (I read the paper), **ABSTRACT** (Crossref abstract only), **METADATA-ONLY**.

---

## 1. `butkiewicz2008probes`

**Metadata.** Crossref, DOI 10.1109/TVCG.2008.149: TVCG 14(6):1165–1172, Nov 2008. Crossref lists the authors by initials only (T. Butkiewicz, W. Dou, Z. Wartell, W. Ribarsky, R. Chang). I took the full given names from the title page of the author PDF: Thomas Butkiewicz, Wenwen Dou, Zachary Wartell, William Ribarsky, Remco Chang.

**Full text.** https://www.cs.tufts.edu/~remco/publications/2008/InfoVis-ProbeVis08Final.pdf (final InfoVis version, with the TVCG header).

| Claim | Verdict | Evidence |
|---|---|---|
| (a) Users place multiple probes (circular or arbitrary regions) on a map | SUPPORTED, FULLTEXT | §5.2: "circular regions can be generated from a focal point and an extent, irregular regions can be selected manually unit-by-unit, etc." §3 (probe creation): "specifying a central focal point and extent radius, or through manual selection for irregularly shaped regions". The system is also shown in 3D GIS and 3D urban views, not only 2D maps. |
| (b) Each probe shows local charts/statistics of the data inside it | SUPPORTED, FULLTEXT | §4.1: "Within the probe interface is the heat map visualization, now showing the distribution of only those changes within the region-of-interest." Other examples are parallel coordinates and a time-series of faction populations (Figs. 8–9). Probe panes can also hold local sliders (Fig. 8). |
| (c) Probes support comparing regions | SUPPORTED, FULLTEXT | §4.3/Fig. 9: "a comparison pane can be created between two existing probes … the user has selected a 'union' operation, combining the two selected regions into a single view". Panes can also be placed side by side (§4.1). |
| (d) Where the probe's views are displayed | The view is a **separate, user-positioned pane overlaid on the map, linked to its region by a line or a shared colour**. It is not inside the region and not attached around its boundary. FULLTEXT | §3: "We define a probe as a pair consisting of a user-defined region-of-interest and a pane containing any variety of information visualizations … linked either directly (e.g. by a line) or indirectly (e.g. the region-of-interest and the pane's background are shaded the same color)." Also: the user "chooses a location for the visualization pane to be overlaid directly within the main geospatial visualization." §4.2 (UrbanVis): "information panels can be moved around directly on the 3D model view but are always connected to the yellow spheres by a (white) line". **No angular or radial layout; nothing encodes direction.** |

**Surprises**
- The paper itself raises MAUP as a caveat in §6. This motivates item 2.
- Panes can be shrunk until they "act like glyphs … an aggregated, high-level overview" and "resemble 'flags' stuck in the map" (§4.2, Fig. 5). This is the nearest the paper comes to an in-place glyph, and it still sits in a pane, not on the region.
- TrajectoryLenses (item 3) independently describes this work this way: "Butkiewicz et al [BDW*08] … display additional data about the focus in an adjacent panel."

---

## 2. `butkiewicz2010maup`

**Metadata.** Crossref, DOI 10.1111/j.1467-8659.2009.01707.x. Authors in order: **Thomas Butkiewicz, Ross K. Meentemeyer, Douglas A. Shoemaker, Remco Chang, Zachary Wartell, William Ribarsky.** The draft's author list with a question mark is correct. CGF 29(3):923–932. Crossref gives issue date June 2010 and online date 12 Aug 2010. The "2009" in the DOI does not mean it is a 2009 paper.

**Full text.** https://www.cs.tufts.edu/~remco/publications/2010/Eurovis-MAUP.pdf. **Caveat:** this is the anonymised EuroVis *submission* ("Submission # 324"), not the published version, so wording may differ. The reader tool did not return PDF page 7.

| Claim | Verdict | Evidence |
|---|---|---|
| (a) Addresses MAUP in probe-based analysis | SUPPORTED, FULLTEXT | Abstract: "the classic geospatial analytic issue known as the modifiable areal unit problem (MAUP) quickly arises … To alleviate this problem, our interface first alerts the user if it detects any potential unfairness between regions when they are selected for comparison." |
| (b) HOW | SUPPORTED as follows, FULLTEXT. It does **not** show how statistics vary with probe size, shape or position, and it offers **no** alternative aggregations. | **Trigger:** the check runs only when a *comparison interface* is created from several regions. Each dimension gets a mean and SD across the compared regions; a region more than 2 SD from the mean is an outlier (§4.1). **Alert:** "we alert the user by displaying a large flashing exclamation mark on that comparison window's toolbar" (§3.3). **MAUP overview panel:** one 1-D plot per dimension spanning mean ±3 SD, one colour-coded line per region, outliers flagged yellow (§3.4). **MAUP adjustment panel:** the user sets target min/max bounds (§3.5). **Semi-automatic boundary edits:** "Add area" / "Remove area" for categorical land-cover types, "Grow / Shrink regions", and "Trade area" for space-filling regions (§3.5). The paper addresses only the *aggregation* component of MAUP. |
| (c) Shows sensitivity of an aggregate to probe radius/size, on or near the resize control | **NOT SUPPORTED**, FULLTEXT | The scale component is explicitly excluded (§2): "We do not address this component in our system". Splitting and combining regions is left to future work (§5). The indicators are in the comparison window's toolbar and in panels that replace it: "From within a comparison interface, pressing the MAUP interface icon switches the interface to the MAUP overview panel." (§3.4). **Nothing is placed on or near any resize handle.** The closest feature is automatic grow/shrink of boundaries to hit a target value. That changes the region; it does not visualise sensitivity. |

**Surprise.** The MAUP concern is framed as fairness *between compared regions*. The paper never examines the stability of one probe's aggregate as the probe changes. A precedent claim of the "sensitivity shown at the resize control" kind would be wrong.

---

## 3. `kruger2013trajectorylenses`

**Metadata.** Crossref, DOI 10.1111/cgf.12132: Robert Krüger, Dennis Thom, Michael Wörner, Harald Bosch, Thomas Ertl. CGF 32(3pt4):451–460, June 2013. Scite shows the first author as "Robert A. Kruger"; I used the Crossref form.

**Full text: CANNOT ACCESS.** Scite pointed to an open copy at Zenodo record 3436246, which now returns HTTP 410 (tombstone). Wiley is paywalled, and a Firecrawl PDF search found no other open copy. The evidence is therefore the Crossref abstract plus Scite "smart citation" snippets. Those snippets are verbatim sentences from this paper's own related-work section, so they are full-text excerpts, but I could not see any figures.

| Claim | Verdict | Evidence |
|---|---|---|
| (a) Lenses act as filters (origin/destination/waypoint) | PARTLY, ABSTRACT | "Analysts might be interested only in movements that occur in a given time range, traverse a certain region, or end at a given area of interest (AOI). Our lenses can be placed on an interactive map to identify such geospatial AOIs." Separate named origin, destination and waypoint lens types are **not verified**. |
| (b) Filters combined with Boolean/set operations | SUPPORTED, ABSTRACT plus excerpt | Abstract: "They can be grouped with set operations to create powerful geospatial queries." Related-work excerpt: "the explicit grouping of lenses additionally allows the disjunction of filters." |
| (c) Aggregated attribute displays attached to or near the lenses: where? | PARTLY, ABSTRACT plus excerpt | Abstract: "For each group of lenses, users can access aggregated data for different attributes like the number of matching movements, covered time, or vehicle performance." Excerpt: "Our approach employs a similar method to show information in the vicinity of the lens or adjacent colour-matching panels." So the displays are near the lens **or** in adjacent colour-matched panels. Temporal histograms specifically, the exact attachment, and any angular layout are **unverified**. |

---

## 4. `ma2020gtmaplens`

**Metadata.** Crossref, DOI 10.1111/cgf.13995: Chao Ma, Ye Zhao, Shamal AL-Dohuki (Crossref capitalises it this way), Jing Yang, Xinyue Ye, Farah Kamw, Md Amiruzzaman. CGF 39(3):469–481, June 2020.

**Full text: CANNOT ACCESS.** Wiley is closed access (Scite: "closed"). The Wiley accepted-manuscript PDF would not fetch, and I found no open copy.

| Claim | Verdict | Evidence |
|---|---|---|
| A movable map lens that summarises geo-tagged text | SUPPORTED (movable lens for browsing geo-text), ABSTRACT | "a lens-based visual interaction technique, GTMapLens, to flexibly browse the geo-text data on a map. It allows users to perform dynamic focus+context exploration by using movable lenses to browse geographical regions, find locations of interest, and perform comparative and drill-down studies." The features named are "keywords control, path management, context visualization, and snapshot anchors". |
| What is shown, and where | **CANNOT ACCESS** | Not stated in the abstract. |

**Lead to check (not verified).** The Crossref reference list shows the paper cites Fekete & Plaisant, "Excentric Labeling" (the reference string ends with page marker 6). That hints at labels laid out around the lens. Check the full text before relying on it.

---

## 5. `zhang2020clusterlens`

**Metadata.** Crossref, DOI 10.1145/3334480.3382803: Chong Zhang, Richie Carmichael, Zhengcong Yin, Xi Gong. *Extended Abstracts of the 2020 CHI Conference on Human Factors in Computing Systems*, ACM, pp. 1–8, 25 Apr 2020. The ACM HTML "Reference Format" line says "9 Pages", while Crossref says 1–8. Crossref records no article number.

**Full text.** https://dl.acm.org/doi/fullHtml/10.1145/3334480.3382803, read with Firecrawl.

| Claim | Verdict | Evidence |
|---|---|---|
| Inside the lens, points are re-aggregated at a different resolution or representation | SUPPORTED, FULLTEXT | Abstract: "The lens can aggregate the data points at various spatial resolutions as map zoom level changes. We propose three primitives of resolution for spatial clustering: heatmap, circle, and grid, to generate and represent clusters in a separate mapping system." Body: "Users can change the lens resolution to the next finer level with a single click." |

**What is shown, and where.** The clusters appear inside the lens, which holds its own "LensMap" that can carry extra layers. The base map outside keeps the raw points: "the context still retains the original and the actual point locations". Saved lenses go to a separate bottom panel: "Double-clicking lens will save the current focus area along with its context map to the bottom panel (the LensBar)". Resolution is chosen from zoom level through a "predefined resolution table". There are no charts, no ring, and no angular layout. Only one live lens is supported; multiple lenses are listed as future work.

---

## 6. `karnick2010route`

**Metadata.** Crossref, DOI 10.1109/TVCG.2009.65: TVCG 16(2):235–247, Mar 2010. Crossref gives initials only; full names come from the preprint: Pushpak Karnick, David Cline, Stefan Jeschke, Anshuman Razdan, Peter Wonka.

**Full text.** Author preprint at http://peterwonka.net/Publications/pdfs/2009.TVCG.Karnick.RouteVisualizationUsingDetailLenses.PreprintJune09.pdf (preprint dated June 2009; may differ from the published version).

| Claim | Verdict | Evidence |
|---|---|---|
| Detail views of route parts are placed around the overview by an optimisation that avoids occluding the route and keeps them near their referents | PARTLY, FULLTEXT. **Placement is restricted to the map border**; it is not free placement near each point of interest. | §6: "we restrict lens placements to be on the map border. Furthermore, we place the lenses 'in order' either clockwise or counter-clockwise around the border". §5.1: "We address rule 3 by placing the lenses along the border of the page … and address rule 2 by rescaling the route to fit within the border region defined by the lenses." The cost function is α·lens distance + β·spatial coherency + γ·visual coherency. It is optimised by backtracking over discrete border slots, then relaxation. Defaults: α=0.75, β=0.15, γ=0.1. |
| How lenses are connected to their referents (leaders?) | PARTLY: leaders are used **only for the first and last lens**, FULLTEXT | §6.5: "we add leader lines only to the first and last lens on each page, or each group of lenses if the layout engine splits the lens order. The remaining leader lines are replaced by arrows between the lenses". Each lens also carries a point-of-interest number. In the user study, participants preferred first/last leaders over all leaders. |

**Surprises**
- The layout has a real directional component. The "visual coherency" metric requires that "the vector between L_i and L_i+1 should match the vector between P_i and P_i+1". The lens sequence around the frame therefore approximately preserves the direction between consecutive points of interest.
- This is a static, printable route map. The lenses show map close-ups with abbreviated directions, not aggregated charts.

---

## 7. `ellis2005sampling`

**Metadata.** Crossref, DOI 10.1145/1056808.1056914. Crossref title is "The sampling lens" with subtitle "making sense of saturated visualisations". Geoffrey Ellis, Enrico Bertini, Alan Dix. CHI '05 Extended Abstracts, ACM, pp. 1351–1354, 2 Apr 2005.

**Full text.** https://eprints.lancs.ac.uk/id/eprint/12648/1/CHI'05_sampling_lens.pdf

| Claim | Verdict | Evidence |
|---|---|---|
| The lens shows a random sample of the points within it to reduce clutter | SUPPORTED, FULLTEXT | Abstract: "the Sampling Lens, a novel tool that utilises random sampling to reduce the clutter within a moveable region, thus allowing the user to uncover any potentially interesting patterns … while still being able to view the sample in context." The controls are a diameter slider, a sampling-rate slider or auto-sampling, and a "reality check" button that draws a new sample. |

**Surprises**
- It is applied to scatterplots and parallel coordinates, **not maps**.
- The authors list aggregates as future work: "we plan to add more functions to the lens, such as display aggregated statistics."
- The lens "can also provide a visual indication of the proportion of different attribute values within it."

---

## 8. `scheepens2016traffic`

**Metadata.** DOI found: **10.1109/TVCG.2015.2467112**. Crossref: Roeland Scheepens, Christophe Hurter, Huub van de Wetering, Jarke J. van Wijk. TVCG 22(1):379–388, issued 31 Jan 2016 (InfoVis 2015). Crossref capitalises the surnames as "Van De Wetering" and "Van Wijk"; the bib uses the Dutch "van de Wetering" and "van Wijk", as on the TU/e portal.

**Full text: CANNOT ACCESS.** IEEE is paywalled, and the author page recherche.enac.fr is blocked by the network policy. I read the abstract from Crossref and the TU/e research portal.

| Claim | Verdict | Evidence |
|---|---|---|
| A lens selects flows by position and direction | SUPPORTED, ABSTRACT | "a novel selection widget that allows for the intuitive selection of an area, and filtering on a range of directions and any additional attributes." The abstract calls it a "selection widget", not a lens; whether the paper calls it a lens is unverified. |
| Composable selections | SUPPORTED, ABSTRACT | "Using simple, visual set expressions, the user can construct more complicated selections." |
| Thematic views of selected flows | SUPPORTED, ABSTRACT | "The dynamic behaviors of selected flows may then be shown in annotation windows in which they can be interactively explored and compared." Where these windows sit relative to the widget is **unverified**. |

---

## 9. `tominski2012stacking`

**Metadata.** DOI found: **10.1109/TVCG.2012.265**. Crossref: Christian Tominski, Heidrun Schumann, Gennady Andrienko, Natalia Andrienko. TVCG 18(12):2565–2574, Dec 2012.

**Full text.** Author copy at https://vca.informatik.uni-rostock.de/~ct/publications/Tominski12TrajectoryVis.pdf

| Claim | Verdict | Evidence |
|---|---|---|
| Includes a circular lens over the map showing a thematic, temporally aggregated view of trajectories | SUPPORTED, FULLTEXT | §3.3.1: "we developed the time lens (see Fig. 5), which shows temporally aggregated information for an interactively defined spatial query area. The time lens is a circular display … that consists of two basic components: (1) the lens interior for showing spatial aspects and (2) the lens ring for visualizing temporal aspects." |
| What is shown | FULLTEXT | **Interior:** the trajectory points inside the query circle, drawn as dots coloured by attribute value, "embedded into the time lens according to their spatial layout". **Ring:** "segmented into time bins based on the data's time model" (for example 12 months, 7 weekdays, or 24 hours). Each bin's fill level shows count, total duration or average duration of the trajectories intersecting the query, plus the distribution of attribute values in that bin. Optional "time links" connect each point to an inner time scale. The ring can be rotated to reduce overplotting. |
| Where it is shown | PARTLY, FULLTEXT | The query circle is set "directly within the trajectory wall display by means of a query circle"; moving it changes which points appear, and resizing changes how many. The Fig. 5 labels include "Query circle" as part of the time lens, and §4.2 refers to "circle around the mouse pointer in the center of the figure". This strongly implies the ring surrounds the query area in place, but no single sentence says so and I could not inspect the figures. |
| Does angular position encode direction? | **No. Angle encodes cyclic TIME (time bins), not geographic bearing.** FULLTEXT | As quoted above. Direction appears elsewhere in the system (arrows inside the 3D bands, and a "spatial directional query" used to separate incoming from outgoing vessels in §4.3), but not in the lens ring. |

**Surprise.** This is the closest academic precedent found in group B: an aggregating ring around a movable, resizable query circle on a map. It predates everything else here except Butkiewicz 2008 and Ellis 2005. The paper should compare against it directly.

---

## 10. `dumas2015vectorlens`

**Metadata.** DOI found: **10.1109/TVCG.2014.2362543**. Crossref: Maxime Dumas, Michael J. McGuffin, Patrick Chasse (Crossref drops the accent; the PDF has "Chassé"). TVCG 21(3):402–412. **Cite it as 2015:** the print issue is March 2015, and the Crossref record was created 9 Oct 2014 (the online-first date).

**Full text.** https://profs.etsmtl.ca/mmcguffin/research/2015-dumas-VectorLens/dumas-tvcg2015-VectorLens.pdf

| Claim | Verdict | Evidence |
|---|---|---|
| Selection by position, diameter, direction and angular tolerance | SUPPORTED, FULLTEXT | Abstract: "Our interaction technique specifies a region of interest in the visualization (with a position and diameter), a direction, and an angular tolerance, all with a single drag." The tolerance starts at 70° and "decreases as 1/d". The mouse wheel changes the diameter. A curve's direction is taken from the tangent where it crosses the brush circle. |

**Surprises**
- **Angular position on the widget's ring does encode direction.** Fig. 9: "The innermost ring of the widget highlights in red the angular range currently selected." Also: "blue sectors on the innermost ring show the currently selected angular ranges". The left and right halves are separate, as in "entering in range A AND exiting in range B". This is a selection control, not an aggregate display. The outer rings hold category filters with counts.
- Multiple lenses combine through a query-builder panel with Boolean operators.
- It was designed for time series and parallel coordinates (financial data). Movement data is mentioned only as an application in the abstract; no map example.

---

## 11. `visquill` (website)

**Accessed 2026-09-23.** I read the pages as extracted text through alphaXiv. The interactive demos are embedded JS players that the reader did not run. I could not view the thumbnail images: curl to visquill.com was blocked by the proxy. **The URL https://visquill.com/product/ in the draft failed to load; the real page is https://visquill.com/products.** Pages read: `/`, `/gallery`, `/products`, `/gallery/nyc-311`, `/gallery/city-lens`, `/gallery/election-lens`, `/visuals/lens`, `/visuals/lens-faq`. `/visuals/lens-tutorial` is only an embedded player with no text.

| Claim | Verdict | Evidence |
|---|---|---|
| (a) Describes itself as a reactive geometry kit / "not a charting library" | SUPPORTED, page text | Home page: "Reactive geometry for interactive data visualization"; "VisQuill is a geometry-first TypeScript kit for building interactive visual systems."; "VisQuill is not a charting library. It is for interactive systems where geometry, constraints, and user interaction are tightly integrated." `/products` has the heading "NOT A CHARTING LIBRARY" and lists "Dynamic data lenses and focus effects" among suitable uses. The exact phrase "reactive geometry kit" does **not** appear. |
| (b) Gallery has radial lens examples on maps with marks arranged around a ring by category | SUPPORTED, page text and alt text (visuals not inspected) | `/gallery/city-lens`: "Each lens aggregates the data points within its radius and displays the breakdown as a bar chart around the rim." Gallery alt texts: "Map of Madrid with a circular lens and radial bars comparing dining, shopping and culture places around the city"; "Map of Germany with red circles for electoral districts inside a ring of bars for age, employment and school degree"; "Map of Baden-Württemberg with a circular lens and radial bars of 2026 state election results and swing against 2021". |
| (c) Angular position encodes category order, not geographic bearing | PARTLY. No page says so explicitly; the evidence points to category order. | The pages describe the ring as a "breakdown" by category, and none mentions bearing or direction. The open-source VisQuill Lab lens blueprint (GitHub `visquill/visquill-lab`, `blueprints/src/lenses/data-lens/schemes.ts`, commit 669bb2e) says: "Configuration for a hedgehog bar plot along a lens arc. Each category in `categories` produces one bar, evenly distributed along the arc baseline." I read this through GitHub code-search snippets; the repo itself is not attached to this session. There is no `atan2` in the lens code. I could not inspect the source of the gallery apps themselves (city-lens, election-lens). |

**Surprise (important for the novelty claim).** VisQuill ships **VisQuill Lens**, a finished product: a standalone browser app plus a Power BI custom visual. `/visuals/lens`: "Drag interactive lens overlays across a map; each lens aggregates the data beneath it into a live bar chart." The FAQ adds "up to three lenses simultaneously". The NYC 311 page says: "Drag a lens onto any part of the map to see the breakdown for that area. Stack all three lenses to compare Manhattan, Brooklyn, and the Bronx side by side". This is essentially "a movable map lens that aggregates the data under it and shows charts of it" around its rim, so the paper must position itself against it explicitly.


---

# Group C: claim verification (external/boundary labelling around a circular focus region)

Checked 2026-09-23. Evidence levels: FULLTEXT = primary text read; ABSTRACT = publisher/indexer abstract only; METADATA-ONLY. "Secondary" = what another paper says about this one. It is not treated as proof.

---

## 1. `fekete1999excentric`

**Metadata:** Crossref 10.1145/302979.303148. Authors: Jean-Daniel Fekete, Catherine Plaisant. Title (Crossref): "Excentric labeling" with subtitle "dynamic neighborhood labeling for data visualization". Container: Proc. SIGCHI Conf. Human Factors in Computing Systems (CHI '99), ACM Press, New York, pp. 512–519, 1999; event: Pittsburgh, 15–20 May 1999.

**Full text read:** HCIL Technical Report version, http://www.cs.umd.edu/hcil/trs/98-09/98-09.pdf. The header says "HCIL Technical Report 99-09 (December 1998)" and "CHI'99 Pittsburgh ... 512-519". I did not read the ACM camera-ready version.

- **Labels of objects inside a cursor-centred focus region are laid out around it and connected by lines: SUPPORTED (FULLTEXT, p.3).** "A circle centered on the position of the cursor defines the neighborhood or focus region. A line connects each label to the corresponding object."
- **Dynamic as the cursor moves: SUPPORTED, with a caveat (FULLTEXT, p.3).** "When the cursor stays more than one second over an area ... all labels in the neighborhood of the cursor are shown ... Once the excentric labels are displayed, users can move the cursor around the window and the excentric labels are updated dynamically." Labels first appear only after a dwell of about 1 s. Labelling stops on a click or when the cursor moves quickly out of the region.
- **Ordering and positioning: left/right columns, not on the circle (FULLTEXT, p.3–4).** The algorithm steps include "Assign the labels to either a right or left set. Stack the left and right labels according to their order." There are three variants:
  - **"Non-Crossing Lines Labeling – Radial Labeling":** "The initial position on the circle ... is computed with a radial projecting onto the circumference of the focus circle ... we order spokes in counter-clockwise order starting at the top ... The left set is filled with labels from the top to the bottom and the right set is filled with the rest." Leaders go site → radial point on circle → label (2 segments on the right, 3 on the left). So the bearing is used only to order labels. Labels sit in left-justified vertical stacks, not at their bearing.
  - **"Vertically coherent":** starts from the object's actual Y position and may cross. The authors call it "probably the best default algorithm".
  - **"Horizontally coherent":** labels are indented to follow X order.
- **Aggregation: PARTLY (FULLTEXT, p.4–5).** Fallback when there are too many objects: "(1) showing the number of items in the focus region, and (2) showing a sample of those labels in addition to the number of objects". A summary glyph is only proposed as future work: "excentric labels can show not only the number of objects but also a glyph or bar chart summarizing the contents of the area".
- **Surprises:**
  - The tech report says the pilot had "6 subjects" and users were "4 times faster" than with zooming. Fink et al. 2012 (§2) describe this study as having "eight subjects" and "nearly twice as fast", which may reflect the CHI camera-ready. Do not quote study numbers without checking the ACM version.
  - Bekos et al. 2019 state that "labels are only placed when the focus region is not moved". The tech report says labels update dynamically while the cursor moves (after the initial dwell).

## 2. `bertini2009extended`

**Metadata:** Crossref 10.1111/j.1467-8659.2009.01456.x. Authors: Enrico Bertini, Maurizio Rigamonti, Denis Lalanne. Computer Graphics Forum 28(3):927–934, 2009 (issue dated June 2009; online 27 July 2009). Eurographics DL lists it under the EuroVis09 collection.

**Full text:** CANNOT ACCESS. Wiley is paywalled and no open copy was found (EG DL page, ResearchGate and Academia were tried or searched). Evidence below is the abstract (Crossref and EG DL) plus secondary sources.

- **(a) Extensions for high and uneven density: SUPPORTED (ABSTRACT).** "limitations and potential improvements that we address in this work, like: high density areas, uneven density distributions, and summary statistics."
- **(b) Summary statistics, what exactly and how drawn: CANNOT ACCESS.** The abstract only names "summary statistics". Nothing about their form or rendering is verified.
- **(c) Labels around the lens with connecting lines: SUPPORTED (ABSTRACT).** "a labeling technique to dynamically show labels around a movable lens. Each labels refers to one object within the lens and is connected to it through a line." Note that this sentence describes the original Excentric Labeling that the paper extends.
- **(d) Angular/bearing-preserving layout: CANNOT ACCESS.** Secondary only: Bekos et al. 2019 (arXiv v2 §4.2.2.4) say Fekete & Plaisant and Bertini et al. "proposed site–label connections with os-leaders. Here, the first segment of each leader is orthogonal to the boundary of the lens". A first segment orthogonal to the circle is radial, but this does not show that labels are placed at the site's bearing.
- **Other (ABSTRACT):** there was a think-aloud user study, and "label scrolling ... requires additional research".

## 3. `fink2012focus`

**Metadata:** Crossref 10.1109/TVCG.2012.193. IEEE TVCG 18(12):2583–2592, Dec 2012. Crossref gives only initials, so full names were taken from the paper PDF: Martin Fink, Jan-Henrik Haunert, André Schulz, Joachim Spoerhase, Alexander Wolff.

**Full text read:** author PDF, https://www1.pub.informatik.uni-wuerzburg.de/pub/fink/paper/fhssw-alfr-InfoVis12.pdf

- **(a) Labels on the circular boundary with straight or Bézier leaders: SUPPORTED (FULLTEXT).**
  - Abstract: "place the labels at the boundary of the focus region and connect each site with its label by a linear connection ... we focus on leaders that are either straight-line segments or Bézier curves."
  - Contrast with excentric labelling (§1): "our leaders do not bend since we place the labels directly at the boundary of the focus region."
  - Bézier curves are a force-directed post-processing step (§5.2).
- **(b) Optimisation objective: SUPPORTED (FULLTEXT).** It depends on the model:
  - **Radial-leader model:** maximum-cardinality or maximum-weight conflict-free subset, where "two sites s and s′ are in conflict if the angle ∠scs′ is smaller than a predefined value α" (Problems 1–2, §3.1). Also sector maximisation, which maximises the minimum angular separation (Problem 4).
  - **Free-leader model:** minimum total Euclidean leader length via bipartite matching (Problem 5). Problem 6 trades weight against length: maximise "λ Σ w(s) − (1 − λ) Σ d(s, p)". Solutions are crossing-free by the length argument (Obs. 1).
- **(c) Clustering, one representative per cluster: SUPPORTED (FULLTEXT).**
  - Abstract: "we take a new facility-location perspective which yields a clustering of the sites. We label one representative of each cluster."
  - Fig. 1 caption: "Every labeled restaurant represents a cluster ... drawing a stack of rectangles with the label on top; when clicking a label, a detailed labeling for the corresponding cluster pops up."
- **(d) Optimising the focus-region position: SUPPORTED (FULLTEXT, §4.3–4.4).**
  - "given the region's radius, we find a position of the region that maximizes the number of sites whose labels can be placed". This runs in O(n⁵) (O(n⁶) weighted).
  - Sector maximisation runs in O(n⁶) exactly. The experiments solved it numerically in Mathematica instead.
- **(e) Label angle tied to the site's bearing from the centre: SUPPORTED for the radial model only (FULLTEXT, §3.1).**
  - Radial model: "we define the port p_ℓ of ℓ by radially projecting the site s_ℓ ... onto the boundary ∂D". This is an exact bearing constraint. Sites too close in angle are dropped, not displaced.
  - Free-leader model: no bearing constraint. Ports are prescribed, for example from horizontal lines spaced Δy, and assigned by matching.
- **Surprise:** in the radial model, bearing conflicts are resolved by selection (dropping labels), not by minimal angular displacement. This is the key contrast with the draft's technique.

## 4. `haunert2014labeling`

**Metadata:** Crossref 10.1145/2677068.2677069. Authors: Jan-Henrik Haunert, Tobias Hermes (both University of Osnabrück). Proc. 2nd ACM SIGSPATIAL International Workshop on Interacting with Maps (held at SIGSPATIAL '14, Dallas/Fort Worth), ACM, pp. 15–21, published 4 Nov 2014.

**Full text:** CANNOT ACCESS (ACM, not open). The abstract was read verbatim from the ACM DL page.

- **Leaders point toward the focus centre (radial): SUPPORTED (ABSTRACT).**
  - "each label is an axis-aligned rectangle that touches the boundary of the focus region with one of its corners ... We require that every leader points towards the center of the focus region".
  - "Our model allows only one possible position for each label." So label position is fixed by the site's bearing.
- **Formulated as maximum weight independent set: SUPPORTED (ABSTRACT).** "Our problems are special cases of the NP-hard problem Maximum Weight Independent Set of Rectangles (MWISR). We show that MWISR can be solved efficiently if the upper-left corners of all rectangles ... lie on a monotonically ascending curve ... O(n log n) time for unit-height labels."
- **Real-time JavaScript implementation: SUPPORTED (ABSTRACT).** "We achieve a real-time performance with an implementation in JavaScript that runs in a browser."
- **Aggregation:** none mentioned. Labels that do not fit are dropped (a maximum-count or maximum-weight subset is kept).
- **Secondary:** Bekos et al. 2019 say it was solved "by means of dynamic programming". Not verified in the primary text.

## 5. `heinsohn2014boundary`

**Metadata:** Crossref 10.1109/PacificVis.2014.20. Authors: Niklas Heinsohn, Andreas Gerasch, Michael Kaufmann. 2014 IEEE Pacific Visualization Symposium (Yokohama, 4–7 Mar 2014), pp. 243–247.

**Full text:** CANNOT ACCESS (IEEE, not open). The abstract was read from the IEEE Xplore page (doc 6787174).

- **Labelling for moving/dynamic focus regions: SUPPORTED (ABSTRACT).** "we face the problem of emphasizing additional information and labels for objects within a focus region even when the region might be moving. We propose four different approaches".
- **Temporal coherence: PARTLY (ABSTRACT).** "Our algorithms regard the dynamic nature of the focus region to place the labels and preserve the mental map of the analyzed drawing." The mechanism is not verified.
- **Secondary (Bekos et al. 2019 §4.1.2, not primary):**
  - The four approaches are "(i) ... a stack on the left hand side ..., (ii) a radial approach ... (iii) a force-based approach that prefers labels with radial leaders ..., and (iv) a cake-cutting approach that places the labels equally distributed around the focus region".
  - Bekos also says that "the focus region is shrunk" when overlaps remain.
  - If the draft relies on these details, get the PDF.
- **Surprise:** the application domain is biological networks, not geographic maps: "We demonstrate our methods by applying them to biological networks."

## 6. `niedermann2019focus`

**Metadata:** Crossref 10.1080/23729333.2019.1613072. Authors: Benjamin Niedermann, Jan-Henrik Haunert (University of Bonn). International Journal of Cartography 5(2–3):158–177, 2019 (published online 7 May 2019).

**Full text:** CANNOT ACCESS (T&F "Access Denial"). The abstract was read from Semantic Scholar's page; the "ABSTRACT" part is the author abstract. T&F keywords include "mathematical programming".

- **Labels in a fisheye/focus+context map: SUPPORTED (ABSTRACT).** "providing the user with the possibility of displacing the labels of a circular focus region. To that end, we utilize techniques from focus+context maps implementing the displacement of the labels by fish-eye projections."
- **Clutter reduction by optimisation: SUPPORTED (ABSTRACT).** "when the user stops moving the focus region, mathematical programming is applied to optimize positions of the displaced labels." The type of program (ILP or other) is not verified.
- **Relevant extras (ABSTRACT):**
  - Leaders are aggregated: "connecting lines aggregated to bundles".
  - Temporal coherence: "labels move smoothly when the user continuously shifts the focus region".
- **Unknown:** whether labels are placed on a ring or at the bearing is not in the abstract. Secondary: Bonerath et al. 2024 group it under "horizontal labels".

## 7. `bekos2019external`

**Metadata:** Crossref 10.1111/cgf.13729. Authors: Michael A. Bekos, Benjamin Niedermann, Martin Nöllenburg. Computer Graphics Forum 38(3):833–860, 2019 (issue June 2019; online 10 July 2019).

**Full text read:** arXiv 1902.01454v2 (24 Jun 2019), not the Wiley version of record.

- **Taxonomy of external labelling: SUPPORTED (FULLTEXT).** "introduces a first unified taxonomy for categorizing the different results in the literature". It surveys 54 references.
- **Includes excentric labelling: SUPPORTED (FULLTEXT, §1–2, Fig. 1d).** "(d) Excentric labeling: the labeled features are contained in a circle (blue), while the labels are placed around the circle." Also: "two main variants are found: labels that are placed freely in the surroundings of the focus region and the special case of contour labeling requiring that all labels are placed along the boundary of the focus region."
- **Includes circular and contour boundaries: SUPPORTED (FULLTEXT).**
  - Table 1 property "S1.2 circle" under contour labelling; excentric papers are marked "#".
  - Leader types include r-segments: "An r-segment lies on a ray that emanates from a given center point M".
  - Leader direction criterion: "the leaders radially emanate from a common center [AHS05, HGAS05, FHS*12, HGK14, TKGS14]".
- **Note:** the survey predates Bonerath 2024 and Wallinger 2026. It does not cover arc-shaped orbital labels.

## 8. `bonerath2024orbital`

**Metadata:**
- DataCite 10.4230/LIPIcs.GD.2024.22. It is not in Crossref, which returns 404; LIPIcs DOIs are registered with DataCite.
- Authors: Annika Bonerath, Martin Nöllenburg, Soeren Terziadis, Markus Wallinger, Jules Wulms.
- GD 2024, LIPIcs vol. 320, article 22, pp. 22:1–22:17. Editors: Stefan Felsner, Karsten Klein. Schloss Dagstuhl – Leibniz-Zentrum für Informatik, 2024. License CC-BY 4.0.
- Full version: arXiv 2403.19052.

**Full text read:** LIPIcs PDF (drops.dagstuhl.de).

- **Labels as arcs on an orbit around a circle: SUPPORTED (FULLTEXT, abstract).** "(i) the figure is enclosed by a circular contour and (ii) the labels are placed as disjoint circular arcs in an annulus-shaped orbit around the contour."
- **Leader types: SUPPORTED (FULLTEXT, §1).**
  - Straight-line (SL): "simply a straight-line segment starting at p and ending at ξ_L(p)".
  - Orbital-radial (OR): "a (possibly empty) orbital circular arc with center point X starting at the feature p and ending at a bend point q, and a radial segment that connects q to ξ_L(p)".
- **Objective is total leader length: SUPPORTED (FULLTEXT).** "The algorithmic objective is to compute an orbital boundary labeling with the minimum total leader length." Leaders must be pairwise interior-disjoint (crossing-free; Problem 1).
- **Complexity results: SUPPORTED (FULLTEXT, Table 1, §3–5).**
  - "polynomial-time algorithms for many variants and NP-hardness for others".
  - Examples: O(|C|n²) for locked candidates and locked order (Thm 12); O(n²) for free candidates and locked order (Thm 19); O(n⁵) via reduction to Benkert et al.'s boundary labelling.
  - "OR-C O S A variants are weakly NP-hard" for free candidates, free order and non-uniform labels (§5).
  - SL-leader results are in the full version; some are only conjectured.
- **Bearing:** labels are not constrained to the site's bearing. Order and port positions are optimised for leader length; the OR-leader's orbital arc absorbs any angular offset.
- **Aggregation:** none. The intro notes that orbital labels can act as donut-chart segments "such that the label sizes are proportional to the data values".
- **Note:** the problem assumes the label lengths sum to exactly the circumference, so the ring is fully tiled with no gaps.

## 9. `wallinger2026clarity`

**Metadata:**
- **Venue: PUBLISHED.** Crossref 10.1109/pacificvis68791.2026.00005: "2026 IEEE 19th Pacific Visualization Conference (PacificVis)", Sydney, 20–23 Apr 2026, IEEE, pp. 1–10, issued 2026-04-20.
- Authors (Crossref and arXiv): Markus Wallinger, Annika Bonerath, Soeren Terziadis, Jules Wulms, Martin Nöllenburg.
- arXiv 2603.08657 has only v1 (9 Mar 2026), with no journal-ref.
- Crossref "pages 1-10" may be IEEE's per-paper numbering; check it on IEEE Xplore (doc 11558735) if exact pages matter.

**Full text read:** arXiv v1 only. The IEEE version of record was not read, so numbers could differ.

- **User study comparing straight vs orbital-radial leaders: SUPPORTED (FULLTEXT §6).** "we compare different variants of orbital boundary labeling, measuring the task completion time and accuracy". It was an online within-subject study: 72 trials per participant (2 label-size × 2 leader × 2 task × 9 instances), with tasks "find label given feature" and "find feature given label".
- **Number of participants: SUPPORTED, n = 54 (FULLTEXT §6.1).** "in total, we collected 54 complete responses". Of these, 35 male, 18 female, 1 other; 37 used a mouse and 17 a trackpad. The pilot had 5 people.
- **Accuracy: similar, SUPPORTED (FULLTEXT §6.8).** "all participants had a mean greater than 0.95 with the median being 1.0". The only significant difference was D15 with uniform labels (p = 0.049; SL slightly better, 0.03 [0.01, 0.06]). "even when we found significant differences, the effect size remained small, confirming hypothesis H1."
- **Speed: SL faster, SUPPORTED (FULLTEXT §6.8).** "strong evidence that response time is lower for SL-leaders than for OR-leaders regardless of label size, number of labels, and distribution" (p < 0.01 in all classes). The effect grows with clustering and with n; for example, uniform-label D_o gap is 0.42 [0.35, 0.51] on the normalised response-time scale.
- **Preference: PARTLY (FULLTEXT §6.8).** It splits into three findings:
  - No significant overall preference: "We did not find any significant difference regarding participants' preferences."
  - OR rated more aesthetic (p < 0.01).
  - SL gave higher confidence (p < 0.01): "participants seem to find OR-leaders more aesthetically pleasing but feel more confident with SL-leaders."
- **Other:**
  - Heuristics stay within a factor of 1.28 of optimal leader length and run in milliseconds.
  - Exact MIP/QIP models are too slow for practical use.
  - The discussion (§7) suggests combining with Gedicke et al.'s stacking and pagination.
- **Surprise:** the stimuli used a plain white background, not a map, so results are for abstract point sets.

## 10. `gedicke2021zoomless`

**Metadata:** Crossref 10.1109/TVCG.2020.3030399. Authors: Sven Gedicke, Annika Bonerath, Benjamin Niedermann, Jan-Henrik Haunert. IEEE TVCG **27(2):1247–1256, Feb 2021**. The DOI carries "2020" because it was published online in Oct 2020 (a VIS 2020 paper). Cite as 2021, vol. 27, no. 2.

**Full text read:** arXiv 2008.13556v1.

- **External labels for dense point sets without zooming: SUPPORTED (FULLTEXT, abstract).** "we present new external labeling methods that allow a user to navigate through dense sets of points of interest while keeping the current map extent fixed."
- **"Around the map / focus": PARTLY. Labels go on the bottom edge of a rectangular map, with no focus region and no circle (FULLTEXT §1, §4).**
  - "we follow the idea to place labels at the bottom of the map".
  - "we place labels at the bottom side of the map for k features ... k fixed positions at the bottom side of the map, which we call ports"; k = 5 in the experiments.
  - Leaders are po-leaders, not radial.
- **Aggregation/stacking (relevant):**
  - "L3 Stacking boundary labeling. This labeling method creates k stacks of labels below the map ... The topmost label of the stack is connected to its feature via a leader."
  - The other methods are multi-page and sliding.
  - Each stacked label still refers to one feature, so a stack groups labels; it is not a summary glyph.
- **Surprise:** the related work (§2) explicitly contrasts lens-based methods (Fekete, Balata, Heinsohn) as "suitable for desktop systems but not for small-screen devices". The framing is smartwatch, 300×300 px.

---

## Cross-cutting observations for the draft

- **Closest precedents:**
  - Fink 2012's radial-leader model and Haunert & Hermes 2014 fix each label to its site's bearing on a circular focus boundary. Both resolve conflicts by **dropping** labels (maximum independent or conflict-free subset), not by minimal angular displacement.
  - Excentric labelling uses bearing only for ordering, in left/right stacks.
  - Orbital labelling (2024/2026) frees label positions entirely to minimise leader length.
- **Aggregation precedents:**
  - Fekete & Plaisant: count plus sample labels; a summary glyph or bar chart was only proposed.
  - Bertini 2009: "summary statistics" (details unverified).
  - Fink 2012: one representative label per cluster, drawn as a stack with details on demand.
  - Gedicke 2021: label stacks.
  - Niedermann & Haunert 2019: bundled leaders.
- **Leader line only when displaced:** no verified paper in this group draws a leader only when the label is displaced. All of them always draw leaders.


---

# Group D claim verification: off-screen indicators, necklace maps, ring maps

Verified 2026-09-25 in the main session; the group-D agent was cut off twice by rate limits and wrote nothing.

Evidence levels:
- **FULLTEXT**: I read the paper's text.
- **ABSTRACT**: I read only the abstract.
- **METADATA-ONLY**: I checked only the bibliographic record.
- **SECONDARY**: what another paper, itself read in full, says about this one.

Metadata sources:
- One Crossref batch query (`works?filter=doi:…`) covered all ACM, IEEE, World Scientific, BMC, T&F and IS&T DOIs.
- DataCite covered the two Eurographics DOIs.
- The arXiv abs page covered Jäckle et al. 2017.

---

## `speckmann2010necklace`: FULLTEXT

**Source:** author PDF at https://bspeckmann.win.tue.nl/papers/NecklaceMapsFinal.pdf. Metadata: Crossref, TVCG 16(6):881–889, Nov 2010.

- **Regions are projected onto intervals of a surrounding curve: SUPPORTED.** Abstract: "the regions of the underlying two-dimensional map are projected onto intervals on a one-dimensional curve (the necklace) that surrounds the map regions."
- **Symbols are scaled by value and placed without overlap within their intervals: SUPPORTED.** Abstract: "Symbols are scaled such that their area corresponds to the data of their region and placed without overlap inside the corresponding interval on the necklace."
- **Multiple necklaces: SUPPORTED.** Abstract: "One map can contain several nested or disjoint necklaces".
- **What is optimised: SUPPORTED.**
  - The primary objective is the maximal global scale factor ρ: "Our goal is hence to find a feasible placement that maximizes ρ".
  - Placement is then improved at fixed ρ by a force-based step that pushes symbols toward the middle of their intervals and apart from each other. There are also user-set buffers (§4.3).
- **Curve shape: SUPPORTED.** "In principle any star-shaped open or closed curve can be used as a necklace". The implementation uses cubic B-splines.
- **Interval types (§4.1): SUPPORTED.**
  - *Centroid intervals:* a constant-size interval around the bearing of the region's centroid, β_i = atan2(...).
  - *Wedge intervals:* the smallest wedge from the centre containing the region.
  - *Density-dependent intervals.*
- **Useful for positioning glyphlens:**
  - "necklace maps do not need leaders, since the association between region and symbol is created via spatial proximity and color coding" (§2, the boundary-labelling paragraph).
  - "Necklace maps combine elements of proportional symbol maps and boundary labeling."
  - "the association between a symbol and its region is weaker than with other types of maps. Interactivity can help to strengthen this association".
  - Optimising symbol sizes in any order is NP-hard. They use an FPT algorithm in the interval thickness.

## `speckmann2015algorithms`: FULLTEXT (accepted manuscript)

**Source:** TU/e Pure accepted manuscript, https://pure.tue.nl/ws/files/90532756/AlgNeckJour.pdf. Metadata: Crossref, IJCGA 25(1):15–36, 2015.

- **Fixed order: SUPPORTED.** "The Fixed-Order problem can be solved in O(n log n) time."
- **Any order: SUPPORTED.** "We show that the Any-Order problem is NP-hard for certain types of intervals". §4.2: NP-hard for wedge intervals; the status for centroid intervals is open. The FPT algorithm runs in O(n log n + n²K4^K); the heuristic in O(n log n + nK2^K).
- **Objective: SUPPORTED.** The problem is "Max-Size: Find the maximal global scaling factor ρ such that there exists a feasible placement". Displacement from a preferred position is **not** the objective.
- **Relevant to glyphlens's sorted-order assumption.** §4.3: "Intuitively, one could assume that in an optimal solution all symbols should be ordered by the angles of the corresponding region centroids. However, this is not generally the case (Figure 8)." Sorted order gives a tight 1/2-approximation for their max-size objective with centroid intervals. This concerns *their* objective and *with* intervals; it does not settle glyphlens's interval-free squared-displacement case, but it is a warning against assuming the sorted order.

## `jackle2017topology`: FULLTEXT (arXiv v1)

**Source:** arXiv 1706.09855v1 (29 Jun 2017). There is no journal-ref, and the PDF names no venue. Title: "Topology-Preserving Off-screen Visualization: Effects of Projection Strategy and Intrusion Adaption". Authors: Jäckle, Fuchs, Reiterer (University of Konstanz).

- **Design: 18 participants (2 female), within-subject, 3 tasks.**
  - Task 1 asked participants to click where they expected an off-screen point to be, given its proxy in a rectangular border region.
  - It measured whether clicks were nearer the orthographic or the radial back-projection.
- **Results (§5.1).**
  - "Overall, participants preferred an orthographic projection strategy (94.4%)."
  - Error distance was significantly lower for orthographic (78.3 px) than for radial (183.4 px).
  - §6.1: "17 out of 18 participants reported that the orthographic projection strategy seems more intuitive."
- **Scope and caveats (§6).**
  - The border is rectangular, with no direction cue in the proxy.
  - DC1: "The orthographic projection strategy in the best choice for topology-preserving off-screen visualizations of unconnected point data." ("in" is sic.)
  - §6.3 on task dependency: in navigation, where "your position marks the point of interest", "A radial projection is used originating from your position and we all are used to it".
  - **Implication for glyphlens:** on a *circular* boundary the radial direction *is* the boundary normal, and a lens centre is exactly such a point of interest. The result transfers only partly, and the study should test it rather than assume either way.

## `tominski2016comparing`: FULLTEXT

**Source:** author copy, https://vca.informatik.uni-rostock.de/~ct/publications/Tominski16CompaRing.pdf. Metadata: DataCite, EuroVis 2016 Short Papers, pp. 137–141 (EG handle).

- **Ring of slots: SUPPORTED.** "The central visual element is a circular arrangement of n slots... the user will typically want to set n < 10. Each slot shows an object to be compared."
- **Indicator arcs: SUPPORTED.** "the slots show indicator arcs that communicate direction and distance of the individual objects. The arcs point in the direction where objects are located. Wide arcs (max. 90°) represent greater distances, whereas narrow arcs (min. 10°) indicate objects that are close."
- **Slots are not placed by direction: SUPPORTED.**
  - §6: experts suggested alternative layouts "in addition to laying out slots according to object directions". Direction-based slot layout is an *unimplemented suggestion*.
  - The paper places CompaRing among radial designs "including radial menus, ring maps, and necklace maps".

## `stewart2011ringmaps`: FULLTEXT (open access, BMC)

**Metadata:** Crossref, IJHG 10:18, 2011; authors Stewart, Battersby, López-De Fede, Remington, Hardin, Mayfield-Smith.

- **Construction: SUPPORTED.** "A set of attribute 'spokes' was then drawn, with spokes distributed evenly in a radiating fashion around the base map. Each spoke on the ring map presents one or more attributes for a single county. A set of attribute-specific spoke elements forms a 'ring' of information around the core. Attribute data contained in rings are spatially referenced through the use of leader lines that tie each spoke to its respective county".
- **Limitations and future work: SUPPORTED.** "the limited representation of spatial topology in rings, might be addressed in a dynamic ring mapping environment".
- **Not verified:** the exact rule ordering spokes around the ring. Do not claim it.

## `baudisch2003halo`, `zellweger2003citylights`, `gustafson2007edgeradar`, `gustafson2008wedge`, `jackle2015ambient`: METADATA + SECONDARY

- **Metadata:** Crossref (DataCite for Ambient Grids).
- **Secondary content,** from Jäckle et al. 2017 (FULLTEXT) Table 1 and §2:
  - all of these encode the *direction* of off-screen objects ("While all papers in Table 1 encode the direction");
  - EdgeRadar and Ambient Grids use a dedicated border region;
  - Ambient Grids aggregates off-screen points into grid-based heatmaps in the border;
  - Halo and Wedge are listed as orthographic or adapted-orthographic.
- **Use in the paper:** only as a group, "off-screen indicators encode the direction of objects beyond the viewport at its border", citing Jäckle 2017 for the classification.

## `danyluk2026ringmaps`: ABSTRACT (partial)

**Metadata:** Crossref, CaGIS, online 2026-06-23, pp. 1–21; authors Danyluk, Jenny, Ens, Willett.

- **Content (T&F page metadata):** "We introduce ring maps, a new augmented reality (AR) mapping paradigm that supports pedestrian navigation in urban environments while balancing map complexity, environmental occlusion, and spatial ...". The rest of the abstract is truncated.
- **Keywords:** landmarks, navigation, user study, design space.
- **Not verified:** how landmarks are placed on the ring. Cite only as an AR ring map for pedestrian navigation.

## `draper2009radial`: METADATA

- **Metadata:** Crossref, TVCG 15(5):759–776.
- **Use:** cited only as a survey of radial methods, which is its title. CompaRing (FULLTEXT) cites it for "the ring pattern".

## Dropped (not verified, not cited)

- **Battersby et al. 2011** (J. Maps 7(1):564–572; Crossref record verified): the open PDF would not fetch.
- **Zhao, Forer & Harvey 2008:** only secondary mentions were seen.
- **Jäckle, Fuchs & Keim 2016, Star Glyph Insets:** metadata verified by Crossref, but the placement claim ("along the ray from the viewport centre") could not be checked in the text. The paper-reading tool returned an unrelated paper.


---

# E1 citation verification — claims and provenance

Evidence levels: FULLTEXT (read in the paper itself), ABSTRACT (publisher/Crossref abstract only), METADATA-ONLY.
Metadata source for all DOI items: Crossref REST API `https://api.crossref.org/works/<DOI>` (fetched via Firecrawl, 2026-09-23).
Scite was unavailable (monthly quota exhausted); Crossref + open full texts were used instead.

---

## 1. brunsdon2002gwss — STATUS: PARTLY CHECKED (full text not yet obtained; see update section at end)

**Metadata (Crossref):** C. Brunsdon; A.S. Fotheringham; M. Charlton (Crossref gives initials only). "Geographically weighted summary statistics — a framework for localised exploratory data analysis". *Computers, Environment and Urban Systems* 26(6):501–524, Nov 2002. DOI 10.1016/S0198-9715(01)00009-6. All matches the draft.

**Claims**
- (a) local summary statistics computed with a spatial kernel around each location — **SUPPORTED (ABSTRACT)**. Abstract (via academia.edu page metadata/text): "Geographical kernel weighting is proposed as a method for deriving local summary statistics from geographically weighted point data." and "Univariate and bivariate summary statistics are considered, for both moment-based and order-based approaches." The exact list (mean, SD, skewness, correlation…) is NOT verified verbatim from the paper. Secondary FULLTEXT support: Dykes & Brunsdon 2007 (item 3, §3.1) describe [2] as computing GW mean and GW quantiles.
- (b) bandwidth controls the scale — **NOT YET VERIFIED in this paper's own text.** (Verified in Dykes & Brunsdon 2007, which cites it: "h is referred to as the bandwidth of the locally weighted statistic – it effectively controls the size of the moving window.")
- (c) box-car / uniform hard cut-off kernel as special case or alternative — **CANNOT ACCESS (so far)**. No full text obtained (ScienceDirect paywalled; eprints.ncl.ac.uk blocked). Do NOT cite GWSS 2002 for the box-car point until checked. For a verified box-car/moving-window statement use Dykes & Brunsdon 2007 (item 3) and — pending — Brunsdon et al. 1996 (item 2).

---

## 2. brunsdon1996gwr — STATUS: METADATA + ABSTRACT only; quote NOT YET CHECKED

**Metadata (Crossref):** Chris Brunsdon; A. Stewart Fotheringham; Martin E. Charlton. "Geographically Weighted Regression: A Method for Exploring Spatial Nonstationarity". *Geographical Analysis* 28(4):281–298, Oct 1996. DOI 10.1111/j.1538-4632.1996.tb00936.x. Matches.

**Claim:** moving window with a sudden cut-off as the simplest weighting scheme — **NOT YET VERIFIED / CANNOT ACCESS so far.** Abstract (Crossref) only says: "The method itself is introduced and related issues such as the choice of a spatial weighting function are discussed." No verbatim "moving window"/"cut-off" quote obtained yet. Do not put quotation marks around any wording until the full text is read.

---

## 3. dykes2007gwvis — STATUS: CHECKED (FULLTEXT)

**Metadata (Crossref):** J. Dykes; C. Brunsdon (full names Jason Dykes, Chris Brunsdon from the paper's byline). "Geographically Weighted Visualization: Interactive Graphics for Scale-Varying Exploratory Analysis". *IEEE TVCG* 13(6):1161–1168, Nov 2007. DOI 10.1109/TVCG.2007.70558. Matches.
**Full text:** City Research Online author version, https://openaccess.city.ac.uk/id/eprint/3227/1/Geographically_weighted_visualization.pdf (repository says "unspecified version… may differ from the final published version").

**Claims**
- (a) interactive GW graphics with bandwidth/scale varied by the user — **SUPPORTED, with a caveat (FULLTEXT)**. §3.3: "All of the views are coordinated so that any interaction that changes x (the mapped variable) or h (the scale used in weightings) results in appropriate updates to all views." Caveat: h is NOT a continuous slider; §3.3: "Clicking the maps cycles through the variables available …, the precomputed values of h … and the four spatial encodings". Kernel is Gaussian, not box-car (§3.1: "Here, we use a Gaussian decay function").
- (b) scalograms showing statistics across scales — **SUPPORTED (FULLTEXT)**. §1 (end): "a scalogram – a plot showing the variation of localised summary statistics as the value of h changes."
- (c) "directional geographies" — **SUPPORTED: direction-dependent (anisotropic) kernel (FULLTEXT)**. §5 "Directed Geographic Weighting": "We extend the idea of geographical weighting to incorporate direction as well as distance by pre-multiplying the expression for wi by the expression exp(−λ cos(θi − φ))" … "φ is the principal direction of the weighting"; "The parameter λ controls the relative sharpness of the directional effect. Setting λ to zero removes any directional bias". φ restricted to 30° "clock points"; results called "directed GW statistics". (Note: the sign of the exponent as extracted from the PDF is exp(−λcos(θ−φ)), which as written would DOWN-weight the principal direction although the text says points along φ "gain the highest weighting" — check the published version before reproducing the formula.)

**Surprises / useful for the concession:**
- §3.1: "The most fundamental of these is the geographically weighted mean. This is simply a moving spatial window mean smoother." — direct support for reading a lens as a GW/moving-window statistic.
- §6: "The statistics could, however be centred on any points, such as those comprising a regular grid." — anticipates evaluating GW statistics on a lattice, i.e. the "field" mode. Cite this.
- §1 defines fixed (distance h) vs adaptive (k-th nearest neighbour) bandwidths.

---

## 4. goodwin2016multiple — STATUS: CHECKED (FULLTEXT)

**Metadata (Crossref):** Sarah Goodwin; Jason Dykes; Aidan Slingsby; Cagatay Turkay. "Visualizing Multiple Variables Across Scale and Geography". *IEEE TVCG* 22(1):599–608, 2016 (issue dated 31 Jan 2016; VIS 2015). DOI 10.1109/TVCG.2015.2467199. Matches.
**Full text:** accepted version, https://openaccess.city.ac.uk/id/eprint/12337/1/infoVis15-paper140.pdf

**Claim:** local (e.g., correlation) statistics shown varying with scale and geography — **SUPPORTED (FULLTEXT)**. Abstract: "correlation varies across space, with scale and over time, and the frequently used global statistics hide potentially important differentiating local variation." §2.2.2: "a local correlation coefficient (Pearson's r) is calculated for 326 local authority units (LAU) … It demonstrates that correlation is geographically and scale variant". Localities: "Fixed moving window … fixed distance D", "Adaptive moving window … N nearest neighbors", "Partition" (§2.2.1). Computed with GWmodel (footnote 1: "Distance weighted local statistics"), so weights are distance-decaying, not box-car. Also explicitly links scale-dependent aggregation to MAUP (§2.1).

---

## 5. ripley1977modelling — STATUS: CHECKED (FULLTEXT, OUP scan)

**Metadata (Crossref):** B. D. Ripley. "Modelling Spatial Patterns". Vol 39, issue 2, pp. 172–192, 1977. DOI 10.1111/j.2517-6161.1977.tb01615.x. Crossref container title is the journal's *current* name "Journal of the Royal Statistical Society Series B: Statistical Methodology"; in 1977 it was "Journal of the Royal Statistical Society: Series B (Methodological)" (used in the .bib). Many papers cite pp. 172–212 because the Discussion follows (pp. 192–212); 172–192 is the paper itself per Crossref.
**Full text:** https://academic.oup.com/jrsssb/article-pdf/39/2/172/49097241/jrsssb_39_2_172.pdf (read via alphaXiv).

**Claim:** second-order K function; under CSR K(r) = πr² — **SUPPORTED (FULLTEXT)**.
- p. 173, §2: "(b) λK(t) is the expected number of further points within t of an arbitrary point of the process."
- p. 174, §3: "The basic model is the Poisson process … This model is specified by its intensity λ; K(t) = πt² irrespective of λ (hence the scaling of K)."
- Notation is t, not r. The L-function (√(K/π)) is NOT in the paper body (it is usually credited to Besag's contribution to the Discussion; not checked).
- Also relevant: p. 181 introduces simulation envelopes ("We can define the acceptance region of a test by requiring K̂ for the data to be within the envelope of K̂ for the simulations"), and p. 182: "Both K and p are essentially cumulative functions".
- Estimator (p. 180) uses an edge-correction weight (reciprocal of the proportion of the circle's perimeter inside the window) — relevant if the lens counts are uncorrected near borders.

---

## 6. getis1987second — STATUS: METADATA + ABSTRACT (full text CANNOT ACCESS)

**Metadata (Crossref):** Arthur Getis; Janet Franklin. "Second-Order Neighborhood Analysis of Mapped Point Patterns". *Ecology* 68(3):473–477, June 1987. DOI 10.2307/1938452. Matches. (Reprinted in Anselin & Rey (eds), *Perspectives on Spatial Data Analysis*, Springer 2010, pp. 93–100, doi 10.1007/978-3-642-01976-0_7.)

**Claim:** point-centred (local) K/L computed around each individual point at multiple distances — **SUPPORTED at ABSTRACT level; formula NOT verified.** Abstract (Crossref): "second-order neighborhood analysis, is used to quantify clustering at various spatial scales. The theoretical model represents the degree of clustering in a Poisson process from the perspective of each individual point." The specific L_i(d) definition could not be read (Wiley/JSTOR/Springer paywalled). If the paper will write "L_i(d)" with a formula, it must be checked in the full text.

---

## 7. wiegand2004rings — STATUS: METADATA + ABSTRACT (full text CANNOT ACCESS)

**Metadata (Crossref):** Thorsten Wiegand; Kirk A. Moloney. "Rings, circles, and null-models for point pattern analysis in ecology". *Oikos* 104(2):209–229, 2004 (online 16 Jan 2004; issue Feb 2004). DOI 10.1111/j.0030-1299.2004.12497.x.
**Surprise:** Crossref stores the second author as given "Kirk", family "A. Moloney" (a deposit error; Wiley's own "article_references" repeats it as "A. Moloney, K."). Correct form (Wiley citation_author meta): Kirk A. Moloney. Hand-fix if your .bib was auto-generated from Crossref.

**Claims**
- contrasts cumulative (circle, K) with non-cumulative (ring, O-ring) statistics — **PARTLY (ABSTRACT)**. Abstract: "We review (1) methods for analytical and numerical implementation of two complementary second-order statistics, Ripley's K and the O-ring statistic". The words "cumulative/non-cumulative" do not appear in the abstract; the contrast is implied by the title and "complementary", but not verified verbatim.
- simulation envelopes against null models — **PARTLY (ABSTRACT)**. Abstract: "(4) a variety of useful standard and non-standard null models for univariate and bivariate patterns." "Envelopes" not verified in this paper's text (it IS verified in Ripley 1977, p. 181).

---

## 8. fotheringham1991maup — STATUS: CHECKED (ABSTRACT)

**Metadata (Crossref):** A S Fotheringham; D W S Wong (initials only in Crossref). "The Modifiable Areal Unit Problem in Multivariate Statistical Analysis". *Environment and Planning A* 23(7):1025–1044, July 1991. DOI 10.1068/a231025. (Crossref shows the current journal name "Environment and Planning A: Economy and Space".)

**Claim:** multivariate results vary with scale and zoning — **SUPPORTED (ABSTRACT)**: "conclusions are drawn about the sensitivity of such estimates to variations in scale and zoning systems. The modifiable areal unit problem is shown to be essentially unpredictable in its intensity and effects in multivariate statistical analysis".

---

## 9. openshaw1984maup — STATUS: CHECKED (FULLTEXT scan)

**Source loaded:** https://raw.githubusercontent.com/qmrg/CATMOG/Main/38-maup-openshaw.pdf (linked from the QMRG CATMOG index https://qmrg.github.io/CATMOG/ ; GitHub view https://github.com/qmrg/CATMOG/blob/Main/38-maup-openshaw.pdf). Local copy: scratchpad/cite/catmog38.pdf, text: catmog38.txt.
**Metadata verified from scan:** "S. Openshaw" / "by Stan Openshaw (Newcastle University)"; "CONCEPTS AND TECHNIQUES IN MODERN GEOGRAPHY No.38 THE MODIFIABLE AREAL UNIT PROBLEM"; "ISSN 0306-6142 ISBN 0 86094 134 5"; "Published by Geo Books. Norwich". **Year is not printed anywhere in the scan**; latest cited item is "Openshaw, S. (1983) … (forthcoming)". 1984 is taken from Crossref reference metadata of citing works (Fotheringham & Wong 1991; Brunsdon et al. 2002). Some online copies are labelled 1983 (e.g. a uio.no file "openshaw1983.pdf") — treat 1984 as conventional, not verified from the item itself.

**Claim:** introduces/defines MAUP with scale and aggregation (zoning) effects — **PARTLY: "defines" SUPPORTED, "introduces" NOT SUPPORTED (FULLTEXT)**.
- p. 8, §III(i) Definitions: "The MAUP is in reality composed of two separate but closely related problems. The first of these is the well known scale problem …" and "Any variation in results due to the use of alternative units of analysis when the number of units is held constant is termed the aggregation problem (Openshaw, 1977a)."
- p. 4: "This, then, is the crux of the modifiable areal unit problem (MAUP)."
- It does not introduce the term: it cites Openshaw & Taylor (1979) "…three experiments on the modifiable areal unit problem" and Openshaw & Taylor (1981) "The modifiable areal unit problem", and discusses Gehlke & Biehl (1934), Yule & Kendall (1950). Write "defined/reviewed in" rather than "introduced in".
- Also distinguishes zoning systems (contiguous) vs grouping systems (p. 8).

---

## 10. willett2007scented — STATUS: CHECKED (FULLTEXT)

**Metadata (Crossref):** Wesley Willett; Jeffrey Heer; Maneesh Agrawala. "Scented Widgets: Improving Navigation Cues with Embedded Visualizations". *IEEE TVCG* 13(6):1129–1136, Nov 2007. DOI 10.1109/TVCG.2007.70589. Matches.
**Full text:** https://idl.cs.washington.edu/files/2007-ScentedWidgets-InfoVis.pdf

**Claim:** embedding small visualizations in UI controls (sliders, lists…) as navigation cues ("information scent") — **SUPPORTED (FULLTEXT)**. Abstract: "scented widgets, graphical user interface controls enhanced with embedded visualizations that facilitate navigation in information spaces. We describe design guidelines for adding visual cues to common user interface widgets such as radio buttons, sliders, and combo boxes". §1 defines information scent (after Pirolli & Card). Fig. 1: "Histogram slider with data totals"; Fig. 2 includes "A list box with dataset sizes". Note: the paper credits histogram sliders to earlier work (Derthick et al. 1999; Eick 1994) — its contribution is the generalisation + toolkit + study; its evaluation used social-navigation (visit/comment) scent.

---

## 11. yamu2016fractal — STATUS: CHECKED (FULLTEXT; page number approximate)

**Metadata (Crossref):** Claudia Yamu; Gert de Roo; Pierre Frankhauser. **Title: "Assuming it is all about conditions. Framing a simulation model for complex, adaptive urban space".** *Environment and Planning B: Planning and Design* 43(6):1019–1039, 2016 (online 27 Jul 2016; issue Nov 2016). DOI 10.1177/0265813515607858. Authors/venue/pages match the draft; the title was not known to the draft.
**Full text:** Univ. Groningen repository, final publisher's version: https://research.rug.nl/files/26965148/EPB607858_rev1.1_Yamu.pdf (read via Firecrawl PDF parser).

**Claim:** radial analysis counting built-up mass N(ε) within distance ε of a chosen centre, N(ε) ∝ ε^D — **SUPPORTED (FULLTEXT)**. Verbatim: "To identify the fractal-based indicator we use radial analysis. Using a rasterized black and white image of a spatial agglomeration where the black pixels represent a built-up surface we can count built-up mass around a freely chosen starting point (Figure 3)." … "for fractal patterns we observe a scaling law linking the number of black pixels N(εi) corresponding to the distance εi from the counting centre. This relation reads as N(εi) = a εi^D (1) where D is the fractal dimension and a a prefactor of shape." Then eq. (2): log N(εi) = D log εi + log a. Location: section "Identifying Haken's control parameters due to spatial transformation: Measuring empirical structures over time", Fig. 3 / eqs (1)–(2); printed page ≈1034 per the PDF parser — **page number not independently confirmed**.
**Surprise:** this is mainly a planning-theory / complexity paper; radial analysis is a sub-section. For the mass–radius method itself, Frankhauser's own methods papers would be a more canonical cite (not checked here). The paper does not state D = 2 for uniform density (it mentions households dissatisfied "when the fractal dimension D was close to 2", per parser — unverified wording).

---

## 12. anselin1995lisa — STATUS: CHECKED (ABSTRACT)

**Metadata (Crossref):** Luc Anselin. "Local Indicators of Spatial Association—LISA". *Geographical Analysis* 27(2):93–115, Apr 1995. DOI 10.1111/j.1538-4632.1995.tb00338.x. Matches.

**Claim:** local decomposition of global spatial association statistics — **SUPPORTED (ABSTRACT)**: "I outline a new general class of local indicators of spatial association (LISA) and show how they allow for the decomposition of global indicators, such as Moran's I, into the contribution of each observation."

---

## Open items (to be updated)
- brunsdon2002gwss (b), (c): full text not yet read.
- brunsdon1996gwr: moving-window/sudden cut-off quote not yet read.


---

# E2 claim verification: glyph maps, within-cell encodings, glyph theory, comparison

Verified 2026-09-23. Evidence levels:
- FULLTEXT: I read the paper's text (the version of record or an author-deposited copy, as noted per item).
- ABSTRACT: I read only the abstract.
- METADATA-ONLY: I checked only the bibliographic record.

Quotes are verbatim from the text I loaded.

---

## 1. `slingsby2018tilemaps`

**How metadata was verified**
- City Research Online record https://openaccess.city.ac.uk/id/eprint/20884/, loaded:
  - Listed as "Paper presented at the VIS 2018, 21-26 Oct 2018, Berlin, Germany", "Conference or Workshop Item (Paper)".
  - Status "Unpublished", refereed "Yes".
  - Its "Official URL" is the IEEE VIS 2018 *posters* page.
- Archived VISREG 2018 schedule (web.archive.org snapshot 2019-12-27 of isgwww.cs.ovgu.de/visualisierung/visreg/schedule.html), loaded:
  - Session "Summarization", Mon 22 Oct 2018.
  - Entry: "Paper Talk Tilemaps for Summarising Geographical Variation in Multivariate Data by Aidan SLINGSBY".
- A Crossref bibliographic search found no DOI.
- The PDF (accepted version) was read in full.

**Claim: tilemaps/glyph arrays summarising multivariate outputs of geographically weighted statistics.** **PARTLY**, FULLTEXT.
- *Regular glyph arrays: supported.* Abstract: "We discuss the 'tilemap' design space which encompasses approaches that use regular arrays of glyphs to depict geographical variation in multivariate data."
- *Geographically weighted (GW) statistics: named as a focus, not demonstrated.*
  - Abstract: "…showing associations between variables and studying multivariate outputs of geographically-weighted statistics."
  - §3.3 only argues potential: "Tilemaps may be a good means to do this." and "There is potential for tilemaps to assist with this."
  - No figure shows GW output. Cite it as a proposal or design space, not as a demonstration.

**Surprises**
- **Title mismatch.** The workshop schedule gives the talk title in a different word order ("…Summarising Geographical Variation in Multivariate Data").
- **"Poster" vs "workshop".** The repository's "Official URL" points to the VIS 2018 posters page, but the schedule confirms a VISREG workshop paper talk.
  - The VISREG site said the papers "will be published at the IEEE Xplore Digital Library (with DOI)", but I found no DOI.
  - Later citations call it the VISREG workshop: Slingsby 2023 (ref 15, also in Crossref) and Laksono 2024.
- **MAUP and re-gridding are already discussed here (§3.1).**
  - "One way to explore the effects of this is to have an interactive environment where the grid can be interactively panned and have its size changed."
  - It also proposes "a distance-decay kernel that is larger than the tiles".
  - Fig. 5 caption: "Interactive resizing of tiles…".
- Tiles are squares "but they could be other symmetrical tessellating shapes".

---

## 2. `slingsby2023gridded`

**How metadata was verified**
- Crossref, 10.1109/VIS54172.2023.00009:
  - Authors: Aidan Slingsby, Richard Reeve, Claire Harris.
  - Container: "2023 IEEE Visualization and Visual Analytics (VIS)", pp. 1–5, IEEE, Melbourne, 21–27 Oct 2023.
- Full text read from the City Research Online accepted version (eprint 31115).

**Claim (a): glyphs are placed in a regular grid.** **SUPPORTED**, FULLTEXT (§3). The approach uses "a 'gridded glyphmap' [7, 15, 20] that regularly grids space, aggregating data within each cell and embedding a multivariate glyph in each."

**Claim (b): interactive re-gridding (grid size changes) as the user zooms.** **PARTLY**, FULLTEXT. Needs rewording.
- On zoom, the grid is fixed in *screen space* and the data are re-aggregated, so each cell's *geographic* size changes. §3: "The fixed gridded discretisation of screen space produces grid cells of fixed screen position and size, but when the underlying data are zoomed and panned, they are reaggregated on-the-fly…"
- Changing the *screen* cell size is a separate user control. §3.3: "Analysts can also interactively change the screen-based size of the cells…"
- Suggested phrasing: "semantic zoom re-aggregates data into a fixed screen-space grid, so the geographic resolution of cells changes with zoom; cell screen size is separately adjustable".

**Surprises**
- The repository notes "Best VIS Short Paper".
- **Within-cell heterogeneity is named as future work (§5), directly relevant to within-cell encodings:** "…designing glyphs that convey the heterogeneity within cells could alert analysts where to inspect at a finer resolution, for example, showing the data by quartile."
- **MAUP (§5):** "The repeated reaggregation of gridded glyphmaps makes them particularly vulnerable to this." Also: "Glyph stability when interactively panning gives a visual indication of the impact of MAUP."
- Opacity encodes population size (the denominator) to de-emphasise unstable proportions (§3.2).
- Source data are at 1 km² resolution (Scotland).

---

## 3. `laksono2024gridded`

**How metadata was verified**
- DataCite, 10.2312/evs.20241062 (not in Crossref; Crossref returns 404):
  - Authors: Dany Laksono, Aidan Slingsby, Radu Jianu.
  - Title: "Gridded-glyphmaps for supporting Geographic Multicriteria Decision Analysis".
  - Container: "EuroVis 2024 - Short Papers". Editors: Tominski, Waldner, Wang. ISBN 978-3-03868-251-6. CC-BY 4.0. "5 pages".
- The diglib record gives no page range.
- Full text read from the diglib PDF.

**Claim: gridded glyphmaps applied to GMCDA, and what the glyphs encode.** **SUPPORTED**, FULLTEXT.
- *What the glyphs encode.* Fig. 1 caption: "'Rose chart' (a) and 'bar chart' (b) designs encoding decarbonisation parameters (colour hues), cell's score (bar height and pie radius), weights (bar and pie width), and weights' signs (textured for barriers)."
- *Line-chart glyph.* The caption continues: "'Line charts' (c) records the recent history (x-axis) of adjustments to parameter scores (color hues; y-axis) with the model output score encoded in cell backgrounds…"
- *Model and grid (§4).*
  - The model is Simple Additive Weighting (SAW).
  - Weights range from −1 to 1.
  - "The LSOA level data are resampled into 5 × 5 km2 grids."
  - The case study is decarbonisation planning in Cambridge, UK, with AITL.

**Surprises**
- **No user study.** Evaluation is informal feedback from AITL only.
- **MAUP mitigation (§5):** "We mitigate this by interactively faciliting [sic] different discretisations (through grid offsetting and sizes)."
- The paper attributes gridded glyphmaps to [Sli18], citing it as "Workshop on Visual Summarization and Report Generation at VIS 2018". This matches item 1.
- **Grid size may be a typo in the source.** "5 × 5 km²" cells seem coarse for Cambridge. I report the text as written.

---

## 4. `wickham2012glyphmaps`

**How metadata was verified**
- Crossref, 10.1002/env.2152:
  - Authors: Hadley Wickham, Heike Hofmann, Charlotte Wickham, Dianne Cook.
  - Environmetrics 23(5):382–393. Published online 2012-07-05; print Aug 2012.
- Full text read from the authors' preprint (vita.had.co.nz/papers/glyph-maps.pdf), **not the version of record**. The Crossref abstract (version of record) was also read.

**Claim: small temporal glyphs placed on a regular geographic grid.** **SUPPORTED**, FULLTEXT (preprint) + ABSTRACT (version of record).
- Fig. 2 caption (preprint): "Time series of the six years of monthly temperature are plotted at each spatial grid location."
- Version-of-record abstract: "Each spatial location is displayed with one glyph that represents the multiple measurements, often recorded over time, at that location." It adds that the methods "are developed for rectangular gridded data".

**Nuance**
- Glyphs sit at the *data's* grid locations; the grid is not imposed as binning.
- §5 covers irregular locations (overlap, collapsing, rounding to a grid).
- Line glyphs and star glyphs are both used; §6 also uses scatterplot and loess glyphs.
- Reference boxes and lines are an explicit design element.

**Surprise:** the preprint's wording differs somewhat from the version-of-record abstract. Quote the version of record where possible.

---

## 5. `mcnabb2019multivariate`

**How metadata was verified**
- Crossref, 10.3390/info10100302:
  - Authors: Liam McNabb, Robert S. Laramee.
  - Information 10(10):302, published 2019-09-28, CC-BY.
- The MDPI site blocked automated access. I read the author preprint "Version September 23, 2019 submitted to Information" (people.cs.nott.ac.uk/blaramee/…/mcnabb19multivariate.pdf).

**Claims: glyph placement with level of detail, dynamic zoom and smooth transitions.** **SUPPORTED**, ABSTRACT (version of record) + FULLTEXT (preprint).
- Abstract: "The algorithm features a unique combination of guided glyph placement, level-of-detail, dynamic zooming, and smooth transitions."
- Smooth transitions, §4.5 (preprint): "glyphs translate towards the origin of their parent in the hierarchy while the opacity is reduced until it is no longer visible. The parent increases in opacity until it is fully opaque…"

**Nuance**
- Placement is at centroids of hierarchically amalgamated areas, chosen by a minimum screen-area threshold *m*. It is not grid placement.
- The authors compare against a Cartesian 20² grid placement.
- There is no user study (§6: "could be more carefully compared … with a user-study evaluation").

**Surprise:** the paper describes Ward (2002) as having "15 glyph placement strategies" and classes its own method as "data-driven" (derived).

---

## 6. `trautner2022honeycomb`

**How metadata was verified**
- DataCite, 10.2312/vmv.20221205:
  - Authors: Thomas Trautner, Maximilian Sbardellati, Sergej Stoppel, Stefan Bruckner.
  - Container: "Vision, Modeling, and Visualization", pp. 65–73. Editors: Bender, Botsch, Keim. Eurographics. ISBN 978-3-03868-189-2. CC-BY.
- Full text read from the author PDF (vis.uib.no/…/Trautner-2022-HCP.pdf).
- Page 2 of the PDF corresponds to p. 66 of the proceedings.

**Claim (a): the diamond cut fits a regression plane to within-hexagon density and cuts the glyph to show the within-tile trend.** **SUPPORTED**, FULLTEXT (§3.2).
- "we cut hexagonal pyramids so that their cut surface corresponds to the regression plane of the contained points, i.e., a fit plane that best approximates the underlying density distribution."
- *Nuance on how the plane is computed (§5).* It is not a least-squares fit to raw points. Per-pixel normals come from central differences of the KDE density and are summed per tile; "Their normalized sum then corresponds to the regression-plane normal."

**Claim (b): amber inclusions show individual points through the tile.** **PARTLY**, FULLTEXT (§3.3).
- *Mechanism.* It uses "a per-tile opacity modulation mapping the transparency of a tile … to the interval [0, density of the densest tile]". Points therefore show through low-density (sparse) tiles; dense tiles are near-opaque.
- *Not tested for effectiveness (§8).* "We, furthermore, have not tested the effectiveness of amber inclusions but rather analyzed whether they negatively impact other encodings."

**Claim (c): relief mosaic.** **SUPPORTED**, FULLTEXT.
- Contribution list: "An interpretation of hexagonal tiles as relief mosaic where ambient occlusion serves as a subtle aid to perceive nuanced color differences between neighboring discrete tiles."
- Tile height = density. Ambient occlusion is computed analytically from up to six neighbouring side walls (§3.1).

**Claim (d): user-study findings on the diamond cut.** **SUPPORTED**, FULLTEXT (§7).
- *Design.*
  - Online, between-subject, 42 participants (11 heat map, 10 relief mosaic, 9 diamond cut, 12 amber inclusions).
  - 4 questions × 3 synthetic datasets.
  - Pairwise Kruskal-Wallis tests.
- *Slope tasks, mean error.* Diamond cut 3.7% (Q2) and 0.0% (Q4), versus heat map 72.7% and 93.9%.
- Quote: "For H2, we found strong evidence that our diamond cut metaphor is effective in facilitating slope encoding tasks, as both DC and AI performed significantly better than HM and RM on a global (Q2) as well as a local (Q4) level."
- *Caveats.*
  - For value estimation, the diamond cut's global error (33.3%) was not significantly better than the heat map's (39.3%).
  - Times were measured but not analysed.
  - All stimuli were synthetic.

**Claim (e): paraphrase check.** The actual sentence (§1, confuser C3, p. 66): "C3: Heat maps only encode the quantity of aggregated points, so that uniform distributions within tiles cannot be distinguished from clusters or trends if their numbers of points match."
- The paraphrase is essentially verbatim.
- It is framed as an algebraic-visualization-design "confuser" of *heat maps*, meaning colour-coded hexbins.
- **Recommendation:** use quotation marks and attribute it to classic colour-only hexbin/heat-map tiles.

**Surprises**
- **Grid sensitivity (§8):** "Using a diamond cut for shape parameters also requires caution, especially if a grid layout is not implicitly defined since features may change if the grid is scaled, shifted, or rotated."
- The target is generic 2D point data (hexplots), although one usage example is geographic (US tornadoes).
- **Unverified:** the "Best Paper VMV 2022" status appears only in a search snippet (vis.uib.no). I did not load that page.

---

## 7. `kawakami2024hextiles`

**How metadata was verified**
- arXiv abs page (loaded):
  - v1 only, submitted 10 Jul 2024. No journal-ref.
  - arXiv DOI 10.48550/arXiv.2407.16897.
  - Authors: Yuya Kawakami, Sarah Yuniar, Kwan-Liu Ma (UC Davis).
- **Published version: none found.**
  - A Crossref bibliographic query returned no match.
  - A web search found only arXiv and ResearchGate.
  - The PDF carries a TVCG template placeholder ("Digital Object Identifier: xx.xxxx/TVCG.201x.xxxxxxx").
- Full text read (arXiv v1).

**Claim: within-tile (weighted) variance as a per-tile confidence encoding, argued as MAUP mitigation.** **SUPPORTED**, FULLTEXT.
- Abstract: "We calculate weighted variances of the variables in each HexTile to provide a confidence value for each tile, which can be used to interpret the variability of the data within the corresponding geospatial area."
- §3.1.3: "we calculate a spatially-weighted variance for each of the variables we encode for each HexTile region. Then, we express that via Value-Suppressing Uncertainty Palettes (VSUP) [14], inner ring thickness, and opacity…"
- Per Table 1, each channel's confidence has its own encoding:
  - base colour → VSUP;
  - semantic icons → opacity;
  - inner ring → thickness.
- The MAUP argument targets the aggregation effect (Fig. 4). Zooming via H3 resolutions is said to mitigate the scale effect.

**Weighting formula:** **NOT PRESENT in the full text.** Only a verbal description is given.
- §4.1 defines the "spatially-weighted mean (i.e. a mean that takes into account the amount of overlap between the HexRegion and the data…)".
- §4.1 continues: "We adopt a weighted variance calculation; however, metrics like Moran's I … can be used as well."
- There are no equations. Do not attribute a specific formula to them.

**Claim: evaluation (user study + domain feedback).** **PARTLY**, FULLTEXT. The evaluation exists but is weak for the variance claim.
- *User study design.*
  - 7 participants, 2 tasks.
  - HexTiles compared against Square-glyphs.
  - "HexTiles without the variance encoding was used in the study".
- *Results.* "At a significance level of α = 0.05, we failed to reject the null hypothesis for all hypotheses." The best result was H3 at p = 0.117. Levene's test showed significantly lower variance for T1 error and T2 time.
- *How the variance encoding was assessed.* Only through qualitative participant comments, plus an expert review with 3 water-resource-management experts (ecology/hydrology).

**Surprises**
- The conclusion ("significantly less mental load"; "some evidence … more accurate") is stronger than the statistics support (n = 7; no significant accuracy or time effects).
- The confidence encoding was never tested quantitatively.

---

## 8. `ward2002taxonomy`

**How metadata was verified**
- Crossref, 10.1057/palgrave.ivs.9500025: Matthew O Ward; Information Visualization 1(3-4):194–210, Dec 2002; now published by SAGE.
- Full text read from the author manuscript (davis.wpi.edu/xmdv/docs/jinfovis02_glyphpos.pdf), **not the version of record**.

**Claim: distinguishes data-driven and structure-driven glyph placement.** **SUPPORTED**, FULLTEXT (§2.2): "The first consideration when selecting a placement strategy is whether the placement will be data-driven (e.g., based on two or more data dimensions) or structure-driven (e.g., based on an explicit or implicit order or other relationship between data points)."

**Full category list**
- *Data-driven: raw and derived.* §3: "The two categories of this strategy class are raw and derived".
  - Raw: data dimensions used directly as position.
  - Derived: PCA, MDS, SOM, barycentric/anchor methods, and field-data resampling as a raw/derived hybrid.
  - Each has an optional distortion step to reduce overlap.
- *Structure-driven: ordered, hierarchical, network/graph.* §4: "ordered, hierarchical, or generalized network/graph structures".
  - Ordered may be linear or grid-based.
  - Distortion options: overlap reduction and space padding.
- *Placement considerations beyond the two classes (§2.2):*
  - whether overlaps are allowed;
  - screen utilisation versus white space;
  - post-placement position adjustment.
- *Conclusion:* "Methods were divided between data-driven and structure-driven approaches, and a variety of post-processing distortions were described."

**Surprises**
- **Regular-grid glyphs are data-driven.** Glyphs on a user-controlled regular grid over a field (e.g., flow arrows) are classed as data-driven (raw/derived hybrid), not structure-driven. This matters if the paper classes gridded glyph maps.
- Ward notes that no formal user studies of layout strategies existed at the time (§5).

---

## 9. `borgo2013glyph`

**How metadata was verified**
- DataCite, 10.2312/conf/EG2013/stars/039-063:
  - Authors: Rita Borgo, Johannes Kehrer, David H. S. Chung, Eamonn Maguire, Robert S. Laramee, Helwig Hauser, Matthew Ward, Min Chen.
  - Container "Eurographics 2013 - State of the Art Reports", ISSN 1017-4656, "25 pages".
- **DataCite's publicationYear is 2012, which is wrong.** The PDF header reads "EUROGRAPHICS 2013/ M. Sbert, L. Szirmay-Kalos STAR – State of The Art Report".
- Pages 39–63 are inferred from the DOI suffix. They are consistent with DataCite's 25 pages and with McNabb 2019's citation.
- Full text read from the vis.uib.no copy.

**Claim: survey of glyph design principles and guidelines.** **SUPPORTED**, FULLTEXT.
- Abstract: "…reviewing existing design guidelines and implementation techniques, and surveying the use of glyph-based visualization in many applications."
- §3, "Design Criteria and Guidelines", covers:
  - Gestalt principles;
  - a visual-channel taxonomy (Table 1);
  - Maguire et al.'s guidelines (semantic relevance, channel composition, pop-out, visual hierarchy);
  - Chung et al.'s eight criteria: typedness, visual orderability, channel capacity, separability, searchability, learnability, attention balance, focus and context.

**Nuance:** these guidelines are largely compiled from prior work (Chung et al., Maguire et al., Ward, Lie et al.), not newly proposed. Credit the original sources where specific.

---

## 10. `fuchs2017glyph`

**How metadata was verified**
- Crossref, 10.1109/TVCG.2016.2549018: Johannes Fuchs, Petra Isenberg, Anastasia Bezerianos, Daniel Keim; IEEE TVCG 23(7):1863–1879, July 2017.
- Full text read from the author version (petra.isenberg.cc/publications/papers/Fuchs_2017_ASR-authorversion.pdf). HAL blocked automated access.

**Claim: reviews controlled experiments on data glyphs.** **SUPPORTED**, FULLTEXT.
- Abstract: "We systematically reviewed 64 user-study papers on data glyphs…"
- §1: "…focusing on the analysis of 64 papers with quantitative controlled studies."

**Claim: notes gaps in the evidence.** **SUPPORTED**, FULLTEXT.
- §4.3 summary: "The influence of background and layout on reading data glyphs has so far received little research attention."
- §6: "Only one study investigated performance changes for glyph designs when placed on top of different geographic maps [36]…"

**Surprises (useful for glyph maps)**
- 56.25% of studies used grid layouts; 15.63% used geographic arrangements.
- In the one map-background study (Martin), "the glyphs in his study were arranged in a grid on top of a map, and not according to their geographic position."
- The reviewed studies overwhelmingly used synthetic data (64%).

---

## 11. `gleicher2011comparison`

**How metadata was verified**
- Crossref, 10.1177/1473871611416549: Michael Gleicher, Danielle Albers, Rick Walker, Ilir Jusufi, Charles D. Hansen, Jonathan C. Roberts; Information Visualization 10(4):289–309, Oct 2011.
- Full text **not accessed**: the UW page returned 404 and SAGE is paywalled.

**Claim: juxtaposition, superposition and explicit encoding are the three comparison designs.** **SUPPORTED**, ABSTRACT.
- "…we propose a general taxonomy of visual designs for comparison that groups designs into three basic categories, which can be combined."
- "…all designs are assembled from the building blocks of juxtaposition, superposition and explicit encodings."

**Nuance:** the abstract says the categories "can be combined", so hybrids are expected. It also uses the plural "explicit encodings".

---

## 12. `boeing2019urban`

**How metadata was verified**
- Crossref, 10.1007/s41109-019-0189-1: Geoff Boeing; Applied Network Science vol. 4, issue 1, article-number 67; published 2019-08-23; CC-BY. Crossref also links an OSF preprint.
- Full text read from arXiv 1808.00600v4, which says it "is a preprint of" this article.

**Claim: polar histograms of street bearings per city, and orientation entropy.** **SUPPORTED**, FULLTEXT (preprint).
- *Polar histograms:* "To better visualize spatial order and entropy, we plot polar histograms of each city's street orientations. Each polar histogram contains 36 bins…"
- *Entropy:*
  - Shannon entropy of the 36-bin bearing distribution (natural log, so values are in nats).
  - Maximum is 3.584 nats; an idealised four-way grid is 1.386.
  - An orientation-order index φ is derived from it.
- The sample is 100 cities.

**Nuance**
- Each edge adds both its bearing and the reciprocal bearing.
- Bins are shifted by −5° so that 0°, 90°, etc. sit at bin centres.
- Weighted and unweighted entropies are nearly identical (r > 0.99).

---

## 13. `mardia1999directional`

**How metadata was verified**
- Crossref, 10.1002/9780470316979:
  - Kanti V. Mardia, Peter E. Jupp.
  - "Directional Statistics", monograph, Wiley, series "Wiley Series in Probability and Statistics".
  - published-print 1999-01-03. ISBN 9780471953333 (print), 9780470316979 (electronic).
- Many sources cite it as 2000 (Chichester). I did not verify the printed copyright year.

**Claims: circular mean direction, mean resultant length R, and circular standard deviation √(−2 ln R) are standard definitions in this book.** **CANNOT ACCESS**, METADATA-ONLY. No excerpt of the book could be loaded.
- A search snippet (not loaded) from a 2009 Geophysical Journal International paper reads "v = √(−2 log R̄) … (eq. 2.3.11 of Mardia & Jupp. 2000, p. 19)". This is secondary, unverified corroboration.
- **Recommendation:** check eq. 2.3.11, p. 19 in a physical or library copy before citing a specific equation number.

---

## 14. `nusrat2016cartograms`

**How metadata was verified**
- Crossref, 10.1111/cgf.12932: Sabrina Nusrat, Stephen Kobourov; Computer Graphics Forum 35(3):619–642, June 2016 (online 2016-07-04).
- Full text also read on arXiv 1605.08485v3.

**Claim: survey of cartograms.** **SUPPORTED**, ABSTRACT (version of record) + FULLTEXT (arXiv). "This Work surveys cartogram research in visualization, cartography and geometry, covering a broad spectrum of different cartogram types…"
- It covers history, algorithms, and the three design dimensions (statistical, geographical, topological accuracy).
- It also covers task taxonomies, evaluations, and design guidelines.

**Surprises:** none. The Crossref abstract has odd capitalisation ("World", "Work").


---


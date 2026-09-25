# Paper draft

Working draft of a paper on summarising map lenses, built from this repository.
It is for sharing with co-authors, not for submission yet. The positioning
argument behind it is in [`../docs/positioning.md`](../docs/positioning.md).

## Build

```bash
latexmk -pdf main.tex                 # or: pdflatex, bibtex, pdflatex, pdflatex
node scripts/check-bib.mjs            # citation hygiene (add --online to resolve DOIs)
node scripts/figures.mjs              # regenerate figures/ from the library (Playwright)
node scripts/bench.mjs                # regenerate the timing table's numbers
node scripts/solver-check.mjs         # solver vs exact references: order, full ring (~5 min)
node scripts/interval-check.mjs       # solver vs Dykstra with feasible intervals (seconds)
```

The two check scripts are the evidence behind §3.5's claims. Their saved
output is in `figures/solver-check.txt` and `figures/interval-check.txt`.

The class is plain `article`, because the venue is undecided. Porting to the
IEEE VIS (vgtc) or EuroVis (egpubl) template is mechanical once it is chosen.

## Conventions

- `\doubt{…}` (orange) marks a claim, reading or citation use that is not fully
  verified, and says what would settle it.
- `\todo{…}` (red) marks work the authors still have to do.
- `\annotatefalse` in `main.tex` hides both for a clean read. Never use it for
  submission while any remain.
- `\sys` is the system's name in one place. **GlyphLens is already taken** (Tong,
  Li & Shen, TVCG 2017), so the library must be renamed.
- The appendix, "citation audit", lists the evidence behind each source and is
  removed before submission. The full record, with quotes, is
  [`citation-audit.md`](citation-audit.md).

## What is and is not in it

- **Written:** the seven-stage model; related work across five literatures; a
  provisional coding of existing techniques; the new configurations and the
  lens-to-glyphmap continuum; implementation with measured timings; the
  evaluation *plan*; discussion and limitations.
- **Not yet done:**
  - **No study has been run.** The central claim — that bearing-faithful
    placement helps — is a design conjecture, and the draft says so.
  - The coding table is single-coder and provisional.
  - There is no teaser figure yet.
  - The venue, title, author order and affiliations are placeholders.

Every figure is regenerated from the library on the bundled OpenStreetMap
extract. Nothing is drawn by hand.

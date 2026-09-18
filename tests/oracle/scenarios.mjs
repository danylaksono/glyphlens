/**
 * Necklace problems to put both engines through, in CartoCrow's units:
 * a circle of radius `R`, beads of base radius `r`, feasible arcs in radians.
 *
 * Chosen to cover what the two implementations disagree about rather than what
 * they share: even spreads (where the necklace's total capacity binds), crowded
 * arcs (where interval endpoints bind), arcs of wildly different width (where
 * the two engines' orderings differ), and the degenerate ends.
 */

const TAU = Math.PI * 2;
const wrap = (a) => ((a % TAU) + TAU) % TAU;

/** A bead of base radius `r`, with an arc of `lenRad` centred on a bearing. */
const bead = (r, centreDeg, lenRad) => {
  const c = (centreDeg * Math.PI) / 180;
  return { r, from: wrap(c - lenRad / 2), to: wrap(c + lenRad / 2) };
};

export const scenarios = {
  'equal-quartet': {
    note: '4 equal beads, evenly spread, 1 rad arcs — the necklace capacity binds',
    R: 100,
    beads: [0, 90, 180, 270].map((d) => bead(20, d, 1)),
  },
  'unequal-spread': {
    note: '6 beads, values spanning 25x, evenly spread',
    R: 100,
    beads: [[30, 0], [12, 55], [22, 120], [8, 170], [26, 235], [15, 300]].map(([r, d]) =>
      bead(r, d, 1.2),
    ),
  },
  clustered: {
    note: '8 beads whose arcs crowd one half of the circle — interval endpoints bind',
    R: 100,
    beads: [10, 25, 40, 55, 70, 95, 120, 150].map((d, i) => bead(10 + (i % 4) * 4, d, 0.7)),
  },
  'wide-wedges': {
    note: '7 beads with arcs of very different widths — the two orderings diverge',
    R: 100,
    beads: [
      bead(18, 20, 2.4), bead(9, 75, 0.35), bead(24, 130, 1.6), bead(11, 190, 0.5),
      bead(16, 240, 3.0), bead(20, 300, 0.9), bead(7, 340, 0.25),
    ],
  },
  sparse: {
    note: '12 small beads, wide arcs — several arcs straddle the seam at t = 0',
    R: 100,
    beads: Array.from({ length: 12 }, (_, i) => bead(4 + (i % 3), i * 30 + (i % 5), 2.0)),
  },
  'near-full': {
    note: 'beads that nearly fill the necklace',
    R: 100,
    beads: [0, 60, 120, 180, 240, 300].map((d) => bead(45, d, 1.5)),
  },
  'seam-pair': {
    note: 'two beads that both want the same bearing, one on a narrow arc across the seam',
    R: 100,
    beads: [bead(19.23, 359.7, 0.213), bead(12.5, 0.8, 2.419)],
  },
  pair: { note: '2 beads, far apart', R: 100, beads: [bead(30, 40, 1.0), bead(18, 200, 1.0)] },
  single: { note: '1 bead', R: 100, beads: [bead(30, 40, 1.0)] },
  buffered: {
    note: '5 beads with a 0.05 rad buffer required between them',
    R: 100,
    buffer: 0.05,
    beads: [0, 70, 140, 210, 280].map((d, i) => bead(12 + i * 3, d, 1.1)),
  },
  'coincident-targets': {
    note: '4 beads with whole-circle arcs — every one wants the same spot',
    R: 100,
    beads: [0, 100, 200, 300].map(() => ({ r: 15, from: 0, to: TAU })),
  },
  'wide-arcs': {
    note: '6 beads with 6.0 rad arcs — nearly unconstrained',
    R: 100,
    beads: [0, 60, 120, 180, 240, 300].map((d, i) => bead(10 + i * 2, d, 6.0)),
  },
};

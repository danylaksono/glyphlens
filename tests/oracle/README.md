# Checking the placement engine against CartoCrow

[CartoCrow](https://github.com/tue-alga/cartocrow) is the Applied Geometric
Algorithms Group's implementation of Speckmann & Verbeek's necklace maps — the
reference this library is a JavaScript answer to. It is the only thing we can
check ourselves against, so this directory runs it and records what it said.

`fixture.json` is that record. `../necklace-oracle.test.mjs` replays our engine
over the same problems and runs in CI, so nothing here needs CGAL day to day.
You only need the steps below to *regenerate* the fixture — after changing the
solver, or to extend the scenarios.

## What is actually being compared

The two engines answer different questions, and the comparison has to respect
that:

| | CartoCrow | glyphlens |
| --- | --- | --- |
| given | values and feasible arcs | symbol widths and preferred positions |
| solves for | the largest symbol scale that still fits, then a placement | the placement that minimises displacement |
| placement rule | attraction to the arc midpoint, repulsion from neighbours, iterated | weighted least-squares displacement, solved exactly for a fixed order |
| non-overlap | chord distance between centres ≥ sum of radii | angular gap ≥ sum of covering angles |
| containment | the bead *centre* inside its arc | the *whole symbol* inside its arc |

`model.mjs` documents and implements the bridge between the two models. The
comparable quantities are: how large the symbols can get, whether the output
obeys the constraints, and how far each symbol lands from its target.

## Getting CartoCrow

The necklace_map module was **removed from CartoCrow's master** in commit
`de6b90c` (2026-04-13), so check out its parent:

```sh
git clone https://github.com/tue-alga/cartocrow.git
cd cartocrow
git fetch --depth 1000 origin master
git checkout de6b90c^          # 93a3703, the last commit with necklace_map
```

## Building the oracle

`oracle.cpp` is a thin driver around CartoCrow's own `ComputeScaleFactor` and
`ComputeValidPlacement`: it feeds beads and arcs in, and prints what CartoCrow
computed as JSON. It needs CGAL, but none of CartoCrow's Qt/GDAL/ipelib stack,
because the rendering sources are left out.

```sh
apt-get install -y libcgal-dev libboost-dev libgmp-dev libmpfr-dev

CC=path/to/cartocrow
NM=$CC/cartocrow/necklace_map
g++ -std=c++20 -O2 -I$CC -o oracle oracle.cpp \
  $NM/check_feasible/*.cpp $NM/detail/*.cpp \
  $NM/scale_factor/compute_scale_factor.cpp \
  $NM/scale_factor/compute_scale_factor_any_order.cpp \
  $NM/scale_factor/compute_scale_factor_fixed_order.cpp \
  $NM/scale_factor/detail/compute_scale_factor_any_order.cpp \
  $NM/scale_factor/detail/compute_scale_factor_fixed_order.cpp \
  $NM/valid_placement/*.cpp \
  $NM/bead.cpp $NM/circle_necklace.cpp $NM/circular_range.cpp $NM/necklace.cpp \
  $NM/necklace_interval.cpp $NM/necklace_shape.cpp $NM/parameters.cpp $NM/range.cpp \
  $CC/cartocrow/core/core.cpp -lgmp -lmpfr
```

Leave out `painting.cpp` (it pulls in the renderer) and
`compute_scale_factor_any_order_ingot.cpp` (not in CartoCrow's own build either).

## Running it

```sh
node tests/oracle/generate.mjs ./oracle   # rewrites fixture.json, prints the tables
node tests/oracle/fuzz.mjs 200 ./oracle   # 200 random instances, fixed seed
```

`generate.mjs` covers the scenarios in `scenarios.mjs`, chosen for where the two
implementations disagree. `fuzz.mjs` is the statistical version: it reports how
often each engine's own output breaks its own rules, how large our symbols get
next to CartoCrow's, and how the displacement compares.

What both runs found is written up in `docs/findings.md` under F-37.

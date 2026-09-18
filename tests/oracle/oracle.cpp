// Thin driver around CartoCrow's necklace_map module, used as a correctness
// oracle for glyphlens/src/core/necklace.js.
//
// Input (stdin, whitespace separated):
//   R buffer_rad order placement_cycles aversion_ratio bsd heuristic_cycles n
//   r_base_1 feasible_from_1 feasible_to_1
//   ...
// order: 0 = fixed, 1 = any
// argv[1]: "auto" (use CartoCrow's optimal scale) or an explicit scale factor.
//
// Output: JSON on stdout.

#include <cmath>
#include <cstdio>
#include <iostream>
#include <map>
#include <memory>
#include <vector>

#include "cartocrow/core/core.h"
#include "cartocrow/necklace_map/bead.h"
#include "cartocrow/necklace_map/circle_necklace.h"
#include "cartocrow/necklace_map/necklace.h"
#include "cartocrow/necklace_map/parameters.h"
#include "cartocrow/necklace_map/scale_factor/compute_scale_factor.h"
#include "cartocrow/necklace_map/valid_placement/compute_valid_placement.h"

using namespace cartocrow;
using namespace cartocrow::necklace_map;

int main(int argc, char** argv) {
	double R, buffer_rad, aversion_ratio;
	int order, placement_cycles, bsd, heuristic_cycles, n;
	if (!(std::cin >> R >> buffer_rad >> order >> placement_cycles >> aversion_ratio >> bsd >>
	      heuristic_cycles >> n)) {
		std::cerr << "bad header\n";
		return 1;
	}

	Parameters params;
	params.interval_type = IntervalType::kCentroid;
	params.order_type = order == 0 ? OrderType::kFixed : OrderType::kAny;
	params.buffer_rad = buffer_rad;
	params.placement_cycles = placement_cycles;
	params.aversion_ratio = aversion_ratio;
	params.binary_search_depth = bsd;
	params.heuristic_cycles = heuristic_cycles;

	auto shape = std::make_shared<CircleNecklace>(
	    Circle<Inexact>(Point<Inexact>(0, 0), R * R));
	std::vector<Necklace> necklaces;
	necklaces.emplace_back(shape);
	Necklace& necklace = necklaces.front();

	std::map<Bead*, int> index_of;
	for (int i = 0; i < n; ++i) {
		double r, from, to;
		std::cin >> r >> from >> to;
		auto bead = std::make_shared<Bead>(nullptr, r * r, 0); // radius_base = sqrt(value) = r
		bead->feasible = CircularRange(from, to);
		bead->angle_rad = bead->feasible.from();
		necklace.beads.push_back(bead);
		index_of[bead.get()] = i;
	}

	const std::string mode = argc > 1 ? argv[1] : "auto";
	auto scaler = ComputeScaleFactor::construct(params);
	double optimal_scale = (*scaler)(necklaces);

	double scale = mode == "auto" ? optimal_scale : std::atof(mode.c_str());

	// Covering radii as the scale-factor step defines them (the wedge model).
	std::vector<double> covering(n);
	for (const auto& bead : necklace.beads) {
		covering[index_of[bead.get()]] =
		    shape->computeCoveringRadiusRad(bead->feasible, scale * bead->radius_base);
	}

	auto placer = ComputeValidPlacement::construct(params);
	(*placer)(scale, necklaces);

	std::printf("{\n  \"optimal_scale\": %.17g,\n  \"scale\": %.17g,\n  \"beads\": [\n",
	            optimal_scale, scale);
	std::vector<const Bead*> ordered(n, nullptr);
	for (const auto& bead : necklace.beads) {
		ordered[index_of[bead.get()]] = bead.get();
	}
	for (int i = 0; i < n; ++i) {
		const Bead* b = ordered[i];
		std::printf(
		    "    {\"i\": %d, \"radius_base\": %.17g, \"angle_rad\": %.17g, "
		    "\"covering_radius_rad\": %.17g, \"valid_from\": %.17g, \"valid_to\": %.17g, "
		    "\"feasible_from\": %.17g, \"feasible_to\": %.17g}%s\n",
		    i, b->radius_base, b->angle_rad, covering[i], b->valid.from(), b->valid.to(),
		    b->feasible.from(), b->feasible.to(), i + 1 < n ? "," : "");
	}
	std::printf("  ]\n}\n");
	return 0;
}

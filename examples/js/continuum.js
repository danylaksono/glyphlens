/**
 * The continuum — one lens to a gridded glyphmap, by one control.
 *
 * docs/design-space.md §5 claims a lens and a glyphmap are the same object at
 * different `hSpSubset` settings. This page is the claim under test: the only
 * thing the slider changes is how many centres the lattice has. Binning,
 * normalisation, the necklace solver and the renderer are the same code at
 * every position on it.
 */

import { addField } from '../../src/adapters/maplibre.js';
import { CATEGORICAL } from '../../src/render/style.js';

const $ = (id) => document.getElementById(id);

const CATEGORY_ORDER = ['food', 'retail', 'civic', 'health'];
const SAMPLE = 'data/yogyakarta.json';

// The slider is linear but the interesting range is not: the difference
// between 1 and 8 lenses matters far more than between 400 and 407, so the
// position maps onto count geometrically.
const MIN_COUNT = 1;
const MAX_COUNT = 900;
const countFor = (t) => Math.round(MIN_COUNT * (MAX_COUNT / MIN_COUNT) ** (t / 100));

const STAGES = [
  [1, 1, 'One lens. Focus and context: everything is read against a single place.'],
  [2, 12, 'Small multiples. Few enough to compare one against another by name.'],
  [13, 120, 'The glyphs start to read as a surface rather than as separate charts. Chrome is shedding as the rings shrink.'],
  [121, Infinity, 'A gridded glyphmap. Same solver, same marks — but now the pattern is in the field, not in any one glyph.'],
];

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/positron',
  center: [110.3695, -7.7956],
  zoom: 12.2,
  dragRotate: false,
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

let field;

map.on('load', async () => {
  const doc = await fetch(SAMPLE).then((r) => r.json());

  field = addField(map, {
    center: doc.center,
    data: doc.features,
    getPosition: (f) => [f.lng, f.lat],
    coverRadius: 4200,
    count: countFor(0),
    minCount: 3,
    binning: {
      mode: 'angular',
      bins: 12,
      category: (f) => f.category,
      categories: CATEGORY_ORDER,
    },
    normalisation: { mode: 'count' },
    placement: { mode: 'necklace' },
    marks: { type: 'bar', barWidth: 3 },
    style: { preset: 'paper', dimExterior: false },
    onChange: (state) => {
      $('stat-drawn').textContent = state.stats.drawn.toLocaleString();
      $('stat-ring').textContent = Math.round(state.ringRadius);
      $('stat-members').textContent = state.stats.members.toLocaleString();
    },
  });

  renderLegend('angular');
  bindControls();
  $('status').textContent =
    `${doc.features.length.toLocaleString()} places, ${doc.name} (${doc.retrieved}).`;
});

function bindControls() {
  $('count').addEventListener('input', (e) => {
    const count = countFor(Number(e.target.value));
    $('count-out').value = count.toLocaleString();
    $('stage-hint').textContent =
      STAGES.find(([lo, hi]) => count >= lo && count <= hi)?.[2] ?? '';

    // Marks have to thin out as the cells do, or neighbouring glyphs merge.
    field.update({
      count,
      marks: { barWidth: count > 200 ? 2 : count > 40 ? 3 : 6 },
    });
  });

  $('binning').addEventListener('change', (e) => {
    const mode = e.target.value;
    field.update({ binning: { mode, bins: mode === 'angular' ? 12 : undefined } });
    renderLegend(mode);
  });

  $('normalisation').addEventListener('change', (e) => {
    field.update({ normalisation: { mode: e.target.value, baseline: undefined } });
  });
}

function renderLegend(mode) {
  $('legend').innerHTML = mode === 'angular'
    ? `<li style="color:${CATEGORICAL[0]}"><i></i>`
      + '<span style="color:var(--muted)">all places, by bearing within each cell</span></li>'
    : CATEGORY_ORDER.map((c, i) =>
      `<li style="color:${CATEGORICAL[i]}"><i></i>`
      + `<span style="color:var(--muted)">${c}</span></li>`).join('');
}

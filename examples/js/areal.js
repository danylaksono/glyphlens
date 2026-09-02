/**
 * Areal lens — census-style geography.
 *
 * The units here are real kecamatan boundaries for Kota Yogyakarta; the
 * attributes are counts of OpenStreetMap amenities falling inside each one.
 * Real geography, real derived counts, and — importantly — an *aggregate*
 * table rather than the underlying points, which is the shape census data
 * actually arrives in.
 *
 * The point of the page is that one symbol per district, placed on the arc that
 * district actually occupies, is Speckmann & Verbeek's necklace map — and it
 * needed no new placement code, because the solver has taken feasible intervals
 * since the first commit (docs/findings.md F-1).
 */

import { addLens } from '../../src/adapters/maplibre.js';
import { CATEGORICAL } from '../../src/render/style.js';
import { BASEMAPS, DEFAULT_BASEMAP } from './basemaps.js';
import { mountDisplay, layerToggle } from './display.js';

const $ = (id) => document.getElementById(id);
const SOURCE = 'data/yogyakarta-districts.json';

/**
 * The measures, and what kind each is.
 *
 * Nothing about a number says whether it can be added up. A count of amenities
 * can; amenities per km² and the food share cannot — half a district has the
 * same density and the same share as the whole of it. Declaring `kind` is what
 * stops the library summing a column of rates (docs/findings.md F-21).
 */
const MEASURES = {
  total: {
    label: 'Amenities (count)',
    spec: { value: (f) => f.total, kind: 'extensive' },
    format: (v) => Math.round(v).toLocaleString(),
  },
  density: {
    label: 'Amenities per km² (rate)',
    spec: {
      value: (f) => (f.areaKm2 > 0 ? f.total / f.areaKm2 : 0),
      kind: 'intensive',
      weight: (f) => f.areaKm2,
    },
    format: (v) => v.toFixed(1),
  },
  foodShare: {
    label: 'Food as a share of amenities (rate)',
    spec: {
      value: (f) => (f.total > 0 ? f.counts.food / f.total : 0),
      kind: 'intensive',
      weight: (f) => f.total,
    },
    format: (v) => `${(v * 100).toFixed(0)}%`,
  },
};

const map = new maplibregl.Map({
  container: 'map',
  style: BASEMAPS[DEFAULT_BASEMAP].url,
  center: [110.3695, -7.7956],
  zoom: 12.6,
  dragRotate: false,
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

let lens;
let units = [];

map.on('load', async () => {
  const doc = await fetch(SOURCE).then((r) => r.json());
  units = doc.units;

  drawBoundaries(units);

  lens = addLens(map, {
    center: doc.centre,
    selection: { type: 'disc', radius: 2600 },
    data: units,

    // Areal mode. `getAnchor` would take a population-weighted centroid if we
    // had one; without population these units only have a geometric centre,
    // and the difference is a real limitation rather than a detail (Q-3).
    areal: { weighting: 'centroid' },

    binning: { measure: MEASURES.total.spec, label: (f) => f.name, key: (f) => f.code },
    normalisation: { mode: 'count' },
    placement: { mode: 'necklace' },
    marks: { type: 'bar', barWidth: 16, maxLength: 74, reserveLabels: true },
    style: { preset: 'paper', ringRadius: 150, showValues: true },

    onChange: (state) => {
      const measure = MEASURES[$('measure').value];
      $('stat-units').textContent = state.bins.filter((b) => b.raw > 0).length;
      $('stat-area').textContent = state.stats.areaKm2.toFixed(1);
      $('stat-shift').textContent = `${Math.round(state.stats.maxDisplacement)}°`;
      $('stat-value').textContent = measure.format(
        measure.spec.kind === 'intensive'
          ? weightedTotal(state.bins, measure)
          : state.stats.total,
      );
      $('stat-value-label').textContent =
        measure.spec.kind === 'intensive' ? 'lens average' : 'lens total';
    },
    onHover: (bin, e) => showTooltip(bin, e),
  });

  bindControls();
  renderLegend();
  $('status').textContent =
    `${units.length} kecamatan, ${doc.name} (${doc.retrieved}).`;
});

/** Re-derive the lens-level figure for an intensive measure. */
function weightedTotal(bins, measure) {
  let num = 0;
  let den = 0;
  for (const b of bins) {
    const item = b.items?.[0];
    if (!item) continue;
    const w = (measure.spec.weight?.(item.feature) ?? 1) * (item.weight ?? 1);
    num += (measure.spec.value(item.feature) ?? 0) * w;
    den += w;
  }
  return den > 0 ? num / den : 0;
}

function drawBoundaries(list) {
  // Called again after every basemap swap, since `setStyle` discards these.
  if (map.getSource('units')) return;
  map.addSource('units', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: list.map((u) => ({
        type: 'Feature',
        properties: { name: u.name },
        geometry: { type: 'Polygon', coordinates: u.rings },
      })),
    },
  });
  map.addLayer({
    id: 'unit-fill',
    type: 'fill',
    source: 'units',
    paint: { 'fill-color': '#16181d', 'fill-opacity': 0.03 },
  });
  map.addLayer({
    id: 'unit-line',
    type: 'line',
    source: 'units',
    paint: { 'line-color': '#16181d', 'line-opacity': 0.28, 'line-width': 0.8 },
  });
}

function bindControls() {
  mountDisplay($('display'), {
    map,
    lens,
    marks: ['bar', 'disc'],
    // `setStyle` discards the district outlines, so they have to be re-added
    // after every basemap swap.
    restore: () => drawBoundaries(units),
    extras: [{
      id: 'boundaries',
      label: 'District outlines',
      onChange: layerToggle(map, ['unit-fill', 'unit-line']),
    }],
  });

  $('measure').addEventListener('change', (e) => {
    const measure = MEASURES[e.target.value];
    $('measure-note').textContent = measure.spec.kind === 'extensive'
      ? 'Extensive: apportionable and summable. A district half inside contributes half its count.'
      : 'Intensive: a rate. Averaged, weighted by what it is a rate of — never summed.';
    lens.update({ binning: { measure: measure.spec } });
  });

  $('weighting').addEventListener('change', (e) => {
    const weighting = e.target.value;
    $('weighting-note').textContent = weighting === 'centroid'
      ? 'A district counts in full if its centroid is inside, and not at all otherwise.'
      : 'A district straddling the edge contributes the share of itself that is inside.';
    lens.update({ areal: { weighting } });
  });

  $('radius').addEventListener('input', (e) => {
    const r = Number(e.target.value);
    $('radius-out').value = r;
    lens.update({ selection: { radius: r }, animate: false });
  });
}

function renderLegend() {
  $('legend').innerHTML =
    `<li style="color:${CATEGORICAL[0]}"><i></i>`
    + '<span style="color:var(--muted)">one bar per kecamatan, on the arc it occupies</span></li>';
}

function showTooltip(bin, e) {
  const el = $('tooltip');
  const item = bin?.items?.[0];
  if (!item) {
    el.hidden = true;
    return;
  }
  const measure = MEASURES[$('measure').value];
  const parts = [bin.label, measure.format(bin.raw)];
  if (item.weight < 0.999) parts.push(`${Math.round(item.weight * 100)}% inside`);
  if (bin.interval) {
    const [lo, hi] = bin.interval;
    parts.push(`arc ${Math.round(lo)}–${Math.round(hi)}°`);
  }
  el.textContent = parts.join(' · ');
  const r = map.getContainer().getBoundingClientRect();
  el.style.left = `${e.clientX - r.left}px`;
  el.style.top = `${e.clientY - r.top}px`;
  el.hidden = false;
}

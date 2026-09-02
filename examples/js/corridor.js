/**
 * Corridor lens — the same pipeline on an open curve.
 *
 * This example exists to test an architectural claim rather than to look
 * pretty: docs/findings.md F-2 says placement anchors to a `Curve`, not to a
 * centre, so a route should need no new placement code. It doesn't. The only
 * differences from the ring demo are the selection type, the binning mode, and
 * the fact that a corridor's anchor is geographic rather than fixed in pixels.
 */

import { addLens } from '../../src/adapters/maplibre.js';
import { CATEGORICAL } from '../../src/render/style.js';

import { BASEMAPS, DEFAULT_BASEMAP } from './basemaps.js';
import { mountDisplay } from './display.js';

const $ = (id) => document.getElementById(id);

const CATEGORY_ORDER = ['food', 'retail', 'civic', 'health'];
const SAMPLE = 'data/yogyakarta.json';

// A north-south transect across the centre of Yogyakarta. Endpoints are
// draggable, so this is only a starting position.
const TRANSECT = [
  [110.3620, -7.7620],
  [110.3760, -7.8240],
];

const map = new maplibregl.Map({
  container: 'map',
  style: BASEMAPS[DEFAULT_BASEMAP].url,
  center: [110.3695, -7.7930],
  zoom: 13,
  dragRotate: false,
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

let lens;

map.on('load', async () => {
  const doc = await fetch(SAMPLE).then((r) => r.json());

  lens = addLens(map, {
    selection: { type: 'corridor', path: TRANSECT, width: 600 },
    data: doc.features,
    getPosition: (f) => [f.lng, f.lat],

    // Chainage: bins are stretches of route rather than wedges of bearing.
    binning: {
      mode: 'chainage',
      bins: 18,
      category: (f) => f.category,
      categories: CATEGORY_ORDER,
    },
    normalisation: { mode: 'count' },
    placement: { mode: 'necklace' },
    marks: { type: 'bar', barWidth: 12, maxLength: 90 },
    style: { preset: 'paper', showValues: 'auto' },

    onChange: (state) => {
      $('stat-count').textContent = state.stats.count.toLocaleString();
      $('stat-fill').textContent = `${Math.round(state.stats.fill * 100)}%`;
      const km = (state.selection?.length ?? 0) / 1000;
      $('stat-length').textContent = km.toFixed(1);

      const lat = state.structure?.lateral;
      $('stat-sided').textContent = lat ? lat.sidedness.toFixed(2) : '–';
      $('stat-sided').title = '0 = evenly split across the route, 1 = all one side.';
      $('stat-bias').textContent = lat ? lat.bias.toFixed(2) : '–';
      $('stat-bias').title = 'Mean offset as a fraction of half-width; + is left of travel.';
    },
    onHover: (bin, e) => showTooltip(bin, e),
  });

  renderLegend();
  bindControls();
  $('status').textContent =
    `${doc.features.length.toLocaleString()} places, ${doc.name} (${doc.retrieved}).`;
});

function bindControls() {
  mountDisplay($('display'), { map, lens: lens, marks: ['bar', 'disc', 'rose'] });

  $('width').addEventListener('input', (e) => {
    const width = Number(e.target.value);
    $('width-out').value = width;
    lens.update({
      selection: { ...lens.options.selection, width },
      animate: false,
    });
  });

  $('bins').addEventListener('input', (e) => {
    lens.update({ binning: { bins: Number(e.target.value) }, animate: false });
  });

  $('structure').addEventListener('change', (e) => {
    lens.update({ marks: { structure: e.target.value } });
  });

  $('normalisation').addEventListener('change', (e) => {
    lens.update({ normalisation: { mode: e.target.value } });
  });

  $('mark').addEventListener('change', (e) => {
    const type = e.target.value;
    lens.update({ marks: { type, maxRadius: type === 'rose' ? 20 : 22 } });
  });
}

function renderLegend() {
  $('legend').innerHTML =
    `<li style="color:${CATEGORICAL[0]}"><i></i>` +
    '<span style="color:var(--muted)">all places, by distance along the route</span></li>';
}

function showTooltip(bin, e) {
  const el = $('tooltip');
  if (!bin || !bin.count) {
    el.hidden = true;
    return;
  }
  const parts = [`${bin.label} along`, `${bin.count} places`];
  if (bin.dominant) parts.push(`mostly ${bin.dominant}`);
  const lat = bin.structure?.lateral;
  if (lat && lat.n > 1) {
    parts.push(`${Math.round(Math.abs(lat.mean))} m ${lat.mean >= 0 ? 'left' : 'right'}`);
    parts.push(`${(lat.sidedness * 100).toFixed(0)}% one-sided`);
  }
  el.textContent = parts.join(' · ');
  const r = map.getContainer().getBoundingClientRect();
  el.style.left = `${e.clientX - r.left}px`;
  el.style.top = `${e.clientY - r.top}px`;
  el.hidden = false;
}

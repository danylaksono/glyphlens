/**
 * Corridor lens — the same pipeline on an open curve.
 *
 * This example exists to test an architectural claim rather than to look
 * pretty: docs/findings.md F-2 says placement anchors to a `Curve`, not to a
 * centre, so a route should need no new placement code. It doesn't. The only
 * differences from the ring demo are the selection type, the binning mode, and
 * the fact that a corridor's anchor is geographic rather than fixed in pixels.
 *
 * The route itself is editable here — every vertex is a handle, and a line can
 * be dropped in as GeoJSON — because a two-point transect is the least
 * interesting corridor there is. The linear features worth lensing are rivers,
 * railways, bus routes and boundaries, and none of them are straight.
 */

import { addLens } from '../../src/adapters/maplibre.js';
import { CATEGORICAL } from '../../src/render/style.js';
import { pathFromGeoJSON } from '../../src/core/route.js';

import { BASEMAPS, DEFAULT_BASEMAP } from './basemaps.js';
import { mountDisplay } from './display.js';

const $ = (id) => document.getElementById(id);

const CATEGORY_ORDER = ['food', 'retail', 'civic', 'health'];
const SAMPLE = 'data/yogyakarta.json';

// A north-south transect across the centre of Yogyakarta. Every vertex is
// draggable, so this is only a starting position.
const TRANSECT = [
  [110.3620, -7.7620],
  [110.3760, -7.8240],
];

// A shaped route, to show what the corridor is actually for: a multi-node path
// that follows something. This one traces the ring road's western and southern
// arc, which is a very different reading from a straight transect.
const RING_ROAD = [
  [110.3300, -7.7560],
  [110.3320, -7.7830],
  [110.3400, -7.8080],
  [110.3620, -7.8230],
  [110.3900, -7.8270],
  [110.4160, -7.8200],
];

const ROUTES = {
  transect: { name: 'North–south transect', path: TRANSECT },
  ringroad: { name: 'Ring road (western arc)', path: RING_ROAD },
};

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
      $('stat-nodes').textContent = state.selection?.path?.length ?? 0;

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
  describeRoute();
  $('status').textContent =
    `${doc.features.length.toLocaleString()} places, ${doc.name} (${doc.retrieved}).`;
});

function bindControls() {
  mountDisplay($('display'), {
    map,
    lens: lens,
    marks: ['bar', 'disc', 'rose'],
    anchor: {
      label: 'Straighten the route',
      hint: 'Lays the route out on its own chainage. Every member keeps its'
        + ' distance along and its offset across, and gives up its position —'
        + ' a linear cartogram. The true path stays behind it, and node'
        + ' editing is off until the route is put back.',
    },
  });

  $('route').addEventListener('change', (e) => {
    const route = ROUTES[e.target.value];
    if (!route) return;
    lens.setPath(route.path);
    fitToPath(route.path);
    describeRoute(`${route.name}.`);
  });

  $('geojson').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) loadRoute(file);
    e.target.value = '';
  });

  // Dropping a file on the map is the gesture people try first.
  const container = map.getContainer();
  container.addEventListener('dragover', (e) => e.preventDefault());
  container.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) loadRoute(file);
  });

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

  $('structure-frame').addEventListener('change', (e) => {
    lens.update({ marks: { structureFrame: e.target.value }, animate: false });
  });

  $('normalisation').addEventListener('change', (e) => {
    lens.update({ normalisation: { mode: e.target.value } });
  });

  $('mark').addEventListener('change', (e) => {
    const type = e.target.value;
    lens.update({ marks: { type, maxRadius: type === 'rose' ? 20 : 22 } });
  });
}

/**
 * Take the route from a dropped or chosen GeoJSON file.
 *
 * What gets reported back matters as much as the import: a route that arrived
 * with four thousand vertices and was simplified to two hundred is a different
 * object from the one in the file, and the analyst should be told rather than
 * left to wonder why the corridor no longer hugs the river.
 */
async function loadRoute(file) {
  try {
    const result = lens.setPathFromGeoJSON(await file.text(), { maxNodes: 200 });
    fitToPath(result.path);
    $('route').value = 'custom';
    const notes = [`${file.name}: ${result.nodes} nodes`];
    if (result.dropped > 0) {
      notes.push(`longest of ${result.parts} parts (the rest ignored — joining them
        would invent segments that are not in the data)`.replace(/\s+/g, ' '));
    }
    if (result.sourceNodes > result.nodes) {
      notes.push(`simplified from ${result.sourceNodes}, so the lens stays interactive`);
    }
    describeRoute(notes.join(' · '));
  } catch (err) {
    describeRoute(`Could not read that file: ${err.message}`);
  }
}

/** Frame the map on a route, so an imported line is not off-screen. */
function fitToPath(path) {
  const lngs = path.map((p) => p[0]);
  const lats = path.map((p) => p[1]);
  map.fitBounds(
    [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
    { padding: 120, duration: 600 },
  );
}

function describeRoute(extra = '') {
  const nodes = lens?.options.selection.path?.length ?? 0;
  $('route-note').textContent =
    `${nodes} nodes. Drag one to move it, click the line to add one, alt-click to remove. ${extra}`;
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

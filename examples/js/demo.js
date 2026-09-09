/**
 * glyphlens demo.
 *
 * Note the loading pattern: Overpass is called **once** per place, for a
 * generous bounding box, and every subsequent lens interaction is local. Keeping
 * the network out of the interaction loop is the whole difference between this
 * and the earlier sketches (docs/findings.md F-3). The eventual replacement is
 * Overture GeoParquet -> H3 -> DuckDB-WASM, which changes this file only.
 */

import { addLens } from '../../src/adapters/maplibre.js';
import { CATEGORICAL } from '../../src/render/style.js';
import { select } from '../../src/core/selection.js';
import { elasticityProfile } from '../../src/core/distribution.js';

import { BASEMAPS, DEFAULT_BASEMAP } from './basemaps.js';
import { mountDisplay } from './display.js';

const $ = (id) => document.getElementById(id);
const status = $('status');

// OSM tag -> category. Deliberately small: four legible classes beat twenty.
const CATEGORIES = {
  food: new Set(['restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'food_court', 'ice_cream']),
  retail: new Set(['supermarket', 'convenience', 'marketplace', 'mall', 'bakery', 'greengrocer',
    'butcher', 'clothes', 'department_store']),
  civic: new Set(['school', 'university', 'college', 'library', 'kindergarten', 'townhall',
    'community_centre', 'place_of_worship']),
  health: new Set(['hospital', 'clinic', 'pharmacy', 'doctors', 'dentist']),
};
const CATEGORY_ORDER = ['food', 'retail', 'civic', 'health'];

// Overpass is generous but flaky — 504s are routine. Try the mirrors in turn,
// and fall back to a bundled extract so the demo always has something to show.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const SAMPLE = 'data/yogyakarta.json';

const map = new maplibregl.Map({
  container: 'map',
  // OpenFreeMap: no API key, and a quiet enough basemap that the lens reads as
  // the figure rather than competing with it.
  style: BASEMAPS[DEFAULT_BASEMAP].url,
  center: [110.3695, -7.7956],
  zoom: 13.5,
  dragRotate: false,
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

let lens;

map.on('load', async () => {
  lens = addLens(map, {
    center: map.getCenter().toArray(),
    selection: { type: 'disc', radius: 800 },
    data: [],
    getPosition: (f) => [f.lng, f.lat],
    binning: {
      mode: 'categorical',
      bins: 24,
      category: (f) => f.category,
      categories: CATEGORY_ORDER,
    },
    normalisation: { mode: 'count' },
    placement: { mode: 'morph', morph: 1 },
    marks: { type: 'bar', barWidth: 26, maxLength: 78, reserveLabels: true },
    style: { preset: 'paper', ringRadius: 152 },
    onChange: (state) => updateReadout(state),
    onHover: (bin, e) => showTooltip(bin, e),
  });

  renderLegend('categorical');
  bindControls();
  // Show the bundled sample immediately, then upgrade to live data.
  await loadSample('Bundled sample.');
  await loadPlace('Yogyakarta, Indonesia');
});

// ------------------------------------------------------------------- data

async function loadPlace(query) {
  setStatus(`Finding ${query}…`, true);
  try {
    const geo = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
    ).then((r) => r.json());
    if (!geo.length) throw new Error(`No match for "${query}"`);

    const center = [Number(geo[0].lon), Number(geo[0].lat)];
    map.jumpTo({ center, zoom: 13.5 });
    lens.update({ center });

    setStatus('Fetching amenities…', true);
    const features = await fetchAmenities(center, 4000);
    lens.setData(features);
    setStatus(`${features.length.toLocaleString()} places around ${geo[0].display_name.split(',')[0]}.`);
  } catch (err) {
    await loadSample(`${err.message} — showing the bundled sample instead.`);
  }
}

/** Bundled Yogyakarta extract, used whenever the live fetch cannot deliver. */
async function loadSample(reason = 'Loaded bundled sample.') {
  try {
    const doc = await fetch(SAMPLE).then((r) => r.json());
    map.jumpTo({ center: doc.center, zoom: 13.5 });
    lens.update({ center: doc.center, data: doc.features });
    setStatus(`${reason} ${doc.features.length.toLocaleString()} places, ${doc.name} (${doc.retrieved}).`);
  } catch {
    setStatus('No data available: live fetch failed and the bundled sample could not be read.');
  }
}

/** One Overpass call for a generous radius; everything after this is local. */
async function fetchAmenities(center, radiusM) {
  const [lng, lat] = center;
  const q = `[out:json][timeout:45];
    (
      node(around:${radiusM},${lat},${lng})[amenity];
      node(around:${radiusM},${lat},${lng})[shop];
    );
    out body ${8000};`;

  let json = null;
  let lastStatus = 0;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, { method: 'POST', body: q });
      if (!res.ok) {
        lastStatus = res.status;
        continue;
      }
      json = await res.json();
      break;
    } catch {
      // Network error on this mirror; try the next.
    }
  }
  if (!json) throw new Error(`Overpass unavailable${lastStatus ? ` (${lastStatus})` : ''}`);

  const out = [];
  for (const el of json.elements ?? []) {
    const tag = el.tags?.amenity ?? el.tags?.shop;
    if (!tag) continue;
    const category = CATEGORY_ORDER.find((c) => CATEGORIES[c].has(tag))
      ?? (el.tags?.shop ? 'retail' : null);
    if (!category) continue;
    out.push({ lng: el.lon, lat: el.lat, category, name: el.tags?.name ?? tag, tag });
  }
  return out;
}

// --------------------------------------------------------------- controls

function bindControls() {
  mountDisplay($('display'), {
    map,
    lens: lens,
    marks: ['bar', 'disc', 'rose'],
    anchor: {
      label: 'Unroll the ring',
      hint: 'Opens the ring into a straight axis of the same length, holding'
        + ' north at the top. Nothing is recomputed — the marks keep the'
        + ' positions the necklace solved, so this is the same chart on a'
        + ' different anchor.',
    },
  });

  $('search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    loadPlace($('search').value.trim());
  });

  $('morph').addEventListener('input', () => applyPlacement(false));

  $('binning').addEventListener('change', (e) => {
    const mode = e.target.value;
    // The morph only means something where nominal order and true bearing
    // differ. For a 24-sector rose the block slots already *are* the bearings,
    // so the slider would be a no-op and is disabled rather than left to lie.
    const morphable = mode === 'categorical' || mode === 'cross';
    $('morph').disabled = !morphable;
    $('morph-hint').textContent = morphable
      ? 'Drag to move each bar from its slot in a sorted legend to the direction that category actually lies in.'
      : 'Not applicable: these bins are already positioned by bearing.';

    lens.update({
      binning: {
        mode,
        bins: mode === 'cross' ? 8 : 24,
        rings: 5,
        category: (f) => f.category,
        categories: CATEGORY_ORDER,
      },
      marks: {
        type: $('mark').value,
        barWidth: mode === 'categorical' ? 26 : mode === 'cross' ? 8 : 12,
        reserveLabels: mode === 'categorical' || mode === 'radial',
      },
    });
    applyPlacement();
    renderLegend(mode);
  });

  $('placement').addEventListener('change', () => applyPlacement());

  $('structure').addEventListener('change', (e) => {
    lens.update({ marks: { structure: e.target.value } });
  });

  $('normalisation').addEventListener('change', (e) => {
    lens.update({ normalisation: { mode: e.target.value } });
  });

  $('mark').addEventListener('change', (e) => {
    const type = e.target.value;
    // A rose needs more room than a disc: its petals radiate from the glyph
    // centre, so its footprint is its full diameter.
    lens.update({
      marks: { type, maxRadius: type === 'rose' ? 22 : 26 },
      // Equal-sized roses hand the aggregate back to the label.
      style: { showValues: type === 'rose' ? true : 'auto' },
    });
  });

  $('radius').addEventListener('input', (e) => {
    const r = Number(e.target.value);
    $('radius-out').value = r;
    lens.update({ selection: { radius: r }, animate: false });
    drawProfile(); // only the marker moves; the curve is radius-independent
  });

  window.addEventListener('resize', () => drawProfile());

  $('draw').addEventListener('click', () => (drawing ? finishShape() : startDrawing()));
  $('reset-shape').addEventListener('click', backToDisc);
}

/**
 * Placement depends on two controls at once: the explicit choice, and whether
 * the current binning gives the morph anything to move towards. Resolving it in
 * one place keeps the two from fighting.
 */
function applyPlacement(animate = true) {
  const choice = $('placement').value;
  const mode = $('binning').value;
  const morphable = mode === 'categorical' || mode === 'cross';
  const stackable = mode === 'cross' || mode === 'categorical';

  $('morph').disabled = !morphable || choice !== 'auto';
  $('placement-hint').textContent = stackable
    ? 'Stacked gives each category its own concentric necklace, so categories no longer compete for angular room.'
    : 'Stacking needs a category dimension — try bearing × category.';

  let placement;
  if (choice === 'block') placement = { mode: 'block' };
  else if (choice === 'stacked' && stackable) {
    placement = { mode: 'stacked', by: 'category', ringGap: 22 };
  } else if (morphable) placement = { mode: 'morph', morph: Number($('morph').value) };
  else placement = { mode: 'necklace' };

  lens.update({
    placement,
    // Stacked tracks are thinner, so bars need to be too.
    marks: { barWidth: choice === 'stacked' ? 6 : mode === 'categorical' ? 26 : 12 },
    animate,
  });
}

// --------------------------------------------------------- lasso / polygon

// A drawn shape, an admin boundary and an isochrone are the same thing to the
// library: a polygon. Only where the polygon comes from differs, and producing
// an isochrone is a routing problem that stays outside this library.
let drawing = false;
let vertices = [];

function startDrawing() {
  drawing = true;
  vertices = [];
  $('draw').textContent = 'Finish (or double-click)';
  $('draw').setAttribute('aria-pressed', 'true');
  $('draw-hint').textContent = 'Click to place points. Double-click, or press Finish, to close the shape.';
  map.getCanvas().style.cursor = 'crosshair';
  map.on('click', onDrawClick);
  map.on('dblclick', onDrawDone);
  map.doubleClickZoom.disable();
  // The lens would fight the drawing gesture for pointer events.
  lens.update({ draggable: false });
  renderSketch();
}

function onDrawClick(e) {
  vertices.push([e.lngLat.lng, e.lngLat.lat]);
  renderSketch();
}

function onDrawDone(e) {
  e?.preventDefault?.();
  finishShape();
}

function finishShape() {
  const enough = vertices.length >= 3;
  stopDrawing();
  if (!enough) {
    $('draw-hint').textContent = 'A shape needs at least three points. Try again.';
    return;
  }
  $('radius-field').hidden = true;
  $('reset-shape').hidden = false;
  $('draw-hint').textContent = 'Lensing the drawn shape. Bearings are measured from its centroid.';
  lens.update({
    selection: { type: 'polygon', rings: [vertices] },
    center: undefined,
    draggable: true,
  });
}

function stopDrawing() {
  drawing = false;
  map.off('click', onDrawClick);
  map.off('dblclick', onDrawDone);
  map.doubleClickZoom.enable();
  map.getCanvas().style.cursor = '';
  $('draw').textContent = 'Draw a shape';
  $('draw').setAttribute('aria-pressed', 'false');
  clearSketch();
}

function backToDisc() {
  $('radius-field').hidden = false;
  $('reset-shape').hidden = true;
  $('draw-hint').textContent = 'Click the map to trace a boundary, then double-click to close it.';
  lens.update({
    selection: { type: 'disc', radius: Number($('radius').value) },
    center: map.getCenter().toArray(),
    draggable: true,
  });
  profileKey = '';
}

/** The in-progress outline, drawn with MapLibre rather than the lens canvas. */
function renderSketch() {
  const data = {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: vertices.length ? vertices : [] },
  };
  if (map.getSource('sketch')) {
    map.getSource('sketch').setData(data);
    return;
  }
  map.addSource('sketch', { type: 'geojson', data });
  map.addLayer({
    id: 'sketch-line',
    type: 'line',
    source: 'sketch',
    paint: { 'line-color': '#0072b2', 'line-width': 1.5, 'line-dasharray': [2, 2] },
  });
  map.addLayer({
    id: 'sketch-pts',
    type: 'circle',
    source: 'sketch',
    paint: { 'circle-radius': 3, 'circle-color': '#0072b2' },
  });
}

function clearSketch() {
  if (!map.getSource('sketch')) return;
  map.getSource('sketch').setData({
    type: 'Feature', geometry: { type: 'LineString', coordinates: [] },
  });
}

// ------------------------------------------------------- MAUP profile

// The elasticity curve depends only on the distance distribution around the
// centre, not on the radius currently set — so it is recomputed when the lens
// moves or the data changes, and merely re-marked when the slider moves.
let profile = [];
let profileKey = '';

function refreshProfile() {
  // `onChange` fires once from inside `addLens`, before `lens` is assigned.
  if (!lens) return;
  // The profile annotates the radius control, so it means nothing for a shape
  // that has no radius.
  if (lens.options.selection?.type === 'polygon') return;
  const slider = $('radius');
  const maxRadius = Number(slider.max);
  const centre = lens.options.center;
  const key = `${centre[0].toFixed(5)},${centre[1].toFixed(5)},${lens.options.data.length}`;
  if (key === profileKey) return;
  profileKey = key;

  const { items } = select(lens.options.data, {
    type: 'disc', center: centre, radius: maxRadius,
  }, { getPosition: (f) => [f.lng, f.lat] });

  profile = elasticityProfile(items.map((i) => i.distance), {
    minRadius: Number(slider.min),
    maxRadius,
    samples: 120,
  });
  drawProfile();
}

function drawProfile() {
  const canvas = $('radius-profile');
  const slider = $('radius');
  const w = canvas.clientWidth;
  const h = 34;
  if (!w) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (profile.length === 0) return;

  const lo = Number(slider.min);
  const hi = Number(slider.max);
  const x = (r) => ((r - lo) / (hi - lo)) * w;

  // Only the reliable part of the curve is drawn. At small radii the estimator
  // is a ratio of tiny counts and spikes for arithmetic reasons rather than
  // geographic ones; plotting that would invent cliffs (F-17).
  const usable = profile.filter((p) => p.reliable);
  if (usable.length < 2) return;

  // Scale to the reliable data, not to the whole curve.
  const cap = Math.max(4, ...usable.map((p) => p.elasticity)) * 0.9;
  const y = (e) => h - Math.min(1, e / cap) * (h - 3) - 1;

  ctx.beginPath();
  ctx.moveTo(x(usable[0].r), h);
  for (const p of usable) ctx.lineTo(x(p.r), y(p.elasticity));
  ctx.lineTo(x(usable[usable.length - 1].r), h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,114,178,0.16)';
  ctx.fill();

  ctx.beginPath();
  usable.forEach((p, i) => (i ? ctx.lineTo(x(p.r), y(p.elasticity)) : ctx.moveTo(x(p.r), y(p.elasticity))));
  ctx.strokeStyle = 'rgba(0,114,178,0.75)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Say where the curve stops being trustworthy rather than silently starting
  // it partway across.
  if (usable[0].r > lo) {
    ctx.save();
    ctx.fillStyle = 'rgba(20,24,29,0.05)';
    ctx.fillRect(0, 0, x(usable[0].r), h);
    ctx.restore();
  }

  // E = 2 is uniform density: below it the count is barely moving, above it
  // the radius is doing more work than the geography.
  ctx.save();
  ctx.setLineDash([2, 3]);
  ctx.strokeStyle = 'rgba(20,24,29,0.28)';
  ctx.beginPath();
  ctx.moveTo(0, y(2));
  ctx.lineTo(w, y(2));
  ctx.stroke();
  ctx.restore();

  const here = x(Number(slider.value));
  ctx.beginPath();
  ctx.moveTo(here, 0);
  ctx.lineTo(here, h);
  ctx.strokeStyle = 'rgba(20,24,29,0.65)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// ---------------------------------------------------------------- readout

function updateReadout(state) {
  if (!state?.stats) return;
  refreshProfile();
  $('stat-count').textContent = state.stats.count.toLocaleString();
  $('stat-fill').textContent = `${Math.round(state.stats.fill * 100)}%`;
  $('stat-disp').textContent = `${Math.round(state.stats.maxDisplacement)}°`;

  // Elasticity: how much the reading depends on the radius that happens to be
  // set. ~2 is uniform density; >>2 means a cluster sits just outside the rim.
  const E = state.stats.elasticity;
  $('stat-elast').textContent = Number.isFinite(E) ? E.toFixed(1) : '–';
  $('stat-elast').title = 'd(count)/d(radius), scaled. ~2 = uniform density.';

  const R = state.stats.concentration;
  $('stat-conc').textContent = Number.isFinite(R) ? R.toFixed(2) : '–';
  $('stat-conc').title = 'Resultant length: 1 = all one direction, 0 = no direction.';
}

/**
 * The legend has to follow the binning mode. In `angular` mode a sector mixes
 * categories, so bars carry no category colour and claiming otherwise would
 * misread the chart.
 */
function renderLegend(mode = 'angular') {
  const el = $('legend');
  if (mode === 'angular' || mode === 'radial') {
    el.innerHTML = `<li style="color:${CATEGORICAL[0]}"><i></i>` +
      `<span style="color:var(--muted)">all places, by ` +
      `${mode === 'angular' ? 'bearing' : 'distance'}</span></li>`;
    return;
  }
  el.innerHTML = CATEGORY_ORDER.map(
    (c, i) => `<li style="color:${CATEGORICAL[i]}"><i></i><span style="color:var(--muted)">${c}</span></li>`,
  ).join('');
}

function showTooltip(bin, e) {
  const el = $('tooltip');
  if (!bin || !bin.count) {
    el.hidden = true;
    return;
  }
  const parts = [bin.label, `${bin.count} places`];
  if (bin.dominant) parts.push(`mostly ${bin.dominant}`);
  if (bin.unit && bin.unit !== 'count') parts.push(`${bin.unit} ${bin.value.toFixed(2)}`);
  if (Number.isFinite(bin.spread) && bin.spread > 0) {
    parts.push(`spread ±${bin.spread.toFixed(0)}°`);
  }
  if (Math.abs(bin.displacement) > 1) parts.push(`shifted ${bin.displacement.toFixed(0)}°`);
  el.textContent = parts.join(' · ');
  const r = map.getContainer().getBoundingClientRect();
  el.style.left = `${e.clientX - r.left}px`;
  el.style.top = `${e.clientY - r.top}px`;
  el.hidden = false;
}

function setStatus(text, busy = false) {
  status.textContent = text;
  status.dataset.busy = String(busy);
}

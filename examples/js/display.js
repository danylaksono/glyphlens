/**
 * The display control group, shared by the map demos.
 *
 * These controls change how a lens is *drawn*, not what it says, so they are
 * kept visually and structurally apart from the analytical controls above them.
 * Building the markup here rather than repeating it in four HTML files means
 * the demos agree on what "display" means, and a control added once appears
 * everywhere.
 */

import { BASEMAPS, DEFAULT_BASEMAP, setBasemap, fillBasemapSelect } from './basemaps.js';

const TOGGLES = [
  ['labels', 'Labels', 'showLabels'],
  ['values', 'Values', 'showValues'],
  ['compass', 'Compass', 'compass'],
  ['dim', 'Dim outside', 'dimExterior'],
];

/**
 * @param {HTMLElement} mount   where to insert the group
 * @param {object} options
 * @param {import('maplibre-gl').Map} options.map
 * @param {object} options.lens          anything with `.update({ style })`
 * @param {() => void} [options.restore] re-adds the page's own map layers
 * @param {string[]} [options.marks]     mark types to offer, or none
 * @param {Array} [options.extras]       `[{ id, label, checked, onChange }]`
 * @param {number|false} [options.ring]  initial ring radius, or false to omit
 *   the control — a field derives its ring size from the lattice, so the
 *   slider would be inert there.
 * @param {false|{label?, hint?}} [options.anchor]  show the anchor controls —
 *   how far the curve is unrolled, and which way marks grow. Off by default:
 *   they only mean something for a lens with a single anchor to open.
 */
export function mountDisplay(mount, options) {
  const {
    map, lens, restore, marks = [], extras = [], ring = 150, anchor = false,
  } = options;
  const showRing = ring !== false;

  const markRow = marks.length
    ? `<label class="sub"><span>Mark</span><select data-role="mark">${
      marks.map((m, i) =>
        `<option value="${m}"${i === 0 ? ' selected' : ''}>${markLabel(m)}</option>`).join('')
    }</select></label>`
    : '';

  // The anchor is a drawing decision — the placement is already solved and
  // does not move — so it belongs here rather than with the analytical
  // controls, however dramatic it looks.
  const anchorRows = anchor ? `
    <label class="sub">
      <span>${anchor.label ?? 'Unroll'} <output data-role="unroll-out">0</output>%</span>
      <input data-role="unroll" type="range" min="0" max="100" step="1" value="0" />
    </label>
    <label class="sub"><span>Marks grow</span><select data-role="orient">
      <option value="normal" selected>Outward (radial)</option>
      <option value="up">Up (one baseline)</option>
      <option value="upright">Up, away from the lens</option>
    </select></label>
    ${anchor.hint ? `<p class="hint">${anchor.hint}</p>` : ''}` : '';

  mount.innerHTML = `
    <summary>Display</summary>
    <label class="sub"><span>Basemap</span><select data-role="basemap"></select></label>
    ${markRow}
    ${showRing ? `<label class="sub">
      <span>Ring size <output data-role="ring-out">${ring}</output> px</span>
      <input data-role="ring" type="range" min="90" max="230" step="5" value="${ring}" />
    </label>` : ''}
    ${anchorRows}
    <div class="toggles">
      ${TOGGLES.map(([id, label]) =>
    `<label><input type="checkbox" data-toggle="${id}" checked /> ${label}</label>`).join('')}
      ${extras.map((e) =>
    `<label><input type="checkbox" data-extra="${e.id}"${
      e.checked === false ? '' : ' checked'} /> ${e.label}</label>`).join('')}
    </div>`;

  const q = (sel) => mount.querySelector(sel);

  fillBasemapSelect(q('[data-role="basemap"]'));
  q('[data-role="basemap"]').addEventListener('change', (e) => {
    const theme = setBasemap(map, e.target.value, restore);
    // The library ships a preset for dark backgrounds; without switching to it
    // the labels would be near-black on near-black.
    lens.update({ style: { preset: theme === 'dark' ? 'night' : 'paper' } });
    syncToggles();
  });

  if (marks.length) {
    q('[data-role="mark"]').addEventListener('change', (e) => {
      lens.update({ marks: { type: e.target.value } });
    });
  }

  if (showRing) {
    q('[data-role="ring"]').addEventListener('input', (e) => {
      const r = Number(e.target.value);
      q('[data-role="ring-out"]').value = r;
      lens.update({ style: { ringRadius: r } });
    });
  }

  if (anchor) {
    q('[data-role="unroll"]').addEventListener('input', (e) => {
      const u = Number(e.target.value);
      q('[data-role="unroll-out"]').value = u;
      // `setUnroll` repaints without re-running the pipeline: the curve keeps
      // its length, so the solved placement is still valid.
      lens.setUnroll(u / 100);
    });
    q('[data-role="orient"]').addEventListener('change', (e) => {
      lens.update({ marks: { orient: e.target.value }, animate: false });
    });
  }

  function syncToggles() {
    const style = {};
    for (const [id, , key] of TOGGLES) {
      style[key] = q(`[data-toggle="${id}"]`).checked;
    }
    lens.update({ style });
  }

  for (const [id] of TOGGLES) {
    q(`[data-toggle="${id}"]`).addEventListener('change', syncToggles);
  }

  for (const extra of extras) {
    q(`[data-extra="${extra.id}"]`).addEventListener('change', (e) => {
      extra.onChange(e.target.checked);
    });
  }

  return { sync: syncToggles };
}

/** Toggle a map layer's visibility, for `extras` that show map furniture. */
export function layerToggle(map, ids) {
  return (visible) => {
    for (const id of ids) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      }
    }
  };
}

function markLabel(m) {
  return {
    bar: 'Radial bar',
    disc: 'Disc',
    rose: 'Mini rose',
  }[m] ?? m;
}

export { BASEMAPS, DEFAULT_BASEMAP };

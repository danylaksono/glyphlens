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
 */
export function mountDisplay(mount, options) {
  const { map, lens, restore, marks = [], extras = [], ring = 150 } = options;
  const showRing = ring !== false;

  const markRow = marks.length
    ? `<label class="sub"><span>Mark</span><select data-role="mark">${
      marks.map((m, i) =>
        `<option value="${m}"${i === 0 ? ' selected' : ''}>${markLabel(m)}</option>`).join('')
    }</select></label>`
    : '';

  mount.innerHTML = `
    <summary>Display</summary>
    <label class="sub"><span>Basemap</span><select data-role="basemap"></select></label>
    ${markRow}
    ${showRing ? `<label class="sub">
      <span>Ring size <output data-role="ring-out">${ring}</output> px</span>
      <input data-role="ring" type="range" min="90" max="230" step="5" value="${ring}" />
    </label>` : ''}
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

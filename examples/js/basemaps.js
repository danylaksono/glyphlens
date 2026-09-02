/**
 * Basemap choices for the demos.
 *
 * The default is deliberately the quietest one. A lens is an ex-situ chart
 * sitting on top of a map, and every bit of contrast the basemap spends
 * competes with the marks — which is the whole reason `dimExterior` exists.
 * A busy basemap does not make the lens wrong, it makes it unreadable.
 *
 * `blank` is here because it is the honest test: if a reading only survives on
 * an empty background, the basemap was carrying it.
 *
 * All of these are keyless, so the demos keep working for anyone who opens
 * them.
 */

export const BASEMAPS = {
  muted: {
    label: 'Muted (default)',
    url: 'https://tiles.openfreemap.org/styles/positron',
    theme: 'light',
  },
  blank: {
    label: 'Blank — no basemap',
    // A style with no sources at all: the marks are the entire figure.
    url: {
      version: 8,
      sources: {},
      layers: [{
        id: 'bg',
        type: 'background',
        paint: { 'background-color': '#faf9f6' },
      }],
    },
    theme: 'light',
  },
  streets: {
    label: 'Streets',
    url: 'https://tiles.openfreemap.org/styles/liberty',
    theme: 'light',
  },
  grey: {
    label: 'Grey',
    url: 'https://tiles.versatiles.org/assets/styles/graybeard/style.json',
    theme: 'light',
  },
  dark: {
    label: 'Dark',
    url: 'https://tiles.openfreemap.org/styles/dark',
    theme: 'dark',
  },
};

export const DEFAULT_BASEMAP = 'muted';

/**
 * Swap the basemap and put back anything the demo had added to the map.
 *
 * `setStyle` discards every source and layer the page added, so a caller with
 * its own boundary layers has to re-add them. Passing that as a callback keeps
 * the knowledge of *what* to restore with the page that owns it.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {string} key                  a key of `BASEMAPS`
 * @param {() => void} [restore]        re-adds the page's own sources/layers
 * @returns {'light'|'dark'} the new theme, so the caller can restyle the lens
 */
export function setBasemap(map, key, restore) {
  const choice = BASEMAPS[key] ?? BASEMAPS[DEFAULT_BASEMAP];
  map.setStyle(choice.url);
  if (restore) {
    // `styledata` fires more than once during a swap; restoring on the first
    // one where the style is actually loaded avoids both a race and a
    // duplicate-source error.
    const onData = () => {
      if (!map.isStyleLoaded()) return;
      map.off('styledata', onData);
      restore();
    };
    map.on('styledata', onData);
  }
  return choice.theme;
}

/** Fill a `<select>` with the basemap options. */
export function fillBasemapSelect(select, current = DEFAULT_BASEMAP) {
  select.innerHTML = Object.entries(BASEMAPS)
    .map(([key, b]) =>
      `<option value="${key}"${key === current ? ' selected' : ''}>${b.label}</option>`)
    .join('');
}

import terser from '@rollup/plugin-terser';

/**
 * Bundler consumers resolve the ESM sources in `src/` directly via the package
 * `exports` map, and the examples import them straight from the filesystem. This
 * build exists purely to produce standalone browser bundles for CDN,
 * `<script>` and Observable use:
 *
 *   - `*.global.js`  IIFE, exposes `window.glyphlens` for plain <script> tags.
 *   - `*.esm.js`     ESM, for <script type="module"> and Observable.
 *
 * Deliberately not UMD: this package is `"type": "module"`, so Node would parse
 * a `.js` UMD bundle as ESM and its CommonJS branch would never run, silently
 * yielding an empty module. (Same reasoning as `geo-morpher`.)
 *
 * There are no runtime dependencies to resolve or convert, so this needs no
 * plugins beyond minification — `maplibre-gl` is a peer the adapter reaches for
 * through the map object the caller passes in, never an import.
 */

// The `/*!` form marks this a legal comment, which terser's default
// `comments: 'some'` preserves. A plain `/*` banner is stripped, silently
// shipping an MIT bundle with no attribution in it.
const banner = '/*! glyphlens | MIT | https://github.com/danylaksono/glyphlens */';

export default {
  input: 'src/index.js',
  output: [
    {
      file: 'dist/glyphlens.global.js',
      format: 'iife',
      name: 'glyphlens',
      exports: 'named',
      banner,
    },
    {
      file: 'dist/glyphlens.global.min.js',
      format: 'iife',
      name: 'glyphlens',
      exports: 'named',
      banner,
      plugins: [terser()],
    },
    {
      file: 'dist/glyphlens.esm.js',
      format: 'esm',
      banner,
      plugins: [terser()],
    },
  ],
};

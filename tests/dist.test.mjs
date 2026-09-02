import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

/**
 * The built bundles are a published artefact — jsDelivr serves them from the
 * repo and GitHub Pages from the live domain — so "it built" is not enough.
 * These check the bundles actually expose a working API.
 *
 * Skipped rather than failed when `dist/` is absent, so a fresh clone can run
 * `npm test` before `npm run build`.
 */

const DIST = path.resolve(import.meta.dirname, '..', 'dist');
const built = fs.existsSync(path.join(DIST, 'glyphlens.esm.js'));
const opts = built ? {} : { skip: 'dist/ not built — run `npm run build`' };

test('the ESM bundle exposes the public API', opts, async () => {
  const mod = await import(pathToFileURL(path.join(DIST, 'glyphlens.esm.js')).href);
  for (const name of [
    'computeLens', 'placeNecklace', 'elasticityProfile', 'select',
    'LensRenderer', 'addLens', 'circleCurve',
  ]) {
    assert.equal(typeof mod[name], 'function', `${name} is exported`);
  }
});

test('the ESM bundle actually computes a lens', opts, async () => {
  const { computeLens } = await import(
    pathToFileURL(path.join(DIST, 'glyphlens.esm.js')).href);
  const layout = computeLens({
    center: [0, 0],
    selection: { type: 'disc', radius: 1000 },
    data: [{ lng: 0.001, lat: 0.001, category: 'a' }],
    binning: { mode: 'angular', bins: 8 },
    marks: { type: 'bar' },
    ring: { radius: 100 },
  });
  assert.equal(layout.stats.count, 1);
  assert.equal(layout.bins.length, 8);
});

test('the IIFE bundle defines a named global', opts, () => {
  const code = fs.readFileSync(path.join(DIST, 'glyphlens.global.min.js'), 'utf8');
  // A bare sandbox: if the bundle reached for `window`, `document` or any
  // browser API at load time, this would throw — which is the check.
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(`var self = this; ${code}`, sandbox);

  assert.equal(typeof sandbox.glyphlens, 'object', 'window.glyphlens is defined');
  assert.equal(typeof sandbox.glyphlens.computeLens, 'function');
  assert.equal(typeof sandbox.glyphlens.placeNecklace, 'function');
});

test('the minified bundle carries its licence banner', opts, () => {
  const code = fs.readFileSync(path.join(DIST, 'glyphlens.global.min.js'), 'utf8');
  assert.ok(code.startsWith('/*! glyphlens | MIT'), 'banner survives minification');
});

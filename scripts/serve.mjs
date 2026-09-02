/**
 * Minimal static server for the examples. No dependencies, no build step —
 * the library is plain ESM, so the browser loads `src/` directly.
 *
 *   npm run dev   ->  http://localhost:5180/examples/
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 5180);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

http
  .createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(root, url);
    if (!file.startsWith(root)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    if (url === '/') file = path.join(root, 'examples', 'index.html');
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      file = path.join(file, 'index.html');
    }
    fs.readFile(file, (err, body) => {
      if (err) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
        return;
      }
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
        'cache-control': 'no-cache',
      });
      res.end(body);
    });
  })
  .listen(port, () => {
    console.log(`glyphlens examples -> http://localhost:${port}/examples/`);
  });

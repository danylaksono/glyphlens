/**
 * Citation hygiene for the paper.
 *
 *   node paper/scripts/check-bib.mjs            offline checks only
 *   node paper/scripts/check-bib.mjs --online   also resolve every DOI
 *
 * Offline, it checks that
 *   - every \cite key in main.tex and sections/*.tex exists in references.bib,
 *   - every bib entry is cited (an uncited entry is usually a leftover),
 *   - every entry has a DOI or a URL, and no DOI carries a resolver prefix.
 *
 * Online, it fetches each DOI's registry record — Crossref, or DataCite for
 * the prefixes Crossref does not hold (Eurographics 10.2312, Dagstuhl
 * 10.4230, arXiv 10.48550) — and compares the registered title with the bib
 * title after normalisation. A mismatch is printed, not fixed: the registry
 * is usually right, but not always (DataCite has the wrong year for at least
 * one Eurographics STAR), so a person decides.
 *
 * Exits non-zero if anything fails, so it can gate a build.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const paper = path.resolve(here, '..');
const online = process.argv.includes('--online');

function parseBib(text) {
  const entries = [];
  const re = /@(\w+)\s*\{\s*([^,\s]+)\s*,/g;
  let m;
  while ((m = re.exec(text))) {
    // Walk braces from the entry's opening brace to find its end.
    let depth = 0;
    let i = text.indexOf('{', m.index);
    const start = i;
    for (; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}' && --depth === 0) break;
    }
    const body = text.slice(start + 1, i);
    const field = (name) => {
      const f = new RegExp(`(?:^|,)\\s*${name}\\s*=\\s*[{"]`, 'i').exec(body);
      if (!f) return null;
      let j = f.index + f[0].length;
      let d = 1;
      let out = '';
      for (; j < body.length && d > 0; j++) {
        if (body[j] === '{') d++;
        else if (body[j] === '}' || (body[j] === '"' && d === 1 && f[0].endsWith('"'))) d--;
        if (d > 0) out += body[j];
      }
      return out.trim();
    };
    entries.push({
      type: m[1].toLowerCase(),
      key: m[2],
      title: field('title'),
      doi: field('doi'),
      url: field('url'),
      year: field('year'),
    });
    re.lastIndex = i;
  }
  return entries.filter((e) => !['comment', 'string', 'preamble'].includes(e.type));
}

function citedKeys() {
  const files = [path.join(paper, 'main.tex')];
  const dir = path.join(paper, 'sections');
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.tex')) files.push(path.join(dir, f));
  }
  const keys = new Map();
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8').replace(/(^|[^\\])%.*$/gm, '$1');
    const re = /\\(?:cite|citep|citet|citeauthor|citeyear|nocite)\*?(?:\[[^\]]*\])*\{([^}]+)\}/g;
    let m;
    while ((m = re.exec(text))) {
      for (const k of m[1].split(',').map((s) => s.trim()).filter((k) => k && !k.startsWith('#'))) {
        if (!keys.has(k)) keys.set(k, path.relative(paper, file));
      }
    }
  }
  return keys;
}

const norm = (s) => (s ?? '')
  .replace(/\\[a-zA-Z]+\s*/g, '')
  .replace(/[{}\\'"`^~]/g, '')
  .replace(/---|--/g, '-')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const DATACITE = ['10.2312/', '10.4230/', '10.48550/'];

async function registryTitle(doi) {
  const useDatacite = DATACITE.some((p) => doi.toLowerCase().startsWith(p));
  const url = useDatacite
    ? `https://api.datacite.org/dois/${encodeURIComponent(doi)}`
    : `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
  const res = await fetch(url, { headers: { 'user-agent': 'glyphlens-paper-check/1.0 (mailto:unset)' } });
  if (!res.ok) return { error: `${res.status} from ${useDatacite ? 'DataCite' : 'Crossref'}` };
  const json = await res.json();
  if (useDatacite) {
    const a = json.data?.attributes ?? {};
    return { title: a.titles?.[0]?.title, year: a.publicationYear, source: 'DataCite' };
  }
  const w = json.message ?? {};
  const title = [w.title?.[0], w.subtitle?.[0]].filter(Boolean).join(': ');
  const year = (w.issued?.['date-parts']?.[0] ?? [])[0];
  return { title, year, source: 'Crossref' };
}

async function main() {
  const bib = parseBib(fs.readFileSync(path.join(paper, 'references.bib'), 'utf8'));
  const byKey = new Map(bib.map((e) => [e.key, e]));
  const cited = citedKeys();
  const problems = [];

  const seen = new Set();
  for (const e of bib) {
    if (seen.has(e.key)) problems.push(`duplicate bib key: ${e.key}`);
    seen.add(e.key);
    if (!e.doi && !e.url) problems.push(`${e.key}: no doi and no url`);
    if (e.doi && /^(https?:|doi:)/i.test(e.doi)) problems.push(`${e.key}: doi carries a prefix (${e.doi})`);
    if (!cited.has(e.key)) problems.push(`${e.key}: in references.bib but never cited`);
  }
  for (const [k, file] of cited) {
    if (!byKey.has(k)) problems.push(`${k}: cited in ${file} but missing from references.bib`);
  }

  console.log(`${bib.length} entries, ${cited.size} cited keys, ${bib.filter((e) => e.doi).length} with DOI.`);

  if (online) {
    for (const e of bib.filter((x) => x.doi)) {
      try {
        const r = await registryTitle(e.doi);
        if (r.error) {
          problems.push(`${e.key}: ${e.doi} did not resolve (${r.error})`);
          continue;
        }
        const a = norm(e.title);
        const b = norm(r.title);
        const ok = a === b || b.startsWith(a) || a.startsWith(b);
        const yearNote = r.year && e.year && String(r.year) !== String(e.year) ? ` [year: bib ${e.year}, ${r.source} ${r.year}]` : '';
        console.log(`${ok ? 'ok  ' : 'DIFF'} ${e.key}  ${e.doi}${yearNote}`);
        if (!ok) problems.push(`${e.key}: title differs from ${r.source}\n      bib:      ${e.title}\n      registry: ${r.title}`);
      } catch (err) {
        problems.push(`${e.key}: ${e.doi} lookup failed (${err.message})`);
      }
    }
  }

  if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
  }
  console.log('All checks passed.');
}

main();

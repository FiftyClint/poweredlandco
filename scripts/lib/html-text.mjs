import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'node-html-parser';

/** Recursively list files under `dir` matching a predicate. */
export function walk(dir, match, found = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, match, found);
    else if (match(full)) found.push(full);
  }
  return found;
}

const NAMED = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
};

export function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name) => NAMED[name.toLowerCase()] ?? whole);
}

/**
 * Visible text of an HTML document.
 *
 * Scripts, styles and JSON-LD are dropped, because none of them are read by a
 * visitor and all of them are full of characters (exclamation marks, the word
 * "agent") that would produce nothing but false positives.
 */
export function visibleText(html, { onlyMain = false, exclude = null } = {}) {
  // The doctype and HTML comments are not visible text, but the parser reports
  // their contents as text. Left in, every page appears to contain the
  // exclamation point in "<!DOCTYPE html>".
  const source = html
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const root = parse(source, { blockTextElements: { script: false, style: false } });
  for (const node of root.querySelectorAll('script, style, noscript')) node.remove();
  if (exclude) for (const node of root.querySelectorAll(exclude)) node.remove();

  const scope = onlyMain ? root.querySelector('main') : root;
  if (!scope) return '';

  return normalize(decodeEntities(scope.structuredText || scope.text || ''));
}

export const normalize = (text) => text.replace(/\s+/g, ' ').trim();

/** All built HTML pages, as { site, path, file, html }. */
export function builtPages(distDir) {
  return walk(distDir, (f) => f.endsWith('.html')).map((file) => {
    const rel = relative(distDir, file);
    return {
      site: rel.split('/')[0],
      path: '/' + rel.split('/').slice(1).join('/'),
      file,
      html: readFileSync(file, 'utf8'),
    };
  });
}

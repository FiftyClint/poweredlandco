#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse } from 'node-html-parser';

/**
 * Builds a single self-contained HTML file that shows the real built pages, for
 * review by someone who is not going to clone a repo or run a build.
 *
 * Fidelity is the point. Each page is the actual build output, rendered inside
 * an iframe with the actual stylesheet and the actual font inlined as a data
 * URI. Nothing is recreated or approximated, so what gets approved is what
 * ships. The iframe also means the site's CSS and the review chrome cannot
 * contaminate each other, and it lets the width toggle exercise the real
 * responsive breakpoints rather than faking them.
 *
 *   node scripts/build-preview.mjs [outfile]
 */

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const OUT = process.argv[2] || join(ROOT, 'preview', 'checkpoint-2.html');

if (!existsSync(DIST)) {
  console.error('No dist/. Run `npm run build:all` first.');
  process.exit(1);
}

/** Pages to include, in review order. */
const PAGES = [
  {
    site: 'ar',
    path: '/',
    label: 'AR home',
    note: 'Arkansas home page. Compare the wording against Kansas: no two sites share a sentence.',
  },
  {
    site: 'ar',
    path: '/arkansas',
    label: 'AR state page',
    note: 'The page the Arkansas site exists to rank. It answers the question in the first paragraph.',
  },
  { site: 'ar', path: '/how-it-works', label: 'AR how it works' },
  { site: 'ar', path: '/what-makes-land-qualify', label: 'AR what qualifies' },
  { site: 'ar', path: '/faq', label: 'AR questions' },
  {
    site: 'ks',
    path: '/',
    label: 'KS home',
    note: 'Kansas home page. Different accent tone, same layout, completely different copy.',
  },
  {
    site: 'ks',
    path: '/kansas',
    label: 'KS state page',
    note: 'Leads on certified utility territories, which is the fact that matters most in Kansas.',
  },
  { site: 'ks', path: '/how-it-works', label: 'KS how it works' },
  { site: 'ks', path: '/what-makes-land-qualify', label: 'KS what qualifies' },
  { site: 'ks', path: '/faq', label: 'KS questions' },
  { site: 'hub', path: '/', label: 'Hub home', note: 'The page most landowners will land on.' },
  { site: 'hub', path: '/states', label: 'Hub states' },
  { site: 'hub', path: '/about', label: 'Hub about' },
  {
    site: 'hub',
    path: '/privacy',
    label: 'Privacy',
    note: 'Written conservatively. Not reviewed by an attorney, by decision.',
  },
  {
    site: 'hub',
    path: '/terms',
    label: 'Terms',
    note: 'Read the section on what we are and are not. That is the part that matters.',
  },
  {
    site: 'va',
    path: '/',
    label: 'Parked state',
    note: 'Virginia. This is the whole site for the four states we hold but have not launched.',
  },
];

const fontData = readFileSync(join(ROOT, 'public/fonts/source-sans-3-latin.woff2')).toString('base64');

/** Stylesheets for a site, with the font swapped for an inline data URI. */
function cssFor(site) {
  const dir = join(DIST, site, '_astro');
  if (!existsSync(dir)) return '';
  return readdirSync(dir)
    .filter((f) => f.endsWith('.css'))
    .sort()
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n')
    .replace(
      /url\(\s*["']?\/fonts\/source-sans-3-latin\.woff2["']?\s*\)/g,
      `url(data:font/woff2;base64,${fontData})`,
    );
}

const cssCache = new Map();
const documents = [];

for (const page of PAGES) {
  const file = join(DIST, page.site, page.path === '/' ? 'index.html' : `${page.path}/index.html`);
  if (!existsSync(file)) {
    console.warn(`  skipped, not built: ${page.site}${page.path}`);
    continue;
  }

  const html = readFileSync(file, 'utf8');
  const root = parse(html);

  if (!cssCache.has(page.site)) cssCache.set(page.site, cssFor(page.site));

  // The accent custom properties are set on <html>, so they have to come along.
  const rootStyle = /<html[^>]*style="([^"]*)"/.exec(html)?.[1] ?? '';

  // Stylesheet links are replaced by the inlined CSS. Everything else in the
  // body, including Astro's inline <style> blocks, is kept exactly as built.
  const body = root.querySelector('body');
  const inlineStyles = root
    .querySelectorAll('head style')
    .map((node) => node.innerHTML)
    .join('\n');

  documents.push({
    ...page,
    rootStyle,
    title: root.querySelector('title')?.text ?? page.label,
    css: `${cssCache.get(page.site)}\n${inlineStyles}`,
    body: body ? body.innerHTML : '',
    bodyClass: body?.getAttribute('class') ?? '',
  });
}

/*
 * The pages carry their own inline <script> blocks, and a literal "</script>"
 * inside this JSON would close the tag it is embedded in and break the whole
 * file. Escaping every "<" avoids that. JSON only ever contains "<" inside
 * string values, and < parses back to "<", so nothing is lost.
 * U+2028 and U+2029 are legal in JSON but not in a JavaScript string literal.
 */
const payload = JSON.stringify(documents)
  .replace(/</g, '\\u003c')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');

const out = `<title>PoweredLandCo checkpoint 2 preview</title>

<div class="shell">
  <header class="bar">
    <div class="bar__id">
      <strong>PoweredLandCo</strong>
      <span>Checkpoint 2 preview</span>
    </div>

    <div class="bar__controls">
      <div class="seg" role="group" aria-label="Screen width">
        <button type="button" data-width="390" class="is-on">Phone</button>
        <button type="button" data-width="1200">Desktop</button>
      </div>
    </div>
  </header>

  <nav class="tabs" aria-label="Pages">
    ${documents
      .map(
        (doc, i) =>
          `<button type="button" data-page="${i}"${i === 0 ? ' class="is-on"' : ''}>${doc.label}</button>`,
      )
      .join('\n    ')}
  </nav>

  <p class="note" data-note></p>

  <div class="stage">
    <iframe title="Page preview" data-frame></iframe>
  </div>

  <footer class="foot">
    <p>
      These are the real built pages, not mockups. Links work. The form is live
      and will report that it cannot send, because this preview is not connected
      to a lead destination yet.
    </p>
  </footer>
</div>

<style>
  /*
   * Review chrome only. It is deliberately cool and quiet so it reads as the
   * frame around the work rather than part of it, and so the warm palette of
   * the actual site is judged on its own.
   *
   * The chrome follows the viewer's theme. The pages inside the frame do not,
   * because the site itself commits to a single warm light treatment and
   * showing it any other way would misrepresent what is being approved.
   */
  :root {
    --chrome-bg: #eceef1;
    --chrome-panel: #ffffff;
    --chrome-ink: #16181d;
    --chrome-muted: #5d6470;
    --chrome-line: #d3d8df;
    --chrome-on: #21304a;
    --chrome-on-ink: #ffffff;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --chrome-bg: #14161a;
      --chrome-panel: #1c1f25;
      --chrome-ink: #eef0f3;
      --chrome-muted: #9aa2af;
      --chrome-line: #2c313a;
      --chrome-on: #c8d4e8;
      --chrome-on-ink: #14161a;
    }
  }

  :root[data-theme='dark'] {
    --chrome-bg: #14161a;
    --chrome-panel: #1c1f25;
    --chrome-ink: #eef0f3;
    --chrome-muted: #9aa2af;
    --chrome-line: #2c313a;
    --chrome-on: #c8d4e8;
    --chrome-on-ink: #14161a;
  }

  :root[data-theme='light'] {
    --chrome-bg: #eceef1;
    --chrome-panel: #ffffff;
    --chrome-ink: #16181d;
    --chrome-muted: #5d6470;
    --chrome-line: #d3d8df;
    --chrome-on: #21304a;
    --chrome-on-ink: #ffffff;
  }

  body {
    margin: 0;
    background: var(--chrome-bg);
    color: var(--chrome-ink);
    font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    font-size: 15px;
    line-height: 1.5;
  }

  .shell {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 100vh;
    padding: 16px;
    box-sizing: border-box;
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .bar__id {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }

  .bar__id strong {
    font-size: 16px;
    letter-spacing: -0.01em;
  }

  .bar__id span {
    color: var(--chrome-muted);
    font-size: 13px;
  }

  .seg {
    display: inline-flex;
    background: var(--chrome-panel);
    border: 1px solid var(--chrome-line);
    border-radius: 8px;
    overflow: hidden;
  }

  .seg button {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--chrome-ink);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    padding: 8px 16px;
    min-height: 38px;
    cursor: pointer;
  }

  .seg button.is-on {
    background: var(--chrome-on);
    color: var(--chrome-on-ink);
  }

  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .tabs button {
    appearance: none;
    background: var(--chrome-panel);
    border: 1px solid var(--chrome-line);
    border-radius: 999px;
    color: var(--chrome-muted);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    padding: 7px 14px;
    min-height: 36px;
    cursor: pointer;
  }

  .tabs button.is-on {
    background: var(--chrome-on);
    border-color: var(--chrome-on);
    color: var(--chrome-on-ink);
  }

  .note {
    margin: 0;
    min-height: 20px;
    color: var(--chrome-muted);
    font-size: 13px;
  }

  .note:empty {
    display: none;
  }

  .stage {
    flex: 1;
    display: flex;
    justify-content: center;
    min-height: 0;
  }

  iframe {
    width: 390px;
    max-width: 100%;
    height: min(78vh, 900px);
    background: #faf8f3;
    border: 1px solid var(--chrome-line);
    border-radius: 10px;
    transition: width 160ms ease;
  }

  .foot p {
    margin: 0;
    max-width: 62ch;
    color: var(--chrome-muted);
    font-size: 13px;
  }

  button:focus-visible {
    outline: 2px solid var(--chrome-on);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    iframe {
      transition: none;
    }
  }
</style>

<script>
  (function () {
    var docs = ${payload};
    var frame = document.querySelector('[data-frame]');
    var note = document.querySelector('[data-note]');
    var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-page]'));
    var widths = Array.prototype.slice.call(document.querySelectorAll('[data-width]'));
    var current = 0;

    function compose(doc) {
      return (
        '<!doctype html><html style="' + doc.rootStyle + '"><head>' +
        '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
        '<style>' + doc.css + '</style></head>' +
        '<body class="' + doc.bodyClass + '">' + doc.body +
        '<script>' +
        'document.addEventListener("click", function (event) {' +
        '  var link = event.target.closest && event.target.closest("a");' +
        '  if (!link) return;' +
        '  var href = link.getAttribute("href") || "";' +
        '  if (href.charAt(0) === "#" || href.indexOf("mailto:") === 0) return;' +
        '  event.preventDefault();' +
        '  parent.postMessage({ previewNavigate: href }, "*");' +
        '});' +
        '<\\/script></body></html>'
      );
    }

    function show(index) {
      current = index;
      var doc = docs[index];
      frame.srcdoc = compose(doc);
      note.textContent = doc.note || '';
      tabs.forEach(function (tab, i) {
        tab.classList.toggle('is-on', i === index);
      });
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () {
        show(i);
      });
    });

    widths.forEach(function (button) {
      button.addEventListener('click', function () {
        widths.forEach(function (other) {
          other.classList.toggle('is-on', other === button);
        });
        frame.style.width = button.dataset.width + 'px';
      });
    });

    // A link inside a previewed page switches the preview to that page when we
    // have it, so navigation behaves the way it will on the real site.
    window.addEventListener('message', function (event) {
      var href = event.data && event.data.previewNavigate;
      if (!href) return;
      var site = docs[current].site;
      var path = href.replace(/^https?:\\/\\/[^/]+/, '') || '/';
      path = path.replace(/\\/$/, '') || '/';
      for (var i = 0; i < docs.length; i += 1) {
        if (docs[i].site === site && docs[i].path === path) {
          show(i);
          return;
        }
      }
    });

    show(0);
  })();
</script>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out, 'utf8');

const kb = Math.round(Buffer.byteLength(out) / 1024);
console.log(`Preview written: ${OUT.replace(ROOT, '')} (${kb} KB, ${documents.length} pages)`);

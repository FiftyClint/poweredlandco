import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

/**
 * Minimal static server for auditing a built site. Mirrors how Cloudflare
 * serves a directory-format build: /about resolves to /about/index.html.
 */
export function serveDir(root) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const candidates = [
        join(root, url),
        join(root, url, 'index.html'),
        join(root, `${url}.html`),
      ];

      const file = candidates.find((c) => existsSync(c) && statSync(c).isFile());

      if (!file) {
        const notFound = join(root, '404.html');
        const body = existsSync(notFound) ? readFileSync(notFound) : 'Not found';
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(body);
        return;
      }

      res.writeHead(200, {
        'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(readFileSync(file));
    });

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

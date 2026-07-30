import { existsSync } from 'node:fs';

/**
 * Path to the Chromium that is already installed in this environment.
 *
 * The playwright npm package pins a browser build number and will refuse to
 * launch anything else by default. The container ships its own Chromium, and
 * downloading a second copy to satisfy a version pin is a waste of time and
 * disk, so we point Playwright at the one that is already here.
 *
 * Returns null when nothing is preinstalled, in which case Playwright falls
 * back to its own resolution and reports its own error.
 */
export function chromiumPath() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    '/opt/pw-browsers/chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ].filter(Boolean);

  return candidates.find((path) => existsSync(path)) ?? null;
}

export function launchOptions(extra = {}) {
  const executablePath = chromiumPath();
  return {
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    ...extra,
  };
}

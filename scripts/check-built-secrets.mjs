#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Refuses to deploy if a credential ended up in a file a visitor can download.
 *
 * The build reads NOTION_TOKEN to decide whether to render the form at all, so
 * the token is present on the build machine while pages are being generated.
 * It is only ever tested for length and never returned from
 * src/data/lead-capture.mjs, but "never" is a claim about code that can be
 * edited, and a leaked token is not the kind of mistake you get to notice
 * quietly and fix. So the finished files are searched for it before anything
 * is uploaded.
 *
 * Cheap, and it fails the deploy rather than reporting.
 */

const ROOT = new URL('../dist', import.meta.url).pathname;

/** Secrets whose value must never appear in a built file. */
const WATCHED = ['NOTION_TOKEN', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'];

/*
 * Notion's own credential prefixes, checked as well as the exact value. This
 * catches a token that was pasted into a source file by hand, which the value
 * check would miss because that token is not the one in the environment.
 */
const PATTERNS = [
  { label: 'a Notion integration token', re: /\bntn_[A-Za-z0-9]{20,}/ },
  { label: 'a Notion integration token', re: /\bsecret_[A-Za-z0-9]{30,}/ },
];

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(path);
  }
};

try {
  walk(ROOT);
} catch {
  console.error('No dist directory. Run npm run build:all first.');
  process.exit(1);
}

/*
 * A short or placeholder value would match half the alphabet, so only values
 * long enough to be a real credential are searched for.
 */
const values = WATCHED.map((name) => [name, (process.env[name] ?? '').trim()]).filter(
  ([, value]) => value.length >= 16,
);

const findings = [];

for (const path of files) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    continue; // binary, and a credential is not going to be hiding in a font
  }

  for (const [name, value] of values) {
    if (text.includes(value)) findings.push(`${path} contains the value of ${name}`);
  }
  for (const { label, re } of PATTERNS) {
    if (re.test(text)) findings.push(`${path} contains something shaped like ${label}`);
  }
}

console.log(`Scanned ${files.length} built file(s) for ${values.length} configured secret(s).`);

if (findings.length === 0) {
  console.log('No credential found in the built files.');
  process.exit(0);
}

console.error('');
console.error('SECRET FOUND IN A BUILT FILE. Nothing has been deployed.');
console.error('');
for (const finding of findings) console.error(`  ${finding}`);
console.error('');
console.error('Treat the credential as compromised even though it was not uploaded:');
console.error('it exists in the CI logs and the build artifacts. Revoke it, issue a');
console.error('new one, update the repository secret, then fix whatever put it there.');
process.exit(1);

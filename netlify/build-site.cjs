// Builds _site/, the folder this site deploys (see netlify.toml): every website
// file, hard-linked, and none of the internal ones.
//
// Why: the site used to deploy the whole folder, so the function source
// (netlify/functions/*.js, including the lead guard) was a public URL, and
// outreach/ and marketing/ (contact lists, parcel-owner scans, letters,
// strategy notes) only stayed hidden behind netlify.toml 404 rules. Those rules
// do not hold: Netlify serves file paths case-insensitively but matches
// redirect rules case-sensitively, so /Netlify/functions/submission-created.js
// still returned the source (found 2026-10-25). A file that is not deployed
// can't leak.
//
// Build from the working folder: the public email pages live in the gitignored
// outreach/emails/, so a git-archive export does not have them, and this script
// refuses to build without them.
//   node netlify/build-site.cjs
//   netlify deploy --prod --no-build --dir _site --functions netlify/functions --site 6cc5eece-1db2-4b39-9873-a2ebe9332f4e
// Never deploy with --dir . (that publishes outreach/, marketing/, netlify/ again).
//
//   node netlify/build-site.cjs <src> <out>     (local check against another tree)
'use strict';
const fs = require('fs');
const path = require('path');

// Top-level folders that are never part of the website (matched case-insensitively).
const PRIVATE_DIRS = new Set(['netlify', 'outreach', 'marketing', 'node_modules', 'docs', 'scripts', 'leads', 'research', '_site']);
// File types that are never pages or assets here: notes, scripts, data, config.
const PRIVATE_EXT = /\.(md|markdown|mjs|cjs|py|pyc|sh|csv|tsv|xlsx?|json|toml|ya?ml|env|log|bak|sql|sqlite|db|zip)$/i;
// The site's own script. Any other .js at the root is a tool, never a page asset.
const PUBLIC_ROOT_JS = new Set(['script.js']);

// The only outreach files that are public are the emailed pitch pages and their
// QR codes (sent emails may link to them). They are listed one per line in this
// manifest, which is gitignored with the rest of outreach/: the file names name
// the people pitched, and this repo is public. Nothing else in outreach/ is ever
// published, whatever the manifest says.
const MANIFEST = 'outreach/emails/PUBLIC-FILES.txt';
function publicOutreach(src) {
  const abs = path.join(src, MANIFEST);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .filter((name) => /^[A-Za-z0-9][A-Za-z0-9._-]*\.(html|png)$/.test(name)) // a plain file in outreach/emails/, page or QR only
    .map((name) => 'outreach/emails/' + name);
}

// rel: path relative to the site root, with / separators. Never true for outreach/.
function isPublic(rel) {
  const parts = rel.split('/');
  if (parts.some((p) => p.startsWith('.'))) return false; // .claude/, .git/, .netlify/, .env ...
  if (parts.length > 1 && PRIVATE_DIRS.has(parts[0].toLowerCase())) return false;
  if (PRIVATE_EXT.test(rel)) return false;
  if (parts.length === 1 && /\.js$/i.test(rel) && !PUBLIC_ROOT_JS.has(rel)) return false;
  return true;
}

function build(src, out) {
  src = path.resolve(src);
  out = path.resolve(out);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const published = [];
  const add = (rel) => {
    const dest = path.join(out, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    try { fs.linkSync(path.join(src, rel), dest); } catch (e) { fs.copyFileSync(path.join(src, rel), dest); }
    published.push(rel);
  };
  (function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      if (abs === out) continue;
      const rel = path.relative(src, abs).split(path.sep).join('/');
      if (ent.isDirectory()) {
        if (ent.name.startsWith('.') || (dir === src && PRIVATE_DIRS.has(ent.name.toLowerCase()))) continue;
        walk(abs);
        continue;
      }
      if (!ent.isFile() || !isPublic(rel)) continue; // symlinks, sockets: skipped
      add(rel);
    }
  })(src);
  // outreach/ is pruned above; only the manifest's email files come out of it.
  const outreach = publicOutreach(src) || [];
  const missing = [];
  for (const rel of outreach) {
    const st = fs.lstatSync(path.join(src, rel), { throwIfNoEntry: false });
    if (st && st.isFile()) add(rel); else missing.push(rel);
  }
  return Object.assign(published, { outreach, missing });
}

const MUST = ['index.html', 'styles.css', 'script.js', 'js/human-check.js', 'images/hero-rainbow.jpg'];

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const src = process.argv[2] || root;
  const out = process.argv[3] || path.join(src, '_site');
  const published = build(src, out);
  // Exit non-zero (nothing to deploy) rather than publish a broken site.
  for (const must of MUST) {
    if (!fs.existsSync(path.join(out, must))) { console.error('build-site: missing ' + must); process.exit(1); }
  }
  if (!publicOutreach(src)) {
    console.error('build-site: missing ' + MANIFEST + ' (outreach/ is gitignored: build from the working folder, not an export)');
    process.exit(1);
  }
  if (published.missing.length) { console.error('build-site: listed email files missing: ' + published.missing.join(', ')); process.exit(1); }
  const outreachSet = new Set(published.outreach);
  const bad = published.filter((f) => !isPublic(f) && !outreachSet.has(f));
  if (bad.length) { console.error('build-site: internal files in output: ' + bad.join(', ')); process.exit(1); }
  const images = published.filter((f) => /\.jpe?g$/i.test(f)).length;
  if (images < 30) { console.error('build-site: only ' + images + ' photos, refusing to publish'); process.exit(1); }
  console.log('build-site: published ' + published.length + ' files (' + published.outreach.length + ' from outreach/emails) to ' +
    path.relative(process.cwd(), out));
}

module.exports = { isPublic, build, publicOutreach, PRIVATE_DIRS, PRIVATE_EXT, MANIFEST, MUST };

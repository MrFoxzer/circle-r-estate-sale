// The site deploys _site/, built by netlify/build-site.cjs from this folder.
// This fails if an internal file (function source, outreach lists, marketing
// notes, .env, package files, config) would be published, if a real page or
// photo would be left out, if anything in outreach/ other than a listed email
// page or QR code would come out, if netlify.toml stops publishing _site/, or
// if the second-layer 404 rules go missing.
//   node .claude/tests/private-paths.test.cjs
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const { isPublic, build, publicOutreach, MANIFEST } = require(path.join(ROOT, 'netlify/build-site.cjs'));

const tracked = execFileSync('/usr/bin/git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);

// 1. Nothing internal is published, in any letter case.
const INTERNAL = (f) => f.split('/').some((p) => p.startsWith('.')) || /^(netlify|outreach|marketing|node_modules|docs|scripts)\//i.test(f) ||
  /\.(md|mjs|cjs|py|sh|json|toml|csv|xlsx?)$/i.test(f) || (!f.includes('/') && /\.js$/i.test(f) && f !== 'script.js');
const leaks = tracked.filter((f) => INTERNAL(f) && isPublic(f));
assert.deepStrictEqual(leaks, [], 'internal files that would be published:\n  ' + leaks.join('\n  '));
for (const f of ['netlify/functions/submission-created.js', 'Netlify/functions/submission-created.js', 'NETLIFY/FUNCTIONS/_lib/lead-guard.js',
  'netlify/build-site.cjs', 'netlify.toml', '.env', '.claude/tests/lead-guard.test.cjs', 'package.json', 'package-lock.json',
  'node_modules/playwright/index.js', 'outreach/all-contacts-master.csv', 'Outreach/all-contacts-master.csv', 'outreach/scan-mn-counties.py',
  'outreach/letters/letter.html', 'outreach/letters-pdf/letter.pdf', 'outreach/mailmerge/merge.html', 'outreach/emails/page.html',
  'outreach/emails/PUBLIC-FILES.txt', 'OUTREACH/EMAILS/QR-CODE.PNG', 'marketing/README.md', 'Marketing/ads/ad.html', 'CLAUDE.md', 'tool.js']) {
  assert.ok(!isPublic(f), f + ' would be published');
}

// 2. Every page and asset is still published.
const WEB = /\.(html?|css|js|jpe?g|png|gif|webp|avif|svg|ico|mp4|webm|pdf|txt|xml|webmanifest|woff2?|ttf|otf)$/i;
const dropped = tracked.filter((f) => !INTERNAL(f) && WEB.test(f) && !isPublic(f));
assert.deepStrictEqual(dropped, [], 'website files that would be left out:\n  ' + dropped.join('\n  '));
for (const f of ['index.html', 'styles.css', 'script.js', 'js/human-check.js']) assert.ok(isPublic(f), f + ' must be published');

// 3. The local manifest (gitignored, so only on Jacob's machine) lists email pages and QR codes only, all present.
const listed = publicOutreach(ROOT);
if (listed) {
  assert.ok(listed.length > 0, MANIFEST + ' lists nothing');
  for (const f of listed) {
    assert.ok(/^outreach\/emails\/[^/]+\.(html|png)$/.test(f), f + ' is not an email page or QR code');
    assert.ok(fs.existsSync(path.join(ROOT, f)), f + ' is listed but missing');
  }
  assert.ok(execFileSync('/usr/bin/git', ['check-ignore', MANIFEST], { cwd: ROOT, encoding: 'utf8' }).trim() === MANIFEST, MANIFEST + ' must stay gitignored');
}

// 4. build() on a small tree: private dirs pruned in any letter case, only listed email files kept (no paths, no other
//    types), hard-linked, old output cleared.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'build-site-'));
try {
  const put = (rel, body = rel) => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), body); };
  ['index.html', 'styles.css', 'script.js', 'js/human-check.js', 'images/a.jpg', 'landdotcom-photos.txt',
    'outreach/emails/01-a.html', 'outreach/emails/qr-code.png', 'outreach/emails/02-b.html', 'outreach/emails/list.csv', 'outreach/list.csv',
    'outreach/letters/l.html', 'Marketing/README.md', 'marketing/ads/a.png', 'netlify/functions/submission-created.js', 'NETLIFY/functions/x.js',
    'node_modules/p/index.js', '.claude/t.cjs', '.env', 'package.json', 'netlify.toml', 'tool.js'].forEach((f) => put(f));
  put(MANIFEST, '# comment\n01-a.html\nqr-code.png\nlist.csv\n../list.csv\n../letters/l.html\n.env\n\n');
  put('_site/stale.html');
  const out = path.join(tmp, '_site');
  const got = build(tmp, out);
  assert.deepStrictEqual([...got].sort(), ['images/a.jpg', 'index.html', 'js/human-check.js', 'landdotcom-photos.txt',
    'outreach/emails/01-a.html', 'outreach/emails/qr-code.png', 'script.js', 'styles.css']);
  assert.deepStrictEqual(got.missing, []);
  assert.ok(!fs.existsSync(path.join(out, 'stale.html')), 'old _site contents were kept');
  assert.strictEqual(fs.statSync(path.join(out, 'index.html')).ino, fs.statSync(path.join(tmp, 'index.html')).ino, 'not hard-linked');
  fs.rmSync(path.join(tmp, MANIFEST));
  assert.ok(!build(tmp, out).some((f) => f.startsWith('outreach/')), 'outreach files published without a manifest');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

// 5. netlify.toml publishes _site/ and keeps the exact-case 404 rules as a second layer.
const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
assert.ok(/^\s*publish\s*=\s*"_site"\s*$/m.test(toml), 'netlify.toml must publish _site');
assert.ok(/^\s*command\s*=\s*"node netlify\/build-site\.cjs"\s*$/m.test(toml), 'netlify.toml must build with netlify/build-site.cjs');
assert.ok(/^\s*functions\s*=\s*"netlify\/functions"\s*$/m.test(toml), 'functions must stay at netlify/functions');
for (const from of ['/netlify/*', '/outreach/*', '/marketing/*']) {
  const re = new RegExp('from\\s*=\\s*"' + from.replace(/[/*]/g, '\\$&') + '"\\s*\\n\\s*to\\s*=\\s*"[^"]*"\\s*\\n\\s*status\\s*=\\s*404\\s*\\n\\s*force\\s*=\\s*true');
  assert.ok(re.test(toml), 'netlify.toml lost its ' + from + ' 404 rule');
}

console.log('ok: ' + tracked.length + ' tracked files, ' + tracked.filter(isPublic).length + ' published, ' +
  tracked.filter((f) => !isPublic(f)).length + ' internal left out' + (listed ? ', ' + listed.length + ' listed email files' : ', no local manifest'));

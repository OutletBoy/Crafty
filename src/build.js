#!/usr/bin/env node
// Builds the one-file page (crafty-rN.html) from the parts in this folder. Node only, no packages to install.
//   node src/build.js           write ../crafty-rN.html, where rN comes from VERSION in js/00-version.js
//   node src/build.js --check   change nothing; exit 1 if ../crafty-rN.html isn't exactly a fresh build
//   node src/build.js --force   also replace a build that's already listed on the site (see README.md)
// page.html is the outline. A line that is exactly "@include <file>" is replaced by that file's text;
// "@include js/*.js" takes every .js file in js/, in name order, so a new part only needs a numbered file name.
'use strict';
const fs = require('fs'), path = require('path');

const SRC = __dirname;
const INCLUDE = /^@include (\S+)\n/gm;

// The files a spec names, in the order they go into the page
function filesFor(src, spec) {
  const star = spec.indexOf('*');
  if (star < 0) {
    const f = path.join(src, spec);
    if (!fs.existsSync(f)) throw new Error(`page.html includes ${spec}, but there's no such file in src/`);
    return [f];
  }
  const dir = path.join(src, path.dirname(spec)), pat = path.basename(spec);
  if (!/^\*\.[a-z]+$/.test(pat)) throw new Error(`Only "folder/*.ext" patterns are supported, not ${spec}`);
  const ext = pat.slice(1);
  const found = fs.existsSync(dir) ? fs.readdirSync(dir).filter(n => n.endsWith(ext)).sort() : [];
  if (!found.length) throw new Error(`page.html includes ${spec}, but that matches no files`);
  return found.map(n => path.join(dir, n));
}

// Every part file the outline pulls in, in page order
function parts(src = SRC) {
  const tpl = fs.readFileSync(path.join(src, 'page.html'), 'utf8');
  return [...tpl.matchAll(INCLUDE)].flatMap(m => filesFor(src, m[1]));
}

function readPart(f) {
  let text = fs.readFileSync(f, 'utf8');
  if (!text.endsWith('\n')) text += '\n'; // an editor that drops the last newline shouldn't glue two parts together
  // These would end the page's <script> or <style> early and break the page in a confusing way
  const closer = f.endsWith('.js') ? /<\/script/i : f.endsWith('.css') ? /<\/style/i : null;
  if (closer && closer.test(text)) throw new Error(`${path.basename(f)} contains "${closer.source.replace('\\', '')}", which would cut the page short`);
  return text;
}

function build(src = SRC) {
  const tpl = fs.readFileSync(path.join(src, 'page.html'), 'utf8');
  const html = tpl.replace(INCLUDE, (m, spec) => filesFor(src, spec).map(readPart).join(''));
  const left = html.match(/^@include .*$/m);
  if (left) throw new Error(`An include was left in the page: "${left[0]}" (it must be on a line of its own)`);
  versionOf(html); // fails early if VERSION is missing
  return html;
}

function versionOf(html) {
  const m = html.match(/^const VERSION = "([^"]+)";/m);
  if (!m) throw new Error('No line starting `const VERSION = "...";` was found');
  if (!/ r\d+$/.test(m[1])) throw new Error(`VERSION "${m[1]}" should end in a build number like " r10"`);
  return m[1];
}

const outName = version => `crafty-${version.split(' ').pop()}.html`;

// Which line two texts first differ on, for a readable message
function firstDiff(a, b) {
  const x = a.split('\n'), y = b.split('\n');
  for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) return { line: i + 1, built: x[i], file: y[i] };
  return null;
}

function main(argv) {
  const check = argv.includes('--check'), force = argv.includes('--force');
  const html = build(), version = versionOf(html), name = outName(version);
  const out = path.join(SRC, '..', name);
  const old = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
  if (check) {
    if (old === html) { console.log(`${name} matches the source.`); return 0; }
    if (old === null) { console.log(`${name} doesn't exist yet. Run node src/build.js`); return 1; }
    const d = firstDiff(html, old);
    console.log(`${name} doesn't match the source (first difference at line ${d.line}). Run node src/build.js`);
    return 1;
  }
  if (old === html) { console.log(`${name} is already up to date.`); return 0; }
  // A build that's on the site has been (or is about to be) handed to the user: never change it in place
  const index = path.join(SRC, '..', 'site', 'index.html');
  if (old !== null && !force && fs.existsSync(index) && fs.readFileSync(index, 'utf8').includes(`href="${name}"`)) {
    console.log(`${name} is already listed on the site, so it wasn't replaced. Bump VERSION in js/00-version.js for a new build, or pass --force if it hasn't been uploaded yet.`);
    return 1;
  }
  fs.writeFileSync(out, html);
  console.log(`Wrote ${name} (${Buffer.byteLength(html)} bytes, ${version}).`);
  return 0;
}

module.exports = { build, parts, versionOf, outName, firstDiff };
if (require.main === module) {
  try { process.exit(main(process.argv.slice(2))); }
  catch (e) { console.error('Build failed: ' + e.message); process.exit(1); }
}

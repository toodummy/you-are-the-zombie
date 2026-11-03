#!/usr/bin/env node
// Build: inline src/sim.js, render.js, audio.js, main.js into src/index.html
// at the marker /*@SCRIPTS@*/ and write dist/you-are-the-zombie.html.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT = path.join(OUT_DIR, 'you-are-the-zombie.html');
const WEB_DIR = path.join(OUT_DIR, 'web');
const MARKER = '/*@SCRIPTS@*/';
const ORDER = ['sim.js', 'render.js', 'audio.js', 'main.js'];

function fail(msg) {
  console.error('build failed: ' + msg);
  process.exit(1);
}

function readSrc(name) {
  const p = path.join(SRC, name);
  if (!fs.existsSync(p)) fail('missing src/' + name + ' (expected at ' + p + ')');
  return fs.readFileSync(p, 'utf8');
}

// A literal "</script" inside inlined JS would end the <script> element early.
// "<\/script" means the same thing inside JS strings, regexes and comments.
function escapeScript(code) {
  return code.replace(/<\/(script)/gi, '<\\/$1');
}

function build() {
  const template = readSrc('index.html');
  const at = template.indexOf(MARKER);
  if (at < 0) fail('marker ' + MARKER + ' not found in src/index.html');
  if (template.indexOf(MARKER, at + MARKER.length) >= 0) fail('marker ' + MARKER + ' appears more than once in src/index.html');

  const parts = ORDER.map((name) => '// --- ' + name + ' ---\n' + escapeScript(readSrc(name)));
  const scripts = '\n' + parts.join('\n') + '\n';
  // Use slice-and-join (not String.replace) so "$&" etc. in sources are not interpreted.
  const html = template.slice(0, at) + scripts + template.slice(at + MARKER.length);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, html, 'utf8');
  const bytes = Buffer.byteLength(html, 'utf8');
  console.log('wrote ' + path.relative(ROOT, OUT) + ' (' + bytes + ' bytes, ' + (bytes / 1024).toFixed(1) + ' KB)');

  // Standalone page for GitHub Pages, Vercel and itch.io: the artifact host normally
  // supplies this document skeleton, so other hosts get it written out here.
  const page = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
    '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}' +
    'body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n' +
    '</head>\n<body>\n' + html + '\n</body>\n</html>\n';
  fs.mkdirSync(WEB_DIR, { recursive: true });
  fs.writeFileSync(path.join(WEB_DIR, 'index.html'), page, 'utf8');
  console.log('wrote ' + path.relative(ROOT, path.join(WEB_DIR, 'index.html')) + ' (standalone page)');
  return OUT;
}

if (require.main === module) build();
module.exports = { build, escapeScript, OUT };

// Node 22+ treats `node --test tests/` as a single entry point and resolves the
// directory to this file, so load every *.test.js from here.
// (`node --test` with no arguments also works: it finds tests/*.test.js itself.)
'use strict';
const fs = require('node:fs');
const path = require('node:path');

for (const f of fs.readdirSync(__dirname).filter((n) => n.endsWith('.test.js')).sort()) {
  require(path.join(__dirname, f));
}

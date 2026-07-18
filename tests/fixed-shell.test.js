const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => {
  const fullPath = path.join(root, file);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
};

const html = read('index.html');
const base = read('css/base.css');
const table = read('css/table.css');
const viewport = read('js/viewport.js');
const app = read('js/app.js');

assert.match(html, /id="appHost"/);
assert.match(html, /id="appShell"/);
assert.match(html, /id="appScroll"/);
assert.match(base, /#appScroll[\s\S]*overflow-y:\s*auto/);
assert.match(base, /html[\s\S]*overflow:\s*hidden/);
assert.match(table, /--grid-line:\s*1px/);
assert.doesNotMatch(viewport, /scrollTop|scrollTo/);
assert.doesNotMatch(app, /devicePixelRatio|addEventListener\("resize"/);

console.log('fixed shell contract: PASS');

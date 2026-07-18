const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

assert.doesNotMatch(app, /ZOOM_COMPENSATION/);
assert.doesNotMatch(app, /window\.scrollTo\s*\(/);
assert.match(app, /outerWidth/);
assert.match(app, /document\.fonts\.ready/);
assert.doesNotMatch(css, /overflow-anchor:\s*none/);
assert.match(css, /overflow-anchor:\s*auto/);

console.log('zoom behavior contract: PASS');

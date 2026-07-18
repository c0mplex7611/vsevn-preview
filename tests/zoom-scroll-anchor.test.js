const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const scriptPath = path.join(
  __dirname,
  "..",
  "header_only",
  "js",
  "script.js",
);
const source = fs.readFileSync(scriptPath, "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const baseCss = fs.readFileSync(
  path.join(__dirname, "..", "header_only", "css", "style.css"),
  "utf8",
);
const adsCss = fs.readFileSync(
  path.join(__dirname, "..", "header_only", "css", "compiled-ads.css"),
  "utf8",
);

function loadFunction(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist in script.js`);

  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") depth -= 1;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }

  assert.notEqual(end, -1, `${name} must have a complete body`);
  return vm.runInNewContext(`(${source.slice(start, end)})`);
}

test("internal scroll position preserves its physical offset", () => {
  const convert = loadFunction("getZoomScrollTopForScale");

  assert.equal(convert(2000, 1, 1.25), 1600);
  assert.equal(convert(1600, 1.25, 1), 2000);
  assert.equal(convert(2000, 1, 0.8), 2500);
  assert.equal(convert(2500, 0.8, 1), 2000);
});

test("invalid zoom values leave scroll position unchanged", () => {
  const convert = loadFunction("getZoomScrollTopForScale");

  assert.equal(convert(2000, 0, 1), 2000);
  assert.equal(convert(2000, 1, NaN), 2000);
  assert.equal(convert(-20, 1, 1.25), 0);
});

test("zoom frame is wrapped by a dedicated scroll extent", () => {
  assert.match(
    html,
    /id="zoomViewport"[\s\S]*id="zoomScrollSpace"[\s\S]*id="zoomFrame"/,
  );
});

test("document is fixed and zoom viewport owns vertical scrolling", () => {
  assert.match(
    baseCss,
    /#zoomViewport\s*\{[\s\S]*position:\s*fixed;[\s\S]*overflow-y:\s*scroll;/,
  );
  assert.match(
    adsCss,
    /html:has\(\.ads-page\)\s*\{[^}]*overflow-y:\s*hidden\s*!important;/,
  );
  assert.doesNotMatch(
    adsCss,
    /html:has\(\.ads-page\)\s*\{[^}]*overflow-y:\s*scroll\s*!important;/,
  );
});

test("zoom controller sizes the extent and never restores a document anchor", () => {
  assert.match(source, /function syncZoomScrollExtent\(\)/);
  assert.match(
    source,
    /viewport\.scrollTop = getZoomScrollTopForScale\(/,
  );
  assert.doesNotMatch(source, /restoreZoomScrollAnchor\(/);
  assert.doesNotMatch(source, /scrollingElement\.scrollTop\s*=/);
  assert.doesNotMatch(source, /--zoom-scroll-fine-y/);
});

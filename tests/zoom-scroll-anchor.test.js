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

test("zoom anchor keeps the same relative viewport position", () => {
  const getTargetY = loadFunction("getZoomAnchorTargetViewportY");
  const anchor = { viewportY: 158, viewportRatioY: 158 / 720 };

  assert.equal(getTargetY(anchor, 720), 158);
  assert.equal(getTargetY(anchor, 576), 126.4);
  assert.equal(getTargetY(anchor, 900), 197.5);
});

test("zoom restore uses the current viewport target for scroll and residual", () => {
  assert.match(
    source,
    /const targetViewportY = getZoomAnchorTargetViewportY\(\s*anchor,\s*window\.innerHeight,?\s*\);/,
  );
  assert.match(source, /const deltaY = currentPointY - targetViewportY;/);
  assert.match(source, /const residualY = settledPointY - targetViewportY;/);
});

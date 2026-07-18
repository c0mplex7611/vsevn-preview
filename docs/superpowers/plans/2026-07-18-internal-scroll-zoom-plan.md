# Stable Internal Scroll Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the old layout's physical size and visible vertical position across browser zoom by moving the only scrollbar from the document to a controlled internal viewport.

**Architecture:** `html` and `body` become non-scrolling roots. A fixed `#zoomViewport` owns vertical scrolling, `#zoomScrollSpace` supplies transformed content dimensions, and `#zoomFrame` remains the only inversely scaled layer. Zoom changes rescale the internal `scrollTop` exactly once from the previous zoom to the next zoom; no DOM anchor or `window.scrollY` correction remains.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, Node.js built-in test runner, GitHub Pages.

## Global Constraints

- Keep the existing old layout, table, text, colors, dimensions, and interactive behavior unchanged.
- Preserve the interface's physical size at browser zoom in Chrome, Yandex Browser, and Firefox.
- Keep Firefox “Zoom Text Only” compensation independent from page-zoom scroll geometry.
- Expose exactly one vertical scrollbar on the right edge and no horizontal scrollbar.
- Do not correct `window.scrollY` during zoom.

---

### Task 1: Deterministic scroll-scale math

**Files:**
- Modify: `tests/zoom-scroll-anchor.test.js`
- Modify: `header_only/js/script.js:228-420`

**Interfaces:**
- Produces: `getZoomScrollTopForScale(scrollTop: number, previousZoom: number, nextZoom: number): number`
- Produces: `getZoomScrollContainer(): HTMLElement | null`
- Consumes: current `#zoomViewport` element.

- [ ] **Step 1: Replace the anchor regression test with failing scroll-scale tests**

```js
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
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
& 'C:\Users\Stas2\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test --test-isolation=none tests/zoom-scroll-anchor.test.js
```

Expected: FAIL because `getZoomScrollTopForScale` does not exist.

- [ ] **Step 3: Add the minimal pure conversion function**

```js
function getZoomScrollTopForScale(scrollTop, previousZoom, nextZoom) {
  const top = Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : 0;
  if (
    !Number.isFinite(previousZoom) ||
    previousZoom <= 0 ||
    !Number.isFinite(nextZoom) ||
    nextZoom <= 0
  ) {
    return top;
  }
  return top * previousZoom / nextZoom;
}

function getZoomScrollContainer() {
  return document.getElementById("zoomViewport");
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Expected: both conversion tests PASS with no failures.

- [ ] **Step 5: Commit**

```powershell
git add tests/zoom-scroll-anchor.test.js header_only/js/script.js
git commit -m "test: зафиксировать математику внутреннего скролла"
```

---

### Task 2: Single internal scroll shell

**Files:**
- Modify: `index.html:53-294`
- Modify: `header_only/css/style.css:470-540`
- Modify: `header_only/css/compiled-ads.css:2289-2325`
- Modify: `tests/zoom-scroll-anchor.test.js`

**Interfaces:**
- Produces: `#zoomViewport > #zoomScrollSpace > #zoomFrame` DOM hierarchy.
- Produces: `#zoomViewport` as the only element with vertical scrolling.
- Consumes: the existing `#zoomFrame` content without layout changes.

- [ ] **Step 1: Add failing DOM/CSS contract assertions**

```js
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const baseCss = fs.readFileSync(path.join(__dirname, "..", "header_only", "css", "style.css"), "utf8");
const adsCss = fs.readFileSync(path.join(__dirname, "..", "header_only", "css", "compiled-ads.css"), "utf8");

test("zoom frame is wrapped by a dedicated scroll extent", () => {
  assert.match(html, /id="zoomViewport"[\s\S]*id="zoomScrollSpace"[\s\S]*id="zoomFrame"/);
});

test("document is fixed and zoom viewport owns vertical scrolling", () => {
  assert.match(baseCss, /#zoomViewport\s*\{[\s\S]*position:\s*fixed;[\s\S]*overflow-y:\s*scroll;/);
  assert.match(adsCss, /html:has\(\.ads-page\)[\s\S]*overflow-y:\s*hidden\s*!important;/);
  assert.doesNotMatch(adsCss, /html:has\(\.ads-page\)[\s\S]{0,180}overflow-y:\s*scroll\s*!important;/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Expected: FAIL because `#zoomScrollSpace` is missing and document scrolling is still enabled.

- [ ] **Step 3: Wrap the frame in `#zoomScrollSpace`**

```html
<div id="zoomViewport">
  <div id="zoomScrollSpace">
    <div id="zoomFrame">
```

Keep every current child of `#zoomFrame` in place, then add one extra closing
`</div>` between the current `#zoomFrame` and `#zoomViewport` closing tags.

- [ ] **Step 4: Make the internal viewport the only scrollbar**

```css
html,
body {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

#zoomViewport {
  position: fixed;
  inset: 0;
  width: auto;
  height: auto;
  overflow-x: hidden;
  overflow-y: scroll;
  scrollbar-gutter: stable;
}

#zoomScrollSpace {
  position: relative;
  width: 100%;
  min-height: 100%;
  overflow: visible;
}

body #zoomViewport #zoomScrollSpace > #zoomFrame {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}
```

Move the compiled scrollbar selectors from `html:has(.ads-page)` to
`#zoomViewport`, set `html:has(.ads-page)` and `body:has(.ads-page)` to
`overflow: hidden !important`, and keep `#zoomFrame` absolutely positioned.

- [ ] **Step 5: Run the tests and verify GREEN**

Expected: DOM/CSS contract tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add index.html header_only/css/style.css header_only/css/compiled-ads.css tests/zoom-scroll-anchor.test.js
git commit -m "fix: перенести прокрутку во внутренний viewport"
```

---

### Task 3: One-shot zoom controller

**Files:**
- Modify: `header_only/js/script.js:228-790`
- Modify: `header_only/js/script.js:2430-2480`
- Modify: `header_only/js/script.js:7500-7540`
- Modify: `tests/zoom-scroll-anchor.test.js`

**Interfaces:**
- Consumes: `getZoomScrollTopForScale`, `getZoomScrollContainer`, `#zoomScrollSpace`, `#zoomFrame`.
- Produces: `syncZoomScrollExtent(): void`.
- Produces: `applyBrowserZoomNeutralizer(): void` that transforms the frame and rescales internal scroll exactly once per zoom value.

- [ ] **Step 1: Add failing source-contract tests for the controller**

```js
test("zoom controller sizes the extent and never restores a document anchor", () => {
  assert.match(source, /function syncZoomScrollExtent\(\)/);
  assert.match(source, /viewport\.scrollTop = getZoomScrollTopForScale\(/);
  assert.doesNotMatch(source, /restoreZoomScrollAnchor\(/);
  assert.doesNotMatch(source, /scrollingElement\.scrollTop\s*=/);
  assert.doesNotMatch(source, /--zoom-scroll-fine-y/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Expected: FAIL because the old DOM-anchor correction is still present.

- [ ] **Step 3: Replace viewport-height synchronization with extent synchronization**

```js
function syncZoomScrollExtent() {
  const frame = document.getElementById("zoomFrame");
  const extent = document.getElementById("zoomScrollSpace");
  const inverseZoom = parseFloat(appliedBrowserZoomInverse);
  if (!frame || !extent || !(inverseZoom > 0)) return;

  extent.style.height = Math.max(
    document.documentElement.clientHeight,
    frame.offsetHeight * inverseZoom,
  ).toFixed(4) + "px";
  extent.style.width = (frame.offsetWidth * inverseZoom).toFixed(4) + "px";
}
```

- [ ] **Step 4: Apply scroll conversion once when zoom changes**

```js
const currentBrowserZoom = effectiveDpr / baselineDpr;
const previousBrowserZoom = lastAppliedBrowserZoom || currentBrowserZoom;
const scrollTopBeforeZoom = viewport.scrollTop;

frame.style.transform = `translateZ(0) scale(${inverse.toFixed(6)})`;
appliedBrowserZoomInverse = inverseValue;
syncZoomScrollExtent();

if (Math.abs(currentBrowserZoom / previousBrowserZoom - 1) > 0.0005) {
  viewport.scrollTop = getZoomScrollTopForScale(
    scrollTopBeforeZoom,
    previousBrowserZoom,
    currentBrowserZoom,
  );
}
lastAppliedBrowserZoom = currentBrowserZoom;
```

Remove `pendingZoomScrollAnchor`, `stableZoomScrollAnchor`, their creation and
restore functions, key/wheel anchor capture, and the CSS fine-translation
variable. `markViewportChanging()` must only call the neutralizer once and
schedule the existing non-scroll visual refresh.

- [ ] **Step 5: Run syntax and regression tests**

```powershell
$node='C:\Users\Stas2\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node --check header_only/js/script.js
& $node --test --test-isolation=none tests/zoom-scroll-anchor.test.js
```

Expected: syntax check exits 0 and all tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add header_only/js/script.js header_only/css/style.css tests/zoom-scroll-anchor.test.js
git commit -m "fix: стабилизировать позицию внутреннего скролла при зуме"
```

---

### Task 4: Browser verification and publication

**Files:**
- Modify: `index.html:49-50,301`
- Test: `tests/zoom-scroll-anchor.test.js`

**Interfaces:**
- Consumes: completed internal scroll shell and controller.
- Produces: cache-busted GitHub Pages build.

- [ ] **Step 1: Increase CSS and JavaScript cache-bust versions**

Set `css/style.css?v=436`, `css/compiled-ads.css?v=229`, and
`js/script.js?v=369` in `index.html`.

- [ ] **Step 2: Run the full local verification command**

```powershell
$node='C:\Users\Stas2\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node --check header_only/js/script.js
& $node --test --test-isolation=none tests/zoom-scroll-anchor.test.js
git diff --check
```

Expected: all tests PASS, syntax exits 0, and `git diff --check` exits 0.

- [ ] **Step 3: Verify the live behavior locally**

At a fixed physical viewport, test `100% → 125% → 100% → 80% → 100%` at
the top, around `scrollTop = 2000`, and near the bottom. For every step assert:

```js
Math.abs(afterPhysicalPoint - beforePhysicalPoint) <= 0.5
```

Also assert `window.scrollY === 0`, `document.documentElement.scrollHeight ===
window.innerHeight`, and `#zoomViewport.scrollTop > 0` after scrolling.

- [ ] **Step 4: Check console output**

Expected: zero errors and zero warnings caused by the application.

- [ ] **Step 5: Commit and push**

```powershell
git add index.html tests/zoom-scroll-anchor.test.js
git commit -m "chore: обновить стабильную zoom-сборку"
git push origin main
```

- [ ] **Step 6: Verify GitHub Pages**

Confirm the published HTML references versions `436`, `229`, and `369`, then
repeat the middle-page `100% → 125% → 100%` check against the Pages URL.

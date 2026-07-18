# Stable Native Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove vertical layout jumps during browser `Ctrl +/-` zoom while preserving the existing 1920 design-pixel layout and table behavior.

**Architecture:** Keep `#frame` as the only transformed element. Calculate a fit scale for the real window size, ignore DPR-only resize events, and let the browser own scroll anchoring during native zoom. Use a guarded initial boot and a height observer that writes only real height changes.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, Node syntax/static tests, Chromium browser smoke test.

## Global Constraints

- Preserve the Figma-derived 1920 design-pixel coordinate system and existing interactions.
- Use one `transform: scale(...)` on `#frame`; no nested vertical scroll containers.
- Browser zoom must not trigger `window.scrollTo`, `scrollTop` writes, or DPR compensation.
- Keep local Roboto and `vsevn-tabs` fonts and wait for `document.fonts.ready` before first reveal.
- No frameworks, build step, external requests, or destructive repository operations.

---

### Task 1: Add a failing zoom contract test

**Files:**
- Create: `_deploy/tests/zoom-behavior.test.js`

**Interfaces:**
- Consumes: `_deploy/js/app.js`, `_deploy/css/style.css`.
- Produces: a Node-executable regression contract for native zoom behavior.

- [x] **Step 1: Write the failing test**

Create a test that reads the deployed source and asserts that the old compensation flag and `scrollTo` call are absent, the resize handler tracks external window dimensions, and CSS restores scroll anchoring.

```js
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
```

- [x] **Step 2: Run the test to verify it fails**

Run `node _deploy/tests/zoom-behavior.test.js`.
Expected: FAIL because the current app still contains `ZOOM_COMPENSATION`, `window.scrollTo`, and `overflow-anchor: none`.

### Task 2: Replace DPR compensation with stable native zoom

**Files:**
- Modify: `_deploy/js/app.js:15-65` and the startup block near the end of the file.
- Modify: `_deploy/css/style.css:76-111`.

**Interfaces:**
- Consumes: the existing `frame`, `viewport`, tooltip invalidation, `render`, and `positionUnderline` functions.
- Produces: `applyScale(nextScale)`, `syncHeight()`, and a guarded `boot()` used only during initial page setup and true window resize.

- [x] **Step 1: Implement the minimal scale controller**

Replace the compensation block with:

```js
  var DESIGN_W = 1920;
  var frame = document.getElementById('frame');
  var viewport = document.getElementById('viewport');
  var fitScale = 1;
  var lastOuterWidth = window.outerWidth;
  var lastOuterHeight = window.outerHeight;
  var resizeFrame = 0;
  var heightPx = '';

  function calculateFitScale() {
    return Math.min(1, document.documentElement.clientWidth / DESIGN_W);
  }
  function applyScale(nextScale) {
    fitScale = nextScale;
    frame.style.transform = 'scale(' + fitScale + ')';
    syncHeight();
  }
  function syncHeight() {
    var nextHeight = (frame.offsetHeight * fitScale) + 'px';
    if (nextHeight !== heightPx) {
      heightPx = nextHeight;
      viewport.style.height = nextHeight;
    }
  }
  function scheduleTrueResize() {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(function () {
      resizeFrame = 0;
      applyScale(calculateFitScale());
      positionUnderline();
    });
  }
  window.addEventListener('resize', function () {
    tipInvalidate();
    var outerChanged = window.outerWidth !== lastOuterWidth || window.outerHeight !== lastOuterHeight;
    lastOuterWidth = window.outerWidth;
    lastOuterHeight = window.outerHeight;
    if (outerChanged) scheduleTrueResize();
  });
```

Keep the existing `ResizeObserver`, but call `syncHeight` from it; do not call `applyScale` or touch scroll position there.

- [x] **Step 2: Add font-gated boot with bounded fallback**

Move the final `syncRadios(); render(); applyScale(); positionUnderline();` calls into:

```js
  var booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    syncRadios();
    render();
    applyScale(calculateFitScale());
    positionUnderline();
    frame.classList.remove('is-booting');
  }
  var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([fontsReady, new Promise(function (resolve) { setTimeout(resolve, 1500); })]).then(boot, boot);
```

Add `class="is-booting"` to `#frame` in `_deploy/index.html` and CSS:

```css
#frame.is-booting { visibility: hidden; }
```

The hidden state must not change dimensions or create an additional scroll container.

- [x] **Step 3: Restore native scroll anchoring**

Change the `html` rule from `overflow-anchor: none` to `overflow-anchor: auto`. Keep `body` and `#viewport` non-scrolling; horizontal overflow remains clipped at the viewport until true window resize logic is validated.

- [x] **Step 4: Run the contract and syntax tests**

Run:

```text
node _deploy/tests/zoom-behavior.test.js
node --check _deploy/js/app.js
node --check _deploy/js/data.js
```

Expected: all commands exit 0 and the contract prints `zoom behavior contract: PASS`.

### Task 3: Browser smoke and zoom regression verification

**Files:**
- Modify: `_deploy/tests/zoom-behavior.test.js` only if a discovered invariant needs to be encoded.

**Interfaces:**
- Consumes: the stable zoom controller and existing page interactions.
- Produces: evidence that zoom does not rewrite transform/scroll and that the page still renders and filters correctly.

- [x] **Step 1: Start a local static server**

Run `python -m http.server 8765 --directory _deploy` from the workspace and open `http://127.0.0.1:8765/` in the in-app browser.

- [x] **Step 2: Capture baseline geometry and console state**

Check the title, toolbar, first table row, `document.scrollingElement`, and console errors. Confirm there is one vertical scrolling element and the frame has exactly one transform.

- [x] **Step 3: Exercise native zoom**

At a scrolled table position, run the browser's zoom sequence `80% → 100% → 125% → 150% → 100%`. Between steps record `frame.style.transform`, `viewport.style.height`, and `scrollY`; verify the app does not issue `scrollTo` and does not add nested scrolling.

- [x] **Step 4: Smoke existing interactions**

Switch a social tab and verify the second select appears with its network label; switch back to HH, type a search query, change rows-per-page, sort a column, and verify no console errors.

- [x] **Step 5: Stop the local server and review the diff**

Run `git -C _deploy diff --check` and inspect the final diff. Record Firefox as an environment limitation if it cannot be launched here.

# Fixed Shell Cross-Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the root-scroll/transform layout with a fixed application shell whose single internal scroll position never changes during browser zoom.

**Architecture:** `#appHost` is fixed to the browser viewport, `#appShell` is the only scaled 1920px surface, and `#appScroll` is the only vertical scroller. A dedicated `viewport.js` owns DPR compensation without reading or writing scroll state; the existing business logic stays in `app.js`.

**Tech Stack:** Static HTML, CSS Grid/Flex, semantic HTML table, vanilla JavaScript, Node contract tests, Chromium browser smoke tests.

## Global Constraints

- Keep real selectable HTML text and all existing interactions.
- Use no framework, bundler, external request, root scrolling, `window.scrollTo`, or `scrollTop` write.
- Preserve one vertical scrollbar in `#appScroll` and 1920px baseline geometry.
- Use 1px translucent borders so grid lines remain visible at zoom-out.
- Firefox text-only may enlarge fonts; layout must expand without overlap or scroll reset.

---

### Task 1: Fixed-shell regression contract

**Files:**
- Create: `_deploy/tests/fixed-shell.test.js`
- Modify: `_deploy/tests/zoom-behavior.test.js`

**Interfaces:**
- Consumes: `index.html`, `css/base.css`, `css/components.css`, `css/table.css`, `js/viewport.js`, `js/app.js`.
- Produces: a Node test proving the old root-scroll architecture cannot return.

- [ ] **Step 1: Write the failing contract**

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
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
```

- [ ] **Step 2: Run the test and confirm RED**

Run `node _deploy/tests/fixed-shell.test.js`.
Expected: FAIL because the shell files and elements do not exist.

### Task 2: Viewport shell and DOM migration

**Files:**
- Create: `_deploy/js/viewport.js`
- Modify: `_deploy/index.html`
- Modify: `_deploy/js/app.js:15-105` and startup block.

**Interfaces:**
- Produces: `window.AppViewport.init()`, `refresh()`, and `getScale()`.
- Consumes: `#appHost`, `#appShell`, `#appScroll`.

- [ ] **Step 1: Replace wrappers and script order**

Use this hierarchy:

```html
<div id="appHost">
  <div id="appShell" class="is-booting">
    <div id="appScroll">
      <!-- existing headers, page and table -->
    </div>
  </div>
</div>
<script src="js/data.js"></script>
<script src="js/viewport.js"></script>
<script src="js/app.js"></script>
```

- [ ] **Step 2: Implement viewport.js**

Create a controller that records the initial viewport width and DPR, computes
`fitScale = Math.min(1, baseWidth / 1920)`, applies
`fitScale * baseDPR / currentDPR`, and schedules one refresh through
`requestAnimationFrame`. It must never read or write `scrollTop` and must expose
the three methods from the approved spec.

- [ ] **Step 3: Remove viewport ownership from app.js**

Delete frame/viewport height syncing, DPR listeners, `ResizeObserver`, zoom
anchors and font boot code. Keep the `scale` value only through
`window.AppViewport.getScale()` when converting tooltip pointer coordinates.
Startup becomes `syncRadios(); render(); positionUnderline(); AppViewport.init();`.

- [ ] **Step 4: Run syntax and contract tests**

Run `node --check` for all three JS files and the fixed-shell test.
Expected: syntax passes; the contract advances to CSS-file failures.

### Task 3: Flow-based CSS rewrite

**Files:**
- Create: `_deploy/css/base.css`
- Create: `_deploy/css/components.css`
- Create: `_deploy/css/table.css`
- Modify: `_deploy/index.html`

**Interfaces:**
- Consumes: existing class names so business logic remains unchanged.
- Produces: fixed host, one scroller, normal-flow toolbar and semantic table.

- [ ] **Step 1: Build base.css**

Define local fonts, reset, palette, `html/body { overflow:hidden }`, fixed
`#appHost`, transformed `#appShell`, and `#appScroll { overflow-y:auto;
overflow-x:hidden; scrollbar-gutter:stable; overflow-anchor:auto; }`.

- [ ] **Step 2: Build components.css**

Recreate two header rows with Grid/Flex. Convert `.card` to a normal-flow
layout containing `.toolbar`, `.radio-row`, `.check-row`, `.select-row` and
`.table-wrap`; preserve existing ids/classes used by JavaScript.

- [ ] **Step 3: Build table.css**

Keep the current colgroup widths, replace subpixel shadows with a 1px
translucent grid, allow automatic row height, preserve search/status/link styles,
and add `.qa-text-zoom-125/150/200` font-only test classes.

- [ ] **Step 4: Update index groups and CSS links**

Wrap existing toolbar fields, checkboxes and selects in their flow containers.
Load `base.css`, `components.css`, and `table.css`; do not load legacy
`style.css`.

- [ ] **Step 5: Run the fixed-shell contract**

Run `node _deploy/tests/fixed-shell.test.js`.
Expected: `fixed shell contract: PASS`.

### Task 4: Browser verification and publication

**Files:**
- Modify: tests only if a discovered invariant needs a permanent assertion.

**Interfaces:**
- Consumes: completed fixed-shell build.
- Produces: verified and published GitHub Pages commit.

- [ ] **Step 1: Run full static verification**

Run fixed-shell contract, existing zoom contract adjusted for the new shell,
all Node syntax checks, `git diff --check`, and verify source/deploy hashes.

- [ ] **Step 2: Run browser smoke**

Verify 150 rows, one scroll container, clean console, website/social tab modes,
search, sort and pagination.

- [ ] **Step 3: Run zoom and text-only simulations**

Set an internal scroll position, exercise DPR `0.8 → 1 → 1.25 → 1.5 → 1`,
and assert `appScroll.scrollTop` is identical after every transition. Apply each
font-only QA class and verify rows expand without overlap.

- [ ] **Step 4: Commit, push and verify Pages**

Commit the rewritten files, push `main`, wait for Pages to serve the new
cache-bust versions, and repeat the shell/scroll/console checks on the live URL.

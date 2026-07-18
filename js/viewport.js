(function () {
  "use strict";

  var DESIGN_WIDTH = 1920;
  var host = document.getElementById("appHost");
  var shell = document.getElementById("appShell");
  var scroller = document.getElementById("appScroll");
  var baseDpr = window.devicePixelRatio || 1;
  var baseWidth = document.documentElement.clientWidth || window.innerWidth;
  var fitScale = Math.min(1, baseWidth / DESIGN_WIDTH);
  var lastOuterWidth = window.outerWidth;
  var lastOuterHeight = window.outerHeight;
  var frameRequest = 0;
  var currentScale = fitScale;

  function isRealWindowResize() {
    var changed = window.outerWidth !== lastOuterWidth || window.outerHeight !== lastOuterHeight;
    lastOuterWidth = window.outerWidth;
    lastOuterHeight = window.outerHeight;
    return changed;
  }

  function apply() {
    frameRequest = 0;
    var dpr = window.devicePixelRatio || 1;
    currentScale = fitScale * (baseDpr / dpr);
    if (!Number.isFinite(currentScale) || currentScale <= 0) currentScale = fitScale;

    shell.style.transform = "scale(" + currentScale + ")";
    scroller.style.height = Math.ceil(window.innerHeight / currentScale) + "px";
    host.style.setProperty("--shell-scale", String(currentScale));
  }

  function schedule(realResize) {
    if (realResize) {
      baseWidth = document.documentElement.clientWidth || window.innerWidth;
      baseDpr = window.devicePixelRatio || 1;
      fitScale = Math.min(1, baseWidth / DESIGN_WIDTH);
    }
    if (!frameRequest) frameRequest = requestAnimationFrame(apply);
  }

  function handleResize() {
    schedule(isRealWindowResize());
  }

  function init() {
    apply();
    shell.classList.remove("is-booting");
    window.addEventListener("resize", handleResize, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", function () { schedule(false); }, { passive: true });
    }
  }

  window.AppViewport = {
    init: init,
    refresh: function () { schedule(true); },
    getScale: function () { return currentScale; }
  };
})();

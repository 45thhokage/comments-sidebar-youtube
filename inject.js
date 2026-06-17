/**
 * inject.js — Runs in YouTube's MAIN world (page context)
 *
 * Patches YouTube's internal layout logic to prevent conflicts with
 * the extension's CSS-based sidebar layout.  Without these patches
 * YouTube's Polymer elements recalculate their own layout on every
 * state change, overriding our fixed positioning.
 *
 * Key patches:
 *   1. Override ytd-watch-flexy's computeLayout_ and isTwoColumns_
 *      to be no-ops / force-true when our layout is active.
 *   2. Strip conflicting attributes (flex, width-changed, css-flex-attr,
 *      hidden) and inline style properties from layout-critical elements.
 *   3. Re-patch on SPA navigation when YouTube replaces elements.
 */
(function () {
  "use strict";

  var TAG = "[YTSP-inject]";

  function isYTSPActive() {
    return document.body && document.body.hasAttribute("ytsp-active");
  }

  // ── Elements that YouTube must never inline-style over ────────
  var LAYOUT_IDS = [
    "primary", "secondary", "primary-inner", "secondary-inner",
    "columns", "player", "player-container-outer",
    "player-container-inner", "player-container", "below",
  ];

  function isLayoutElement(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (LAYOUT_IDS.indexOf(el.id) !== -1) return true;
    var tag = (el.tagName || "").toUpperCase();
    return tag === "YTD-WATCH-FLEXY" || el.classList.contains("html5-video-container");
  }

  // ── Combined attribute observer ──────────────────────────────
  // Watches for conflicting attributes set by YouTube's layout
  // engine and strips them when our layout is active.
  function setupAttributeObserver() {
    var observer = new MutationObserver(function (mutations) {
      if (!isYTSPActive()) return;

      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type !== "attributes") continue;
        var target = m.target;
        var attr = m.attributeName;

        // Strip flex-like attributes on layout-critical elements
        if ((attr === "flex" || attr === "width-changed" || attr === "css-flex-attr") &&
            (target.id === "primary" || target.id === "secondary" ||
             target.id === "primary-inner" || target.id === "secondary-inner")) {
          target.removeAttribute(attr);
        }

        // Ensure #secondary is never hidden
        if (attr === "hidden" && target.id === "secondary") {
          target.removeAttribute("hidden");
        }

        // Strip conflicting inline style properties on layout elements
        if (attr === "style" && isLayoutElement(target)) {
          var CONFLICTING = ["width", "max-width", "min-width", "flex", "flex-basis"];
          var modified = false;
          for (var p = 0; p < CONFLICTING.length; p++) {
            if (target.style[CONFLICTING[p]]) {
              target.style.removeProperty(CONFLICTING[p]);
              modified = true;
            }
          }
          if (target.id === "player-container-inner" && target.style.paddingBottom) {
            target.style.removeProperty("padding-bottom");
            modified = true;
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      subtree: true,
      attributeFilter: ["flex", "width-changed", "css-flex-attr", "hidden", "style", "theater"],
    });
  }

  // ── Polling helper: wait for ytd-watch-flexy, then call fn ────
  function onFlexyReady(fn) {
    var interval = setInterval(function () {
      var flexy = document.querySelector("ytd-watch-flexy");
      if (!flexy) return;
      if (typeof fn === "function") fn(flexy);
      clearInterval(interval);
    }, 500);
    setTimeout(function () { clearInterval(interval); }, 30000);
  }

  // ── Patch computeLayout_ on ytd-watch-flexy ───────────────────
  function patchComputeLayout(flexy) {
    if (typeof flexy.computeLayout_ !== "function") return;
    var orig = flexy.computeLayout_.bind(flexy);
    flexy.computeLayout_ = function () {
      if (isYTSPActive()) return;
      return orig();
    };
  }

  // ── Patch isTwoColumns_ to always return true ─────────────────
  function patchIsTwoColumns(flexy) {
    if (typeof flexy.isTwoColumns_ !== "function") return;
    var orig = flexy.isTwoColumns_.bind(flexy);
    flexy.isTwoColumns_ = function () {
      if (isYTSPActive()) return true;
      return orig();
    };
  }

  // ── Apply all element-level patches ───────────────────────────
  function patchElementMethods(flexy) {
    patchComputeLayout(flexy);
    patchIsTwoColumns(flexy);
  }

  // ── Re-patch on SPA navigation ────────────────────────────────
  function setupNavigationRepatch() {
    function rePatch() {
      setTimeout(function () {
        onFlexyReady(patchElementMethods);
      }, 1000);
    }
    document.addEventListener("yt-navigate-finish", rePatch);
    document.addEventListener("yt-page-data-updated", rePatch);
  }

  // ── Init ──────────────────────────────────────────────────────
  function init() {
    // Attribute observer: works on any page, cheap
    setupAttributeObserver();

    // Element method patches: wait for ytd-watch-flexy to exist
    onFlexyReady(patchElementMethods);

    // Re-patch on SPA navigation
    setupNavigationRepatch();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

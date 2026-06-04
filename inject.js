/**
 * inject.js — Runs in YouTube's MAIN world (page context)
 *
 * This script patches YouTube's internal layout logic to prevent conflicts
 * with the extension's CSS-based sidebar layout. Without these patches,
 * YouTube's Polymer elements recalculate their own layout on every state
 * change, overriding our fixed positioning and causing visual glitches.
 *
 * Key patches:
 *   1. Override ytd-watch-flexy's computeLayout_ to be a no-op when our
 *      layout is active (body has ytsp-active attribute).
 *   2. Patch the theater-mode attribute setter so YouTube doesn't reset
 *      our column widths.
 *   3. Intercept style recalculation on ytd-watch-flexy to prevent
 *      inline style overrides.
 *   4. Suppress YouTube's own flex attribute updates that conflict with
 *      our CSS.
 */

(function () {
  "use strict";

  const TAG = "[YTSP-inject]";

  // ── Utility: check if our extension layout is currently active ──
  function isYTSPActive() {
    return document.body && document.body.hasAttribute("ytsp-active");
  }

  // ── Patch 1: Override computeLayout_ on ytd-watch-flexy ────────
  // YouTube's ytd-watch-flexy element has a computeLayout_ method that
  // recalculates column widths, flex attributes, and inline styles. We
  // replace it with a no-op when our layout is active so it doesn't
  // fight our CSS overrides.
  function patchComputeLayout() {
    const waitForFlexy = setInterval(() => {
      const flexy = document.querySelector("ytd-watch-flexy");
      if (!flexy) return;

      // Check if it has the method we want to patch
      if (typeof flexy.computeLayout_ === "function") {
        const originalComputeLayout = flexy.computeLayout_.bind(flexy);

        flexy.computeLayout_ = function () {
          if (isYTSPActive()) {
            // Our layout is active — skip YouTube's layout computation
            // to prevent it from overriding our CSS
            return;
          }
          // Not our page — let YouTube handle layout normally
          return originalComputeLayout();
        };

        console.log(TAG, "Patched computeLayout_ on ytd-watch-flexy");
        clearInterval(waitForFlexy);
      }
    }, 500);

    // Give up after 30 seconds if the element never appears
    setTimeout(() => clearInterval(waitForFlexy), 30000);
  }

  // ── Patch 2: Prevent flex attribute overrides on #columns ──────
  // YouTube sets flex attributes like flex="1 1 1e9px" on #primary and
  // #secondary elements. When our layout is active, we need these to
  // not override our CSS. We intercept setAttribute on these elements.
  function patchFlexAttributes() {
    const observer = new MutationObserver((mutations) => {
      if (!isYTSPActive()) return;

      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.attributeName === "flex") {
          const target = mutation.target;
          // Remove the flex attribute that YouTube just set — our CSS
          // handles all layout via fixed positioning
          if (target.id === "primary" || target.id === "secondary" ||
              target.id === "primary-inner" || target.id === "secondary-inner") {
            target.removeAttribute("flex");
          }
        }
        // Also handle "width-changed" and "css-flex-attr" attributes
        if (mutation.type === "attributes" &&
            (mutation.attributeName === "width-changed" ||
             mutation.attributeName === "css-flex-attr")) {
          const target = mutation.target;
          if (target.id === "primary" || target.id === "secondary") {
            target.removeAttribute(mutation.attributeName);
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      subtree: true,
      attributeFilter: ["flex", "width-changed", "css-flex-attr"],
    });
  }

  // ── Patch 3: Prevent inline style overrides on key elements ────
  // YouTube sometimes sets inline styles (width, max-width, etc.) on
  // #primary, #secondary, #columns. When our layout is active, these
  // inline styles can override our CSS rules. We use a MutationObserver
  // to strip conflicting inline styles.
  function patchInlineStyles() {
    const CONFLICTING_PROPS = ["width", "max-width", "min-width", "flex", "flex-basis"];

    const observer = new MutationObserver((mutations) => {
      if (!isYTSPActive()) return;

      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.attributeName === "style") {
          const target = mutation.target;
          if (!(target instanceof HTMLElement)) continue;

          // Only strip inline styles from layout-critical elements
          const isLayoutElement =
            target.id === "primary" || target.id === "secondary" ||
            target.id === "primary-inner" || target.id === "secondary-inner" ||
            target.id === "columns" || target.id === "player" ||
            target.id === "player-container-outer" || target.id === "player-container-inner" ||
            target.id === "player-container" || target.id === "below" ||
            target.tagName === "YTD-WATCH-FLexy".toUpperCase() ||
            target.classList?.contains("html5-video-container");

          // Normalize tag name comparison
          const tagUpper = target.tagName?.toUpperCase?.() || "";
          const isLayoutElementFinal = isLayoutElement ||
            tagUpper === "YTD-WATCH-FLexy".toUpperCase() ||
            tagUpper === "YTD-WATCH-FLEXY";

          if (isLayoutElementFinal) {
            // Remove conflicting inline style properties
            let modified = false;
            for (const prop of CONFLICTING_PROPS) {
              if (target.style[prop]) {
                target.style.removeProperty(prop);
                modified = true;
              }
            }
            // Also remove padding-bottom on player-container-inner
            if (target.id === "player-container-inner" && target.style.paddingBottom) {
              target.style.removeProperty("padding-bottom");
              modified = true;
            }
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      subtree: true,
      attributeFilter: ["style"],
    });
  }

  // ── Patch 4: Prevent theater mode from breaking our layout ─────
  // When YouTube enters theater mode, it restructures the DOM and
  // applies its own full-width layout. We need to detect this and
  // ensure our layout still works.
  function patchTheaterMode() {
    const observer = new MutationObserver((mutations) => {
      if (!isYTSPActive()) return;

      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.attributeName === "theater") {
          const flexy = mutation.target;
          if (flexy.tagName?.toUpperCase() === "YTD-WATCH-FLEXY") {
            // Re-trigger layout recalculation after theater mode change
            // The content script's MutationObserver will pick this up
            // and re-apply our layout CSS
            console.log(TAG, "Theater mode changed, layout will be re-applied by content script");
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      subtree: true,
      attributeFilter: ["theater"],
    });
  }

  // ── Patch 5: Override isTwoColumns_ to always return true ──────
  // YouTube uses isTwoColumns_() to decide whether to show the side-
  // by-side layout. If it returns false, YouTube collapses into a
  // single-column layout, hiding #secondary. We force it to return
  // true so our sidebar always has content.
  function patchIsTwoColumns() {
    const waitForFlexy = setInterval(() => {
      const flexy = document.querySelector("ytd-watch-flexy");
      if (!flexy) return;

      if (typeof flexy.isTwoColumns_ === "function") {
        const originalIsTwoColumns = flexy.isTwoColumns_.bind(flexy);

        flexy.isTwoColumns_ = function () {
          if (isYTSPActive()) {
            return true;
          }
          return originalIsTwoColumns();
        };

        console.log(TAG, "Patched isTwoColumns_ on ytd-watch-flexy");
        clearInterval(waitForFlexy);
      }
    }, 500);

    setTimeout(() => clearInterval(waitForFlexy), 30000);
  }

  // ── Patch 6: Force #secondary to be visible ───────────────────
  // YouTube sometimes hides #secondary with attribute hidden or
  // display:none. When our layout is active, we need #secondary to
  // remain in the DOM so we can show its contents in our sidebar.
  function patchSecondaryVisibility() {
    const observer = new MutationObserver((mutations) => {
      if (!isYTSPActive()) return;

      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          const target = mutation.target;
          if (target.id === "secondary" && target.tagName?.toUpperCase() === "DIV") {
            // Remove the "hidden" attribute that YouTube may add
            if (target.hasAttribute("hidden")) {
              target.removeAttribute("hidden");
            }
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      subtree: true,
      attributeFilter: ["hidden"],
    });
  }

  // ── Re-patch after SPA navigation ─────────────────────────────
  // YouTube's SPA navigation may replace the ytd-watch-flexy element
  // entirely, which means our patches on the old element are lost.
  // We listen for navigation events to re-apply patches.
  function setupNavigationRepatch() {
    document.addEventListener("yt-navigate-finish", () => {
      // YouTube may create a new ytd-watch-flexy element after navigation,
      // so we need to re-patch it. Use a small delay to let the DOM settle.
      setTimeout(() => {
        patchComputeLayout();
        patchIsTwoColumns();
      }, 1000);
    });

    document.addEventListener("yt-page-data-updated", () => {
      setTimeout(() => {
        patchComputeLayout();
        patchIsTwoColumns();
      }, 1000);
    });
  }

  // ── Initialize all patches ────────────────────────────────────
  function init() {
    console.log(TAG, "Initializing page-context patches");

    // Attribute-level patches (work on any page, cheap to run)
    patchFlexAttributes();
    patchInlineStyles();
    patchTheaterMode();
    patchSecondaryVisibility();

    // Element-level patches (need ytd-watch-flexy to exist)
    patchComputeLayout();
    patchIsTwoColumns();

    // Re-patch on SPA navigation
    setupNavigationRepatch();
  }

  // Run immediately since we're injected at document_start
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

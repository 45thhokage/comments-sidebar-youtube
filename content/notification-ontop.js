/**
 * notification-ontop.js — keep YouTube's notification popout above this
 * extension's UI
 *
 * The bell dropdown (ytd-popup-container / ytd-notification-renderer) can
 * end up rendered underneath the side panel's tab bar once the panel
 * starts manipulating layout/z-index. This file forces the popout's
 * z-index to the maximum possible value, both up front via a stylesheet
 * and on an ongoing basis via MutationObserver, since YouTube tears the
 * dropdown down and rebuilds it every time the bell is clicked.
 *
 * Intentionally standalone: does not read or write YTSP state, so it
 * has no load-order dependency on core.js/panels.js/etc.
 */
(function () {
  "use strict";

  // Highest valid CSS z-index (32-bit signed int max)
  var MAX_Z = 2147483647;

  // Known selectors YouTube uses for the notification popout and its
  // wrapping containers. If YouTube changes its markup, add new selectors
  // here (devtools -> click the bell -> inspect the popped-up element).
  var TARGET_SELECTORS = [
    "ytd-popup-container",
    "tp-yt-iron-dropdown#notification-popup",
    "tp-yt-iron-dropdown.ytd-popup-container",
    "ytd-popup-container tp-yt-iron-dropdown",
    "ytd-notification-renderer",
    "ytd-multi-page-menu-renderer",
    "#notification-popup",
  ];

  function injectBaselineStyle() {
    var style = document.createElement("style");
    style.textContent = TARGET_SELECTORS
      .map(function (sel) { return sel + " { z-index: " + MAX_Z + " !important; }"; })
      .join("\n");
    document.documentElement.appendChild(style);
  }

  function forceTop(element) {
    if (!element || element.dataset.ytNotifTopFixed) return;
    element.style.setProperty("z-index", String(MAX_Z), "important");
    element.dataset.ytNotifTopFixed = "1";
  }

  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    TARGET_SELECTORS.forEach(function (sel) {
      root.querySelectorAll(sel).forEach(forceTop);
    });
  }

  function start() {
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          if (TARGET_SELECTORS.some(function (sel) { return node.matches && node.matches(sel); })) {
            forceTop(node);
          }
          scan(node);
        });
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scan(document);
  }

  injectBaselineStyle();

  if (document.body) {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start);
  }
})();

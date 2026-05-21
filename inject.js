/**
 * Comments Sidebar for YouTube - Injected Script
 * Runs in the page's context to patch ytd-watch-flexy layout calculations.
 */

(function () {
  "use strict";

  let watchFlexy = null;
  let playerEl = null;
  let originalIsTwoColumnsValue = false;
  let originalCalculatePlayerSize = null;
  let isPatched = false;

  if (document.readyState === "complete") {
    init();
  } else {
    document.onreadystatechange = function () {
      if (document.readyState === "complete") init();
    };
  }

  function init() {
    waitForKeyElement("ytd-watch-flexy", (el) => {
      watchFlexy = el;
      patchWatchFlexy();
    });
    waitForKeyElement("#player.ytd-watch-flexy", (el) => {
      playerEl = el;
    });
  }

  function patchWatchFlexy() {
    if (!watchFlexy || isPatched) return;

    try {
      originalIsTwoColumnsValue = watchFlexy.isTwoColumns_;
      Object.defineProperty(watchFlexy, "isTwoColumns_", {
        get: function () { return false; },
        set: function (val) { originalIsTwoColumnsValue = val; },
        configurable: true,
      });
    } catch (e) {
      console.warn("[WARC] Could not override isTwoColumns_:", e.message);
    }

    try {
      if (typeof watchFlexy.calculateCurrentPlayerSize_ === "function") {
        originalCalculatePlayerSize = watchFlexy.calculateCurrentPlayerSize_;
        watchFlexy.calculateCurrentPlayerSize_ = function () {
          if (playerEl) {
            const width = playerEl.clientWidth || 854;
            const height = (document.documentElement.clientHeight || 600) - 56;
            return { width: width, height: height };
          }
          return originalCalculatePlayerSize
            ? originalCalculatePlayerSize.call(this)
            : { width: 854, height: 480 };
        };
      }
    } catch (e) {
      console.warn("[WARC] Could not override calculateCurrentPlayerSize_:", e.message);
    }

    isPatched = true;
    schedulePlayerUpdate();
  }

  function unpatchWatchFlexy() {
    if (!watchFlexy || !isPatched) return;
    try {
      delete watchFlexy.isTwoColumns_;
      watchFlexy.isTwoColumns_ = originalIsTwoColumnsValue;
    } catch (e) {}
    try {
      if (originalCalculatePlayerSize) {
        watchFlexy.calculateCurrentPlayerSize_ = originalCalculatePlayerSize;
        originalCalculatePlayerSize = null;
      }
    } catch (e) {}
    isPatched = false;
    schedulePlayerUpdate();
  }

  function schedulePlayerUpdate() {
    if (!watchFlexy) return;
    if (typeof watchFlexy.schedulePlayerSizeUpdate_ === "function") {
      try { watchFlexy.schedulePlayerSizeUpdate_(); } catch (e) {}
    }
  }

  // Listen for custom events
  window.addEventListener("warc-player-size-update", schedulePlayerUpdate);
  window.addEventListener("schedule-player-size-update", schedulePlayerUpdate);

  window.addEventListener("extension-enabled", (e) => {
    if (e.detail) {
      if (!isPatched) patchWatchFlexy();
      schedulePlayerUpdate();
    } else {
      unpatchWatchFlexy();
    }
  });

  // Also dispatch the legacy inject-ready event
  window.dispatchEvent(new CustomEvent("inject-ready"));

  function waitForKeyElement(selector, callback) {
    const el = document.querySelector(selector);
    if (el) { callback(el); return; }
    const timer = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) { clearInterval(timer); callback(el); }
    }, 300);
    setTimeout(() => clearInterval(timer), 30000);
  }
})();

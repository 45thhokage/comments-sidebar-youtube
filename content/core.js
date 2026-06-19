/**
 * core.js — YTSP namespace, constants, state, persistence, utilities
 *
 * This file must be loaded first.  It creates the shared YTSP namespace
 * that every other content module reads from and writes to.
 */
(function () {
  "use strict";

  var YTSP = window.YTSP = window.YTSP || {};

  YTSP.constants = {
    HEADER_HEIGHT: 56,
    DIVIDER_WIDTH: 8,
    GRAB_BAR_WIDTH: 14,
    TAB_BAR_HEIGHT: 38,
    SIDEBAR_PADDING: 8,
    STORAGE_KEY: "ytSidePanelPlayerWidthPercent",
    TABS: ["description", "comments", "ycs", "chapters", "ask", "related", "playlist", "chat"],
    BELOW_TABS: new Set(["description", "comments"]),
    MIN_PLAYER_WIDTH: 320,
    MAX_PLAYER_WIDTH_FRAC: 0.85,
    DEFAULT_PLAYER_WIDTH_FRAC: 0.55,
    LAYOUT_DEBOUNCE_MS: 300,
    NAV_DEBOUNCE_MS: 300,
  };

  YTSP.state = {
    isOnWatchPage: false,
    activeTab: "description",
    playerWidth: 0,
    playerWidthPercent: YTSP.constants.DEFAULT_PLAYER_WIDTH_FRAC,
    isDragging: false,
    dragStartX: 0,
    dragStartWidth: 0,
    isFullscreen: false,
    isUIReady: false,
  };

  YTSP.dom = {
    app: null,
    tabBar: null,
    resizeBar: null,
    style: null,
    tabBtns: {},
  };

  YTSP.observers = {
    engagementPanel: null,
    dom: null,
  };

  YTSP.layoutBusy = false;

  YTSP.loadStoredWidth = function () {
    return new Promise(function (resolve) {
      try {
        var stored = sessionStorage.getItem(YTSP.constants.STORAGE_KEY);
        if (stored) YTSP.state.playerWidthPercent = parseFloat(stored);
      } catch (_) {}
      resolve();
    });
  };

  YTSP.saveWidth = function () {
    var viewportWidth = document.documentElement.clientWidth;
    if (viewportWidth > 0) {
      YTSP.state.playerWidthPercent = YTSP.state.playerWidth / viewportWidth;
      try { sessionStorage.setItem(YTSP.constants.STORAGE_KEY, String(YTSP.state.playerWidthPercent)); } catch (_) {}
    }
  };

  YTSP.initCSSProperties = function () {
    var root = document.documentElement;
    root.style.setProperty("--ytsp-header-height", YTSP.constants.HEADER_HEIGHT + "px");
    root.style.setProperty("--ytsp-tab-bar-height", YTSP.constants.TAB_BAR_HEIGHT + "px");
  };

  YTSP.waitForElement = function (selectorFn, timeout) {
    timeout = timeout || 5000;
    return new Promise(function (resolve) {
      var result = selectorFn();
      if (result) return resolve(result);
      var done = false;
      var observer = new MutationObserver(function () {
        var r = selectorFn();
        if (r && !done) { done = true; observer.disconnect(); resolve(r); }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(function () {
        if (!done) { done = true; observer.disconnect(); resolve(null); }
      }, timeout);
    });
  };

})();

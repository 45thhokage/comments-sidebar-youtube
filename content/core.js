/**
 * core.js — YTSP namespace, constants, state, utilities
 *
 * This file must be loaded first.  It creates the shared YTSP namespace
 * that every other content module reads from and writes to.
 * Preference persistence lives in prefs.js.
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
    /** Legacy sessionStorage key — migrated once by prefs.js */
    STORAGE_KEY: "ytSidePanelPlayerWidthPercent",
    TABS: ["description", "comments", "ycs", "chapters", "transcript", "ask", "related", "playlist", "chat"],
    BELOW_TABS: new Set(["description", "comments"]),
    MIN_PLAYER_WIDTH: 320,
    MAX_PLAYER_WIDTH_FRAC: 1,
    DEFAULT_PLAYER_WIDTH_FRAC: 0.55,
    DEFAULT_MIN_SIDEBAR_WIDTH: 280,
    /** Shift+drag snap points (player width as fraction of viewport) */
    SNAP_WIDTH_FRACS: [
      0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 1.00,
    ],
    LAYOUT_ANIM_MS: 220,
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
    enabled: true,
    lastVideoId: null,
  };

  YTSP.dom = {
    app: null,
    tabBar: null,
    tabScroll: null,
    tabNavLeft: null,
    tabNavRight: null,
    resizeBar: null,
    style: null,
    tabBtns: {},
  };

  YTSP.observers = {
    engagementPanel: null,
    dom: null,
  };

  YTSP.layoutBusy = false;

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

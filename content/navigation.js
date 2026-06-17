/**
 * navigation.js — SPA navigation detection, watch-page gate, observers
 *
 * Detects when the user navigates to/from /watch, gates layout
 * activation, and sets up DOM + fullscreen observers.
 */
(function () {
  "use strict";

  var YTSP = window.YTSP;
  var constants = YTSP.constants;
  var state = YTSP.state;

  function onNav() {
    setTimeout(checkWatchPage, constants.NAV_DEBOUNCE_MS);
  }

  function startDomObserver() {
    stopDomObserver();

    YTSP.observers.dom = new MutationObserver(function () {
      if (!state.isOnWatchPage || state.isFullscreen) return;
      clearTimeout(YTSP.observers.dom._timer);
      YTSP.observers.dom._timer = setTimeout(function () {
        if (state.isOnWatchPage && !state.isFullscreen) YTSP.applyLayout();
      }, constants.LAYOUT_DEBOUNCE_MS);
    });

    var watchFlexy = document.querySelector("ytd-watch-flexy");
    if (watchFlexy) {
      YTSP.observers.dom.observe(watchFlexy, { childList: true, subtree: true });
    }
  }

  function stopDomObserver() {
    if (YTSP.observers.dom) {
      YTSP.observers.dom.disconnect();
      YTSP.observers.dom = null;
    }
  }

  /**
   * Check whether we are on a watch page and apply or remove layout.
   *
   * On activate: sets state, then waits for the key DOM elements
   * (ytd-watch-flexy, then #below) to be ready before calling
   * applyLayout.  The waitForElement chain tolerates SPA transitions
   * where YouTube hasn't finished rendering the below section yet.
   * On deactivate: tears down layout and stops the DOM observer.
   */
  function checkWatchPage() {
    var onWatch = location.pathname === "/watch" || location.pathname.indexOf("/watch") === 0;

    if (onWatch && !state.isOnWatchPage) {
      state.isOnWatchPage = true;
      YTSP.waitForElement(function () { return document.querySelector("ytd-watch-flexy"); }, 10000)
        .then(function (watchFlexy) {
          if (!watchFlexy || !state.isOnWatchPage) return;
          return YTSP.waitForElement(function () {
            return document.querySelector("#below.ytd-watch-flexy, #below");
          }, 8000);
        })
        .then(function (belowElement) {
          if (!belowElement || !state.isOnWatchPage) return;
          YTSP.applyLayout();
          startDomObserver();
          if (state.activeTab === "description") setTimeout(YTSP.autoExpandDescription, 600);
        });
    } else if (!onWatch && state.isOnWatchPage) {
      state.isOnWatchPage = false;
      YTSP.removeLayout();
      stopDomObserver();
    }
  }
  YTSP.checkWatchPage = checkWatchPage;

  YTSP.setupNavigationListener = function () {
    document.addEventListener("yt-navigate-finish", onNav);
    document.addEventListener("yt-page-data-updated", onNav);

    // YouTube's SPA router may use pushState or replaceState depending
    // on the navigation type -- intercept both.
    var lastUrl = location.href;
    function checkUrlChanged() {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(checkWatchPage, constants.NAV_DEBOUNCE_MS);
      }
    }

    var originalPushState = history.pushState.bind(history);
    history.pushState = function () {
      originalPushState.apply(history, arguments);
      checkUrlChanged();
    };

    var originalReplaceState = history.replaceState.bind(history);
    history.replaceState = function () {
      originalReplaceState.apply(history, arguments);
      checkUrlChanged();
    };

    window.addEventListener("popstate", checkUrlChanged);
  };

  /**
   * Fallback observer on ytd-page-manager that catches SPA navigations
   * missed by YouTube's custom events and history API interceptors.
   *
   * When YouTube navigates between page types (watch → channel, search,
   * etc.) it swaps the active child of ytd-page-manager.  We detect that
   * swap and check the URL pathname to decide whether to apply or remove
   * the sidebar layout.
   */
  YTSP.setupPagePresenceObserver = function () {
    var timer = null;
    var observer = new MutationObserver(function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        var onWatch = location.pathname === "/watch" ||
                      location.pathname.indexOf("/watch") === 0;

        if (onWatch && !state.isOnWatchPage) {
          state.isOnWatchPage = true;
          YTSP.waitForElement(function () {
            return document.querySelector("#below.ytd-watch-flexy, #below");
          }, 8000).then(function (belowElement) {
            if (!belowElement || !state.isOnWatchPage) return;
            YTSP.applyLayout();
            startDomObserver();
            if (state.activeTab === "description") setTimeout(YTSP.autoExpandDescription, 600);
          });
        } else if (!onWatch && state.isOnWatchPage) {
          state.isOnWatchPage = false;
          YTSP.removeLayout();
          stopDomObserver();
        }
      }, 500);
    });

    // Observe both ytd-page-manager (for child swaps) and the hidden
    // attribute on ytd-watch-flexy, which YouTube toggles during some
    // SPA transitions without modifying the child list.
    var target = document.querySelector("ytd-page-manager") || document.documentElement;
    observer.observe(target, { childList: true, attributes: true, attributeFilter: ["hidden"], subtree: true });
  };

  YTSP.setupFullscreenListener = function () {
    document.addEventListener("fullscreenchange", function () {
      var wasFullscreen = state.isFullscreen;
      state.isFullscreen = !!document.fullscreenElement;
      if (wasFullscreen !== state.isFullscreen) {
        if (state.isFullscreen) {
          YTSP.removeLayout();
        } else if (state.isOnWatchPage) {
          setTimeout(function () { YTSP.applyLayout(); }, 300);
        }
      }
    });
  };

  YTSP.listenForWindowResize = function () {
    window.addEventListener("resize", function () {
      if (state.isOnWatchPage) YTSP.applyLayout();
    });
  };

})();

/**
 * layout.js — Dynamic CSS generation and layout engine
 *
 * Computes the sidebar and player positions, generates the dynamic
 * <style> block, and applies/reverts the split-panel layout.
 */
(function () {
  "use strict";

  var YTSP = window.YTSP;
  var constants = YTSP.constants;
  var state = YTSP.state;
  var dom = YTSP.dom;

  function minSidebarWidth() {
    var fromPrefs = YTSP.prefsState && YTSP.prefsState.minSidebarWidth;
    if (typeof fromPrefs === "number" && isFinite(fromPrefs)) {
      return Math.max(200, Math.min(480, fromPrefs));
    }
    return constants.DEFAULT_MIN_SIDEBAR_WIDTH || 280;
  }

  /** Max player width that still leaves the sidebar floor + chrome. */
  YTSP.maxPlayerWidthForViewport = function (viewportWidth) {
    var reserved = constants.DIVIDER_WIDTH + constants.GRAB_BAR_WIDTH +
      constants.SIDEBAR_PADDING + minSidebarWidth();
    var maxBySidebar = viewportWidth - reserved;
    var maxByFrac = Math.round(viewportWidth * constants.MAX_PLAYER_WIDTH_FRAC);
    return Math.max(constants.MIN_PLAYER_WIDTH, Math.min(maxByFrac, maxBySidebar));
  };

  function computeDimensions() {
    var viewportWidth = document.documentElement.clientWidth;
    var gap = constants.DIVIDER_WIDTH;
    var sidebarLeft = state.playerWidth + gap + constants.GRAB_BAR_WIDTH;
    var sidebarWidth = Math.max(
      minSidebarWidth(),
      viewportWidth - sidebarLeft - constants.SIDEBAR_PADDING
    );
    // If clamped sidebar would overflow, pull player width back
    var maxPlayer = YTSP.maxPlayerWidthForViewport(viewportWidth);
    if (state.playerWidth > maxPlayer) {
      state.playerWidth = maxPlayer;
      sidebarLeft = state.playerWidth + gap + constants.GRAB_BAR_WIDTH;
      sidebarWidth = Math.max(minSidebarWidth(), viewportWidth - sidebarLeft - constants.SIDEBAR_PADDING);
    }
    var sidebarTop = constants.HEADER_HEIGHT + constants.TAB_BAR_HEIGHT;
    var sidebarHeight = "calc(100vh - " + sidebarTop + "px)";
    return {
      viewportWidth: viewportWidth,
      gap: gap,
      sidebarLeft: sidebarLeft,
      sidebarWidth: sidebarWidth,
      sidebarTop: sidebarTop,
      sidebarHeight: sidebarHeight,
    };
  }

  YTSP.calculatePlayerWidth = function () {
    var viewportWidth = document.documentElement.clientWidth;
    var maxPlayer = YTSP.maxPlayerWidthForViewport(viewportWidth);
    state.playerWidth = Math.round(viewportWidth * state.playerWidthPercent);
    state.playerWidth = Math.max(constants.MIN_PLAYER_WIDTH, Math.min(state.playerWidth, maxPlayer));
    // Do not rewrite playerWidthPercent here — keep user intent (e.g. 100%)
    // so a wider window can expand again; floor only clamps the live width.
  };

  var animateTimer = null;

  YTSP.setLayoutAnimating = function (on) {
    if (!document.body) return;
    var allow = YTSP.prefsState && YTSP.prefsState.smoothResize !== false;
    if (on && allow && !state.isDragging) {
      document.body.classList.add("ytsp-animate-layout");
      clearTimeout(animateTimer);
      animateTimer = setTimeout(function () {
        document.body.classList.remove("ytsp-animate-layout");
      }, constants.LAYOUT_ANIM_MS + 40);
    } else if (!on) {
      document.body.classList.remove("ytsp-animate-layout");
      clearTimeout(animateTimer);
    }
  };

  function buildCSS() {
    if (!state.isDragging) YTSP.calculatePlayerWidth();

    var dimensions = computeDimensions();
    var playerWidth = state.playerWidth;
    var sidebarLeftPx = dimensions.sidebarLeft + "px";
    var sidebarWidthPx = dimensions.sidebarWidth + "px";
    var sidebarWidthPaddedPx = (dimensions.sidebarWidth + constants.SIDEBAR_PADDING) + "px";
    var sidebarTopPx = dimensions.sidebarTop + "px";
    var sidebarHeightValue = dimensions.sidebarHeight;

    var css = "";

    css += `
      #player.ytd-watch-flexy {
        position: fixed !important;
        left: 0 !important;
        width: ${playerWidth}px !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
        z-index: 100 !important;
      }
      #player-container-outer.ytd-watch-flexy {
        max-width: none !important;
        min-width: 0 !important;
      }
      ytd-watch-flexy[theater] #player-theater-container {
        position: fixed !important;
        left: 0 !important;
        width: ${playerWidth}px !important;
        height: auto !important;
        min-height: 0 !important;
        max-width: none !important;
        margin: 0 !important;
        z-index: 100 !important;
      }
      #columns.ytd-watch-flexy {
        display: block !important;
        margin: 0 !important;
        padding: 0 !important;
        max-width: none !important;
      }
      #primary.ytd-watch-flexy {
        max-width: none !important;
        margin: 0 !important;
        padding: 0 !important;
        min-width: 0 !important;
      }
      #primary-inner.ytd-watch-flexy {
        margin: 0 !important;
        padding: 0 !important;
        margin-left: ${sidebarLeftPx} !important;
      }
      #secondary.ytd-watch-flexy {
        max-width: none !important;
        margin: 0 !important;
        padding: 0 !important;
        min-width: 0 !important;
      }
      #secondary-inner.ytd-watch-flexy {
        margin-left: ${sidebarLeftPx} !important;
        padding: 0 ${constants.SIDEBAR_PADDING}px !important;
        max-width: ${sidebarWidthPx} !important;
      }
    `;

    var tab = state.activeTab;
    var config = YTSP.tabConfig[tab];

    if (config && config.zone === "below") {
      css += `
        #below.ytd-watch-flexy {
          position: fixed !important;
          left: ${sidebarLeftPx} !important;
          top: ${sidebarTopPx} !important;
          width: ${sidebarWidthPx} !important;
          height: ${sidebarHeightValue} !important;
          overflow-y: auto !important;
          z-index: 50 !important;
          background: var(--yt-spec-general-background-a, #0f0f0f) !important;
          padding: 0 ${constants.SIDEBAR_PADDING}px !important;
          box-sizing: border-box !important;
        }
        #secondary-inner.ytd-watch-flexy {
          display: none !important;
        }
      `;
      if (tab === "description") {
        css += `
          ytd-text-inline-expander { --ytd-expander-collapsed-height: none !important; }
          #description-inner { max-height: none !important; overflow: visible !important; }
          ytd-expander.ytd-video-secondary-info-renderer { --ytd-expander-collapsed-height: none !important; }
        `;
      }
    } else {
      css += `
        #below.ytd-watch-flexy { display: none !important; }
        #secondary-inner.ytd-watch-flexy {
          display: block !important;
          position: fixed !important;
          left: ${sidebarLeftPx} !important;
          top: ${sidebarTopPx} !important;
          width: ${sidebarWidthPaddedPx} !important;
          height: ${sidebarHeightValue} !important;
          overflow-y: auto !important;
          z-index: 50 !important;
          background: var(--yt-spec-general-background-a, #0f0f0f) !important;
          padding: 0 ${constants.SIDEBAR_PADDING}px !important;
          margin-left: 0 !important;
          max-width: none !important;
        }
      `;

      if (tab === "chapters" || tab === "ask" || tab === "transcript") {
        // Only the single panel marked data-ytsp-visible should fill the sidebar.
        // Forcing height:100% on every expanded / non-hidden engagement panel
        // stacked multiple transcript shells into a tall scroll (empty + loaded).
        // Also avoid height:100% on nested transcript renderers — that stretched
        // the search header away from segment rows with a huge flex gap.
        css += `
          #panels.ytd-watch-flexy,
          ytd-engagement-panel-section-list-renderer#panels {
            display: block !important;
            position: fixed !important;
            left: ${sidebarLeftPx} !important;
            top: ${sidebarTopPx} !important;
            width: ${sidebarWidthPaddedPx} !important;
            height: ${sidebarHeightValue} !important;
            overflow: hidden !important;
            z-index: 60 !important;
            background: var(--yt-spec-general-background-a, #0f0f0f) !important;
            padding: 0 ${constants.SIDEBAR_PADDING}px !important;
          }
          #panels.ytd-watch-flexy ytd-engagement-panel-section-list-renderer[data-ytsp-visible],
          ytd-engagement-panel-section-list-renderer#panels ytd-engagement-panel-section-list-renderer[data-ytsp-visible] {
            display: flex !important;
            flex-direction: column !important;
            height: 100% !important;
            max-height: 100% !important;
            min-height: 0 !important;
            box-sizing: border-box !important;
          }
          #panels.ytd-watch-flexy ytd-engagement-panel-section-list-renderer[data-ytsp-visible] #header,
          ytd-engagement-panel-section-list-renderer#panels ytd-engagement-panel-section-list-renderer[data-ytsp-visible] #header {
            flex-shrink: 0 !important;
          }
          #panels.ytd-watch-flexy ytd-engagement-panel-section-list-renderer[data-ytsp-visible] #content,
          #panels.ytd-watch-flexy ytd-engagement-panel-section-list-renderer[data-ytsp-visible] #body,
          ytd-engagement-panel-section-list-renderer#panels ytd-engagement-panel-section-list-renderer[data-ytsp-visible] #content,
          ytd-engagement-panel-section-list-renderer#panels ytd-engagement-panel-section-list-renderer[data-ytsp-visible] #body {
            flex: 1 1 auto !important;
            min-height: 0 !important;
            overflow-x: hidden !important;
            overflow-y: auto !important;
          }
          #panels.ytd-watch-flexy ytd-engagement-panel-section-list-renderer[data-ytsp-visible] ytd-conversation-section-renderer,
          #panels.ytd-watch-flexy ytd-engagement-panel-section-list-renderer[data-ytsp-visible] ytd-ask-promo-renderer,
          #panels.ytd-watch-flexy ytd-engagement-panel-section-list-renderer[data-ytsp-visible] ytd-transcript-renderer,
          #panels.ytd-watch-flexy ytd-engagement-panel-section-list-renderer[data-ytsp-visible] ytd-transcript-search-panel-renderer,
          ytd-engagement-panel-section-list-renderer#panels ytd-engagement-panel-section-list-renderer[data-ytsp-visible] ytd-conversation-section-renderer,
          ytd-engagement-panel-section-list-renderer#panels ytd-engagement-panel-section-list-renderer[data-ytsp-visible] ytd-ask-promo-renderer,
          ytd-engagement-panel-section-list-renderer#panels ytd-engagement-panel-section-list-renderer[data-ytsp-visible] ytd-transcript-renderer,
          ytd-engagement-panel-section-list-renderer#panels ytd-engagement-panel-section-list-renderer[data-ytsp-visible] ytd-transcript-search-panel-renderer {
            display: flex !important;
            flex-direction: column !important;
            flex: 1 1 auto !important;
            min-height: 0 !important;
            height: auto !important;
            max-height: none !important;
          }
          #panels.ytd-watch-flexy ytd-engagement-panel-section-list-renderer[data-ytsp-visible] ytd-transcript-segment-list-renderer,
          #panels.ytd-watch-flexy ytd-engagement-panel-section-list-renderer[data-ytsp-visible] ytd-transcript-body-renderer,
          ytd-engagement-panel-section-list-renderer#panels ytd-engagement-panel-section-list-renderer[data-ytsp-visible] ytd-transcript-segment-list-renderer,
          ytd-engagement-panel-section-list-renderer#panels ytd-engagement-panel-section-list-renderer[data-ytsp-visible] ytd-transcript-body-renderer {
            flex: 1 1 auto !important;
            min-height: 0 !important;
            overflow-y: auto !important;
            height: auto !important;
          }
        `;
      }

      if (tab === "ycs") {
        css += `
          #secondary-inner.ytd-watch-flexy { overflow-y: auto !important; }
          #secondary-inner.ytd-watch-flexy > #plasmo-yck-root-sidebar,
          #secondary-inner.ytd-watch-flexy > [id^="plasmo-yck-root-"] {
            display: block !important;
            width: 100% !important;
            min-height: ${sidebarHeightValue} !important;
            max-height: none !important;
            overflow: visible !important;
          }
          #secondary-inner.ytd-watch-flexy > #plasmo-yck-root-sidebar > *,
          #secondary-inner.ytd-watch-flexy > [id^="plasmo-yck-root-"] > * {
            min-height: ${sidebarHeightValue} !important;
          }
          #plasmo-shadow-container { min-height: ${sidebarHeightValue} !important; }
        `;
      }

      if (tab === "chat") {
        css += `
          #secondary-inner.ytd-watch-flexy { overflow-y: hidden !important; padding: 0 !important; }
          #secondary-inner.ytd-watch-flexy ytd-live-chat-frame,
          #secondary-inner.ytd-watch-flexy #chat {
            display: block !important;
            width: 100% !important;
            height: ${sidebarHeightValue} !important;
            max-height: none !important;
            min-height: 0 !important;
          }
          #secondary-inner.ytd-watch-flexy ytd-live-chat-frame iframe,
          #secondary-inner.ytd-watch-flexy #chatframe {
            display: block !important;
            width: 100% !important;
            height: ${sidebarHeightValue} !important;
            max-height: none !important;
            min-height: 0 !important;
            border: none !important;
          }
        `;
      }
    }

    return css;
  }

  /**
   * @param {{ animate?: boolean }} [options]
   */
  YTSP.applyLayout = function (options) {
    if (YTSP.layoutBusy) return;
    YTSP.layoutBusy = true;
    try {
      if (!state.isOnWatchPage || state.isFullscreen ||
          (typeof YTSP.isExtensionEnabled === "function" && !YTSP.isExtensionEnabled())) {
        YTSP.removeLayout();
        return;
      }

      options = options || {};
      if (options.animate) YTSP.setLayoutAnimating(true);
      else if (state.isDragging) YTSP.setLayoutAnimating(false);

      document.body.setAttribute("ytsp-active", "");

      if (dom.tabBar) dom.tabBar.style.display = "";
      if (dom.resizeBar) dom.resizeBar.style.display = "";

      dom.style.textContent = buildCSS();

      window.dispatchEvent(new Event("resize"));

      var playerElement = document.querySelector("#player.ytd-watch-flexy");
      if (playerElement) {
        var viewportHeight = window.innerHeight;
        var playerHeight = playerElement.offsetHeight;
        var availableHeight = viewportHeight - constants.HEADER_HEIGHT;
        playerElement.style.top = constants.HEADER_HEIGHT +
          Math.max(0, (availableHeight - playerHeight) / 2) + "px";
      }

      var gap = constants.DIVIDER_WIDTH;
      var dimensions = computeDimensions();
      if (dom.resizeBar) dom.resizeBar.style.left = state.playerWidth + gap + "px";
      if (dom.tabBar) {
        dom.tabBar.style.left = dimensions.sidebarLeft + "px";
        dom.tabBar.style.width = dimensions.sidebarWidth + constants.SIDEBAR_PADDING + "px";
      }

      if (typeof YTSP.updateTabBarScroll === "function") {
        requestAnimationFrame(YTSP.updateTabBarScroll);
      }

      YTSP.applyTabVisibility();
    } finally {
      YTSP.layoutBusy = false;
    }
  };

  YTSP.removeLayout = function () {
    document.body.removeAttribute("ytsp-active");
    document.body.classList.remove("ytsp-animate-layout");
    if (dom.style) dom.style.textContent = "";

    // Clear inline top set by applyLayout so the native player layout is not offset.
    var playerElement = document.querySelector("#player.ytd-watch-flexy");
    if (playerElement) playerElement.style.top = "";

    var below = document.querySelector("#below.ytd-watch-flexy");
    if (below) Array.from(below.children).forEach(function (child) { child.style.display = ""; });

    var secondaryInner = document.querySelector("#secondary-inner.ytd-watch-flexy");
    if (secondaryInner) Array.from(secondaryInner.children).forEach(function (child) { child.style.display = ""; });

    var panels = YTSP.getPanelsContainer();
    if (panels) {
      Array.from(panels.children).forEach(function (child) {
        child.style.display = "";
        child.style.flexDirection = "";
        child.style.visibility = "";
        child.removeAttribute("data-ytsp-visible");
      });
    }

    if (dom.tabBar) {
      dom.tabBar.style.left = "";
      dom.tabBar.style.width = "";
    }
    if (dom.resizeBar) dom.resizeBar.style.left = "";
  };

})();

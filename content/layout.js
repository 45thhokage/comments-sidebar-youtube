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

  function computeDimensions() {
    var viewportWidth = document.documentElement.clientWidth;
    var gap = constants.DIVIDER_WIDTH;
    var sidebarLeft = state.playerWidth + gap + constants.GRAB_BAR_WIDTH;
    var sidebarWidth = viewportWidth - sidebarLeft - constants.SIDEBAR_PADDING;
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
    state.playerWidth = Math.round(viewportWidth * state.playerWidthPercent);
    state.playerWidth = Math.max(constants.MIN_PLAYER_WIDTH,
      Math.min(state.playerWidth, Math.round(viewportWidth * constants.MAX_PLAYER_WIDTH_FRAC)));
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

      if (tab === "chapters" || tab === "ask") {
        css += `
          #panels.ytd-watch-flexy,
          ytd-engagement-panel-section-list-renderer#panels {
            display: block !important;
            position: fixed !important;
            left: ${sidebarLeftPx} !important;
            top: ${sidebarTopPx} !important;
            width: ${sidebarWidthPaddedPx} !important;
            height: ${sidebarHeightValue} !important;
            overflow-y: auto !important;
            z-index: 60 !important;
            background: var(--yt-spec-general-background-a, #0f0f0f) !important;
            padding: 0 ${constants.SIDEBAR_PADDING}px !important;
          }
          #panels.ytd-watch-flexy > ytd-engagement-panel-section-list-renderer,
          ytd-engagement-panel-section-list-renderer#panels > ytd-engagement-panel-section-list-renderer,
          #panels.ytd-watch-flexy ytd-engagement-panel-section-list-renderer[visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"],
          #panels.ytd-watch-flexy ytd-engagement-panel-section-list-renderer:not([style*="display: none"]) {
            height: 100% !important;
            max-height: 100% !important;
          }
          #panels.ytd-watch-flexy ytd-engagement-panel-section-list-renderer #header { flex-shrink: 0 !important; }
          #panels.ytd-watch-flexy ytd-engagement-panel-section-list-renderer #content,
          #panels.ytd-watch-flexy ytd-engagement-panel-section-list-renderer #body {
            flex: 1 !important;
            min-height: 0 !important;
            overflow-y: auto !important;
          }
          #panels.ytd-watch-flexy ytd-engagement-panel-section-list-renderer ytd-conversation-section-renderer,
          #panels.ytd-watch-flexy ytd-engagement-panel-section-list-renderer ytd-ask-promo-renderer {
            height: 100% !important;
            min-height: 0 !important;
          }
          #panels.ytd-watch-flexy ytd-engagement-panel-section-list-renderer[data-ytsp-visible] {
            display: flex !important;
            flex-direction: column !important;
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

  YTSP.applyLayout = function () {
    if (YTSP.layoutBusy) return;
    YTSP.layoutBusy = true;
    try {
      if (!state.isOnWatchPage || state.isFullscreen) {
        YTSP.removeLayout();
        return;
      }

      document.body.setAttribute("ytsp-active", "");

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
      dom.resizeBar.style.left = state.playerWidth + gap + "px";
      dom.tabBar.style.left = dimensions.sidebarLeft + "px";
      dom.tabBar.style.width = dimensions.sidebarWidth + constants.SIDEBAR_PADDING + "px";

      YTSP.applyTabVisibility();
    } finally {
      YTSP.layoutBusy = false;
    }
  };

  YTSP.removeLayout = function () {
    document.body.removeAttribute("ytsp-active");
    if (dom.style) dom.style.textContent = "";

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

    dom.tabBar.style.left = "";
    dom.tabBar.style.width = "";
    dom.resizeBar.style.left = "";
  };

})();

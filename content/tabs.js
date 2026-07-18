/**
 * tabs.js — Tab switching and sidebar child visibility
 *
 * Manages which content is visible in the sidebar panel when the user
  * clicks a tab button.  Also intercepts native YouTube button clicks
  * (Ask, Chapters, Transcript) to auto-switch to the corresponding tab.
 *
 * Each tab in tabConfig describes its zone and matching logic:
 *   zone "below"     — show #below (description / comments sections)
 *   zone "secondary" — show #secondary-inner, filtering children by match()
 *   zone "panel"     — hide #secondary-inner, show the matching engagement panel
 */
(function () {
  "use strict";

  var YTSP = window.YTSP;
  var constants = YTSP.constants;
  var state = YTSP.state;
  var dom = YTSP.dom;

  var tabConfig = {
    description: {
      zone: "below",
      expand: true,
    },
    comments: {
      zone: "below",
    },
    ycs: {
      zone: "secondary",
      match: function (element) {
        return element.id === "plasmo-yck-root-sidebar" ||
               (element.id && element.id.indexOf("plasmo-yck-root-") === 0);
      },
    },
    related: {
      zone: "secondary",
      match: function (element) { return element.id === "related"; },
    },
    playlist: {
      zone: "secondary",
      match: function (element) {
        return element.id === "playlist" ||
               element.tagName === "YTD-PLAYLIST-PANEL-RENDERER" ||
               !!element.querySelector("ytd-playlist-panel-renderer");
      },
    },
    chat: {
      zone: "secondary",
      match: function (element) {
        return element.id === "chat" ||
               element.tagName === "YTD-LIVE-CHAT-FRAME" ||
               !!element.querySelector("ytd-live-chat-frame");
      },
    },
    chapters: {
      zone: "panel",
      detector: YTSP.isChapterPanel,
      activator: YTSP.tryActivateChaptersPanel,
    },
    transcript: {
      zone: "panel",
      detector: YTSP.isTranscriptPanel,
      activator: YTSP.tryActivateTranscriptPanel,
    },
    ask: {
      zone: "panel",
      detector: YTSP.isAskPanel,
      activator: YTSP.tryActivateAskPanel,
    },
  };

  YTSP.tabConfig = tabConfig;

  var TAB_SCROLL_STEP = 160;

  /**
   * Horizontal scroll polish for the tab bar:
   * - wheel (vertical) → horizontal scroll while hovering tabs
   * - absolute edge arrows (left arrow scrolls content rightward / scrollLeft--, etc.)
   * - arrow visibility tracks whether more content exists on each side
   */
  YTSP.setupTabBarScroll = function () {
    var tabBar = dom.tabBar;
    var scrollEl = dom.tabScroll;
    var navLeft = dom.tabNavLeft;
    var navRight = dom.tabNavRight;
    if (!tabBar || !scrollEl || !navLeft || !navRight) return;

    function updateNavVisibility() {
      var maxScroll = scrollEl.scrollWidth - scrollEl.clientWidth;
      var canScroll = maxScroll > 1;
      var atStart = scrollEl.scrollLeft <= 1;
      var atEnd = scrollEl.scrollLeft >= maxScroll - 1;

      tabBar.classList.toggle("ytsp-can-scroll-left", canScroll && !atStart);
      tabBar.classList.toggle("ytsp-can-scroll-right", canScroll && !atEnd);
    }

    function scrollBy(delta) {
      scrollEl.scrollBy({ left: delta, behavior: "smooth" });
    }

    // Vertical mouse wheel → horizontal scroll (premium trackpad-friendly tabs)
    scrollEl.addEventListener("wheel", function (event) {
      if (scrollEl.scrollWidth <= scrollEl.clientWidth + 1) return;
      // Prefer vertical delta; fall back to horizontal if already horizontal
      var delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX)
        ? event.deltaY
        : event.deltaX;
      if (!delta) return;
      event.preventDefault();
      scrollEl.scrollLeft += delta;
      updateNavVisibility();
    }, { passive: false });

    // Left edge button: content shifts right (scrollLeft decreases)
    navLeft.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      scrollBy(-TAB_SCROLL_STEP);
    });

    // Right edge button: content shifts left (scrollLeft increases)
    navRight.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      scrollBy(TAB_SCROLL_STEP);
    });

    scrollEl.addEventListener("scroll", updateNavVisibility, { passive: true });

    if (typeof ResizeObserver !== "undefined") {
      var ro = new ResizeObserver(updateNavVisibility);
      ro.observe(scrollEl);
      ro.observe(tabBar);
    }

    YTSP.updateTabBarScroll = updateNavVisibility;
    updateNavVisibility();
  };

  function showPanel(element) {
    element.style.display = "flex";
    element.style.flexDirection = "column";
    element.setAttribute("data-ytsp-visible", "");
    element.removeAttribute("hidden");
    element.style.visibility = "visible";
    element.setAttribute("visibility", "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED");
  }

  function hidePanel(element) {
    element.style.display = "none";
    element.removeAttribute("data-ytsp-visible");
  }

  function resetPanel(element) {
    element.style.display = "";
    element.style.flexDirection = "";
    element.style.visibility = "";
    element.removeAttribute("data-ytsp-visible");
  }

  YTSP.switchTab = function (tab, options) {
    options = options || {};
    if (typeof YTSP.isTabVisible === "function" && !YTSP.isTabVisible(tab)) {
      if (!options.force) return;
    }
    if (tab === state.activeTab && !options.force) return;
    if (state.activeTab === "transcript" && tab !== "transcript" &&
        typeof YTSP.resetTranscriptActivation === "function") {
      YTSP.resetTranscriptActivation();
    }
    if (dom.tabBtns[state.activeTab]) dom.tabBtns[state.activeTab].classList.remove("active");
    state.activeTab = tab;
    if (dom.tabBtns[tab]) dom.tabBtns[tab].classList.add("active");

    var activeButton = dom.tabBtns[tab];
    if (activeButton) {
      activeButton.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }

    var config = tabConfig[tab];
    if (config && config.activator) config.activator();

    if (typeof YTSP.applyLayout === "function") YTSP.applyLayout();

    if (tab === "description") setTimeout(YTSP.autoExpandDescription, 250);

    if (!options.skipMemory && typeof YTSP.rememberCurrentLayout === "function") {
      YTSP.rememberCurrentLayout();
    }
  };

  YTSP.applyTabVisibility = function () {
    var tab = state.activeTab;
    var config = tabConfig[tab];
    if (!config) return;

    var below = document.querySelector("#below.ytd-watch-flexy");
    if (below) {
      var belowChildren = Array.from(below.children);
      if (config.zone === "below") {
        if (tab === "description") {
          belowChildren.forEach(function (child) {
            child.style.display = (child.querySelector("ytd-watch-metadata") || child.id === "alerts") ? "" : "none";
          });
        } else {
          belowChildren.forEach(function (child) {
            child.style.display = child.querySelector("#comments") ? "" : "none";
          });
        }
      } else {
        belowChildren.forEach(function (child) { child.style.display = ""; });
      }
    }

    var secondaryInner = document.querySelector("#secondary-inner.ytd-watch-flexy");
    if (!secondaryInner) return;
    var secondaryChildren = Array.from(secondaryInner.children);

    var panelsContainer = YTSP.getPanelsContainer();
    var panelChildren = panelsContainer ? Array.from(panelsContainer.children) : [];

    if (config.zone === "secondary") {
      panelChildren.forEach(hidePanel);
      secondaryChildren.forEach(function (child) {
        child.style.display = (config.match && config.match(child)) ? "" : "none";
      });
    } else if (config.zone === "panel") {
      secondaryChildren.forEach(function (child) { child.style.display = "none"; });

      // YouTube keeps multiple shells that match the same detector (empty + real).
      // Showing all of them stacks N full-height panels — empty "loading" on top,
      // real content only after scrolling. Pick one; hide the rest.
      var matches = panelChildren.filter(function (child) {
        return config.detector(child);
      });
      var chosen = null;
      if (tab === "transcript" && typeof YTSP.pickBestTranscriptPanel === "function") {
        chosen = YTSP.pickBestTranscriptPanel(matches);
      } else if (matches.length) {
        chosen = matches[0];
        for (var mi = 0; mi < matches.length; mi++) {
          if ((matches[mi].textContent || "").trim().length > 40) {
            chosen = matches[mi];
            break;
          }
        }
      }

      panelChildren.forEach(function (child) {
        if (chosen && child === chosen) showPanel(child);
        else hidePanel(child);
      });

      // Transcript shells often exist empty; showPanel alone never fetches segments.
      // Keep calling the activator until content arrives (it self-guards re-clicks).
      if (config.activator) {
        if (!chosen) {
          config.activator();
        } else if (
          tab === "transcript" &&
          typeof YTSP.transcriptPanelHasContent === "function" &&
          !YTSP.transcriptPanelHasContent(chosen)
        ) {
          config.activator();
        }
      }
    } else if (config.zone === "below") {
      panelChildren.forEach(hidePanel);
      secondaryChildren.forEach(function (child) { child.style.display = ""; });
    } else {
      secondaryChildren.forEach(function (child) { child.style.display = ""; });
      panelChildren.forEach(resetPanel);
    }
  };

  YTSP.setupNativeButtonInterceptors = function () {
    document.addEventListener("click", function (event) {
      if (!state.isOnWatchPage) return;
      if (event.target.closest("#ytsp-app")) return;

      if (YTSP.isAskButtonClick(event.target)) {
        setTimeout(function () { YTSP.switchTab("ask"); }, 150);
        return;
      }
      if (YTSP.isChaptersButtonClick(event.target)) {
        setTimeout(function () { YTSP.switchTab("chapters"); }, 150);
        return;
      }
      if (YTSP.isTranscriptButtonClick(event.target)) {
        if (YTSP._transcriptProgrammaticClick) return;
        // YouTube is already opening/fetching — activator must not re-click.
        YTSP._transcriptUserOpened = true;
        setTimeout(function () { YTSP.switchTab("transcript"); }, 150);
      }
    }, true);
  };

  YTSP.setupEngagementPanelObserver = function () {
    YTSP.observers.engagementPanel = new MutationObserver(function (mutations) {
      if (!state.isOnWatchPage) return;
      for (var i = 0; i < mutations.length; i++) {
        var mutation = mutations[i];
        if (mutation.type === "attributes" && mutation.attributeName === "visibility") {
          var panel = mutation.target;
          if (panel.tagName === "YTD-ENGAGEMENT-PANEL-SECTION-LIST-RENDERER") {
            if (panel.getAttribute("visibility") === "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED") {
              if (YTSP.isAskPanel(panel) && state.activeTab !== "ask") YTSP.switchTab("ask");
              else if (YTSP.isChapterPanel(panel) && state.activeTab !== "chapters") YTSP.switchTab("chapters");
              else if (YTSP.isTranscriptPanel(panel) && state.activeTab !== "transcript") YTSP.switchTab("transcript");
            }
          }
        }
      }
    });
    YTSP.observers.engagementPanel.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ["visibility"],
    });
  };

  YTSP.autoExpandDescription = function () {
    var below = document.querySelector("#below.ytd-watch-flexy, #below");
    if (!below) return;

    var selectors = [
      "#description-inner #expand",
      "ytd-text-inline-expander #expand",
      "ytd-expander #expand",
      "tp-yt-paper-button#more",
      "#description ytd-expander #expand",
      "ytd-video-secondary-info-renderer #expand",
      "ytd-expand-button-renderer button",
      "ytd-text-inline-expander tp-yt-paper-button[class*='more']",
    ];

    for (var i = 0; i < selectors.length; i++) {
      var button = below.querySelector(selectors[i]);
      if (button && button.offsetParent !== null) { button.click(); return; }
    }

    var allButtons = below.querySelectorAll("button, tp-yt-paper-button");
    for (var j = 0; j < allButtons.length; j++) {
      var text = (allButtons[j].textContent || "").trim().toLowerCase();
      var label = (allButtons[j].getAttribute("aria-label") || "").toLowerCase();
      if ((text === "more" || label.indexOf("show more") !== -1 || label.indexOf("expand") !== -1) &&
          allButtons[j].offsetParent !== null) {
        allButtons[j].click();
        return;
      }
    }
  };

})();

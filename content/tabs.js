/**
 * tabs.js — Tab switching and sidebar child visibility
 *
 * Manages which content is visible in the sidebar panel when the user
 * clicks a tab button.  Also intercepts native YouTube button clicks
 * (Ask, Chapters) to auto-switch to the corresponding tab.
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
    ask: {
      zone: "panel",
      detector: YTSP.isAskPanel,
      activator: YTSP.tryActivateAskPanel,
    },
  };

  YTSP.tabConfig = tabConfig;

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

  YTSP.switchTab = function (tab) {
    if (tab === state.activeTab) return;
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
      var found = false;
      panelChildren.forEach(function (child) {
        if (config.detector(child)) {
          showPanel(child);
          found = true;
        } else {
          hidePanel(child);
        }
      });
      if (!found && config.activator) config.activator();
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

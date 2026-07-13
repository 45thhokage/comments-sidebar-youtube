/**
 * tab-bar.js — Build / rebuild the sidebar tab bar from prefs
 *
 * Creates the outer tab bar shell (nav arrows + scroll strip) and
 * rebuilds chip buttons whenever tab order or visibility changes.
 */
(function () {
  "use strict";

  var YTSP = window.YTSP;
  var state = YTSP.state;
  var dom = YTSP.dom;

  var scrollWired = false;

  function ensureShell() {
    if (dom.tabBar) return;

    dom.tabBar = document.createElement("div");
    dom.tabBar.id = "ytsp-tab-bar";

    dom.tabNavLeft = document.createElement("button");
    dom.tabNavLeft.type = "button";
    dom.tabNavLeft.className = "ytsp-tab-nav ytsp-tab-nav-left";
    dom.tabNavLeft.setAttribute("aria-label", "Scroll tabs left");
    dom.tabNavLeft.innerHTML = "&#8249;";

    dom.tabScroll = document.createElement("div");
    dom.tabScroll.id = "ytsp-tab-scroll";

    dom.tabNavRight = document.createElement("button");
    dom.tabNavRight.type = "button";
    dom.tabNavRight.className = "ytsp-tab-nav ytsp-tab-nav-right";
    dom.tabNavRight.setAttribute("aria-label", "Scroll tabs right");
    dom.tabNavRight.innerHTML = "&#8250;";

    dom.tabBar.appendChild(dom.tabNavLeft);
    dom.tabBar.appendChild(dom.tabScroll);
    dom.tabBar.appendChild(dom.tabNavRight);
  }

  /**
   * Recreate tab chips from getVisibleTabs(). Safe to call repeatedly.
   */
  YTSP.rebuildTabBar = function () {
    ensureShell();
    if (!dom.tabScroll) return;

    var visible = typeof YTSP.getVisibleTabs === "function"
      ? YTSP.getVisibleTabs()
      : YTSP.constants.TABS.slice();

    if (!visible.length) {
      visible = [YTSP.constants.TABS[0]];
    }

    // Clear chips
    while (dom.tabScroll.firstChild) {
      dom.tabScroll.removeChild(dom.tabScroll.firstChild);
    }
    dom.tabBtns = {};

    visible.forEach(function (tab) {
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = tab;
      button.dataset.tab = tab;
      if (tab === state.activeTab) button.classList.add("active");
      button.addEventListener("click", function () {
        YTSP.switchTab(tab);
      });
      dom.tabScroll.appendChild(button);
      dom.tabBtns[tab] = button;
    });

    if (!dom.tabBtns[state.activeTab] && visible.length) {
      // Active chip missing until switchTab runs; mark first for paint
      var first = visible[0];
      if (dom.tabBtns[first] && state.activeTab === first) {
        dom.tabBtns[first].classList.add("active");
      }
    }

    if (!scrollWired && typeof YTSP.setupTabBarScroll === "function") {
      YTSP.setupTabBarScroll();
      scrollWired = true;
    } else if (typeof YTSP.updateTabBarScroll === "function") {
      requestAnimationFrame(YTSP.updateTabBarScroll);
    }
  };

  /**
   * Initial shell + chips (called once from createUI).
   */
  YTSP.createTabBar = function () {
    ensureShell();
    YTSP.rebuildTabBar();
    return dom.tabBar;
  };

})();

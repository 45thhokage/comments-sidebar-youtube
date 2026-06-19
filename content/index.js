/**
 * index.js — Entry point: creates the sidebar DOM, wires modules
 *
 * This is the only file that "imports" all the others.  It calls
 * createUI() to build the sidebar DOM elements, then registers every
 * listener and observer defined in the sibling modules.
 */
(function () {
  "use strict";

  var YTSP = window.YTSP;
  var constants = YTSP.constants;
  var state = YTSP.state;
  var dom = YTSP.dom;

  function createUI() {
    if (dom.app) return;

    dom.app = document.createElement("div");
    dom.app.id = "ytsp-app";

    dom.tabBar = document.createElement("div");
    dom.tabBar.id = "ytsp-tab-bar";

    constants.TABS.forEach(function (tab) {
      var button = document.createElement("button");
      button.textContent = tab;
      button.dataset.tab = tab;
      if (tab === state.activeTab) button.classList.add("active");
      button.addEventListener("click", function () { YTSP.switchTab(tab); });
      dom.tabBar.appendChild(button);
      dom.tabBtns[tab] = button;
    });

    dom.resizeBar = document.createElement("div");
    dom.resizeBar.id = "ytsp-resize-bar";
    var resizeInner = document.createElement("div");
    dom.resizeBar.appendChild(resizeInner);

    dom.resizeBar.addEventListener("pointerdown", YTSP.onResizeStart);
    dom.resizeBar.addEventListener("pointermove", YTSP.onResizeMove);
    dom.resizeBar.addEventListener("pointerup", YTSP.onResizeEnd);
    dom.resizeBar.addEventListener("lostpointercapture", YTSP.onResizeEnd);

    dom.style = document.createElement("style");
    dom.style.id = "ytsp-dynamic-styles";

    dom.app.appendChild(dom.tabBar);
    dom.app.appendChild(dom.resizeBar);
    document.head.appendChild(dom.style);
    document.body.appendChild(dom.app);
  }

  function init() {
    YTSP.initCSSProperties();
    YTSP.loadStoredWidth().then(function () {
      createUI();
      YTSP.setupNavigationListener();
      YTSP.setupPagePresenceObserver();
      YTSP.setupNativeButtonInterceptors();
      YTSP.setupEngagementPanelObserver();
      YTSP.setupFullscreenListener();
      YTSP.listenForWindowResize();
      state.isUIReady = true;

      YTSP.checkWatchPage();
    });
  }

  init();

})();

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
  var state = YTSP.state;
  var dom = YTSP.dom;

  function createUI() {
    if (dom.app) return;

    dom.app = document.createElement("div");
    dom.app.id = "ytsp-app";

    var tabBar = YTSP.createTabBar();
    dom.app.appendChild(tabBar);

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

    dom.app.appendChild(dom.resizeBar);
    document.head.appendChild(dom.style);
    document.body.appendChild(dom.app);
  }

  function init() {
    YTSP.initCSSProperties();
    YTSP.loadPrefs().then(function () {
      createUI();

      // Ensure active tab is one of the visible ones after prefs load
      var visible = YTSP.getVisibleTabs();
      if (visible.length && visible.indexOf(state.activeTab) === -1) {
        state.activeTab = visible[0];
        if (dom.tabBtns[state.activeTab]) {
          Object.keys(dom.tabBtns).forEach(function (key) {
            dom.tabBtns[key].classList.toggle("active", key === state.activeTab);
          });
        }
      }

      // Ready before listeners so prefs messages can apply immediately
      state.isUIReady = true;

      YTSP.setupPrefsListener();
      YTSP.setupNavigationListener();
      YTSP.setupPagePresenceObserver();
      YTSP.setupNativeButtonInterceptors();
      YTSP.setupEngagementPanelObserver();
      YTSP.setupFullscreenListener();
      YTSP.listenForWindowResize();

      YTSP.checkWatchPage();
    });
  }

  init();

})();

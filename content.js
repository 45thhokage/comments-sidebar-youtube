/**
 * YouTube Side Panel — Content Script (Manifest V3) v2
 *
 * SPA-Aware Architecture:
 *   1. Content script is injected on EVERY YouTube page (not just /watch)
 *   2. init() runs immediately, pre-creating the sidebar UI (hidden) and
 *      setting up event listeners
 *   3. setupNavigationListener() hooks into YouTube's SPA events
 *      (yt-navigate-finish, yt-page-data-updated)
 *   4. When you click a video, YouTube's SPA router fires yt-navigate-finish
 *   5. checkWatchPage() detects the /watch URL and waits for ytd-watch-flexy
 *      to render
 *   6. applyLayout() transforms the page into a split layout using dynamic
 *      CSS + JS DOM manipulation
 *   7. inject.js (in page context, MAIN world) patches YouTube's internal
 *      layout logic to prevent conflicts
 *   8. MutationObserver keeps re-applying the layout as YouTube mutates the DOM
 *
 * YouTube DOM structure (2025):
 *   #columns
 *     #primary
 *       #primary-inner
 *         #player → #player-container-outer → #movie_player
 *         #below
 *           .box → ytd-watch-metadata (title, description)
 *           .box → ytd-comments#comments
 *     #secondary
 *       #secondary-inner
 *         #related
 *         #playlist / ytd-playlist-panel-renderer
 *         #chat / ytd-live-chat-frame
 *         #panels (chapters/ask engagement panels)
 */
(function () {
  "use strict";

  // ── Constants ────────────────────────────────────────────────
  const HEADER_HEIGHT = 56;
  const DIVIDER_WIDTH = 8;   // gap between player and resize bar
  const GRAB_BAR_WIDTH = 14; // width of the resize bar hit target
  const TAB_BAR_HEIGHT = 38;
  const videoGap = true;     // gap between player and resize bar
  const SIDEBAR_PADDING = 8;
  const STORAGE_KEY = "ytSidePanelPlayerWidthPercent";
  const TABS = ["description", "comments", "ycs", "chapters", "ask", "related", "playlist", "chat"];
  const BELOW_TABS = new Set(["description", "comments"]);
  // ycs tab is a secondary tab that hosts the YouTube Comment Search extension UI
  // It requires #secondary-inner to be visible so the YCS shadow root element
  // (plasmo-yck-root-sidebar) remains accessible and interactive.

  // ── State ────────────────────────────────────────────────────
  let isOnWatchPage = false;
  let activeTab = "description";
  let playerWidth = 0;
  let playerWidthPercent = 0.55;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartWidth = 0;
  let isFullscreen = false;
  let isUIReady = false;

  // ── DOM refs (created once, persisted across navigations) ────
  let appEl = null;
  let tabBarEl = null;
  let resizeBarEl = null;
  let styleEl = null;
  let tabBtns = {};
  let engagementPanelObserver = null;
  let domObserver = null;

  // ── Step 2: init() runs immediately ──────────────────────────
  // Pre-creates sidebar UI (hidden) and sets up all listeners.
  // This runs on EVERY YouTube page, not just /watch.
  function init() {
    loadStoredWidth().then(() => {
      createUI();                       // Pre-create sidebar UI (hidden)
      setupNavigationListener();        // Step 3: Hook SPA events
      setupNativeButtonInterceptors();
      setupEngagementPanelObserver();
      setupFullscreenListener();
      listenForWindowResize();
      isUIReady = true;

      // Step 5: Check if we're ALREADY on a watch page (direct load)
      checkWatchPage();
    });
  }

  // Run init immediately
  init();

  // ── Persistence ──────────────────────────────────────────────
  function loadStoredWidth() {
    return new Promise((resolve) => {
      try {
        const stored = sessionStorage.getItem(STORAGE_KEY);
        if (stored) playerWidthPercent = parseFloat(stored);
      } catch (_) {}
      resolve();
    });
  }

  function saveWidth() {
    const vw = document.documentElement.clientWidth;
    if (vw > 0) {
      playerWidthPercent = playerWidth / vw;
      try { sessionStorage.setItem(STORAGE_KEY, String(playerWidthPercent)); } catch (_) {}
    }
  }

  // ── Step 2: Create UI elements (hidden by default) ───────────
  // The #ytsp-app starts with display:none via content.css.
  // It only becomes visible when body[ytsp-active] is set.
  function createUI() {
    if (appEl) return; // Already created — persist across navigations

    // Root container — zero-size, pointer-events:none so it doesn't block YT
    appEl = document.createElement("div");
    appEl.id = "ytsp-app";

    // Tab bar
    tabBarEl = document.createElement("div");
    tabBarEl.id = "ytsp-tab-bar";

    TABS.forEach((tab) => {
      const btn = document.createElement("button");
      btn.textContent = tab;
      btn.dataset.tab = tab;
      if (tab === activeTab) btn.classList.add("active");
      btn.addEventListener("click", () => switchTab(tab));
      tabBarEl.appendChild(btn);
      tabBtns[tab] = btn;
    });

    // Resize bar
    resizeBarEl = document.createElement("div");
    resizeBarEl.id = "ytsp-resize-bar";
    const resizeInner = document.createElement("div");
    resizeBarEl.appendChild(resizeInner);

    resizeBarEl.addEventListener("pointerdown", onResizeStart);
    resizeBarEl.addEventListener("pointermove", onResizeMove);
    resizeBarEl.addEventListener("pointerup", onResizeEnd);
    resizeBarEl.addEventListener("lostpointercapture", onResizeEnd);

    // Dynamic style tag
    styleEl = document.createElement("style");
    styleEl.id = "ytsp-dynamic-styles";

    appEl.appendChild(tabBarEl);
    appEl.appendChild(resizeBarEl);
    document.head.appendChild(styleEl);
    document.body.appendChild(appEl);
  }

  // ── Step 3: setupNavigationListener() ────────────────────────
  // Hooks into YouTube's SPA events to detect navigation.
  // YouTube's SPA router fires custom events when the user navigates
  // between pages without a full page reload.
  function setupNavigationListener() {
    // yt-navigate-finish: Fired after YouTube's SPA router has finished
    // navigating to a new page. This is the primary event for detecting
    // when the user clicks on a video from the home page or search results.
    document.addEventListener("yt-navigate-finish", () => {
      console.log("[YTSP] yt-navigate-finish fired, URL:", location.pathname);
      // Small delay to let YouTube's DOM updates settle before we check
      setTimeout(checkWatchPage, 300);
    });

    // yt-page-data-updated: Fired when YouTube updates page data
    // (e.g., when navigating between videos on the watch page itself,
    // or when the page metadata is refreshed). This catches some
    // navigations that yt-navigate-finish misses.
    document.addEventListener("yt-page-data-updated", () => {
      console.log("[YTSP] yt-page-data-updated fired, URL:", location.pathname);
      setTimeout(checkWatchPage, 300);
    });

    // Fallback: Also monitor history API changes for edge cases where
    // YouTube's custom events don't fire (e.g., back/forward button,
    // or certain types of client-side navigation).
    let lastUrl = location.href;
    const origPush = history.pushState.bind(history);
    history.pushState = function (...args) {
      origPush(...args);
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        console.log("[YTSP] pushState detected, URL:", location.pathname);
        setTimeout(checkWatchPage, 300);
      }
    };
    window.addEventListener("popstate", () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        console.log("[YTSP] popstate detected, URL:", location.pathname);
        setTimeout(checkWatchPage, 300);
      }
    });
  }

  // ── Step 5: checkWatchPage() ─────────────────────────────────
  // Detects the /watch URL and waits for ytd-watch-flexy to render.
  // This is the gate that activates/deactivates the sidebar layout.
  function checkWatchPage() {
    const onWatch = location.pathname === "/watch" ||
                    location.pathname.startsWith("/watch");

    if (onWatch && !isOnWatchPage) {
      // Transitioning TO a watch page
      console.log("[YTSP] Entering watch page, waiting for ytd-watch-flexy...");
      isOnWatchPage = true;

      // Wait for ytd-watch-flexy to render before applying layout.
      // YouTube's SPA doesn't insert this element immediately — it may
      // take a few hundred milliseconds after the navigation event.
      waitForElement(() => document.querySelector("ytd-watch-flexy"), 10000)
        .then((flexyEl) => {
          if (!flexyEl || !isOnWatchPage) return;

          console.log("[YTSP] ytd-watch-flexy found, waiting for #below...");

          // Also wait for #below to exist — it's where description/comments live
          return waitForElement(() => document.querySelector("#below.ytd-watch-flexy, #below"), 8000);
        })
        .then((belowEl) => {
          if (!belowEl || !isOnWatchPage) return;

          console.log("[YTSP] Watch page DOM ready, applying layout");
          applyLayout();
          startDomObserver();

          // Auto-expand description on every fresh page load
          if (activeTab === "description") setTimeout(autoExpandDescription, 600);
        });

    } else if (!onWatch && isOnWatchPage) {
      // Transitioning AWAY from watch page
      console.log("[YTSP] Leaving watch page, removing layout");
      isOnWatchPage = false;
      removeLayout();
      stopDomObserver();
    }
  }

  // ── Tab switching ─────────────────────────────────────────────
  function switchTab(tab) {
    if (tab === activeTab) return;
    tabBtns[activeTab]?.classList.remove("active");
    activeTab = tab;
    tabBtns[tab]?.classList.add("active");

    // Scroll the active tab button into view in the tab bar
    const activeBtn = tabBtns[tab];
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }

    // Auto-activate engagement panels when switching to ask or chapters tabs
    if (tab === "ask") {
      tryActivateAskPanel();
    }
    if (tab === "chapters") {
      tryActivateChaptersPanel();
    }

    applyLayout();
    if (tab === "description") setTimeout(autoExpandDescription, 250);
  }

  // ── Try to open YouTube's Ask engagement panel ────────────────
  function tryActivateAskPanel() {
    const panelsContainer = getPanelsContainer();
    if (panelsContainer) {
      const panelChildren = Array.from(panelsContainer.children);
      for (const child of panelChildren) {
        if (isAskPanel(child) && child.style.display !== "none") return;
      }
    }

    const askBtn = findAskButton();
    if (askBtn) {
      console.log("[YTSP] Clicking Ask button to activate panel");
      askBtn.click();
    }
  }

  // ── Try to open YouTube's chapters engagement panel ───────────
  function tryActivateChaptersPanel() {
    const panelsContainer = getPanelsContainer();
    if (panelsContainer) {
      const panelChildren = Array.from(panelsContainer.children);
      for (const child of panelChildren) {
        if (isChapterPanel(child) && child.style.display !== "none") return;
      }
    }

    const chapterBtn = document.querySelector(".ytp-chapter-title.ytp-button");
    if (chapterBtn) {
      console.log("[YTSP] Clicking chapter title in player to activate panel");
      chapterBtn.click();
      return;
    }
  }

  // ── Find YouTube's native Ask button ─────────────────────────
  function findAskButton() {
    const askSelectors = [
      'button[aria-label="Ask"]',
      'button[aria-label*="Ask"]',
      'yt-button-shape button[aria-label*="Ask"]',
      'yt-button-view-model button[aria-label*="Ask"]',
      'ytd-button-renderer button[aria-label*="Ask"]',
      'ytd-toggle-button-renderer button[aria-label*="Ask"]',
      'button-view-model button[aria-label*="Ask"]',
    ];

    for (const sel of askSelectors) {
      const btn = document.querySelector(sel);
      if (btn) return btn;
    }

    const menuRenderer = document.querySelector("ytd-menu-renderer");
    if (menuRenderer) {
      const allButtons = menuRenderer.querySelectorAll("button");
      for (const btn of allButtons) {
        const text = (btn.textContent || "").trim().toLowerCase();
        const ariaLabel = (btn.getAttribute("aria-label") || "").toLowerCase();
        if (text === "ask" || ariaLabel === "ask") {
          return btn;
        }
      }
    }

    const allButtons = document.querySelectorAll("button");
    for (const btn of allButtons) {
      const text = (btn.textContent || "").trim().toLowerCase();
      const ariaLabel = (btn.getAttribute("aria-label") || "").toLowerCase();
      if (text === "ask" || ariaLabel === "ask") {
        return btn;
      }
    }

    return null;
  }

  // ── Panels Container & Panel Detection ───────────────────────
  function getPanelsContainer() {
    return document.querySelector("#panels.ytd-watch-flexy") ||
           document.querySelector("ytd-engagement-panel-section-list-renderer#panels");
  }

  function isChapterPanel(el) {
    const text = (
      el?.getAttribute("target-id") ||
      el?.getAttribute("panel-target-id") ||
      el?.getAttribute("panel-identifier") ||
      el?.id ||
      ""
    ).toLowerCase();
    const type = (el?.getAttribute("panel-type") || "").toLowerCase();

    return text.includes("chapter") ||
           text.includes("macro-markers") ||
           text.includes("key moments") ||
           type.includes("chapter") ||
           !!el?.querySelector("ytd-macro-markers-list-renderer");
  }

  function isAskPanel(el) {
    const text = (
      el?.getAttribute("target-id") ||
      el?.getAttribute("panel-target-id") ||
      el?.getAttribute("identifier") ||
      el?.getAttribute("panel-identifier") ||
      el?.id ||
      ""
    ).toLowerCase();

    return (
      text.includes("ask") ||
      text.includes("conversation") ||
      text.includes("ai") ||
      text.includes("qna") ||
      text.includes("summary") ||
      text.includes("summarize") ||
      text.includes("payouchat") ||
      !!el?.querySelector("ytd-conversation-section-renderer, ytd-ask-promo-renderer")
    );
  }

  // ── Native Button Interceptors ───────────────────────────────
  function setupNativeButtonInterceptors() {
    document.addEventListener("click", onNativeButtonClick, true);
  }

  function onNativeButtonClick(e) {
    if (!isOnWatchPage) return;
    if (e.target.closest("#ytsp-app")) return;

    const target = e.target;

    if (isAskButtonClick(target)) {
      console.log("[YTSP] Native Ask button clicked, switching to ask tab");
      setTimeout(() => { switchTab("ask"); }, 150);
      return;
    }

    if (isChaptersButtonClick(target)) {
      console.log("[YTSP] Native Chapters button clicked, switching to chapters tab");
      setTimeout(() => { switchTab("chapters"); }, 150);
      return;
    }
  }

  function isAskButtonClick(target) {
    let el = target;
    while (el && el !== document.body) {
      if (el.tagName === "BUTTON" || el.tagName === "YT-BUTTON-SHAPE" || el.tagName === "YT-BUTTON-VIEW-MODEL") {
        const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
        const text = (el.textContent || "").trim().toLowerCase();
        if (ariaLabel === "ask" || ariaLabel.includes("ask about this video") || text === "ask") {
          return true;
        }
      }
      el = el.parentElement;
    }
    return false;
  }

  function isChaptersButtonClick(target) {
    let el = target;
    while (el && el !== document.body) {
      if (el.classList && el.classList.contains("ytp-chapter-title") && el.classList.contains("ytp-button")) {
        return true;
      }
      if (el.tagName === "YTD-MACRO-MARKERS-LIST-ITEM-RENDERER" ||
          el.tagName === "YTD-HORIZONTAL-CARD-LIST-RENDERER") {
        return true;
      }
      if (el.tagName === "BUTTON" || el.tagName === "A") {
        const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
        const text = (el.textContent || "").trim().toLowerCase();
        if (ariaLabel.includes("chapter") || (text.includes("view all") && text.includes("chapter"))) {
          return true;
        }
      }
      el = el.parentElement;
    }
    return false;
  }

  // ── Engagement Panel Observer ────────────────────────────────
  function setupEngagementPanelObserver() {
    engagementPanelObserver = new MutationObserver((mutations) => {
      if (!isOnWatchPage) return;

      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.attributeName === "visibility") {
          const panel = mutation.target;
          if (panel.tagName === "YTD-ENGAGEMENT-PANEL-SECTION-LIST-RENDERER") {
            const visibility = panel.getAttribute("visibility");
            if (visibility === "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED") {
              if (isAskPanel(panel)) {
                console.log("[YTSP] Ask engagement panel opened natively, switching to ask tab");
                if (activeTab !== "ask") switchTab("ask");
              } else if (isChapterPanel(panel)) {
                console.log("[YTSP] Chapters engagement panel opened natively, switching to chapters tab");
                if (activeTab !== "chapters") switchTab("chapters");
              }
            }
          }
        }
      }
    });

    engagementPanelObserver.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ["visibility"],
    });
  }

  // ── Auto-expand the description ──────────────────────────────
  function autoExpandDescription() {
    const below = document.querySelector("#below.ytd-watch-flexy, #below");
    if (!below) return;

    const selectors = [
      "#description-inner #expand",
      "ytd-text-inline-expander #expand",
      "ytd-expander #expand",
      "tp-yt-paper-button#more",
      "#description ytd-expander #expand",
      "ytd-video-secondary-info-renderer #expand",
      "ytd-expand-button-renderer button",
      "ytd-text-inline-expander tp-yt-paper-button[class*='more']",
    ];

    for (const sel of selectors) {
      const btn = below.querySelector(sel);
      if (btn && btn.offsetParent !== null) {
        btn.click();
        return;
      }
    }

    for (const btn of below.querySelectorAll("button, tp-yt-paper-button")) {
      const text = (btn.textContent || "").trim().toLowerCase();
      const label = (btn.getAttribute("aria-label") || "").toLowerCase();
      if ((text === "more" || label.includes("show more") || label.includes("expand"))
          && btn.offsetParent !== null) {
        btn.click();
        return;
      }
    }
  }

  // ── Step 6: Layout engine ────────────────────────────────────
  function calculatePlayerWidth() {
    const vw = document.documentElement.clientWidth;
    playerWidth = Math.round(vw * playerWidthPercent);
    playerWidth = Math.max(320, Math.min(playerWidth, Math.round(vw * 0.85)));
  }

  let isApplyingLayout = false;

  function applyLayout() {
    if (isApplyingLayout) return;
    isApplyingLayout = true;
    try {
    if (!isOnWatchPage || isFullscreen) { removeLayout(); return; }
    if (!isDragging) calculatePlayerWidth();

    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const gap = videoGap ? DIVIDER_WIDTH : 0;
    const sidebarLeft = playerWidth + gap + GRAB_BAR_WIDTH;
    const sidebarWidth = vw - sidebarLeft - SIDEBAR_PADDING;
    const sidebarTop = HEADER_HEIGHT + TAB_BAR_HEIGHT;

    document.body.setAttribute("ytsp-active", "");

    // Build the CSS — player gets no explicit top; it's computed below
    styleEl.textContent = buildCSS(playerWidth, sidebarLeft, sidebarWidth, sidebarTop);

    // Signal YouTube to recalculate control positions (scrubber, chapters,
    // clip markers, volume, etc.). YouTube's player JS listens for window
    // resize and updates inline widths on .ytp-chrome-bottom and related
    // elements. Without this, those inline widths stay at their init-time
    // values even though the player's actual width has changed, causing
    // sub-elements (scrubber thumb, clip markers, etc.) to desync.
    window.dispatchEvent(new Event("resize"));

    // Measure the player and vertically center it in the available space
    const playerEl = document.querySelector("#player.ytd-watch-flexy");
    if (playerEl) {
      const ph = playerEl.offsetHeight;
      const availableH = vh - HEADER_HEIGHT;
      const top = HEADER_HEIGHT + Math.max(0, (availableH - ph) / 2);
      playerEl.style.top = top + "px";
    }

    // Position the resize bar and tab bar
    resizeBarEl.style.left = playerWidth + gap + "px";
    tabBarEl.style.left = sidebarLeft + "px";
    tabBarEl.style.width = sidebarWidth + SIDEBAR_PADDING + "px";

    applyTabVisibility(activeTab);
    } finally { isApplyingLayout = false; }
  }

  function buildCSS(pw, sidebarLeft, sidebarWidth, sidebarTop) {
    const h = HEADER_HEIGHT;

    let css = `
      /* ═══ PLAYER: fixed left column ════════════════════════════
         Strategy: resize only the outermost #player.ytd-watch-flexy.
         Everything inside (container-outer → container-inner →
         movie_player → controls) keeps its natural YouTube layout.
         The aspect ratio set by YouTube's inline padding-bottom on
         #player-container-inner determines the player height — no
         explicit height overrides needed.  This means YouTube's JS
         reads real offsetWidth/offsetHeight on all sub-elements and
         positions controls, scrubber, chapters, clip markers etc.
         correctly on every frame, with no desync.                    */
      #player.ytd-watch-flexy {
        position: fixed !important;
        left: 0 !important;
        width: ${pw}px !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
        z-index: 100 !important;
      }
      #player-container-outer.ytd-watch-flexy {
        max-width: none !important;
        min-width: 0 !important;
      }
      /* Theater mode */
      ytd-watch-flexy[theater] #player-theater-container {
        position: fixed !important;
        left: 0 !important;
        width: ${pw}px !important;
        height: auto !important;
        min-height: 0 !important;
        max-width: none !important;
        margin: 0 !important;
        z-index: 100 !important;
      }

      /* ═══ COLUMNS layout: block so primary/secondary stack ═════ */
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
        margin-left: ${sidebarLeft}px !important;
      }
      #secondary.ytd-watch-flexy {
        max-width: none !important;
        margin: 0 !important;
        padding: 0 !important;
        min-width: 0 !important;
      }
      #secondary-inner.ytd-watch-flexy {
        margin-left: ${sidebarLeft}px !important;
        padding: 0 ${SIDEBAR_PADDING}px !important;
        max-width: ${sidebarWidth}px !important;
      }
    `;

    const isBelowTab = BELOW_TABS.has(activeTab);

    if (isBelowTab) {
      css += `
        /* ═══ BELOW TABS (description / comments) ══════════════════ */
        #below.ytd-watch-flexy {
          position: fixed !important;
          left: ${sidebarLeft}px !important;
          top: ${sidebarTop}px !important;
          width: ${sidebarWidth}px !important;
          height: calc(100vh - ${sidebarTop}px) !important;
          overflow-y: auto !important;
          z-index: 50 !important;
          background: var(--yt-spec-general-background-a, #0f0f0f) !important;
          padding: 0 ${SIDEBAR_PADDING}px !important;
          box-sizing: border-box !important;
        }
        #secondary-inner.ytd-watch-flexy {
          display: none !important;
        }
      `;
      if (activeTab === "description") {
        css += `
          /* Auto-expand description text */
          ytd-text-inline-expander { --ytd-expander-collapsed-height: none !important; }
          #description-inner { max-height: none !important; overflow: visible !important; }
          ytd-expander.ytd-video-secondary-info-renderer { --ytd-expander-collapsed-height: none !important; }
        `;
      }
    } else {
      css += `
        /* ═══ SECONDARY TABS ════════════════════════════════════════ */
        #below.ytd-watch-flexy {
          display: none !important;
        }
        #secondary-inner.ytd-watch-flexy {
          display: block !important;
          position: fixed !important;
          left: ${sidebarLeft}px !important;
          top: ${sidebarTop}px !important;
          width: ${sidebarWidth + SIDEBAR_PADDING}px !important;
          height: calc(100vh - ${sidebarTop}px) !important;
          overflow-y: auto !important;
          z-index: 50 !important;
          background: var(--yt-spec-general-background-a, #0f0f0f) !important;
          padding: 0 ${SIDEBAR_PADDING}px !important;
          margin-left: 0 !important;
          max-width: none !important;
        }
      `;

      if (activeTab === "chapters" || activeTab === "ask") {
        css += `
          /* ═══ ${activeTab.toUpperCase()} TAB: Position #panels over the sidebar ═══ */
          #panels.ytd-watch-flexy,
          ytd-engagement-panel-section-list-renderer#panels {
            display: block !important;
            position: fixed !important;
            left: ${sidebarLeft}px !important;
            top: ${sidebarTop}px !important;
            width: ${sidebarWidth + SIDEBAR_PADDING}px !important;
            height: calc(100vh - ${sidebarTop}px) !important;
            overflow-y: auto !important;
            z-index: 60 !important;
            background: var(--yt-spec-general-background-a, #0f0f0f) !important;
            padding: 0 ${SIDEBAR_PADDING}px !important;
          }

          /* Make engagement panel children fill the full sidebar height */
          #panels.ytd-watch-flexy > ytd-engagement-panel-section-list-renderer,
          ytd-engagement-panel-section-list-renderer#panels > ytd-engagement-panel-section-list-renderer,
          #panels.ytd-watch-flexy ytd-engagement-panel-section-list-renderer[visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"],
          #panels.ytd-watch-flexy ytd-engagement-panel-section-list-renderer:not([style*="display: none"]) {
            height: 100% !important;
            max-height: 100% !important;
          }

          /* Stretch the panel's internal structure to fill available space */
          #panels.ytd-watch-flexy ytd-engagement-panel-section-list-renderer #header {
            flex-shrink: 0 !important;
          }

          #panels.ytd-watch-flexy ytd-engagement-panel-section-list-renderer #content,
          #panels.ytd-watch-flexy ytd-engagement-panel-section-list-renderer #body {
            flex: 1 !important;
            min-height: 0 !important;
            overflow-y: auto !important;
          }

          /* Ask panel: make conversation area stretch to fill */
          #panels.ytd-watch-flexy ytd-engagement-panel-section-list-renderer ytd-conversation-section-renderer,
          #panels.ytd-watch-flexy ytd-engagement-panel-section-list-renderer ytd-ask-promo-renderer {
            height: 100% !important;
            min-height: 0 !important;
          }

          /* Flex layout for panel internals */
          #panels.ytd-watch-flexy ytd-engagement-panel-section-list-renderer[data-ytsp-visible] {
            display: flex !important;
            flex-direction: column !important;
          }
        `;
      }

      if (activeTab === "ycs") {
        css += `
          /* ═══ YCS TAB: YouTube Comment Search extension ════════════ */
          /* Make #secondary-inner fill the sidebar area for YCS content */
          #secondary-inner.ytd-watch-flexy {
            overflow-y: auto !important;
          }

          /* The YCS extension mounts a shadow DOM host element with id
             plasmo-yck-root-sidebar at the start of #secondary-inner.
             Make it fill the entire sidebar. */
          #secondary-inner.ytd-watch-flexy > #plasmo-yck-root-sidebar,
          #secondary-inner.ytd-watch-flexy > [id^="plasmo-yck-root-"] {
            display: block !important;
            width: 100% !important;
            min-height: calc(100vh - ${sidebarTop}px) !important;
            max-height: none !important;
            overflow: visible !important;
          }

          /* Ensure the shadow container inside fills available space */
          #secondary-inner.ytd-watch-flexy > #plasmo-yck-root-sidebar > *,
          #secondary-inner.ytd-watch-flexy > [id^="plasmo-yck-root-"] > * {
            min-height: calc(100vh - ${sidebarTop}px) !important;
          }

          /* Ensure the plasmo shadow container stretches */
          #plasmo-shadow-container {
            min-height: calc(100vh - ${sidebarTop}px) !important;
          }
        `;
      }

      if (activeTab === "chat") {
        const chatH = `calc(100vh - ${sidebarTop}px)`;
        css += `
          /* Chat: no scroll on the container — the iframe handles its own scroll */
          #secondary-inner.ytd-watch-flexy {
            overflow-y: hidden !important;
            padding: 0 !important;
          }
          #secondary-inner.ytd-watch-flexy ytd-live-chat-frame,
          #secondary-inner.ytd-watch-flexy #chat {
            display: block !important;
            width: 100% !important;
            height: ${chatH} !important;
            max-height: none !important;
            min-height: 0 !important;
          }
          #secondary-inner.ytd-watch-flexy ytd-live-chat-frame iframe,
          #secondary-inner.ytd-watch-flexy #chatframe {
            display: block !important;
            width: 100% !important;
            height: ${chatH} !important;
            max-height: none !important;
            min-height: 0 !important;
            border: none !important;
          }
        `;
      }
    }

    return css;
  }

  // ── Show / hide #below and #secondary-inner children per tab ──
  function applyTabVisibility(tab) {
    const below = document.querySelector("#below.ytd-watch-flexy");
    if (below) {
      const children = Array.from(below.children);
      if (tab === "description") {
        children.forEach((child) => {
          const hasMeta = child.querySelector("ytd-watch-metadata");
          child.style.display = (hasMeta || child.id === "alerts") ? "" : "none";
        });
      } else if (tab === "comments") {
        children.forEach((child) => {
          const hasComments = child.querySelector("#comments");
          child.style.display = hasComments ? "" : "none";
        });
      } else {
        children.forEach((child) => { child.style.display = ""; });
      }
    }

    const secondaryInner = document.querySelector("#secondary-inner.ytd-watch-flexy");
    if (!secondaryInner) return;
    const siChildren = Array.from(secondaryInner.children);

    const panelsContainer = getPanelsContainer();
    const panelChildren = panelsContainer ? Array.from(panelsContainer.children) : [];

    if (tab === "related") {
      panelChildren.forEach((c) => {
        c.style.display = "none";
        c.removeAttribute("data-ytsp-visible");
      });
      siChildren.forEach((c) => {
        c.style.display = c.id === "related" ? "" : "none";
      });
    } else if (tab === "playlist") {
      panelChildren.forEach((c) => {
        c.style.display = "none";
        c.removeAttribute("data-ytsp-visible");
      });
      siChildren.forEach((c) => {
        const isPlaylist = c.id === "playlist" || c.tagName === "YTD-PLAYLIST-PANEL-RENDERER"
          || c.querySelector("ytd-playlist-panel-renderer");
        c.style.display = isPlaylist ? "" : "none";
      });
    } else if (tab === "chat") {
      panelChildren.forEach((c) => {
        c.style.display = "none";
        c.removeAttribute("data-ytsp-visible");
      });
      siChildren.forEach((c) => {
        const isChat = c.id === "chat" || c.tagName === "YTD-LIVE-CHAT-FRAME"
          || c.querySelector("ytd-live-chat-frame");
        c.style.display = isChat ? "" : "none";
      });
    } else if (tab === "ycs") {
      // YCS tab: Show the YouTube Comment Search extension UI.
      // The YCS extension (by Plasmo) mounts a shadow DOM element
      // with id "plasmo-yck-root-sidebar" at the start of #secondary-inner.
      // We hide all other #secondary-inner children except this element,
      // and hide engagement panels too.
      panelChildren.forEach((c) => {
        c.style.display = "none";
        c.removeAttribute("data-ytsp-visible");
      });
      siChildren.forEach((c) => {
        const isYcsRoot = c.id === "plasmo-yck-root-sidebar" ||
                          c.id?.startsWith("plasmo-yck-root-");
        c.style.display = isYcsRoot ? "" : "none";
      });
    } else if (tab === "chapters") {
      siChildren.forEach((c) => { c.style.display = "none"; });

      panelChildren.forEach((c) => {
        if (isChapterPanel(c)) {
          c.style.display = "flex";
          c.style.flexDirection = "column";
          c.setAttribute("data-ytsp-visible", "");
          c.removeAttribute("hidden");
          c.style.visibility = "visible";
          c.setAttribute("visibility", "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED");
        } else {
          c.style.display = "none";
          c.removeAttribute("data-ytsp-visible");
        }
      });

      if (!panelChildren.some(isChapterPanel)) {
        const chapterTitle = document.querySelector(".ytp-chapter-title.ytp.button");
        if (chapterTitle) chapterTitle.click();
      }
    } else if (tab === "ask") {
      siChildren.forEach((c) => { c.style.display = "none"; });

      panelChildren.forEach((c) => {
        if (isAskPanel(c)) {
          c.style.display = "flex";
          c.style.flexDirection = "column";
          c.setAttribute("data-ytsp-visible", "");
          c.removeAttribute("hidden");
          c.style.visibility = "visible";
          c.setAttribute("visibility", "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED");
        } else {
          c.style.display = "none";
          c.removeAttribute("data-ytsp-visible");
        }
      });

      if (!panelChildren.some(isAskPanel)) {
        const askBtn = findAskButton();
        if (askBtn) askBtn.click();
      }
    } else {
      siChildren.forEach((c) => { c.style.display = ""; });

      panelChildren.forEach((c) => {
        c.style.display = "";
        c.style.flexDirection = "";
        c.style.visibility = "";
        c.removeAttribute("data-ytsp-visible");
      });
    }
  }

  // ── Remove layout (non-watch pages / fullscreen) ─────────────
  function removeLayout() {
    document.body.removeAttribute("ytsp-active");
    if (styleEl) styleEl.textContent = "";

    const below = document.querySelector("#below.ytd-watch-flexy");
    if (below) Array.from(below.children).forEach((c) => { c.style.display = ""; });

    const si = document.querySelector("#secondary-inner.ytd-watch-flexy");
    if (si) Array.from(si.children).forEach((c) => { c.style.display = ""; });

    const panels = getPanelsContainer();
    if (panels) {
      Array.from(panels.children).forEach((c) => {
        c.style.display = "";
        c.style.flexDirection = "";
        c.style.visibility = "";
        c.removeAttribute("data-ytsp-visible");
      });
    }

    tabBarEl.style.left = "";
    tabBarEl.style.width = "";
    resizeBarEl.style.left = "";
  }

  // ── Step 8: MutationObserver for DOM changes ─────────────────
  // Keeps re-applying the layout as YouTube mutates the DOM.
  // YouTube frequently updates the DOM (e.g., loading comments,
  // expanding descriptions, toggling panels) which can reset our
  // CSS overrides. This observer ensures our layout persists.
  function startDomObserver() {
    if (domObserver) stopDomObserver();

    domObserver = new MutationObserver(() => {
      if (!isOnWatchPage || isFullscreen) return;
      clearTimeout(domObserver._timer);
      domObserver._timer = setTimeout(() => {
        if (isOnWatchPage && !isFullscreen) {
          applyLayout();
        }
      }, 300);
    });

    const watchFlexy = document.querySelector("ytd-watch-flexy");
    if (watchFlexy) {
      domObserver.observe(watchFlexy, {
        childList: true,
        subtree: true,
      });
    }
  }

  function stopDomObserver() {
    if (domObserver) {
      domObserver.disconnect();
      domObserver = null;
    }
  }

  // ── Fullscreen Detection ─────────────────────────────────────
  function setupFullscreenListener() {
    document.addEventListener("fullscreenchange", () => {
      const wasFs = isFullscreen;
      isFullscreen = !!document.fullscreenElement;
      if (wasFs !== isFullscreen) {
        if (isFullscreen) {
          removeLayout();
        } else if (isOnWatchPage) {
          setTimeout(() => applyLayout(), 300);
        }
      }
    });
  }

  // ── Resize handle ─────────────────────────────────────────────
  function onResizeStart(e) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    dragStartX = e.clientX;
    dragStartWidth = playerWidth;
    resizeBarEl.classList.add("dragging");
    resizeBarEl.setPointerCapture(e.pointerId);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  }

  function onResizeMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    const delta = e.clientX - dragStartX;
    const vw = document.documentElement.clientWidth;
    playerWidth = Math.max(300, Math.min(dragStartWidth + delta, Math.round(vw * 0.85)));
    applyLayout();
  }

  function onResizeEnd(e) {
    if (!isDragging) return;
    isDragging = false;
    try { resizeBarEl.releasePointerCapture(e.pointerId); } catch (_) {}
    resizeBarEl.classList.remove("dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    saveWidth();
  }

  // ── Window resize ─────────────────────────────────────────────
  function listenForWindowResize() {
    window.addEventListener("resize", () => {
      if (isOnWatchPage) applyLayout();
    });
  }

  // ── Utility: wait for an element in the DOM ───────────────────
  function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve) => {
      const result = selector();
      if (result) return resolve(result);
      let done = false;
      const observer = new MutationObserver(() => {
        const r = selector();
        if (r && !done) { done = true; observer.disconnect(); resolve(r); }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => {
        if (!done) { done = true; observer.disconnect(); resolve(null); }
      }, timeout);
    });
  }
})();

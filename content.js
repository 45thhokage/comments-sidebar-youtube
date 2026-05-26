/**
 * Comments Sidebar for YouTube - Content Script
 * Rewritten for current YouTube DOM structure
 *
 * YouTube DOM structure (as of 2025):
 *   #columns
 *     #primary
 *       #primary-inner
 *         #player → #player-container-outer → ... → #movie_player
 *         #below
 *           div.box → ytd-watch-metadata (title, description, chapters, ask button)
 *           div.box → ytd-comments#comments
 *     #secondary
 *       #secondary-inner
 *         #panels → ytd-engagement-panel-section-list-renderer (chapters, ask, etc.)
 *         #playlist  (or ytd-playlist-panel-renderer)
 *         #chat  → ytd-live-chat-frame (live streams)
 *         #related
 *
 * Tab categories:
 *   - Below tabs (description, comments): show #below fixed in sidebar
 *   - Secondary tabs (related, playlist, chat): show #secondary-inner fixed in sidebar
 *   - Panel tabs (chapters, ask): show #panels fixed in sidebar with specific panel visible
 */

(function () {
  "use strict";

  // ---- State ----
  let extensionEnabled = true;
  let isOnWatchPage = false;
  let isFullscreen = false;
  let activeTab = "comments";
  let playerWidthPercent = 0.5;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartWidth = 0;
  let playerWidth = 0;

  const scrollPositions = {
    description: 0,
    comments: 0,
    chapters: 0,
    related: 0,
    playlist: 0,
    chat: 0,
    ask: 0,
  };

  // ---- Constants ----
  const HEADER_HEIGHT = 56;
  const DIVIDER_WIDTH = 6;
  const TAB_BAR_HEIGHT = 36;
  const SIDEBAR_PADDING = 8;

  // ---- DOM refs ----
  let warcApp = null;
  let tabHeadings = null;
  let tabScrollContainer = null;
  let scrollLeftBtn = null;
  let scrollRightBtn = null;
  let resizeBar = null;
  let styleEl = null;
  let observer = null;
  let nativeButtonObserver = null;

  // ---- Init ----
  init();

  function init() {
    loadExtensionState().then(() => {
      createUI();
      injectMainScript();
      setupNavigationListener();
      setupMessageListener();
      setupFullscreenListener();
      setupWindowResize();
      setupNativeButtonInterceptors();
      setupEngagementPanelObserver();
      checkWatchPage();
    });
  }

  // ---- Storage ----
  function getStorageData(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (items) => {
        if (chrome.runtime.lastError) {
          resolve(undefined);
        } else {
          resolve(items[key]);
        }
      });
    });
  }

  async function loadExtensionState() {
    extensionEnabled = (await getStorageData("extensionEnabled")) ?? true;
    playerWidthPercent = (await getStorageData("playerWidthPercent")) ?? 0.5;
  }

  function savePlayerWidth() {
    const vw = document.documentElement.clientWidth;
    if (vw > 0) {
      playerWidthPercent = playerWidth / vw;
      chrome.storage.local.set({ playerWidthPercent: playerWidthPercent });
    }
  }

  // ---- UI Creation ----
  function createUI() {
    warcApp = document.createElement("div");
    warcApp.id = "warc-app";

    // Tab bar wrapper: includes scroll buttons + tab container
    const tabBarWrapper = document.createElement("div");
    tabBarWrapper.id = "warc-tab-bar-wrapper";

    // Left scroll button
    scrollLeftBtn = document.createElement("button");
    scrollLeftBtn.id = "warc-scroll-left";
    scrollLeftBtn.innerHTML = "&#9664;"; // ◀
    scrollLeftBtn.title = "Scroll tabs left";
    scrollLeftBtn.addEventListener("click", () => scrollTabBar(-1));
    scrollLeftBtn.addEventListener("pointerdown", (e) => e.stopPropagation());

    // Scrollable tab container
    tabScrollContainer = document.createElement("div");
    tabScrollContainer.id = "warc-tab-scroll-container";

    tabHeadings = document.createElement("div");
    tabHeadings.id = "warc-tab-headings";

    const tabs = ["description", "comments", "chapters", "ask", "related", "playlist", "chat"];
    tabs.forEach((tab) => {
      const btn = document.createElement("button");
      btn.textContent = tab;
      btn.dataset.tab = tab;
      if (tab === activeTab) btn.classList.add("active");
      btn.addEventListener("click", () => switchTab(tab));
      tabHeadings.appendChild(btn);
    });

    tabScrollContainer.appendChild(tabHeadings);

    // Right scroll button
    scrollRightBtn = document.createElement("button");
    scrollRightBtn.id = "warc-scroll-right";
    scrollRightBtn.innerHTML = "&#9654;"; // ▶
    scrollRightBtn.title = "Scroll tabs right";
    scrollRightBtn.addEventListener("click", () => scrollTabBar(1));
    scrollRightBtn.addEventListener("pointerdown", (e) => e.stopPropagation());

    tabBarWrapper.appendChild(scrollLeftBtn);
    tabBarWrapper.appendChild(tabScrollContainer);
    tabBarWrapper.appendChild(scrollRightBtn);

    resizeBar = document.createElement("div");
    resizeBar.id = "warc-resize-bar";
    const resizeInner = document.createElement("div");
    resizeBar.appendChild(resizeInner);

    resizeBar.addEventListener("pointerdown", onResizeStart);
    resizeBar.addEventListener("pointermove", onResizeMove);
    resizeBar.addEventListener("pointerup", onResizeEnd);
    resizeBar.addEventListener("lostpointercapture", onResizeEnd);

    warcApp.appendChild(tabBarWrapper);
    warcApp.appendChild(resizeBar);
    document.body.appendChild(warcApp);

    styleEl = document.createElement("style");
    styleEl.id = "warc-dynamic-styles";
    document.head.appendChild(styleEl);

    // Update scroll button visibility
    updateScrollButtons();
    tabScrollContainer.addEventListener("scroll", updateScrollButtons);
  }

  /**
   * Scroll the tab bar by one tab width in the given direction.
   * direction: -1 for left, +1 for right
   */
  function scrollTabBar(direction) {
    if (!tabScrollContainer) return;
    const scrollAmount = 120;
    tabScrollContainer.scrollBy({ left: direction * scrollAmount, behavior: "smooth" });
  }

  /**
   * Show/hide scroll arrows based on scroll position and overflow.
   */
  function updateScrollButtons() {
    if (!tabScrollContainer || !scrollLeftBtn || !scrollRightBtn) return;
    const el = tabScrollContainer;
    const canScrollLeft = el.scrollLeft > 2;
    const canScrollRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    scrollLeftBtn.style.display = canScrollLeft ? "flex" : "none";
    scrollRightBtn.style.display = canScrollRight ? "flex" : "none";
  }

  // ---- Tab Switching ----
  function switchTab(tab) {
    scrollPositions[activeTab] = window.scrollY;
    activeTab = tab;

    tabHeadings.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });

    // Scroll the active tab into view in the tab bar
    const activeBtn = tabHeadings.querySelector('button[data-tab="' + tab + '"]');
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }

    // For ask tab, auto-activate the engagement panel if it's not open yet
    if (tab === "ask") {
      tryActivateAskPanel();
    }

    // For chapters tab, auto-activate the chapters engagement panel if available
    if (tab === "chapters") {
      tryActivateChaptersPanel();
    }

    // For description tab, auto-expand the description
    if (tab === "description") {
      setTimeout(autoExpandDescription, 200);
    }

    applyLayout();
    restoreScroll(tab);
  }

  function restoreScroll(tab) {
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollPositions[tab] || 0);
    });
  }

  /**
   * Auto-expand the description by clicking the "Show more" button.
   */
  function autoExpandDescription() {
    const below = document.querySelector("#below.ytd-watch-flexy");
    if (!below) return;

    // Try multiple selectors for YouTube's "Show more" / expand button
    const expandSelectors = [
      "#description-inner #expand",
      "ytd-text-inline-expander #expand",
      "ytd-expander #expand",
      "tp-yt-paper-button#more",
      "#description ytd-expander #expand",
      "ytd-video-secondary-info-renderer #expand",
      "ytd-expand-button-renderer button",
    ];

    for (const sel of expandSelectors) {
      const btn = below.querySelector(sel);
      if (btn) {
        // Check if it's actually collapsed (expand button visible, not collapse)
        const isCollapsed = btn.offsetParent !== null;
        if (isCollapsed) {
          console.log("[WARC] Auto-expanding description via:", sel);
          btn.click();
        }
        return;
      }
    }

    // Fallback: look for any button with "more" or "show more" text
    const allButtons = below.querySelectorAll("button, tp-yt-paper-button");
    for (const btn of allButtons) {
      const text = (btn.textContent || "").trim().toLowerCase();
      const ariaLabel = (btn.getAttribute("aria-label") || "").toLowerCase();
      if ((text.includes("more") || ariaLabel.includes("more")) &&
          (text.includes("show") || ariaLabel.includes("show") || text === "more" || ariaLabel.includes("expand"))) {
        console.log("[WARC] Auto-expanding description via text match");
        btn.click();
        return;
      }
    }
  }

  /**
   * Try to programmatically open YouTube's "Ask" engagement panel
   * by clicking the Ask button in the action bar.
   */
  function tryActivateAskPanel() {
    // Check if an ask panel already exists and is visible
    const panelsContainer = getPanelsContainer();
    if (panelsContainer) {
      const panelChildren = Array.from(panelsContainer.children);
      for (const child of panelChildren) {
        if (isAskPanel(child) && child.style.display !== "none") return;
      }
    }

    // Look for the Ask button anywhere on the page
    const askBtn = findAskButton();
    if (askBtn) {
      console.log("[WARC] Clicking Ask button to activate panel");
      askBtn.click();
    }
  }

  /**
   * Try to programmatically open YouTube's chapters engagement panel
   * by clicking the chapter title in the video player.
   */
  function tryActivateChaptersPanel() {
    // Check if a chapters panel already exists and is visible
    const panelsContainer = getPanelsContainer();
    if (panelsContainer) {
      const panelChildren = Array.from(panelsContainer.children);
      for (const child of panelChildren) {
        if (isChapterPanel(child) && child.style.display !== "none") return;
      }
    }

    // Try clicking the chapter title in the player controls
    const chapterBtn = document.querySelector(".ytp-chapter-title.ytp-button");
    if (chapterBtn) {
      console.log("[WARC] Clicking chapter title in player to activate panel");
      chapterBtn.click();
      return;
    }
  }

  /**
   * Find YouTube's native Ask button on the page.
   */
  function findAskButton() {
    // Try the most specific selectors first
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

    // Fallback: look for any button containing "Ask" text in the action bar area
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

    // Last resort: search all buttons on page
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

  // ---- Panels Container & Panel Detection (from v2 approach) ----

  function getPanelsContainer() {
    return document.querySelector("#panels.ytd-watch-flexy") ||
           document.querySelector("ytd-engagement-panel-section-list-renderer#panels");
  }

  function isChapterPanel(el) {
    const text = (
      el?.getAttribute("target-id") ||
      el?.getAttribute("panel-target-id") ||
      el?.id ||
      ""
    ).toLowerCase();

    return text.includes("chapter") ||
           text.includes("macro-markers") ||
           text.includes("key moments");
  }

  function isAskPanel(el) {
    const text = (
      el?.getAttribute("target-id") ||
      el?.getAttribute("panel-target-id") ||
      el?.getAttribute("identifier") ||
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
      text.includes("payouchat")
    );
    // Note: intentionally NOT including "chat" here to avoid matching live chat
  }

  // ---- Native Button Interceptors ----
  /**
   * Set up click interception on YouTube's native buttons.
   * When the user clicks YouTube's "Chapters" or "Ask" button,
   * we switch to the corresponding extension tab.
   */
  function setupNativeButtonInterceptors() {
    // Use event delegation on the document body so we catch dynamically added buttons
    document.addEventListener("click", onNativeButtonClick, true); // capture phase
  }

  /**
   * Handle clicks on YouTube's native buttons.
   */
  function onNativeButtonClick(e) {
    if (!isOnWatchPage || !extensionEnabled) return;

    const target = e.target;

    // Check if the click is on the Ask button
    if (isAskButtonClick(target)) {
      console.log("[WARC] Native Ask button clicked, switching to ask tab");
      setTimeout(() => {
        switchTab("ask");
      }, 100);
      return;
    }

    // Check if the click is on the Chapters button
    if (isChaptersButtonClick(target)) {
      console.log("[WARC] Native Chapters button clicked, switching to chapters tab");
      setTimeout(() => {
        switchTab("chapters");
      }, 100);
      return;
    }
  }

  /**
   * Check if a click target is the YouTube Ask button.
   */
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

  /**
   * Check if a click target is the YouTube Chapters button.
   */
  function isChaptersButtonClick(target) {
    let el = target;
    while (el && el !== document.body) {
      // 1. Chapter title button in the video player controls
      if (el.classList && el.classList.contains("ytp-chapter-title") && el.classList.contains("ytp-button")) {
        return true;
      }

      // 2. Check for chapter-related elements in the description area
      if (el.tagName === "YTD-MACRO-MARKERS-LIST-ITEM-RENDERER" ||
          el.tagName === "YTD-HORIZONTAL-CARD-LIST-RENDERER") {
        return true;
      }

      // 3. "View all chapters" type buttons/links
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

  // ---- Engagement Panel Observer ----
  /**
   * Observe engagement panel visibility changes. When YouTube opens
   * a chapters or ask panel natively, we detect it and switch tabs.
   */
  function setupEngagementPanelObserver() {
    nativeButtonObserver = new MutationObserver((mutations) => {
      if (!isOnWatchPage || !extensionEnabled) return;

      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.attributeName === "visibility") {
          const panel = mutation.target;
          if (panel.tagName === "YTD-ENGAGEMENT-PANEL-SECTION-LIST-RENDERER") {
            const visibility = panel.getAttribute("visibility");
            if (visibility === "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED") {
              if (isAskPanel(panel)) {
                console.log("[WARC] Ask engagement panel opened natively, switching to ask tab");
                if (activeTab !== "ask") {
                  switchTab("ask");
                }
              } else if (isChapterPanel(panel)) {
                console.log("[WARC] Chapters engagement panel opened natively, switching to chapters tab");
                if (activeTab !== "chapters") {
                  switchTab("chapters");
                }
              }
            }
          }
        }
      }
    });

    // Observe the whole body for attribute changes on engagement panels
    nativeButtonObserver.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ["visibility"],
    });
  }

  // ---- Layout Engine ----
  function calculatePlayerWidth() {
    const vw = document.documentElement.clientWidth;
    playerWidth = Math.round(vw * playerWidthPercent);
    playerWidth = Math.max(300, Math.min(playerWidth, Math.round(vw * 0.85)));
  }

  function applyLayout() {
    if (!isOnWatchPage || !extensionEnabled || isFullscreen) {
      removeLayout();
      return;
    }

    if (!isDragging) {
      calculatePlayerWidth();
    }

    const vw = document.documentElement.clientWidth;
    const sidebarLeft = playerWidth + DIVIDER_WIDTH;
    const sidebarWidth = vw - sidebarLeft - SIDEBAR_PADDING;

    document.body.setAttribute("warc-active", "");

    // Position tab bar wrapper in the sidebar area
    const tabBarWrapper = document.getElementById("warc-tab-bar-wrapper");
    if (tabBarWrapper) {
      tabBarWrapper.style.left = sidebarLeft + "px";
      tabBarWrapper.style.width = sidebarWidth + SIDEBAR_PADDING + "px";
    }

    // Position resize bar at the edge of the player
    resizeBar.style.left = playerWidth + "px";

    // ---- Build CSS ----
    let css = "";

    // 1. Player: fixed on the left
    css += `
      /* ===== FIXED PLAYER ===== */
      #player.ytd-watch-flexy {
        position: fixed !important;
        left: 0 !important;
        top: ${HEADER_HEIGHT}px !important;
        width: ${playerWidth}px !important;
        height: calc(100vh - ${HEADER_HEIGHT}px) !important;
        z-index: 100 !important;
      }

      #player-container-outer.ytd-watch-flexy {
        width: ${playerWidth}px !important;
        height: calc(100vh - ${HEADER_HEIGHT}px) !important;
        max-width: none !important;
        min-width: 0 !important;
      }

      #player-container-inner {
        padding-bottom: 0 !important;
        width: ${playerWidth}px !important;
        height: calc(100vh - ${HEADER_HEIGHT}px) !important;
      }

      #player-container {
        width: ${playerWidth}px !important;
        height: calc(100vh - ${HEADER_HEIGHT}px) !important;
      }

      #movie_player {
        width: ${playerWidth}px !important;
        height: calc(100vh - ${HEADER_HEIGHT}px) !important;
      }

      .html5-video-container {
        width: ${playerWidth}px !important;
        height: calc(100vh - ${HEADER_HEIGHT}px) !important;
      }

      .html5-video-container video {
        width: ${playerWidth}px !important;
        height: calc(100vh - ${HEADER_HEIGHT}px) !important;
        object-fit: contain !important;
        left: 0 !important;
        top: 0 !important;
      }

      /* Theater mode: same fixed positioning */
      ytd-watch-flexy[theater] #player-theater-container {
        position: fixed !important;
        left: 0 !important;
        top: ${HEADER_HEIGHT}px !important;
        width: ${playerWidth}px !important;
        height: calc(100vh - ${HEADER_HEIGHT}px) !important;
        max-width: none !important;
        margin: 0 !important;
        z-index: 100 !important;
      }
    `;

    // 2. Columns: block layout
    css += `
      /* ===== COLUMNS: BLOCK LAYOUT ===== */
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
        margin-top: 0 !important;
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

    // 3. Tab-specific visibility
    css += getTabCSS(activeTab, sidebarLeft, sidebarWidth);

    styleEl.textContent = css;

    // 4. JS-based show/hide for children
    applyBelowVisibility(activeTab);

    // 5. Update scroll buttons
    setTimeout(updateScrollButtons, 50);

    // Notify injected script
    dispatchPlayerSizeUpdate();
  }

  function getTabCSS(tab, sidebarLeft, sidebarWidth) {
    let css = "";
    const sidebarTop = HEADER_HEIGHT + TAB_BAR_HEIGHT;

    const isBelowTab = tab === "description" || tab === "comments";
    const isSecondaryTab = tab === "related" || tab === "playlist" || tab === "chat" || tab === "chapters" || tab === "ask";

    if (isBelowTab) {
      css += `
        /* ===== ${tab.toUpperCase()} TAB: Show #below in sidebar ===== */
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
        }

        #secondary-inner.ytd-watch-flexy {
          display: none !important;
        }
      `;

      if (tab === "description") {
        css += `
          /* Expand description */
          ytd-text-inline-expander {
            --ytd-expander-collapsed-height: none !important;
          }
          #description-inner {
            max-height: none !important;
            overflow: visible !important;
          }
          ytd-expander.ytd-video-secondary-info-renderer {
            --ytd-expander-collapsed-height: none !important;
          }
        `;
      }
    } else if (isSecondaryTab) {
      css += `
        /* ===== ${tab.toUpperCase()} TAB: Show #secondary-inner in sidebar ===== */
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

      // For chapters and ask tabs: position the #panels container on top
      // of #secondary-inner so engagement panels show in the sidebar
      if (tab === "chapters" || tab === "ask") {
        css += `
          /* Position #panels over the sidebar for ${tab} tab */
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

          /* Flex layout for panel internals — only applied via JS to visible panel */
          #panels.ytd-watch-flexy ytd-engagement-panel-section-list-renderer[data-warc-visible] {
            display: flex !important;
            flex-direction: column !important;
          }
        `;
      }

      // Chat-specific: ensure the live chat iframe fills the sidebar
      if (tab === "chat") {
        css += `
          /* Make live chat iframe fill the sidebar */
          #secondary-inner.ytd-watch-flexy ytd-live-chat-frame,
          #secondary-inner.ytd-watch-flexy #chat,
          #secondary-inner.ytd-watch-flexy #chat-container {
            width: 100% !important;
            height: 100% !important;
            min-height: 400px !important;
          }
          #secondary-inner.ytd-watch-flexy ytd-live-chat-frame iframe {
            width: 100% !important;
            height: 100% !important;
            min-height: 400px !important;
          }
        `;
      }
    }

    return css;
  }

  // ---- Element Detection Helpers ----

  function isChatElement(child) {
    if (child.id === "chat") return true;
    if (child.id === "chat-container") return true;
    if (child.tagName === "YTD-LIVE-CHAT-FRAME") return true;
    if (child.querySelector("ytd-live-chat-frame")) return true;
    if (child.querySelector("iframe[id='chatframe']")) return true;
    return false;
  }

  function isPlaylistElement(child) {
    if (child.id === "playlist") return true;
    if (child.tagName === "YTD-PLAYLIST-PANEL-RENDERER") return true;
    if (child.querySelector("ytd-playlist-panel-renderer")) return true;
    return false;
  }

  // ---- Visibility Management ----

  /**
   * Use JavaScript to show/hide direct children of #below and #secondary-inner.
   */
  function applyBelowVisibility(tab) {
    const below = document.querySelector("#below.ytd-watch-flexy");
    if (below) {
      const children = Array.from(below.children);

      if (tab === "description") {
        children.forEach((child) => {
          const hasMetadata = child.querySelector("ytd-watch-metadata");
          const isMetaBox = child.classList.contains("box") && hasMetadata;
          if (isMetaBox || child.id === "alerts" || child.id === "messages") {
            child.style.display = "";
          } else {
            child.style.display = "none";
          }
        });
      } else if (tab === "comments") {
        children.forEach((child) => {
          const hasComments = child.querySelector("#comments");
          const isCommentBox = child.classList.contains("box") && hasComments;
          if (isCommentBox) {
            child.style.display = "";
          } else {
            child.style.display = "none";
          }
        });
        const comments = below.querySelector("#comments");
        if (comments) {
          comments.style.display = "";
        }
      } else {
        // For non-below tabs, restore all children
        children.forEach((child) => {
          child.style.display = "";
        });
      }
    }

    // For secondary-inner tabs, show/hide children
    const secondaryInner = document.querySelector("#secondary-inner.ytd-watch-flexy");
    if (!secondaryInner) return;

    const siChildren = Array.from(secondaryInner.children);

    // Get panels container children for chapters/ask tabs
    const panelsContainer = getPanelsContainer();
    const panelChildren = panelsContainer ? Array.from(panelsContainer.children) : [];

    if (tab === "chapters") {
      // For chapters: hide all secondary-inner children, show only chapter panels
      siChildren.forEach((child) => {
        child.style.display = "none";
      });

      panelChildren.forEach((child) => {
        if (isChapterPanel(child)) {
          child.style.display = "flex";
          child.style.flexDirection = "column";
          child.setAttribute("data-warc-visible", "");
          child.removeAttribute("hidden");
          child.style.visibility = "visible";
          child.setAttribute("visibility", "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED");
        } else {
          child.style.display = "none";
          child.removeAttribute("data-warc-visible");
        }
      });
    } else if (tab === "ask") {
      // For ask: hide all secondary-inner children, show only ask panels
      siChildren.forEach((child) => {
        child.style.display = "none";
      });

      panelChildren.forEach((child) => {
        if (isAskPanel(child)) {
          child.style.display = "flex";
          child.style.flexDirection = "column";
          child.setAttribute("data-warc-visible", "");
          child.removeAttribute("hidden");
          child.style.visibility = "visible";
          child.setAttribute("visibility", "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED");
        } else {
          child.style.display = "none";
          child.removeAttribute("data-warc-visible");
        }
      });
    } else if (tab === "related") {
      // Hide panels when on related tab
      panelChildren.forEach((child) => {
        child.style.display = "none";
        child.removeAttribute("data-warc-visible");
      });

      siChildren.forEach((child) => {
        if (child.id === "related") {
          child.style.display = "";
        } else {
          child.style.display = "none";
        }
      });
    } else if (tab === "playlist") {
      panelChildren.forEach((child) => {
        child.style.display = "none";
        child.removeAttribute("data-warc-visible");
      });

      siChildren.forEach((child) => {
        if (isPlaylistElement(child)) {
          child.style.display = "";
        } else {
          child.style.display = "none";
        }
      });
    } else if (tab === "chat") {
      panelChildren.forEach((child) => {
        child.style.display = "none";
        child.removeAttribute("data-warc-visible");
      });

      siChildren.forEach((child) => {
        if (isChatElement(child)) {
          child.style.display = "";
        } else {
          child.style.display = "none";
        }
      });
    } else {
      // For below tabs (description/comments), restore all secondary-inner children
      // (they're hidden via CSS display:none on the parent)
      siChildren.forEach((child) => {
        child.style.display = "";
      });

      // Also restore all panels
      panelChildren.forEach((child) => {
        child.style.display = "";
        child.style.flexDirection = "";
        child.removeAttribute("data-warc-visible");
      });
    }
  }

  function removeLayout() {
    document.body.removeAttribute("warc-active");

    if (styleEl) {
      styleEl.textContent = "";
    }

    // Restore #below children visibility
    const below = document.querySelector("#below.ytd-watch-flexy");
    if (below) {
      Array.from(below.children).forEach((child) => {
        child.style.display = "";
      });
    }

    // Restore #secondary-inner children visibility
    const secondaryInner = document.querySelector("#secondary-inner.ytd-watch-flexy");
    if (secondaryInner) {
      Array.from(secondaryInner.children).forEach((child) => {
        child.style.display = "";
      });
    }

    // Restore engagement panels
    const panelsContainer = getPanelsContainer();
    if (panelsContainer) {
      Array.from(panelsContainer.children).forEach((child) => {
        child.style.display = "";
        child.style.flexDirection = "";
        child.style.visibility = "";
        child.removeAttribute("data-warc-visible");
      });
    }

    const tabBarWrapper = document.getElementById("warc-tab-bar-wrapper");
    if (tabBarWrapper) {
      tabBarWrapper.style.left = "";
      tabBarWrapper.style.width = "";
    }
    if (resizeBar) {
      resizeBar.style.left = "";
    }
  }

  // ---- Resize Handling ----
  function onResizeStart(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    dragStartX = e.clientX;
    dragStartWidth = playerWidth;
    resizeBar.classList.add("dragging");
    resizeBar.setPointerCapture(e.pointerId);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    document.body.style.webkitUserSelect = "none";
    console.log("[WARC] Resize start, width:", playerWidth);
  }

  function onResizeMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    const delta = e.clientX - dragStartX;
    const newWidth = dragStartWidth + delta;
    const vw = document.documentElement.clientWidth;
    playerWidth = Math.max(300, Math.min(newWidth, Math.round(vw * 0.85)));
    applyLayout();
  }

  function onResizeEnd(e) {
    if (!isDragging) return;
    isDragging = false;
    if (e.pointerId !== undefined) {
      try { resizeBar.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    resizeBar.classList.remove("dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    document.body.style.webkitUserSelect = "";
    savePlayerWidth();
    dispatchPlayerSizeUpdate();
    console.log("[WARC] Resize end, width:", playerWidth);
  }

  function dispatchPlayerSizeUpdate() {
    window.dispatchEvent(new CustomEvent("warc-player-size-update"));
  }

  // ---- Injected Script ----
  function injectMainScript() {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("inject.js");
    (document.head || document.documentElement).appendChild(s);
  }

  // ---- Navigation Detection ----
  function setupNavigationListener() {
    document.body.addEventListener("yt-navigate-finish", () => {
      checkWatchPage();
    });

    document.addEventListener("yt-page-data-updated", () => {
      if (isOnWatchPage && extensionEnabled) {
        setTimeout(() => applyLayout(), 500);
      }
    });
  }

  function checkWatchPage() {
    isOnWatchPage = window.location.href.includes("/watch");

    if (isOnWatchPage && extensionEnabled) {
      waitForElement("ytd-watch-flexy").then(() => {
        setTimeout(() => {
          applyLayout();
          startObserver();
        }, 800);
      });
    } else {
      removeLayout();
      stopObserver();
    }
  }

  // ---- MutationObserver ----
  function startObserver() {
    if (observer) stopObserver();

    observer = new MutationObserver(() => {
      if (!isOnWatchPage || !extensionEnabled || isFullscreen) return;
      clearTimeout(observer._timer);
      observer._timer = setTimeout(() => {
        if (isOnWatchPage && extensionEnabled && !isFullscreen) {
          applyLayout();
        }
      }, 300);
    });

    const watchFlexy = document.querySelector("ytd-watch-flexy");
    if (watchFlexy) {
      observer.observe(watchFlexy, {
        childList: true,
        subtree: true,
      });
    }
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  // ---- Fullscreen Detection ----
  function setupFullscreenListener() {
    document.addEventListener("fullscreenchange", () => {
      const wasFs = isFullscreen;
      isFullscreen = !!document.fullscreenElement;
      if (wasFs !== isFullscreen) {
        if (isFullscreen) {
          removeLayout();
        } else if (isOnWatchPage && extensionEnabled) {
          setTimeout(() => applyLayout(), 300);
        }
      }
    });
  }

  // ---- Message Handling ----
  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.hasOwnProperty("extensionEnabled")) {
        extensionEnabled = msg.extensionEnabled;
        if (extensionEnabled && isOnWatchPage) {
          applyLayout();
        } else {
          removeLayout();
        }
      }
      if (msg.message === "reset-divider") {
        playerWidthPercent = 0.5;
        calculatePlayerWidth();
        applyLayout();
        savePlayerWidth();
        dispatchPlayerSizeUpdate();
      }
    });
  }

  // ---- Window Resize ----
  function setupWindowResize() {
    let timer;
    window.addEventListener("resize", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (isOnWatchPage && extensionEnabled && !isFullscreen) {
          calculatePlayerWidth();
          applyLayout();
          dispatchPlayerSizeUpdate();
        }
      }, 250);
    });
  }

  // ---- Utility ----
  function waitForElement(selector, timeout = 15000) {
    return new Promise((resolve) => {
      const el = document.querySelector(selector);
      if (el) {
        resolve(el);
        return;
      }
      const obs = new MutationObserver((_, o) => {
        const el = document.querySelector(selector);
        if (el) {
          o.disconnect();
          resolve(el);
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        obs.disconnect();
        resolve(document.querySelector(selector));
      }, timeout);
    });
  }
})();

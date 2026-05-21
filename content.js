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
 *           div.box → ytd-watch-metadata (title, description, etc.)
 *           div.box → ytd-comments#comments
 *     #secondary
 *       #secondary-inner
 *         #panels
 *         #playlist  (or ytd-playlist-panel-renderer)
 *         #chat  → ytd-live-chat-frame (live streams)
 *         #related
 *
 * Strategy:
 *   1. Fix the player on the left (position: fixed)
 *   2. For description/comments tabs: fix #below in the sidebar area, hide #secondary-inner
 *   3. For related/playlist/chat tabs: hide #below, show #secondary-inner in sidebar area
 *   4. Use JS-based tab switching for reliable show/hide of #below children
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
    related: 0,
    playlist: 0,
    chat: 0,
  };

  // ---- Constants ----
  const HEADER_HEIGHT = 56;
  const DIVIDER_WIDTH = 6;
  const TAB_BAR_HEIGHT = 36;
  const SIDEBAR_PADDING = 8;

  // ---- DOM refs ----
  let warcApp = null;
  let tabHeadings = null;
  let resizeBar = null;
  let styleEl = null;
  let observer = null;

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
    // Container: fixed, zero-size, pointer-events:none so it never blocks clicks
    warcApp = document.createElement("div");
    warcApp.id = "warc-app";

    tabHeadings = document.createElement("div");
    tabHeadings.id = "warc-tab-headings";

    const tabs = ["description", "comments", "related", "playlist", "chat"];
    tabs.forEach((tab) => {
      const btn = document.createElement("button");
      btn.textContent = tab;
      btn.dataset.tab = tab;
      if (tab === activeTab) btn.classList.add("active");
      btn.addEventListener("click", () => switchTab(tab));
      tabHeadings.appendChild(btn);
    });

    resizeBar = document.createElement("div");
    resizeBar.id = "warc-resize-bar";
    const resizeInner = document.createElement("div");
    resizeBar.appendChild(resizeInner);

    // Use pointer events for reliable drag (works with mouse, touch, pen)
    // All three listeners go on resizeBar because setPointerCapture redirects
    // move/up events to the element that captured the pointer
    resizeBar.addEventListener("pointerdown", onResizeStart);
    resizeBar.addEventListener("pointermove", onResizeMove);
    resizeBar.addEventListener("pointerup", onResizeEnd);
    resizeBar.addEventListener("lostpointercapture", onResizeEnd);

    warcApp.appendChild(tabHeadings);
    warcApp.appendChild(resizeBar);
    document.body.appendChild(warcApp);

    styleEl = document.createElement("style");
    styleEl.id = "warc-dynamic-styles";
    document.head.appendChild(styleEl);
  }

  // ---- Tab Switching ----
  function switchTab(tab) {
    scrollPositions[activeTab] = window.scrollY;
    activeTab = tab;

    tabHeadings.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });

    applyLayout();
    restoreScroll(tab);
  }

  function restoreScroll(tab) {
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollPositions[tab] || 0);
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

    // Only recalculate from saved percentage when NOT dragging.
    // During drag, playerWidth is set directly by onResizeMove,
    // and calling calculatePlayerWidth() would overwrite it with
    // the old percentage-based value, killing the drag.
    if (!isDragging) {
      calculatePlayerWidth();
    }

    const vw = document.documentElement.clientWidth;
    const sidebarLeft = playerWidth + DIVIDER_WIDTH;
    const sidebarWidth = vw - sidebarLeft - SIDEBAR_PADDING;

    document.body.setAttribute("warc-active", "");

    // Position tab headings in the sidebar area
    tabHeadings.style.left = sidebarLeft + "px";
    tabHeadings.style.width = sidebarWidth + SIDEBAR_PADDING + "px";

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

    // 2. Columns: block layout so #below content can be pushed right
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

    // Notify injected script
    dispatchPlayerSizeUpdate();
  }

  function getTabCSS(tab, sidebarLeft, sidebarWidth) {
    let css = "";
    const sidebarTop = HEADER_HEIGHT + TAB_BAR_HEIGHT;

    const isBelowTab = tab === "description" || tab === "comments";
    const isSecondaryTab = tab === "related" || tab === "playlist" || tab === "chat";

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

  /**
   * Check if an element is the chat element for a YouTube live stream.
   * YouTube uses different structures:
   *   - ytd-live-chat-frame#chat (most common for live streams)
   *   - #chat-container (some layouts)
   *   - ytd-live-chat-frame without id
   */
  function isChatElement(child) {
    if (child.id === "chat") return true;
    if (child.id === "chat-container") return true;
    if (child.tagName === "YTD-LIVE-CHAT-FRAME") return true;
    if (child.querySelector("ytd-live-chat-frame")) return true;
    if (child.querySelector("iframe[id='chatframe']")) return true;
    return false;
  }

  /**
   * Check if an element is the playlist element.
   */
  function isPlaylistElement(child) {
    if (child.id === "playlist") return true;
    if (child.tagName === "YTD-PLAYLIST-PANEL-RENDERER") return true;
    if (child.querySelector("ytd-playlist-panel-renderer")) return true;
    return false;
  }

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

    if (tab === "related") {
      siChildren.forEach((child) => {
        if (child.id === "related") {
          child.style.display = "";
        } else {
          child.style.display = "none";
        }
      });
    } else if (tab === "playlist") {
      siChildren.forEach((child) => {
        if (isPlaylistElement(child)) {
          child.style.display = "";
        } else {
          child.style.display = "none";
        }
      });
    } else if (tab === "chat") {
      siChildren.forEach((child) => {
        if (isChatElement(child)) {
          child.style.display = "";
        } else {
          child.style.display = "none";
        }
      });
    } else {
      // For below tabs, restore all secondary-inner children
      // (they're hidden via CSS display:none on the parent)
      siChildren.forEach((child) => {
        child.style.display = "";
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

    if (tabHeadings) {
      tabHeadings.style.left = "";
      tabHeadings.style.width = "";
    }
    if (resizeBar) {
      resizeBar.style.left = "";
    }
  }

  // ---- Resize Handling ----
  function onResizeStart(e) {
    if (e.button !== 0) return; // Only left click
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    dragStartX = e.clientX;
    dragStartWidth = playerWidth;
    resizeBar.classList.add("dragging");

    // Capture pointer so we get move/up events even if cursor leaves the bar
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

/**
 * panels.js — YouTube engagement panel detection helpers
 *
  * YouTube's engagement panels (Ask, Chapters, Transcript) live inside
  * ytd-engagement-panel-section-list-renderer#panels and have various
  * attributes that identify their type.  These helpers abstract away
  * the brittle attribute sniffing.
 */
(function () {
  "use strict";

  var YTSP = window.YTSP;

  function readPanelId(element) {
    return (
      element.getAttribute("target-id") ||
      element.getAttribute("panel-target-id") ||
      element.getAttribute("panel-identifier") ||
      element.id ||
      ""
    ).toLowerCase();
  }

  function readAskPanelId(element) {
    // Ask panels use their own "identifier" attribute (not panel-identifier)
    return (
      element.getAttribute("target-id") ||
      element.getAttribute("panel-target-id") ||
      element.getAttribute("identifier") ||
      element.getAttribute("panel-identifier") ||
      element.id ||
      ""
    ).toLowerCase();
  }

  function walkUp(element, tagNames, testFn) {
    while (element && element !== document.body) {
      if (tagNames.indexOf(element.tagName) !== -1 && testFn(element)) return true;
      element = element.parentElement;
    }
    return false;
  }

  YTSP.getPanelsContainer = function () {
    return document.querySelector("#panels.ytd-watch-flexy") ||
           document.querySelector("ytd-engagement-panel-section-list-renderer#panels");
  };

  YTSP.isChapterPanel = function (element) {
    if (!element) return false;
    var text = readPanelId(element);
    var type = (element.getAttribute("panel-type") || "").toLowerCase();
    return text.includes("chapter") ||
           text.includes("macro-markers") ||
           text.includes("key moments") ||
           type.includes("chapter") ||
           !!element.querySelector("ytd-macro-markers-list-renderer");
  };

  YTSP.isAskPanel = function (element) {
    if (!element) return false;
    // Prefer structural signal over loose id substrings (bare "ai" matched
    // unrelated tokens like "available", "campaign", etc.).
    if (element.querySelector("ytd-conversation-section-renderer, ytd-ask-promo-renderer")) {
      return true;
    }
    var text = readAskPanelId(element);
    return text.includes("ask") ||
           text.includes("conversation") ||
           text.includes("qna") ||
           text.includes("payouchat") ||
           // Delimiter-aware whole-token match for "ai" only (not substring of other words)
           /(^|[-_:.])ai($|[-_:.])/.test(text) ||
           text.includes("summary") ||
           text.includes("summarize");
  };

  YTSP.findAskButton = function () {
    var askSelectors = [
      'button[aria-label="Ask"]',
      'button[aria-label*="Ask"]',
      'yt-button-shape button[aria-label*="Ask"]',
      'yt-button-view-model button[aria-label*="Ask"]',
      'ytd-button-renderer button[aria-label*="Ask"]',
      'ytd-toggle-button-renderer button[aria-label*="Ask"]',
      'button-view-model button[aria-label*="Ask"]',
    ];
    for (var i = 0; i < askSelectors.length; i++) {
      var button = document.querySelector(askSelectors[i]);
      if (button) return button;
    }
    var allButtons = document.querySelectorAll("button");
    for (var j = 0; j < allButtons.length; j++) {
      var text = (allButtons[j].textContent || "").trim().toLowerCase();
      var ariaLabel = (allButtons[j].getAttribute("aria-label") || "").toLowerCase();
      if (text === "ask" || ariaLabel === "ask") return allButtons[j];
    }
    return null;
  };

  YTSP.isAskButtonClick = function (target) {
    return walkUp(target, ["BUTTON", "YT-BUTTON-SHAPE", "YT-BUTTON-VIEW-MODEL"], function (element) {
      var ariaLabel = (element.getAttribute("aria-label") || "").toLowerCase();
      var text = (element.textContent || "").trim().toLowerCase();
      return ariaLabel === "ask" || ariaLabel.includes("ask about this video") || text === "ask";
    });
  };

  YTSP.isChaptersButtonClick = function (target) {
    return walkUp(target, ["BUTTON", "A", "YTD-MACRO-MARKERS-LIST-ITEM-RENDERER", "YTD-HORIZONTAL-CARD-LIST-RENDERER"], function (element) {
      if (element.classList && element.classList.contains("ytp-chapter-title") && element.classList.contains("ytp-button")) return true;
      if (element.tagName === "YTD-MACRO-MARKERS-LIST-ITEM-RENDERER" || element.tagName === "YTD-HORIZONTAL-CARD-LIST-RENDERER") return true;
      var ariaLabel = (element.getAttribute("aria-label") || "").toLowerCase();
      var text = (element.textContent || "").trim().toLowerCase();
      return ariaLabel.includes("chapter") || (text.includes("view all") && text.includes("chapter"));
    });
  };

  YTSP.tryActivateAskPanel = function () {
    var container = YTSP.getPanelsContainer();
    if (container) {
      var children = Array.from(container.children);
      for (var i = 0; i < children.length; i++) {
        if (YTSP.isAskPanel(children[i]) && children[i].style.display !== "none") return;
      }
    }
    var button = YTSP.findAskButton();
    if (button) button.click();
  };

  YTSP.tryActivateChaptersPanel = function () {
    var container = YTSP.getPanelsContainer();
    if (container) {
      var children = Array.from(container.children);
      for (var i = 0; i < children.length; i++) {
        if (YTSP.isChapterPanel(children[i]) && children[i].style.display !== "none") return;
      }
    }
    var chapterButton = document.querySelector(".ytp-chapter-title.ytp-button");
    if (chapterButton) chapterButton.click();
  };

  YTSP.isTranscriptPanel = function (element) {
    if (!element) return false;
    if (element.querySelector(
      "ytd-transcript-renderer, ytd-transcript-search-panel-renderer, ytd-transcript-body-renderer, ytd-transcript-segment-list-renderer"
    )) {
      return true;
    }
    var text = readPanelId(element);
    var type = (element.getAttribute("panel-type") || "").toLowerCase();
    return text.includes("transcript") ||
           text.includes("searchable-transcript") ||
           type.includes("transcript");
  };

  /** True only when YouTube has actually fetched segment rows (not an empty shell). */
  YTSP.transcriptPanelHasContent = function (element) {
    var roots = [];
    if (element) {
      roots.push(element);
    } else {
      var container = YTSP.getPanelsContainer();
      if (container) {
        Array.from(container.children).forEach(function (child) {
          if (YTSP.isTranscriptPanel(child)) roots.push(child);
        });
      }
      if (!roots.length) {
        var loose = document.querySelector(
          "ytd-transcript-renderer, ytd-transcript-search-panel-renderer, ytd-transcript-body-renderer"
        );
        if (loose) roots.push(loose);
      }
    }
    for (var i = 0; i < roots.length; i++) {
      var root = roots[i];
      if (root.querySelector(
        "ytd-transcript-segment-renderer, ytd-transcript-segment-list-renderer ytd-transcript-segment-renderer"
      )) {
        return true;
      }
      var texts = root.querySelectorAll(
        "ytd-transcript-segment-list-renderer, ytd-transcript-body-renderer, #segments-container"
      );
      for (var t = 0; t < texts.length; t++) {
        if ((texts[t].textContent || "").trim().length > 20) return true;
      }
    }
    return false;
  };

  /** Structural transcript chrome (search / body) without requiring segments yet. */
  YTSP.transcriptPanelHasStructure = function (element) {
    if (!element) return false;
    return !!element.querySelector(
      "ytd-transcript-renderer, ytd-transcript-search-panel-renderer, ytd-transcript-body-renderer, ytd-transcript-segment-list-renderer"
    );
  };

  /**
   * YouTube often keeps several engagement-panel shells that all match
   * isTranscriptPanel (empty placeholder + searchable + loaded). Showing every
   * match stacks full-height panels and looks like infinite empty loading.
   * Prefer the panel that actually has segments, then structure, then id hints.
   */
  YTSP.pickBestTranscriptPanel = function (matches) {
    if (!matches || !matches.length) return null;
    if (matches.length === 1) return matches[0];

    var i;
    for (i = 0; i < matches.length; i++) {
      if (YTSP.transcriptPanelHasContent(matches[i])) return matches[i];
    }
    for (i = 0; i < matches.length; i++) {
      if (YTSP.transcriptPanelHasStructure(matches[i])) return matches[i];
    }
    for (i = 0; i < matches.length; i++) {
      var id = readPanelId(matches[i]);
      if (id.indexOf("searchable-transcript") !== -1 || id.indexOf("engagement-panel-searchable-transcript") !== -1) {
        return matches[i];
      }
    }
    return matches[0];
  };

  function isShowTranscriptLabel(text, ariaLabel) {
    text = (text || "").trim().toLowerCase();
    ariaLabel = (ariaLabel || "").toLowerCase();
    if (text.includes("hide transcript") || ariaLabel.includes("hide transcript")) return false;
    if (text.includes("download") || ariaLabel.includes("download")) return false;
    return text.includes("show transcript") ||
           text === "transcript" ||
           ariaLabel.includes("show transcript") ||
           (ariaLabel.includes("transcript") && !ariaLabel.includes("hide"));
  }

  YTSP.findTranscriptButton = function () {
    var allButtons = document.querySelectorAll("button, tp-yt-paper-button");
    for (var j = 0; j < allButtons.length; j++) {
      var text = allButtons[j].textContent || "";
      var ariaLabel = allButtons[j].getAttribute("aria-label") || "";
      if (isShowTranscriptLabel(text, ariaLabel)) return allButtons[j];
    }
    return null;
  };

  YTSP.isTranscriptButtonClick = function (target) {
    return walkUp(target, ["BUTTON", "YT-BUTTON-SHAPE", "YT-BUTTON-VIEW-MODEL", "TP-YT-PAPER-BUTTON"], function (element) {
      var ariaLabel = (element.getAttribute("aria-label") || "").toLowerCase();
      var text = (element.textContent || "").trim().toLowerCase();
      if (ariaLabel.includes("download") || text.includes("download")) return false;
      return text.includes("show transcript") ||
             text.includes("hide transcript") ||
             text === "transcript" ||
             ariaLabel.includes("transcript");
    });
  };

  // ── Transcript activation ────────────────────────────────────────────
  // YouTube only fetches transcript segments after the native "Show transcript"
  // control is clicked. Empty engagement-panel shells often already exist, and
  // applyTabVisibility's showPanel() force-sets EXPANDED on them for layout —
  // that is NOT the same as YouTube having opened the panel. Treating EXPANDED
  // as success made retries bail out without ever clicking, leaving a spinner.
  //
  // Rules:
  //  1. Click the native button at most once per open (user or programmatic).
  //  2. Never re-click just because the shell looks expanded.
  //  3. Expand description once, keep #below parked until the button is found
  //     or we time out (expand is async; a single 350ms shot is too brittle).
  var transcriptActivateLock = false;
  var transcriptActivateTimer = null;
  var transcriptNativeClickIssued = false;
  var transcriptPark = null;
  var transcriptButtonObserver = null;

  var EXPAND_SELECTORS = [
    "#description-inner #expand",
    "ytd-text-inline-expander #expand",
    "ytd-expander #expand",
    "tp-yt-paper-button#more",
    "#description ytd-expander #expand",
    "ytd-video-secondary-info-renderer #expand",
    "ytd-expand-button-renderer button",
    "ytd-text-inline-expander tp-yt-paper-button[class*='more']",
  ];

  function clearTranscriptTimer() {
    if (transcriptActivateTimer) {
      clearTimeout(transcriptActivateTimer);
      transcriptActivateTimer = null;
    }
  }

  function disconnectTranscriptButtonObserver() {
    if (transcriptButtonObserver) {
      transcriptButtonObserver.disconnect();
      transcriptButtonObserver = null;
    }
  }

  function restoreParkedBelow() {
    if (!transcriptPark) return;
    var park = transcriptPark;
    transcriptPark = null;
    var below = park.below;
    if (!below) return;
    if (park.savedBelowStyle === null) below.removeAttribute("style");
    else below.setAttribute("style", park.savedBelowStyle);
    park.savedChildren.forEach(function (item) {
      item.el.style.display = item.display;
    });
  }

  function stillOnTranscriptTab() {
    return !!(YTSP.state && YTSP.state.activeTab === "transcript");
  }

  /**
   * Temporarily park #below off-screen so Polymer can render the description
   * expander while the transcript tab has #below display:none via layout CSS.
   * Kept until we click or give up — restoring early aborts the expand render.
   */
  function parkBelowForTranscriptClick() {
    if (transcriptPark) return transcriptPark.below || document;

    var below = document.querySelector("#below.ytd-watch-flexy, #below");
    var savedBelowStyle = below ? below.getAttribute("style") : null;
    var savedChildren = [];

    if (below) {
      Array.from(below.children).forEach(function (child) {
        savedChildren.push({ el: child, display: child.style.display });
        if (child.querySelector("ytd-watch-metadata") || child.id === "alerts") {
          child.style.display = "";
        }
      });
      below.style.setProperty("display", "block", "important");
      below.style.setProperty("visibility", "visible", "important");
      below.style.setProperty("pointer-events", "auto", "important");
      below.style.setProperty("position", "fixed", "important");
      below.style.setProperty("left", "-10000px", "important");
      below.style.setProperty("top", "0", "important");
      below.style.setProperty("width", "480px", "important");
      below.style.setProperty("height", "auto", "important");
      below.style.setProperty("max-height", "none", "important");
      below.style.setProperty("overflow", "visible", "important");
      below.style.setProperty("opacity", "0", "important");
      below.style.setProperty("z-index", "0", "important");
    }

    transcriptPark = {
      below: below,
      savedBelowStyle: savedBelowStyle,
      savedChildren: savedChildren,
    };
    return below || document;
  }

  function expandDescriptionForTranscript(root) {
    if (YTSP.findTranscriptButton()) return;
    for (var i = 0; i < EXPAND_SELECTORS.length; i++) {
      var expandBtn = root.querySelector(EXPAND_SELECTORS[i]);
      if (expandBtn) {
        expandBtn.click();
        return;
      }
    }
  }

  function clickShowTranscriptButton(button) {
    // Ignore our synthetic click in the native-button interceptor.
    YTSP._transcriptProgrammaticClick = true;
    try {
      button.click();
    } finally {
      // Capture listeners run sync; clear on next tick for bubble-phase leftovers.
      setTimeout(function () { YTSP._transcriptProgrammaticClick = false; }, 0);
    }
    transcriptNativeClickIssued = true;
  }

  function markActivationSettled(holdMs) {
    disconnectTranscriptButtonObserver();
    clearTranscriptTimer();
    restoreParkedBelow();
    transcriptActivateLock = true;
    transcriptActivateTimer = setTimeout(function () {
      transcriptActivateLock = false;
      transcriptActivateTimer = null;
    }, holdMs || 2500);
  }

  function abandonActivation() {
    disconnectTranscriptButtonObserver();
    clearTranscriptTimer();
    restoreParkedBelow();
    transcriptActivateLock = false;
  }

  /** @return {boolean} true if the native button was found and clicked */
  function tryClickShowTranscriptNow() {
    if (transcriptNativeClickIssued) return true;
    var button = YTSP.findTranscriptButton();
    if (!button) return false;
    clickShowTranscriptButton(button);
    markActivationSettled(2500);
    return true;
  }

  /**
   * Park #below, expand once, wait for "Show transcript", click once.
   * Poll is only for button presence — not full expand/restore cycles.
   */
  function startNativeTranscriptActivation() {
    transcriptActivateLock = true;
    clearTranscriptTimer();
    disconnectTranscriptButtonObserver();

    var root = parkBelowForTranscriptClick();
    expandDescriptionForTranscript(root);

    if (tryClickShowTranscriptNow()) return;

    var attempts = 0;
    var maxAttempts = 12;
    var intervalMs = 250;
    var observeRoot = (transcriptPark && transcriptPark.below) || document.body;

    if (typeof MutationObserver !== "undefined" && observeRoot) {
      transcriptButtonObserver = new MutationObserver(function () {
        if (!stillOnTranscriptTab()) {
          abandonActivation();
          return;
        }
        if (YTSP.transcriptPanelHasContent()) {
          transcriptNativeClickIssued = true;
          markActivationSettled(1500);
          return;
        }
        tryClickShowTranscriptNow();
      });
      transcriptButtonObserver.observe(observeRoot, {
        childList: true,
        subtree: true,
      });
    }

    function pollForButton() {
      transcriptActivateTimer = null;
      if (!stillOnTranscriptTab()) {
        abandonActivation();
        return;
      }
      if (YTSP.transcriptPanelHasContent()) {
        transcriptNativeClickIssued = true;
        markActivationSettled(1500);
        return;
      }
      if (transcriptNativeClickIssued) {
        markActivationSettled(2500);
        return;
      }
      if (tryClickShowTranscriptNow()) return;

      attempts += 1;
      if (attempts >= maxAttempts) {
        abandonActivation();
        return;
      }
      transcriptActivateTimer = setTimeout(pollForButton, intervalMs);
    }

    transcriptActivateTimer = setTimeout(pollForButton, intervalMs);
  }

  YTSP.tryActivateTranscriptPanel = function () {
    // Content present — nothing to do.
    if (YTSP.transcriptPanelHasContent()) {
      transcriptNativeClickIssued = true;
      disconnectTranscriptButtonObserver();
      clearTranscriptTimer();
      restoreParkedBelow();
      transcriptActivateLock = false;
      return;
    }

    // User clicked native "Show transcript" — YouTube is already fetching.
    // Do not re-click (that can toggle the panel closed).
    if (YTSP._transcriptUserOpened) {
      YTSP._transcriptUserOpened = false;
      transcriptNativeClickIssued = true;
      markActivationSettled(3000);
      return;
    }

    // Already issued the native open for this visit — wait for segments.
    if (transcriptNativeClickIssued) return;

    // Expand/wait/click sequence already running.
    if (transcriptActivateLock) return;

    // Intentionally ignore transcriptPanelIsExpanded(): showPanel() fakes it
    // on empty shells before YouTube has been asked to load content.
    startNativeTranscriptActivation();
  };

  YTSP.resetTranscriptActivation = function () {
    transcriptActivateLock = false;
    transcriptNativeClickIssued = false;
    YTSP._transcriptUserOpened = false;
    clearTranscriptTimer();
    disconnectTranscriptButtonObserver();
    restoreParkedBelow();
    YTSP._transcriptProgrammaticClick = false;
  };

})();

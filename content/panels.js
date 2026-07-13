/**
 * panels.js — YouTube engagement panel detection helpers
 *
 * YouTube's engagement panels (Ask, Chapters) live inside
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

})();

/**
 * drag.js — Resize-bar pointer handlers
 *
 * Free drag, Shift-snap (with sidebar floor), double-click → default 55%.
 */
(function () {
  "use strict";

  var YTSP = window.YTSP;
  var constants = YTSP.constants;
  var state = YTSP.state;
  var dom = YTSP.dom;

  var lastClickTime = 0;
  var dragMoved = false;

  function clampPlayerWidth(width, viewportWidth) {
    var maxW = typeof YTSP.maxPlayerWidthForViewport === "function"
      ? YTSP.maxPlayerWidthForViewport(viewportWidth)
      : Math.round(viewportWidth * 0.85);
    var minW = Math.max(constants.MIN_PLAYER_WIDTH, 300);
    return Math.max(minW, Math.min(width, maxW));
  }

  function snapPlayerWidth(width, viewportWidth) {
    var fracs = constants.SNAP_WIDTH_FRACS || [0.5, 0.55, 0.6];
    var maxW = typeof YTSP.maxPlayerWidthForViewport === "function"
      ? YTSP.maxPlayerWidthForViewport(viewportWidth)
      : viewportWidth;
    var best = width;
    var bestDist = Infinity;
    for (var i = 0; i < fracs.length; i++) {
      var candidate = Math.round(viewportWidth * fracs[i]);
      if (candidate > maxW) candidate = maxW;
      if (candidate < constants.MIN_PLAYER_WIDTH) continue;
      var dist = Math.abs(candidate - width);
      if (dist < bestDist) {
        bestDist = dist;
        best = candidate;
      }
    }
    return clampPlayerWidth(best, viewportWidth);
  }

  /** Double-click / explicit reset to default split (55%). */
  YTSP.resetPlayerWidthToDefault = function (animate) {
    var viewportWidth = document.documentElement.clientWidth;
    state.playerWidthPercent = constants.DEFAULT_PLAYER_WIDTH_FRAC;
    state.playerWidth = clampPlayerWidth(
      Math.round(viewportWidth * state.playerWidthPercent),
      viewportWidth
    );
    state.playerWidthPercent = viewportWidth > 0 ? state.playerWidth / viewportWidth : state.playerWidthPercent;
    if (typeof YTSP.applyLayout === "function") {
      YTSP.applyLayout({ animate: animate !== false });
    }
    return YTSP.saveWidth();
  };

  YTSP.onResizeStart = function (event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (typeof YTSP.isExtensionEnabled === "function" && !YTSP.isExtensionEnabled()) return;

    event.preventDefault();
    event.stopPropagation();
    dragMoved = false;
    state.isDragging = true;
    state.dragStartX = event.clientX;
    state.dragStartWidth = state.playerWidth;
    if (typeof YTSP.setLayoutAnimating === "function") YTSP.setLayoutAnimating(false);
    dom.resizeBar.classList.add("dragging");
    dom.resizeBar.classList.remove("snapping");
    try { dom.resizeBar.setPointerCapture(event.pointerId); } catch (_) {}
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  };

  YTSP.onResizeMove = function (event) {
    if (!state.isDragging) return;
    event.preventDefault();
    var delta = event.clientX - state.dragStartX;
    if (Math.abs(delta) > 3) dragMoved = true;
    var viewportWidth = document.documentElement.clientWidth;
    var next = state.dragStartWidth + delta;
    if (event.shiftKey) {
      next = snapPlayerWidth(next, viewportWidth);
      dom.resizeBar.classList.add("snapping");
    } else {
      next = clampPlayerWidth(next, viewportWidth);
      dom.resizeBar.classList.remove("snapping");
    }
    state.playerWidth = next;
    if (viewportWidth > 0) state.playerWidthPercent = state.playerWidth / viewportWidth;
    YTSP.applyLayout();
  };

  YTSP.onResizeEnd = function (event) {
    if (!state.isDragging) return;
    state.isDragging = false;
    try { dom.resizeBar.releasePointerCapture(event.pointerId); } catch (_) {}
    dom.resizeBar.classList.remove("dragging");
    dom.resizeBar.classList.remove("snapping");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";

    // Double-click detection (two quick pointerups without meaningful drag)
    var now = Date.now();
    if (!dragMoved && now - lastClickTime < 350) {
      lastClickTime = 0;
      YTSP.resetPlayerWidthToDefault(true);
      return;
    }
    lastClickTime = dragMoved ? 0 : now;

    YTSP.saveWidth();
  };

})();

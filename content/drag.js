/**
 * drag.js — Resize-bar pointer handlers
 *
 * Handles pointer events on the resize bar to let the user drag the
 * sidebar width.  Layout is re-applied on every frame during drag,
 * and the final width is persisted to sessionStorage.
 */
(function () {
  "use strict";

  var YTSP = window.YTSP;
  var constants = YTSP.constants;
  var state = YTSP.state;
  var dom = YTSP.dom;

  YTSP.onResizeStart = function (event) {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    state.isDragging = true;
    state.dragStartX = event.clientX;
    state.dragStartWidth = state.playerWidth;
    dom.resizeBar.classList.add("dragging");
    dom.resizeBar.setPointerCapture(event.pointerId);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  };

  YTSP.onResizeMove = function (event) {
    if (!state.isDragging) return;
    event.preventDefault();
    var delta = event.clientX - state.dragStartX;
    var viewportWidth = document.documentElement.clientWidth;
    state.playerWidth = Math.max(300,
      Math.min(state.dragStartWidth + delta, Math.round(viewportWidth * constants.MAX_PLAYER_WIDTH_FRAC)));
    YTSP.applyLayout();
  };

  YTSP.onResizeEnd = function (event) {
    if (!state.isDragging) return;
    state.isDragging = false;
    try { dom.resizeBar.releasePointerCapture(event.pointerId); } catch (_) {}
    dom.resizeBar.classList.remove("dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    YTSP.saveWidth();
  };

})();

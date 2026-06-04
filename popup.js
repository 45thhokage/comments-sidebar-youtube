/* Popup script — SPA-aware */

document.addEventListener("DOMContentLoaded", () => {
  const dot = document.getElementById("status-dot");
  const label = document.getElementById("status-label");

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.url) {
      setStatus(false, "No active tab");
      return;
    }

    const url = new URL(tab.url);
    const isYouTube = url.hostname === "www.youtube.com" || url.hostname === "youtube.com";
    const isYouTubeWatch = isYouTube && (url.pathname === "/watch" || url.pathname.startsWith("/watch"));

    if (isYouTubeWatch) {
      setStatus(true, "Active — sidebar visible");
    } else if (isYouTube) {
      // Extension is injected and listening for SPA navigation
      setStatus(false, "Ready — click any video");
    } else {
      setStatus(false, "Not on YouTube");
    }
  });

  function setStatus(active, text) {
    dot.className = "dot" + (active ? " active" : "");
    label.textContent = text;
  }
});

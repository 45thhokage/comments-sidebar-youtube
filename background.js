/* Background service worker — Manifest V3 */

// On install, notify the user that the extension works across all YouTube pages
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("YouTube Side Panel installed. Works across all YouTube SPA navigations.");
  } else if (details.reason === "update") {
    console.log("YouTube Side Panel updated to SPA-aware architecture.");
  }
});

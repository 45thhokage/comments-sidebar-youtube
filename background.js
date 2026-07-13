/* Background service worker — Manifest V3 */

var STORAGE_MODE_KEY = "ytspStorageMode";
var PREFS_KEY = "ytspPrefs";

/**
 * Session mode: prefs live in chrome.storage.local (content scripts can read
 * them). Wipe ytspPrefs when the browser starts if mode !== permanent.
 * Memory (ytspMemory) is always kept until the user clears it.
 */
function clearSessionPrefsIfNeeded() {
  chrome.storage.local.get([STORAGE_MODE_KEY], function (result) {
    if (chrome.runtime.lastError) return;
    var mode = result[STORAGE_MODE_KEY] === "permanent" ? "permanent" : "session";
    if (mode === "permanent") return;
    chrome.storage.local.remove([PREFS_KEY], function () {
      void chrome.runtime.lastError;
    });
  });
}

chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === "install") {
    chrome.storage.local.set({ ytspStorageMode: "session" }, function () {
      void chrome.runtime.lastError;
    });
    console.log("YouTube Side Panel installed.");
  } else if (details.reason === "update") {
    console.log("YouTube Side Panel updated to", chrome.runtime.getManifest().version);
  }
});

chrome.runtime.onStartup.addListener(function () {
  clearSessionPrefsIfNeeded();
});

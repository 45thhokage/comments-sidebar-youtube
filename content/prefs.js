/**
 * prefs.js — Preference load/save (chrome.storage.local only)
 *
 * Schema must stay in sync with shared/prefs-lib.js:
 *   ytspStorageMode: "session" | "permanent"
 *   ytspPrefs: {
 *     enabled, playerWidthPercent, tabOrder, tabVisibility,
 *     memoryMode, minSidebarWidth, smoothResize
 *   }
 *   ytspMemory: { videos: {}, channels: {} }
 *
 * Session mode: service worker clears ytspPrefs on browser startup.
 */
(function () {
  "use strict";

  var YTSP = window.YTSP;
  var constants = YTSP.constants;
  var state = YTSP.state;

  var STORAGE_MODE_KEY = "ytspStorageMode";
  var PREFS_KEY = "ytspPrefs";
  var MEMORY_KEY = "ytspMemory";
  var LEGACY_WIDTH_KEY = constants.STORAGE_KEY;
  var MSG_PREFS_CHANGED = "ytsp-prefs-changed";
  var DEFAULT_MIN_SIDEBAR = 280;
  var MEMORY_MAX_ENTRIES = 80;

  function defaultVisibility() {
    var vis = {};
    constants.TABS.forEach(function (tab) { vis[tab] = true; });
    return vis;
  }

  function defaultPrefs() {
    return {
      enabled: true,
      playerWidthPercent: constants.DEFAULT_PLAYER_WIDTH_FRAC,
      tabOrder: constants.TABS.slice(),
      tabVisibility: defaultVisibility(),
      memoryMode: "off",
      minSidebarWidth: DEFAULT_MIN_SIDEBAR,
      smoothResize: true,
    };
  }

  YTSP.prefs = {
    STORAGE_MODE_KEY: STORAGE_MODE_KEY,
    PREFS_KEY: PREFS_KEY,
    MEMORY_KEY: MEMORY_KEY,
    MSG_PREFS_CHANGED: MSG_PREFS_CHANGED,
    DEFAULTS: defaultPrefs(),
  };

  YTSP.prefsState = {
    storageMode: "session",
    enabled: true,
    playerWidthPercent: constants.DEFAULT_PLAYER_WIDTH_FRAC,
    tabOrder: constants.TABS.slice(),
    tabVisibility: defaultVisibility(),
    memoryMode: "off",
    minSidebarWidth: DEFAULT_MIN_SIDEBAR,
    smoothResize: true,
  };

  function promisifyGet(keys) {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get(keys, function (result) {
          if (chrome.runtime.lastError) resolve({});
          else resolve(result || {});
        });
      } catch (_) {
        resolve({});
      }
    });
  }

  function promisifySet(obj) {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.set(obj, function () {
          resolve(!chrome.runtime.lastError);
        });
      } catch (_) {
        resolve(false);
      }
    });
  }

  YTSP.normalizePrefs = function (raw) {
    var defaults = defaultPrefs();
    var src = raw && typeof raw === "object" ? raw : {};

    var known = {};
    constants.TABS.forEach(function (t) { known[t] = true; });

    var order = [];
    var seen = {};
    var incomingOrder = Array.isArray(src.tabOrder) ? src.tabOrder : defaults.tabOrder;
    incomingOrder.forEach(function (tab) {
      if (known[tab] && !seen[tab]) {
        order.push(tab);
        seen[tab] = true;
      }
    });
    constants.TABS.forEach(function (tab) {
      if (!seen[tab]) order.push(tab);
    });

    var visibility = defaultVisibility();
    var srcVis = src.tabVisibility && typeof src.tabVisibility === "object" ? src.tabVisibility : {};
    order.forEach(function (tab) {
      if (typeof srcVis[tab] === "boolean") visibility[tab] = srcVis[tab];
    });
    if (!order.some(function (tab) { return visibility[tab]; })) {
      visibility[order[0]] = true;
    }

    var width = typeof src.playerWidthPercent === "number" && isFinite(src.playerWidthPercent)
      ? src.playerWidthPercent
      : defaults.playerWidthPercent;
    width = Math.max(0.15, Math.min(1, width));

    var memoryMode = src.memoryMode;
    if (memoryMode !== "video" && memoryMode !== "channel") memoryMode = "off";

    var minSidebar = typeof src.minSidebarWidth === "number" && isFinite(src.minSidebarWidth)
      ? Math.round(src.minSidebarWidth)
      : defaults.minSidebarWidth;
    minSidebar = Math.max(200, Math.min(480, minSidebar));

    return {
      enabled: src.enabled !== false,
      playerWidthPercent: width,
      tabOrder: order,
      tabVisibility: visibility,
      memoryMode: memoryMode,
      minSidebarWidth: minSidebar,
      smoothResize: src.smoothResize !== false,
    };
  };

  function applyToState(prefs, mode) {
    YTSP.prefsState.storageMode = mode === "permanent" ? "permanent" : "session";
    YTSP.prefsState.enabled = prefs.enabled !== false;
    YTSP.prefsState.playerWidthPercent = prefs.playerWidthPercent;
    YTSP.prefsState.tabOrder = prefs.tabOrder.slice();
    YTSP.prefsState.tabVisibility = Object.assign({}, prefs.tabVisibility);
    YTSP.prefsState.memoryMode = prefs.memoryMode;
    YTSP.prefsState.minSidebarWidth = prefs.minSidebarWidth;
    YTSP.prefsState.smoothResize = prefs.smoothResize !== false;
    state.playerWidthPercent = prefs.playerWidthPercent;
    state.enabled = YTSP.prefsState.enabled;
    // Reflect enable flag on chrome immediately if UI already exists
    if (state.isUIReady && YTSP.dom) {
      if (!state.enabled) {
        if (YTSP.dom.tabBar) YTSP.dom.tabBar.style.display = "none";
        if (YTSP.dom.resizeBar) YTSP.dom.resizeBar.style.display = "none";
      } else {
        if (YTSP.dom.tabBar) YTSP.dom.tabBar.style.display = "";
        if (YTSP.dom.resizeBar) YTSP.dom.resizeBar.style.display = "";
      }
    }
  }

  function prefsPayload() {
    return {
      enabled: YTSP.prefsState.enabled !== false,
      playerWidthPercent: YTSP.prefsState.playerWidthPercent,
      tabOrder: YTSP.prefsState.tabOrder.slice(),
      tabVisibility: Object.assign({}, YTSP.prefsState.tabVisibility),
      memoryMode: YTSP.prefsState.memoryMode || "off",
      minSidebarWidth: YTSP.prefsState.minSidebarWidth || DEFAULT_MIN_SIDEBAR,
      smoothResize: YTSP.prefsState.smoothResize !== false,
    };
  }

  YTSP.getVisibleTabs = function () {
    return YTSP.prefsState.tabOrder.filter(function (tab) {
      return YTSP.prefsState.tabVisibility[tab] !== false;
    });
  };

  YTSP.isTabVisible = function (tab) {
    return YTSP.prefsState.tabVisibility[tab] !== false &&
      YTSP.prefsState.tabOrder.indexOf(tab) !== -1;
  };

  YTSP.isExtensionEnabled = function () {
    return YTSP.prefsState.enabled !== false;
  };

  function migrateLegacyWidth(prefs) {
    try {
      var legacy = sessionStorage.getItem(LEGACY_WIDTH_KEY);
      if (legacy != null && legacy !== "") {
        var parsed = parseFloat(legacy);
        if (isFinite(parsed)) {
          prefs.playerWidthPercent = Math.max(0.15, Math.min(1, parsed));
        }
        sessionStorage.removeItem(LEGACY_WIDTH_KEY);
      }
    } catch (_) {}
    return prefs;
  }

  YTSP.loadPrefs = function () {
    return promisifyGet([STORAGE_MODE_KEY, PREFS_KEY]).then(function (result) {
      var mode = result[STORAGE_MODE_KEY] === "permanent" ? "permanent" : "session";
      var hadStored = !!result[PREFS_KEY];
      var prefs = YTSP.normalizePrefs(result[PREFS_KEY]);
      if (!hadStored) prefs = migrateLegacyWidth(prefs);
      applyToState(prefs, mode);
      return prefs;
    });
  };

  YTSP.savePrefs = function (partial) {
    var merged = YTSP.normalizePrefs(Object.assign(prefsPayload(), partial || {}));
    applyToState(merged, YTSP.prefsState.storageMode);
    var payload = {};
    payload[PREFS_KEY] = prefsPayload();
    return promisifySet(payload);
  };

  /** Reset tab order, visibility, and width to defaults (keeps other settings). */
  YTSP.resetLayoutPrefs = function () {
    return YTSP.savePrefs({
      tabOrder: constants.TABS.slice(),
      tabVisibility: defaultVisibility(),
      playerWidthPercent: constants.DEFAULT_PLAYER_WIDTH_FRAC,
    });
  };

  YTSP.setStorageMode = function (mode) {
    mode = mode === "permanent" ? "permanent" : "session";
    applyToState(prefsPayload(), mode);
    var obj = {};
    obj[STORAGE_MODE_KEY] = mode;
    obj[PREFS_KEY] = prefsPayload();
    return promisifySet(obj).then(function () { return mode; });
  };

  function tabsConfigChanged(prev, next) {
    if (!prev || !next) return true;
    if (prev.tabOrder.join("\0") !== next.tabOrder.join("\0")) return true;
    var keys = constants.TABS;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (!!prev.tabVisibility[k] !== !!next.tabVisibility[k]) return true;
    }
    return false;
  }

  YTSP.applyPrefsToUI = function (options) {
    if (!state.isUIReady) return;
    options = options || {};
    var rebuildTabs = options.rebuildTabs !== false;

    if (!YTSP.isExtensionEnabled()) {
      if (typeof YTSP.removeLayout === "function") YTSP.removeLayout();
      if (domHideChrome) domHideChrome(true);
      return;
    }
    if (domHideChrome) domHideChrome(false);

    if (rebuildTabs && typeof YTSP.rebuildTabBar === "function") {
      YTSP.rebuildTabBar();
    }

    var visible = YTSP.getVisibleTabs();
    if (visible.length && visible.indexOf(state.activeTab) === -1) {
      if (typeof YTSP.switchTab === "function") {
        YTSP.switchTab(visible[0], { force: true });
      } else {
        state.activeTab = visible[0];
      }
    }

    if (state.isOnWatchPage && typeof YTSP.applyLayout === "function") {
      YTSP.applyLayout({ animate: !!options.animate });
    }

    if (typeof YTSP.updateTabBarScroll === "function") {
      requestAnimationFrame(YTSP.updateTabBarScroll);
    }
  };

  var dom = YTSP.dom;
  function domHideChrome(hide) {
    if (dom.tabBar) dom.tabBar.style.display = hide ? "none" : "";
    if (dom.resizeBar) dom.resizeBar.style.display = hide ? "none" : "";
  }

  YTSP.reloadPrefsAndApply = function (forceRebuildTabs) {
    var prev = {
      tabOrder: YTSP.prefsState.tabOrder.slice(),
      tabVisibility: Object.assign({}, YTSP.prefsState.tabVisibility),
      enabled: YTSP.prefsState.enabled,
    };

    return YTSP.loadPrefs().then(function () {
      var next = {
        tabOrder: YTSP.prefsState.tabOrder,
        tabVisibility: YTSP.prefsState.tabVisibility,
        enabled: YTSP.prefsState.enabled,
      };
      var rebuild = forceRebuildTabs === true ||
        tabsConfigChanged(prev, next) ||
        prev.enabled !== next.enabled;
      YTSP.applyPrefsToUI({ rebuildTabs: rebuild, animate: true });

      if (YTSP.isExtensionEnabled() && state.isOnWatchPage && typeof YTSP.restoreMemoryForCurrentVideo === "function") {
        YTSP.restoreMemoryForCurrentVideo();
      }
    });
  };

  YTSP.setupPrefsListener = function () {
    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(function (changes, areaName) {
        if (areaName !== "local") return;
        if (!changes[STORAGE_MODE_KEY] && !changes[PREFS_KEY] && !changes[MEMORY_KEY]) return;
        // Memory-only writes shouldn't full-reload UI thrash; still ok to reload prefs
        if (changes[PREFS_KEY] || changes[STORAGE_MODE_KEY]) {
          YTSP.reloadPrefsAndApply(true);
        }
      });
    }

    if (chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
        if (!message || message.type !== MSG_PREFS_CHANGED) return;
        YTSP.reloadPrefsAndApply(true).then(function () {
          try { sendResponse({ ok: true }); } catch (_) {}
        });
        return true;
      });
    }
  };

  YTSP.loadStoredWidth = function () {
    return YTSP.loadPrefs();
  };

  YTSP.saveWidth = function () {
    var viewportWidth = document.documentElement.clientWidth;
    if (viewportWidth > 0) {
      state.playerWidthPercent = state.playerWidth / viewportWidth;
      return YTSP.savePrefs({ playerWidthPercent: state.playerWidthPercent }).then(function () {
        if (typeof YTSP.rememberCurrentLayout === "function") {
          return YTSP.rememberCurrentLayout();
        }
      });
    }
    return Promise.resolve();
  };

  // ── Per-video / per-channel memory ────────────────────────────
  // One channel = one entry under a canonical UC… id when possible.
  // @handles live in entry.aliases (not separate rows).

  function emptyMemory() {
    return { videos: {}, channels: {}, defaultProfile: null };
  }

  function applyLayoutEntry(entry) {
    if (!entry) return false;
    var width = typeof entry.playerWidthPercent === "number" ? entry.playerWidthPercent : null;
    var tab = entry.activeTab;
    var applied = false;

    if (width != null && isFinite(width)) {
      state.playerWidthPercent = Math.max(0.15, Math.min(1, width));
      YTSP.prefsState.playerWidthPercent = state.playerWidthPercent;
      applied = true;
    }

    if (tab && typeof YTSP.isTabVisible === "function" && YTSP.isTabVisible(tab)) {
      if (typeof YTSP.switchTab === "function") {
        YTSP.switchTab(tab, { force: true, skipMemory: true });
      } else {
        state.activeTab = tab;
      }
      applied = true;
    } else if (applied && state.isOnWatchPage && typeof YTSP.applyLayout === "function") {
      YTSP.applyLayout({ animate: true });
    }
    return applied;
  }

  function isUcChannelId(id) {
    return typeof id === "string" && /^UC[\w-]{20,}$/i.test(id);
  }

  function pickCanonicalChannelId(ids) {
    if (!ids || !ids.length) return null;
    for (var i = 0; i < ids.length; i++) {
      if (isUcChannelId(ids[i])) return ids[i];
    }
    return ids[0];
  }

  function mergeChannelEntries(entries) {
    var list = (entries || []).filter(Boolean);
    if (!list.length) {
      return {
        playerWidthPercent: constants.DEFAULT_PLAYER_WIDTH_FRAC,
        activeTab: "description",
        updatedAt: 0,
        label: null,
        aliases: [],
        addedManually: false,
      };
    }
    list = list.slice().sort(function (a, b) {
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
    var newest = list[0];
    var aliases = {};
    var label = null;
    var addedManually = false;
    list.forEach(function (e) {
      if (e.addedManually || e.manual) addedManually = true;
      if (!label && e.label) label = e.label;
      if (Array.isArray(e.aliases)) {
        e.aliases.forEach(function (a) { if (a) aliases[a] = true; });
      }
    });
    Object.keys(aliases).forEach(function (a) {
      if (a.charAt(0) === "@" && !label) label = a;
    });
    return {
      playerWidthPercent: typeof newest.playerWidthPercent === "number"
        ? newest.playerWidthPercent
        : constants.DEFAULT_PLAYER_WIDTH_FRAC,
      activeTab: newest.activeTab || "description",
      updatedAt: newest.updatedAt || 0,
      label: label,
      aliases: Object.keys(aliases),
      addedManually: addedManually,
    };
  }

  function consolidateChannels(channels, relatedIds) {
    var map = channels && typeof channels === "object" ? Object.assign({}, channels) : {};
    relatedIds = Array.isArray(relatedIds) ? relatedIds.filter(Boolean) : [];

    function entryAliases(key, entry) {
      var set = {};
      set[key] = true;
      if (entry && Array.isArray(entry.aliases)) {
        entry.aliases.forEach(function (a) { if (a) set[a] = true; });
      }
      return set;
    }

    if (relatedIds.length) {
      var groupKeys = {};
      relatedIds.forEach(function (id) {
        if (map[id]) groupKeys[id] = true;
      });
      Object.keys(map).forEach(function (key) {
        var als = entryAliases(key, map[key]);
        relatedIds.forEach(function (id) {
          if (als[id]) groupKeys[key] = true;
        });
      });
      var keys = Object.keys(groupKeys);
      if (keys.length) {
        var merged = mergeChannelEntries(keys.map(function (k) { return map[k]; }));
        var allIds = {};
        keys.forEach(function (k) { allIds[k] = true; });
        relatedIds.forEach(function (id) { allIds[id] = true; });
        merged.aliases.forEach(function (a) { allIds[a] = true; });
        var canonical = pickCanonicalChannelId(Object.keys(allIds));
        if (canonical) {
          delete allIds[canonical];
          merged.aliases = Object.keys(allIds);
          merged.aliases.forEach(function (a) {
            if (a.charAt(0) === "@") merged.label = merged.label || a;
          });
          keys.forEach(function (k) { delete map[k]; });
          merged.aliases.forEach(function (a) { delete map[a]; });
          map[canonical] = merged;
        }
      }
    }

    var changed = true;
    while (changed) {
      changed = false;
      var keys2 = Object.keys(map);
      outer: for (var i = 0; i < keys2.length; i++) {
        for (var j = i + 1; j < keys2.length; j++) {
          var a = keys2[i];
          var b = keys2[j];
          if (!map[a] || !map[b]) continue;
          var setA = entryAliases(a, map[a]);
          var setB = entryAliases(b, map[b]);
          var overlap = Object.keys(setA).some(function (k) { return setB[k]; });
          if (!overlap) continue;
          var merged2 = mergeChannelEntries([map[a], map[b]]);
          var union = Object.assign({}, setA, setB);
          var canonical2 = pickCanonicalChannelId(Object.keys(union)) || a;
          delete union[canonical2];
          merged2.aliases = Object.keys(union);
          delete map[a];
          delete map[b];
          merged2.aliases.forEach(function (al) { delete map[al]; });
          map[canonical2] = merged2;
          changed = true;
          break outer;
        }
      }
    }
    return map;
  }

  function findChannelEntry(channels, relatedIds) {
    channels = channels || {};
    relatedIds = Array.isArray(relatedIds) ? relatedIds : [];
    var i;
    for (i = 0; i < relatedIds.length; i++) {
      if (channels[relatedIds[i]]) {
        return { key: relatedIds[i], entry: channels[relatedIds[i]] };
      }
    }
    var keys = Object.keys(channels);
    for (i = 0; i < keys.length; i++) {
      var key = keys[i];
      var entry = channels[key];
      var aliases = entry && Array.isArray(entry.aliases) ? entry.aliases : [];
      for (var r = 0; r < relatedIds.length; r++) {
        if (aliases.indexOf(relatedIds[r]) !== -1) {
          return { key: key, entry: entry };
        }
      }
    }
    return null;
  }

  function pruneMap(map, max) {
    var keys = Object.keys(map);
    if (keys.length <= max) return map;
    keys.sort(function (a, b) {
      return (map[a].updatedAt || 0) - (map[b].updatedAt || 0);
    });
    var drop = keys.length - max;
    for (var i = 0; i < drop; i++) delete map[keys[i]];
    return map;
  }

  function pruneChannelsPreferManual(map, max) {
    var keys = Object.keys(map);
    if (keys.length <= max) return map;
    keys.sort(function (a, b) {
      var am = map[a].addedManually || map[a].manual ? 1 : 0;
      var bm = map[b].addedManually || map[b].manual ? 1 : 0;
      if (am !== bm) return am - bm;
      return (map[a].updatedAt || 0) - (map[b].updatedAt || 0);
    });
    var drop = keys.length - max;
    for (var i = 0; i < drop; i++) {
      if ((map[keys[i]].addedManually || map[keys[i]].manual) && keys.length - i <= max) break;
      delete map[keys[i]];
    }
    return map;
  }

  YTSP.getVideoId = function () {
    try {
      return new URLSearchParams(location.search).get("v") || null;
    } catch (_) {
      return null;
    }
  };

  YTSP.getChannelId = function () {
    return pickCanonicalChannelId(YTSP.getChannelIds());
  };

  YTSP.getChannelIds = function () {
    var ucs = [];
    var others = [];
    var seen = {};

    function add(id) {
      if (!id || seen[id]) return;
      seen[id] = true;
      if (isUcChannelId(id)) ucs.push(id);
      else others.push(id);
    }

    var meta = document.querySelector('meta[itemprop="channelId"]');
    if (meta && meta.content) add(meta.content);

    var links = document.querySelectorAll(
      "ytd-video-owner-renderer a[href], #owner a[href], ytd-watch-metadata a[href], #channel-name a[href]"
    );
    for (var i = 0; i < links.length; i++) {
      var href = links[i].href || "";
      var ch = href.match(/\/channel\/(UC[\w-]+)/i);
      if (ch) add(ch[1]);
      var handle = href.match(/\/@([\w.-]+)/);
      if (handle) add("@" + handle[1]);
      var user = href.match(/\/user\/([\w.-]+)/);
      if (user) add("user:" + user[1]);
      var c = href.match(/\/c\/([\w.-]+)/);
      if (c) add("c:" + c[1]);
    }

    return ucs.concat(others);
  };

  YTSP.loadMemoryStore = function () {
    return promisifyGet([MEMORY_KEY]).then(function (result) {
      var raw = result[MEMORY_KEY];
      if (!raw || typeof raw !== "object") return emptyMemory();
      var channels = raw.channels && typeof raw.channels === "object" ? raw.channels : {};
      Object.keys(channels).forEach(function (key) {
        var e = channels[key];
        if (!e || typeof e !== "object") return;
        if (e.manual && !e.addedManually) e.addedManually = true;
        if (!Array.isArray(e.aliases)) e.aliases = [];
      });
      return {
        videos: raw.videos && typeof raw.videos === "object" ? raw.videos : {},
        channels: consolidateChannels(channels, null),
        defaultProfile: raw.defaultProfile && typeof raw.defaultProfile === "object"
          ? raw.defaultProfile
          : null,
      };
    });
  };

  YTSP.rememberCurrentLayout = function () {
    var mode = YTSP.prefsState.memoryMode;
    if (mode !== "video" && mode !== "channel") return Promise.resolve();
    if (!YTSP.isExtensionEnabled()) return Promise.resolve();

    return YTSP.loadMemoryStore().then(function (store) {
      if (mode === "video") {
        var videoId = YTSP.getVideoId();
        if (!videoId) return;
        var prevV = store.videos[videoId] || {};
        store.videos[videoId] = {
          playerWidthPercent: state.playerWidthPercent,
          activeTab: state.activeTab,
          updatedAt: Date.now(),
          label: prevV.label || null,
        };
        store.videos = pruneMap(store.videos, MEMORY_MAX_ENTRIES);
      } else {
        // Per-channel: ONLY update channels you added manually.
        // Everyone else updates the shared default profile.
        var channelIds = YTSP.getChannelIds();
        store.channels = consolidateChannels(store.channels, channelIds);

        var found = channelIds.length
          ? findChannelEntry(store.channels, channelIds)
          : null;

        if (found) {
          var prevC = found.entry || {};
          var canonical = isUcChannelId(found.key)
            ? found.key
            : (pickCanonicalChannelId(channelIds) || found.key);

          var aliasSet = {};
          channelIds.forEach(function (id) {
            if (id !== canonical) aliasSet[id] = true;
          });
          if (Array.isArray(prevC.aliases)) {
            prevC.aliases.forEach(function (a) {
              if (a && a !== canonical) aliasSet[a] = true;
            });
          }
          Object.keys(aliasSet).forEach(function (a) { delete store.channels[a]; });
          if (found.key !== canonical) delete store.channels[found.key];

          var label = prevC.label || null;
          Object.keys(aliasSet).forEach(function (a) {
            if (a.charAt(0) === "@") label = label || a;
          });

          store.channels[canonical] = {
            playerWidthPercent: state.playerWidthPercent,
            activeTab: state.activeTab,
            updatedAt: Date.now(),
            label: label,
            aliases: Object.keys(aliasSet),
            addedManually: true,
          };
        } else {
          store.defaultProfile = {
            playerWidthPercent: state.playerWidthPercent,
            activeTab: state.activeTab,
            updatedAt: Date.now(),
          };
        }
        store.channels = pruneChannelsPreferManual(store.channels, MEMORY_MAX_ENTRIES);
      }
      var payload = {};
      payload[MEMORY_KEY] = store;
      return promisifySet(payload);
    });
  };

  YTSP.restoreMemoryForCurrentVideo = function () {
    var mode = YTSP.prefsState.memoryMode;
    if (mode !== "video" && mode !== "channel") return Promise.resolve(false);
    if (!YTSP.isExtensionEnabled()) return Promise.resolve(false);

    return YTSP.loadMemoryStore().then(function (store) {
      var entry = null;
      if (mode === "video") {
        var videoId = YTSP.getVideoId();
        if (videoId) entry = store.videos[videoId] || null;
      } else {
        var channelIds = YTSP.getChannelIds();
        if (channelIds.length) {
          var before = JSON.stringify(Object.keys(store.channels).sort());
          store.channels = consolidateChannels(store.channels, channelIds);
          store.channels = pruneChannelsPreferManual(store.channels, MEMORY_MAX_ENTRIES);
          var after = JSON.stringify(Object.keys(store.channels).sort());
          if (before !== after) {
            var payload = {};
            payload[MEMORY_KEY] = store;
            promisifySet(payload);
          }
          var found = findChannelEntry(store.channels, channelIds);
          entry = found ? found.entry : null;
        }
        // Unlisted channels use the shared default profile
        if (!entry) entry = store.defaultProfile || null;
      }
      if (!entry) return false;
      return applyLayoutEntry(entry);
    });
  };

})();

/**
 * shared/prefs-lib.js — Pref schema + chrome.storage helpers for popup/options.
 * Keep keys/defaults in sync with content/prefs.js.
 */
(function (global) {
  "use strict";

  var ALL_TABS = [
    "description", "comments", "ycs", "chapters",
    "ask", "related", "playlist", "chat",
  ];

  var STORAGE_MODE_KEY = "ytspStorageMode";
  var PREFS_KEY = "ytspPrefs";
  var MEMORY_KEY = "ytspMemory";
  var MSG_PREFS_CHANGED = "ytsp-prefs-changed";

  var DEFAULT_WIDTH = 0.55;
  var DEFAULT_MIN_SIDEBAR = 280;

  function defaultVisibility() {
    var vis = {};
    ALL_TABS.forEach(function (t) { vis[t] = true; });
    return vis;
  }

  function defaultPrefs() {
    return {
      enabled: true,
      playerWidthPercent: DEFAULT_WIDTH,
      tabOrder: ALL_TABS.slice(),
      tabVisibility: defaultVisibility(),
      memoryMode: "off", // "off" | "video" | "channel"
      minSidebarWidth: DEFAULT_MIN_SIDEBAR,
      smoothResize: true,
    };
  }

  function normalizePrefs(raw) {
    var defaults = defaultPrefs();
    var src = raw && typeof raw === "object" ? raw : {};
    var known = {};
    ALL_TABS.forEach(function (t) { known[t] = true; });

    var order = [];
    var seen = {};
    var incoming = Array.isArray(src.tabOrder) ? src.tabOrder : defaults.tabOrder;
    incoming.forEach(function (tab) {
      if (known[tab] && !seen[tab]) {
        order.push(tab);
        seen[tab] = true;
      }
    });
    ALL_TABS.forEach(function (tab) {
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
  }

  function resetLayoutFields(prefs) {
    var base = normalizePrefs(prefs);
    base.tabOrder = ALL_TABS.slice();
    base.tabVisibility = defaultVisibility();
    base.playerWidthPercent = DEFAULT_WIDTH;
    return base;
  }

  function storageGet(keys) {
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

  function storageSet(obj) {
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

  function loadState() {
    return storageGet([STORAGE_MODE_KEY, PREFS_KEY]).then(function (local) {
      var mode = local[STORAGE_MODE_KEY] === "permanent" ? "permanent" : "session";
      return { mode: mode, prefs: normalizePrefs(local[PREFS_KEY]) };
    });
  }

  function saveFull(mode, prefs) {
    var normalized = normalizePrefs(prefs);
    return storageSet({
      ytspStorageMode: mode === "permanent" ? "permanent" : "session",
      ytspPrefs: normalized,
    }).then(function (ok) {
      return notifyYouTubeTabs().then(function () {
        return { ok: ok, prefs: normalized, mode: mode };
      });
    });
  }

  function notifyYouTubeTabs() {
    return new Promise(function (resolve) {
      try {
        chrome.tabs.query({ url: ["https://www.youtube.com/*"] }, function (tabs) {
          if (chrome.runtime.lastError || !tabs || !tabs.length) {
            resolve();
            return;
          }
          var pending = tabs.length;
          tabs.forEach(function (tab) {
            if (!tab.id) {
              if (--pending === 0) resolve();
              return;
            }
            chrome.tabs.sendMessage(tab.id, { type: MSG_PREFS_CHANGED }, function () {
              void chrome.runtime.lastError;
              if (--pending === 0) resolve();
            });
          });
        });
      } catch (_) {
        resolve();
      }
    });
  }

  function openOptionsPage() {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL("options.html"));
    }
  }

  function emptyMemory() {
    return { videos: {}, channels: {}, defaultProfile: null };
  }

  function isUcChannelId(id) {
    return typeof id === "string" && /^UC[\w-]{20,}$/i.test(id);
  }

  /** Prefer UC… as the single storage key the extension uses. */
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
        playerWidthPercent: DEFAULT_WIDTH,
        activeTab: "description",
        updatedAt: 0,
        label: null,
        aliases: [],
        addedManually: false,
      };
    }
    // Newest layout wins for width/tab
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
    // Prefer @handle as display label when present
    Object.keys(aliases).forEach(function (a) {
      if (a.charAt(0) === "@" && !label) label = a;
    });
    return {
      playerWidthPercent: typeof newest.playerWidthPercent === "number"
        ? newest.playerWidthPercent
        : DEFAULT_WIDTH,
      activeTab: newest.activeTab || "description",
      updatedAt: newest.updatedAt || 0,
      label: label,
      aliases: Object.keys(aliases),
      addedManually: addedManually,
    };
  }

  /**
   * Collapse related channel keys into one canonical UC… (or best) entry.
   * relatedIds: ids known to be the same channel (from the page). If omitted,
   * merges only via existing alias links.
   */
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

    // Build merge groups from relatedIds that exist in map or as aliases
    if (relatedIds.length) {
      var groupKeys = {};
      relatedIds.forEach(function (id) {
        if (map[id]) groupKeys[id] = true;
      });
      Object.keys(map).forEach(function (key) {
        var entry = map[key];
        var als = entryAliases(key, entry);
        relatedIds.forEach(function (id) {
          if (als[id]) groupKeys[key] = true;
        });
      });
      var keys = Object.keys(groupKeys);
      if (keys.length) {
        var entries = keys.map(function (k) { return map[k]; });
        var merged = mergeChannelEntries(entries);
        // All related ids become aliases except canonical
        var allIds = {};
        keys.forEach(function (k) { allIds[k] = true; });
        relatedIds.forEach(function (id) { allIds[id] = true; });
        merged.aliases.forEach(function (a) { allIds[a] = true; });

        var canonical = pickCanonicalChannelId(Object.keys(allIds));
        if (canonical) {
          delete allIds[canonical];
          merged.aliases = Object.keys(allIds);
          // Prefer @ as label
          merged.aliases.forEach(function (a) {
            if (a.charAt(0) === "@") merged.label = merged.label || a;
          });
          keys.forEach(function (k) { delete map[k]; });
          // Remove any alias keys that still exist as separate entries
          merged.aliases.forEach(function (a) { delete map[a]; });
          map[canonical] = merged;
        }
      }
    }

    // Second pass: merge entries that point at each other via aliases
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

  function normalizeMemory(raw) {
    if (!raw || typeof raw !== "object") return emptyMemory();
    var channels = raw.channels && typeof raw.channels === "object" ? raw.channels : {};
    // Normalize legacy `manual` → `addedManually` and drop duplicate alias keys
    Object.keys(channels).forEach(function (key) {
      var e = channels[key];
      if (!e || typeof e !== "object") return;
      if (e.manual && !e.addedManually) e.addedManually = true;
      if (!Array.isArray(e.aliases)) e.aliases = [];
    });
    channels = consolidateChannels(channels, null);
    return {
      videos: raw.videos && typeof raw.videos === "object" ? raw.videos : {},
      channels: channels,
      defaultProfile: raw.defaultProfile && typeof raw.defaultProfile === "object"
        ? raw.defaultProfile
        : null,
    };
  }

  function loadMemory() {
    return storageGet([MEMORY_KEY]).then(function (result) {
      return normalizeMemory(result[MEMORY_KEY]);
    });
  }

  function saveMemory(store) {
    var normalized = normalizeMemory(store);
    normalized.channels = consolidateChannels(normalized.channels, null);
    var payload = {};
    payload[MEMORY_KEY] = normalized;
    return storageSet(payload).then(function (ok) {
      return notifyYouTubeTabs().then(function () { return ok; });
    });
  }

  /**
   * Parse a channel id from a UC… id, /channel/URL, or @handle URL (handle kept as @handle key).
   */
  function parseChannelRef(input) {
    if (!input || typeof input !== "string") return null;
    var s = input.trim();
    if (!s) return null;

    // Bare channel id
    if (/^UC[\w-]{20,}$/i.test(s)) return { id: s, label: null };

    try {
      var url = s.indexOf("://") === -1 && s.indexOf("youtube.com") !== -1
        ? new URL("https://" + s.replace(/^\/\//, ""))
        : new URL(s, "https://www.youtube.com");
      var path = url.pathname || "";

      var ch = path.match(/\/channel\/(UC[\w-]+)/i);
      if (ch) return { id: ch[1], label: null };

      var handle = path.match(/\/@([\w.-]+)/);
      if (handle) return { id: "@" + handle[1], label: "@" + handle[1] };

      var user = path.match(/\/user\/([\w.-]+)/);
      if (user) return { id: "user:" + user[1], label: user[1] };

      var c = path.match(/\/c\/([\w.-]+)/);
      if (c) return { id: "c:" + c[1], label: c[1] };
    } catch (_) {
      // not a URL
    }

    // @handle bare
    if (/^@[\w.-]+$/.test(s)) return { id: s, label: s };

    // Fallback: treat as opaque id if looks safe
    if (/^[\w.-]{3,64}$/.test(s)) return { id: s, label: s };
    return null;
  }

  function channelPageBase(ref) {
    if (isUcChannelId(ref.id)) {
      return "https://www.youtube.com/channel/" + ref.id;
    }
    if (ref.id && ref.id.charAt(0) === "@") {
      return "https://www.youtube.com/" + ref.id;
    }
    if (ref.id && ref.id.indexOf("user:") === 0) {
      return "https://www.youtube.com/user/" + ref.id.slice(5);
    }
    if (ref.id && ref.id.indexOf("c:") === 0) {
      return "https://www.youtube.com/c/" + ref.id.slice(2);
    }
    if (ref.label && ref.label.charAt(0) === "@") {
      return "https://www.youtube.com/" + ref.label;
    }
    return null;
  }

  /**
   * Only these surfaces:
   *  1) channel home
   *  2) about (description / primary links)
   *  3) channels tab (featured channels section)
   */
  function channelPageTargets(ref) {
    var base = channelPageBase(ref);
    if (!base) return [];
    return [
      { url: base, kind: "home" },
      { url: base + "/about", kind: "about" },
      { url: base + "/channels", kind: "featured" },
    ];
  }

  function extractYtInitialData(html) {
    if (!html) return null;
    var patterns = [
      /var\s+ytInitialData\s*=\s*(\{.+?\})\s*;\s*<\/script>/s,
      /window\["ytInitialData"\]\s*=\s*(\{.+?\})\s*;\s*<\/script>/s,
      /ytInitialData\s*=\s*(\{.+?\})\s*;\s*<\/script>/s,
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = html.match(patterns[i]);
      if (!m) continue;
      try {
        return JSON.parse(m[1]);
      } catch (_) {}
    }
    return null;
  }

  function textFromRuns(obj) {
    if (!obj) return null;
    if (typeof obj === "string") return obj;
    if (obj.simpleText) return obj.simpleText;
    if (Array.isArray(obj.runs)) {
      return obj.runs.map(function (r) { return r.text || ""; }).join("");
    }
    return null;
  }

  /**
   * Normalize vanity URLs / handles to "@name".
   * e.g. "http://www.youtube.com/@destiny" → "@destiny"
   */
  function normalizeHandle(value) {
    if (value == null) return null;
    var s = String(value).trim();
    if (!s) return null;
    var m = s.match(/@([\w.-]+)/);
    if (m) return "@" + m[1];
    // bare handle only (no scheme/path)
    if (/^[\w.-]{2,64}$/.test(s) && s.indexOf("/") === -1) return "@" + s;
    return null;
  }

  function addDiscovered(into, id, label) {
    if (!id) return;
    if (isUcChannelId(id)) {
      if (!into[id]) into[id] = { id: id, label: null };
      if (label && !into[id].label) into[id].label = String(label).trim() || null;
      return;
    }
    // @handle fallback only when no UC is known yet
    if (typeof id === "string" && id.charAt(0) === "@") {
      if (!into[id]) into[id] = { id: id, label: id };
    }
  }

  function channelIdFromNav(nav) {
    if (!nav) return null;
    var be = nav.browseEndpoint || (nav.commandMetadata && nav.commandMetadata.webCommandMetadata);
    if (nav.browseEndpoint && nav.browseEndpoint.browseId) {
      return nav.browseEndpoint.browseId;
    }
    if (nav.commandMetadata && nav.commandMetadata.webCommandMetadata &&
        nav.commandMetadata.webCommandMetadata.url) {
      var u = nav.commandMetadata.webCommandMetadata.url;
      var m = String(u).match(/\/channel\/(UC[\w-]+)/i);
      if (m) return m[1];
      var h = String(u).match(/\/@([\w.-]+)/);
      if (h) return "@" + h[1];
    }
    return null;
  }

  /** Featured channel cards only (home shelves + Channels tab). */
  function collectFeaturedFromYtData(data, into) {
    into = into || {};

    function walk(node, depth, inFeaturedContext) {
      if (!node || depth > 50) return;
      if (Array.isArray(node)) {
        for (var i = 0; i < node.length; i++) walk(node[i], depth + 1, inFeaturedContext);
        return;
      }
      if (typeof node !== "object") return;

      var titleText = textFromRuns(node.title) || textFromRuns(node.header) || "";
      var nextFeatured = inFeaturedContext;
      if (titleText && /feature/i.test(titleText)) nextFeatured = true;

      // Explicit channel cards — treat as featured when in a featured shelf,
      // or always when it's a dedicated channel/grid channel renderer on
      // home/channels surfaces (YouTube uses these for featured channels).
      var cr = node.channelRenderer || node.gridChannelRenderer;
      if (cr) {
        var cid = cr.channelId || channelIdFromNav(cr.navigationEndpoint);
        var label = textFromRuns(cr.title);
        if (cid) addDiscovered(into, cid, label);
      }

      for (var k in node) {
        if (Object.prototype.hasOwnProperty.call(node, k)) {
          walk(node[k], depth + 1, nextFeatured);
        }
      }
    }

    walk(data, 0, false);
    return into;
  }

  /**
   * About page only: description / primary links (not every UC id on the page).
   */
  function collectAboutDescriptionLinks(data, into) {
    into = into || {};

    function addUrl(url, label) {
      if (!url) return;
      var u = String(url);
      // YouTube often prefixes redirects
      u = u.replace(/^https?:\/\/(www\.)?youtube\.com\/redirect\?.*q=([^&]+).*/i, function (_, __, q) {
        try { return decodeURIComponent(q); } catch (e) { return u; }
      });
      var ch = u.match(/\/channel\/(UC[\w-]+)/i);
      if (ch) {
        addDiscovered(into, ch[1], label || null);
        return;
      }
      var h = u.match(/(?:youtube\.com\/|\/\/)@([\w.-]+)/i);
      if (h) addDiscovered(into, "@" + h[1], label || ("@" + h[1]));
    }

    function walk(node, depth) {
      if (!node || depth > 50) return;
      if (Array.isArray(node)) {
        for (var i = 0; i < node.length; i++) walk(node[i], depth + 1);
        return;
      }
      if (typeof node !== "object") return;

      // Classic about metadata primary links
      if (node.channelAboutFullMetadataRenderer) {
        var meta = node.channelAboutFullMetadataRenderer;
        var links = meta.primaryLinks || [];
        for (var li = 0; li < links.length; li++) {
          var link = links[li];
          var title = textFromRuns(link.title);
          var href = link.navigationEndpoint && (
            (link.navigationEndpoint.urlEndpoint && link.navigationEndpoint.urlEndpoint.url) ||
            (link.navigationEndpoint.commandMetadata &&
              link.navigationEndpoint.commandMetadata.webCommandMetadata &&
              link.navigationEndpoint.commandMetadata.webCommandMetadata.url)
          );
          addUrl(href, title);
        }
        // Description text may embed channel URLs
        var desc = textFromRuns(meta.description);
        if (desc) {
          var re = /https?:\/\/(?:www\.)?youtube\.com\/(?:channel\/(UC[\w-]+)|@([\w.-]+))/gi;
          var m;
          while ((m = re.exec(desc)) !== null) {
            if (m[1]) addDiscovered(into, m[1], null);
            if (m[2]) addDiscovered(into, "@" + m[2], "@" + m[2]);
          }
        }
      }

      // Newer about view models
      if (node.aboutChannelViewModel && node.aboutChannelViewModel.links) {
        var avLinks = node.aboutChannelViewModel.links;
        if (Array.isArray(avLinks)) {
          avLinks.forEach(function (l) {
            addUrl(l.channelExternalLinkViewModel && l.channelExternalLinkViewModel.link &&
              l.channelExternalLinkViewModel.link.content, null);
            addUrl(l.url || l.link || (l.commandRuns && l.commandRuns[0] && l.commandRuns[0].onTap), null);
          });
        }
      }

      // Generic urlEndpoint only when it looks like a YouTube channel link
      if (node.urlEndpoint && node.urlEndpoint.url) {
        var u = String(node.urlEndpoint.url);
        if (/youtube\.com\/(channel\/UC|@)/i.test(u) || /\/channel\/UC/i.test(u)) {
          addUrl(u, null);
        }
      }

      for (var k in node) {
        if (Object.prototype.hasOwnProperty.call(node, k)) walk(node[k], depth + 1);
      }
    }

    walk(data, 0);
    return into;
  }

  /**
   * Home page: featured channel cards only (channelRenderer / gridChannelRenderer).
   */
  function collectHomeFeatured(data, into) {
    return collectFeaturedFromYtData(data, into);
  }

  /**
   * Name + id of the channel page itself (what the user added).
   * Linked/featured cards already carry titles; the main UC… id does not
   * unless we read channel header / metadata.
   */
  function extractOwnerChannelMeta(data, html) {
    var meta = { id: null, title: null, handle: null };

    function consider(id, title, handle) {
      if (id && isUcChannelId(id) && !meta.id) meta.id = id;
      if (title && !meta.title) {
        var t = String(title).trim();
        // Don't treat a vanity URL as the channel title
        if (t && !/^https?:\/\//i.test(t) && t.indexOf("youtube.com") === -1) {
          meta.title = t;
        }
      }
      if (handle && !meta.handle) {
        meta.handle = normalizeHandle(handle);
      }
    }

    function walk(node, depth) {
      if (!node || depth > 40) return;
      if (Array.isArray(node)) {
        for (var i = 0; i < node.length; i++) walk(node[i], depth + 1);
        return;
      }
      if (typeof node !== "object") return;

      if (node.channelMetadataRenderer) {
        var cm = node.channelMetadataRenderer;
        consider(
          cm.externalId || cm.channelId,
          cm.title,
          cm.vanityChannelUrl || cm.ownerUrls && cm.ownerUrls[0]
        );
      }

      if (node.c4TabbedHeaderRenderer) {
        var h = node.c4TabbedHeaderRenderer;
        consider(
          h.channelId,
          textFromRuns(h.title) || h.title,
          h.channelHandleText && textFromRuns(h.channelHandleText)
        );
      }

      if (node.pageHeaderViewModel && node.pageHeaderViewModel.title) {
        var pt = node.pageHeaderViewModel.title;
        var pTitle = textFromRuns(pt) || (pt.content && pt.content) || null;
        if (pTitle) consider(null, pTitle, null);
      }

      // Dynamic header metadata used on some channel layouts
      if (node.topicChannelDetailsRenderer) {
        var t = node.topicChannelDetailsRenderer;
        consider(t.channelId, textFromRuns(t.title), null);
      }

      if (node.channelAboutFullMetadataRenderer) {
        var ab = node.channelAboutFullMetadataRenderer;
        consider(
          ab.channelId,
          textFromRuns(ab.title) || ab.title && ab.title.simpleText,
          null
        );
      }

      if (node.microformatDataRenderer) {
        var mf = node.microformatDataRenderer;
        // urlCanonical often contains /@handle or /channel/UC
        if (mf.urlCanonical) {
          var uc = String(mf.urlCanonical).match(/\/channel\/(UC[\w-]+)/i);
          if (uc) consider(uc[1], mf.title || null, null);
          var hh = String(mf.urlCanonical).match(/\/@([\w.-]+)/);
          if (hh) consider(null, mf.title || null, "@" + hh[1]);
        }
        if (mf.title) consider(null, mf.title, null);
      }

      for (var k in node) {
        if (Object.prototype.hasOwnProperty.call(node, k)) walk(node[k], depth + 1);
      }
    }

    if (data) walk(data, 0);

    // HTML fallbacks
    if (html) {
      if (!meta.title) {
        var og = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
        if (og) {
          var t = og[1]
            .replace(/ - YouTube$/i, "")
            .replace(/&#39;/g, "'")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .trim();
          if (t) meta.title = t;
        }
      }
      if (!meta.id) {
        var browse = html.match(/"browseId"\s*:\s*"(UC[\w-]{20,})"/);
        if (browse) meta.id = browse[1];
      }
      if (!meta.id) {
        var ext = html.match(/"externalId"\s*:\s*"(UC[\w-]{20,})"/);
        if (ext) meta.id = ext[1];
      }
      if (!meta.handle) {
        var van = html.match(/"vanityChannelUrl"\s*:\s*"([^"]+)"/);
        if (van) meta.handle = normalizeHandle(van[1]);
      }
    }

    return meta;
  }

  /**
   * Discover related channels from:
   *  - home page featured channel cards
   *  - about page description / primary links
   *  - featured channels (channels tab cards)
   * Does not bulk-scrape every UC id on the page.
   */
  function discoverRelatedChannels(ref) {
    var targets = channelPageTargets(ref);
    if (!targets.length) {
      return Promise.resolve([{ id: ref.id, label: ref.label || null, primary: true }]);
    }

    return Promise.all(targets.map(function (t) {
      return fetch(t.url, {
        credentials: "omit",
        redirect: "follow",
        headers: { "Accept": "text/html" },
      }).then(function (res) {
        if (!res.ok) return { kind: t.kind, html: "" };
        return res.text().then(function (html) {
          return { kind: t.kind, html: html };
        });
      }).catch(function () {
        return { kind: t.kind, html: "" };
      });
    })).then(function (pages) {
      var found = {};
      var owner = { id: null, title: null, handle: null };

      pages.forEach(function (page) {
        if (!page.html) return;
        var data = extractYtInitialData(page.html);
        // Prefer home/about for the main channel's own name
        if (page.kind === "home" || page.kind === "about") {
          var o = extractOwnerChannelMeta(data, page.html);
          if (o.id && !owner.id) owner.id = o.id;
          if (o.title && !owner.title) owner.title = o.title;
          if (o.handle && !owner.handle) owner.handle = o.handle;
        }
        if (!data) return;
        if (page.kind === "about") {
          collectAboutDescriptionLinks(data, found);
        } else if (page.kind === "home") {
          collectHomeFeatured(data, found);
        } else if (page.kind === "featured") {
          collectFeaturedFromYtData(data, found);
        }
      });

      // Resolve primary id (typed UC… wins; otherwise page owner id)
      var primaryId = isUcChannelId(ref.id) ? ref.id : (owner.id || ref.id);
      var primaryLabel = ref.label || owner.title || owner.handle || null;

      if (!found[primaryId]) {
        found[primaryId] = { id: primaryId, label: primaryLabel };
      } else if (!found[primaryId].label && primaryLabel) {
        found[primaryId].label = primaryLabel;
      }
      // Always prefer the page title for the main channel when we got one
      if (owner.title) found[primaryId].label = owner.title;
      else if (!found[primaryId].label && owner.handle) found[primaryId].label = owner.handle;

      found[primaryId].primary = true;
      if (owner.handle && owner.handle !== primaryId) {
        var aliases = found[primaryId].aliases || [];
        if (aliases.indexOf(owner.handle) === -1) aliases.push(owner.handle);
        // Store handle on the object for upsert (aliases field used later by save path)
        found[primaryId]._handle = owner.handle;
      }

      var list = [];
      Object.keys(found).forEach(function (key) {
        var item = found[key];
        if (isUcChannelId(item.id) || item.primary) list.push(item);
      });

      var seen = {};
      var out = [];
      list.forEach(function (item) {
        if (seen[item.id]) {
          if (item.label && !seen[item.id].label) seen[item.id].label = item.label;
          if (item.primary) {
            seen[item.id].primary = true;
            if (item.label) seen[item.id].label = item.label;
          }
          return;
        }
        seen[item.id] = item;
        out.push(item);
      });

      out.sort(function (a, b) {
        if (a.primary && !b.primary) return -1;
        if (!a.primary && b.primary) return 1;
        var la = (a.label || a.id).toLowerCase();
        var lb = (b.label || b.id).toLowerCase();
        return la < lb ? -1 : la > lb ? 1 : 0;
      });

      return out.length ? out : [{ id: primaryId, label: primaryLabel, primary: true }];
    });
  }

  function formatBytes(n) {
    if (n == null || !isFinite(n) || n < 0) return "—";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10 * 1024 ? 1 : 0) + " KB";
    return (n / (1024 * 1024)).toFixed(2) + " MB";
  }

  function estimateBytes(value) {
    try {
      return new Blob([JSON.stringify(value)]).size;
    } catch (_) {
      try {
        return unescape(encodeURIComponent(JSON.stringify(value))).length;
      } catch (__) {
        return 0;
      }
    }
  }

  /**
   * Measure storage for prefs keys and memory key.
   * Uses chrome.storage.local.getBytesInUse when available.
   */
  function getStorageUsage() {
    return new Promise(function (resolve) {
      var keys = [STORAGE_MODE_KEY, PREFS_KEY, MEMORY_KEY];
      var fallback = function () {
        storageGet(keys).then(function (data) {
          var prefsBytes = estimateBytes({
            mode: data[STORAGE_MODE_KEY],
            prefs: data[PREFS_KEY],
          });
          var memoryBytes = estimateBytes(data[MEMORY_KEY] || emptyMemory());
          resolve({
            prefsBytes: prefsBytes,
            memoryBytes: memoryBytes,
            totalBytes: prefsBytes + memoryBytes,
            quotaBytes: chrome.storage.local.QUOTA_BYTES || 5242880,
            estimated: true,
          });
        });
      };

      if (!chrome.storage.local.getBytesInUse) {
        fallback();
        return;
      }

      try {
        // Measure prefs-related keys and memory separately
        chrome.storage.local.getBytesInUse([STORAGE_MODE_KEY, PREFS_KEY], function (prefsBytes) {
          if (chrome.runtime.lastError) {
            fallback();
            return;
          }
          chrome.storage.local.getBytesInUse([MEMORY_KEY], function (memoryBytes) {
            if (chrome.runtime.lastError) {
              fallback();
              return;
            }
            resolve({
              prefsBytes: prefsBytes || 0,
              memoryBytes: memoryBytes || 0,
              totalBytes: (prefsBytes || 0) + (memoryBytes || 0),
              quotaBytes: chrome.storage.local.QUOTA_BYTES || 5242880,
              estimated: false,
            });
          });
        });
      } catch (_) {
        fallback();
      }
    });
  }

  function storageRemove(keys) {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.remove(keys, function () {
          resolve(!chrome.runtime.lastError);
        });
      } catch (_) {
        resolve(false);
      }
    });
  }

  global.YTSPPrefs = {
    ALL_TABS: ALL_TABS,
    STORAGE_MODE_KEY: STORAGE_MODE_KEY,
    PREFS_KEY: PREFS_KEY,
    MEMORY_KEY: MEMORY_KEY,
    MSG_PREFS_CHANGED: MSG_PREFS_CHANGED,
    DEFAULT_WIDTH: DEFAULT_WIDTH,
    DEFAULT_MIN_SIDEBAR: DEFAULT_MIN_SIDEBAR,
    defaultPrefs: defaultPrefs,
    defaultVisibility: defaultVisibility,
    normalizePrefs: normalizePrefs,
    resetLayoutFields: resetLayoutFields,
    loadState: loadState,
    saveFull: saveFull,
    notifyYouTubeTabs: notifyYouTubeTabs,
    openOptionsPage: openOptionsPage,
    storageGet: storageGet,
    storageSet: storageSet,
    storageRemove: storageRemove,
    emptyMemory: emptyMemory,
    normalizeMemory: normalizeMemory,
    loadMemory: loadMemory,
    saveMemory: saveMemory,
    parseChannelRef: parseChannelRef,
    discoverRelatedChannels: discoverRelatedChannels,
    formatBytes: formatBytes,
    getStorageUsage: getStorageUsage,
    isUcChannelId: isUcChannelId,
    pickCanonicalChannelId: pickCanonicalChannelId,
    mergeChannelEntries: mergeChannelEntries,
    consolidateChannels: consolidateChannels,
    findChannelEntry: findChannelEntry,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);

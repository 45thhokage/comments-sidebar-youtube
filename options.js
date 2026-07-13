/**
 * Full settings page — all preferences + memory management + storage usage.
 */
document.addEventListener("DOMContentLoaded", () => {
  const P = globalThis.YTSPPrefs;

  const enabledToggle = document.getElementById("enabled-toggle");
  const modeSession = document.getElementById("mode-session");
  const modePermanent = document.getElementById("mode-permanent");
  const modeHelper = document.getElementById("mode-helper");
  const memoryOff = document.getElementById("memory-off");
  const memoryVideo = document.getElementById("memory-video");
  const memoryChannel = document.getElementById("memory-channel");
  const minSidebar = document.getElementById("min-sidebar");
  const smoothToggle = document.getElementById("smooth-toggle");
  const tabPrefsEl = document.getElementById("tab-prefs");
  const btnReset = document.getElementById("btn-reset");
  const btnClearMemory = document.getElementById("btn-clear-memory");
  const btnClearPrefs = document.getElementById("btn-clear-prefs");
  const channelInput = document.getElementById("channel-input");
  const btnAddChannel = document.getElementById("btn-add-channel");
  const channelList = document.getElementById("channel-list");
  const memoryCounts = document.getElementById("memory-counts");
  const prefsStorageSize = document.getElementById("prefs-storage-size");
  const prefsStorageQuota = document.getElementById("prefs-storage-quota");
  const memoryStorageSize = document.getElementById("memory-storage-size");
  const memoryStorageQuota = document.getElementById("memory-storage-quota");
  const toast = document.getElementById("toast");

  let mode = "session";
  let prefs = P.defaultPrefs();
  let memory = P.emptyMemory();
  let saving = false;

  function showToast(text) {
    toast.textContent = text;
    setTimeout(() => {
      if (toast.textContent === text) toast.textContent = "";
    }, 2400);
  }

  function updateModeUI() {
    modeSession.classList.toggle("active", mode === "session");
    modePermanent.classList.toggle("active", mode === "permanent");
    modeHelper.textContent = mode === "permanent"
      ? "Preferences are saved and will survive browser restarts."
      : "Preferences last for this browser session only (cleared on next browser launch).";
  }

  function updateMemoryUI() {
    const m = prefs.memoryMode || "off";
    memoryOff.classList.toggle("active", m === "off");
    memoryVideo.classList.toggle("active", m === "video");
    memoryChannel.classList.toggle("active", m === "channel");
  }

  function visibleCount() {
    return prefs.tabOrder.filter((t) => prefs.tabVisibility[t] !== false).length;
  }

  function renderTabs() {
    tabPrefsEl.innerHTML = "";
    prefs.tabOrder.forEach((tab, index) => {
      const visible = prefs.tabVisibility[tab] !== false;
      const row = document.createElement("div");
      row.className = "tab-row" + (visible ? "" : " hidden-tab");

      const name = document.createElement("span");
      name.className = "tab-name";
      name.textContent = tab;

      const orderBtns = document.createElement("div");
      orderBtns.className = "order-btns";

      const up = document.createElement("button");
      up.type = "button";
      up.title = "Move up";
      up.textContent = "↑";
      up.disabled = index === 0;
      up.addEventListener("click", () => moveTab(index, -1));

      const down = document.createElement("button");
      down.type = "button";
      down.title = "Move down";
      down.textContent = "↓";
      down.disabled = index === prefs.tabOrder.length - 1;
      down.addEventListener("click", () => moveTab(index, 1));

      orderBtns.append(up, down);

      const switchLabel = document.createElement("label");
      switchLabel.className = "switch";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = visible;
      if (visible && visibleCount() <= 1) input.disabled = true;
      input.addEventListener("change", () => toggleTab(tab, input.checked));
      const slider = document.createElement("span");
      slider.className = "slider";
      switchLabel.append(input, slider);

      row.append(name, orderBtns, switchLabel);
      tabPrefsEl.appendChild(row);
    });
  }

  function formatWidthPct(entry) {
    const p = entry && typeof entry.playerWidthPercent === "number"
      ? entry.playerWidthPercent
      : P.DEFAULT_WIDTH;
    return Math.round(p * 100) + "%";
  }

  function renderChannelList() {
    // Always collapse UC + @handle duplicates before display
    memory.channels = P.consolidateChannels(memory.channels || {}, null);

    const channels = memory.channels || {};
    const videos = memory.videos || {};
    const ids = Object.keys(channels).sort((a, b) => {
      const aUc = P.isUcChannelId(a) ? 1 : 0;
      const bUc = P.isUcChannelId(b) ? 1 : 0;
      if (aUc !== bUc) return bUc - aUc;
      return (channels[b].updatedAt || 0) - (channels[a].updatedAt || 0);
    });

    memoryCounts.textContent =
      ids.length + " channel" + (ids.length === 1 ? "" : "s") +
      " · " + Object.keys(videos).length + " video" + (Object.keys(videos).length === 1 ? "" : "s") + " saved";

    channelList.innerHTML = "";
    if (!ids.length) {
      const empty = document.createElement("div");
      empty.className = "memory-empty";
      empty.textContent = "No channels saved yet. Add a /channel/UC… URL above — watching does not auto-add channels.";
      channelList.appendChild(empty);
      return;
    }

    ids.forEach((id) => {
      const entry = channels[id] || {};
      const item = document.createElement("div");
      item.className = "memory-item";

      const main = document.createElement("div");
      main.className = "memory-item-main";

      const title = document.createElement("div");
      title.className = "memory-item-title";
      // Prefer friendly @handle for display when we have one
      const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];
      const handle = aliases.find((a) => a.charAt(0) === "@") || (entry.label && entry.label.charAt(0) === "@" ? entry.label : null);
      title.textContent = handle || entry.label || id;
      title.title = "Main id: " + id;

      const meta = document.createElement("div");
      meta.className = "memory-item-meta";
      const parts = [];
      parts.push(P.isUcChannelId(id) ? "main: " + id : id);
      if (aliases.length) parts.push("also: " + aliases.join(", "));
      parts.push(formatWidthPct(entry));
      if (entry.activeTab) parts.push(entry.activeTab);
      if (entry.addedManually || entry.manual) parts.push("added by you");
      if (entry.linkedFrom) parts.push("linked");
      meta.textContent = parts.join(" · ");

      main.append(title, meta);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn-x";
      remove.title = "Remove channel";
      remove.textContent = "×";
      remove.addEventListener("click", () => removeChannel(id));

      item.append(main, remove);
      channelList.appendChild(item);
    });
  }

  async function refreshStorageUsage() {
    try {
      const usage = await P.getStorageUsage();
      const quotaNote = usage.estimated ? " (est.)" : "";
      const ofQuota = usage.quotaBytes
        ? " · " + P.formatBytes(usage.quotaBytes) + " quota"
        : "";

      prefsStorageSize.textContent = P.formatBytes(usage.prefsBytes) + quotaNote;
      prefsStorageQuota.textContent = ofQuota;

      memoryStorageSize.textContent = P.formatBytes(usage.memoryBytes) + quotaNote;
      memoryStorageQuota.textContent = ofQuota;
    } catch (_) {
      prefsStorageSize.textContent = "—";
      memoryStorageSize.textContent = "—";
    }
  }

  async function reloadMemory() {
    memory = await P.loadMemory();
    // One-time cleanup of legacy UC + @handle duplicate rows
    const beforeKeys = Object.keys(memory.channels || {}).sort().join("\0");
    memory.channels = P.consolidateChannels(memory.channels || {}, null);
    const afterKeys = Object.keys(memory.channels || {}).sort().join("\0");
    if (beforeKeys !== afterKeys) {
      await P.saveMemory(memory);
      memory = await P.loadMemory();
    }
    renderChannelList();
    await refreshStorageUsage();
  }

  function syncFormFromPrefs() {
    enabledToggle.checked = prefs.enabled !== false;
    minSidebar.value = String(prefs.minSidebarWidth || P.DEFAULT_MIN_SIDEBAR);
    smoothToggle.checked = prefs.smoothResize !== false;
    updateModeUI();
    updateMemoryUI();
    renderTabs();
  }

  async function persist(message) {
    if (saving) return;
    saving = true;
    try {
      prefs = P.normalizePrefs(prefs);
      const result = await P.saveFull(mode, prefs);
      prefs = result.prefs;
      mode = result.mode;
      syncFormFromPrefs();
      await refreshStorageUsage();
      if (message) showToast(message);
    } finally {
      saving = false;
    }
  }

  async function moveTab(index, delta) {
    const next = index + delta;
    if (next < 0 || next >= prefs.tabOrder.length) return;
    const order = prefs.tabOrder.slice();
    const tmp = order[index];
    order[index] = order[next];
    order[next] = tmp;
    prefs.tabOrder = order;
    renderTabs();
    await persist("Tab order saved");
  }

  async function toggleTab(tab, show) {
    if (!show && visibleCount() <= 1) {
      renderTabs();
      return;
    }
    prefs.tabVisibility = Object.assign({}, prefs.tabVisibility, { [tab]: !!show });
    prefs = P.normalizePrefs(prefs);
    renderTabs();
    await persist("Tab visibility saved");
  }

  function upsertManualChannel(refLike) {
    const related = [refLike.id];
    if (refLike.label && refLike.label !== refLike.id) related.push(refLike.label);
    memory.channels = P.consolidateChannels(memory.channels || {}, related);

    const found = P.findChannelEntry(memory.channels, related);
    const prev = found ? found.entry : {};
    const canonical = P.pickCanonicalChannelId(
      found ? [found.key].concat(related) : related
    ) || refLike.id;

    const aliasSet = {};
    related.forEach((id) => {
      if (id !== canonical) aliasSet[id] = true;
    });
    if (Array.isArray(prev.aliases)) {
      prev.aliases.forEach((a) => {
        if (a && a !== canonical) aliasSet[a] = true;
      });
    }
    Object.keys(aliasSet).forEach((a) => { delete memory.channels[a]; });
    if (found && found.key !== canonical) delete memory.channels[found.key];

    let label = prev.label || refLike.label || null;
    Object.keys(aliasSet).forEach((a) => {
      if (a.charAt(0) === "@") label = label || a;
    });

    const isNew = !found;
    memory.channels[canonical] = {
      playerWidthPercent: typeof prev.playerWidthPercent === "number"
        ? prev.playerWidthPercent
        : prefs.playerWidthPercent || P.DEFAULT_WIDTH,
      activeTab: prev.activeTab || "description",
      updatedAt: Date.now(),
      label: label,
      aliases: Object.keys(aliasSet),
      addedManually: true,
      linkedFrom: refLike.linkedFrom || prev.linkedFrom || null,
    };
    return { canonical: canonical, isNew: isNew };
  }

  async function addChannel() {
    const ref = P.parseChannelRef(channelInput.value);
    if (!ref) {
      showToast("Could not parse channel — use a /channel/UC… URL or id");
      return;
    }

    btnAddChannel.disabled = true;
    const prevLabel = btnAddChannel.textContent;
    btnAddChannel.textContent = "Fetching…";
    showToast("Checking home, About links, and featured channels…");

    let discovered = [{ id: ref.id, label: ref.label || null, primary: true }];
    try {
      if (P.discoverRelatedChannels) {
        discovered = await P.discoverRelatedChannels(ref);
      }
    } catch (err) {
      console.warn("[YTSP] channel discovery failed", err);
      showToast("Could not fetch related channels — adding the one you entered");
    }

    let added = 0;
    let updated = 0;
    const primaryId = ref.id;

    discovered.forEach((item) => {
      const result = upsertManualChannel({
        id: item.id,
        label: item.label || null,
        linkedFrom: item.primary ? null : primaryId,
      });
      // Attach @handle as alias when discovery found one for the main channel
      if (item.primary && item._handle && memory.channels[result.canonical]) {
        const entry = memory.channels[result.canonical];
        const aliases = Array.isArray(entry.aliases) ? entry.aliases.slice() : [];
        if (aliases.indexOf(item._handle) === -1 && item._handle !== result.canonical) {
          aliases.push(item._handle);
          entry.aliases = aliases;
        }
        if (!entry.label && item.label) entry.label = item.label;
      }
      if (result.isNew) added += 1;
      else updated += 1;
    });

    // Ensure the typed channel is present; prefer a discovered primary label over bare UC…
    const primaryFromDiscovery = discovered.find((d) => d.primary) || discovered.find((d) => d.id === ref.id);
    upsertManualChannel({
      id: (primaryFromDiscovery && primaryFromDiscovery.id) || ref.id,
      label: (primaryFromDiscovery && primaryFromDiscovery.label) || ref.label || null,
      linkedFrom: null,
    });

    await P.saveMemory(memory);
    channelInput.value = "";
    btnAddChannel.disabled = false;
    btnAddChannel.textContent = prevLabel;
    await reloadMemory();

    const total = discovered.length;
    showToast(
      total > 1
        ? "Saved " + total + " channels (1 main + linked/featured)"
        : "Channel saved"
    );

    if (prefs.memoryMode === "off") {
      prefs.memoryMode = "channel";
      await persist("Layout memory set to per channel");
    }
  }

  async function removeChannel(id) {
    delete memory.channels[id];
    await P.saveMemory(memory);
    await reloadMemory();
    showToast("Channel removed");
  }

  enabledToggle.addEventListener("change", async () => {
    prefs.enabled = enabledToggle.checked;
    await persist(prefs.enabled ? "Side panel enabled" : "Side panel disabled");
  });

  modeSession.addEventListener("click", async () => {
    if (mode === "session") return;
    mode = "session";
    await persist("Storage mode: this session");
  });

  modePermanent.addEventListener("click", async () => {
    if (mode === "permanent") return;
    mode = "permanent";
    await persist("Storage mode: permanent");
  });

  memoryOff.addEventListener("click", async () => {
    prefs.memoryMode = "off";
    await persist("Layout memory off");
  });

  memoryVideo.addEventListener("click", async () => {
    prefs.memoryMode = "video";
    await persist("Remember layout per video");
  });

  memoryChannel.addEventListener("click", async () => {
    prefs.memoryMode = "channel";
    await persist("Remember layout per channel");
  });

  minSidebar.addEventListener("change", async () => {
    let n = parseInt(minSidebar.value, 10);
    if (!isFinite(n)) n = P.DEFAULT_MIN_SIDEBAR;
    prefs.minSidebarWidth = Math.max(200, Math.min(480, n));
    await persist("Minimum sidebar width saved");
  });

  smoothToggle.addEventListener("change", async () => {
    prefs.smoothResize = smoothToggle.checked;
    await persist(prefs.smoothResize ? "Smooth animation on" : "Smooth animation off");
  });

  btnReset.addEventListener("click", async () => {
    prefs = P.resetLayoutFields(prefs);
    await persist("Layout reset to defaults (55%, all tabs)");
  });

  btnClearMemory.addEventListener("click", async () => {
    memory = P.emptyMemory(); // channels + videos + default profile
    await P.saveMemory(memory);
    await reloadMemory();
    showToast("Memory data cleared (channels, videos, default profile)");
  });

  btnClearPrefs.addEventListener("click", async () => {
    // Keep storage mode choice; wipe prefs payload back to defaults
    prefs = P.defaultPrefs();
    // Preserve enabled/mode UX: leave enabled true by default
    await persist("Preferences data cleared");
    await refreshStorageUsage();
  });

  btnAddChannel.addEventListener("click", () => addChannel());
  channelInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addChannel();
    }
  });

  // Live storage refresh when other pages/tabs write
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[P.MEMORY_KEY] || changes[P.PREFS_KEY] || changes[P.STORAGE_MODE_KEY]) {
        if (changes[P.MEMORY_KEY]) {
          memory = P.normalizeMemory(changes[P.MEMORY_KEY].newValue);
          renderChannelList();
        }
        refreshStorageUsage();
      }
    });
  }

  P.loadState().then(async (result) => {
    mode = result.mode;
    prefs = result.prefs;
    syncFormFromPrefs();
    await reloadMemory();
  });
});

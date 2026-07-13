/**
 * Popup — full settings (status, enable, storage mode, tabs) +
 * small Reset and open-options controls in the footer.
 * Advanced settings also live on options.html.
 */
document.addEventListener("DOMContentLoaded", () => {
  const P = globalThis.YTSPPrefs;

  const dot = document.getElementById("status-dot");
  const label = document.getElementById("status-label");
  const enabledToggle = document.getElementById("enabled-toggle");
  const modeSession = document.getElementById("mode-session");
  const modePermanent = document.getElementById("mode-permanent");
  const modeHelper = document.getElementById("mode-helper");
  const tabPrefsEl = document.getElementById("tab-prefs");
  const btnReset = document.getElementById("btn-reset");
  const btnOptions = document.getElementById("btn-options");
  const toast = document.getElementById("toast");

  let mode = "session";
  let prefs = P.defaultPrefs();
  let saving = false;

  function showToast(text) {
    toast.textContent = text;
    toast.classList.add("show");
    setTimeout(() => {
      if (toast.textContent === text) toast.classList.remove("show");
    }, 2000);
  }

  function setStatus(kind, text) {
    dot.className = "dot" + (kind === "active" ? " active" : kind === "off" ? " off" : "");
    label.textContent = text;
  }

  function refreshStatusLine() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.url) {
        setStatus("idle", "No active tab");
        return;
      }
      try {
        const url = new URL(tab.url);
        const isYouTube = url.hostname === "www.youtube.com" || url.hostname === "youtube.com";
        const isWatch = isYouTube && (url.pathname === "/watch" || url.pathname === "/watch/");
        if (!prefs.enabled) {
          setStatus("off", isWatch ? "Disabled on this page" : "Extension disabled");
        } else if (isWatch) {
          setStatus("active", "Active — sidebar visible");
        } else if (isYouTube) {
          setStatus("idle", "Ready — click any video");
        } else {
          setStatus("idle", "Not on YouTube");
        }
      } catch (_) {
        setStatus("idle", "No active tab");
      }
    });
  }

  function updateModeUI() {
    modeSession.classList.toggle("active", mode === "session");
    modePermanent.classList.toggle("active", mode === "permanent");
    modeHelper.textContent = mode === "permanent"
      ? "Preferences are saved and will survive browser restarts."
      : "Preferences last for this browser session only (cleared next launch).";
  }

  async function refreshPrefsStorage() {
    const el = document.getElementById("prefs-storage-size");
    if (!el || !P.getStorageUsage) return;
    try {
      const usage = await P.getStorageUsage();
      const note = usage.estimated ? " (est.)" : "";
      el.textContent = P.formatBytes(usage.prefsBytes) + note;
    } catch (_) {
      el.textContent = "—";
    }
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
      switchLabel.title = visible ? "Hide tab" : "Show tab";

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

  function syncForm() {
    enabledToggle.checked = prefs.enabled !== false;
    updateModeUI();
    renderTabs();
    refreshStatusLine();
    refreshPrefsStorage();
  }

  async function persist() {
    if (saving) return;
    saving = true;
    try {
      const result = await P.saveFull(mode, prefs);
      prefs = result.prefs;
      mode = result.mode;
      syncForm();
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
    await persist();
  }

  async function toggleTab(tab, show) {
    if (!show && visibleCount() <= 1) {
      renderTabs();
      return;
    }
    prefs.tabVisibility = Object.assign({}, prefs.tabVisibility, { [tab]: !!show });
    prefs = P.normalizePrefs(prefs);
    renderTabs();
    await persist();
  }

  enabledToggle.addEventListener("change", async () => {
    prefs.enabled = enabledToggle.checked;
    await persist();
    showToast(prefs.enabled ? "Side panel enabled" : "Side panel disabled");
  });

  modeSession.addEventListener("click", async () => {
    if (mode === "session") return;
    mode = "session";
    await persist();
    showToast("This session only");
  });

  modePermanent.addEventListener("click", async () => {
    if (mode === "permanent") return;
    mode = "permanent";
    await persist();
    showToast("Saved permanently");
  });

  btnReset.addEventListener("click", async () => {
    prefs = P.resetLayoutFields(prefs);
    await persist();
    showToast("Layout reset (tabs + 55%)");
  });

  btnOptions.addEventListener("click", () => {
    P.openOptionsPage();
  });

  P.loadState().then((result) => {
    mode = result.mode;
    prefs = result.prefs;
    syncForm();
  });
});

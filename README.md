<div align="center">

# 📺 YouTube Side Panel

**A SPA-aware dual-pane sidebar for YouTube · watch and read at the same time**

[![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![YouTube](https://img.shields.io/badge/YouTube-watch%20pages-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://www.youtube.com/)
[![Version](https://img.shields.io/badge/version-16.0.5-ff2d7a?style=for-the-badge)](manifest.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

</div>

<div align="center">

<table>
  <tr>
    <td width="50%" align="center"><img src="https://github.com/user-attachments/assets/359cb370-1b32-47fc-9e07-c93732b4d817" alt="Side panel with comments" width="100%"><br><sub><b>Comments beside the player</b> · dual-pane watch layout</sub></td>
    <td width="50%" align="center"><img src="https://github.com/user-attachments/assets/dae5016a-8653-4e66-9e09-bde9c576e282" alt="Side panel tabs" width="100%"><br><sub><b>Tabbed sidebar</b> · description · comments · more</sub></td>
  </tr>
</table>

<video src="https://github.com/user-attachments/assets/6e1fba60-ed5c-4853-8101-27941ace5c6a" width="100%" controls></video>

</div>

---

YouTube Side Panel turns the watch page into a **draggable dual-pane layout**: video on one side, a tabbed panel on the other. Pull **description, comments, chapters, related, playlist, live chat**, and more into a single sidebar — and keep watching while you scroll.

Built as a **vibe-coded fix / evolution** of [watch-and-read-comments-for-youtube](https://github.com/tberghuis/watch-and-read-comments-for-youtube), with SPA navigation support, layout memory, and optional integration with [YouTube Comment Kit](https://chromewebstore.google.com/detail/youtube-comment-kit-%E2%80%94-com/pfgcilgpjedghceoheogpibogofhlbke).

> [!NOTE]
> Compatible with **YouTube Comment Kit** — the **YCS** tab hosts Comment Kit’s sidebar root when that extension is installed.

---

## 📑 Contents

- [🌟 Core advantages](#-core-advantages)
- [✨ Features](#-features)
- [🧩 Tabs](#-tabs)
- [🔗 Compatibility](#-compatibility)
- [🚀 Quick start](#-quick-start)
- [⚙️ Settings](#️-settings)
- [💡 Tips](#-tips)
- [📦 Tech stack](#-tech-stack)
- [📄 License](#-license)
- [🙏 Acknowledgments](#-acknowledgments)

---

## 🌟 Core advantages

<table>
  <tr>
    <td width="50%" valign="top"><b>📺 Watch + read, one screen</b><br><sub>Player and content side by side — comments, description, and more stay visible while the video plays.</sub></td>
    <td width="50%" valign="top"><b>🔀 SPA-aware navigation</b><br><sub>Survives YouTube’s client-side route changes. Layout and tabs re-bind when you open another video without a full reload.</sub></td>
  </tr>
  <tr>
    <td valign="top"><b>🎛 Draggable split</b><br><sub>Resize the player / sidebar split freely. <b>Shift+drag</b> snaps (30%–100%); <b>double-click</b> resets to 55%.</sub></td>
    <td valign="top"><b>🧠 Layout memory</b><br><sub>Optional per-video or per-channel memory for width and active tab — or a shared default profile for everything else.</sub></td>
  </tr>
  <tr>
    <td valign="top"><b>📑 Configurable tabs</b><br><sub>Show, hide, and reorder: description, comments, YCS, chapters, ask, related, playlist, chat.</sub></td>
    <td valign="top"><b>🔌 Comment Kit friendly</b><br><sub>Dedicated <b>YCS</b> tab for YouTube Comment Kit’s sidebar when that extension is present.</sub></td>
  </tr>
  <tr>
    <td colspan="2" valign="top"><b>⚡ Toggle without uninstalling</b><br><sub>Master enable in the popup or options page — turn the dual-pane layout off and get stock YouTube back instantly.</sub></td>
  </tr>
</table>

---

## ✨ Features

### 📐 Dual-pane watch layout
- Injects a side panel on **YouTube watch pages** with a resizable split between player and content.
- Minimum sidebar width is configurable (default **280px**, range 200–480px).
- Optional **smooth width animation** for snap, double-click reset, and memory restore (not free drag).

### 📑 Tabbed content zones
- **Below zone** — description & comments (native `#below` sections).
- **Secondary zone** — related, playlist, live chat, YCS (filtered `#secondary-inner` children).
- **Panel zone** — chapters & Ask (YouTube engagement panels).
- Native YouTube buttons (e.g. chapters / ask) can auto-switch to the matching tab.

### 🧠 Preferences & memory
- **Session** or **permanent** preference storage (tabs, width, enable state).
- **Layout memory**: off · per video · per channel.
- Per-channel mode only saves channels you add (paste `UC…` / `@handle` / channel URL). Adding a channel can also discover linked / featured channels from home & About.
- Storage usage badges on the options page; clear prefs or memory independently.

### 🛠 Popup & options
- **Popup** — status, enable toggle, prefs mode, tab order/visibility, reset, open full settings.
- **Options page** — full control: memory lists, min sidebar width, smooth animation, tips.

### 🔧 Resilience
- MAIN-world `inject.js` patches YouTube layout methods so the site doesn’t fight the sidebar.
- Content scripts re-apply on SPA navigations; observers keep panels and DOM in sync.

---

## 🧩 Tabs

| Tab | Zone | What it shows |
|-----|------|----------------|
| **Description** | below | Video description (expanded when selected) |
| **Comments** | below | Native comment thread |
| **YCS** | secondary | [YouTube Comment Kit](https://chromewebstore.google.com/detail/youtube-comment-kit-%E2%80%94-com/pfgcilgpjedghceoheogpibogofhlbke) sidebar root (`plasmo-yck-root-*`) |
| **Chapters** | panel | Chapters engagement panel |
| **Ask** | panel | Ask / AI engagement panel (when available) |
| **Related** | secondary | Related videos |
| **Playlist** | secondary | Playlist panel (when watching from a playlist) |
| **Chat** | secondary | Live chat frame |

Reorder and show/hide any tab from the **popup** or **options** page.

---

## 🔗 Compatibility

| | |
|---|---|
| **Upstream inspiration** | [tberghuis/watch-and-read-comments-for-youtube](https://github.com/tberghuis/watch-and-read-comments-for-youtube) |
| **Optional companion** | [YouTube Comment Kit](https://chromewebstore.google.com/detail/youtube-comment-kit-%E2%80%94-com/pfgcilgpjedghceoheogpibogofhlbke) — enables the **YCS** tab |
| **Browser** | Chromium-based browsers with **Manifest V3** support |
| **Site** | `https://www.youtube.com/*` (watch-focused layout) |

---

## 🚀 Quick start

### Easiest — packed extension

1. Download the **packed extension** from [Releases](../../releases) (or the zip attached to the latest release).
2. Open Chrome → `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Drag the `.crx` / zip onto the page, **or** use **Load unpacked** if you extracted a folder.
5. Open any YouTube **watch** page — the side panel should appear.

No Git, no build step, no terminal required.

### From source (development)

1. Clone or download this repository.
2. Open Chrome → `chrome://extensions`.
3. Enable **Developer mode**.
4. **Load unpacked** → select this project folder.
5. Open any YouTube **watch** page — the side panel should appear.

```bash
git clone <your-repo-url> comments-sidebar-youtube
# then Load unpacked → comments-sidebar-youtube
```

### Permissions

This extension is intentionally **minimal** — only two permissions, and nothing beyond what the layout needs:

| Permission | Why |
|------------|-----|
| `storage` | Session / permanent prefs and layout memory (local browser storage only) |
| `https://www.youtube.com/*` | Inject content scripts and apply the dual-pane layout on YouTube |

No tabs access, no history, no downloads, no other sites. No account, no remote API, no tracking — prefs stay in the browser.

---

## ⚙️ Settings

### Popup
- Enable / disable the side panel
- Preference mode: **This session** · **Permanently**
- Tab order & visibility
- Reset layout defaults (tabs + 55% width)
- Open full options page

### Options page
- Everything in the popup, plus:
  - **Layout memory** — off / per video / per channel + channel list
  - **Minimum sidebar width**
  - **Smooth width animation**
  - Clear preferences data · clear memory data
  - Storage usage for prefs & memory

---

## 💡 Tips

- Hold **`Shift`** while dragging the split bar to **snap** (30%–100%, limited by min sidebar width).
- **Double-click** the split bar to jump back to **55%**.
- Master enable is in both the **popup** and **options** page.
- For per-channel memory, prefer a `youtube.com/channel/UC…` URL when adding channels.

---

## 📦 Tech stack

| | |
|---|---|
| **Type** | Chrome / Chromium **MV3** extension |
| **UI** | Popup + options page (dark YouTube-adjacent chrome) |
| **Content** | Modular scripts under `content/` + `content.css` |
| **MAIN world** | `inject.js` — layout method patches for `ytd-watch-flexy` |
| **Shared** | `shared/prefs-lib.js` — prefs / memory helpers |
| **Background** | Service worker (`background.js`) |

**Content modules**

| File | Role |
|------|------|
| `core.js` | Namespace, constants, state |
| `prefs.js` | Preference load / storage / migrate |
| `panels.js` | Engagement panel detection |
| `tabs.js` | Tab switching & zone visibility |
| `tab-bar.js` | Tab bar UI |
| `layout.js` | Dual-pane geometry |
| `navigation.js` | SPA navigation handling |
| `drag.js` | Split drag, snap, double-click reset |
| `notification-ontop.js` | Notification always on top |
| `index.js` | Entry: create UI, wire modules |

---

## 📄 License

YouTube Side Panel is open-sourced under the **[MIT License](LICENSE)** — © 2026 45thhokage. Free to use, modify, and distribute.

---

## 🙏 Acknowledgments

- Built as a fix / evolution of **[watch-and-read-comments-for-youtube](https://github.com/tberghuis/watch-and-read-comments-for-youtube)** by [tberghuis](https://github.com/tberghuis).
- **YCS** tab integrates with **[YouTube Comment Kit](https://chromewebstore.google.com/detail/youtube-comment-kit-%E2%80%94-com/pfgcilgpjedghceoheogpibogofhlbke)** when installed.

---

<div align="center">

<h3>⭐ Finding YouTube Side Panel useful?</h3>

**A Star helps others discover the project**

</div>

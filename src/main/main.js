"use strict";

const path = require("path");
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  nativeImage,
  screen,
  globalShortcut,
} = require("electron");

const config = require("./config");
const profiles = require("../services/profiles");
const memory = require("../services/memory");
const assistant = require("../services/assistant");

let overlayWindow = null;
let settingsWindow = null;
let tray = null;
let proactiveTimer = null;

const BUBBLE_W = 380;
const BUBBLE_H = 160;
const MARGIN = 20;

const ICON_PATH = path.join(__dirname, "../../assets/icon.png");

function publicConfig() {
  const cfg = config.getConfig();
  return {
    provider: cfg.provider,
    model: cfg.model,
    profession: cfg.profession,
    experienceLevel: cfg.experienceLevel,
    language: cfg.language,
    proactive: cfg.proactive,
    intervalSeconds: cfg.intervalSeconds,
    webSearchEnabled: cfg.webSearchEnabled,
    hasApiKey: config.hasApiKey(),
    apiKeyFromEnv: cfg.apiKeyFromEnv,
  };
}

function anchorBottomRight(win, w, h) {
  const display = screen.getPrimaryDisplay();
  const { workArea } = display;
  const x = workArea.x + workArea.width - w - MARGIN;
  const y = workArea.y + workArea.height - h - MARGIN;
  win.setBounds({ x, y, width: w, height: h });
}

function createOverlay() {
  overlayWindow = new BrowserWindow({
    width: BUBBLE_W,
    height: BUBBLE_H,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  anchorBottomRight(overlayWindow, BUBBLE_W, BUBBLE_H);
  overlayWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });
}

function openSettings() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 520,
    height: 640,
    title: "AI Desk Assistant — Settings",
    resizable: true,
    minimizable: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, "../renderer/settings.html"));
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

function trayIcon() {
  let img = nativeImage.createFromPath(ICON_PATH);
  if (img.isEmpty()) {
    // Fallback 1x1 so the app still launches if the icon is missing.
    img = nativeImage.createEmpty();
  } else {
    img = img.resize({ width: 18, height: 18 });
  }
  return img;
}

function buildTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip("AI Desk Assistant");
  refreshTrayMenu();
  tray.on("click", () => toggleOverlay());
}

function refreshTrayMenu() {
  if (!tray) return;
  const cfg = publicConfig();
  const menu = Menu.buildFromTemplate([
    {
      label: overlayWindow && overlayWindow.isVisible() ? "Hide assistant" : "Show assistant",
      click: () => toggleOverlay(),
    },
    { label: "Ask for a tip now", click: () => triggerTip() },
    { type: "separator" },
    {
      label: cfg.proactive ? "Proactive tips: ON" : "Proactive tips: OFF",
      type: "checkbox",
      checked: cfg.proactive,
      click: () => {
        config.setConfig({ proactive: !cfg.proactive });
        setupProactive();
        refreshTrayMenu();
      },
    },
    { label: "Settings…", click: () => openSettings() },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

function toggleOverlay() {
  if (!overlayWindow) {
    createOverlay();
    return;
  }
  if (overlayWindow.isVisible()) overlayWindow.hide();
  else overlayWindow.show();
  refreshTrayMenu();
}

async function triggerTip() {
  if (!overlayWindow) createOverlay();
  if (overlayWindow && !overlayWindow.isVisible()) overlayWindow.show();
  const result = await assistant.getAdvice({ includeScreen: true });
  if (overlayWindow) overlayWindow.webContents.send("assistant:tip", result);
}

function setupProactive() {
  if (proactiveTimer) {
    clearInterval(proactiveTimer);
    proactiveTimer = null;
  }
  const cfg = config.getConfig();
  if (cfg.proactive) {
    const ms = Math.max(15, Number(cfg.intervalSeconds) || 45) * 1000;
    proactiveTimer = setInterval(() => {
      triggerTip().catch((err) => console.error("[proactive]", err.message));
    }, ms);
  }
}

/* ------------------------------- IPC ----------------------------------- */
function registerIpc() {
  ipcMain.handle("assistant:getAdvice", (_e, { userText, includeScreen }) =>
    assistant.getAdvice({ userText, includeScreen })
  );
  ipcMain.handle("assistant:factCheck", (_e, { claim }) =>
    assistant.factCheck({ claim })
  );

  ipcMain.handle("config:get", () => publicConfig());
  ipcMain.handle("config:set", (_e, patch) => {
    config.setConfig(patch || {});
    setupProactive();
    refreshTrayMenu();
    return publicConfig();
  });
  ipcMain.handle("profiles:list", () => profiles.listProfiles());

  ipcMain.handle("memory:get", () => memory.getAll());
  ipcMain.handle("memory:clear", () => {
    memory.clearAll();
    return true;
  });

  ipcMain.handle("window:openSettings", () => openSettings());
  ipcMain.handle("window:setSize", (_e, { w, h }) => {
    if (overlayWindow) {
      anchorBottomRight(
        overlayWindow,
        Math.round(w) || BUBBLE_W,
        Math.round(h) || BUBBLE_H
      );
    }
  });
  ipcMain.handle("app:quit", () => app.quit());
}

/* ----------------------------- Lifecycle ------------------------------- */
app.whenReady().then(() => {
  const dataDir = path.join(app.getPath("userData"), "data");
  memory.init(dataDir);

  registerIpc();
  createOverlay();
  buildTray();
  setupProactive();

  globalShortcut.register("CommandOrControl+Shift+Space", () => {
    if (!overlayWindow) createOverlay();
    if (overlayWindow) {
      overlayWindow.show();
      overlayWindow.focus();
      overlayWindow.webContents.send("ui:showChat");
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createOverlay();
  });
});

// Keep running in the tray even when all windows are closed.
app.on("window-all-closed", (e) => {
  e.preventDefault();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (proactiveTimer) clearInterval(proactiveTimer);
});

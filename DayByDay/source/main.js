// Day by Day — Electron main process.
// Stores everything in one JSON file: ~/Library/Application Support/Day by Day/daybyday-data.json
const { app, BrowserWindow, ipcMain, shell, powerMonitor, nativeTheme, Notification, dialog, Tray, Menu, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");

app.setName("Day by Day");
const dataFile = () => path.join(app.getPath("userData"), "daybyday-data.json");
const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function readData() {
  try { return JSON.parse(fs.readFileSync(dataFile(), "utf8")); }
  catch (e) { return {}; }
}
let cache = {};

function writeData(obj) {
  cache = obj || {};
  const file = dataFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, file);
  try {
    const bdir = path.join(path.dirname(file), "backups");
    fs.mkdirSync(bdir, { recursive: true });
    fs.copyFileSync(file, path.join(bdir, `daybyday-${keyOf(new Date())}.json`));
  } catch (e) {}
  applyLoginItem();
  if (tray) buildTray();
  return true;
}

/* ---------- window ---------- */
let win = null;
let quitting = false;

function createWindow() {
  win = new BrowserWindow({
    width: 1080, height: 820, minWidth: 440, minHeight: 600,
    title: "Day by Day",
    titleBarStyle: "hiddenInset",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0D1612" : "#EEF3EF",
    show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false }
  });
  win.loadFile(path.join(__dirname, "index.html"));
  win.once("ready-to-show", () => win.show());
  win.on("focus", () => win.webContents.send("check-day"));
  win.on("show", () => win.webContents.send("check-day"));
  // Closing the window keeps the app running in the menu bar so the reminder can still fire. ⌘Q quits.
  win.on("close", (e) => {
    if (quitting) return;
    e.preventDefault();
    if (trayInfo.pending) return; // the new-day screen can't be closed until you press it (⌘Q still quits)
    if (win.isFullScreen()) { win.once("leave-full-screen", hideToMenuBar); win.setFullScreen(false); }
    else hideToMenuBar();
  });
  // if you leave full screen while the new day is unacknowledged, it goes right back
  win.on("leave-full-screen", () => { if (trayInfo.pending && !quitting) setTimeout(() => win && win.setFullScreen(true), 400); });
  win.on("minimize", () => { if (trayInfo.pending && !quitting) setTimeout(presentNewDay, 300); });
  win.on("closed", () => { win = null; });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
}
function hideToMenuBar() {
  if (!win) return;
  win.hide();
  if ((cache.settings || {}).hideDock !== false && app.dock) app.dock.hide();
}
async function showWindow(tab) {
  if (app.dock && !app.dock.isVisible()) { try { await app.dock.show(); } catch (e) {} }
  if (!win) createWindow();
  else { if (win.isMinimized()) win.restore(); win.show(); }
  app.focus({ steal: true });
  win.focus();
  if (tab) win.webContents.send("go-tab", tab);
}

/* ---------- new day: bring the window forward, full screen, wherever you are ---------- */
let presenting = false;
async function presentNewDay() {
  if (presenting) return;
  if (win && win.isVisible() && win.isFocused() && win.isFullScreen()) return;
  presenting = true;
  try {
    if (pop && pop.isVisible()) hidePopover();
    await showWindow();
    await new Promise((r) => setTimeout(r, 150));
    if (win && !win.isFullScreen()) win.setFullScreen(true);
  } finally { setTimeout(() => { presenting = false; }, 800); }
}
let lastDay = keyOf(new Date());
function checkNewDay() {
  const k = keyOf(new Date());
  if (k !== lastDay) { lastDay = k; if (win) win.webContents.send("check-day"); }
}

/* ---------- menu bar icon + popover ---------- */
// Left-click: a small green card drops down and opens from its center outward.
// Right-click: a plain menu with Open and Quit.
let tray = null;
let pop = null;
let popHiddenAt = 0;
let trayInfo = { count: null, prev: null, short: "", pending: false };
const POP_W = 248, POP_H = 232;

function createPopover() {
  pop = new BrowserWindow({
    // "panel" = a non-activating macOS panel: it floats over full-screen apps
    // without pulling you out of their Space.
    type: "panel",
    width: POP_W, height: POP_H, show: false, frame: false, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true,
    transparent: true, hasShadow: false, backgroundColor: "#00000000", alwaysOnTop: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  pop.setAlwaysOnTop(true, "pop-up-menu");
  // skipTransformProcessType stops Electron from briefly flipping the app's Dock state, which also causes a Space switch
  pop.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  pop.loadFile(path.join(__dirname, "tray.html"));
  pop.on("blur", hidePopover);
}
function hidePopover() {
  if (!pop || !pop.isVisible()) return;
  pop.webContents.send("pop-hide");
  pop.hide();
  popHiddenAt = Date.now();
}
function togglePopover() {
  if (!pop) createPopover();
  if (pop.isVisible()) return hidePopover();
  if (Date.now() - popHiddenAt < 250) return; // the click that blurred it shouldn't reopen it
  const b = tray.getBounds();
  const { screen } = require("electron");
  const area = screen.getDisplayNearestPoint({ x: b.x, y: b.y }).workArea;
  let x = Math.round(b.x + b.width / 2 - POP_W / 2);
  x = Math.max(area.x + 6, Math.min(x, area.x + area.width - POP_W - 6));
  const y = Math.round(b.y + b.height + 2);
  pop.setPosition(x, y, false);
  pop.webContents.send("pop-show", trayInfo);
  setTimeout(() => { pop.show(); pop.focus(); }, 16);
}
function buildTray() {
  if (!tray) {
    const img = nativeImage.createFromPath(path.join(__dirname, "trayTemplate.png"));
    img.setTemplateImage(true);
    tray = new Tray(img);
    tray.setToolTip("Day by Day");
    tray.on("click", togglePopover);
    tray.on("right-click", () => {
      hidePopover();
      tray.popUpContextMenu(Menu.buildFromTemplate([
        { label: "Open Day by Day", click: () => showWindow() },
        { type: "separator" },
        { label: "Quit Day by Day", click: () => { quitting = true; app.quit(); } }
      ]));
    });
    createPopover();
  }
  const s = cache.settings || {};
  tray.setTitle(s.trayCount && trayInfo.count != null ? ` ${trayInfo.count}` : "", { fontType: "monospacedDigit" });
  if (pop && pop.isVisible()) pop.webContents.send("pop-show", trayInfo);
}

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => showWindow());
app.on("before-quit", () => { quitting = true; });

/* ---------- open at login ---------- */
function applyLoginItem() {
  const want = (cache.settings || {}).openAtLogin !== false;
  try {
    if (app.getLoginItemSettings().openAtLogin !== want) app.setLoginItemSettings({ openAtLogin: want });
  } catch (e) {}
}
function loginStatus() {
  try { const s = app.getLoginItemSettings(); return { on: !!s.openAtLogin, status: s.status || "" }; }
  catch (e) { return { on: false, status: "unavailable" }; }
}

/* ---------- reminder ---------- */
let lastReminded = null;
function reminderDue(now = new Date()) {
  const s = cache.settings || {};
  if (s.reminder === false) return false;
  const [hh, mm] = String(s.reminderTime || "22:00").split(":").map(Number);
  if (now.getHours() * 60 + now.getMinutes() < hh * 60 + (mm || 0)) return false;
  const k = keyOf(now);
  if (lastReminded === k) return false;
  const d = (cache.days || {})[k];
  return !(d && d.text && d.text.trim());
}
function sendReminder(test) {
  if (!Notification.isSupported()) return false;
  const n = new Notification({
    title: test ? "Day by Day · test reminder" : "You haven't written today",
    body: "Today I… (one sentence is enough)",
    silent: false
  });
  n.on("click", () => showWindow("today"));
  n.show();
  return true;
}
function checkReminder() {
  if (reminderDue()) { lastReminded = keyOf(new Date()); sendReminder(false); }
}

/* ---------- ipc ---------- */
ipcMain.handle("data:load", () => cache);
ipcMain.handle("data:save", (_e, obj) => writeData(obj));
ipcMain.handle("data:reveal", () => { if (!fs.existsSync(dataFile())) writeData(cache); shell.showItemInFolder(dataFile()); });
ipcMain.handle("win:newday", () => presentNewDay());
ipcMain.handle("win:fullscreen", (_e, on) => { if (win && win.isFullScreen() !== !!on) win.setFullScreen(!!on); });
ipcMain.handle("login:status", () => loginStatus());
ipcMain.handle("login:openSettings", () => shell.openExternal("x-apple.systempreferences:com.apple.LoginItems-Settings.extension"));
ipcMain.handle("reminder:test", () => sendReminder(true));
ipcMain.handle("tray:update", (_e, info) => { trayInfo = { ...trayInfo, ...info }; buildTray(); });
ipcMain.handle("pop:open", () => { hidePopover(); showWindow(); });
ipcMain.handle("pop:close", () => hidePopover());
ipcMain.handle("export:save", async (_e, { name, content, ext }) => {
  const res = await dialog.showSaveDialog(win, {
    defaultPath: path.join(app.getPath("documents"), name),
    filters: [{ name: ext === "json" ? "JSON backup" : "Markdown", extensions: [ext] }]
  });
  if (res.canceled || !res.filePath) return null;
  fs.writeFileSync(res.filePath, content);
  shell.showItemInFolder(res.filePath);
  return res.filePath;
});

app.setAboutPanelOptions({
  applicationName: "Day by Day",
  applicationVersion: "1.7.0",
  credits: "Developed by Theo",
  copyright: `© ${new Date().getFullYear()} Theo`
});

app.whenReady().then(() => {
  cache = readData();
  applyLoginItem();
  buildTray();
  createWindow();
  checkReminder();
  setInterval(() => { checkNewDay(); checkReminder(); }, 30 * 1000);
  powerMonitor.on("resume", () => { win && win.webContents.send("check-day"); checkReminder(); });
  powerMonitor.on("unlock-screen", () => { win && win.webContents.send("check-day"); checkReminder(); });
  app.on("activate", () => showWindow());
});

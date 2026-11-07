// Day by Day — Electron main process.
// Stores everything in one JSON file: ~/Library/Application Support/Day by Day/daybyday-data.json
const { app, BrowserWindow, ipcMain, shell, powerMonitor, nativeTheme, Notification, dialog, Tray, Menu, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const { createSharing } = require("./share");

app.setName("Day by Day");
// Running from source (dev/run.sh, or F5 in VS Code): separate practice data, and no Login Items.
const DEV = process.env.DAYBYDAY_DEV === "1";
if (DEV) app.setPath("userData", path.join(app.getPath("appData"), "Day by Day (dev)"));
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
  // Daily backup: before the first save of each day, keep the file as it was.
  // Copying after every save made today's backup identical to the live file, so a bad save ruined both.
  try {
    const bdir = path.join(path.dirname(file), "backups");
    const bfile = path.join(bdir, `daybyday-${keyOf(new Date())}.json`);
    if (fs.existsSync(file) && !fs.existsSync(bfile)) {
      fs.mkdirSync(bdir, { recursive: true });
      fs.copyFileSync(file, bfile);
    }
  } catch (e) {}
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, file);
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
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1C1310" : "#CAD8E9",
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
  stayPut(win);
}
// The app is one page and never navigates. Without this, a file dropped on the window replaces the
// app with that file, and a dropped .html page would get the preload's window.dbd.
function stayPut(w) { w.webContents.on("will-navigate", (e) => e.preventDefault()); }
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
  stayPut(pop);
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
  if (DEV) return; // it would register the bare Electron binary
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
  return !(d && ((d.text && d.text.trim()) || d.photo)); // a photo of a paper journal counts
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

/* ---------- photos of paper journals ---------- */
// Photos live next to the data file, in photos/. Imports go through sips (built into macOS), which
// reads iPhone HEIC as well as JPEG and PNG. The page then redraws the picture upright and without its
// metadata (so no location), and the JPEG it hands back is the one that's kept and, if you choose, shared.
const photoDir = () => path.join(app.getPath("userData"), "photos");
const PHOTO_NAME = /^\d{4}-\d{2}-\d{2}-\d{13}\.jpg$/;
const PHOTO_EXT = ["jpg", "jpeg", "png", "heic", "heif", "webp", "tif", "tiff", "gif", "bmp"];
const photoFile = (name) => (PHOTO_NAME.test(String(name)) ? path.join(photoDir(), String(name)) : null);

function importPhoto(src) {
  return new Promise((resolve) => {
    const bad = (msg) => resolve({ error: msg || "That file couldn't be opened as a picture." });
    try {
      if (typeof src !== "string" || !path.isAbsolute(src)) return bad();
      if (!PHOTO_EXT.includes(path.extname(src).slice(1).toLowerCase())) return bad("Pick a picture: JPEG, PNG or HEIC.");
      const st = fs.statSync(src);
      if (!st.isFile() || st.size > 100 * 1024 * 1024) return bad("That picture is too big.");
    } catch (e) { return bad(); }
    const out = path.join(app.getPath("temp"), `daybyday-import-${process.pid}-${Date.now()}.jpg`);
    // shrink big phone photos before they cross to the page, but don't enlarge small ones (-Z alone would)
    execFile("/usr/bin/sips", ["-g", "pixelWidth", "-g", "pixelHeight", src], { timeout: 30000 }, (gerr, info) => {
      const dims = String(info || "").match(/pixel(?:Width|Height):\s*(\d+)/g) || [];
      const longest = Math.max(0, ...dims.map((s) => Number(s.split(":")[1])));
      if (gerr || !longest) return bad();
      const args = ["-s", "format", "jpeg", "-s", "formatOptions", "90", ...(longest > 2400 ? ["-Z", "2400"] : []), src, "--out", out];
      execFile("/usr/bin/sips", args, { timeout: 60000 }, (err) => {
        let buf = null;
        try { buf = fs.readFileSync(out); } catch (e) {}
        try { fs.unlinkSync(out); } catch (e) {}
        if (err || !buf || buf.length < 100) return bad();
        resolve({ dataUrl: "data:image/jpeg;base64," + buf.toString("base64") });
      });
    });
  });
}
ipcMain.handle("photo:pick", async () => {
  const r = await dialog.showOpenDialog(win, {
    title: "Add a photo of your journal", buttonLabel: "Add photo", properties: ["openFile"],
    filters: [{ name: "Pictures", extensions: PHOTO_EXT }]
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return importPhoto(r.filePaths[0]);
});
ipcMain.handle("photo:import", (_e, src) => importPhoto(src));
ipcMain.handle("photo:save", (_e, day, bytes) => {
  const buf = bytes instanceof ArrayBuffer ? Buffer.from(bytes)
    : ArrayBuffer.isView(bytes) ? Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day)) || !buf || buf.length < 100 || buf.length > 15 * 1024 * 1024 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    return { error: "That picture couldn't be saved." };
  }
  fs.mkdirSync(photoDir(), { recursive: true });
  const name = `${day}-${Date.now()}.jpg`;
  fs.writeFileSync(path.join(photoDir(), name), buf);
  return { name };
});
ipcMain.handle("photo:read", (_e, name) => {
  const f = photoFile(name);
  try { return f ? "data:image/jpeg;base64," + fs.readFileSync(f).toString("base64") : null; } catch (e) { return null; }
});
ipcMain.handle("photo:open", (_e, name) => { const f = photoFile(name); if (f && fs.existsSync(f)) shell.openPath(f); });

/* ---------- friends (see share.js) ---------- */
let sharing = null;
const share = () => sharing || (sharing = createSharing({
  dir: app.getPath("userData"),
  configPath: path.join(__dirname, "share-config.json"),
  photoPath: photoFile
}));
// errors come back as values, so the page can show their message as-is
const shareCall = (fn) => async (_e, ...args) => {
  try { return { ok: true, data: await fn(...args) }; }
  catch (e) { return { ok: false, code: e.code || "error", error: e.message || String(e) }; }
};
ipcMain.handle("share:status", shareCall(() => share().status()));
ipcMain.handle("share:join", shareCall((name) => share().join(name)));
ipcMain.handle("share:friends", shareCall(() => share().friends()));
ipcMain.handle("share:add", shareCall((code) => share().addFriend(code)));
ipcMain.handle("share:accept", shareCall((id) => share().acceptFriend(id)));
ipcMain.handle("share:remove", shareCall((id) => share().removeFriend(id)));
ipcMain.handle("share:push", shareCall((p) => share().push(p)));
ipcMain.handle("share:photo", shareCall((p, v) => share().friendPhoto(p, v)));
ipcMain.handle("share:hideCounts", shareCall(() => share().hideCounts()));
ipcMain.handle("share:leave", shareCall(() => share().leave()));

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
  applicationVersion: app.getVersion(), // from package.json, the one place the version lives
  credits: "Developed by Theo",
  copyright: `© ${new Date().getFullYear()} Theo`
});

app.whenReady().then(() => {
  if (DEV && app.dock) app.dock.setIcon(path.join(__dirname, "icon.png")); // look like the real app, not Electron
  cache = readData();
  applyLoginItem();
  buildTray();
  createWindow();
  checkReminder();
  setInterval(() => { checkNewDay(); checkReminder(); }, 30 * 1000);
  // send anything written while offline
  const flushShares = () => share().flush().catch(() => {});
  setTimeout(flushShares, 5000);
  setInterval(flushShares, 2 * 60 * 1000);
  powerMonitor.on("resume", () => { win && win.webContents.send("check-day"); checkReminder(); flushShares(); });
  powerMonitor.on("unlock-screen", () => { win && win.webContents.send("check-day"); checkReminder(); });
  app.on("activate", () => showWindow());
});

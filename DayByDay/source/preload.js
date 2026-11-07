const { contextBridge, ipcRenderer, webUtils } = require("electron");
contextBridge.exposeInMainWorld("dbd", {
  load: () => ipcRenderer.invoke("data:load"),
  save: (obj) => ipcRenderer.invoke("data:save", obj),
  reveal: () => ipcRenderer.invoke("data:reveal"),
  fullscreen: (on) => ipcRenderer.invoke("win:fullscreen", on),
  presentNewDay: () => ipcRenderer.invoke("win:newday"),
  loginStatus: () => ipcRenderer.invoke("login:status"),
  openLoginSettings: () => ipcRenderer.invoke("login:openSettings"),
  testReminder: () => ipcRenderer.invoke("reminder:test"),
  exportFile: (opts) => ipcRenderer.invoke("export:save", opts),
  updateTray: (info) => ipcRenderer.invoke("tray:update", info),
  onCheckDay: (fn) => ipcRenderer.on("check-day", fn),
  popOpen: () => ipcRenderer.invoke("pop:open"),
  popClose: () => ipcRenderer.invoke("pop:close"),
  onPopShow: (fn) => ipcRenderer.on("pop-show", (_e, info) => fn(info)),
  onPopHide: (fn) => ipcRenderer.on("pop-hide", () => fn()),
  onGoTab: (fn) => ipcRenderer.on("go-tab", (_e, tab) => fn(tab)),
  // photos of paper journals
  photo: {
    pick: () => ipcRenderer.invoke("photo:pick"),
    importFile: (file) => ipcRenderer.invoke("photo:import", webUtils.getPathForFile(file)),
    save: (day, bytes) => ipcRenderer.invoke("photo:save", day, bytes),
    read: (name) => ipcRenderer.invoke("photo:read", name),
    open: (name) => ipcRenderer.invoke("photo:open", name)
  },
  // friends; every call resolves to { ok, data } or { ok: false, code, error }
  share: {
    status: () => ipcRenderer.invoke("share:status"),
    join: (name) => ipcRenderer.invoke("share:join", name),
    friends: () => ipcRenderer.invoke("share:friends"),
    add: (code) => ipcRenderer.invoke("share:add", code),
    accept: (id) => ipcRenderer.invoke("share:accept", id),
    remove: (id) => ipcRenderer.invoke("share:remove", id),
    push: (post) => ipcRenderer.invoke("share:push", post),
    photo: (objectPath, version) => ipcRenderer.invoke("share:photo", objectPath, version),
    hideCounts: () => ipcRenderer.invoke("share:hideCounts"),
    leave: () => ipcRenderer.invoke("share:leave")
  }
});

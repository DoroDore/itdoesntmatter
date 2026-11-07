const { contextBridge, ipcRenderer } = require("electron");
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
  onGoTab: (fn) => ipcRenderer.on("go-tab", (_e, tab) => fn(tab))
});

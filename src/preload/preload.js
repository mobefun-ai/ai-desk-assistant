"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("assistant", {
  // Core actions
  getAdvice: (userText, includeScreen) =>
    ipcRenderer.invoke("assistant:getAdvice", { userText, includeScreen }),
  factCheck: (claim) => ipcRenderer.invoke("assistant:factCheck", { claim }),

  // Config
  getConfig: () => ipcRenderer.invoke("config:get"),
  setConfig: (patch) => ipcRenderer.invoke("config:set", patch),
  getProfiles: () => ipcRenderer.invoke("profiles:list"),

  // Memory
  getMemory: () => ipcRenderer.invoke("memory:get"),
  clearMemory: () => ipcRenderer.invoke("memory:clear"),

  // Window control
  openSettings: () => ipcRenderer.invoke("window:openSettings"),
  setBubbleSize: (w, h) => ipcRenderer.invoke("window:setSize", { w, h }),
  quit: () => ipcRenderer.invoke("app:quit"),

  // Proactive tips pushed from main
  onTip: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("assistant:tip", handler);
    return () => ipcRenderer.removeListener("assistant:tip", handler);
  },
  onShowChat: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("ui:showChat", handler);
    return () => ipcRenderer.removeListener("ui:showChat", handler);
  },
});

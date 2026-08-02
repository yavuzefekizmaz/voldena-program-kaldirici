const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    getInstalledApps: () => ipcRenderer.invoke('app:getInstalledApps'),
    selectApp: () => ipcRenderer.invoke('dialog:selectApp'),
    uninstallMultiple: (data) => ipcRenderer.invoke('app:uninstallMultiple', data),
    getAppIcon: (appInfo) => ipcRenderer.invoke('app:getAppIcon', appInfo)
});

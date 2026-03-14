const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  forceClose: () => ipcRenderer.send('window-force-close'),
  onCloseRequested: (cb) => {
    ipcRenderer.on('close-requested', cb);
    return () => ipcRenderer.removeListener('close-requested', cb);
  },
  saveSimulationSlot: (slotId, data) => ipcRenderer.invoke('save-simulation-slot', slotId, data),
  loadSimulationSlot: (slotId) => ipcRenderer.invoke('load-simulation-slot', slotId),
  getSaveSlots: () => ipcRenderer.invoke('get-save-slots'),
  deleteSaveSlot: (slotId) => ipcRenderer.invoke('delete-save-slot', slotId),
  isElectron: true,
});

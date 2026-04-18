// Electron main process
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    title: 'Genesis Error (创世错误) - Cosmic Simulator',
    icon: getIconPath(),
    center: true,            // Ensure window opens on-screen
    frame: true,             // Use system frame so window is visible/draggable (custom titlebar can be added later)
    transparent: false,
    backgroundColor: '#000011',
    show: true,              // Show immediately - avoid off-screen or never-shown
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,  // Required for some WebGL/GPU features in packaged app
      webSecurity: !app.isPackaged,
    },
  });

  // Show window once content is ready (avoids white flash)
  mainWindow.once('ready-to-show', () => {
    console.log('[GenesisError] ready-to-show fired');
    mainWindow.show();
    mainWindow.focus();
  });

  // Fallback: if ready-to-show never fires (GPU issues, load delay), show after 2s
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.log('[GenesisError] Fallback show after timeout');
      mainWindow.show();
      mainWindow.focus();
    }
  }, 2000);

  // Log when page finishes loading
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[GenesisError] did-finish-load fired');
    if (process.argv.includes('--debug')) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  // Forward renderer console to main only in debug mode (avoids flooding terminal with code/errors)
  if (process.argv.includes('--debug')) {
    mainWindow.webContents.on('console-message', (e, level, message) => {
      console.log('[Renderer]', message);
    });
  }

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('[GenesisError] did-fail-load:', errorCode, errorDescription, validatedURL);
  });

  // In development, load from webpack dev server
  const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
  if (isDev) {
    mainWindow.loadURL('http://localhost:9000');
    mainWindow.webContents.openDevTools();
  } else {
    // Load from dist - dist is inside app.asar (no asarUnpack), so __dirname works for both packaged and unpackaged
    const fs = require('fs');
    const { pathToFileURL } = require('url');
    const candidates = app.isPackaged
      ? [
          path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'index.html'),
          path.join(__dirname.replace(/app\.asar[\\/]/, 'app.asar.unpacked' + path.sep), '..', 'dist', 'index.html'),
        ]
      : [path.join(__dirname, '..', 'dist', 'index.html')];
    const indexPath = candidates.find(p => { try { return fs.existsSync(p); } catch { return false; } }) || candidates[0];

    if (!fs.existsSync(indexPath)) {
      dialog.showErrorBox('Genesis Error — ERR_NOT_FOUND', `index.html not found.\n\nTried:\n${candidates.join('\n')}\n\nRun "npm run build:all" from the project folder.`);
      return;
    }

    const fileUrl = pathToFileURL(indexPath).href;
    mainWindow.loadURL(fileUrl).catch(() => {
      mainWindow.loadFile(indexPath).catch(err => {
        dialog.showErrorBox('Genesis Error — Load Error', `${err.message}\n\nPath: ${indexPath}`);
      });
    });
  }

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('[GenesisError] Render process gone:', details.reason);
    dialog.showErrorBox('Genesis Error — Renderer Crashed',
      `The renderer process has crashed.\nReason: ${details.reason}\n\nPlease restart the application.`
    );
  });

  mainWindow._forceClose = false;

  mainWindow.on('close', (e) => {
    if (!mainWindow._forceClose) {
      e.preventDefault();
      mainWindow.webContents.send('close-requested');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function getIconPath() {
  // In production (packaged), the icon is in extraResources
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'assets', 'icon.png');
  }
  // In development
  return path.join(__dirname, '..', 'assets', 'icon.png');
}

app.whenReady().then(() => {
  console.log('[GenesisError] App ready, creating window...');

  console.log('[GenesisError] Is packaged:', app.isPackaged);
  console.log('[GenesisError] App path:', app.getAppPath());
  console.log('[GenesisError] __dirname:', __dirname);
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

// IPC handlers for window controls (custom titlebar)
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window-close', () => {
  if (mainWindow) {
    mainWindow.webContents.send('close-requested');
  }
});
ipcMain.on('window-force-close', () => {
  if (mainWindow) {
    mainWindow._forceClose = true;
    mainWindow.close();
  }
});

// IPC handler for saving simulation to a specific slot
ipcMain.handle('save-simulation-slot', async (event, slotId, data) => {
  const fs = require('fs');
  const savePath = path.join(app.getPath('userData'), 'saves');
  if (!fs.existsSync(savePath)) fs.mkdirSync(savePath, { recursive: true });

  const filename = `slot_${slotId}.json`;
  const filePath = path.join(savePath, filename);

  const saveData = {
    ...data,
    savedAt: new Date().toISOString(),
    slotId: slotId
  };

  fs.writeFileSync(filePath, JSON.stringify(saveData, null, 2));
  return { success: true, filename, slotId };
});

// IPC handler for loading simulation from a specific slot
ipcMain.handle('load-simulation-slot', async (event, slotId) => {
  const fs = require('fs');
  const savePath = path.join(app.getPath('userData'), 'saves', `slot_${slotId}.json`);
  if (fs.existsSync(savePath)) {
    return JSON.parse(fs.readFileSync(savePath, 'utf-8'));
  }
  return null;
});

// IPC handler to get all save slots info
ipcMain.handle('get-save-slots', async (event) => {
  const fs = require('fs');
  const savePath = path.join(app.getPath('userData'), 'saves');

  if (!fs.existsSync(savePath)) {
    return {};
  }

  const slots = {};
  const files = fs.readdirSync(savePath);

  for (let i = 1; i <= 10; i++) { // Support 10 save slots
    const filename = `slot_${i}.json`;
    const filePath = path.join(savePath, filename);

    if (fs.existsSync(filePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        slots[i] = {
          exists: true,
          savedAt: data.savedAt,
          bodyCount: (() => {
            const gs = data.gravitySystems;
            if (gs && typeof gs === 'object' && !gs.bodies) {
              return Object.values(gs).reduce((sum, s) => sum + (s.bodies?.length || 0), 0);
            }
            return data.gravitySystem?.bodies?.length ?? data.bodies?.length ?? 0;
          })(),
          simTime: data.simulationTime || 0
        };
      } catch (error) {
        slots[i] = { exists: false };
      }
    } else {
      slots[i] = { exists: false };
    }
  }

  return slots;
});

// IPC handler to delete a save slot
ipcMain.handle('delete-save-slot', async (event, slotId) => {
  const fs = require('fs');
  const savePath = path.join(app.getPath('userData'), 'saves', `slot_${slotId}.json`);

  if (fs.existsSync(savePath)) {
    fs.unlinkSync(savePath);
    return { success: true };
  }
  return { success: false };
});

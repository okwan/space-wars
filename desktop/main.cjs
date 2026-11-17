// Beacon Wars on the desktop: one locked-down window around the one-file web build (ADR-0002).
// No Node in the page, no navigation away, no menus. F11 toggles full screen. Steamworks is not
// wired yet; it needs the store app id, which only the owner can create.
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('node:path');

Menu.setApplicationMenu(null);

function open() {
  const win = new BrowserWindow({
    width: 1280, height: 720, minWidth: 960, minHeight: 540,
    backgroundColor: '#03040b', title: 'Beacon Wars', autoHideMenuBar: true, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) void shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  if (process.argv.includes('--fullscreen')) win.setFullScreen(true);
  void win.loadFile(path.join(__dirname, 'app', 'index.html'), { query: Object.fromEntries(process.argv.filter(a => a.startsWith('--scene=')).map(a => ['scene', a.slice(8)])) });
}

app.whenReady().then(open);
app.on('window-all-closed', () => app.quit());

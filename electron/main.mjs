// The desktop app: starts the app's own Next server in a background process,
// on this computer only, then shows it in a window. Your library lives in the
// app's folder (Application Support on a Mac, AppData on Windows).
import { app, BrowserWindow, dialog, Menu, shell, utilityProcess } from 'electron';
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { migrateOldAppFolder } from './migrate.mjs';

const APP_NAME = 'Movie Library';
const OLD_APP_NAME = 'Movie Diary';
const BACKGROUND = '#140d0b'; // the hero's night colour, so the window never flashes white
const SERVER_START_TIMEOUT_MS = 30_000;
/** The port the app tries first. Keeping it the same keeps the page's origin the
    same, so preferences saved in the browser (day/rain, sorting…) survive restarts. */
const DEFAULT_PORT = 39417;
/** On quit, how long the page's last autosave (sent as it closes) has to reach the server. */
const SAVE_GRACE_MS = 1500;

app.setName(APP_NAME);

// Before anything is created in the app's folder: bring a library across from
// the app's old name (it was "Movie Diary"). The new folder's path is built
// from appData, since asking Electron for userData creates that folder, which
// would stop the whole old folder (preferences included) from moving.
if (!process.env.CINEMA_DATA_DIR) {
  try {
    const appData = app.getPath('appData');
    console.log(migrateOldAppFolder(path.join(appData, OLD_APP_NAME), path.join(appData, APP_NAME)));
  } catch (err) {
    console.error(`Couldn't move the library from ${OLD_APP_NAME}:`, err);
  }
}

// Packaged: the server and sample films sit in the app's resources. From the
// repo (`npm run desktop`): the standalone build and seed/ in the project.
const root = path.resolve(import.meta.dirname, '..');
const serverDir = app.isPackaged ? path.join(process.resourcesPath, 'server') : path.join(root, '.next', 'standalone');
const seedDir = app.isPackaged ? path.join(process.resourcesPath, 'seed') : path.join(root, 'seed', 'movies');
const dataDir = process.env.CINEMA_DATA_DIR || path.join(app.getPath('userData'), 'data');
const logDir = app.getPath('logs');

let server = null;
let origin = null;
let mainWindow = null;
let quitting = false;
let stopping = false; // quitting: windows closed, waiting for the last save before stopping the server

/** Resolves with the port if it's free on this computer (0 = any free port), else null. */
function tryPort(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.unref();
    probe.on('error', () => resolve(null));
    probe.listen(port, '127.0.0.1', () => {
      const { port: free } = probe.address();
      probe.close(() => resolve(free));
    });
  });
}

/**
 * The same port as last time when possible (see DEFAULT_PORT). If it's taken,
 * any free port, remembered for next time.
 */
async function serverPort() {
  const file = path.join(app.getPath('userData'), 'server-port.json');
  let preferred = DEFAULT_PORT;
  try {
    preferred = JSON.parse(readFileSync(file, 'utf8')).port || DEFAULT_PORT;
  } catch {
    // first launch
  }
  const port = (await tryPort(preferred)) ?? (await tryPort(0));
  if (!port) throw new Error('No free port for the library server.');
  if (port !== preferred) writeFileSync(file, JSON.stringify({ port }));
  return port;
}

/** Starts the server and resolves once it answers. */
async function startServer() {
  const port = await serverPort();
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(logDir, { recursive: true });
  const log = createWriteStream(path.join(logDir, 'server.log'), { flags: 'a' });
  log.write(`\n--- ${new Date().toISOString()} starting on port ${port}\n`);

  server = utilityProcess.fork(path.join(serverDir, 'server.js'), [], {
    cwd: serverDir,
    serviceName: `${APP_NAME} server`,
    stdio: 'pipe',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: '127.0.0.1', // never reachable from other computers
      CINEMA_DATA_DIR: dataDir,
      CINEMA_SEED_DIR: seedDir,
      NEXT_TELEMETRY_DISABLED: '1',
    },
  });
  server.stdout?.pipe(log);
  server.stderr?.pipe(log);
  server.on('exit', (code) => {
    log.write(`--- server exited (${code})\n`);
    server = null;
    if (!quitting) {
      dialog.showErrorBox(`${APP_NAME} stopped`, `The library server stopped unexpectedly. Details are in ${path.join(logDir, 'server.log')}.`);
      app.quit();
    }
  });

  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.status < 500) return url;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`The library server didn't start within ${SERVER_START_TIMEOUT_MS / 1000} s.`);
}

const isAppUrl = (url) => {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
};

/** Web links (Ko-fi, TMDB…) open in your usual browser, never inside the app. */
function openOutside(url) {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 820,
    minHeight: 600,
    title: APP_NAME,
    backgroundColor: BACKGROUND,
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const contents = mainWindow.webContents;
  contents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    openOutside(url);
  });
  mainWindow.loadURL(origin);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const showLibrary = {
    label: 'Show Library Folder',
    click: () => shell.openPath(dataDir),
  };
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [showLibrary, { type: 'separator' }, isMac ? { role: 'close' } : { role: 'quit' }] },
    { role: 'editMenu' }, // copy, paste and undo while writing notes
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

if (!app.requestSingleInstanceLock()) {
  app.quit(); // already open: the first copy shows itself (below)
} else {
  // Launched again while open: show the window, or bring one back if it was
  // closed (on a Mac the app keeps running with no window).
  app.on('second-instance', () => {
    if (stopping) return;
    if (!mainWindow) {
      if (origin) createWindow();
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    buildMenu();
    try {
      origin = await startServer();
    } catch (err) {
      dialog.showErrorBox(`${APP_NAME} couldn't start`, `${err.message}\n\nDetails are in ${path.join(logDir, 'server.log')}.`);
      quitting = true;
      app.quit();
      return;
    }
    createWindow();
    // On a Mac the app stays open with no window; clicking the Dock icon brings one back.
    app.on('activate', () => {
      if (!mainWindow && origin) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    // (While stopping, the quit is already under way and finishes after the grace period.)
    if (process.platform !== 'darwin' && !stopping) app.quit();
  });

  // Quitting closes the windows first, so a film page can send its last
  // autosave as it closes; the server stops once that has had time to land.
  app.on('before-quit', (event) => {
    quitting = true;
    if (!server || stopping) return;
    event.preventDefault();
    stopping = true;
    for (const window of BrowserWindow.getAllWindows()) window.close();
    setTimeout(() => {
      server?.kill();
      server = null;
      app.quit();
    }, SAVE_GRACE_MS);
  });
}

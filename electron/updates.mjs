// Checks GitHub Releases for a newer Movie Library, at most once a day (and
// whenever you choose Check for Updates…), and offers to download it.
//
// It doesn't install the update itself: Electron's built-in updater needs
// apps signed with a paid Apple Developer ID on a Mac. So Download fetches the
// right installer, and you install it like the first time; your library is in
// the app's folder, not inside the app, so it stays put.
import { app, dialog, net, shell } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { decideUpdate } from './update-logic.mjs';

const LATEST_RELEASE = 'https://api.github.com/repos/Wenze0614/movie-library/releases/latest';
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

const stateFile = () => path.join(app.getPath('userData'), 'update-check.json');

function readState() {
  try {
    const state = JSON.parse(readFileSync(stateFile(), 'utf8'));
    return state && typeof state === 'object' ? state : {};
  } catch {
    return {};
  }
}

function writeState(state) {
  try {
    writeFileSync(stateFile(), JSON.stringify(state));
  } catch {
    // not worth bothering anyone about
  }
}

/** The latest release, or null when there isn't one yet. Throws, with a readable message, when it can't tell. */
async function latestRelease() {
  let res;
  try {
    res = await net.fetch(LATEST_RELEASE, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Movie-Library-Updater' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new Error('Movie Library couldn’t reach GitHub. Check your connection and try again.');
  }
  if (res.status === 404) return null; // nothing released yet
  if (!res.ok) throw new Error(`GitHub didn’t answer properly (${res.status}). Try again later.`);
  try {
    return await res.json();
  } catch {
    throw new Error('GitHub’s answer couldn’t be read. Try again later.');
  }
}

/** The check in progress, if any: { manual, done }. */
let running = null;

/**
 * `manual`: from the menu, so it always checks and always says what it found.
 * Automatic checks happen at most once a day, only in the installed app, stay
 * quiet when there's nothing new (or no connection), and respect "Skip This Version".
 * `getWindow` returns the window to attach dialogs to; it's asked at the moment
 * a dialog opens, since the window may have closed while GitHub was answering.
 * Never throws.
 */
export async function checkForUpdates({ manual = false, getWindow = () => null } = {}) {
  // One check (and one dialog) at a time. A click on Check for Updates… during
  // a quiet automatic check waits for it, then checks and answers.
  while (running) {
    if (!manual || running.manual) return;
    await running.done;
  }
  const done = check(manual, getWindow).catch((err) => console.error('Update check failed:', err));
  running = { manual, done };
  try {
    await done;
  } finally {
    running = null;
  }
}

async function check(manual, getWindow) {
  const ask = (options) => {
    const win = getWindow();
    return win && !win.isDestroyed() ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
  };

  const state = readState();
  if (!manual) {
    if (!app.isPackaged) return;
    const last = state.lastCheck;
    const now = Date.now();
    // A lastCheck in the future (the clock was wrong) counts as no check.
    if (typeof last === 'number' && last <= now && now - last < CHECK_EVERY_MS) return;
  }

  let release;
  try {
    release = await latestRelease();
  } catch (err) {
    if (manual) await ask({ type: 'warning', message: 'Couldn’t check for updates', detail: err.message });
    return;
  }
  writeState({ ...state, lastCheck: Date.now() });

  const current = app.getVersion();
  const update = decideUpdate(release, { current, platform: process.platform, arch: process.arch, skipped: state.skipped, manual });
  if (update.kind === 'none') {
    if (manual) await ask({ type: 'info', message: 'You’re up to date', detail: `Movie Library ${current} is the latest version.` });
    return;
  }

  const howTo =
    process.platform === 'darwin'
      ? 'Quit Movie Library, open the download and drag Movie Library into Applications, replacing the old one.'
      : 'Run the downloaded installer; it replaces the old version.';
  const { response } = await ask({
    type: 'info',
    message: `Movie Library ${update.version} is available`,
    detail: [`You have ${current}. ${howTo} Your library stays where it is.`, update.notes].filter(Boolean).join('\n\n'),
    buttons: ['Download', 'Later', 'Skip This Version'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) await shell.openExternal(update.url);
  if (response === 2) writeState({ ...readState(), skipped: update.version });
}

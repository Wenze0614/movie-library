import 'server-only';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { MEDIA_DIRS, WALLPAPER_DIR } from './store';
import { tmdbOriginalBackdrop } from './tmdb';
import type { Movie, WallpaperPlatform } from './types';

/**
 * Sets a film's backdrop as the computer's desktop wallpaper. A web page
 * can't do that, but this app's server runs on your own computer, so it asks
 * the operating system directly. The image path is passed as an argument or an
 * environment variable, never pasted into the script.
 */
const run = promisify(execFile);
const TIMEOUT = 20_000;

/** A problem worth showing the person as is (the rest only go to the server log). */
export class WallpaperError extends Error {}

export function wallpaperPlatform(): WallpaperPlatform | null {
  if (process.platform === 'darwin') return 'mac';
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'linux') return 'linux';
  return null;
}

/**
 * The best image for a wallpaper: the backdrop at full size from TMDB (the
 * library keeps a 1280 px copy, soft on a large screen), else the saved
 * backdrop, else the poster. Full-size downloads are kept in data/wallpapers.
 */
async function wallpaperImage(movie: Movie): Promise<string> {
  const cached = (await fs.readdir(WALLPAPER_DIR).catch(() => [] as string[])).find((f) => f.startsWith(`${movie.id}.`));
  if (cached) return path.join(/*turbopackIgnore: true*/ WALLPAPER_DIR, cached);

  const original = movie.tmdbId ? await tmdbOriginalBackdrop(movie.tmdbId).catch(() => null) : null;
  if (original) {
    const res = await fetch(original);
    if (res.ok) {
      const ext = res.headers.get('content-type')?.includes('png') ? 'png' : 'jpg';
      const file = path.join(/*turbopackIgnore: true*/ WALLPAPER_DIR, `${path.basename(movie.id)}.${ext}`);
      await fs.mkdir(WALLPAPER_DIR, { recursive: true });
      await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
      return file;
    }
  }

  for (const [kind, file] of [['backdrops', movie.backdrop], ['posters', movie.poster]] as const) {
    if (file && !/^https?:/.test(file)) return path.join(/*turbopackIgnore: true*/ MEDIA_DIRS[kind], path.basename(file));
  }
  throw new WallpaperError(`${movie.title} has no image to use yet.`);
}

// macOS: through System Events, on every screen. (AppKit's setDesktopImageURL
// looks simpler, but on recent macOS, called from a background process like
// this server, it only records the choice and never puts it on screen.) The
// first time, macOS asks whether the app running the server may control
// System Events.
const MAC_SCRIPT = `
on run argv
  tell application "System Events"
    tell every desktop to set picture to (item 1 of argv)
  end tell
end run`;
// Allowing that prompt can take a while, so macOS gets longer.
const MAC_TIMEOUT = 90_000;
const MAC_NOT_ALLOWED =
  'macOS didn’t allow it. In System Settings › Privacy & Security › Automation, let the app running this site (your terminal) control System Events, then try again.';

// Windows: "Fill" style, then SystemParametersInfo(SPI_SETDESKWALLPAPER), saved and broadcast.
const WINDOWS_SCRIPT = `
$ErrorActionPreference = 'Stop'
Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name WallpaperStyle -Value '10'
Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name TileWallpaper -Value '0'
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public static class CinemaWallpaper {
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool SystemParametersInfo(int action, int param, string value, int flags);
}
'@
if (-not [CinemaWallpaper]::SystemParametersInfo(20, 0, $env:CINEMA_WALLPAPER, 3)) { throw 'Windows refused the image' }
`;

export async function setWallpaper(movie: Movie) {
  const platform = wallpaperPlatform();
  if (!platform) throw new WallpaperError('Setting the wallpaper isn’t supported on this computer.');
  const image = await wallpaperImage(movie);

  if (platform === 'mac') {
    await run('osascript', ['-e', MAC_SCRIPT, image], { timeout: MAC_TIMEOUT }).catch((err: { stderr?: string }) => {
      if (/-1743|-10004|not authori[sz]ed|not allowed/i.test(err.stderr ?? '')) throw new WallpaperError(MAC_NOT_ALLOWED);
      throw err;
    });
  } else if (platform === 'windows') {
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WINDOWS_SCRIPT], {
      timeout: TIMEOUT,
      env: { ...process.env, CINEMA_WALLPAPER: image },
      windowsHide: true,
    });
  } else {
    // GNOME and its relatives; other Linux desktops each have their own tool.
    const uri = `file://${image}`;
    for (const key of ['picture-uri', 'picture-uri-dark']) {
      await run('gsettings', ['set', 'org.gnome.desktop.background', key, uri], { timeout: TIMEOUT }).catch((err) => {
        if (key === 'picture-uri') throw err; // older GNOME has no dark variant
      });
    }
    await run('gsettings', ['set', 'org.gnome.desktop.background', 'picture-options', 'zoom'], { timeout: TIMEOUT });
  }
}

// macOS: whether you're on a desktop Space, judged by what's on screen right
// now: the Dock's own window is on screen on a desktop and gone in a
// full-screen app's Space. (Measured on a notched MacBook. The obvious-looking
// signals don't work: com.apple.spaces isn't updated when you switch Spaces,
// the wallpaper and desktop-icons windows stay listed in full screen, and the
// browser reports the same sizes as a maximised window.) Needs no permission.
const MAC_DESKTOP_SCRIPT = `
ObjC.import('CoreGraphics');
function run() {
  const windows = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly, $.kCGNullWindowID))) || [];
  const dock = $.CGWindowLevelForKey($.kCGDockWindowLevelKey);
  return JSON.stringify(windows.some((w) => w.kCGWindowOwnerName === 'Dock' && w.kCGWindowLayer === dock));
}`;

async function onFullScreenSpace() {
  try {
    const { stdout } = await run('osascript', ['-l', 'JavaScript', '-e', MAC_DESKTOP_SCRIPT], { timeout: TIMEOUT });
    return JSON.parse(stdout) === false;
  } catch {
    return false; // can't tell: set it right away
  }
}

/**
 * On a Mac, each Space can have its own wallpaper, and a full-screen window is
 * a Space of its own. Set from there, the wallpaper would change only behind
 * the full-screen browser and your desktop would look unchanged. So while the
 * current Space is full screen, the wallpaper waits until you're back on a
 * desktop, then it's set there. One waits at a time; the latest click wins.
 */
const POLL_MS = 1500;
const SETTLE_MS = 800; // let the leave-full-screen animation finish
const WAIT_LIMIT_MS = 30 * 60_000;
let waiting: { movieId: string; done: Promise<'set' | 'replaced'> } | null = null;
let latest = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sets the wallpaper now, or (on a Mac in full screen) once you're back on a desktop. */
export async function requestWallpaper(movie: Movie): Promise<'set' | 'waiting'> {
  const ticket = ++latest;
  if (wallpaperPlatform() !== 'mac' || !(await onFullScreenSpace())) {
    waiting = null;
    await setWallpaper(movie);
    return 'set';
  }
  const done = (async (): Promise<'set' | 'replaced'> => {
    const deadline = Date.now() + WAIT_LIMIT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_MS);
      if (ticket !== latest) return 'replaced';
      if (await onFullScreenSpace()) continue;
      await sleep(SETTLE_MS);
      if (ticket !== latest) return 'replaced';
      if (await onFullScreenSpace()) continue; // only passing through, mid-swipe
      await setWallpaper(movie);
      return 'set';
    }
    throw new WallpaperError('Stopped waiting for you to leave full screen. Click the button again from your desktop.');
  })();
  done.catch(() => {}).finally(() => {
    if (waiting?.done === done) waiting = null;
  });
  waiting = { movieId: movie.id, done };
  return 'waiting';
}

/** Resolves when the wallpaper waiting for this film has been set (or was replaced by another click). */
export async function wallpaperSettled(movieId: string): Promise<'set' | 'replaced' | 'none'> {
  if (!waiting || waiting.movieId !== movieId) return 'none';
  return waiting.done;
}

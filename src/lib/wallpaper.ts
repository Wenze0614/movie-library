import 'server-only';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { MEDIA_DIRS, WALLPAPER_DIR } from './store';
import { tmdbOriginalBackdrop } from './tmdb';
import type { Movie } from './types';

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

export type WallpaperPlatform = 'mac' | 'windows' | 'linux';

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

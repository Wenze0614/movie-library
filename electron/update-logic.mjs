// The update checker's decisions, kept free of Electron so they can be tested
// on their own: is the latest release newer, and which download suits this
// computer. (electron/updates.mjs does the asking and the dialogs.)

/** Compares "1.2.3"-style versions (a leading "v" and any "-beta…" suffix are ignored). */
export function compareVersions(a, b) {
  const parts = (v) =>
    String(v)
      .trim()
      .replace(/^v/i, '')
      .split('-')[0]
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff) return Math.sign(diff);
  }
  return 0;
}

/** The release file for this computer, by the names the release workflow gives them. */
export function assetName(platform, arch) {
  if (platform === 'darwin') return `Movie-Library-mac-${arch === 'arm64' ? 'arm64' : 'x64'}.dmg`;
  if (platform === 'win32') return 'Movie-Library-windows-x64-setup.exe';
  return null;
}

/** Only links into this app's own GitHub repository are ever opened. */
const REPO_PATH = '/wenze0614/movie-library/';
function isRepoUrl(url) {
  try {
    const u = new URL(url); // also resolves any "../" in the path
    return u.origin === 'https://github.com' && u.pathname.toLowerCase().startsWith(REPO_PATH);
  } catch {
    return false;
  }
}
/** "v1.2.3" or "1.2.3-beta.1"; anything else isn't a version this app made. */
const VERSION_TAG = /^v?\d+(\.\d+){0,2}(-[\w.]+)?$/i;

/**
 * What to tell the person about a GitHub release:
 * { kind: 'none' } when it isn't newer (or was skipped, for automatic checks),
 * or { kind: 'available', version, url, notes } with a link that only ever
 * points into this app's GitHub repository: the right installer if the
 * release has it, else the release page.
 */
export function decideUpdate(release, { current, platform, arch, skipped = null, manual = false }) {
  if (!release || typeof release.tag_name !== 'string' || !VERSION_TAG.test(release.tag_name.trim())) return { kind: 'none' };
  const version = release.tag_name.trim().replace(/^v/i, '');
  if (compareVersions(version, current) <= 0) return { kind: 'none' };
  if (!manual && skipped === version) return { kind: 'none' };
  const wanted = assetName(platform, arch);
  const asset = (release.assets ?? []).find((a) => a?.name === wanted && isRepoUrl(a.browser_download_url));
  const url = asset?.browser_download_url ?? (isRepoUrl(release.html_url) ? release.html_url : null);
  if (!url) return { kind: 'none' };
  const notes = typeof release.body === 'string' ? release.body.trim().slice(0, 600) : '';
  return { kind: 'available', version, url, notes };
}

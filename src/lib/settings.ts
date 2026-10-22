import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR } from './store';

/**
 * App settings saved next to your library: data/settings.json. It lives in
 * the git-ignored data folder, so keys never end up in the repo.
 */
export interface Settings {
  tmdbApiKey?: string;
  /** Id of the film whose backdrop is the collection's background. */
  collectionBackground?: string;
}

const FILE = path.join(DATA_DIR, 'settings.json');

export async function readSettings(): Promise<Settings> {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf8')) as Settings;
  } catch {
    return {};
  }
}

export async function updateSettings(patch: Partial<Record<keyof Settings, string | null>>): Promise<Settings> {
  const next: Record<string, unknown> = { ...(await readSettings()) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === '') delete next[key];
    else next[key] = value;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(next, null, 2), { mode: 0o600 });
  await fs.rename(tmp, FILE);
  return next as Settings;
}

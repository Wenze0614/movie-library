import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Movie, MoviePatch } from './types';

/**
 * Local-first storage: one pretty-printed JSON file per movie, images next to
 * them. Easy to read, diff, back up, or sync with any folder-sync tool.
 *
 *   data/
 *     movies/<id>.json
 *     posters/<id>.jpg
 *     backdrops/<id>.jpg
 *     portraits/<person id>.jpg
 *     people/<person id>.json   (cached TMDB details, see people.ts)
 */
// The data folder lives outside the build, so tell the bundler not to trace it.
export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.CINEMA_DATA_DIR || path.join(process.cwd(), 'data'));
const MOVIES_DIR = path.join(DATA_DIR, 'movies');
const SEED_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), 'seed', 'movies');
export const MEDIA_DIRS = {
  posters: path.join(DATA_DIR, 'posters'),
  backdrops: path.join(DATA_DIR, 'backdrops'),
  /** Small (w185) cast portraits, one per person: <tmdb person id>.jpg. Shared by every film they're in. */
  portraits: path.join(DATA_DIR, 'portraits'),
} as const;
export type MediaKind = keyof typeof MEDIA_DIRS;
/** Full-size images fetched for desktop wallpapers (see wallpaper.ts), one per film. */
export const WALLPAPER_DIR = path.join(DATA_DIR, 'wallpapers');

let ready: Promise<void> | null = null;

/** Creates the data folder on first run and copies the sample films into it. */
function ensureDataDir(): Promise<void> {
  ready ??= (async () => {
    const isNew = !(await exists(MOVIES_DIR));
    await fs.mkdir(MOVIES_DIR, { recursive: true });
    await Promise.all(Object.values(MEDIA_DIRS).map((d) => fs.mkdir(d, { recursive: true })));
    if (isNew && (await exists(SEED_DIR))) {
      for (const file of await fs.readdir(SEED_DIR)) {
        if (file.endsWith('.json')) await fs.copyFile(path.join(SEED_DIR, file), path.join(MOVIES_DIR, file));
      }
    }
  })();
  return ready;
}

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Write to a temp file then rename, so a crash never leaves half a JSON file. */
async function writeAtomic(file: string, data: string | Buffer) {
  const tmp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

function movieFile(id: string) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Invalid movie id: ${id}`);
  return path.join(MOVIES_DIR, `${id}.json`);
}

export function blankMovie(input: Partial<Movie> & { title: string }): Movie {
  const now = new Date().toISOString();
  return {
    id: '',
    originalTitle: undefined,
    year: null,
    status: 'watchlist',
    favorite: false,
    rating: null,
    poster: null,
    backdrop: null,
    tagline: '',
    overview: '',
    directors: [],
    cast: [],
    genres: [],
    runtime: null,
    watchDates: [],
    review: '',
    notes: '',
    highlights: [],
    tags: [],
    tmdbId: null,
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

type RawMovie = Partial<Movie> & { id: string; title: string; reflections?: string };

/**
 * Fill in fields that older files may be missing, so the UI can trust the
 * shape. Films used to have a separate Reflections field; its text now opens
 * the Notes (nothing is lost). Returns whether the file needs saving.
 */
function normalize(raw: RawMovie): { movie: Movie; changed: boolean } {
  const { reflections, ...rest } = raw;
  const movie: Movie = { ...blankMovie({ title: raw.title }), ...rest };
  const thoughts = reflections?.trim();
  if (thoughts) movie.notes = movie.notes.trim() ? `${thoughts}\n\n${movie.notes}` : thoughts;
  return { movie, changed: reflections !== undefined };
}

/** Reads a film's file, saving it back right away if it was in an older shape. */
async function readMovie(file: string): Promise<Movie> {
  const { movie, changed } = normalize(JSON.parse(await fs.readFile(file, 'utf8')));
  if (changed) await writeAtomic(file, JSON.stringify(movie, null, 2));
  return movie;
}

export async function listMovies(): Promise<Movie[]> {
  await ensureDataDir();
  const files = (await fs.readdir(MOVIES_DIR)).filter((f) => f.endsWith('.json'));
  const movies = await Promise.all(
    files.map(async (f) => {
      try {
        return await readMovie(path.join(MOVIES_DIR, f));
      } catch (err) {
        console.warn(`[store] skipping unreadable ${f}:`, err);
        return null;
      }
    }),
  );
  return movies.filter((m): m is Movie => m !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getMovie(id: string): Promise<Movie | null> {
  await ensureDataDir();
  try {
    return await readMovie(movieFile(id));
  } catch {
    return null;
  }
}

function slugify(title: string, year: number | null) {
  const base = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return [base || 'film', year].filter(Boolean).join('-');
}

export async function createMovie(input: Partial<Movie> & { title: string }): Promise<Movie> {
  await ensureDataDir();
  const base = slugify(input.title, input.year ?? null);
  let id = base;
  for (let n = 2; await exists(movieFile(id)); n++) id = `${base}-${n}`;
  const movie = blankMovie({ ...input, id });
  await writeAtomic(movieFile(id), JSON.stringify(movie, null, 2));
  return movie;
}

export async function updateMovie(id: string, patch: MoviePatch): Promise<Movie | null> {
  const current = await getMovie(id);
  if (!current) return null;
  const next: Movie = { ...current, ...patch, id, createdAt: current.createdAt, updatedAt: new Date().toISOString() };
  await writeAtomic(movieFile(id), JSON.stringify(next, null, 2));
  return next;
}

export async function deleteMovie(id: string): Promise<boolean> {
  const movie = await getMovie(id);
  if (!movie) return false;
  await fs.rm(movieFile(id));
  for (const [kind, file] of [['posters', movie.poster], ['backdrops', movie.backdrop]] as const) {
    if (file && !/^https?:/.test(file)) await fs.rm(path.join(MEDIA_DIRS[kind], file), { force: true });
  }
  const wallpapers = await fs.readdir(WALLPAPER_DIR).catch(() => [] as string[]);
  for (const file of wallpapers.filter((f) => f.startsWith(`${id}.`))) await fs.rm(path.join(WALLPAPER_DIR, file), { force: true });
  return true;
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

/** Saves an image for a movie and returns the stored file name. */
export async function saveMedia(kind: MediaKind, movieId: string, data: Buffer, contentType: string): Promise<string> {
  await ensureDataDir();
  const ext = EXT_BY_TYPE[contentType.split(';')[0].trim()];
  if (!ext) throw new Error(`Unsupported image type: ${contentType}`);
  // A short random suffix busts browser caches when a poster is replaced.
  const file = `${movieId}-${randomUUID().slice(0, 6)}.${ext}`;
  await writeAtomic(path.join(MEDIA_DIRS[kind], file), data);
  return file;
}

export async function removeMedia(kind: MediaKind, file: string | null) {
  if (file && !/^https?:/.test(file)) await fs.rm(path.join(MEDIA_DIRS[kind], path.basename(file)), { force: true });
}

export async function readMedia(kind: MediaKind, file: string) {
  const safe = path.basename(file);
  const ext = path.extname(safe).slice(1);
  const type = Object.entries(EXT_BY_TYPE).find(([, e]) => e === ext)?.[0] ?? 'application/octet-stream';
  return { data: await fs.readFile(path.join(MEDIA_DIRS[kind], safe)), type };
}

export async function downloadMedia(kind: MediaKind, movieId: string, url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image download failed (${res.status}) for ${url}`);
  return saveMedia(kind, movieId, Buffer.from(await res.arrayBuffer()), res.headers.get('content-type') ?? 'image/jpeg');
}

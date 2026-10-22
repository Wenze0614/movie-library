export type WatchStatus = 'watched' | 'watchlist';

/** The operating system of the computer running the server, for setting the wallpaper. */
export type WallpaperPlatform = 'mac' | 'windows' | 'linux';

export interface CastMember {
  name: string;
  character?: string;
}

/** A quote, a scene, or a moment worth remembering. */
export interface Highlight {
  id: string;
  text: string;
  /** Optional timestamp in the film, e.g. "01:12:30". */
  at?: string;
}

export interface Movie {
  id: string;
  title: string;
  originalTitle?: string;
  year: number | null;

  status: WatchStatus;
  favorite: boolean;
  /** 0.5 – 5 in half steps, null = not rated. */
  rating: number | null;

  /** File name inside data/posters, or an absolute http(s) URL. */
  poster: string | null;
  /** File name inside data/backdrops, or an absolute http(s) URL. */
  backdrop: string | null;

  tagline: string;
  /** The main story. */
  overview: string;
  directors: string[];
  cast: CastMember[];
  genres: string[];
  runtime: number | null;

  /** ISO dates (yyyy-mm-dd). One entry per viewing, rewatches append. */
  watchDates: string[];

  /** Short take — what you'd tell a friend. */
  review: string;
  /** Longer reflections: what it made you think or feel. */
  reflections: string;
  /** Loose notes: craft, music, trivia, things to look up. */
  notes: string;
  highlights: Highlight[];
  tags: string[];

  tmdbId: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Fields a client may change through PATCH /api/movies/[id]. */
export type MoviePatch = Partial<Omit<Movie, 'id' | 'createdAt' | 'updatedAt'>>;

export interface TmdbSearchResult {
  tmdbId: number;
  title: string;
  year: number | null;
  posterUrl: string | null;
  overview: string;
}

/** A film fetched from TMDB, shown for review before it's added. */
export interface TmdbDetails {
  fields: Partial<Movie> & { title: string };
  posterUrl: string | null;
  backdropUrl: string | null;
}

export interface TmdbStatus {
  configured: boolean;
  /** 'settings' = pasted with the key button, 'env' = TMDB_API_KEY in .env.local. */
  source: 'settings' | 'env' | null;
  /** Last 4 characters, e.g. "…a1b2". The full key never reaches the browser. */
  hint: string | null;
}

/** What the add dialog sends to POST /api/movies. */
export type MovieDraft = Partial<Movie> & { title: string; posterUrl?: string | null; backdropUrl?: string | null };

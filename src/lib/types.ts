export type WatchStatus = 'watched' | 'watchlist';

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

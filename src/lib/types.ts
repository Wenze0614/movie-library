export type WatchStatus = 'watched' | 'watchlist';

/** The operating system of the computer running the server, for setting the wallpaper. */
export type WallpaperPlatform = 'mac' | 'windows' | 'linux';

export interface CastMember {
  name: string;
  character?: string;
  /** TMDB person id, which links this credit to a person page (see people.ts). */
  tmdbId?: number;
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
  /** Everything else, in your own words: what it made you think or feel, craft, music, trivia, things to look up. */
  notes: string;
  highlights: Highlight[];
  tags: string[];

  tmdbId: number | null;
  /** TMDB person ids of the directors, by name slug (see people.ts), linking them to person pages. */
  directorIds?: Record<string, number>;
  /** Set once the cast has been matched to TMDB people (so it isn't fetched again). */
  castLinked?: boolean;
  /** Set once the directors have been matched to TMDB people. */
  directorsLinked?: boolean;
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

export type PersonRole = 'cast' | 'director';

/** One person in your library: everyone in the saved cast or directors of your films. */
export interface PoolPerson {
  /** URL key: the TMDB person id, or `n-<name>` for cast typed by hand. */
  key: string;
  tmdbId: number | null;
  name: string;
  /** Saved portrait URL, if there is one. */
  portrait: string | null;
  /** What they are in your films: cast, director, or both. */
  roles: PersonRole[];
  films: {
    id: string;
    title: string;
    year: number | null;
    poster: string | null;
    status: WatchStatus;
    rating: number | null;
    tmdbId: number | null;
    /** What they did on this film. */
    roles: PersonRole[];
    character?: string;
  }[];
  watched: number;
  watchlist: number;
}

/** A film from someone's TMDB filmography. */
export interface PersonCredit {
  tmdbId: number;
  title: string;
  year: number | null;
  character: string;
  posterPath: string | null;
  voteCount: number;
}

/** What TMDB knows about a person, trimmed and cached in data/people/<id>.json. */
export interface PersonDetails {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  placeOfBirth: string | null;
  department: string | null;
  profilePath: string | null;
  /** Their acting credits, best known (most voted) first. */
  credits: PersonCredit[];
  /** The films they directed, best known first. */
  directed: PersonCredit[];
  fetchedAt: string;
}

/** What the add dialog sends to POST /api/movies. */
export type MovieDraft = Partial<Movie> & { title: string; posterUrl?: string | null; backdropUrl?: string | null };

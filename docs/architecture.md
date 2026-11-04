# Architecture

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) | Server components read the library straight from disk; route handlers give a tiny local API. |
| 3D | three.js r186, plain (no React Three Fiber) | The scene is a self-contained class you can read top to bottom. React only mounts and unmounts it. |
| 2D cat | Rive (`@rive-app/canvas`), authored as text with the Rive CLI | Hand-drawn style, a tail that can hang out of the scene, a state machine for lamp and petting. See [rive-cat.md](rive-cat.md). |
| Storage | JSON files on disk | Local-first, readable, diff-able, trivially backed up. Fine up to many thousands of films. |
| Styling | Plain CSS with custom properties | One stylesheet (`src/app/globals.css`), no build plugins. |
| Metadata | TMDB (optional) | Free API. The key is pasted with the header's key button (`data/settings.json`), or set as `TMDB_API_KEY` in `.env.local`. |

Runtime dependencies: `next`, `react`, `react-dom`, `three`, `@rive-app/canvas`, `server-only`. Nothing else.

## Folder map

```
art/rive-cat/                     source of the 2D cat (generate.py → scene.rml → cat.riv)
public/
  rive/cat.riv, rive/rive.wasm    the 2D cat and its runtime (wasm copied on install)
  models/windowsill_scene.glb     the Blender scene (geometry only)
  textures/ivy_basecolor.jpg      ivy texture (downscaled from the 8K original)
seed/movies/*.json                sample films copied into data/ on first run
data/                             your library (git-ignored, created on first run)

src/
  config.ts                       site title, tagline, footer quote
  app/
    layout.tsx                    fonts, hero (3D scene + header), paper sheet, footer
    page.tsx                      collection
    movie/[id]/page.tsx           film page
    people/page.tsx               everyone in your films' casts
    people/[key]/page.tsx         one person: bio, your films with them, known for
    api/...                       local JSON API (see below)
    globals.css                   all styles
  components/
    HeroScene.tsx                 mounts three.js, hover hints, purr bubbles, lamp button
    useRiveCat.ts                 the 2D cat: loads the .riv, follows the scene, drives lamp/pet inputs
    MusicButton.tsx               the CD button; creates the jazz engine on first click
    SiteHeader.tsx                brand + Add film + key button; sets html[data-page] to resize the hero
    Collection.tsx                filters, search, sort, grid/list
    MovieDetail.tsx               inline-editable film page with autosave
    AddFilmDialog.tsx             find a film (TMDB search or by hand) → review its details → add; also "link to TMDB"
    ApiKeyDialog.tsx              key button + dialog: paste, verify and save the TMDB key
    Poster.tsx, Stars.tsx
  lib/
    types.ts                      the Movie model
    store.ts                      file storage (server only)
    tmdb.ts, library.ts           TMDB fetch, key lookup/verification, create-with-images (server only)
    settings.ts                   data/settings.json (TMDB key, collection background) (server only)
    wallpaper.ts                  set a film as the desktop wallpaper: macOS / Windows / GNOME (server only)
    peopleStore.ts                people pool, cast linking, portraits, cached person details (server only)
    people.ts                     person keys and name matching (shared)
    api.ts                        typed fetch helpers for the browser
    media.ts                      image URLs and date helpers (shared)
  audio/
    LofiJazz.ts                   generative lo-fi jazz trio (Web Audio): see music.md
  three/
    Experience.ts                 renderer, camera, loading, interaction, loop
    materials.ts                  stylised ShaderMaterials for the room
    outside.ts                    procedural sky + landscape seen through the window
    effects.ts                    steam, dust motes
    post.ts                       bloom + film grain/vignette
    glsl.ts                       shared GLSL: noise, room lighting, vertex/fragment templates
```

## The hero lives in the layout

`HeroScene` is rendered by the root layout, so it **persists across navigation**. Going from the collection to a film page doesn't reload the GLB or recompile shaders.

### Collapsing sticky hero

The hero is `position: fixed`. It starts tall (`--hero-full`, ~68vh) and collapses into a sticky banner (`--hero-banner`, ~34vh) as you scroll:

- `useCollapsingHero` (in `HeroScene.tsx`) writes `--hero-vis` (the current visible height) and `--hero-progress` (0 → 1) on `<html>` on each scroll frame.
- The canvas keeps its full height and is anchored to the bottom of the visible band. Collapsing only clips the top with `overflow: hidden`, so **the WebGL canvas never resizes while scrolling**.
- `.hero-lip` is the paper's rounded top edge, drawn as part of the hero. While attached it lines up exactly with the sheet. Once collapsed, content slides under it and fades out.
- Film pages set `html[data-page="inner"]`, which makes `--hero-full` equal the banner, so they start collapsed.
- The brand scales down and the tagline fades with `--hero-progress`. `scroll-padding-top` keeps focused fields clear of the banner.

To change the sizes, edit `--hero-full` / `--hero-banner` in `globals.css` (with separate values for phones in the 640px media query).

## Data model

One file per film, `data/movies/<id>.json`. The id is a slug of title and year (`spirited-away-2001`) and doubles as the URL.

```ts
interface Movie {
  id: string; title: string; originalTitle?: string; year: number | null;
  status: 'watched' | 'watchlist'; favorite: boolean;
  rating: number | null;            // 0.5–5 in half steps
  poster: string | null;            // file in data/posters, or an http(s) URL
  backdrop: string | null;
  tagline: string; overview: string; // overview = "The Story"
  directors: string[]; cast: { name: string; character?: string }[];
  genres: string[]; runtime: number | null;
  watchDates: string[];             // yyyy-mm-dd; rewatches add entries
  review: string;                   // short take
  reflections: string;              // longer thoughts
  notes: string;                    // loose notes
  highlights: { id: string; text: string; at?: string }[];
  tags: string[];
  tmdbId: number | null;
  createdAt: string; updatedAt: string;
}
```

Missing fields are filled with defaults when a file is read (`normalize` in `store.ts`), so hand-edited or older files keep working. Writes go through a temp file plus rename, so a crash never leaves a half-written JSON file.

## Local API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/movies` | list all films |
| POST | `/api/movies` | create from the reviewed fields: `{ title, year, directors, genres, cast, overview, status, watchDates, rating, tmdbId?, posterUrl?, backdropUrl? }`. Poster and backdrop URLs (TMDB's image host only) are downloaded into `data/`. |
| GET / PATCH / DELETE | `/api/movies/:id` | read / partial update / delete (also removes its images) |
| POST | `/api/movies/:id/tmdb` | `{ tmdbId }`: fill catalog fields and images from TMDB. Your own writing is never touched. |
| POST / DELETE | `/api/movies/:id/poster` | upload (`multipart`, field `file`, ≤ 15 MB) or remove your own poster |
| GET | `/api/media/:kind/:file` | serve images from `data/posters` or `data/backdrops` |
| GET | `/api/tmdb/search?q=` | `{ enabled, results }`. `enabled: false` when no key is set. |
| GET | `/api/tmdb/movie/:tmdbId` | full details for the review step: `{ fields, posterUrl, backdropUrl }` |
| PUT | `/api/settings/background` | `{ movieId }` (or `null`): the film whose backdrop sits behind the collection |
| (pages) | `/people`, `/people/:key` | People. No API of their own: the server pages read the pool (`peoplePool`, worked out from the films) and the person cache directly. `:key` is the TMDB person id, or `n-<name>` for cast typed by hand. Cast credits carry a TMDB person id (`CastMember.tmdbId`), set when a film is added or filled from TMDB (`linkCast`: one `/movie/:id/credits` request, which also saves w185 portraits to `data/portraits/`), or the first time People is opened for older films (`castLinked` marks a film as done). A person's details (`/person/:id?append_to_response=movie_credits`, trimmed to their 40 most-voted films) are cached in `data/people/<id>.json` for 30 days. "Known for" posters are TMDB URLs, never downloaded. |
| POST | `/api/movies/:id/wallpaper` | set the film as the desktop wallpaper. JSON only and same-origin only, so other websites can't trigger it. Uses TMDB's full-size backdrop (cached in `data/wallpapers/`), else the saved backdrop, else the poster. macOS: AppleScript via System Events (the first time, macOS asks whether your terminal may control System Events; AppKit's `setDesktopImageURL` from a background process only records the choice on recent macOS, so it isn't used). It changes the current Space only, so when the current Space is a full-screen one (the Dock's own window isn't on screen, from `CGWindowListCopyWindowInfo`; `com.apple.spaces` isn't updated when you switch Spaces, and the wallpaper windows stay listed in full screen), the server waits until you're back on a desktop Space, then sets it; `GET` on the same route resolves when that's done. Windows: PowerShell + `SystemParametersInfo`. Linux: `gsettings` (GNOME). |
| GET / PUT / DELETE | `/api/settings/tmdb` | key status `{ configured, source, hint }` / save `{ key }` (verified with TMDB first) / remove. The full key is never sent back to the browser. |

Pages read from disk directly in server components (`await connection()` keeps them dynamic). Client components write through the API.

## Autosave

`MovieDetail` keeps a local copy of the film. Each edit merges into a pending patch, which is sent about 0.7 s after typing stops (immediately for clicks like rating or status). On `pagehide` or unmount, any pending patch is sent with `fetch(..., { keepalive: true })`, so navigating away mid-sentence doesn't lose text.

## Security note

The app is meant to run on `localhost` for one person. The API has no authentication. Don't expose `npm run dev` / `npm start` to the internet as-is. If you want a public showcase, see the "static export" idea in [questions.md](questions.md).

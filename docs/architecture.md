# Architecture

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) | Server components read the library straight from disk; route handlers give a tiny local API. |
| 3D | three.js r186, plain (no React Three Fiber) | The scene is a self-contained class you can read top to bottom. React only mounts and unmounts it. |
| 2D cat | Rive (`@rive-app/canvas`), authored as text with the Rive CLI | Hand-drawn style, a tail that can hang out of the scene, a state machine for lamp and petting. See [rive-cat.md](rive-cat.md). |
| Storage | JSON files on disk | Local-first, readable, diff-able, trivially backed up. Fine up to many thousands of films. |
| Styling | Plain CSS with custom properties | One stylesheet (`src/app/globals.css`), no build plugins. |
| Metadata | TMDB (optional) | Free API; only used when `TMDB_API_KEY` is set. |

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
    diary/page.tsx                viewings by month
    api/...                       local JSON API (see below)
    globals.css                   all styles
  components/
    HeroScene.tsx                 mounts three.js, hover hints, purr bubbles, lamp button
    useRiveCat.ts                 the 2D cat: loads the .riv, follows the scene, drives lamp/pet inputs
    SiteHeader.tsx                brand + nav; sets html[data-page] to resize the hero
    Collection.tsx                filters, search, sort, grid/list
    MovieDetail.tsx               inline-editable film page with autosave
    AddFilmDialog.tsx             add by TMDB search or by hand; also "link to TMDB"
    Poster.tsx, Stars.tsx
  lib/
    types.ts                      the Movie model
    store.ts                      file storage (server only)
    tmdb.ts, library.ts           TMDB fetch + "apply TMDB data to a film" (server only)
    api.ts                        typed fetch helpers for the browser
    media.ts                      image URLs and date helpers (shared)
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
- Film and diary pages set `html[data-page="inner"]`, which makes `--hero-full` equal the banner, so they start collapsed.
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
| POST | `/api/movies` | create: `{ title, year?, status, watchDates?, rating? }` or `{ tmdbId, ... }` |
| GET / PATCH / DELETE | `/api/movies/:id` | read / partial update / delete (also removes its images) |
| POST | `/api/movies/:id/tmdb` | `{ tmdbId }`: fill catalog fields and images from TMDB. Your own writing is never touched. |
| POST / DELETE | `/api/movies/:id/poster` | upload (`multipart`, field `file`, ≤ 15 MB) or remove your own poster |
| GET | `/api/media/:kind/:file` | serve images from `data/posters` or `data/backdrops` |
| GET | `/api/tmdb/search?q=` | `{ enabled, results }`. `enabled: false` when no key is set. |

Pages read from disk directly in server components (`await connection()` keeps them dynamic). Client components write through the API.

## Autosave

`MovieDetail` keeps a local copy of the film. Each edit merges into a pending patch, which is sent about 0.7 s after typing stops (immediately for clicks like rating or status). On `pagehide` or unmount, any pending patch is sent with `fetch(..., { keepalive: true })`, so navigating away mid-sentence doesn't lose text.

## Security note

The app is meant to run on `localhost` for one person. The API has no authentication. Don't expose `npm run dev` / `npm start` to the internet as-is. If you want a public showcase, see the "static export" idea in [questions.md](questions.md).

# Movie Diary

A cozy, local-first movie diary. A 3D windowsill scene at night sits on top: a black cat, a steaming mug and a warm lamp, with the stars outside. Below it is your film collection: what you've watched, what you want to watch, your ratings, reviews, reflections, highlights and notes.

Everything is stored as plain JSON files on your own machine. No account, no cloud.

![stack](https://img.shields.io/badge/Next.js-16-black) ![three](https://img.shields.io/badge/three.js-r186-049ef4)

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000. On first run, a `data/` folder is created and filled with a few sample films so the shelf isn't empty. Delete them whenever you like.

### Optional: automatic posters, story & cast

1. Get a free API key at https://www.themoviedb.org/settings/api.
2. Click the **key button** in the top-right corner and paste it. It's checked with TMDB, then saved to `data/settings.json` on your computer only. The dot on the key turns green once you're connected.

**Add film** (or ⌘K) then searches TMDB. Pick a result and you get a **review step** with the poster, title, year, director, genres, main cast and story filled in. Fix anything you like, choose Watched or To watch, then **Add to library**. Posters and backdrops are downloaded into `data/`, so everything keeps working offline. Films you added by hand can be linked later with **Fill in from TMDB** on their page.

Without a key, you type a title and fill in the same review form yourself. You can upload your own poster later (click or drag onto the poster).

Prefer config files? `TMDB_API_KEY=` in `.env.local` works too; a key pasted with the key button takes priority.

## Where your data lives

```
data/
  movies/<id>.json    one file per film; readable, diff-able, easy to back up
  posters/            poster images
  backdrops/          backdrop images
  wallpapers/         full-size backdrops fetched for your desktop wallpaper
  settings.json       your TMDB key and the collection background you picked
```

`data/` is git-ignored, so cloning the repo gives everyone their own empty cinema. To keep your library somewhere else (a synced folder, for example), set `CINEMA_DATA_DIR=/absolute/path` in `.env.local`.

## Using it

- **Collection**: filter by All / Watched / To Watch, and the heart for favorites only; search across title, director, cast and tags; sort by date added, date watched, rating, title or year, with a button that flips the order; switch between grid and list.
- **Card buttons** (on hover, bottom-right of the poster): the framed-picture button puts that film's backdrop behind your collection (click again to remove it). The laptop button sets it as your **desktop wallpaper** on macOS, Windows or GNOME Linux. A web page can't change your wallpaper, but this app's server runs on your own computer, so it asks the operating system. It uses the full-size backdrop from TMDB when it can. On a Mac, the first time, macOS asks whether your terminal may control System Events: allow it.
- **Film page**: everything saves automatically as you type. Status, favorite, half-star rating, viewings (rewatches add a date), story, review, reflections, highlights (with an optional timestamp), notes, tags and cast.
- **The scene**: the sun/moon button turns the world outside between night (stars, galaxy, a lakeside town) and day (blue sky, a few clouds, snowy mountains, a flower meadow): like two stacked cards, the one in front swings away from the window's bottom-left corner to reveal the other, and your choice is remembered. The cloud button makes it rain over either world: grey clouds roll in, rain falls outside, drops bead and run down the window glass, and a soft rain sound mixes in with the jazz. Click the lamp to turn it off for a moonlit room; the cat falls asleep. Click the cat to pet it. The camera drifts gently with your pointer.
- **Music**: click the little CD next to the lamp for lo-fi jazz (the CD spins while it plays). It's composed live in your browser, so it's original, needs no audio files, and never repeats exactly. Click again to pause. Details: [docs/music.md](docs/music.md).

## Personalise

- Title, tagline and footer text: `src/config.ts`
- Colours and fonts: the tokens at the top of `src/app/globals.css`, fonts in `src/app/layout.tsx`
- Scene lighting, colours and camera: see [docs/scene.md](docs/scene.md)

## Docs

- [docs/architecture.md](docs/architecture.md): how the app is put together, the data model and API
- [docs/scene.md](docs/scene.md): the three.js scene, the shaders, and how to update the Blender model
- [docs/rive-cat.md](docs/rive-cat.md): the 2D Rive cat; rebuilding it with `npm run cat`, or swapping in your own art
- [docs/design.md](docs/design.md): visual language: palette, type, components
- [docs/questions.md](docs/questions.md): open decisions and ideas for what's next

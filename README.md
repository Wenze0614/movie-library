# Movie Library

**Website & downloads: https://wenze0614.github.io/movie-library/**

A cozy, local-first movie library. A 3D windowsill scene at night sits on top: a black cat, a steaming mug and a warm lamp, with the stars outside. Below it is your film collection: what you've watched, what you want to watch, your ratings, reviews, highlights and notes.

Everything is stored as plain JSON files on your own machine. No account, no cloud.

![stack](https://img.shields.io/badge/Next.js-16-black) ![three](https://img.shields.io/badge/three.js-r186-049ef4)

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000. On first run, a `data/` folder is created and filled with a few sample films so the shelf isn't empty. Delete them whenever you like.

### As a desktop app

```bash
npm install
npm run desktop
```

This builds the app and opens it in its own window (Electron). The desktop app keeps its library in its own folder, not in the project's `data/`: `~/Library/Application Support/Movie Library/data` on a Mac, `%APPDATA%\Movie Library\data` on Windows. **File › Show Library Folder** opens it. To bring your browser library across, quit the app and copy the contents of the project's `data/` folder there.

To use **one library** for both `npm run dev` and the desktop app, point the dev server at the app's folder in `.env.local`:

```
CINEMA_DATA_DIR="/Users/<you>/Library/Application Support/Movie Library/data"
```

Both then read and write the same files. Avoid editing the same film in both at once (the last save wins).

To build an app you can install or share:

```bash
npm run dist:mac
```

This makes `dist/Movie-Library-mac-arm64.dmg` and `Movie-Library-mac-x64.dmg` (Apple Silicon and Intel, each with a `.zip`). They're ad-hoc signed, not notarized (that needs a paid Apple Developer ID), so the first time one is opened on another Mac, macOS blocks it: click **Done**, then **Open Anyway** under System Settings › Privacy & Security. Setting a wallpaper asks once for permission to control System Events. Windows: `npm run dist:win` on a Windows PC makes `Movie-Library-windows-x64-setup.exe`.

**Releases:** push a version tag (`git tag v0.1.0 && git push origin v0.1.0`) and GitHub Actions builds the Mac and Windows apps and attaches them to a GitHub release (`.github/workflows/release.yml`). The intro page links to the latest release's files by these names.

**Updates:** the installed app checks the latest GitHub release once a day (and whenever you choose **Check for Updates…**, in the app menu on a Mac or Help on Windows). When there's a newer version it offers **Download**, which opens the right installer for your computer; install it as before and your library stays put. It doesn't install updates itself, because Electron's built-in updater needs a paid Apple Developer ID on a Mac. Raise `version` in `package.json` before tagging, since that's what the check compares.

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
  portraits/          small cast portraits (about 14 KB each), for the People pages
  people/             what TMDB knows about each person you've opened (bio, films)
  settings.json       your TMDB key and the collection background you picked
```

`data/` is git-ignored, so cloning the repo gives everyone their own empty cinema. To keep your library somewhere else (a synced folder, for example), set `CINEMA_DATA_DIR=/absolute/path` in `.env.local`.

## Using it

- **Collection**: filter by All / Watched / To Watch, and the heart for favorites only; search across title, director, cast and tags; sort by date added, date watched, rating, title or year, with a button that flips the order; switch between grid and list.
- **Card buttons** (on hover, bottom-right of the poster): the framed-picture button puts that film's backdrop behind your collection (click again to remove it). The laptop button sets it as your **desktop wallpaper** on macOS, Windows or GNOME Linux. A web page can't change your wallpaper, but this app's server runs on your own computer, so it asks the operating system. It uses the full-size backdrop from TMDB when it can. On a Mac, the first time, macOS asks whether your terminal may control System Events: allow it. A full-screen browser window is its own Space with its own wallpaper, so if you click while full screen, the change waits until you're back on your desktop.
- **People**: the People tab (next to Films) shows everyone in the cast or directing your films, most watched first, each with the films of theirs you have. A **Cast / Directors** toggle switches between the two; someone who's been both is labelled with both. A person's page has their photo and bio, your films with them (and your average rating), and what else they're **known for** (and **directed**): add one to To Watch in one click, or mark it Watched (which opens the usual review step). Cast and director names on a film's page link there too. Only portraits and text are saved; posters of films you don't have are shown from TMDB until you add them. Films added before People existed are linked to TMDB the first time you open People.
- **Film page**: everything saves automatically as you type. Status, favorite, half-star rating, viewings (rewatches add a date), story, review, highlights (with an optional timestamp), notes, tags and cast.
- **The scene**: the sun/moon button turns the world outside between night (stars, galaxy, a lakeside town) and day (blue sky, a few clouds, snowy mountains, a flower meadow): like two stacked cards, the one in front swings away from the window's bottom-left corner to reveal the other, and your choice is remembered. The cloud button makes it rain over either world: grey clouds roll in, rain falls outside, drops bead and run down the window glass, and a soft rain sound mixes in with the jazz. Click the lamp to turn it off for a moonlit room; the cat falls asleep. Click the cat to pet it. The camera drifts gently with your pointer.
- **Music**: click the little CD next to the lamp for lo-fi jazz (the CD spins while it plays). It's composed live in your browser, so it's original, needs no audio files, and never repeats exactly. Click again to pause. Hover the CD or the rain button for a volume slider. Details: [docs/music.md](docs/music.md).

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

## Support

Enjoying your cinema? Click the steaming mug on the windowsill, or [buy me a coffee on Ko-fi](https://ko-fi.com/wz314) ☕

## The intro page

`site/` is the public page (plain HTML and CSS, no build step): what Movie Library is, the downloads and how to get started. Preview it with any static server, for example `python3 -m http.server -d site`. GitHub Actions publishes it to GitHub Pages when it changes on `main` (`.github/workflows/pages.yml`; one-time setup: repo Settings › Pages › Source: GitHub Actions). Its screenshots were taken from a demo library of the sample films, never anyone's own.

## License

[MIT](LICENSE): use, change and share it freely, keeping the copyright notice. Releases up to v0.1.0 were published under CC0 1.0. Film data and images come from TMDB: this product uses the TMDB API but is not endorsed or certified by TMDB.

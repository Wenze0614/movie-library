# Open questions & next steps

Decisions I made with a sensible default, for you to confirm or change. Each says where to change it.

## Questions for you

### 1. Should your library be committed to the repo?
**Now:** `data/` is git-ignored. Anyone who clones gets an empty cinema with sample films, and your notes stay private.
**Alternative:** if you want the repo itself to show *your* collection, remove `/data/` from `.gitignore`. Or keep your library in a separate private repo and point `CINEMA_DATA_DIR` at it. Remember posters from TMDB are copyrighted images; committing them to a public repo is a grey area.

### 2. Is "showcase" public?
**Now:** it runs locally with no authentication. If you want a public page others can browse (read-only), the natural next step is a **static export**: a build mode that renders the collection to static HTML with editing turned off. It could be deployed to GitHub Pages / Vercel. Want this?

### 3. Hero height ✅ decided
Lands at ~68vh and collapses into a sticky ~34vh banner while scrolling (see architecture.md → "Collapsing sticky hero"). Open to tuning: on very wide, short screens the banner crops the window down to the lake and hills.

### 4. Night only, or follow the clock?
The scene is always night, with a lamp you can switch off. The Blender draft colours were daytime. A time-of-day mode (dusk, night, dawn, from your local clock) would fit the existing shader uniforms well. Want it?

### 5. Unused source assets
`black cat 3d model.fbx`, `cat ref.png` and `ref.png` are in the project root and not used by the app. Keep them in the repo (maybe move them into an `art/` folder), or leave them out? `windowsill.blend` is worth keeping as the source of the GLB. `*.blend1` autosaves are git-ignored.

### 6. Ivy texture
The ivy texture was copied (downscaled 8K → 2K) from `~/Downloads/ivy vine 3d model/…`. Check that its licence allows redistribution if the repo goes public.

### 7. Rating scale
Half stars out of 5, like Letterboxd. If you'd prefer 10-point scores, it's one constant in `Stars.tsx` plus the type comment.

## Roadmap ideas (roughly by value)

1. **Letterboxd import**: read the CSV export (`diary.csv`, `ratings.csv`, `reviews.csv`, `watchlist.csv`) into `data/`, optionally enriched with TMDB. You already have history there, so this is probably the biggest win.
2. **Export / backup**: download the whole library as one JSON or Markdown zip.
3. **Stats page**: films per month, rating distribution, favourite directors and genres; a small chart in the same visual language.
4. **Lists / shelves**: "Ghibli", "Rainy day films", built on tags or as their own entity.
5. **Posters in the 3D scene**: framed favourites on the wall beside the window.
6. **Markdown in notes**: render headings, lists and links in reflections and notes when not focused.
7. **Search inside notes**: include review, reflections and notes in collection search (cheap; just extend the haystack in `Collection.tsx`).
8. **Static export** for a public, read-only showcase (see Q2).

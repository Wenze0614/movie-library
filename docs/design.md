# Design

The mood: **a warm room on a cool night**. The 3D scene supplies the night (navy and violet sky, amber lamp). The UI below is the warm paper of a notebook: cream paper, terracotta accents, typewriter labels.

## Palette (`:root` in `globals.css`)

| Token | Hex | Use |
| --- | --- | --- |
| `--night` | `#140d0b` | page background, footer |
| `--paper` | `#f3e5d0` | the sheet holding the collection |
| `--card` | `#fbf4ea` | cards, inputs, highlights |
| `--ink` / `--ink-soft` / `--ink-faint` | `#2c1e15` / `#6e5747` / `#a08b78` | text hierarchy |
| `--accent` | `#c8642c` | active filters, primary buttons, favorite |
| `--star` | `#d8712a` | rating stars |
| `--cream` | `#f6ead8` | text over the 3D scene |

Scene colours come from your Blender draft: beige plaster `#e3c6a2`, terracotta frame `#a4503c`, orange shade `#e88b3c`, white mug `#f1ece4`. They're set in `Experience.load` and `materials.ts`.

## Type

| Role | Font | Where |
| --- | --- | --- |
| Script | Allura | the site title only |
| Display | Cormorant Garamond | headings, film titles, filters, quotes |
| Body | Lora | long-form writing (story, reflections, notes) |
| Mono | Courier Prime | labels, meta, dates, buttons |

All are loaded with `next/font/google` and self-hosted at build time.

## Components & patterns

- **Hero**: the 3D scene is about two-thirds of the screen when you land and collapses into a sticky banner of about a third as you scroll, so the windowsill stays visible. The title shrinks as it collapses. Top right is a frosted pill holding only **Add film** and the **key** button (a green dot means TMDB is connected); on phones "Add film" becomes "+".
- **Sheet**: paper with a subtle SVG grain. Its rounded top edge is pinned to the bottom of the banner, and content slides under it with a soft fade.
- **Collection header**: no title (it's your own library), just the subtitle in large italic and the counts. Below it, on the left, a pill holding All / Watched / To Watch (like the header's pill) and a hollow-heart toggle for favorites only, which fills in like the lamp. On the right: search, then the sort as one pill in two parts (what to sort by | a button whose bars-and-arrow icon flips for ascending), then grid/list. All controls share one height (`--control-h`).
- **Cards**: 2:3 poster, title, year, stars (or a "To watch" tag), and a heart badge for favorites. They lift on hover and fade in with a stagger on load. On hover, two small dark-glass buttons (styled like the scene controls) appear at the poster's bottom-right: desktop wallpaper and collection background. The background one stays lit while it's in use.
- **Collection background**: the chosen backdrop is washed into the top of the paper (62% opacity, slightly sepia, fading out by ~760 px); the subtitle gets a soft paper glow to stay readable.
- **Placeholder posters**: films without a poster get a generated night scene (a moon and hills, colours hashed from the title) so the grid never looks broken.
- **Film page**: no separate edit mode. Every text area *is* the document, styled as ruled notebook lines and saved automatically. Catalog fields (title, year, cast…) sit behind "Edit details" so they don't clutter reading.
- **Highlights**: pull-quote cards with an accent rule and an optional timestamp.

## Accessibility

- Rating stars are a keyboard slider (arrow keys, Backspace clears).
- The collection filter and the film page's status use radio semantics; the heart and the card's background button are toggle buttons (`aria-pressed`).
- The lamp has a real button, so the scene isn't mouse-only.
- `prefers-reduced-motion` stops CSS animations, camera drift, twinkling and shooting stars.

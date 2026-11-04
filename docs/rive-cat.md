# The 2D cat (Rive)

The cat on the windowsill is a 2D Rive animation drawn over the 3D scene. That lets its tail hang *out* of the scene, over the paper's edge, and lets the eyes and ears animate in a hand-drawn style.

```
art/rive-cat/
  generate.py      source of truth: writes scene.rml (shapes, animations, state machine)
  scene.rml        generated; Rive's text format (ids get written back by the CLI)
  rive.yaml
public/rive/
  cat.riv          the built file the site loads (~6 KB)
  rive.wasm        Rive runtime, copied from node_modules on `npm install`
src/components/useRiveCat.ts   loads the .riv, positions it, drives its inputs
src/three/catStyle.ts          CAT_STYLE = '2d' | '3d' switch
```

## Rebuilding

Needs the Rive CLI (`~/.rive/bin` on your `PATH`).

```bash
npm run cat
```

That runs `generate.py`, builds with `rive . --once`, and copies `build/cat.riv` to `public/rive/`. Reload the page to see it.

To check your work headless (renders a PNG without opening a window):

```bash
cd art/rive-cat
rive . --verify && rive inspect . --summary         # errors / wiring problems
rive . --screenshot=rest.png --advance=1             # first frame
rive . --screenshot=tail.png --advance=100           # tail swung right
rive . --screenshot=pet.png --pointer=click@470,190 --advance=30
LAMP_DEFAULT=false python3 generate.py && rive . --screenshot=off.png --advance=60; python3 generate.py
```

`rive .` with no flags opens a live preview window that rebuilds on save.

## How it's put together

**Artboard** is 600 × 480 with a transparent background. **`y = 290` is the sill line**: the cat lies on it and the tail hangs below it.

The head is two nested nodes. `Head` carries the breathing bob, and `HeadPose` inside it carries the sleep and pet poses. That way the two never fight over the same property, and the head keeps breathing while it rests on the paws. The paws are drawn *behind* the body, so they peek out from under the chest.

| Animation | What it does | Layer |
|---|---|---|
| `Breathe` | torso swells, head bobs (4 s loop) | Breathe |
| `TailSway` | tail swings right, rest, left, rest, then a tip flick (7.3 s loop); keyframes the tail path's vertices | Tail |
| `EarTwitch` | right ear double-twitch every 7 s | Ears |
| `Awake` | eyes half-lidded and grumpy, one blink per 5 s | Eyes |
| `Asleep` | lamp off: head lowers forward onto the paws, eyes close, ears relax (eased in over ~1 s) | Eyes |
| `Pet` | happy closed eyes, head tilt, ear flattens; then back to awake or asleep | Eyes |
| `LampOnLook` / `LampOffLook` | warm or cool rim light on the shoulders, crown and paw | Light |

**State machine `Cat`**, inputs:
- `lampOn` (bool, default true): off sends the cat to sleep and cools the rim light.
- `pet` (trigger): plays `Pet`. A click on the cat's body or head also fires it inside Rive, which is handy for `--pointer` tests. On the site, clicks go through the 3D scene, and `HeroScene` fires the trigger.

These use Rive's older state-machine *inputs* rather than view-model data binding. They're simpler to drive from the web runtime and fully supported.

## Placement on the page

`Experience` maps artboard pixels onto the 3D sill (`CAT_ART` in `src/three/Experience.ts`):
- artboard `x = 0` sits at world z = 4.78, with x running toward −z (screen right);
- `y = 290` is the sill top (y = 0.137), at depth x = 1.95;
- 124 artboard px = 1 world unit.

Every frame it projects that sill line to the screen and reports the cat's rectangle. `useRiveCat` moves and scales the cat's `<canvas>` there with a CSS transform. Re-sizing a canvas's drawing surface clears it (the cat blinked as the camera drifted, and constantly while resizing the window), so that only happens once the size has settled after a real change (over 10%, 250 ms after the last change) or the pixel density changes, and the frame is redrawn at once. The canvas lives in `.cat-layer`, which comes *after* the paper lip in the DOM and has a higher z-index. That ordering is what lets the tail hang over the paper in every browser. The layer ignores pointer events.

The GLB cat is still in the scene, but invisible (`colorWrite = false`). It keeps casting the cat's shadow onto the sill from the lamp. Clicking the cat is a hit test on the artboard area (`CAT_ART.hit`).

Set `CAT_STYLE = '3d'` in `src/three/catStyle.ts` to switch back to the 3D cat with shader fur.

## Drawing your own in the Rive editor instead

The file is plain Rive, so you can replace it with art made in the editor. Keep these four things and nothing else needs to change:

1. One artboard, **600 × 480**, transparent, with the cat lying on **y = 290**.
2. A state machine named **`Cat`**, set as the artboard's default.
3. A boolean input **`lampOn`** and a trigger input **`pet`**.
4. Export the `.riv` to `public/rive/cat.riv`.

A different size works too: update `CAT_ART` (`width`, `height`, `sillY`, `pxPerUnit`) to match.

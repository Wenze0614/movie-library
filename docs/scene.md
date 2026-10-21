# The windowsill scene

Everything lives in `src/three/`. `Experience` is the entry point. React creates it once with a container element and calls `dispose()` on unmount.

## What's in the GLB

Measured from `public/models/windowsill_scene.glb`. Coordinates are three.js world space (Y up). Blender's Z-up is converted on export: Blender `(x, y, z)` becomes three `(x, z, -y)`.

| Node name | What | World bounds (approx.) | Material in code |
| --- | --- | --- | --- |
| `window_sill` | the sill board | x −2…2, y −0.14…0.14, z ±5.7 | `woodMaterial` (cream, faint grain) |
| `wall` | back wall with window hole + two side walls | x −2.4…2, y −0.4…5, z ±6 | `plasterMaterial` |
| `window_wood` | window frame | x −2.2…−1.8, y 0.7…4.4, z −4.7…4.0 | `woodMaterial` (terracotta) |
| `cat` | sleeping black cat; tail hangs over the front edge at z ≈ 3.5…4.3 | x 0.75…3.1, y −1.0…1.2, z 0.3…4.4 | 2D mode (default): invisible, shadow only, with the [Rive cat](rive-cat.md) drawn on top. 3D mode: `catMaterial` + 12 fur shells |
| `mug` | hollow mug, inner radius ≈ 0.26 | centre (0, ·, −1.87), y 0.12…0.72 | `ceramicMaterial` + a coffee disc |
| `table_light` | lamp: base + pole + dome shade, one mesh | centre (−0.9, ·, −3.84), shade y 0.8…1.84 | `lampMaterial` |
| `tree_branch_1/2` | ivy outside the window (UV-mapped) | x −3.8…−2.0 | `ivyMaterial` + `textures/ivy_basecolor.jpg` |

Camera-wise, **screen-right is −Z**. The cat is on the left, the lamp on the right.

**Materials are assigned by node name** (`byName` in `Experience.load`). If you rename an object in Blender, update that map. Unknown meshes fall back to plaster, so new objects show up immediately.

Added in code, so any screen shape looks complete:
- a front wall with a hole around the alcove, and a ceiling over it (`addRoomShell`)
- a coffee surface, a glowing bulb, steam, dust (`addProps`)
- the sky and landscape outside (`outside.ts`)

## Lighting model (`glsl.ts → roomLight`)

All room materials are `ShaderMaterial`s sharing one set of uniforms (`createSharedUniforms`), so the whole room responds together:

- **Lamp**: a point light at the bulb with soft wrap diffuse and `1 / (1 + 0.32·d²)` falloff. A *cone mask* lets full light out only below the shade's rim, with ~22% leaking through the fabric. A real `THREE.PointLight` exists only to render **shadows**: the shaders include three's shadow chunks and call `getShadowMask()`. The lamp mesh itself doesn't cast shadows, because its shade surrounds the light.
- **Window light**: cool starlight from `uMoonDir` (upper right). `windowLight()` traces each point towards the light and masks it by the window opening, so the window casts a soft, slanted light patch onto the sill and the cat. The penumbra widens with distance.
- **Bounce**: a wide, soft warm term from the lamp, standing in for light scattered off the sill and walls.
- **Ambient**: two-tone hemisphere, warm from below. It turns cool blue when the lamp is off.
- **Contact shadows** (`roomAO`, plaster and wood only): darkens the creases where the sill meets the walls and ceiling, plus sphere occluders under the mug, the lamp base and along the cat's body. If you move those objects in Blender, update `OCC` in `glsl.ts`.
- **Lamp toggle**: `uLamp` eases between 0 and 1. The shade, bulb, steam colour, dust and star brightness all follow it.

### Per-object tricks

- **Lamp shade vs stand**: on load, each vertex gets an `aShade` attribute (1 = dome). This is decided by height and distance from the pole. The shade glows from inside like paper, brightest at the open rim.
- **Cat**: near-black albedo. What makes it read is the **rim light**: warm on the lamp side, cool on the window side. Its vertex shader breathes (body region, z 1.1…3.5) and sways the hanging tail. **Fur** is 12 shells of the same geometry pushed out along the normal and cut into strands with 3D noise sampled at the *un-pushed* position, so strands line up across shells.
- **Ivy**: double-sided, backlit by the sky, with world-space wind sway that grows towards the lower leaves. glTF UVs need `texture.flipY = false`.
- **Mug**: the inner wall darkens towards the coffee level, and the coffee is a disc with a slow swirl and a sharp lamp highlight.

## Outside the window (`outside.ts`)

Two procedural planes give real parallax when the camera drifts:

- **Sky** (x = −28)
- **Landscape** (x = −12), transparent wherever there's sky

Each plane paints **two worlds**:

| | Sky | Landscape |
|---|---|---|
| **Night** | dusk gradient, Milky Way, spiral galaxy, three star layers (anti-aliased with `fwidth`, twinkling), a shooting star every ~9 s | fbm mountains, hills with twinkling town lights and a warm haze, a tiered pine tree line, a lake mirroring the town lights. `uShore` sets the waterline. |
| **Day** | pale-to-deep blue gradient, a sun (upper right, the side daylight enters the room from), a few drifting cumulus lit from above (raise the threshold in `daySky` for fewer) | snowy far peaks with a sun side and haze, a nearer blue-green range, rolling hills with round leafy trees, drifts of tiny wildflowers on the hills, a foreground meadow of swaying grass with three layers of flowers in five colours (`flowers()`: bigger blooms up close) |

Coordinates inside these shaders are `vP = (−z, y)` in world units, so "x" reads left-to-right on screen.

### The day/night swap

The two worlds are like two cards stacked in the window. The front one (`uFront`) is pinned at the window's bottom-left corner and swings a quarter turn anticlockwise (`uSwing` 0 → 1), lifting away off the left of the window and revealing the other world, which stays still behind it. The `SWING` snippet maps each pixel onto the swung card (`cardCoord`); pixels off the card show the back world. The card has a thin cardboard-coloured edge and casts a soft shadow on the world it reveals.

- **Pivot:** each plane gets its own `uPivot`, where the camera's ray through the window corner (`SWING_CORNER`) meets that plane. It's re-aimed every frame (`aimSwing`), so the sky and the landscape swing around the same point on screen even while the camera drifts.
- **Driven by:** `Experience.setDay(day)`. A 1.1 s ease-in-out moves the swing, while `uDay` (0 → 1) moves the room light: the window light becomes warm sunshine and the ambient turns bright and cooler (`DAYLIGHT`). The ivy brightens too. The lamp stays your choice. The front card changes only at rest, so clicking again mid-swing swings the same card back.
- **Saved:** the choice goes to `localStorage` (`cinema.day`) and is restored without the animation.
- **Cost:** only the front world is computed at rest. Both are computed only mid-swing, and that choice comes from a uniform, so `fwidth` stays valid.
- **The button** is a porthole onto a tiny wheel holding a moon and an upside-down sun. It turns 180° in the same 1.1 s.

### Rain (`weather.ts`, plus the `WEATHER` snippet in `outside.ts`)

Rain is a layer on top of either world, driven by one uniform, `uRain` (0 → 1 over 2.5 s, from `Experience.setRain(rain)`):

- **Grey clouds:** the sky shader mixes towards `overcast()`: layered fbm cloud, blue-grey by day and charcoal by night, with a faint warm glow from the town on the low clouds. At full rain it covers the sky completely, galaxy and sun included.
- **Wet land:** `rainyLand()` desaturates and darkens the landscape and fades the far ranges into mist (`rainMist()`), so the mountains recede.
- **Streaks outside:** a transparent plane between the window and the hills, with three layers of slanted streaks at different sizes and speeds for parallax.
- **Drops on the glass:** a plane in the window opening. Each drop is shaded as a tiny lens (`lens()`): a clear middle, a darker rim and one small sharp highlight (warm from the lamp at night, white by day). Beads sit still on a jittered grid, one runner per column slides down with a wiggle and leaves a trail of tiny beads, and the bottom of the glass mists a little. It blends premultiplied, so drops can both darken and glint.
- **Room light:** the window light dims to `RAIN_LIGHT.window` and the ambient to `RAIN_LIGHT.ambient`, tinted cool grey.
- **Sound:** see [music.md](music.md#rain).
- **Saved** to `localStorage` (`cinema.rain`), separately from day/night. The weather meshes are hidden while it's dry, so rain costs nothing when off.

Stars use a steep magnitude curve (most are faint pinpricks; only the brightest get a halo and a four-point flare). The town is clustered in noise patches that thin towards the hilltop, and the pines open into clearings around it.

> **NaN warning.** With bloom on, a single NaN pixel gets blurred across the whole frame, which renders as a fully **black** scene. GLSL's `pow(x, y)` is undefined for `x < 0`, and dividing by `fwidth()` can hit zero, so clamp bases and guard divisors. `isnan()` is unreliable on Metal/ANGLE. To find the culprit, hide meshes one at a time.

## Camera (`fitCamera`)

**Wide screens (aspect ≥ 1.6)** use a long lens from far away (`CAMERA.distance` = 22). That flattens perspective so the alcove's side walls shrink to thin slivers. The field of view is derived from the aspect ratio, so `coverHalfWidth` (half the alcove's width at x = 0) exactly fills the screen. The camera then slides vertically until `CAMERA.floor` (the sill's front edge) sits on the bottom of the frame. Because the composition is bottom-anchored, the collapsing banner (which clips from the top) keeps the sill, cat, mug and lamp in view.

**Narrow screens** (phones) back away until `SCENE.frameNarrow` (cat, mug, window) fits.

Pointer parallax and a slow idle drift move the camera slightly. `prefers-reduced-motion` turns both off and slows everything.

To reframe: `coverHalfWidth` (bigger shows more side wall and more height), `direction` (more y looks down onto the sill), `floor` and `distance`. The sky is composed for this camera, so if you change the eye height a lot, recheck the galaxy position in `outside.ts`; the window only shows a slice of the far sky plane.

## Post-processing (`post.ts`)

`RenderPass` → `UnrealBloomPass` (threshold 1.0, so only HDR highlights bloom: bulb, shade rim, stars, town) → `OutputPass` (Neutral tone mapping + sRGB) → film pass (lifted warm shadows, vignette, animated grain). MSAA ×4 on the HDR target.

## Performance

The scene is ambient, so it's tuned to stay cool on a laptop. Settings are in `PERF` in `Experience.ts`.

| What | Why |
|---|---|
| **30 fps idle, 60 fps while you interact** (pointer over the scene, lamp fading, day/night swapping, rain fading; 1.5 s hold) | The display may refresh at 120 Hz; slow ambient motion doesn't need it. This is the biggest saving. |
| **Shadow map drawn once** (`shadowMap.autoUpdate = false`) | Nothing that casts a shadow moves. A point-light shadow is 6 extra scene renders per frame. |
| **Bloom at half resolution** (`bloomScale`) | It's a soft glow; nobody can tell. |
| **Pixel ratio capped at 1.5** | Retina at 2× costs ~78% more pixels for no visible gain under the film grain. |
| **Sky and landscape drawn after the room** | The depth test then skips every sky pixel the walls hide. The landscape blends instead of using `discard`, which would defeat that. |
| **Stops when the tab is hidden** | `visibilitychange` |

Measured at Retina resolution on this project's machine: about 6.3 ms of GPU per frame at every refresh before, about 3.8 ms per frame at 30 fps after. Roughly 85% less GPU time while idle on a 120 Hz display.

The Rive cat draws on its own small canvas. The runtime has no frame cap, but vector drawing at that size is cheap.

To profile, time `render()` in a loop with a 1-pixel `gl.readPixels` after each frame. `gl.finish()` alone doesn't wait for the GPU in Chrome.

## Updating the model from Blender

1. Keep the object names in the table above, or update `byName` in `Experience.ts`.
2. Export **glTF Binary (.glb)**, +Y up (default). Materials aren't needed. UVs are needed only for textured objects (the ivy).
3. Replace `public/models/windowsill_scene.glb`.
4. If you moved the lamp, mug or cat, update `SCENE` in `Experience.ts` (bulb position, mug centre, cat head for the purr bubble). The shader masks for the tail and breathing use world positions; see `CAT_DEFORM` in `materials.ts`.
5. To check bounds quickly, a Node script with `GLTFLoader.parse` works (that's how the table above was produced).

## Ideas that fit the current structure

- **Posters on the wall**: framed textures of your favourite films hung beside the alcove, read from the library.
- **Time-of-day**: drive the sky palette, `uLamp` and moon colour from the local clock (dusk, night, dawn).
- **Thunder**: a rare flash that lifts `uMoonColor` for a frame or two, with a low rumble in `RainSound`.

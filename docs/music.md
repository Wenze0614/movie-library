# The music (generative lo-fi jazz)

The CD button next to the lamp plays jazz that is **composed and synthesized live in the browser**, in [`src/audio/LofiJazz.ts`](../src/audio/LofiJazz.ts). There are no audio files, so there's nothing to license. It's original by construction, works offline, and never loops exactly.

## What's playing

A slow (70 BPM), swung, happy combo in B♭:

| Part | How it's made |
|---|---|
| **Vibraphone (melody)** | A pure sine bar tone with a soft 4th-partial shimmer, a long natural ring and the vibes "motor" tremolo. Plays **two-bar phrases** in about 80% of phrases after the intro: strong beats land on sweet chord tones (3rds, 6ths, 7ths, 9ths), weak beats move stepwise through notes that don't clash with the chord, each line rises then falls (or the reverse) and ends on a held note, with the odd bluesy slide up from a half step below. |
| **Electric piano** | Warm FM synthesis (a sine carrier, a gentle decaying modulator and a soft tine) through a chorus and a 2.6 kHz low-pass. Comps rootless jazz voicings, picking one of six rhythms per bar and sometimes pushing the next chord early. Lighter patterns under a melody phrase. |
| **Upright bass** | A low-passed triangle with a woody pitch thump, sitting low in the mix. Two-feel (root on 1, fifth/octave/root on 3) with chromatic approach notes into the next bar. |
| **Brushed drums** | Soft sine kick, filtered-noise brush swishes on 2 and 4, a dark swung ride ("ding, ding-da ding") and a quiet hi-hat foot. |
| **Character** | Vinyl hiss and pops, tape wobble (slow pitch drift), a generated reverb (more on the vibes), a warm 5.2 kHz low-pass, soft saturation and a gentle compressor. |

**Harmony:** six bright 4-bar progressions: ii–V–I–VI, iii–VI–ii–V, I–IV–iii–VI, I–vi–ii–V, IV–iii–ii–V and I–II–ii–V. A new one is picked most of the time every 8 bars. It starts with piano alone, the bass joins at bar 3, and the drums and melody at bar 5, with an occasional drum break. Timing and velocity are humanized.

## How it plays

- The `AudioContext` is created on the first click (browsers require a gesture before sound). It's shared with the rain (`sceneAudio.ts`), so the two mix.
- Notes are scheduled ~1.2 s ahead on a 150 ms timer, so a busy page never causes gaps. Tabs playing audio aren't throttled, so it keeps going in the background.
- **Pause** fades out over 0.7 s. Once neither the jazz nor the rain is playing, the audio engine is suspended and uses no CPU.
- Measured cost: 45 s of music renders offline in ~3 s, so live playback uses a small slice of one core.

## Tweaking

All at the top of `LofiJazz.ts`:

- `BPM`: tempo. `SWING`: 0.5 is straight, ~0.66 is triplet swing.
- `KEY`: semitones from C (−2 = B♭).
- `PROGRESSIONS`: add chords as `c(bassMidi, [voicing midi notes])`, written in C.
- `COMPING`: piano rhythms as `[eighth slot 0–7, length in beats]`.
- `PHRASES`: two-bar melody rhythms as `[eighth slot 0–15, length in eighths]`. Melody density: the `0.8` in `scheduleBar`.
- Mix levels: the `bus(...)` calls in the constructor (level, reverb send, low-pass) and `PLAY_LEVEL`.

To hear changes without the site, `LofiJazz.renderClip(seconds)` renders to an `AudioBuffer` with an `OfflineAudioContext`.

## Rain

`RainSound.ts` synthesizes the rain from pink noise; there are no audio files:

- **Hiss:** band-limited noise (450 Hz – 4.8 kHz) that swells in slow gusts (a 0.07 Hz LFO).
- **Patter:** the same noise low-passed at 700 Hz, underneath.
- **Taps:** about nine tiny band-passed clicks a second at random, panned across the stereo field, with an occasional fuller "plip" from a bigger drop.

It fades in over 2.5 s and out over 2 s with the rain button. `LEVEL` sets the volume: it sits about 11 dB under the jazz (RMS, measured with `RainSound.renderClip` and `LofiJazz.renderClip`), so it stays in the background. Rain restored on page load starts its sound on the first click of any scene button, since browsers need a gesture first.

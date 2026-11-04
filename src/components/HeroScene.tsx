'use client';
import { useEffect, useRef, useState } from 'react';
import type { Experience, HoverTarget } from '@/three/Experience';
import { CAT_STYLE } from '@/three/catStyle';
import { sceneAudio } from '@/audio/sceneAudio';
import { MusicButton } from './MusicButton';
import { useRiveCat } from './useRiveCat';

const PURRS = ['purr…', 'mrrp', 'zzz', 'prrr', '♥'];
const DAY_KEY = 'cinema.day';
const RAIN_KEY = 'cinema.rain';
const HOVER_LABEL: Record<Exclude<HoverTarget, null>, string> = { lamp: 'toggle the lamp', cat: 'pet' };

/** How far the page scrolls while the hero collapses into the banner (0 on film pages). */
function collapseRange(scene: HTMLElement | null, probe: HTMLElement | null) {
  if (!scene || !probe) return 0;
  const full = scene.offsetHeight;
  return full - Math.min(probe.offsetHeight, full);
}

/**
 * Collapses the hero from --hero-full to --hero-banner as the page scrolls by
 * writing --hero-vis and --hero-progress on the hero element. Only CSS clipping
 * changes while scrolling; the canvas itself never resizes. (On the hero, not
 * <html>: custom properties are inherited, so changing them on <html> made the
 * browser restyle the whole page, film grid included, on every frame.)
 */
function useCollapsingHero(scene: React.RefObject<HTMLDivElement | null>, probe: React.RefObject<HTMLDivElement | null>) {
  /** Applies the current scroll right away (the glide calls it in the same frame it scrolls). */
  const sync = useRef<() => void>(() => {});
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const root = scene.current?.closest<HTMLElement>('.hero');
      if (!root || !scene.current || !probe.current) return;
      const full = scene.current.offsetHeight;
      const range = collapseRange(scene.current, probe.current);
      const scrolled = Math.min(Math.max(window.scrollY, 0), range);
      root.style.setProperty('--hero-vis', `${full - scrolled}px`);
      root.style.setProperty('--hero-progress', range > 0 ? (scrolled / range).toFixed(4) : '1');
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    sync.current = () => {
      cancelAnimationFrame(raf);
      update();
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    // Also fires when the page switches between full and banner heights.
    const ro = new ResizeObserver(schedule);
    if (scene.current) ro.observe(scene.current);
    if (probe.current) ro.observe(probe.current);
    return () => {
      cancelAnimationFrame(raf);
      sync.current = () => {};
      window.removeEventListener('scroll', schedule);
      ro.disconnect();
    };
  }, [scene, probe]);
  return sync;
}

/** The glide between the two resting states: the full hero and the collapsed banner. */
const SNAP_MS = 600;
/** Wheel events closer together than this belong to the same gesture (or its momentum). */
const GESTURE_GAP_MS = 180;
/** After touch, keys or the scrollbar stop for this long, a half-collapsed hero finishes its move. */
const SETTLE_MS = 160;

/** Moves at once and settles gently, like trackpad momentum (ease-in-out felt sluggish, then rushed). */
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * The hero never rests half collapsed. While it's collapsing (the page between
 * the top and the collapse point), scrolling down glides to the collapse point
 * and scrolling up glides back to the top. Below that, the collection scrolls
 * normally.
 *
 * The wheel is handled by direction, since one notch is much smaller than the
 * collapse. (CSS scroll snapping picks the snap point nearest to where the
 * notch would land, so it kept bouncing back to the top.) The rest of a
 * trackpad gesture, momentum included, is absorbed until it pauses, so it
 * doesn't fling on into the list. Touch, keys and the scrollbar finish the move
 * in the direction they were going once they stop.
 */
function useHeroSnap(
  scene: React.RefObject<HTMLDivElement | null>,
  probe: React.RefObject<HTMLDivElement | null>,
  syncHero: React.RefObject<() => void>,
) {
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const range = () => collapseRange(scene.current, probe.current);
    let frame = 0;
    let gliding = false;
    let absorbing = false; // swallowing the rest of the gesture that started a glide
    let lastWheel = 0;
    let lastY = window.scrollY;
    let direction = 0;
    let touching = false;
    let settle: ReturnType<typeof setTimeout> | undefined;

    const glideTo = (target: number) => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
      const from = window.scrollY;
      absorbing = true;
      if (Math.abs(target - from) < 1) return;
      if (reduced.matches) {
        window.scrollTo(0, target);
        return;
      }
      gliding = true;
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min((now - start) / SNAP_MS, 1);
        window.scrollTo(0, from + (target - from) * easeOutCubic(t));
        syncHero.current(); // in this frame, not the next, so the paper and the banner move together
        if (t < 1) frame = requestAnimationFrame(step);
        else gliding = false;
      };
      frame = requestAnimationFrame(step);
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX) || document.querySelector('dialog[open]')) return;
      const now = performance.now();
      const sameGesture = now - lastWheel < GESTURE_GAP_MS;
      lastWheel = now;
      if (gliding || (absorbing && sameGesture)) {
        e.preventDefault();
        return;
      }
      absorbing = false;
      const r = range();
      const y = window.scrollY;
      if (r < 1) return;
      if (e.deltaY > 0 && y < r - 1) {
        e.preventDefault();
        glideTo(r);
      } else if (e.deltaY < 0 && y > 0 && y <= r + 1) {
        e.preventDefault();
        glideTo(0);
      }
    };

    // Touch, keys and the scrollbar: once scrolling stops halfway, finish the move.
    const onScroll = () => {
      const y = window.scrollY;
      if (!gliding && y !== lastY) direction = Math.sign(y - lastY);
      lastY = y;
      clearTimeout(settle);
      if (gliding || touching) return;
      settle = setTimeout(() => {
        const r = range();
        const now = window.scrollY;
        if (gliding || touching || r < 1 || now <= 0.5 || now >= r - 0.5) return;
        glideTo(direction < 0 ? 0 : r);
      }, SETTLE_MS);
    };
    const onTouchStart = () => {
      touching = true;
      cancelAnimationFrame(frame);
      gliding = false;
    };
    const onTouchEnd = () => {
      touching = false;
      onScroll();
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [scene, probe, syncHero]);
}

/** Mounts the three.js windowsill and layers a little DOM on top for hints. */
export function HeroScene() {
  const ref = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const catRef = useRef<HTMLCanvasElement>(null);
  const exp = useRef<Experience | null>(null);
  const cat = useRiveCat(catRef, CAT_STYLE === '2d');
  const [ready, setReady] = useState(false);
  const [lampOn, setLampOn] = useState(true);
  const [day, setDay] = useState(false);
  const [rain, setRain] = useState(false);
  const [hover, setHover] = useState<{ target: HoverTarget; x: number; y: number }>({ target: null, x: 0, y: 0 });
  const [purrs, setPurrs] = useState<{ id: number; x: number; y: number; text: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    let instance: Experience | null = null;
    // three.js is only needed in the browser; load it after first paint.
    import('@/three/Experience').then(({ Experience }) => {
      if (cancelled || !ref.current) return;
      instance = new Experience(ref.current, {
        onReady: () => setReady(true),
        onHover: (target, x, y) => setHover({ target, x, y }),
        onRainChange: (r) => {
          setRain(r);
          void sceneAudio.setRain(r);
          try {
            localStorage.setItem(RAIN_KEY, r ? '1' : '0');
          } catch {}
        },
        onDayChange: (d) => {
          setDay(d);
          try {
            localStorage.setItem(DAY_KEY, d ? '1' : '0');
          } catch {}
        },
        onLampChange: (on) => {
          setLampOn(on);
          cat.setLamp(on);
        },
        onCatFrame: cat.place,
        onPet: (x, y) => {
          cat.pet();
          const id = Date.now() + Math.random();
          const text = PURRS[Math.floor(Math.random() * PURRS.length)];
          setPurrs((p) => [...p.slice(-4), { id, x, y, text }]);
          setTimeout(() => setPurrs((p) => p.filter((b) => b.id !== id)), 2200);
        },
      });
      exp.current = instance;
      // Come back to the world you left (without the turning animation).
      try {
        if (localStorage.getItem(DAY_KEY) === '1') instance.setDay(true, true);
        if (localStorage.getItem(RAIN_KEY) === '1') instance.setRain(true, true);
      } catch {}
    });
    return () => {
      cancelled = true;
      instance?.dispose();
      exp.current = null;
    };
  }, [cat]);

  const syncHero = useCollapsingHero(sceneRef, probeRef);
  useHeroSnap(sceneRef, probeRef, syncHero);

  return (
    <>
      <div ref={sceneRef} className="scene" data-ready={ready}>
        <div ref={ref} className="scene-mount" />
        {hover.target && (
          <span className="scene-hint" style={{ left: hover.x, top: hover.y }}>
            {HOVER_LABEL[hover.target]}
          </span>
        )}
        {purrs.map((b) => (
          <span key={b.id} className="purr" style={{ left: b.x, top: b.y }}>
            {b.text}
          </span>
        ))}
      </div>
      {/* The paper's top edge, then the cat above it so the tail can hang over the paper. */}
      <div className="hero-lip" aria-hidden="true" />
      {CAT_STYLE === '2d' && (
        <div className="cat-layer" aria-hidden="true">
          <canvas ref={catRef} className="cat-canvas" />
        </div>
      )}
      <div ref={probeRef} className="hero-probe" aria-hidden="true" />
      <div className="hero-controls">
        <MusicButton />
        <button
          type="button"
          className="rain-toggle"
          onClick={() => {
            exp.current?.setRain(!rain);
            void sceneAudio.unlock();
          }}
          aria-pressed={rain}
          title={rain ? 'Let the rain clear' : 'Make it rain'}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path className="cloud" d="M7.5 14.5a3.6 3.6 0 0 1-.4-7.2a5 5 0 0 1 9.5 1.3a3 3 0 0 1 .2 5.9z" />
            <path className="drop d1" d="M9 17.2l-.8 2.2" />
            <path className="drop d2" d="M12.6 17.2l-.8 2.2" />
            <path className="drop d3" d="M16.2 17.2l-.8 2.2" />
          </svg>
          <span className="sr-only">{rain ? 'Let the rain clear' : 'Make it rain'}</span>
        </button>
        <button
          type="button"
          className="daynight-toggle"
          onClick={() => {
            exp.current?.setDay(!day);
            void sceneAudio.unlock();
          }}
          aria-pressed={day}
          title={day ? 'Turn to night' : 'Turn to day'}
        >
          {/* A tiny world wheel: the moon on top, the sun hanging below; it turns half a circle. */}
          <svg className="daynight-wheel" viewBox="0 0 34 68" aria-hidden="true">
            <path className="moon" d="M20.5 10.5a7 7 0 1 0 3.2 9.7a5.6 5.6 0 0 1-3.2-9.7z" />
            <g className="sun" transform="rotate(180 17 51)">
              <circle cx="17" cy="51" r="4.2" />
              <path d="M17 42.5v2.2M17 57.3v2.2M8.5 51h2.2M23.3 51h2.2M11 45l1.5 1.5M21.5 55.5L23 57M11 57l1.5-1.5M21.5 46.5L23 45" />
            </g>
          </svg>
          <span className="sr-only">{day ? 'Turn to night' : 'Turn to day'}</span>
        </button>
        <button
          type="button"
          className="lamp-toggle"
          onClick={() => {
            exp.current?.setLamp(!lampOn);
            void sceneAudio.unlock();
          }}
          aria-pressed={lampOn}
          title={lampOn ? 'Turn the lamp off' : 'Turn the lamp on'}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 11 Q6 4 12 4 Q18 4 18 11 Z" />
            <path d="M12 11 V19 M8 20 H16" />
          </svg>
          <span className="sr-only">{lampOn ? 'Turn the lamp off' : 'Turn the lamp on'}</span>
        </button>
      </div>
    </>
  );
}

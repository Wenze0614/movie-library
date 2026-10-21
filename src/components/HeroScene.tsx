'use client';
import { useEffect, useRef, useState } from 'react';
import type { Experience, HoverTarget } from '@/three/Experience';
import { CAT_STYLE } from '@/three/catStyle';
import { useRiveCat } from './useRiveCat';

const PURRS = ['purr…', 'mrrp', 'zzz', 'prrr', '♥'];
const HOVER_LABEL: Record<Exclude<HoverTarget, null>, string> = { lamp: 'toggle the lamp', cat: 'pet the cat' };

/**
 * Collapses the hero from --hero-full to --hero-banner as the page scrolls by
 * writing --hero-vis and --hero-progress on <html>. Only CSS clipping changes
 * while scrolling; the canvas itself never resizes.
 */
function useCollapsingHero(scene: React.RefObject<HTMLDivElement | null>, probe: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = document.documentElement;
    let raf = 0;
    const update = () => {
      raf = 0;
      if (!scene.current || !probe.current) return;
      const full = scene.current.offsetHeight;
      const banner = Math.min(probe.current.offsetHeight, full);
      const range = full - banner;
      const scrolled = Math.min(Math.max(window.scrollY, 0), range);
      root.style.setProperty('--hero-vis', `${full - scrolled}px`);
      root.style.setProperty('--hero-progress', range > 0 ? (scrolled / range).toFixed(4) : '1');
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    // Also fires when the page switches between full and banner heights.
    const ro = new ResizeObserver(schedule);
    if (scene.current) ro.observe(scene.current);
    if (probe.current) ro.observe(probe.current);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule);
      ro.disconnect();
    };
  }, [scene, probe]);
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
    });
    return () => {
      cancelled = true;
      instance?.dispose();
      exp.current = null;
    };
  }, [cat]);

  useCollapsingHero(sceneRef, probeRef);

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
      <button
        type="button"
        className="lamp-toggle"
        onClick={() => exp.current?.setLamp(!lampOn)}
        aria-pressed={lampOn}
        title={lampOn ? 'Turn the lamp off' : 'Turn the lamp on'}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 11 Q6 4 12 4 Q18 4 18 11 Z" />
          <path d="M12 11 V19 M8 20 H16" />
        </svg>
        <span className="sr-only">{lampOn ? 'Turn the lamp off' : 'Turn the lamp on'}</span>
      </button>
    </>
  );
}

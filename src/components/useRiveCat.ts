'use client';
import { useEffect, useMemo, useRef } from 'react';
import type { Rive, StateMachineInput } from '@rive-app/canvas';
import type { CatRect } from '@/three/Experience';

/**
 * The 2D cat: public/rive/cat.riv drawn on its own canvas over the 3D scene.
 * The scene reports where the cat belongs each frame (`place`), and the lamp
 * and petting drive the state machine's `lampOn` / `pet` inputs.
 *
 * Re-sizing a canvas's drawing surface clears it, so the cat would blink until
 * Rive drew again. So each frame only moves and scales the canvas with CSS;
 * the drawing surface is re-sized once things settle, and only after a real
 * change in size (resizing the window) or in pixel density (another screen).
 */
const REBASE_DRIFT = 0.1; // re-size the drawing surface once the CSS scale is off by 10%
const REBASE_AFTER_MS = 250; // …and the size has stopped changing for this long
export function useRiveCat(canvas: React.RefObject<HTMLCanvasElement | null>, enabled: boolean) {
  const rive = useRef<Rive | null>(null);
  const inputs = useRef<{ lampOn?: StateMachineInput; pet?: StateMachineInput }>({});
  const lamp = useRef(true);
  /** The size (and pixel density) the drawing surface was last made for. */
  const base = useRef({ w: 0, h: 0, dpr: 0 });
  const last = useRef<CatRect | null>(null);
  const rebaseTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let instance: Rive | null = null;
    import('@rive-app/canvas').then(({ Rive, Layout, Fit, Alignment, RuntimeLoader }) => {
      if (cancelled || !canvas.current) return;
      // Served locally (copied on install) so the site works offline.
      RuntimeLoader.setWasmUrl('/rive/rive.wasm');
      instance = new Rive({
        src: '/rive/cat.riv',
        canvas: canvas.current,
        stateMachines: 'Cat',
        autoplay: true,
        shouldDisableRiveListeners: true,
        layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
        onLoad: () => {
          if (!instance || cancelled) return;
          instance.resizeDrawingSurfaceToCanvas();
          for (const input of instance.stateMachineInputs('Cat') ?? []) {
            if (input.name === 'lampOn' || input.name === 'pet') inputs.current[input.name] = input;
          }
          if (inputs.current.lampOn) inputs.current.lampOn.value = lamp.current;
          canvas.current?.setAttribute('data-ready', 'true');
        },
      });
      rive.current = instance;
    });
    return () => {
      cancelled = true;
      clearTimeout(rebaseTimer.current);
      instance?.cleanup();
      rive.current = null;
      inputs.current = {};
    };
  }, [canvas, enabled]);

  return useMemo(() => {
    const position = (el: HTMLCanvasElement, rect: CatRect) => {
      el.style.transform = `translate(${rect.x}px, ${rect.y}px) scale(${rect.width / base.current.w})`;
    };
    /** Makes the drawing surface match the cat's current size, then redraws at once. */
    const rebase = (el: HTMLCanvasElement, rect: CatRect) => {
      base.current = { w: rect.width, h: rect.height, dpr: window.devicePixelRatio };
      el.style.width = `${rect.width}px`;
      el.style.height = `${rect.height}px`;
      position(el, rect);
      rive.current?.resizeDrawingSurfaceToCanvas();
      rive.current?.drawFrame();
    };
    return {
      /** Called by the scene whenever the cat's place changes; writes styles directly, no React render. */
      place(rect: CatRect) {
        const el = canvas.current;
        if (!el) return;
        last.current = rect;
        if (!base.current.w) {
          rebase(el, rect);
        } else {
          position(el, rect);
          const drift = Math.abs(rect.width / base.current.w - 1);
          if (drift > REBASE_DRIFT || window.devicePixelRatio !== base.current.dpr) {
            clearTimeout(rebaseTimer.current);
            rebaseTimer.current = setTimeout(() => {
              if (canvas.current && last.current) rebase(canvas.current, last.current);
            }, REBASE_AFTER_MS);
          }
        }
        el.dataset.placed = 'true';
      },
      setLamp(on: boolean) {
        lamp.current = on;
        if (inputs.current.lampOn) inputs.current.lampOn.value = on;
      },
      pet() {
        inputs.current.pet?.fire();
      },
    };
  }, [canvas]);
}

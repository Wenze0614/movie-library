'use client';
import { useEffect, useMemo, useRef } from 'react';
import type { Rive, StateMachineInput } from '@rive-app/canvas';
import type { CatRect } from '@/three/Experience';

/**
 * The 2D cat: public/rive/cat.riv drawn on its own canvas over the 3D scene.
 * The scene reports where the cat belongs each frame (`place`), and the lamp
 * and petting drive the state machine's `lampOn` / `pet` inputs.
 */
export function useRiveCat(canvas: React.RefObject<HTMLCanvasElement | null>, enabled: boolean) {
  const rive = useRef<Rive | null>(null);
  const inputs = useRef<{ lampOn?: StateMachineInput; pet?: StateMachineInput }>({});
  const lamp = useRef(true);
  const size = useRef({ w: 0, h: 0 });

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
      instance?.cleanup();
      rive.current = null;
      inputs.current = {};
    };
  }, [canvas, enabled]);

  return useMemo(
    () => ({
      /** Called every frame by the scene; writes styles directly, no React render. */
      place(rect: CatRect) {
        const el = canvas.current;
        if (!el) return;
        el.style.transform = `translate(${rect.x}px, ${rect.y}px)`;
        if (Math.abs(rect.width - size.current.w) > 1 || Math.abs(rect.height - size.current.h) > 1) {
          size.current = { w: rect.width, h: rect.height };
          el.style.width = `${rect.width}px`;
          el.style.height = `${rect.height}px`;
          rive.current?.resizeDrawingSurfaceToCanvas();
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
    }),
    [canvas],
  );
}

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  bulbMaterial,
  catMaterial,
  ceramicMaterial,
  coffeeMaterial,
  createSharedUniforms,
  furShellMaterial,
  ivyMaterial,
  lampMaterial,
  plasterMaterial,
  woodMaterial,
} from './materials';
import { createOutside } from './outside';
import { createWeather } from './weather';
import { createDust, createSteam } from './effects';
import { createComposer } from './post';
import { CAT_STYLE } from './catStyle';

export type HoverTarget = 'lamp' | 'cat' | null;


/** Where the 2D cat sits on screen, in CSS px relative to the scene canvas. */
export interface CatRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExperienceEvents {
  onReady?: () => void;
  onHover?: (target: HoverTarget, x: number, y: number) => void;
  /** Screen position (CSS px, relative to the container) of the cat's head. */
  onPet?: (x: number, y: number) => void;
  onLampChange?: (on: boolean) => void;
  onDayChange?: (day: boolean) => void;
  onRainChange?: (rain: boolean) => void;
  /** Every frame in 2D cat mode: where to draw the Rive cat. */
  onCatFrame?: (rect: CatRect) => void;
}

/**
 * How the Rive artboard maps onto the sill (see art/rive-cat/generate.py):
 * artboard y = sillY lies on the sill top, x runs right-to-left along z.
 */
const CAT_ART = {
  width: 600,
  height: 480,
  sillY: 290,
  pxPerUnit: 124,
  /** World point under artboard x = 0 on the sill line. */
  origin: new THREE.Vector3(1.95, 0.137, 4.78),
  /** Rough body area in artboard px, used as the click target. */
  hit: { x0: 45, x1: 560, y0: 125, y1: 295 },
};

function artToWorld(ax: number, ay: number) {
  const o = CAT_ART.origin;
  return new THREE.Vector3(o.x, o.y + (CAT_ART.sillY - ay) / CAT_ART.pxPerUnit, o.z - ax / CAT_ART.pxPerUnit);
}

/** Scene facts measured from windowsill_scene.glb (Y-up, metres-ish). */
const SCENE = {
  lampBulb: new THREE.Vector3(-0.9, 1.18, -3.84),
  mugCenter: new THREE.Vector3(0, 0.12, -1.866),
  mugTop: 0.72,
  catHead: CAT_STYLE === '2d' ? artToWorld(470, 175) : new THREE.Vector3(1.95, 1.1, 0.75),
  /** Phones / portrait: points that must stay in frame (cat, mug, window). */
  frameNarrow: [
    [-2.2, 3.9, 3.6], [-2.2, 3.9, -2.4], [1.8, 0.0, CAT_STYLE === '2d' ? 4.7 : 4.0], [1.8, 0.0, -2.4],
  ],
} as const;

/**
 * Rendering budget. The scene is slow and ambient, so it doesn't need the
 * display's full refresh rate (120 Hz on many laptops), which mostly heats
 * the GPU. It runs at idleFps, and briefly at activeFps while you interact.
 */
/** How long the front world takes to swing away and reveal the other (seconds). */
const DAY_TURN_SECONDS = 1.1;

/** Room light by day: bright, warm sun through the window and a cooler, brighter room. */
const DAYLIGHT = {
  window: new THREE.Color('#fff1da').multiplyScalar(0.95),
  ambSky: new THREE.Color('#c9d5e2').multiplyScalar(0.5),
  ambGround: new THREE.Color('#a3805f').multiplyScalar(0.45),
};

/** How long rain takes to roll in or clear (seconds). */
const RAIN_FADE_SECONDS = 2.5;
/** Rain dims and cools the light through the window and the room a little. */
const RAIN_LIGHT = { window: 0.42, ambient: 0.82, tint: new THREE.Color('#c9d6ea') };

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** Moves `value` towards `target` by at most `step`. */
const approach = (value: number, target: number, step: number) =>
  target > value ? Math.min(target, value + step) : Math.max(target, value - step);

const PERF = {
  idleFps: 30,
  activeFps: 60,
  /** How long after the last interaction to stay at activeFps (ms). */
  activeHold: 1500,
  maxPixelRatio: 1.5,
  /** Bloom is a soft glow, so it's computed at a fraction of the resolution. */
  bloomScale: 0.5,
};

const CAMERA = {
  /** Direction from the look-at target towards the camera (slightly above, looking down at the sill). */
  direction: new THREE.Vector3(1, 0.09, 0).normalize(),
  /**
   * Wide screens use a long lens from far away, so the alcove's side walls
   * flatten out, and the field of view is chosen so this half-width of the
   * alcove (at x = 0) exactly fills the screen.
   */
  distance: 22,
  coverHalfWidth: 5.75,
  /** Wide screens: the sill's front edge sits on the bottom of the frame. */
  floor: new THREE.Vector3(2.0, -0.05, -0.2),
  narrowFov: 24,
  parallax: new THREE.Vector2(0.6, 0.35),
};

export class Experience {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(CAMERA.narrowFov, 1, 0.1, 150);
  private post: ReturnType<typeof createComposer>;
  private shared = createSharedUniforms();
  private motion = { value: 1 };
  private lampLight = new THREE.PointLight('#ffb066', 8, 0, 2);
  private lampTarget = 1;
  private dayTarget = 0;
  /** Linear progress of the swap, 0 = night, 1 = day. */
  private dayProgress = 0;
  /** The world on the front card (0 = night, 1 = day); it changes only at rest. */
  private dayFront = 0;
  private aimSwing?: (camera: THREE.Vector3) => void;
  private rainTarget = 0;
  private rainLevel = 0;
  private weather?: THREE.Group;
  private nightLight = {
    window: this.shared.uMoonColor.value.clone(),
    ambSky: this.shared.uAmbSky.value.clone(),
    ambGround: this.shared.uAmbGround.value.clone(),
  };

  private target = new THREE.Vector3();
  private distance = 12;
  private pointer = new THREE.Vector2();
  private pointerSmoothed = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private pickables: { object: THREE.Object3D; target: Exclude<HoverTarget, null> }[] = [];
  private hovered: HoverTarget = null;
  private size = { w: 1, h: 1 };
  private catRect: CatRect | null = null;

  private steam?: THREE.Mesh;
  private dust?: THREE.Points;
  private clock = new THREE.Timer();
  private visible = true;
  private running = false;
  private lastFrame = -Infinity;
  private activeUntil = 0;
  private disposed = false;
  private cleanups: (() => void)[] = [];

  constructor(
    private container: HTMLElement,
    private events: ExperienceEvents = {},
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, PERF.maxPixelRatio));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor('#120c0a');
    this.renderer.domElement.className = 'scene-canvas';
    container.appendChild(this.renderer.domElement);

    this.post = createComposer(this.renderer, this.scene, this.camera);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const applyMotion = () => (this.motion.value = reduced.matches ? 0 : 1);
    applyMotion();
    reduced.addEventListener('change', applyMotion);
    this.cleanups.push(() => reduced.removeEventListener('change', applyMotion));

    this.setupLights();
    const outside = createOutside(this.shared, this.motion);
    this.scene.add(outside.group);
    this.aimSwing = outside.aimSwing;
    this.weather = createWeather(this.shared, this.motion);
    this.scene.add(this.weather);
    this.listen();
    this.resize();
    this.load();
  }

  private setupLights() {
    this.lampLight.position.copy(SCENE.lampBulb);
    this.lampLight.castShadow = true;
    this.lampLight.shadow.mapSize.set(1024, 1024);
    this.lampLight.shadow.camera.near = 0.05;
    this.lampLight.shadow.camera.far = 25;
    this.lampLight.shadow.bias = -0.002;
    this.lampLight.shadow.normalBias = 0.02;
    this.lampLight.shadow.radius = 3;
    this.shared.uLampPos.value.copy(SCENE.lampBulb);
    this.scene.add(this.lampLight);
  }

  private async load() {
    const [gltf, ivyMap] = await Promise.all([
      new GLTFLoader().loadAsync('/models/windowsill_scene.glb'),
      new THREE.TextureLoader().loadAsync('/textures/ivy_basecolor.jpg'),
    ]);
    if (this.disposed) return;
    ivyMap.flipY = false; // glTF UV convention
    ivyMap.colorSpace = THREE.SRGBColorSpace;
    ivyMap.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    const s = this.shared;
    const plaster = plasterMaterial(s, '#e3c6a2');
    const byName: Record<string, (mesh: THREE.Mesh) => void> = {
      wall: (m) => (m.material = plaster),
      window_sill: (m) => {
        m.material = woodMaterial(s, '#ead1ae', 0.1);
        m.receiveShadow = true;
      },
      window_wood: (m) => {
        m.material = woodMaterial(s, '#a4503c', 0.25);
        m.castShadow = true;
      },
      mug: (m) => {
        m.material = ceramicMaterial(s, '#f1ece4', SCENE.mugCenter);
        m.castShadow = true;
      },
      table_light: (m) => {
        this.markLampShade(m);
        m.material = lampMaterial(s);
        // The shade surrounds the light, so only the stand may cast shadows.
        m.castShadow = false;
        this.pickables.push({ object: m, target: 'lamp' });
      },
      cat: (m) => {
        m.material = catMaterial(s);
        m.castShadow = true;
        if (CAT_STYLE === '2d') {
          // Drawn but invisible: it still casts the cat's shadow onto the sill.
          (m.material as THREE.Material).colorWrite = false;
          (m.material as THREE.Material).depthWrite = false;
          return;
        }
        this.addFur(m);
        this.pickables.push({ object: m, target: 'cat' });
      },
      tree_branch_1: (m) => (m.material = ivyMaterial(s, ivyMap)),
      tree_branch_2: (m) => (m.material = ivyMaterial(s, ivyMap)),
    };

    // Collect first, then assign: the cat handler adds fur shells as children,
    // and a live traverse would visit them and overwrite their material.
    const meshes: THREE.Mesh[] = [];
    gltf.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    for (const m of meshes) {
      m.receiveShadow = true;
      (byName[m.name] ?? ((mesh: THREE.Mesh) => (mesh.material = plaster)))(m);
    }
    this.scene.add(gltf.scene);
    this.addRoomShell(plaster);
    this.addProps();

    // Compile every shader up front so the first visible frame doesn't hitch.
    await this.renderer.compileAsync(this.scene, this.camera);
    if (this.disposed) return;
    // Nothing that casts a shadow ever moves (the lamp is fixed, and the cat's
    // shadow uses its rest pose), so the 6-face shadow map is drawn once.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.events.onReady?.();
    this.updateRunning();
  }

  /** Per-vertex flag: 1 on the dome shade, 0 on the base and pole. */
  private markLampShade(mesh: THREE.Mesh) {
    mesh.updateMatrixWorld(true);
    const pos = mesh.geometry.attributes.position;
    const flag = new Float32Array(pos.count);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      const r = Math.hypot(v.x - SCENE.lampBulb.x, v.z - SCENE.lampBulb.z);
      flag[i] = (r > 0.2 && v.y > 0.6) || v.y > 1.45 ? 1 : 0;
    }
    mesh.geometry.setAttribute('aShade', new THREE.BufferAttribute(flag, 1));
  }

  private addFur(cat: THREE.Mesh) {
    const shells = 12;
    for (let i = 1; i <= shells; i++) {
      const shell = new THREE.Mesh(cat.geometry, furShellMaterial(this.shared, i / shells, 0.0055));
      shell.receiveShadow = true;
      shell.raycast = () => {};
      cat.add(shell);
    }
  }

  /**
   * The GLB is just the alcove. Close it into a room so any aspect ratio
   * looks complete: a wall around the alcove opening and a ceiling over it.
   */
  private addRoomShell(plaster: THREE.Material) {
    const outer = new THREE.Shape([
      new THREE.Vector2(-40, -20), new THREE.Vector2(40, -20), new THREE.Vector2(40, 30), new THREE.Vector2(-40, 30),
    ]);
    outer.holes.push(new THREE.Path([
      new THREE.Vector2(-6, -0.14), new THREE.Vector2(-6, 5.01), new THREE.Vector2(6, 5.01), new THREE.Vector2(6, -0.14),
    ]));
    const facade = new THREE.Mesh(new THREE.ShapeGeometry(outer), plaster);
    facade.rotation.y = Math.PI / 2;
    facade.position.x = 2.0;
    facade.receiveShadow = true;

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 12.2), plaster);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(-0.2, 5.0, 0);
    this.scene.add(facade, ceiling);
  }

  private addProps() {
    const s = this.shared;
    const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.262, 48), coffeeMaterial(s));
    coffee.rotation.x = -Math.PI / 2;
    coffee.position.set(SCENE.mugCenter.x, 0.64, SCENE.mugCenter.z);
    coffee.receiveShadow = true;

    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), bulbMaterial(s));
    bulb.position.copy(SCENE.lampBulb);
    this.pickables.push({ object: bulb, target: 'lamp' });

    this.steam = createSteam(s, this.motion);
    this.steam.position.set(SCENE.mugCenter.x, SCENE.mugTop + 0.9, SCENE.mugCenter.z);

    this.dust = createDust(s, this.motion);
    this.scene.add(coffee, bulb, this.steam, this.dust);
  }

  // ---------------------------------------------------------------- camera

  /**
   * Frames the scene for the canvas. The paper lip overlaps the bottom of the
   * canvas (CSS --sheet-overlap), so framing uses the visible part and the
   * projection is extended downwards with a view offset.
   *
   * Wide: fixed distance, fov from the aspect so the alcove fills the width,
   * then the camera slides vertically until the sill's front edge sits on the
   * bottom of the frame. When the hero collapses into a banner, CSS clips the
   * top, so the sill, cat and lamp stay in view.
   * Narrow: pull back until the cat, mug and window fit.
   */
  private fitCamera(width: number, height: number) {
    const inset = parseFloat(getComputedStyle(this.container).getPropertyValue('--sheet-overlap')) || 0;
    const visibleH = Math.max(1, height - inset);
    const cam = this.camera;
    cam.clearViewOffset();
    cam.aspect = width / visibleH;

    const place = (d: number) => {
      cam.position.copy(this.target).addScaledVector(CAMERA.direction, d);
      cam.lookAt(this.target);
      cam.updateMatrixWorld();
    };

    if (cam.aspect >= 1.6) {
      const d = CAMERA.distance;
      cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(CAMERA.coverHalfWidth / (d * cam.aspect)));
      cam.updateProjectionMatrix();
      let lo = -3;
      let hi = 8;
      for (let i = 0; i < 24; i++) {
        const y = (lo + hi) / 2;
        this.target.set(0, y, CAMERA.floor.z);
        place(d);
        if (CAMERA.floor.clone().project(cam).y < -0.98) hi = y;
        else lo = y;
      }
      this.target.y = lo;
      this.distance = d;
    } else {
      cam.fov = CAMERA.narrowFov;
      cam.updateProjectionMatrix();
      const pts = SCENE.frameNarrow.map((p) => new THREE.Vector3(...p));
      new THREE.Box3().setFromPoints(pts).getCenter(this.target);
      let lo = 2;
      let hi = 80;
      for (let i = 0; i < 24; i++) {
        const d = (lo + hi) / 2;
        place(d);
        const fits = pts.every((p) => {
          const n = p.clone().project(cam);
          return Math.abs(n.x) <= 0.97 && Math.abs(n.y) <= 0.97;
        });
        if (fits) hi = d;
        else lo = d;
      }
      this.distance = hi;
      // Tall screens have spare height: drop the sill to the bottom edge (as on
      // wide screens) unless that would push the window top out of frame.
      const contained = this.target.clone();
      let ylo = contained.y;
      let yhi = contained.y + 6;
      for (let i = 0; i < 24; i++) {
        const y = (ylo + yhi) / 2;
        this.target.y = y;
        place(hi);
        if (CAMERA.floor.clone().project(cam).y < -0.98) yhi = y;
        else ylo = y;
      }
      this.target.y = ylo;
      place(hi);
      if (pts.some((p) => p.clone().project(cam).y > 0.97)) this.target.copy(contained);
    }
    // Tight near/far around the scene: with a long lens the camera is ~20
    // units away, and a 0.1 near plane would waste most of the depth precision.
    cam.near = Math.max(0.1, this.distance - 12);
    cam.far = this.distance + 60;
    cam.setViewOffset(width, visibleH, 0, 0, width, height);
  }

  private updateCamera(dt: number) {
    const k = 1 - Math.exp(-dt * 2.5);
    this.pointerSmoothed.lerp(this.pointer, this.motion.value ? k : 1);
    const t = this.shared.uTime.value;
    const drift = this.motion.value * 0.08;
    const px = this.pointerSmoothed.x * CAMERA.parallax.x * this.motion.value + Math.sin(t * 0.13) * drift;
    const py = this.pointerSmoothed.y * CAMERA.parallax.y * this.motion.value + Math.sin(t * 0.17) * drift * 0.5;
    this.camera.position.copy(this.target).addScaledVector(CAMERA.direction, this.distance);
    this.camera.position.z -= px;
    this.camera.position.y += py;
    this.camera.lookAt(this.target);
  }

  // ---------------------------------------------------------------- events

  private listen() {
    const el = this.renderer.domElement;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 2 - 1;
      const y = -((e.clientY - r.top) / r.height) * 2 + 1;
      this.pointer.set(x, y);
      this.markActive();
      this.updateHover(x, y, e.clientX - r.left, e.clientY - r.top);
    };
    const onLeave = () => {
      this.pointer.set(0, 0);
      this.setHover(null, 0, 0);
    };
    const onClick = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 2 - 1;
      const y = -((e.clientY - r.top) / r.height) * 2 + 1;
      const hit = this.pick(x, y);
      if (hit === 'lamp') this.setLamp(this.lampTarget < 0.5);
      if (hit === 'cat') {
        const head = SCENE.catHead.clone().project(this.camera);
        this.events.onPet?.((head.x * 0.5 + 0.5) * r.width, (-head.y * 0.5 + 0.5) * r.height);
      }
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('click', onClick);

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(this.container);
    const io = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.updateRunning();
    });
    io.observe(this.container);
    const onVisibility = () => this.updateRunning();
    document.addEventListener('visibilitychange', onVisibility);

    this.cleanups.push(() => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('click', onClick);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    });
  }

  private pick(x: number, y: number): HoverTarget {
    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables.map((p) => p.object), false);
    if (hits.length) return this.pickables.find((p) => p.object === hits[0].object)?.target ?? null;
    // The 2D cat isn't in the 3D scene: hit-test its artboard area instead.
    if (CAT_STYLE === '2d' && this.catRect) {
      const r = this.catRect;
      const scale = r.width / CAT_ART.width;
      const ax = ((x * 0.5 + 0.5) * this.size.w - r.x) / scale;
      const ay = ((-y * 0.5 + 0.5) * this.size.h - r.y) / scale;
      const { x0, x1, y0, y1 } = CAT_ART.hit;
      if (ax > x0 && ax < x1 && ay > y0 && ay < y1) return 'cat';
    }
    return null;
  }

  /** Projects the artboard's sill line to the screen and reports where the 2D cat goes. */
  private updateCatRect() {
    const { w, h } = this.size;
    const toPx = (v: THREE.Vector3) => {
      v.project(this.camera);
      return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
    };
    const left = toPx(artToWorld(0, CAT_ART.sillY));
    const right = toPx(artToWorld(CAT_ART.width, CAT_ART.sillY));
    const scale = (right.x - left.x) / CAT_ART.width;
    const rect = { x: left.x, y: left.y - CAT_ART.sillY * scale, width: CAT_ART.width * scale, height: CAT_ART.height * scale };
    const prev = this.catRect;
    if (prev && Math.abs(prev.x - rect.x) + Math.abs(prev.y - rect.y) + Math.abs(prev.width - rect.width) < 0.05) return;
    this.catRect = rect;
    this.events.onCatFrame?.(rect);
  }

  private updateHover(x: number, y: number, px: number, py: number) {
    this.setHover(this.pick(x, y), px, py);
  }

  private setHover(target: HoverTarget, px: number, py: number) {
    this.renderer.domElement.style.cursor = target ? 'pointer' : '';
    if (target !== this.hovered || target) this.events.onHover?.(target, px, py);
    this.hovered = target;
  }

  /** Run at the higher frame rate for a moment (pointer moved, lamp toggled, …). */
  private markActive() {
    this.activeUntil = performance.now() + PERF.activeHold;
  }

  /** Swaps the world to day or night; `instant` skips the animation (restoring a saved choice). */
  setDay(day: boolean, instant = false) {
    this.dayTarget = day ? 1 : 0;
    if (instant) this.dayProgress = this.dayTarget;
    this.markActive();
    this.applyLight();
    this.events.onDayChange?.(day);
    if (!this.running) this.render(0);
  }

  /** Lets the rain roll in or clear; `instant` skips the fade (restoring a saved choice). */
  setRain(rain: boolean, instant = false) {
    this.rainTarget = rain ? 1 : 0;
    if (instant) this.rainLevel = this.rainTarget;
    this.markActive();
    this.applyLight();
    this.events.onRainChange?.(rain);
    if (!this.running) this.render(0);
  }

  /** Puts the day/night swap, the rain and the room's light where the current progress says. */
  private applyLight() {
    const e = easeInOutCubic(this.dayProgress);
    const r = this.rainLevel * this.rainLevel * (3 - 2 * this.rainLevel); // smoothstep
    const s = this.shared;
    // At rest the world showing becomes the front card. Mid-swing it stays put,
    // so changing your mind swings the same card back.
    if (this.dayProgress === 0 || this.dayProgress === 1) this.dayFront = this.dayProgress;
    s.uFront.value = this.dayFront;
    s.uSwing.value = this.dayFront === 0 ? e : 1 - e;
    s.uDay.value = e;
    s.uRain.value = r;
    if (this.weather) this.weather.visible = r > 0.001;
    s.uMoonColor.value
      .lerpColors(this.nightLight.window, DAYLIGHT.window, e)
      .multiply(new THREE.Color(1, 1, 1).lerp(RAIN_LIGHT.tint, r))
      .multiplyScalar(1 - (1 - RAIN_LIGHT.window) * r);
    const ambient = 1 - (1 - RAIN_LIGHT.ambient) * r;
    s.uAmbSky.value.lerpColors(this.nightLight.ambSky, DAYLIGHT.ambSky, e).multiplyScalar(ambient);
    s.uAmbGround.value.lerpColors(this.nightLight.ambGround, DAYLIGHT.ambGround, e).multiplyScalar(ambient);
  }

  setLamp(on: boolean) {
    this.markActive();
    this.lampTarget = on ? 1 : 0;
    this.events.onLampChange?.(on);
  }

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.size = { w, h };
    this.renderer.setSize(w, h);
    this.post.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.post.composer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.post.bloom.setSize(w * pr * PERF.bloomScale, h * pr * PERF.bloomScale);
    this.fitCamera(w, h);
    if (this.dust) (this.dust.material as THREE.ShaderMaterial).uniforms.uPixelRatio.value = this.renderer.getPixelRatio();
    if (!this.running) this.render(0);
  }

  // ---------------------------------------------------------------- loop

  private updateRunning() {
    const shouldRun = this.visible && !document.hidden && !this.disposed;
    if (shouldRun === this.running) return;
    this.running = shouldRun;
    this.lastFrame = -Infinity;
    this.clock.reset();
    this.renderer.setAnimationLoop(shouldRun ? (t) => this.tick(t) : null);
  }

  private tick(time: number) {
    const fading =
      Math.abs(this.lampTarget - this.shared.uLamp.value) > 0.01 ||
      this.dayProgress !== this.dayTarget ||
      this.rainLevel !== this.rainTarget;
    const fps = time < this.activeUntil || fading ? PERF.activeFps : PERF.idleFps;
    // Skip display refreshes until a frame is due (2 ms slack for timer jitter).
    if (time - this.lastFrame < 1000 / fps - 2) return;
    this.lastFrame = time;
    this.clock.update(time);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.render(dt);
  }

  private render(dt: number) {
    this.shared.uTime.value += dt;
    const lamp = this.shared.uLamp;
    lamp.value += (this.lampTarget - lamp.value) * (1 - Math.exp(-dt * 4));
    this.lampLight.intensity = 8 * lamp.value;
    if (this.dayProgress !== this.dayTarget || this.rainLevel !== this.rainTarget) {
      this.dayProgress = approach(this.dayProgress, this.dayTarget, dt / DAY_TURN_SECONDS);
      this.rainLevel = approach(this.rainLevel, this.rainTarget, dt / RAIN_FADE_SECONDS);
      this.applyLight();
    }
    this.updateCamera(dt);
    this.aimSwing?.(this.camera.position);
    if (CAT_STYLE === '2d') this.updateCatRect();
    if (this.steam) this.steam.quaternion.copy(this.camera.quaternion);
    this.post.film.uniforms.uTime.value = this.shared.uTime.value;
    this.post.composer.render(dt);
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.cleanups.forEach((fn) => fn());
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          Object.values((m as THREE.ShaderMaterial).uniforms ?? {}).forEach((u) => {
            if (u.value instanceof THREE.Texture) u.value.dispose();
          });
          m.dispose();
        });
      }
    });
    this.post.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

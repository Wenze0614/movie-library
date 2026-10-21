import * as THREE from 'three';
import { NOISE } from './glsl';
import type { SharedUniforms } from './materials';

/** Wisps of steam above the mug — a camera-facing plane with scrolling noise. */
export function createSteam(shared: SharedUniforms, motion: { value: number }) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 1.9),
    new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uLamp: shared.uLamp, uMotion: motion },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uLamp; uniform float uMotion;
        varying vec2 vUv;
        ${NOISE}
        // One wisp: a ribbon that curls sideways and widens as it rises.
        float wisp(vec2 uv, float t, float seed) {
          float y = uv.y;
          float sway = sin(y * 5.0 - t * 1.1 + seed * 6.0) * 0.07 * (0.3 + y)
                     + (vnoise(vec2(y * 2.0 - t * 0.6, seed * 13.0)) - 0.5) * 0.3 * y;
          float width = mix(0.02, 0.14, y);
          float d = abs(uv.x - 0.5 - sway - (seed - 0.5) * 0.08);
          float body = smoothstep(width, width * 0.2, d);
          float breakup = smoothstep(0.35, 0.7, fbm(vec2(uv.x * 4.0 + seed * 7.0, y * 3.0 - t * 0.7)));
          return body * mix(1.0, breakup, smoothstep(0.1, 0.6, y));
        }
        void main() {
          float t = uTime * mix(0.15, 1.0, uMotion);
          float a = max(wisp(vUv, t, 0.3), wisp(vUv, t * 0.85 + 4.0, 0.7) * 0.8);
          a *= smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.5, vUv.y);
          vec3 c = mix(vec3(0.5, 0.56, 0.75), vec3(1.0, 0.84, 0.66), uLamp);
          gl_FragColor = vec4(c * a * 0.38, 1.0);
        }`,
    }),
  );
  mesh.name = 'steam';
  return mesh;
}

/** Dust motes drifting through the lamp light. */
export function createDust(shared: SharedUniforms, motion: { value: number }, count = 140) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = THREE.MathUtils.randFloat(-1.9, 2.2);
    pos[i * 3 + 1] = THREE.MathUtils.randFloat(0.2, 4.2);
    pos[i * 3 + 2] = THREE.MathUtils.randFloat(-5.4, 1.5);
    seed[i] = Math.random();
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

  const points = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: shared.uTime,
        uLamp: shared.uLamp,
        uLampPos: shared.uLampPos,
        uMotion: motion,
        uPixelRatio: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uMotion; uniform float uPixelRatio;
        uniform vec3 uLampPos; uniform float uLamp;
        attribute float aSeed;
        varying float vGlow;
        void main() {
          float t = uTime * mix(0.1, 1.0, uMotion);
          vec3 p = position;
          p.y = 0.2 + mod(p.y - 0.2 + t * (0.03 + aSeed * 0.05), 4.0);
          p.x += sin(t * 0.3 + aSeed * 40.0) * 0.25;
          p.z += cos(t * 0.23 + aSeed * 23.0) * 0.35;
          float d = distance(p, uLampPos);
          float below = smoothstep(0.2, -0.6, p.y - uLampPos.y);
          vGlow = uLamp * exp(-d * 0.55) * mix(0.25, 1.0, below) * (0.4 + 0.6 * fract(aSeed * 7.13));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (2.0 + aSeed * 3.0) * uPixelRatio * (20.0 / -mv.z);
        }`,
      fragmentShader: /* glsl */ `
        varying float vGlow;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vec3(1.0, 0.78, 0.5) * a * vGlow * 2.0, 1.0);
        }`,
    }),
  );
  points.name = 'dust';
  points.frustumCulled = false;
  return points;
}

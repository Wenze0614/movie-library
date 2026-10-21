import * as THREE from 'three';
import { NOISE } from './glsl';
import type { SharedUniforms } from './materials';

/**
 * Rain, drawn on two transparent planes that fade in with `uRain`:
 * - streaks falling outside, between the window and the hills (three depth
 *   layers, so they have parallax too);
 * - the window glass, with beads of water and drops running down it.
 */

const PLANE_VERTEX = /* glsl */ `
varying vec2 vP;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = vec2(-wp.z, wp.y); // screen-right is -Z in this scene
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const STREAKS_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uRain;
uniform float uDay;
uniform float uMotion;
varying vec2 vP;
${NOISE}

// One streak per cell, at a random spot, sliding down with time.
float layer(vec2 p, vec2 cell, float speed, float len, float seed, float px) {
  p.x += p.y * 0.12; // a slight slant
  p.y += uTime * speed * mix(0.2, 1.0, uMotion);
  vec2 id = floor(p / cell);
  vec2 f = p / cell - id;
  float keep = step(hash12(id + seed), 0.6);
  float x = 0.15 + 0.7 * hash12(id + seed + 1.0);
  float y = hash12(id + seed + 2.0) * (1.0 - len);
  float dx = abs(f.x - x) * cell.x;
  float along = (f.y - y) / len;
  float inside = step(0.0, along) * step(along, 1.0);
  return keep * inside * smoothstep(px * 1.3, 0.0, dx) * (0.35 + 0.65 * along);
}

void main() {
  float px = max(fwidth(vP.x), 1e-4);
  float r = layer(vP, vec2(0.24, 1.7), 10.0, 0.32, 1.0, px * 1.4) * 1.0
          + layer(vP, vec2(0.15, 1.1), 8.0, 0.3, 7.0, px) * 0.7
          + layer(vP, vec2(0.09, 0.8), 6.0, 0.28, 13.0, px) * 0.45;
  vec3 tint = mix(srgb(vec3(0.42, 0.47, 0.58)), srgb(vec3(0.88, 0.9, 0.94)), uDay);
  gl_FragColor = vec4(tint, clamp(r, 0.0, 1.0) * 0.42 * uRain);
  #include <colorspace_fragment>
}`;

const GLASS_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uRain;
uniform float uDay;
uniform float uLamp;
uniform float uMotion;
uniform vec4 uRect; // window opening: x min, x max, y min, y max (in vP space)
varying vec2 vP;
${NOISE}

// Shades a drop as a tiny lens: n is the offset from its centre in units of
// its radius. Returns rgb (premultiplied by coverage) and coverage.
vec4 lens(vec2 n, float px) {
  float d = length(n);
  float cover = smoothstep(1.0 + px, 1.0 - px, d);
  if (cover <= 0.0) return vec4(0.0);
  float z = sqrt(max(1.0 - d * d, 0.0));
  vec3 N = normalize(vec3(n.x, -n.y, z + 0.35));
  // Day: a bright sky behind; night: the room's lamp glints from the lower right.
  vec3 light = normalize(mix(vec3(0.55, -0.35, 0.75), vec3(-0.35, 0.65, 0.7), uDay));
  // Like real water on glass: a clear middle, a darker rim, one small sharp highlight.
  float spec = pow(max(dot(N, normalize(light + vec3(0.0, 0.0, 1.0))), 0.0), 120.0);
  vec3 body = mix(srgb(vec3(0.07, 0.08, 0.12)), srgb(vec3(0.78, 0.82, 0.87)), uDay);
  vec3 rim = mix(srgb(vec3(0.0, 0.0, 0.01)), srgb(vec3(0.28, 0.32, 0.38)), uDay);
  vec3 glint = mix(srgb(vec3(1.0, 0.78, 0.55)) * (0.25 + 0.45 * uLamp), vec3(0.95), uDay);
  float alpha = cover * mix(0.62, 0.16, z);
  vec3 c = mix(rim, body, z) * alpha + glint * spec * cover * 0.9;
  return vec4(c, max(alpha, spec * cover * 0.6));
}

void main() {
  vec2 p = vP;
  float px = max(fwidth(p.x), 1e-4);
  float t = uTime * mix(0.25, 1.0, uMotion);
  vec4 acc = vec4(0.0);

  // Beads: little drops sitting still on the glass.
  {
    vec2 cell = vec2(0.16, 0.16);
    vec2 g = p / cell;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5 - (hash22(id + 3.0) - 0.5) * 0.5;
    float r = mix(0.12, 0.3, hash12(id + 4.0));
    float exists = step(hash12(id + 5.0), 0.32);
    vec4 d = lens(f / r, px / (r * cell.x)) * exists;
    acc = d + acc * (1.0 - d.a);
  }

  // Runners: one drop per column slides down, wiggling, leaving a trail.
  {
    float colW = 0.42;
    float column = floor(p.x / colW);
    float h = hash12(vec2(column, 9.0));
    float speed = mix(0.25, 0.7, hash12(vec2(column, 10.0)));
    float height = uRect.w - uRect.z + 1.5;
    float head = uRect.w + 0.6 - fract(t * speed / height + h) * height;
    float wiggle = sin(p.y * 7.0 + h * 20.0) * 0.025 + sin(p.y * 2.3 + h * 5.0) * 0.03;
    float cx = (column + 0.5 + (h - 0.5) * 0.4) * colW + wiggle;
    float r = mix(0.035, 0.055, hash12(vec2(column, 11.0)));
    vec2 n = vec2(p.x - cx, (p.y - head) * 0.8) / r;
    vec4 drop = lens(n, px / r);
    // Trail: tiny beads left behind above the drop, fading with age.
    float above = p.y - head;
    float trailCell = 0.06;
    float k = floor(above / trailCell);
    vec2 tf = vec2(p.x - cx - (hash12(vec2(column, k)) - 0.5) * 0.02, above - (k + 0.5) * trailCell);
    float tr = r * mix(0.25, 0.45, hash12(vec2(column, k + 40.0))) * smoothstep(1.2, 0.0, above);
    vec4 trail = above > 0.04 && tr > 0.004 ? lens(tf / tr, px / tr) * 0.8 : vec4(0.0);
    acc = trail + acc * (1.0 - trail.a);
    acc = drop + acc * (1.0 - drop.a);
  }

  // Wet glass: a faint sheen, misted a little towards the bottom.
  float mist = 0.04 + 0.08 * smoothstep(uRect.z + 0.9, uRect.z, p.y);
  vec3 sheen = mix(srgb(vec3(0.1, 0.11, 0.14)), srgb(vec3(0.8, 0.83, 0.86)), uDay);
  acc = acc + vec4(sheen * mist, mist) * (1.0 - acc.a);

  // Only inside the window opening, and only while it rains.
  acc *= uRain;
  gl_FragColor = vec4(acc.rgb, acc.a);
  #include <colorspace_fragment>
}`;

/** The window opening in vP space (x = −z, y), from the GLB's frame. */
const OPENING = { x0: -3.82, x1: 4.47, y0: 0.86, y1: 4.24 };

export function createWeather(shared: SharedUniforms, motion: { value: number }) {
  const group = new THREE.Group();
  group.name = 'weather';

  const streaks = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 14),
    new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uRain: shared.uRain, uDay: shared.uDay, uMotion: motion },
      vertexShader: PLANE_VERTEX,
      fragmentShader: STREAKS_FRAGMENT,
      transparent: true,
      depthWrite: false,
    }),
  );
  streaks.position.set(-6, 2.5, -0.3);
  streaks.rotation.y = Math.PI / 2;
  streaks.renderOrder = 0; // after the landscape (−1), with the other transparent things

  const w = OPENING.x1 - OPENING.x0;
  const h = OPENING.y1 - OPENING.y0;
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: shared.uTime,
        uRain: shared.uRain,
        uDay: shared.uDay,
        uLamp: shared.uLamp,
        uMotion: motion,
        uRect: { value: new THREE.Vector4(OPENING.x0, OPENING.x1, OPENING.y0, OPENING.y1) },
      },
      vertexShader: PLANE_VERTEX,
      fragmentShader: GLASS_FRAGMENT,
      transparent: true,
      depthWrite: false,
      premultipliedAlpha: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    }),
  );
  // Just inside the frame; screen-right is −z, so the opening's centre sits at z = −centre.
  glass.position.set(-2.1, (OPENING.y0 + OPENING.y1) / 2, -(OPENING.x0 + OPENING.x1) / 2);
  glass.rotation.y = Math.PI / 2;

  group.add(streaks, glass);
  // Nothing to draw while it's dry.
  group.visible = false;
  return group;
}

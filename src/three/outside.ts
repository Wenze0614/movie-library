import * as THREE from 'three';
import { NOISE } from './glsl';
import type { SharedUniforms } from './materials';

/**
 * Everything seen through the window is painted procedurally on two planes:
 * a far sky (stars, galaxy, shooting stars) and a nearer landscape (hills,
 * a little town, pines and a lake). Two depths give real parallax when the
 * camera drifts with the pointer.
 */

const PLANE_VERTEX = /* glsl */ `
varying vec2 vP;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = vec2(-wp.z, wp.y); // screen-right is -Z in this scene
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const SKY_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uLamp;
uniform float uMotion;
varying vec2 vP;
${NOISE}

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// One candidate star per cell. Magnitude follows a steep curve, so most stars
// are faint pinpricks and only a few are bright enough to flare.
vec3 stars(vec2 p, float scale, float density, float seed) {
  vec2 g = p * scale + seed * 17.0;
  vec2 id = floor(g);
  if (hash12(id + seed) > density) return vec3(0.0);
  vec2 f = fract(g) - 0.5 - (hash22(id + seed) - 0.5) * 0.6;
  float px = max(fwidth(g.x), 1e-4); // never divide by zero: a NaN here blacks out the whole frame via bloom
  float mag = pow(hash12(id + 3.7 + seed), 6.0);
  float tw = mix(1.0, 0.55 + 0.45 * sin(uTime * (0.6 + 2.4 * hash12(id + 7.0)) + hash12(id) * 60.0), uMotion);
  float r = px * mix(0.5, 1.25, mag);
  float core = exp(-dot(f, f) / (r * r));
  float halo = exp(-length(f) / (px * 3.0)) * mag * 0.3;
  float flare = smoothstep(0.7, 1.0, mag) * 0.45 * (
    exp(-abs(f.x) / (px * 0.55)) * exp(-abs(f.y) / (px * 7.0)) +
    exp(-abs(f.y) / (px * 0.55)) * exp(-abs(f.x) / (px * 7.0)));
  vec3 tint = mix(vec3(0.72, 0.8, 1.0), vec3(1.0, 0.88, 0.72), hash12(id + 1.7));
  return tint * (core * (0.25 + 2.8 * mag) + halo + flare) * tw;
}

void main() {
  vec2 p = vP;
  float t = clamp((p.y + 1.0) / 10.0, 0.0, 1.0);

  // Night gradient: indigo near the hills into deep navy.
  vec3 col = mix(srgb(vec3(0.2, 0.19, 0.4)), srgb(vec3(0.09, 0.11, 0.28)), smoothstep(0.0, 0.3, t));
  col = mix(col, srgb(vec3(0.025, 0.04, 0.12)), smoothstep(0.25, 0.9, t));
  // Warm light pollution above the town on the right.
  col += srgb(vec3(0.55, 0.32, 0.3)) * exp(-max(p.y + 0.5, 0.0) * 0.8) * smoothstep(-3.0, 3.0, p.x) * smoothstep(10.0, 4.0, p.x) * 0.35;

  // Milky Way: a faint dusty band.
  vec2 bp = rot(-0.45) * (p - vec2(-1.0, 3.4));
  float bandY = bp.y / 2.2;
  float band = exp(-bandY * bandY);
  float clouds = smoothstep(0.35, 0.85, fbm(bp * vec2(0.25, 0.6) + 3.0));
  float dust = smoothstep(0.5, 0.8, fbm(bp * vec2(0.6, 1.6) + 9.0));
  vec3 bandCol = mix(srgb(vec3(0.24, 0.32, 0.62)), srgb(vec3(0.5, 0.38, 0.7)), fbm(bp * 0.4 + 1.0));
  col += bandCol * band * clouds * (1.0 - dust * 0.8) * 0.3;

  // Spiral galaxy, the hero of the sky.
  vec2 gq = rot(0.5) * (p - vec2(3.0, 3.45)) / 2.8;
  gq.y *= 2.3;
  float gr = length(gq);
  float ga = atan(gq.y, gq.x);
  float arms = pow(clamp(0.5 + 0.5 * cos(2.0 * (ga - 2.6 * log(gr + 0.03)) + uTime * 0.01 * uMotion), 0.0, 1.0), 2.5);
  float knots = fbm(gq * 7.0 + 4.0);
  float armLight = arms * smoothstep(0.03, 0.18, gr) * exp(-gr * 2.6) * (0.45 + knots);
  float core = exp(-gr * gr * 140.0) * 2.2 + exp(-gr * 8.0) * 0.5;
  col += srgb(vec3(0.42, 0.38, 0.95)) * armLight * 1.1;
  col += srgb(vec3(0.95, 0.55, 0.78)) * armLight * smoothstep(0.35, 0.05, gr) * 0.7;
  col += srgb(vec3(0.38, 0.33, 0.8)) * exp(-gr * 3.0) * 0.18;
  col += srgb(vec3(1.0, 0.74, 0.48)) * core * 1.6;
  col += stars(gq * 2.8, 6.0, 0.5 * arms * exp(-gr * 2.0), 5.0) * 0.6;

  // Stars: sparse bright, then finer and denser layers.
  float boost = 1.0 + (1.0 - uLamp) * 0.5;
  col += stars(p, 0.9, 0.32, 1.0) * boost;
  col += stars(p, 2.2, 0.16 + band * 0.25, 2.0) * 0.5 * boost;
  col += stars(p, 4.5, 0.12 + band * 0.35, 3.0) * 0.3 * boost;
  col *= mix(0.6, 1.0, smoothstep(0.0, 0.18, t)); // low haze swallows stars

  // A shooting star every ~9 seconds.
  float period = 9.0;
  float k = floor(uTime / period);
  float age = uTime - k * period;
  if (uMotion > 0.5 && age < 1.1) {
    vec2 start = vec2(mix(-9.0, 7.0, hash12(vec2(k, 1.0))), mix(5.5, 8.0, hash12(vec2(k, 2.0))));
    vec2 dir = normalize(vec2(hash12(vec2(k, 3.0)) > 0.5 ? 1.0 : -1.0, -0.55));
    vec2 head = start + dir * age * 9.0;
    vec2 rel = p - head;
    float along = dot(rel, -dir);
    float across = length(rel + dir * along);
    float trail = smoothstep(2.6, 0.0, along) * step(0.0, along);
    float fade = smoothstep(0.0, 0.15, age) * smoothstep(1.1, 0.7, age);
    col += vec3(1.0, 0.92, 0.85) * exp(-across * across * 900.0) * trail * fade * 4.0;
  }

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const LAND_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uMotion;
uniform float uShore;
varying vec2 vP;
${NOISE}

float mountains(float x) {
  float ridge = 1.0 - abs(vnoise(vec2(x * 0.22, 0.0)) * 2.0 - 1.0);
  return uShore + 0.5 + 0.9 * fbm(vec2(x * 0.16, 1.0)) + 0.55 * ridge * ridge;
}
float hills(float x) {
  float town = smoothstep(0.5, 2.0, x) * smoothstep(7.0, 4.5, x);
  return uShore + 0.1 + 0.5 * fbm(vec2(x * 0.32, 5.0)) + town * 0.35;
}

// Pines: one tree per cell, tiered silhouette, taller towards the window edges.
float pines(vec2 p, float cell, float seed, float baseH) {
  float id = floor(p.x / cell);
  float h = hash12(vec2(id, seed));
  float edge = smoothstep(2.0, 7.5, abs(p.x));
  float town = smoothstep(0.8, 2.0, p.x) * smoothstep(6.5, 4.8, p.x);
  if (town > 0.3 && h > 0.45) return 0.0; // clearings around the town
  float top = uShore + baseH + h * 0.5 + edge * 1.5 * (1.0 - town);
  float cx = (id + 0.5 + (hash12(vec2(id, seed + 3.0)) - 0.5) * 0.4) * cell;
  float yy = clamp((top - p.y) / (top - uShore + 0.001), 0.0, 1.0);
  float tiers = 0.82 + 0.18 * fract((top - p.y) * 3.2);
  float halfW = cell * 0.55 * yy * tiers * (0.75 + 0.25 * h);
  float px = max(fwidth(p.x), 1e-4) * 1.5;
  return smoothstep(halfW + px, halfW - px, abs(p.x - cx)) * step(p.y, top);
}

// Warm windows clustered on the hills to the right. stretch > 1 elongates
// them vertically (used for their reflections in the lake).
float townLights(vec2 p, float stretch) {
  float region = smoothstep(0.6, 1.6, p.x) * smoothstep(6.8, 5.0, p.x);
  float hy = hills(p.x) - 0.03;
  if (region <= 0.0 || p.y > hy || p.y < uShore) return 0.0;
  vec2 g = p * vec2(10.0, 14.0);
  vec2 id = floor(g);
  float h = hash12(id);
  // Sparser towards the hilltop and the edges of town, clustered in patches.
  float height = clamp((p.y - uShore) / max(hy - uShore, 0.01), 0.0, 1.0);
  float patches = smoothstep(0.3, 0.7, vnoise(id * 0.35 + 3.0));
  if (h > 0.2 * region * (1.0 - height * 0.7) * (0.35 + 0.65 * patches)) return 0.0;
  vec2 f = (fract(g) - 0.5 - (hash22(id + 9.0) - 0.5) * 0.6) * vec2(1.0, 1.4 / stretch);
  float px = max(fwidth(g.x), 1e-4);
  float tw = mix(1.0, 0.75 + 0.25 * sin(uTime * (0.5 + hash12(id + 4.0)) + h * 20.0), uMotion);
  return exp(-dot(f, f) / (px * px * 2.0 + 0.004)) * tw;
}
vec3 townColor(vec2 p) { return mix(vec3(1.0, 0.6, 0.28), vec3(1.0, 0.82, 0.55), hash12(floor(p * vec2(10.0, 14.0)) + 2.0)); }

void main() {
  vec2 p = vP;
  vec4 outCol = vec4(0.0);
  vec3 horizon = srgb(vec3(0.2, 0.19, 0.4));

  // Far mountains: blue-grey, fading into the horizon haze at their base.
  float mh = mountains(p.x);
  if (p.y < mh) {
    float below = mh - p.y;
    vec3 c = mix(srgb(vec3(0.15, 0.17, 0.3)), srgb(vec3(0.08, 0.09, 0.18)), clamp(below / 1.2, 0.0, 1.0));
    c += srgb(vec3(0.45, 0.45, 0.7)) * smoothstep(0.06, 0.0, below) * 0.3; // sky catching the ridge
    c = mix(c, horizon, smoothstep(uShore + 0.9, uShore, p.y) * 0.45);
    outCol = vec4(c, 1.0);
  }

  // Closer hills holding the town.
  float hh = hills(p.x);
  if (p.y < hh) {
    vec3 c = mix(srgb(vec3(0.07, 0.075, 0.15)), srgb(vec3(0.04, 0.045, 0.1)), clamp((hh - p.y) / 0.5, 0.0, 1.0));
    c += townColor(p) * townLights(p, 1.0) * 2.6;
    outCol = vec4(c, 1.0);
  }

  // Pine tree line along the shore.
  float tree = max(pines(p, 0.42, 1.0, 0.35), pines(p + vec2(0.2, 0.0), 0.3, 7.0, 0.15));
  outCol = mix(outCol, vec4(srgb(vec3(0.018, 0.026, 0.045)), 1.0), tree);

  // Lake: dark water reflecting the horizon, broken up by ripples.
  if (p.y < uShore) {
    float depth = uShore - p.y;
    float ripple = vnoise(vec2(p.x * 0.7, p.y * 30.0 + uTime * 0.5 * uMotion));
    float lines = smoothstep(0.55, 0.85, vnoise(vec2(p.x * 0.25 + uTime * 0.03 * uMotion, p.y * 55.0)));
    vec3 c = mix(srgb(vec3(0.12, 0.12, 0.26)), srgb(vec3(0.025, 0.035, 0.09)), smoothstep(0.0, 0.8, depth));
    c += srgb(vec3(0.35, 0.35, 0.6)) * lines * 0.12 * (1.0 - smoothstep(0.0, 1.0, depth));
    vec2 mirror = vec2(p.x + (ripple - 0.5) * 0.06, uShore + depth * 0.3);
    float glint = smoothstep(0.45, 0.8, vnoise(vec2(p.x * 3.0, p.y * 40.0 + uTime * 0.8 * uMotion)));
    c += townColor(mirror) * townLights(mirror, 4.0) * glint * 0.7;
    c += srgb(vec3(0.3, 0.3, 0.5)) * exp(-depth * 10.0) * 0.12; // mist along the shore
    outCol = vec4(c, 1.0);
  }

  if (outCol.a < 0.01) discard;
  gl_FragColor = outCol;
  #include <colorspace_fragment>
}`;

export function createOutside(shared: SharedUniforms, motion: { value: number }) {
  const group = new THREE.Group();
  group.name = 'outside';

  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 32),
    new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uLamp: shared.uLamp, uMotion: motion },
      vertexShader: PLANE_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      depthWrite: false,
    }),
  );
  sky.position.set(-28, 5, -0.3);
  sky.rotation.y = Math.PI / 2;
  sky.renderOrder = -2;

  const land = new THREE.Mesh(
    new THREE.PlaneGeometry(36, 14),
    new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uMotion: motion, uShore: { value: 0.75 } },
      vertexShader: PLANE_VERTEX,
      fragmentShader: LAND_FRAGMENT,
    }),
  );
  land.position.set(-12, 2.5, -0.3);
  land.rotation.y = Math.PI / 2;
  land.renderOrder = -1;

  group.add(sky, land);
  return group;
}

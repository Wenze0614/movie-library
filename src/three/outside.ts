import * as THREE from 'three';
import { NOISE } from './glsl';
import type { SharedUniforms } from './materials';

/**
 * Everything seen through the window is painted procedurally on two planes:
 * a far sky and a nearer landscape. Two depths give real parallax when the
 * camera drifts with the pointer.
 *
 * There are two worlds: night (stars, galaxy, a town by a lake, pines) and
 * day (blue sky, a few clouds, snowy mountains, wooded hills, a meadow full
 * of flowers). They swap like two cards stacked in the window: the one in
 * front (`uFront`) is pinned at the window's bottom-left corner and swings a
 * quarter turn anticlockwise away (`uSwing` 0 → 1), revealing the other, which stays still
 * behind it. Each plane gets its own pivot (`uPivot`), on the camera's line of
 * sight through that corner, so the two depths swing together.
 */

/**
 * Weather, layered on top of whichever world is showing: grey overcast and
 * rainy mist (`uRain` 0 → 1). It doesn't turn with the world.
 */
const WEATHER = /* glsl */ `
uniform float uRain;
uniform float uDay;
vec3 overcast(vec2 p) {
  float drift = uTime * 0.025 * uMotion;
  float shade = fbm(vec2(p.x * 0.11 + drift, p.y * 0.28)) * 0.7 + fbm(vec2(p.x * 0.3 - drift * 1.4, p.y * 0.55) + 5.0) * 0.3;
  vec3 night = mix(srgb(vec3(0.13, 0.14, 0.18)), srgb(vec3(0.27, 0.28, 0.34)), shade);
  // The town's lights glow warm on the cloud base, low on the right.
  night += srgb(vec3(0.5, 0.33, 0.25)) * exp(-max(p.y + 0.5, 0.0) * 0.45) * smoothstep(-3.0, 3.0, p.x) * smoothstep(11.0, 4.0, p.x) * 0.5;
  vec3 day = mix(srgb(vec3(0.4, 0.44, 0.5)), srgb(vec3(0.7, 0.73, 0.78)), shade);
  return mix(night, day, uDay);
}
vec3 rainMist() { return mix(srgb(vec3(0.17, 0.18, 0.22)), srgb(vec3(0.58, 0.62, 0.66)), uDay); }
vec3 rainyLand(vec3 c, float height) {
  float grey = dot(c, vec3(0.3, 0.55, 0.15));
  c = mix(c, vec3(grey) * 0.85, uRain * 0.45);
  return mix(c, rainMist(), uRain * (0.3 + 0.4 * smoothstep(0.0, 2.6, height)));
}
`;

/** Shared by both planes: the day/night card swing. */
const SWING = /* glsl */ `
uniform float uSwing;
uniform float uFront;
uniform vec2 uPivot;
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
// Where this pixel falls on the front card, in the card's own (unswung)
// coordinates. The card turns anticlockwise around the pivot, so a quarter
// turn lifts it entirely off to the left of the window.
vec2 cardCoord(vec2 p) { return uPivot + rot(uSwing * 1.5707963) * (p - uPivot); }
// Signed distance from the card's swinging (bottom) edge: positive on the card.
float cardEdge(vec2 u) { return u.y - uPivot.y; }
// The back world, darkened by the card's soft shadow near its edge.
float cardShadow(float edge, float px) {
  return 1.0 - 0.4 * exp(edge / (px * 40.0)) * smoothstep(1.0, 0.75, uSwing);
}
const vec3 CARD_RIM = vec3(0.62, 0.45, 0.3); // the cardboard's cut edge (linear)
`;

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
${SWING}
${WEATHER}

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

vec3 nightSky(vec2 p) {
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
  return col;
}

vec3 daySky(vec2 p) {
  float t = clamp((p.y + 1.0) / 9.0, 0.0, 1.0);
  // Pale at the horizon, deepening to a clear summer blue.
  vec3 col = mix(srgb(vec3(0.82, 0.91, 0.96)), srgb(vec3(0.5, 0.72, 0.93)), smoothstep(0.0, 0.4, t));
  col = mix(col, srgb(vec3(0.28, 0.54, 0.88)), smoothstep(0.35, 1.0, t));

  // Sun, upper right (the same side the daylight comes from in the room).
  float sd = length(p - vec2(6.8, 4.9));
  col += srgb(vec3(1.0, 0.95, 0.82)) * (exp(-sd * 0.55) * 0.3 + exp(-sd * sd * 4.0) * 1.6);

  // Puffy cumulus: billowy noise, brightest on top, soft blue-grey underneath.
  float drift = uTime * 0.012 * uMotion;
  vec2 cp = vec2(p.x * 0.17 + drift, p.y * 0.4);
  float shape = fbm(cp + 2.0) + 0.35 * fbm(cp * 2.3 + 7.0) - 0.18;
  float band = smoothstep(0.6, 1.9, p.y) * smoothstep(8.5, 5.0, p.y);
  float cloud = smoothstep(0.58, 0.7, shape * (0.78 + 0.36 * band));
  float above = fbm(cp + 2.0 + vec2(0.0, 0.12)) + 0.35 * fbm((cp + vec2(0.0, 0.12)) * 2.3 + 7.0) - 0.18;
  float lit = clamp(0.55 + (shape - above) * 5.0 + (p.y - 2.0) * 0.08, 0.0, 1.0);
  vec3 cloudCol = mix(srgb(vec3(0.7, 0.77, 0.87)), srgb(vec3(0.97, 0.97, 0.96)), lit);
  col = mix(col, cloudCol, cloud * 0.96);

  return col;
}

void main() {
  vec3 col;
  // Both branches depend only on uniforms, so derivatives (fwidth) stay valid inside.
  float px = max(fwidth(vP.x), 1e-4);
  if (uSwing <= 0.0) {
    col = uFront < 0.5 ? nightSky(vP) : daySky(vP);
  } else {
    vec2 u = cardCoord(vP);
    vec3 night = nightSky(uFront < 0.5 ? u : vP);
    vec3 day = daySky(uFront < 0.5 ? vP : u);
    vec3 front = uFront < 0.5 ? night : day;
    vec3 back = uFront < 0.5 ? day : night;
    float edge = cardEdge(u);
    front = mix(front, CARD_RIM, smoothstep(3.0 * px, 1.5 * px, edge));
    col = mix(back * cardShadow(edge, px), front, smoothstep(-px, px, edge));
  }
  // Full cover once it's raining properly: the galaxy is brighter than white, so a partial mix would still show it.
  if (uRain > 0.001) col = mix(col, overcast(vP), uRain);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const LAND_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uMotion;
uniform float uShore;
varying vec2 vP;
${NOISE}
${SWING}
${WEATHER}

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

vec4 nightLand(vec2 p) {
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
  return outCol;
}

// ---------------------------------------------------------------- day world

float dayMountains(float x) {
  float ridge = 1.0 - abs(vnoise(vec2(x * 0.28, 3.0)) * 2.0 - 1.0);
  float ridge2 = 1.0 - abs(vnoise(vec2(x * 0.6, 8.0)) * 2.0 - 1.0);
  return uShore + 0.8 + 1.1 * fbm(vec2(x * 0.1, 3.0)) + 1.1 * pow(ridge, 3.0) + 0.25 * ridge2;
}
float nearRange(float x) { return uShore + 0.6 + 0.55 * fbm(vec2(x * 0.22, 15.0)) + 0.3 * pow(1.0 - abs(vnoise(vec2(x * 0.4, 16.0)) * 2.0 - 1.0), 2.0); }
float dayHills(float x) { return uShore + 0.45 + 0.42 * fbm(vec2(x * 0.24, 7.0)) + 0.2 * sin(x * 0.33 + 1.0); }
float meadowTop(float x) { return uShore - 0.08 + 0.16 * sin(x * 0.45 + 0.3) + 0.1 * fbm(vec2(x * 0.4, 11.0)); }

// Round, leafy trees standing along the hilltops; lit from the upper right.
vec4 dayTrees(vec2 p) {
  float cell = 0.62;
  vec4 outCol = vec4(0.0);
  float px = max(fwidth(p.x), 1e-4) * 1.2; // measured before any per-pixel branch
  for (int n = -1; n <= 1; n++) {
    float id = floor(p.x / cell) + float(n);
    float h = hash12(vec2(id, 21.0));
    if (h > 0.6) continue;
    float cx = (id + 0.5 + (hash12(vec2(id, 22.0)) - 0.5) * 0.5) * cell;
    float r = mix(0.2, 0.36, hash12(vec2(id, 23.0)));
    float base = dayHills(cx) - 0.04;
    float trunk = mix(0.12, 0.22, hash12(vec2(id, 24.0)));
    vec2 cc = vec2(cx, base + trunk + r * 0.85);
    vec2 d = p - cc;
    float ang = atan(d.y, d.x);
    float edge = r * (1.0 + 0.07 * sin(ang * 6.0 + id * 3.0) + 0.04 * sin(ang * 11.0 + id));
    float canopy = smoothstep(edge + px, edge - px, length(d));
    float lit = clamp(0.5 + dot(normalize(d + 1e-4), normalize(vec2(0.7, 0.8))) * 0.5 * smoothstep(0.0, r, length(d)), 0.0, 1.0);
    vec3 leaf = mix(srgb(vec3(0.2, 0.38, 0.2)), srgb(vec3(0.42, 0.62, 0.3)), lit);
    leaf *= 0.92 + 0.16 * vnoise(p * 14.0 + id);
    float stem = step(abs(p.x - cx), 0.022) * step(base, p.y) * step(p.y, cc.y);
    vec4 tree = vec4(srgb(vec3(0.3, 0.22, 0.16)), stem);
    tree = mix(tree, vec4(leaf, 1.0), canopy);
    outCol = mix(outCol, tree, tree.a);
  }
  return outCol;
}

// One flower per grid cell (if it's picked), a round bloom swaying in the breeze.
vec3 flowers(vec3 c, vec2 p, vec2 scale, float density, float seed) {
  vec2 g = p * scale;
  vec2 id = floor(g);
  float px = max(fwidth(g.x), 1e-4); // before the branch: derivatives need every pixel
  if (hash12(id + seed) >= density) return c;
  vec2 sway = vec2(sin(uTime * 1.3 + id.x) * 0.06 * uMotion, 0.0);
  vec2 f = fract(g) - 0.5 - (hash22(id + seed + 1.0) - 0.5) * 0.5 - sway;
  float r = mix(0.12, 0.22, hash12(id + seed + 2.0));
  float petal = smoothstep(r + px, r - px, length(f));
  float centre = smoothstep(r * 0.4 + px, r * 0.4 - px, length(f));
  float pick = hash12(id + seed + 3.0);
  vec3 flower = pick < 0.3 ? srgb(vec3(1.0, 0.98, 0.94))
    : pick < 0.55 ? srgb(vec3(1.0, 0.84, 0.3))
    : pick < 0.75 ? srgb(vec3(1.0, 0.62, 0.76))
    : pick < 0.9 ? srgb(vec3(0.98, 0.45, 0.4))
    : srgb(vec3(0.76, 0.6, 1.0));
  c = mix(c, flower, petal);
  return mix(c, srgb(vec3(1.0, 0.82, 0.32)), centre * step(pick, 0.3));
}

vec4 dayLand(vec2 p) {
  vec4 outCol = vec4(0.0);
  vec3 haze = srgb(vec3(0.8, 0.89, 0.95));

  // Far mountains: blue rock fading into haze, snow on the tallest peaks.
  float mh = dayMountains(p.x);
  if (p.y < mh) {
    float below = mh - p.y;
    vec3 c = mix(srgb(vec3(0.52, 0.62, 0.78)), srgb(vec3(0.4, 0.5, 0.68)), clamp(below / 1.6, 0.0, 1.0));
    float sunSide = smoothstep(-0.2, 0.2, dayMountains(p.x - 0.15) - dayMountains(p.x + 0.15));
    c *= 0.9 + 0.18 * sunSide;
    float peak = smoothstep(uShore + 1.75, uShore + 2.3, mh);
    float snow = peak * smoothstep(0.55, 0.3, below + 0.14 * vnoise(p * 7.0) - 0.1 * vnoise(vec2(p.x * 9.0, 2.0)));
    c = mix(c, mix(srgb(vec3(0.82, 0.88, 0.97)), srgb(vec3(0.98, 0.98, 1.0)), sunSide), snow);
    c = mix(c, haze, smoothstep(uShore + 1.4, uShore + 0.4, p.y) * 0.55);
    outCol = vec4(c, 1.0);
  }

  // A nearer, bluer-green range for depth.
  float nr = nearRange(p.x);
  if (p.y < nr) {
    vec3 c = mix(srgb(vec3(0.46, 0.6, 0.66)), srgb(vec3(0.38, 0.52, 0.56)), clamp((nr - p.y) / 0.8, 0.0, 1.0));
    c = mix(c, haze, 0.25);
    outCol = vec4(c, 1.0);
  }

  // Rolling green hills.
  float hh = dayHills(p.x);
  if (p.y < hh) {
    vec3 c = mix(srgb(vec3(0.47, 0.68, 0.38)), srgb(vec3(0.33, 0.53, 0.3)), clamp((hh - p.y) / 0.9, 0.0, 1.0));
    c *= 0.95 + 0.1 * vnoise(p * vec2(2.0, 6.0));
    // Drifts of tiny wildflowers across the slopes.
    float drift = smoothstep(0.4, 0.75, vnoise(p * vec2(0.9, 2.2) + 5.0));
    c = flowers(c, p + 1.3, vec2(26.0, 38.0), 0.35 * drift, 83.0);
    c = mix(c, haze, 0.12);
    outCol = vec4(c, 1.0);
  }

  // Trees along the hills.
  vec4 trees = dayTrees(p);
  outCol = mix(outCol, vec4(trees.rgb, 1.0), trees.a);

  // Foreground meadow: bright grass with flowers, denser closer to us.
  float mt = meadowTop(p.x);
  if (p.y < mt) {
    float depth = mt - p.y;
    vec3 c = mix(srgb(vec3(0.6, 0.78, 0.4)), srgb(vec3(0.43, 0.66, 0.32)), smoothstep(0.0, 1.4, depth));
    float blades = vnoise(vec2(p.x * 26.0 + sin(uTime * 0.8 + p.y * 3.0) * 0.4 * uMotion, p.y * 4.0));
    c *= 0.9 + 0.18 * blades;
    c = mix(c, srgb(vec3(0.72, 0.86, 0.5)), smoothstep(0.08, 0.0, depth) * 0.6); // sunlit rim

    // Three offset layers of blooms, so they crowd together without lining up:
    // big ones up close, smaller and denser ones further back.
    c = flowers(c, p + 0.71, vec2(8.0, 12.0), 0.12 + 0.3 * smoothstep(0.05, 0.8, depth), 19.0);
    c = flowers(c, p, vec2(13.0, 20.0), 0.22 + 0.4 * smoothstep(0.05, 1.4, depth), 31.0);
    c = flowers(c, p + 0.37, vec2(19.0, 28.0), 0.18 + 0.32 * smoothstep(0.0, 1.0, depth), 57.0);
    outCol = vec4(c, 1.0);
  }
  return outCol;
}

void main() {
  vec4 col;
  float px = max(fwidth(vP.x), 1e-4);
  if (uSwing <= 0.0) {
    col = uFront < 0.5 ? nightLand(vP) : dayLand(vP);
  } else {
    vec2 u = cardCoord(vP);
    vec4 night = nightLand(uFront < 0.5 ? u : vP);
    vec4 day = dayLand(uFront < 0.5 ? vP : u);
    vec4 front = uFront < 0.5 ? night : day;
    vec4 back = uFront < 0.5 ? day : night;
    float edge = cardEdge(u);
    front = mix(front, vec4(CARD_RIM, 1.0), smoothstep(3.0 * px, 1.5 * px, edge));
    back.rgb *= cardShadow(edge, px);
    // Blended rather than discarded: discard would stop the GPU from skipping
    // the parts of this plane hidden behind the walls.
    col = mix(back, front, smoothstep(-px, px, edge));
  }
  if (uRain > 0.001) col.rgb = rainyLand(col.rgb, vP.y - uShore);
  gl_FragColor = col;
  #include <colorspace_fragment>
}`;

/**
 * The window opening's bottom-left corner (world space, on the glass), nudged
 * a little further out so the card's corner never shows inside the frame.
 */
const SWING_CORNER = new THREE.Vector3(-2.1, 0.86 - 0.2, 3.82 + 0.2);

export function createOutside(shared: SharedUniforms, motion: { value: number }) {
  const group = new THREE.Group();
  group.name = 'outside';

  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 32),
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: shared.uTime,
        uLamp: shared.uLamp,
        uMotion: motion,
        uSwing: shared.uSwing,
        uFront: shared.uFront,
        uRain: shared.uRain,
        uDay: shared.uDay,
        uPivot: { value: new THREE.Vector2() },
      },
      vertexShader: PLANE_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      depthWrite: false,
    }),
  );
  sky.position.set(-28, 5, -0.3);
  sky.rotation.y = Math.PI / 2;
  // Drawn after the room, so the depth test skips every pixel the walls hide.
  sky.renderOrder = 1;

  const land = new THREE.Mesh(
    new THREE.PlaneGeometry(36, 14),
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: shared.uTime,
        uMotion: motion,
        uShore: { value: 0.75 },
        uSwing: shared.uSwing,
        uFront: shared.uFront,
        uRain: shared.uRain,
        uDay: shared.uDay,
        uPivot: { value: new THREE.Vector2() },
      },
      vertexShader: PLANE_VERTEX,
      fragmentShader: LAND_FRAGMENT,
      // Transparent where there's sky, so it renders after the room and the
      // sky; first among transparent things, so steam and dust stay in front.
      transparent: true,
      depthWrite: false,
    }),
  );
  land.position.set(-12, 2.5, -0.3);
  land.rotation.y = Math.PI / 2;
  land.renderOrder = -1;

  group.add(sky, land);

  /**
   * Puts each plane's swing pivot where the camera's ray through the window's
   * bottom-left corner meets it, so both depths swing around the same point
   * on screen. Called every frame, since the camera drifts.
   */
  const aimSwing = (camera: THREE.Vector3) => {
    for (const plane of [sky, land]) {
      const t = (plane.position.x - camera.x) / (SWING_CORNER.x - camera.x);
      const y = camera.y + (SWING_CORNER.y - camera.y) * t;
      const z = camera.z + (SWING_CORNER.z - camera.z) * t;
      (plane.material.uniforms.uPivot.value as THREE.Vector2).set(-z, y);
    }
  };
  return { group, aimSwing };
}

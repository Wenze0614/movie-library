/**
 * Shared GLSL snippets. Plain template strings, so no shader loader is needed;
 * the `/* glsl *\/` marker enables highlighting in editors with a GLSL plugin.
 */

export const NOISE = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x),
             mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), u.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), u.x), u.y),
    mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), u.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), u.x), u.y),
    u.z);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = r * p * 2.03 + 11.7; a *= 0.5; }
  return v;
}
vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }
`;

/**
 * The room's lighting model: a warm lamp (with a shade that blocks light going
 * up), cool starlight coming through the window, and a two-tone ambient.
 * Soft wrap lighting keeps it illustrated rather than physically correct.
 */
export const LIGHTING = /* glsl */ `
uniform float uTime;
uniform vec3 uLampPos;
uniform vec3 uLampColor;
uniform float uLamp;          // 0 = off, 1 = on (animated)
uniform float uDay;           // 0 = night, 1 = day (animated)
uniform vec3 uMoonDir;        // direction *towards* the window light
uniform vec3 uMoonColor;
uniform vec3 uAmbSky;
uniform vec3 uAmbGround;

struct RoomLight { vec3 diffuse; vec3 specular; vec3 L; float lamp; float window; };

// The window opening (world space): x of the glass plane, then z/y extents.
const float WINDOW_X = -2.15;
const vec4 WINDOW_ZY = vec4(-4.45, 3.8, 0.88, 4.22);

/**
 * How much of the sky light reaches P through the window. Traces from P
 * towards the light until the window plane and soft-masks by the opening,
 * so the window casts a cool, slanted patch onto the sill and the cat.
 */
float windowLight(vec3 P) {
  float t = (P.x - WINDOW_X) / max(-uMoonDir.x, 1e-3);
  vec3 hit = P + uMoonDir * t;
  float soft = 0.08 + t * 0.07; // the penumbra widens with distance
  float mz = smoothstep(WINDOW_ZY.x - soft, WINDOW_ZY.x + soft, hit.z) * smoothstep(WINDOW_ZY.y + soft, WINDOW_ZY.y - soft, hit.z);
  float my = smoothstep(WINDOW_ZY.z - soft, WINDOW_ZY.z + soft, hit.y) * smoothstep(WINDOW_ZY.w + soft, WINDOW_ZY.w - soft, hit.y);
  return step(0.0, t) * mz * my;
}

RoomLight roomLight(vec3 P, vec3 N, vec3 V, float shadow, float wrap, float gloss) {
  RoomLight o;
  vec3 toL = uLampPos - P;
  float dist = length(toL);
  vec3 L = toL / dist;
  o.L = L;

  // Light only escapes through the bottom of the dome shade; a little leaks through the fabric.
  float cone = mix(0.22, 1.0, smoothstep(0.0, -0.42, -L.y));
  float atten = 1.0 / (1.0 + 0.32 * dist * dist);
  float ndl = (dot(N, L) + wrap) / (1.0 + wrap);
  float diff = smoothstep(0.0, 1.0, clamp(ndl, 0.0, 1.0));
  float lamp = uLamp * atten * cone * mix(0.08, 1.0, shadow);
  o.lamp = lamp * diff;

  // Fake bounce: lamp light scattered off the sill and walls, soft and wide.
  float bounce = uLamp * 0.11 / (1.0 + 0.03 * dist * dist) * (0.7 + 0.3 * dot(N, L));

  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), gloss) * step(0.0, dot(N, L));

  o.window = windowLight(P);
  float sky = max(dot(N, uMoonDir), 0.0) * o.window + 0.12 * (N.y * 0.5 + 0.5);
  // With the lamp off the room falls back to cool, dim starlight.
  vec3 amb = mix(uAmbGround, uAmbSky, N.y * 0.5 + 0.5) * mix(vec3(0.45, 0.55, 0.95), vec3(1.0), uLamp);

  o.diffuse = uLampColor * (o.lamp + bounce) + uMoonColor * sky + amb;
  o.specular = uLampColor * lamp * spec;
  return o;
}

/**
 * Cheap ambient occlusion tuned to this room: darkens the creases where the
 * sill meets the walls, and the contact areas under the mug, lamp and cat.
 */
const int OCCLUDERS = 6;
const vec4 OCC[OCCLUDERS] = vec4[](
  vec4(0.0, 0.3, -1.87, 0.34),   // mug
  vec4(-0.9, 0.1, -3.84, 0.6),   // lamp base
  vec4(1.95, 0.42, 0.95, 0.45),  // cat head
  vec4(2.0, 0.4, 1.9, 0.55),     // cat body
  vec4(2.05, 0.38, 2.9, 0.5),    // cat hips
  vec4(1.9, 0.4, 3.7, 0.4)       // cat tail root
);
float roomAO(vec3 P, vec3 N) {
  float crease = 1.0;
  float dWall = P.x + 1.98;       // from the back wall
  float dSill = P.y - 0.137;      // above the sill
  float dSide = 5.43 - abs(P.z);  // from the side walls
  float dCeil = 5.0 - P.y;
  crease *= 1.0 - 0.5 * (1.0 - smoothstep(0.0, 0.7, dWall)) * (1.0 - smoothstep(0.0, 0.7, dSill));
  crease *= 1.0 - 0.45 * (1.0 - smoothstep(0.0, 0.8, dSide)) * (1.0 - smoothstep(0.0, 0.8, min(dSill, dWall)));
  crease *= 1.0 - 0.4 * (1.0 - smoothstep(0.0, 0.9, dCeil)) * step(-2.4, P.x) * step(P.x, 2.0);
  float occ = 0.0;
  for (int i = 0; i < OCCLUDERS; i++) {
    vec3 d = OCC[i].xyz - P;
    float l = length(d);
    occ += max(dot(N, d / l), 0.0) * (OCC[i].w * OCC[i].w) / (l * l);
  }
  return crease * (1.0 - clamp(occ * 0.85, 0.0, 0.75));
}

float fresnel(vec3 N, vec3 V, float p) { return pow(1.0 - clamp(dot(N, V), 0.0, 1.0), p); }
`;

/**
 * Vertex shader for all lit room objects. DEFORM can move `transformed`
 * (object space) before projection — used for wind, breathing and the tail.
 */
export function litVertex(deform = '', decl = '') {
  return /* glsl */ `
#include <common>
#include <shadowmap_pars_vertex>
uniform float uTime;
varying vec3 vWorldPos;
varying vec3 vNormalW;
varying vec3 vLocalPos;
varying vec2 vUv;
${NOISE}
${decl}
void main() {
  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  ${deform}
  #include <project_vertex>
  #include <worldpos_vertex>
  #include <shadowmap_vertex>
  vLocalPos = position;
  vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vNormalW = transformNormalByInverseViewMatrix(transformedNormal, viewMatrix);
  vUv = uv;
}`;
}

/** Fragment shader wrapper: `body` must assign `vec3 col` (linear, HDR is fine) and may set `float alpha`. */
export function litFragment(body: string, decl = '') {
  return /* glsl */ `
#include <common>
#include <packing>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
${NOISE}
${LIGHTING}
varying vec3 vWorldPos;
varying vec3 vNormalW;
varying vec3 vLocalPos;
varying vec2 vUv;
${decl}
void main() {
  vec3 N = normalize(vNormalW);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWorldPos);
  float shadow = getShadowMask();
  float alpha = 1.0;
  vec3 col = vec3(0.0);
  ${body}
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
}

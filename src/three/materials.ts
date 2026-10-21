import * as THREE from 'three';
import { litFragment, litVertex } from './glsl';

/**
 * Uniforms every lit material shares by reference, so changing one value
 * (e.g. turning the lamp off) updates the whole room at once.
 */
export function createSharedUniforms() {
  return {
    uTime: { value: 0 },
    uLampPos: { value: new THREE.Vector3(-0.9, 1.18, -3.84) },
    uLampColor: { value: new THREE.Color('#ffa556').multiplyScalar(4.8) },
    uLamp: { value: 1 },
    /** 0 = night, 1 = day: the room's light follows the view outside. */
    uDay: { value: 0 },
    /** The day/night swap: 0 = the front world at rest, 1 = it has swung away (animated). */
    uSwing: { value: 0 },
    /** Which world is in front: 0 = night, 1 = day. */
    uFront: { value: 0 },
    /** 0 = clear, 1 = raining (animated). */
    uRain: { value: 0 },
    uMoonDir: { value: new THREE.Vector3(-1, 0.72, -0.32).normalize() },
    uMoonColor: { value: new THREE.Color('#6b7fd6').multiplyScalar(0.5) },
    uAmbSky: { value: new THREE.Color('#3d2e2c').multiplyScalar(0.62) },
    uAmbGround: { value: new THREE.Color('#5c3520').multiplyScalar(0.7) },
  };
}
export type SharedUniforms = ReturnType<typeof createSharedUniforms>;

interface LitOptions {
  shared: SharedUniforms;
  uniforms?: Record<string, THREE.IUniform>;
  fragment: string;
  fragmentDecl?: string;
  deform?: string;
  vertexDecl?: string;
  side?: THREE.Side;
  defines?: Record<string, string | number>;
}

function lit({ shared, uniforms = {}, fragment, fragmentDecl = '', deform = '', vertexDecl = '', side, defines }: LitOptions) {
  return new THREE.ShaderMaterial({
    lights: true,
    side: side ?? THREE.FrontSide,
    defines: defines ?? {},
    uniforms: { ...THREE.UniformsUtils.merge([THREE.UniformsLib.lights]), ...shared, ...uniforms },
    vertexShader: litVertex(deform, vertexDecl),
    fragmentShader: litFragment(fragment, fragmentDecl),
  });
}

const color = (hex: string) => ({ value: new THREE.Color(hex) });

/** Painted plaster: soft mottling so large flat walls don't look like CG. */
export function plasterMaterial(shared: SharedUniforms, hex: string) {
  return lit({
    shared,
    uniforms: { uColor: color(hex) },
    fragmentDecl: 'uniform vec3 uColor;',
    fragment: /* glsl */ `
      float mottle = vnoise3(vWorldPos * 1.3) * 0.6 + vnoise3(vWorldPos * 9.0) * 0.4;
      vec3 base = uColor * (0.88 + 0.2 * mottle);
      RoomLight l = roomLight(vWorldPos, N, V, shadow, 0.4, 12.0);
      col = (base * l.diffuse + l.specular * 0.03) * roomAO(vWorldPos, N);
    `,
  });
}

/** Painted wood with a faint grain running along the sill. */
export function woodMaterial(shared: SharedUniforms, hex: string, gloss = 0.12) {
  return lit({
    shared,
    uniforms: { uColor: color(hex), uGloss: { value: gloss } },
    fragmentDecl: 'uniform vec3 uColor; uniform float uGloss;',
    fragment: /* glsl */ `
      float grain = vnoise(vec2(vWorldPos.z * 0.9, (vWorldPos.x + vWorldPos.y) * 18.0));
      grain = mix(grain, vnoise(vec2(vWorldPos.z * 3.0, (vWorldPos.x + vWorldPos.y) * 40.0)), 0.4);
      vec3 base = uColor * (0.9 + 0.16 * grain);
      RoomLight l = roomLight(vWorldPos, N, V, shadow, 0.3, 30.0);
      col = (base * l.diffuse + l.specular * uGloss) * roomAO(vWorldPos, N) + uLampColor * uLamp * fresnel(N, V, 5.0) * 0.012;
    `,
  });
}

/** Glazed ceramic. The inside walls get darker towards the coffee. */
export function ceramicMaterial(shared: SharedUniforms, hex: string, center: THREE.Vector3) {
  return lit({
    shared,
    uniforms: { uColor: color(hex), uCenter: { value: center } },
    fragmentDecl: 'uniform vec3 uColor; uniform vec3 uCenter;',
    fragment: /* glsl */ `
      float r = length(vWorldPos.xz - uCenter.xz);
      vec3 radial = normalize(vec3(vWorldPos.x - uCenter.x, 0.0, vWorldPos.z - uCenter.z) + 1e-4);
      float inner = step(r, 0.275) * step(dot(N, radial), 0.0);
      float ao = mix(1.0, 0.45, inner * smoothstep(0.73, 0.6, vWorldPos.y));
      RoomLight l = roomLight(vWorldPos, N, V, shadow, 0.25, 90.0);
      float f = fresnel(N, V, 3.0);
      col = uColor * l.diffuse * ao + l.specular * 0.9;
      col += f * (uLampColor * uLamp * 0.07 * smoothstep(-0.1, 0.6, dot(N, l.L)) + uMoonColor * (0.3 + l.window));
    `,
  });
}

/**
 * The table lamp is one mesh in the GLB. A per-vertex `aShade` attribute
 * (computed on load) tells the dome shade apart from the stand.
 */
export function lampMaterial(shared: SharedUniforms) {
  return lit({
    shared,
    uniforms: { uShadeColor: color('#f08a34'), uStandColor: color('#5a4636') },
    vertexDecl: 'attribute float aShade; varying float vShade;',
    deform: 'vShade = aShade;',
    fragmentDecl: 'uniform vec3 uShadeColor; uniform vec3 uStandColor; varying float vShade;',
    fragment: /* glsl */ `
      RoomLight l = roomLight(vWorldPos, N, V, 1.0, 0.3, 60.0);
      vec3 stand = uStandColor * l.diffuse + l.specular * 0.35;

      // Shade: lit from inside like paper. Brighter towards the open rim,
      // and the inner surface (facing the bulb) glows hottest.
      vec3 toBulb = uLampPos - vWorldPos;
      float facingBulb = step(0.0, dot(N, toBulb));
      float rim = smoothstep(1.45, 0.82, vWorldPos.y);
      float fibres = 0.85 + 0.3 * vnoise(vec2(atan(toBulb.z, toBulb.x) * 18.0, vWorldPos.y * 4.0));
      vec3 glow = uShadeColor * (0.32 + 0.75 * rim) * fibres + vec3(1.0, 0.55, 0.22) * facingBulb * 1.4;
      vec3 shadeOff = uShadeColor * (uMoonColor * 0.35 + uAmbSky * 0.3) * (0.6 + 0.4 * max(dot(N, uMoonDir), 0.0));
      vec3 shade = mix(shadeOff, glow, uLamp);

      col = mix(stand, shade, vShade);
    `,
  });
}

/** Glowing bulb hidden under the shade (visible at low camera angles and for bloom). */
export function bulbMaterial(shared: SharedUniforms) {
  return new THREE.ShaderMaterial({
    uniforms: { uLamp: shared.uLamp },
    vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uLamp; void main(){ gl_FragColor = vec4(vec3(1.0, 0.8, 0.55) * mix(0.05, 3.5, uLamp), 1.0); }',
  });
}

export function coffeeMaterial(shared: SharedUniforms) {
  return lit({
    shared,
    fragment: /* glsl */ `
      RoomLight l = roomLight(vWorldPos, vec3(0.0, 1.0, 0.0), V, shadow, 0.0, 140.0);
      float swirl = vnoise(vWorldPos.xz * 9.0 + vec2(uTime * 0.05, 0.0));
      vec3 base = srgb(vec3(0.16, 0.08, 0.04)) * (0.8 + 0.4 * swirl);
      col = base * l.diffuse + l.specular * 1.4;
    `,
  });
}

/** World-space deformation for the cat: a lazy tail over the sill edge and slow breathing. */
const CAT_DEFORM = /* glsl */ `
  vec3 cw = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vec3 cn = normalize(mat3(modelMatrix) * objectNormal);
  float tail = smoothstep(0.08, -1.0, cw.y) * step(3.0, cw.z);
  float sway = sin(uTime * 0.85) * 0.65 + sin(uTime * 2.3 + 1.3) * 0.2;
  vec3 off = vec3(0.05, 0.0, 0.2) * sway * tail * tail;
  float body = smoothstep(1.1, 1.9, cw.z) * smoothstep(3.5, 2.5, cw.z) * smoothstep(0.1, 0.35, cw.y);
  float breath = (sin(uTime * 1.3) * 0.5 + 0.5);
  off += cn * breath * 0.022 * body;
  transformed += inverse(mat3(modelMatrix)) * off;
`;

const CAT_SHADE = /* glsl */ `
  RoomLight l = roomLight(vWorldPos, N, V, shadow, 0.5, 20.0);
  float f = fresnel(N, V, 2.6);
  // Lamp rim ignores the shade cone a little so the cat always has a warm edge.
  float lampRim = uLamp * smoothstep(0.0, 0.7, dot(N, l.L)) / (1.0 + 0.05 * dot(uLampPos - vWorldPos, uLampPos - vWorldPos));
  float skyRim = smoothstep(0.1, 0.8, dot(N, uMoonDir)) * (0.25 + 0.75 * l.window);
  vec3 rim = f * (uLampColor * lampRim * 0.32 + uMoonColor * skyRim * 1.6);
  vec3 base = srgb(vec3(0.03, 0.025, 0.028));
`;

export function catMaterial(shared: SharedUniforms) {
  return lit({
    shared,
    deform: CAT_DEFORM,
    fragment: /* glsl */ `
      ${CAT_SHADE}
      col = base * l.diffuse + rim + l.specular * 0.05;
    `,
  });
}

/**
 * Shell fur: the cat is drawn again N times, each shell pushed out a little
 * along the normal and cut into strands with noise. Gives the black cat a
 * soft, fuzzy silhouette that catches the lamp light.
 */
export function furShellMaterial(shared: SharedUniforms, shell: number, furLength: number) {
  return lit({
    shared,
    uniforms: { uShell: { value: shell }, uFurLength: { value: furLength } },
    vertexDecl: 'uniform float uShell; uniform float uFurLength; varying vec3 vRoot;',
    deform: /* glsl */ `
      ${CAT_DEFORM}
      vRoot = position;
      transformed += normalize(objectNormal) * uShell * uFurLength;
      transformed.y -= uShell * uShell * uFurLength * 0.4; // a touch of gravity
    `,
    fragmentDecl: 'uniform float uShell; varying vec3 vRoot;',
    fragment: /* glsl */ `
      float strands = hash13(floor(vRoot * 520.0));
      float clump = vnoise3(vRoot * 140.0);
      if (strands * 0.7 + clump * 0.45 < uShell * 0.9 + 0.12) discard;
      ${CAT_SHADE}
      col = base * l.diffuse * (0.6 + uShell * 0.8) + rim * (0.5 + uShell * 1.5);
    `,
  });
}

/** Ivy outside the window: backlit by the night sky, swaying in a light breeze. */
export function ivyMaterial(shared: SharedUniforms, map: THREE.Texture) {
  return lit({
    shared,
    side: THREE.DoubleSide,
    uniforms: { uMap: { value: map } },
    deform: /* glsl */ `
      vec3 iw = (modelMatrix * vec4(transformed, 1.0)).xyz;
      float sway = sin(uTime * 0.7 + iw.z * 0.45 + iw.y * 0.3) * 0.6 + (vnoise(iw.zy * 0.6 + uTime * 0.2) - 0.5);
      float flutter = vnoise(iw.zy * 5.0 + uTime * 1.4) - 0.5;
      float reach = 0.4 + 0.6 * smoothstep(4.6, 2.2, iw.y);
      vec3 off = vec3(0.35, 0.12, 1.0) * (sway * 0.07 + flutter * 0.035) * reach;
      transformed += inverse(mat3(modelMatrix)) * off;
    `,
    fragmentDecl: 'uniform sampler2D uMap;',
    fragment: /* glsl */ `
      vec3 tex = texture2D(uMap, vUv).rgb;
      RoomLight l = roomLight(vWorldPos, N, V, 1.0, 0.6, 8.0);
      // Light from the sky shining through the leaves: cool at night, sunny by day.
      float through = pow(clamp(dot(-V, uMoonDir) * 0.5 + 0.5, 0.0, 1.0), 3.0);
      vec3 skyTint = mix(srgb(vec3(0.38, 0.5, 0.62)), srgb(vec3(1.0, 1.0, 0.86)), uDay);
      col = tex * (l.diffuse * 0.6 + skyTint * (0.14 + through * 0.35 + uDay * 0.45));
      col += tex * srgb(vec3(0.5, 0.75, 0.35)) * fresnel(N, V, 3.0) * 0.25;
    `,
  });
}

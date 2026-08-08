import * as THREE from "three";

/**
 * Ordered (Bayer) dithering shared between the interactive hero and the static
 * inline images. Ported from the SAIL aesthetic, recolored to StreamLine's
 * indigo → purple flow so any photo resolves into the brand's dot field.
 */

// StreamLine ink (#2b2a5e) → brand purple (#7f77dd)
export const COL_DARK = new THREE.Vector3(43 / 255, 42 / 255, 94 / 255);
export const COL_LIGHT = new THREE.Vector3(127 / 255, 119 / 255, 221 / 255);
export const CLEAR_HEX = 0xf1efe9; // StreamLine paper
export const DOT_SIZE_CSS = 2.25;
export const MAX_PIXEL_RATIO = 3;

export const BAYER_8: number[][] = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

export function makeBayerTextureFloat(): THREE.DataTexture {
  const data = new Float32Array(8 * 8 * 4);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const i = (y * 8 + x) * 4;
      const t = (BAYER_8[y][x] + 0.5) / 64.0;
      data[i] = data[i + 1] = data[i + 2] = t;
      data[i + 3] = 1.0;
    }
  }
  const tex = new THREE.DataTexture(data, 8, 8);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.FloatType;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export const vertexShaderQuad = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Layered breathing + Bayer dither, no water/cursor — for static images. */
export const fragmentShaderStaticDither = `
  precision highp float;
  uniform sampler2D uPhoto;
  uniform sampler2D uBayer;
  uniform vec2 uResolution;
  uniform vec2 uTexSize;
  uniform float uDotSizePx;
  uniform vec3 uColorDark;
  uniform vec3 uColorBright;
  uniform float uTime;

  varying vec2 vUv;

  float luma(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
  }

  /** CSS object-fit: cover — sample photo without stretching */
  vec2 coverPhotoUv(vec2 cellUv) {
    if (uTexSize.x < 1.0 || uTexSize.y < 1.0) return cellUv;
    vec2 viewPx = cellUv * uResolution;
    float scale = max(uResolution.x / uTexSize.x, uResolution.y / uTexSize.y);
    vec2 scaled = uTexSize * scale;
    vec2 off = (uResolution - scaled) * 0.5;
    vec2 uv = (viewPx - off) / scaled;
    return clamp(uv, vec2(0.0), vec2(1.0));
  }

  void main() {
    vec2 px = vUv * uResolution;
    float cell = max(uDotSizePx, 1.0);
    vec2 cellId = floor(px / cell);
    vec2 cellCenter = cellId * cell + 0.5 * cell;
    vec2 cellUv = cellCenter / uResolution;

    vec3 photo = texture2D(uPhoto, coverPhotoUv(cellUv)).rgb;
    float lum = luma(photo);

    float layer = clamp(floor(lum * 4.0), 0.0, 3.0);
    float phase = layer * 1.57079633;
    float spd;
    float ampB;
    if (layer < 0.5) { spd = 0.5; ampB = 0.06; }
    else if (layer < 1.5) { spd = 0.7; ampB = 0.055; }
    else if (layer < 2.5) { spd = 0.4; ampB = 0.065; }
    else { spd = 0.6; ampB = 0.052; }

    float drift = sin(cellId.x * 0.014 + uTime * 0.055) * cos(cellId.y * 0.011 - uTime * 0.042)
      + 0.55 * sin((cellId.x + cellId.y) * 0.0095 + uTime * 0.032)
      + 0.35 * sin(cellId.x * 0.007 - cellId.y * 0.008 + uTime * 0.028);
    float breathe = ampB * sin(uTime * spd + phase + drift * 0.45);

    float lumAdj = lum + breathe;
    lumAdj = clamp(lumAdj, 0.0, 1.0);
    float highlight = smoothstep(0.72, 1.0, lumAdj);
    float dotLum = clamp(lumAdj - (0.18 * highlight), 0.0, 1.0);

    vec2 bayerCoord = mod(cellId, 8.0);
    float threshold = texture2D(uBayer, (bayerCoord + 0.5) / 8.0).r;

    vec3 outCol = dotLum >= threshold ? uColorBright : uColorDark;

    gl_FragColor = vec4(outCol, 1.0);
  }
`;

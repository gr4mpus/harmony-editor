/**
 * Colour maths: sRGB <-> OKLab, HSL hue, and the 12-slot artist's colour wheel.
 *
 * OKLab is a perceptual colour space: equal steps look like equal changes to the eye,
 * and its hue angle stays stable when chroma (colour intensity) changes. That is why
 * all intensity edits happen in OKLab/OKLCH rather than in HSL.
 */
import type { RGB } from '../types';

const srgbToLinear = (c: number) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const linearToSrgb = (c: number) => {
  c = Math.min(1, Math.max(0, c));
  return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
};

const LUT = new Float32Array(256);
for (let i = 0; i < 256; i++) LUT[i] = srgbToLinear(i);

/** 0–255 sRGB -> OKLab [L, a, b]. L is 0–1; a and b are roughly -0.4…0.4. */
export function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const lr = LUT[r], lg = LUT[g], lb = LUT[b];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab -> 0–255 sRGB (clamped). */
export function oklabToRgb(L: number, a: number, b: number): RGB {
  let l = L + 0.3963377774 * a + 0.2158037573 * b;
  let m = L - 0.1055613458 * a - 0.0638541728 * b;
  let s = L - 0.0894841775 * a - 1.291485548 * b;
  l = l ** 3; m = m ** 3; s = s ** 3;
  return [
    Math.round(linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    Math.round(linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    Math.round(linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  ];
}

/** HSL hue in degrees (0–360) of a 0–255 sRGB colour. */
export function hslHue(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** HSV-style saturation 0–1. */
export function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  return max ? (max - Math.min(r, g, b)) / max : 0;
}

/**
 * The artist's wheel has 12 slots. Each is anchored to an HSL hue chosen so that
 * opposites match what painters expect: blue↔orange, red↔green, yellow↔violet.
 */
export const FAMILY_NAMES = [
  'Red', 'Red-orange', 'Orange', 'Yellow-orange', 'Yellow', 'Yellow-green',
  'Green', 'Teal', 'Blue', 'Blue-violet', 'Violet', 'Magenta',
] as const;
export const SLOT_HUES = [0, 15, 30, 42, 55, 85, 120, 170, 210, 240, 270, 320];

/** Maps an HSL hue to a position on the artist's wheel, in degrees (slot index × 30). */
export function wheelAngle(hue: number): number {
  for (let i = 0; i < 12; i++) {
    const a = SLOT_HUES[i], b = i === 11 ? 360 : SLOT_HUES[i + 1];
    if (hue >= a && hue < b) return (i + (hue - a) / (b - a)) * 30;
  }
  return 0;
}

export const familyIndex = (rgb: RGB) => Math.round(wheelAngle(hslHue(...rgb)) / 30) % 12;
export const familyName = (rgb: RGB) => FAMILY_NAMES[familyIndex(rgb)];

/** Shortest distance between two angles in degrees (0–180). */
export function angularDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Smallest arc (degrees) that contains every angle. */
export function arcSpan(angles: number[]): number {
  if (angles.length < 2) return 0;
  const s = [...angles].sort((a, b) => a - b);
  let gap = 0;
  for (let i = 0; i < s.length; i++) {
    const g = (i === s.length - 1 ? s[0] + 360 : s[i + 1]) - s[i];
    gap = Math.max(gap, g);
  }
  return 360 - gap;
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export const cssRgb = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`;
export function cssGrey(c: RGB): string {
  const g = Math.round(0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]);
  return `rgb(${g},${g},${g})`;
}

/** -1…1 slider value -> "+35", "-100", "0". */
export function formatAmount(v: number): string {
  const n = Math.round(v * 100);
  return (n > 0 ? '+' : '') + n;
}

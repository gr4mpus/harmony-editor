/** Small, allocation-light helpers for working with per-pixel masks. */
import type { RGB, WorkImage } from '../types';

/** Separable box blur with a running sum. Three passes approximate a Gaussian. */
export function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return src;
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let s = 0;
    for (let x = -r; x <= r; x++) s += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = s / n;
      s += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / n;
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

export const gaussianBlur = (src: Float32Array, w: number, h: number, r: number) =>
  boxBlur(boxBlur(boxBlur(src, w, h, r), w, h, r), w, h, r);

/** Grows a mask by r pixels (separable max filter). */
export function dilate(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return src;
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) if (src[y * w + k] > m) m = src[y * w + k];
      tmp[y * w + x] = m;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) if (tmp[k * w + x] > m) m = tmp[k * w + x];
      out[y * w + x] = m;
    }
  return out;
}

/** Euclidean distance between two pixels in OKLab (ΔE_ok). */
export function labDistance(lab: Float32Array, i: number, j: number): number {
  const a = lab[i * 3] - lab[j * 3], b = lab[i * 3 + 1] - lab[j * 3 + 1], c = lab[i * 3 + 2] - lab[j * 3 + 2];
  return Math.sqrt(a * a + b * b + c * c);
}

/** Average colour of the pixels where mask > threshold. */
export function averageRGB(work: WorkImage, mask: ArrayLike<number>, threshold = 0.5): RGB {
  const { data } = work;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < mask.length; i++)
    if (mask[i] > threshold) { r += data[i * 4]; g += data[i * 4 + 1]; b += data[i * 4 + 2]; n++; }
  return n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : [128, 128, 128];
}

/** Iterates the 4-connected neighbours of pixel i, skipping ones across the image edge. */
export function forEachNeighbour(i: number, w: number, n: number, fn: (j: number) => void): void {
  const x = i % w;
  if (x > 0) fn(i - 1);
  if (x < w - 1) fn(i + 1);
  if (i - w >= 0) fn(i - w);
  if (i + w < n) fn(i + w);
}

/** Deterministic pseudo-random numbers (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

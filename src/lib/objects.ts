/**
 * Selects the object under a clicked point.
 *
 * With AI: MediaPipe's "Magic Touch" interactive segmenter returns the object's outline.
 * Without AI: a colour-based flood fill grows outward from the clicked pixel while the
 * colour stays close both to its neighbour and to the region's running average.
 */
import type { InteractiveSegmenter } from '@mediapipe/tasks-vision';
import type { RGB, WorkImage } from '../types';
import { averageRGB, boxBlur, dilate, forEachNeighbour, gaussianBlur, labDistance } from './masks';

export interface ObjectSelection {
  mask: Float32Array;
  pct: number;
  rgb: RGB;
  ai: boolean;
  /** Share of the object's pixels that have noticeable colour (0–1). */
  colourful: number;
}

function growRegion(work: WorkImage, px: number, py: number): Float32Array {
  const { width: w, height: h, lab } = work, N = w * h;
  const seed = py * w + px, inside = new Uint8Array(N), queue = new Int32Array(N);
  let head = 0, tail = 0, n = 1;
  let sL = lab[seed * 3], sa = lab[seed * 3 + 1], sb = lab[seed * 3 + 2];
  inside[seed] = 1; queue[tail++] = seed;
  while (head < tail && n < N * 0.6) {
    const i = queue[head++];
    forEachNeighbour(i, w, N, (j) => {
      if (inside[j]) return;
      const dMean = Math.hypot(lab[j * 3] - sL / n, lab[j * 3 + 1] - sa / n, lab[j * 3 + 2] - sb / n);
      if (dMean < 0.085 && labDistance(lab, i, j) < 0.045) {
        inside[j] = 1; queue[tail++] = j; n++;
        sL += lab[j * 3]; sa += lab[j * 3 + 1]; sb += lab[j * 3 + 2];
      }
    });
  }
  const f = new Float32Array(N);
  for (let i = 0; i < N; i++) f[i] = inside[i];
  return boxBlur(f, w, h, 2).map((v) => (v > 0.45 ? 1 : 0)); // close pinholes
}

function segmentWithModel(work: WorkImage, px: number, py: number, model: InteractiveSegmenter): Float32Array | null {
  const { canvas, width: w, height: h } = work, N = w * h;
  try {
    const res = model.segment(canvas, { keypoint: { x: (px + 0.5) / w, y: (py + 0.5) / h } });
    const mask = res.categoryMask;
    if (!mask) return null;
    const arr = mask.getAsUint8Array(), mw = mask.width, mh = mask.height;
    const at = (x: number, y: number) =>
      arr[Math.min(mh - 1, Math.floor((y * mh) / h)) * mw + Math.min(mw - 1, Math.floor((x * mw) / w))];
    // The object is whichever label sits under the click
    const label = at(px, py);
    const bin = new Float32Array(N);
    let n = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (at(x, y) === label) { bin[y * w + x] = 1; n++; }
    mask.close();
    res.close();
    return n < N * 0.0005 || n > N * 0.9 ? null : bin;
  } catch (e) {
    console.warn('Object model failed, using colour-based selection:', e);
    return null;
  }
}

export function selectObject(work: WorkImage, px: number, py: number, model: InteractiveSegmenter | null): ObjectSelection {
  const { width: w, height: h, data, lab } = work, N = w * h;
  const fromModel = model ? segmentWithModel(work, px, py, model) : null;
  const bin = fromModel ?? growRegion(work, px, py);
  const mask = gaussianBlur(dilate(bin, w, h, 1), w, h, Math.max(1, Math.round(Math.max(w, h) * 0.002)));

  // Representative colour: average of the object's colourful pixels
  let count = 0, r = 0, g = 0, b = 0, k = 0;
  for (let i = 0; i < N; i++) {
    if (bin[i] <= 0.5) continue;
    count++;
    if (Math.hypot(lab[i * 3 + 1], lab[i * 3 + 2]) > 0.03) { r += data[i * 4]; g += data[i * 4 + 1]; b += data[i * 4 + 2]; k++; }
  }
  const rgb: RGB = k ? [Math.round(r / k), Math.round(g / k), Math.round(b / k)] : averageRGB(work, bin);
  return { mask, pct: count / N, rgb, ai: !!fromModel, colourful: k / Math.max(1, count) };
}

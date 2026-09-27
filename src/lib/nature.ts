/**
 * Finds the sky and greenery using colour, texture and position (no AI needed).
 *
 * Sky: smooth, bright, non-green pixels are grown downward from the top edge, stopping
 *      at colour edges such as the horizon. Blue patches seen through trees that match the
 *      main sky are added afterwards.
 * Greenery: pixels whose OKLab hue is around foliage green (~135°), weighted up when the
 *      area is textured like leaves or grass, then smoothed into a soft region.
 * People (including their clothes) are always excluded from both.
 */
import type { Region, WorkImage } from '../types';
import { hslHue, saturation, smoothstep } from './color';
import { averageRGB, boxBlur, forEachNeighbour, gaussianBlur, labDistance } from './masks';

export function detectSky(work: WorkImage, person: Float32Array): Region | null {
  const { width: w, height: h, data, lab } = work, N = w * h;

  // Local brightness gradient: skies are smooth
  const grad = new Float32Array(N);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      grad[i] = Math.abs(lab[(i + 1) * 3] - lab[(i - 1) * 3]) + Math.abs(lab[(i + w) * 3] - lab[(i - w) * 3]);
    }
  const smooth = boxBlur(grad, w, h, 2);

  const candidate = new Uint8Array(N), blue = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (person[i] > 0.5 || smooth[i] > 0.045) continue;
    const y = Math.floor(i / w), r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const L = lab[i * 3], C = Math.hypot(lab[i * 3 + 1], lab[i * 3 + 2]);
    const hue = hslHue(r, g, b), sat = saturation(r, g, b);
    const isBlue = hue >= 180 && hue <= 265 && L > 0.35 && sat > 0.06;
    const isPale = L > 0.78 && C < 0.05; // overcast sky, clouds
    const isSkyish = y < h * 0.75 && L > 0.4 && !(hue >= 70 && hue <= 170 && sat > 0.15); // sunset oranges, pinks, haze
    if (isBlue || isPale || isSkyish) candidate[i] = 1;
    if (isBlue) blue[i] = 1;
  }

  // Flood fill from the top rows through smooth, continuous colour
  const inSky = new Uint8Array(N), queue = new Int32Array(N);
  let head = 0, tail = 0;
  const topRows = Math.max(2, Math.round(h * 0.03));
  for (let i = 0; i < topRows * w; i++) if (candidate[i]) { inSky[i] = 1; queue[tail++] = i; }
  while (head < tail) {
    const i = queue[head++];
    forEachNeighbour(i, w, N, (j) => {
      if (!inSky[j] && candidate[j] && labDistance(lab, i, j) < 0.03) { inSky[j] = 1; queue[tail++] = j; }
    });
  }

  let count = 0, mL = 0, ma = 0, mb = 0;
  for (let i = 0; i < N; i++) if (inSky[i]) { count++; mL += lab[i * 3]; ma += lab[i * 3 + 1]; mb += lab[i * 3 + 2]; }
  if (count < N * 0.01) return null;
  mL /= count; ma /= count; mb /= count;

  // Blue patches seen through trees that match the main sky
  for (let i = 0; i < N * 0.75; i++)
    if (!inSky[i] && blue[i] && Math.hypot(lab[i * 3] - mL, lab[i * 3 + 1] - ma, lab[i * 3 + 2] - mb) < 0.08) inSky[i] = 1;

  const L = Math.max(w, h);
  let mask: Float32Array = new Float32Array(N);
  for (let i = 0; i < N; i++) mask[i] = inSky[i];
  mask = gaussianBlur(boxBlur(mask, w, h, 1).map((v) => (v > 0.4 ? 1 : 0)), w, h, Math.max(1, Math.round(L * 0.003)));

  let covered = 0, ySum = 0, yN = 0;
  for (let i = 0; i < N; i++) {
    mask[i] = Math.min(1, mask[i] * (1 - person[i]));
    if (mask[i] > 0.5) { covered++; ySum += Math.floor(i / w); yN++; }
  }
  // Swatch colours for the upper and lower halves (e.g. blue fading into a sunset)
  const split = (ySum / Math.max(1, yN)) * w;
  return {
    mask,
    pct: covered / N,
    rgb: averageRGB(work, mask.map((v, i) => (i < split ? v : 0))),
    rgb2: averageRGB(work, mask.map((v, i) => (i >= split ? v : 0))),
  };
}

export function detectGreenery(work: WorkImage, person: Float32Array, sky: Region | null): Region | null {
  const { width: w, height: h, lab } = work, N = w * h;

  // Local texture: standard deviation of lightness in a 5×5 window.
  // Leaves and grass are textured; painted walls and cars are smooth.
  const Lc = new Float32Array(N), L2 = new Float32Array(N);
  for (let i = 0; i < N; i++) { Lc[i] = lab[i * 3]; L2[i] = Lc[i] * Lc[i]; }
  const meanL = boxBlur(Lc, w, h, 2), meanL2 = boxBlur(L2, w, h, 2);

  const raw = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (person[i] > 0.5 || (sky && sky.mask[i] > 0.5)) continue;
    const a = lab[i * 3 + 1], b = lab[i * 3 + 2], C = Math.hypot(a, b);
    if (C < 0.02 || lab[i * 3] < 0.08) continue;
    let hd = Math.abs((Math.atan2(b, a) * 180) / Math.PI - 135);
    if (hd > 180) hd = 360 - hd;
    const hueWeight = hd < 32 ? 1 : hd < 58 ? (58 - hd) / 26 : 0;
    if (!hueWeight) continue;
    const texture = smoothstep(0.008, 0.035, Math.sqrt(Math.max(0, meanL2[i] - meanL[i] * meanL[i])));
    raw[i] = hueWeight * (0.4 + 0.6 * texture) * smoothstep(0.02, 0.05, C);
  }

  const mask = gaussianBlur(raw, w, h, Math.max(2, Math.round(Math.max(w, h) * 0.006)));
  let count = 0;
  for (let i = 0; i < N; i++) {
    let v = Math.min(1, mask[i] * 2.2);
    if (v < 0.1) v = 0;
    mask[i] = v * (1 - person[i]);
    if (raw[i] > 0.4) count++;
  }
  if (count < N * 0.01) return null;
  return { mask, pct: count / N, rgb: averageRGB(work, raw, 0.4) };
}

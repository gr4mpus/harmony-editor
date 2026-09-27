/**
 * Finds the photo's main colours.
 *
 * 1. Sample up to ~60k editable pixels (protected people are skipped).
 * 2. Drop greys, near-blacks and near-whites: they have no real hue to adjust.
 * 3. Run k-means in OKLab (lightness is down-weighted so clusters split by hue, not brightness).
 * 4. Merge clusters that land in the same hue family and drop families under 3%.
 */
import { MAX_CLUSTERS } from '../config';
import type { ColourCluster, WorkImage } from '../types';
import { FAMILY_NAMES, hslHue, oklabToRgb, wheelAngle } from './color';
import { seededRandom } from './masks';

const MIN_CHROMA = 0.035;
const MIN_SHARE = 0.03;

function kmeans(points: Float32Array, n: number, k: number) {
  const rand = seededRandom(7);
  const centres = new Float32Array(k * 3);
  const nearest = new Float32Array(n).fill(1e9);
  const dist = (i: number, c: number) => {
    const dl = points[i * 3] - centres[c * 3], da = points[i * 3 + 1] - centres[c * 3 + 1], db = points[i * 3 + 2] - centres[c * 3 + 2];
    return 0.3 * dl * dl + da * da + db * db;
  };
  // k-means++ seeding: each new centre is picked far from the existing ones
  const first = Math.floor(rand() * n);
  centres.set(points.subarray(first * 3, first * 3 + 3), 0);
  for (let c = 1; c < k; c++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const d = dist(i, c - 1);
      if (d < nearest[i]) nearest[i] = d;
      sum += nearest[i];
    }
    let t = rand() * sum, i = 0;
    for (; i < n - 1; i++) { t -= nearest[i]; if (t <= 0) break; }
    centres.set(points.subarray(i * 3, i * 3 + 3), c * 3);
  }
  const counts = new Float64Array(k), acc = new Float64Array(k * 3);
  for (let iter = 0; iter < 12; iter++) {
    counts.fill(0); acc.fill(0);
    for (let i = 0; i < n; i++) {
      let best = 0, bd = 1e9;
      for (let c = 0; c < k; c++) { const d = dist(i, c); if (d < bd) { bd = d; best = c; } }
      counts[best]++;
      acc[best * 3] += points[i * 3]; acc[best * 3 + 1] += points[i * 3 + 1]; acc[best * 3 + 2] += points[i * 3 + 2];
    }
    for (let c = 0; c < k; c++) if (counts[c]) for (let j = 0; j < 3; j++) centres[c * 3 + j] = acc[c * 3 + j] / counts[c];
  }
  return { centres, counts };
}

export function analyseColours(work: WorkImage, protect: Uint8Array | null): ColourCluster[] {
  const { width: w, height: h, lab } = work;
  const N = w * h, step = Math.max(1, Math.floor(N / 60000));
  const points = new Float32Array(Math.ceil(N / step) * 3);
  let n = 0, total = 0;
  for (let i = 0; i < N; i += step) {
    if (protect && protect[i] > 127) continue;
    total++;
    const L = lab[i * 3], a = lab[i * 3 + 1], b = lab[i * 3 + 2];
    if (Math.hypot(a, b) < MIN_CHROMA || L < 0.12 || L > 0.97) continue;
    points[n * 3] = L; points[n * 3 + 1] = a; points[n * 3 + 2] = b; n++;
  }
  if (n <= 50) return [];

  const { centres, counts } = kmeans(points, n, Math.min(MAX_CLUSTERS, n));
  const families = new Map<number, { L: number; a: number; b: number; n: number }>();
  for (let c = 0; c < counts.length; c++) {
    if (!counts[c]) continue;
    const L = centres[c * 3], a = centres[c * 3 + 1], b = centres[c * 3 + 2];
    const fam = Math.round(wheelAngle(hslHue(...oklabToRgb(L, a, b))) / 30) % 12;
    const g = families.get(fam) ?? { L: 0, a: 0, b: 0, n: 0 };
    g.L += L * counts[c]; g.a += a * counts[c]; g.b += b * counts[c]; g.n += counts[c];
    families.set(fam, g);
  }

  const out: ColourCluster[] = [];
  for (const [family, g] of families) {
    const share = g.n / total;
    if (share < MIN_SHARE) continue;
    const L = g.L / g.n, a = g.a / g.n, b = g.b / g.n;
    const rgb = oklabToRgb(L, a, b);
    out.push({ name: FAMILY_NAMES[family], family, rgb, share, okHue: Math.atan2(b, a), wheel: wheelAngle(hslHue(...rgb)) });
  }
  return out.sort((x, y) => y.share - x.share).slice(0, MAX_CLUSTERS);
}

/** The detected colour closest in hue to a pixel, or null if the pixel is grey or no colour is close. */
export function nearestCluster(clusters: ColourCluster[], a: number, b: number): number | null {
  if (Math.hypot(a, b) < 0.03) return null;
  const hue = Math.atan2(b, a);
  let best: number | null = null, bestDist = 0.6; // ~35°
  clusters.forEach((c, k) => {
    let d = Math.abs(hue - c.okHue);
    d = Math.min(d, Math.PI * 2 - d);
    if (d < bestDist) { bestDist = d; best = k; }
  });
  return best;
}

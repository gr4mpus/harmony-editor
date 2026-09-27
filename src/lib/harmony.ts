/**
 * Classifies the photo's colour harmony from the angles between its main hues
 * on the artist's wheel.
 */
import type { ColourCluster, HarmonyResult, HarmonyType } from '../types';
import { angularDistance, arcSpan } from './color';

export const HARMONY_INFO: Record<HarmonyType, string> = {
  Complementary: 'Two colours from opposite sides of the wheel. They make each other stand out, so the photo feels bold and full of energy.',
  'Split-complementary': 'One main colour plus the two neighbours of its opposite. It has the punch of opposites but feels a little softer and more balanced.',
  Analogous: 'Colours that sit next to each other on the wheel. They blend smoothly, so the photo feels calm, warm or cosy.',
  Monochromatic: 'Mostly one colour family in lighter and darker shades. The photo feels simple, quiet and moody.',
  Triadic: 'Three colours spaced evenly around the wheel. Lively and playful, and it works best when one colour leads.',
  Mixed: "The main colours don't follow a classic pattern. Try fading the colours that compete to give the photo a clearer mood.",
  'No colour': 'This photo has almost no colour to adjust, so there is no harmony to detect.',
};

export function classifyHarmony(clusters: ColourCluster[]): HarmonyResult {
  if (!clusters.length) return { type: 'No colour', confidence: 0, groups: [] };

  // Merge hues within 30° into groups, strongest first
  const groups: { angle: number; share: number }[] = [];
  for (const c of clusters) {
    const g = groups.find((g) => angularDistance(g.angle, c.wheel) <= 30);
    if (g) g.share += c.share;
    else groups.push({ angle: c.wheel, share: c.share });
  }
  const total = groups.reduce((s, g) => s + g.share, 0);
  const sig = groups.filter((g) => g.share / total >= 0.1).slice(0, 3);
  const A = sig.map((g) => g.angle);
  const coverage = sig.reduce((s, g) => s + g.share, 0) / total;
  const result = (type: HarmonyType, fit: number): HarmonyResult => ({
    type,
    confidence: Math.max(0, Math.min(1, fit)) * (0.7 + 0.3 * coverage),
    groups: sig,
  });

  const span = arcSpan(A);
  if (sig.length === 1 || span <= 30) return result('Monochromatic', sig.length === 1 ? 0.95 : 1 - span / 60);

  if (sig.length === 2) {
    const d = angularDistance(A[0], A[1]);
    if (Math.abs(d - 180) <= 25) return result('Complementary', 1 - Math.abs(d - 180) / 50);
    if (d <= 90) return result('Analogous', 1 - Math.max(0, d - 60) / 60);
    return result('Mixed', 0.5);
  }

  const d01 = angularDistance(A[0], A[1]), d02 = angularDistance(A[0], A[2]), d12 = angularDistance(A[1], A[2]);
  const triadError = Math.max(Math.abs(d01 - 120), Math.abs(d02 - 120), Math.abs(d12 - 120));
  if (triadError <= 25) return result('Triadic', 1 - triadError / 50);

  for (const [b, o1, o2] of [[0, 1, 2], [1, 0, 2], [2, 0, 1]]) {
    const e = Math.max(Math.abs(angularDistance(A[b], A[o1]) - 150), Math.abs(angularDistance(A[b], A[o2]) - 150));
    if (e <= 20 && angularDistance(A[o1], A[o2]) <= 80) return result('Split-complementary', 1 - e / 40);
  }
  if (span <= 90) return result('Analogous', 1 - Math.max(0, span - 60) / 60);

  for (const [x, y, z] of [[0, 1, 2], [0, 2, 1], [1, 2, 0]]) {
    const d = angularDistance(A[x], A[y]);
    if (Math.abs(d - 180) <= 25 && (angularDistance(A[z], A[x]) <= 35 || angularDistance(A[z], A[y]) <= 35))
      return result('Complementary', (1 - Math.abs(d - 180) / 50) * 0.85);
  }
  return result('Mixed', 0.5);
}

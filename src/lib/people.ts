/**
 * Keeps people untouched.
 *
 * With AI: MediaPipe's multiclass selfie model labels each pixel
 *   0 background · 1 hair · 2 body skin · 3 face skin · 4 clothes · 5 other (accessories)
 * and a face detector adds a soft ellipse over every face as a safety net.
 * Faces are always protected; body skin and hair are optional; clothes stay editable.
 *
 * Without AI: a classic YCbCr skin-tone test, tightened so vivid oranges
 * (sunsets, fruit) are not mistaken for skin.
 */
import type { FaceBox, PeopleDetection, Protection, WorkImage } from '../types';
import { hslHue, saturation } from './color';
import { boxBlur, dilate, gaussianBlur } from './masks';
import type { PeopleModels } from './models';

export const CATEGORY = { background: 0, hair: 1, bodySkin: 2, faceSkin: 3, clothes: 4, other: 5 } as const;

export function detectPeople(work: WorkImage, models: PeopleModels | null): PeopleDetection {
  const { canvas, width: w, height: h } = work;
  if (models) {
    try {
      const res = models.segmenter.segment(canvas);
      const mask = res.categoryMask;
      if (!mask) throw new Error('No category mask returned');
      const arr = mask.getAsUint8Array();
      let categories: Uint8Array;
      if (mask.width === w && mask.height === h) categories = new Uint8Array(arr);
      else {
        categories = new Uint8Array(w * h);
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++)
            categories[y * w + x] = arr[Math.floor((y * mask.height) / h) * mask.width + Math.floor((x * mask.width) / w)];
      }
      mask.close();
      res.close();
      const faces: FaceBox[] = models.faceDetector
        .detect(canvas)
        .detections.flatMap((d) => (d.boundingBox ? [d.boundingBox] : []));
      return { categories, faces, skin: null };
    } catch (e) {
      console.warn('Person segmentation failed, using skin-tone detection:', e);
    }
  }
  return { categories: null, faces: [], skin: detectSkinTones(work) };
}

function detectSkinTones(work: WorkImage): Float32Array {
  const { data, width: w, height: h } = work;
  const skin = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const Y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    const sat = saturation(r, g, b), hue = hslHue(r, g, b);
    skin[i] =
      Y > 50 && Y < 235 && cb >= 80 && cb <= 125 && cr >= 138 && cr <= 170 &&
      sat >= 0.15 && sat <= 0.6 && (hue <= 45 || hue >= 350) && r > g && r > b ? 1 : 0;
  }
  return boxBlur(skin, w, h, 1).map((v) => (v > 0.5 ? 1 : 0));
}

export interface ProtectionOptions {
  hair: boolean;
  bodySkin: boolean;
}

export function buildProtection(work: WorkImage, people: PeopleDetection, opts: ProtectionOptions): Protection {
  const { width: w, height: h } = work, N = w * h;
  const m = new Float32Array(N);
  if (people.categories) {
    for (let i = 0; i < N; i++) {
      const c = people.categories[i];
      m[i] = c === CATEGORY.faceSkin || (c === CATEGORY.hair && opts.hair) || (c === CATEGORY.bodySkin && opts.bodySkin) ? 1 : 0;
    }
  } else if (people.skin) m.set(people.skin);

  // Face boxes grown by ~15% on every side, drawn as ellipses
  for (const f of people.faces) {
    const cx = f.originX + f.width / 2, cy = f.originY + f.height / 2, rx = f.width * 0.65, ry = f.height * 0.72;
    for (let y = Math.max(0, Math.floor(cy - ry)); y < Math.min(h, Math.ceil(cy + ry)); y++)
      for (let x = Math.max(0, Math.floor(cx - rx)); x < Math.min(w, Math.ceil(cx + rx)); x++)
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) m[y * w + x] = 1;
  }

  // Grow slightly, then feather so there is no visible seam
  const L = Math.max(w, h);
  const feathered = gaussianBlur(dilate(m, w, h, Math.max(1, Math.round(L * 0.003))), w, h, Math.max(2, Math.round(L * 0.005)));
  const protect = new Uint8Array(N);
  for (let i = 0; i < N; i++) protect[i] = Math.round(Math.min(1, feathered[i]) * 255);

  // Anything that is a person, clothes included, is kept out of the sky and greenery areas
  const personRaw = new Float32Array(N);
  for (let i = 0; i < N; i++)
    personRaw[i] = people.categories ? (people.categories[i] !== CATEGORY.background ? 1 : 0) : protect[i] > 100 ? 1 : 0;
  const person = dilate(personRaw, w, h, Math.max(1, Math.round(L * 0.004)));

  let message = '';
  if (people.categories) {
    const n = people.faces.length;
    message = n ? `Protecting ${n} face${n > 1 ? 's' : ''}.` : protect.some((v) => v > 200) ? 'Protecting people in this photo.' : 'No people found in this photo.';
  }
  return { protect, person, message };
}

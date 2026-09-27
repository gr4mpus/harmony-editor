/** Decoding photos, building the working copy, and the built-in sample picture. */
import { WORK_SIZE } from '../config';
import type { WorkImage } from '../types';
import { rgbToOklab } from './color';
import { seededRandom } from './masks';

export type PhotoSource = HTMLCanvasElement | ImageBitmap | HTMLImageElement;

const sizeOf = (s: PhotoSource) =>
  s instanceof HTMLImageElement ? { w: s.naturalWidth, h: s.naturalHeight } : { w: s.width, h: s.height };

export class UnsupportedFileError extends Error {}

/** Decodes a user file, respecting EXIF orientation where the browser supports it. */
export async function decodeFile(file: File): Promise<PhotoSource> {
  if (!/^image\//.test(file.type) && !/\.(heic|heif|jpe?g|png|webp|avif|gif|bmp)$/i.test(file.name))
    throw new UnsupportedFileError("That file isn't a photo. Open a JPG, PNG or WEBP file.");
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } catch {
      throw new UnsupportedFileError("This photo format isn't supported by your browser. Try saving it as JPG or PNG first.");
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }
}

export interface PreparedPhoto {
  /** Full-resolution source, capped to the GPU's maximum texture size. */
  full: PhotoSource;
  width: number;
  height: number;
  work: WorkImage;
}

export function preparePhoto(source: PhotoSource, maxTextureSize: number): PreparedPhoto {
  let { w, h } = sizeOf(source);
  let full: PhotoSource = source;
  const scale = Math.min(1, maxTextureSize / Math.max(w, h));
  if (scale < 1) {
    w = Math.round(w * scale);
    h = Math.round(h * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d')!.drawImage(source, 0, 0, w, h);
    full = c;
  }

  const ws = Math.min(1, WORK_SIZE / Math.max(w, h));
  const ww = Math.round(w * ws), wh = Math.round(h * ws);
  const canvas = document.createElement('canvas');
  canvas.width = ww; canvas.height = wh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(full, 0, 0, ww, wh);
  const data = ctx.getImageData(0, 0, ww, wh).data;
  const lab = new Float32Array(ww * wh * 3);
  for (let i = 0; i < ww * wh; i++) {
    const [L, a, b] = rgbToOklab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    lab[i * 3] = L; lab[i * 3 + 1] = a; lab[i * 3 + 2] = b;
  }
  return { full, width: w, height: h, work: { canvas, width: ww, height: wh, data, lab } };
}

/** A painted coastal sunset: blue sky, orange sun, sea, a grassy headland and a sailing boat. */
export function makeSamplePhoto(): HTMLCanvasElement {
  const w = 1600, h = 1067, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d')!, R = seededRandom(3);

  let g = x.createLinearGradient(0, 0, 0, h * 0.6);
  g.addColorStop(0, '#2a5aa0'); g.addColorStop(0.5, '#5a8fcb'); g.addColorStop(0.82, '#e8a066'); g.addColorStop(1, '#f5b76a');
  x.fillStyle = g; x.fillRect(0, 0, w, h * 0.6);
  g = x.createRadialGradient(w * 0.68, h * 0.55, 10, w * 0.68, h * 0.55, 380);
  g.addColorStop(0, 'rgba(255,175,80,.9)'); g.addColorStop(0.4, 'rgba(245,135,55,.4)'); g.addColorStop(1, 'rgba(245,135,55,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h * 0.6);
  for (let i = 0; i < 5; i++) {
    x.fillStyle = 'rgba(255,255,255,.18)';
    x.beginPath(); x.ellipse(200 + i * 300 + R() * 80, 120 + R() * 120, 160 + R() * 80, 22 + R() * 14, 0, 0, Math.PI * 2); x.fill();
  }
  x.fillStyle = '#ffa446'; x.beginPath(); x.arc(w * 0.68, h * 0.56, 70, 0, Math.PI * 2); x.fill();

  g = x.createLinearGradient(0, h * 0.6, 0, h);
  g.addColorStop(0, '#2a5c92'); g.addColorStop(1, '#0e2a52');
  x.fillStyle = g; x.fillRect(0, h * 0.6, w, h * 0.4);
  for (let i = 0; i < 110; i++) {
    const y = h * 0.62 + Math.pow(R(), 1.6) * h * 0.36, ww = (30 + R() * 140) * (1 - (y - h * 0.6) / (h * 0.5));
    const cx = w * 0.68 + (R() - 0.5) * 220 * (y / h);
    x.fillStyle = `rgba(255,${(140 + R() * 60) | 0},60,${0.3 + R() * 0.5})`;
    x.fillRect(cx - ww / 2, y, ww, 3 + R() * 3);
  }

  // Grassy headland with textured foliage
  x.save();
  x.beginPath(); x.moveTo(0, h * 0.5);
  x.quadraticCurveTo(w * 0.2, h * 0.5, w * 0.32, h * 0.72); x.quadraticCurveTo(w * 0.38, h * 0.9, w * 0.4, h);
  x.lineTo(0, h); x.closePath();
  g = x.createLinearGradient(0, h * 0.5, 0, h); g.addColorStop(0, '#5d8c32'); g.addColorStop(1, '#2c5220');
  x.fillStyle = g; x.fill(); x.clip();
  for (let i = 0; i < 5000; i++) {
    x.fillStyle = `hsl(${80 + R() * 45},${35 + R() * 30}%,${18 + R() * 26}%)`;
    x.beginPath(); x.ellipse(R() * w * 0.42, h * 0.48 + R() * h * 0.52, 2 + R() * 6, 1 + R() * 3, R() * 3, 0, Math.PI * 2); x.fill();
  }
  for (let i = 0; i < 9; i++) {
    const tx = 30 + i * 55 + R() * 20, ty = h * 0.52 + i * 8;
    for (let k = 0; k < 180; k++) {
      x.fillStyle = `hsl(${95 + R() * 35},${30 + R() * 25}%,${12 + R() * 18}%)`;
      x.beginPath(); x.arc(tx + (R() - 0.5) * 70, ty - 40 + (R() - 0.5) * 70, 3 + R() * 6, 0, Math.PI * 2); x.fill();
    }
  }
  x.restore();

  // Sailing boat
  const bx = w * 0.52;
  x.fillStyle = '#d8662a'; x.beginPath(); x.moveTo(bx - 90, h * 0.74); x.lineTo(bx + 90, h * 0.74); x.lineTo(bx + 70, h * 0.785); x.lineTo(bx - 70, h * 0.785); x.fill();
  x.fillStyle = '#f3efe6'; x.beginPath(); x.moveTo(bx, h * 0.735); x.lineTo(bx, h * 0.56); x.lineTo(bx + 75, h * 0.735); x.fill();
  x.fillStyle = '#c83c2b'; x.beginPath(); x.moveTo(bx - 6, h * 0.735); x.lineTo(bx - 6, h * 0.59); x.lineTo(bx - 60, h * 0.735); x.fill();

  // Fine grain so it behaves like a photo
  const id = x.getImageData(0, 0, w, h), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * 8; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(id, 0, 0);
  return c;
}

export type RGB = [number, number, number];

/** A downscaled copy of the photo used for analysis, masks and hit-testing. */
export interface WorkImage {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** RGBA bytes, row by row. */
  data: Uint8ClampedArray;
  /** OKLab values, three floats per pixel (L, a, b). */
  lab: Float32Array;
}

export interface ColourCluster {
  /** Hue-family name, e.g. "Blue" or "Yellow-green". */
  name: string;
  /** Index 0–11 on the 12-slot artist's wheel. */
  family: number;
  rgb: RGB;
  /** Share of the editable (non-protected) part of the photo, 0–1. */
  share: number;
  /** Hue angle in OKLab, radians. Used by the shader. */
  okHue: number;
  /** Position on the artist's wheel, degrees. Used for harmony. */
  wheel: number;
}

export type HarmonyType =
  | 'Complementary'
  | 'Split-complementary'
  | 'Analogous'
  | 'Monochromatic'
  | 'Triadic'
  | 'Mixed'
  | 'No colour';

export interface HarmonyResult {
  type: HarmonyType;
  /** 0–1 */
  confidence: number;
  /** The hue groups that make up the harmony, for drawing on the wheel. */
  groups: { angle: number; share: number }[];
}

/** A detected area such as the sky or greenery. */
export interface Region {
  /** Soft mask 0–1, one value per work-image pixel. */
  mask: Float32Array;
  /** Share of the photo, 0–1. */
  pct: number;
  rgb: RGB;
  /** Optional second colour (e.g. the lower half of a sunset sky). */
  rgb2?: RGB;
}

export interface FaceBox {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export interface PeopleDetection {
  /** Per-pixel class from the multiclass selfie model, or null when the AI model is unavailable. */
  categories: Uint8Array | null;
  faces: FaceBox[];
  /** Skin-tone fallback mask (0/1) used when the AI model is unavailable. */
  skin: Float32Array | null;
}

export interface Protection {
  /** 0–255 feathered mask of pixels that must stay original. */
  protect: Uint8Array;
  /** 0–1 mask of anything that is a person (including clothes); kept out of sky and greenery. */
  person: Float32Array;
  message: string;
}

export interface SelectedObject {
  id: number;
  /** Channel 0–3 in the objects texture. */
  slot: number;
  name: string;
  rgb: RGB;
  pct: number;
  /** True when the AI model selected it, false for the colour-based fallback. */
  ai: boolean;
}

export interface ToneAdjust {
  amount: number;
  tone: number;
}

/** Every slider value, -1…1. This is what undo/redo stores. */
export interface Adjustments {
  colours: number[];
  sky: ToneAdjust;
  greenery: ToneAdjust;
  objects: Record<number, number>;
}

export type Tool = 'colour' | 'object';
export type ModelStatus = 'loading' | 'ready' | 'fallback';

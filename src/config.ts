/**
 * App-wide settings. The AI runtime and models are fetched from public CDNs by default;
 * set VITE_MEDIAPIPE_WASM and VITE_MODEL_BASE (see .env.example) to self-host them.
 */
export const MEDIAPIPE_VERSION = '0.10.14';

export const MEDIAPIPE_WASM =
  import.meta.env.VITE_MEDIAPIPE_WASM ??
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;

const MODEL_BASE = import.meta.env.VITE_MODEL_BASE;
const GOOGLE = 'https://storage.googleapis.com/mediapipe-models';

export const MODELS = {
  /** Labels every pixel as background, hair, body skin, face skin, clothes or other. */
  selfieMulticlass: MODEL_BASE
    ? `${MODEL_BASE}/selfie_multiclass_256x256.tflite`
    : `${GOOGLE}/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite`,
  /** Finds faces; used as a safety net on top of the segmenter. */
  faceDetector: MODEL_BASE
    ? `${MODEL_BASE}/blaze_face_short_range.tflite`
    : `${GOOGLE}/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite`,
  /** "Magic Touch": returns the object under a clicked point. */
  magicTouch: MODEL_BASE
    ? `${MODEL_BASE}/magic_touch.tflite`
    : `${GOOGLE}/interactive_segmenter/magic_touch/float32/latest/magic_touch.tflite`,
};

/** Long side, in pixels, of the working copy used for analysis and masks. */
export const WORK_SIZE = 1024;
/** Most colour families shown as chips. */
export const MAX_CLUSTERS = 8;
/** Objects share one RGBA texture, one per channel. */
export const MAX_OBJECTS = 4;
/** How long to wait for a model before falling back to the non-AI method. */
export const MODEL_TIMEOUT_MS = 25_000;

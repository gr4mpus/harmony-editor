/**
 * Loads MediaPipe Tasks Vision models on demand. Every loader resolves to null
 * (never throws) when the runtime or a model can't be fetched, so the app can
 * fall back to its non-AI methods.
 */
import type { FaceDetector, ImageSegmenter, InteractiveSegmenter } from '@mediapipe/tasks-vision';
import { MEDIAPIPE_WASM, MODELS, MODEL_TIMEOUT_MS } from '../config';

type VisionLib = typeof import('@mediapipe/tasks-vision');
type Fileset = Awaited<ReturnType<VisionLib['FilesetResolver']['forVisionTasks']>>;
type Delegate = 'GPU' | 'CPU';

export interface PeopleModels {
  segmenter: ImageSegmenter;
  faceDetector: FaceDetector;
}

function withTimeout<T>(p: Promise<T>, ms = MODEL_TIMEOUT_MS): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timed out')), ms))]);
}

let vision: Promise<{ lib: VisionLib; fileset: Fileset }> | null = null;
function getVision() {
  vision ??= (async () => {
    const lib = await withTimeout(import('@mediapipe/tasks-vision'));
    const fileset = await withTimeout(lib.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM));
    return { lib, fileset };
  })();
  return vision;
}

/** Tries the GPU first and falls back to the CPU (some browsers have no WebGL2 in workers). */
async function withDelegate<T>(make: (d: Delegate) => Promise<T>): Promise<T> {
  try {
    return await withTimeout(make('GPU'));
  } catch {
    return await withTimeout(make('CPU'));
  }
}

let people: Promise<PeopleModels | null> | null = null;
export function loadPeopleModels(): Promise<PeopleModels | null> {
  people ??= (async () => {
    try {
      const { lib, fileset } = await getVision();
      return await withDelegate(async (delegate) => ({
        segmenter: await lib.ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODELS.selfieMulticlass, delegate },
          runningMode: 'IMAGE',
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        }),
        faceDetector: await lib.FaceDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODELS.faceDetector, delegate },
          runningMode: 'IMAGE',
          minDetectionConfidence: 0.4,
        }),
      }));
    } catch (e) {
      console.warn('AI person detection unavailable, using skin-tone detection:', e);
      return null;
    }
  })();
  return people;
}

let objects: Promise<InteractiveSegmenter | null> | null = null;
export function loadObjectModel(): Promise<InteractiveSegmenter | null> {
  objects ??= (async () => {
    try {
      const { lib, fileset } = await getVision();
      return await withDelegate((delegate) =>
        lib.InteractiveSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODELS.magicTouch, delegate },
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        }),
      );
    } catch (e) {
      console.warn('AI object selection unavailable, using colour-based selection:', e);
      return null;
    }
  })();
  return objects;
}

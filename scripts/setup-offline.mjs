// Copies MediaPipe's WASM runtime out of node_modules and downloads the three AI models
// into /public so the app can run without reaching jsDelivr or Google's model storage.
import { cp, mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const wasmDst = join(root, 'public', 'mediapipe', 'wasm');
const modelDir = join(root, 'public', 'models');

const MODELS = {
  'selfie_multiclass_256x256.tflite':
    'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
  'blaze_face_short_range.tflite':
    'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite',
  'magic_touch.tflite':
    'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/latest/magic_touch.tflite',
};

try {
  await access(wasmSrc);
} catch {
  console.error('Run `npm install` first: node_modules/@mediapipe/tasks-vision was not found.');
  process.exit(1);
}
await mkdir(wasmDst, { recursive: true });
await cp(wasmSrc, wasmDst, { recursive: true });
console.log('Copied MediaPipe WASM runtime to public/mediapipe/wasm');

await mkdir(modelDir, { recursive: true });
for (const [name, url] of Object.entries(MODELS)) {
  process.stdout.write(`Downloading ${name}… `);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`failed (${res.status})`);
    process.exit(1);
  }
  await writeFile(join(modelDir, name), Buffer.from(await res.arrayBuffer()));
  console.log('done');
}
console.log('\nAll set. Create a .env file with:\n  VITE_MEDIAPIPE_WASM=/mediapipe/wasm\n  VITE_MODEL_BASE=/models');

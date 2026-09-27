/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MEDIAPIPE_WASM?: string;
  readonly VITE_MODEL_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

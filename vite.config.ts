import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  // MediaPipe ships its own WASM loader; keep Vite from pre-bundling it.
  optimizeDeps: { exclude: ['@mediapipe/tasks-vision'] },
  build: { target: 'es2020', sourcemap: true },
});

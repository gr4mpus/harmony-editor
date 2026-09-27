/**
 * Draws the edited photo with WebGL so every slider move updates in real time,
 * and renders the full-resolution image for export.
 */
import { FRAGMENT_SHADER, VERTEX_SHADER } from './shaders';

export interface RenderParams {
  hues: number[];
  colourAmounts: number[];
  skyAmount: number;
  skyTone: number;
  greenAmount: number;
  greenTone: number;
  objectAmounts: [number, number, number, number];
  highlight: [number, number, number, number];
  showProtected: boolean;
  showAreas: boolean;
  /** 0–1 position of the before/after divider, or -1 when off. */
  split: number;
  showOriginal: boolean;
}

const UNIFORMS = ['uImg', 'uMask', 'uObj', 'uHue', 'uAmt', 'uN', 'uWidth', 'uShowMask', 'uShowAreas', 'uSplit', 'uOrig', 'uSA', 'uST', 'uGA', 'uGT', 'uOA', 'uHi'] as const;
type UniformName = (typeof UNIFORMS)[number];
type GL = WebGLRenderingContext | WebGL2RenderingContext;

export class HarmonyRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly maxTextureSize: number;
  private gl: GL;
  private isWebGL2: boolean;
  private u = {} as Record<UniformName, WebGLUniformLocation | null>;
  private texImage: WebGLTexture;
  private texMask: WebGLTexture;
  private texObjects: WebGLTexture;
  private params: RenderParams | null = null;
  private frame = 0;
  private hasImage = false;
  imageWidth = 0;
  imageHeight = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const opts: WebGLContextAttributes = { preserveDrawingBuffer: true, premultipliedAlpha: false };
    const gl2 = canvas.getContext('webgl2', opts);
    const gl = gl2 ?? canvas.getContext('webgl', opts);
    if (!gl) throw new Error('WebGL is not available in this browser.');
    this.gl = gl;
    this.isWebGL2 = !!gl2;
    this.maxTextureSize = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, 16384);

    const program = gl.createProgram()!;
    gl.attachShader(program, this.compile(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, this.compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Shader link failed');
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    for (const name of UNIFORMS) this.u[name] = gl.getUniformLocation(program, name);
    gl.uniform1i(this.u.uImg, 0);
    gl.uniform1i(this.u.uMask, 1);
    gl.uniform1i(this.u.uObj, 2);

    this.texImage = gl.createTexture()!;
    this.texMask = gl.createTexture()!;
    this.texObjects = gl.createTexture()!;
    this.clearMasks();
  }

  private compile(type: number, source: string): WebGLShader {
    const gl = this.gl, shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compile failed');
    return shader;
  }

  private setFiltering(mipmaps: boolean) {
    const gl = this.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private uploadRGBA(unit: number, tex: WebGLTexture, bytes: Uint8Array, w: number, h: number) {
    const gl = this.gl;
    gl.activeTexture(unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    this.setFiltering(false);
  }

  /** Uploads the full-resolution photo (already capped to maxTextureSize). */
  setImage(source: TexImageSource, width: number, height: number) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texImage);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    // Mipmaps give a clean, alias-free preview when a large photo is shown small
    if (this.isWebGL2) gl.generateMipmap(gl.TEXTURE_2D);
    this.setFiltering(this.isWebGL2);
    this.imageWidth = width;
    this.imageHeight = height;
    this.hasImage = true;
  }

  clearMasks() {
    this.uploadRGBA(this.gl.TEXTURE1, this.texMask, new Uint8Array(4), 1, 1);
    this.uploadRGBA(this.gl.TEXTURE2, this.texObjects, new Uint8Array(4), 1, 1);
  }

  /** Packs the protection, greenery and sky masks into one RGBA texture. */
  setMasks(w: number, h: number, protect: Uint8Array, greenery: Float32Array | null, sky: Float32Array | null) {
    const bytes = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      bytes[i * 4] = protect[i];
      bytes[i * 4 + 1] = greenery ? Math.round(greenery[i] * 255) : 0;
      bytes[i * 4 + 2] = sky ? Math.round(sky[i] * 255) : 0;
      bytes[i * 4 + 3] = 255;
    }
    this.uploadRGBA(this.gl.TEXTURE1, this.texMask, bytes, w, h);
  }

  /** Packs up to four object masks, one per channel. */
  setObjects(w: number, h: number, objects: { slot: number; mask: Float32Array }[]) {
    const bytes = new Uint8Array(w * h * 4);
    for (const o of objects) for (let i = 0; i < w * h; i++) bytes[i * 4 + o.slot] = Math.round(o.mask[i] * 255);
    this.uploadRGBA(this.gl.TEXTURE2, this.texObjects, bytes, w, h);
  }

  resize(width: number, height: number) {
    this.canvas.width = Math.max(1, width);
    this.canvas.height = Math.max(1, height);
    this.renderNow();
  }

  /** Schedules a redraw on the next animation frame (coalesces rapid slider moves). */
  draw(params: RenderParams) {
    this.params = params;
    if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.renderNow(); });
  }

  renderNow(params = this.params) {
    if (!params || !this.hasImage) return;
    const gl = this.gl, u = this.u;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const n = Math.min(params.hues.length, 8);
    const hues = new Float32Array(8), amounts = new Float32Array(8);
    for (let i = 0; i < n; i++) { hues[i] = params.hues[i]; amounts[i] = params.colourAmounts[i] ?? 0; }
    gl.uniform1fv(u.uHue, hues);
    gl.uniform1fv(u.uAmt, amounts);
    gl.uniform1i(u.uN, n);
    gl.uniform1f(u.uWidth, (25 * Math.PI) / 180);
    gl.uniform1f(u.uSA, params.skyAmount);
    gl.uniform1f(u.uST, params.skyTone);
    gl.uniform1f(u.uGA, params.greenAmount);
    gl.uniform1f(u.uGT, params.greenTone);
    gl.uniform4fv(u.uOA, params.objectAmounts);
    gl.uniform4fv(u.uHi, params.highlight);
    gl.uniform1f(u.uShowMask, params.showProtected ? 1 : 0);
    gl.uniform1f(u.uShowAreas, params.showAreas ? 1 : 0);
    gl.uniform1f(u.uSplit, params.split);
    gl.uniform1f(u.uOrig, params.showOriginal ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texImage);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.texMask);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.texObjects);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Renders at full resolution without overlays and returns the encoded image. */
  export(type: 'image/jpeg' | 'image/png', quality = 0.92): Promise<Blob> {
    const params = this.params;
    if (!params) return Promise.reject(new Error('Nothing to export yet.'));
    const clean: RenderParams = { ...params, showProtected: false, showAreas: false, split: -1, showOriginal: false, highlight: [0, 0, 0, 0] };
    const { width, height } = this.canvas;
    this.canvas.width = this.imageWidth;
    this.canvas.height = this.imageHeight;
    this.renderNow(clean);
    return new Promise<Blob>((resolve, reject) => {
      this.canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Export failed.'))), type, quality);
      this.canvas.width = width;
      this.canvas.height = height;
      this.renderNow(params);
    });
  }
}

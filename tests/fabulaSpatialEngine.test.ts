// tests/fabulaSpatialEngine.test.ts — Unit tests for the Fabula 3D Stereoscopic & Spatial Engine
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectSalientPromptPoints,
  inpaintBackgroundOcclusion,
  synthesizeStereoPair,
  stabilizeVideoDepthFrame,
  DEFAULT_SPATIAL_CONFIG,
  type LayeredDepthImage,
} from '../services/fabula/spatialEngine';

// Node-compatible mock Canvas and 2D context for unit testing
class MockImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }
}

class MockContext2D {
  constructor(private canvas: MockCanvas) {}

  createImageData(w: number, h: number) {
    return new MockImageData(w, h);
  }

  getImageData(x: number, y: number, w: number, h: number) {
    const img = new MockImageData(w, h);
    const buf = this.canvas.buffer;
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const srcX = x + col;
        const srcY = y + row;
        if (srcX >= 0 && srcX < this.canvas.width && srcY >= 0 && srcY < this.canvas.height) {
          const srcIdx = (srcY * this.canvas.width + srcX) * 4;
          const dstIdx = (row * w + col) * 4;
          img.data[dstIdx] = buf[srcIdx];
          img.data[dstIdx + 1] = buf[srcIdx + 1];
          img.data[dstIdx + 2] = buf[srcIdx + 2];
          img.data[dstIdx + 3] = buf[srcIdx + 3];
        }
      }
    }
    return img;
  }

  putImageData(img: MockImageData, x: number, y: number) {
    const buf = this.canvas.buffer;
    for (let row = 0; row < img.height; row++) {
      for (let col = 0; col < img.width; col++) {
        const dstX = x + col;
        const dstY = y + row;
        if (dstX >= 0 && dstX < this.canvas.width && dstY >= 0 && dstY < this.canvas.height) {
          const dstIdx = (dstY * this.canvas.width + dstX) * 4;
          const srcIdx = (row * img.width + col) * 4;
          buf[dstIdx] = img.data[srcIdx];
          buf[dstIdx + 1] = img.data[srcIdx + 1];
          buf[dstIdx + 2] = img.data[srcIdx + 2];
          buf[dstIdx + 3] = img.data[srcIdx + 3];
        }
      }
    }
  }

  drawImage(src: any, dx: number, dy: number, dw?: number, dh?: number) {
    if (src && src.buffer) {
      const srcW = src.width;
      const srcH = src.height;
      const dstW = dw || srcW;
      const dstH = dh || srcH;
      const buf = this.canvas.buffer;
      for (let y = 0; y < dstH; y++) {
        for (let x = 0; x < dstW; x++) {
          const sx = Math.min(srcW - 1, Math.floor((x / dstW) * srcW));
          const sy = Math.min(srcH - 1, Math.floor((y / dstH) * srcH));
          const sIdx = (sy * srcW + sx) * 4;
          const dIdx = ((dy + y) * this.canvas.width + (dx + x)) * 4;
          if (dIdx >= 0 && dIdx + 3 < buf.length && sIdx >= 0 && sIdx + 3 < src.buffer.length) {
            buf[dIdx] = src.buffer[sIdx];
            buf[dIdx + 1] = src.buffer[sIdx + 1];
            buf[dIdx + 2] = src.buffer[sIdx + 2];
            buf[dIdx + 3] = src.buffer[sIdx + 3];
          }
        }
      }
    }
  }

  clearRect() {}
}

class MockCanvas {
  private _width = 0;
  private _height = 0;
  buffer: Uint8ClampedArray = new Uint8ClampedArray(0);
  private ctx: MockContext2D;

  constructor(w = 64, h = 48) {
    this.ctx = new MockContext2D(this);
    this.width = w;
    this.height = h;
  }

  get width(): number { return this._width; }
  set width(v: number) {
    this._width = v;
    this.resizeBuffer();
  }

  get height(): number { return this._height; }
  set height(v: number) {
    this._height = v;
    this.resizeBuffer();
  }

  private resizeBuffer() {
    if (this._width > 0 && this._height > 0) {
      this.buffer = new Uint8ClampedArray(this._width * this._height * 4);
    }
  }

  getContext(type: string) {
    if (type === '2d') return this.ctx;
    return null;
  }
}

// Attach document.createElement mock if running in bare Node
if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = {
    createElement(tag: string) {
      if (tag === 'canvas') return new MockCanvas(64, 48);
      return {};
    },
  };
}

function createMockCanvas(width: number, height: number, fillColor = [0, 0, 0, 255]): HTMLCanvasElement {
  const canvas = new MockCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(width, height);
  for (let i = 0; i < width * height * 4; i += 4) {
    imgData.data[i] = fillColor[0];
    imgData.data[i + 1] = fillColor[1];
    imgData.data[i + 2] = fillColor[2];
    imgData.data[i + 3] = fillColor[3];
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas as unknown as HTMLCanvasElement;
}

test('DEFAULT_SPATIAL_CONFIG has valid ergonomic baseline and convergence', () => {
  assert.ok(DEFAULT_SPATIAL_CONFIG.baseline > 0, 'Baseline must be positive');
  assert.ok(DEFAULT_SPATIAL_CONFIG.convergence >= 0 && DEFAULT_SPATIAL_CONFIG.convergence <= 1, 'Convergence must be in 0..1');
  assert.ok(DEFAULT_SPATIAL_CONFIG.depthRelief > 0, 'Depth relief must be positive');
});

test('detectSalientPromptPoints finds high-depth subject point', () => {
  const w = 64;
  const h = 48;
  const depthCanvas = createMockCanvas(w, h, [30, 30, 30, 255]); // far background

  // Paint a closer foreground subject in center
  const ctx = depthCanvas.getContext('2d')!;
  const imgData = ctx.getImageData(0, 0, w, h);
  for (let y = 16; y < 32; y++) {
    for (let x = 24; x < 40; x++) {
      const idx = (y * w + x) * 4;
      imgData.data[idx] = 240; // close foreground
      imgData.data[idx + 1] = 240;
      imgData.data[idx + 2] = 240;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const points = detectSalientPromptPoints(depthCanvas, 2);
  assert.ok(points.length >= 1, 'Should find at least 1 salient point');
  assert.ok(points[0].x > 0.25 && points[0].x < 0.75, 'Detected point x should be central');
  assert.ok(points[0].y > 0.25 && points[0].y < 0.75, 'Detected point y should be central');
});

test('inpaintBackgroundOcclusion dilates and inpaints hole region', () => {
  const w = 32;
  const h = 32;
  const colorCanvas = createMockCanvas(w, h, [100, 150, 200, 255]);
  const matteCanvas = createMockCanvas(w, h, [0, 0, 0, 255]);

  // Mask center 8x8 pixels
  const mCtx = matteCanvas.getContext('2d')!;
  const mData = mCtx.getImageData(0, 0, w, h);
  for (let y = 12; y < 20; y++) {
    for (let x = 12; x < 20; x++) {
      mData.data[(y * w + x) * 4] = 255; // subject
    }
  }
  mCtx.putImageData(mData, 0, 0);

  const result = inpaintBackgroundOcclusion(colorCanvas, matteCanvas, 2);
  assert.ok(result.backgroundPlate, 'Background plate should be created');
  assert.equal(result.backgroundPlate.width, w);
  assert.equal(result.backgroundPlate.height, h);

  const bgData = result.backgroundPlate.getContext('2d')!.getImageData(16, 16, 1, 1).data;
  assert.equal(bgData[3], 255, 'Inpainted pixel alpha should be 255');
});

test('synthesizeStereoPair produces left, right, SBS and anaglyph outputs', () => {
  const w = 40;
  const h = 30;
  const sourceCanvas = createMockCanvas(w, h, [200, 50, 50, 255]);
  const depthCanvas = createMockCanvas(w, h, [128, 128, 128, 255]);
  const bgCanvas = createMockCanvas(w, h, [50, 50, 200, 255]);
  const matteCanvas = createMockCanvas(w, h, [0, 0, 0, 255]);

  const ldi: LayeredDepthImage = {
    sourceCanvas,
    depthCanvas,
    foregroundMatte: matteCanvas,
    backgroundPlate: bgCanvas,
    backgroundDepth: depthCanvas,
    salientPoints: [{ x: 0.5, y: 0.5 }],
    width: w,
    height: h,
    timestamp: Date.now(),
  };

  const stereo = synthesizeStereoPair(ldi, DEFAULT_SPATIAL_CONFIG);
  assert.equal(stereo.leftCanvas.width, w);
  assert.equal(stereo.leftCanvas.height, h);
  assert.equal(stereo.rightCanvas.width, w);
  assert.equal(stereo.rightCanvas.height, h);
  assert.equal(stereo.sbsCanvas.width, w * 2); // 2W
  assert.equal(stereo.sbsCanvas.height, h);
  assert.equal(stereo.anaglyphCanvas.width, w);
  assert.equal(stereo.anaglyphCanvas.height, h);
});

test('stabilizeVideoDepthFrame performs temporal smoothing', () => {
  const w = 20;
  const h = 20;
  const prevDepth = createMockCanvas(w, h, [100, 100, 100, 255]);
  const currDepth = createMockCanvas(w, h, [200, 200, 200, 255]);

  const stabilized = stabilizeVideoDepthFrame(prevDepth, currDepth, 0.5);
  const px = stabilized.getContext('2d')!.getImageData(10, 10, 1, 1).data;

  // Expected 0.5 * 200 + 0.5 * 100 = 150
  assert.equal(px[0], 150, 'Stabilized pixel value should be blended average');
});

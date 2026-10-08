import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_DISPLAY_EDGE,
  MAX_THUMB_EDGE,
  DISPLAY_QUALITY,
  isCompressibleImage,
} from '../services/socialImageOptimizer';

describe('socialImageOptimizer', () => {
  it('has standard display and thumb target constraints', () => {
    assert.equal(MAX_DISPLAY_EDGE, 1440);
    assert.equal(MAX_THUMB_EDGE, 320);
    assert.equal(DISPLAY_QUALITY, 0.82);
  });

  it('correctly classifies compressible vs non-compressible types', () => {
    const jpegBlob = new Blob([], { type: 'image/jpeg' });
    const pngBlob = new Blob([], { type: 'image/png' });
    const webpBlob = new Blob([], { type: 'image/webp' });
    const gifBlob = new Blob([], { type: 'image/gif' });
    const svgBlob = new Blob([], { type: 'image/svg+xml' });
    const videoBlob = new Blob([], { type: 'video/mp4' });

    assert.equal(isCompressibleImage(jpegBlob), true, 'JPEG should be compressible');
    assert.equal(isCompressibleImage(pngBlob), true, 'PNG should be compressible');
    assert.equal(isCompressibleImage(webpBlob), true, 'WebP should be compressible');
    assert.equal(isCompressibleImage(gifBlob), false, 'GIF should NOT be compressed to preserve animation');
    assert.equal(isCompressibleImage(svgBlob), false, 'SVG should NOT be compressed');
    assert.equal(isCompressibleImage(videoBlob), false, 'Video should NOT be compressed as an image');
  });
});

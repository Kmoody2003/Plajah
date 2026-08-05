// SegmentationLayer — generates a depth separation mask from the composite canvas
// so that DepthParallaxCanvas can apply different parallax to foreground vs background.
//
// Two modes (auto-selected):
//   1. MediaPipe SelfieSegmentation (CDN dynamic load)
//      — Accurate person/subject extraction.  Loads ~6MB model on first enable.
//      — Used when a human subject is detected in the frame.
//
//   2. Luminance-based fallback
//      — Works on any content (landscapes, art, abstract visuals).
//      — Bright high-saturation pixels → foreground; dark/desaturated → background.
//      — Runs entirely on CPU via OffscreenCanvas.

import React, { useRef, useEffect, useCallback } from 'react';

declare global {
    interface Window {
        SelfieSegmentation?: any;
    }
}

export interface SegmentationLayerProps {
    /** Source canvas to segment (must be same-origin) */
    sourceSelector: string;
    /** Called when a new foreground mask canvas is ready */
    onMask?: (fg: OffscreenCanvas | HTMLCanvasElement, bg: OffscreenCanvas | HTMLCanvasElement) => void;
    /** Try to load MediaPipe model; falls back to luminance if it fails */
    useMediaPipe?: boolean;
    /** How often to run segmentation in ms (default 80 = ~12fps, cheaper) */
    interval?: number;
    /** 0-1 luminance threshold — pixels brighter than this are foreground */
    luminanceThreshold?: number;
}

// ── MediaPipe loader ───────────────────────────────────────────────────────────
let mediaPipeLoadState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
let mediaPipeInstance: any = null;
const mediaPipeCallbacks: Array<(inst: any | null) => void> = [];

function loadMediaPipe(onReady: (inst: any | null) => void) {
    if (mediaPipeLoadState === 'ready') { onReady(mediaPipeInstance); return; }
    if (mediaPipeLoadState === 'failed') { onReady(null); return; }
    mediaPipeCallbacks.push(onReady);
    if (mediaPipeLoadState === 'loading') return;

    mediaPipeLoadState = 'loading';
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js';
    script.crossOrigin = 'anonymous';
    script.onload = () => {
        try {
            const seg = new window.SelfieSegmentation!({
                locateFile: (f: string) =>
                    `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`,
            });
            seg.setOptions({ modelSelection: 1, selfieMode: false });
            seg.initialize().then(() => {
                mediaPipeInstance = seg;
                mediaPipeLoadState = 'ready';
                mediaPipeCallbacks.forEach(cb => cb(seg));
                mediaPipeCallbacks.length = 0;
            }).catch(() => {
                mediaPipeLoadState = 'failed';
                mediaPipeCallbacks.forEach(cb => cb(null));
                mediaPipeCallbacks.length = 0;
            });
        } catch {
            mediaPipeLoadState = 'failed';
            mediaPipeCallbacks.forEach(cb => cb(null));
            mediaPipeCallbacks.length = 0;
        }
    };
    script.onerror = () => {
        mediaPipeLoadState = 'failed';
        mediaPipeCallbacks.forEach(cb => cb(null));
        mediaPipeCallbacks.length = 0;
    };
    document.head.appendChild(script);
}

// ── Luminance depth-map segmentation ─────────────────────────────────────────
function segmentByLuminance(
    src: HTMLCanvasElement,
    threshold: number,
): { fg: OffscreenCanvas; bg: OffscreenCanvas } {
    const W = src.width, H = src.height;
    const fg = new OffscreenCanvas(W, H);
    const bg = new OffscreenCanvas(W, H);
    const fgCtx = fg.getContext('2d')!;
    const bgCtx = bg.getContext('2d')!;

    // Draw the full source into both
    fgCtx.drawImage(src, 0, 0);
    bgCtx.drawImage(src, 0, 0);

    const fgData = fgCtx.getImageData(0, 0, W, H);
    const bgData = bgCtx.getImageData(0, 0, W, H);
    const d = fgData.data;
    const bd = bgData.data;

    for (let i = 0; i < d.length; i += 4) {
        // Perceived luminance (BT.601)
        const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
        // Saturation: max - min / max
        const rn = d[i] / 255, gn = d[i + 1] / 255, bn = d[i + 2] / 255;
        const cmax = Math.max(rn, gn, bn), cmin = Math.min(rn, gn, bn);
        const sat = cmax === 0 ? 0 : (cmax - cmin) / cmax;
        // Combined score: luminance + saturation weighting
        const score = lum * 0.65 + sat * 0.35;

        if (score >= threshold) {
            // Foreground — erase from bg
            bd[i + 3] = 0;
        } else {
            // Background — erase from fg
            d[i + 3] = 0;
        }
    }

    // Soften mask edges with a tiny blur approximation (box kernel 3x3 alpha only)
    const smooth = (imageData: ImageData, W: number, H: number) => {
        const src = new Uint8ClampedArray(imageData.data);
        for (let y = 1; y < H - 1; y++) {
            for (let x = 1; x < W - 1; x++) {
                let sum = 0;
                for (let dy = -1; dy <= 1; dy++)
                    for (let dx = -1; dx <= 1; dx++)
                        sum += src[((y + dy) * W + (x + dx)) * 4 + 3];
                imageData.data[(y * W + x) * 4 + 3] = Math.round(sum / 9);
            }
        }
    };

    smooth(fgData, W, H);
    smooth(bgData, W, H);
    fgCtx.putImageData(fgData, 0, 0);
    bgCtx.putImageData(bgData, 0, 0);

    return { fg, bg };
}

// ── Component ─────────────────────────────────────────────────────────────────
const SegmentationLayer: React.FC<SegmentationLayerProps> = ({
    sourceSelector,
    onMask,
    useMediaPipe = true,
    interval = 80,
    luminanceThreshold = 0.52,
}) => {
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const mpRef = useRef<any>(null);
    const mpReadyRef = useRef(false);

    const runSegmentation = useCallback(() => {
        const src = document.querySelector<HTMLCanvasElement>(sourceSelector);
        if (!src || !src.width || !src.height || !onMask) return;

        if (mpReadyRef.current && mpRef.current) {
            // MediaPipe path — send current frame to model
            const temp = document.createElement('canvas');
            temp.width = src.width;
            temp.height = src.height;
            temp.getContext('2d')!.drawImage(src, 0, 0);

            mpRef.current.onResults((results: any) => {
                if (!results.segmentationMask) return;
                const W = src.width, H = src.height;
                const fg = new OffscreenCanvas(W, H);
                const bg = new OffscreenCanvas(W, H);
                const fgCtx = fg.getContext('2d')!;
                const bgCtx = bg.getContext('2d')!;

                // Use mask: white = person (foreground)
                fgCtx.drawImage(results.segmentationMask, 0, 0, W, H);
                fgCtx.globalCompositeOperation = 'source-in';
                fgCtx.drawImage(src, 0, 0);

                bgCtx.drawImage(results.segmentationMask, 0, 0, W, H);
                bgCtx.globalCompositeOperation = 'source-out';
                bgCtx.drawImage(src, 0, 0);

                onMask(fg, bg);
            });

            mpRef.current.send({ image: temp });
        } else {
            // Luminance fallback
            try {
                const { fg, bg } = segmentByLuminance(src, luminanceThreshold);
                onMask(fg, bg);
            } catch {
                // Cross-origin or tainted canvas — silently skip
            }
        }
    }, [sourceSelector, onMask, luminanceThreshold]);

    // Load MediaPipe once if requested
    useEffect(() => {
        if (!useMediaPipe) return;
        loadMediaPipe((inst) => {
            mpRef.current = inst;
            mpReadyRef.current = inst !== null;
        });
    }, [useMediaPipe]);

    // Run segmentation on interval
    useEffect(() => {
        timerRef.current = setInterval(runSegmentation, interval);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [runSegmentation, interval]);

    // This component has no visual output — it only produces mask callbacks
    return null;
};

export default SegmentationLayer;

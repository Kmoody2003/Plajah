// DepthParallaxCanvas — 3D parallax compositor for the Plajah Pixels layer stack.
//
// Architecture:
//   The canvas stack (BackgroundLayer, AudioVisualizer, GlobalLighting, etc.) normally
//   renders every layer flush to the viewport. When 3D depth mode is active this component
//   reads each source canvas via drawImage() and re-composites them with per-layer
//   parallax offsets driven by:
//     • Mouse position (tilt toward cursor)
//     • Low-freq audio (depth oscillation on beat / bass)
//     • Automated slow camera drift (fly-through)
//
//   Depth planes (shallow → deep):
//     depth  2.0 →  foreground overlays  (GlobalLighting, captions)
//     depth  1.0 →  VIZ / AudioVisualizer
//     depth  0.0 →  no shift
//     depth -1.0 →  BackgroundLayer
//
//   Each layer shifts by:  offset = depth × parallaxStrength × cameraPos
//   Layers also scale slightly: scale = 1 + depth × 0.015 (closer = slightly bigger)

import React, { useRef, useEffect, useCallback } from 'react';

export interface DepthLayer {
    /** querySelector selector for the source canvas, e.g. "#px-bg" */
    selector: string;
    /** depth value: positive = foreground (moves more with camera), negative = background */
    depth: number;
    /** canvas2d globalCompositeOperation when re-drawing this layer */
    blendMode?: GlobalCompositeOperation;
    /** Opacity multiplier 0-1 */
    opacity?: number;
}

export interface DepthParallaxCanvasProps {
    layers: DepthLayer[];
    analyser: AnalyserNode | null;
    isPlaying: boolean;
    /** 0-1 parallax travel intensity */
    intensity?: number;
    /** Enable automated slow camera drift */
    flyThrough?: boolean;
    /** Speed multiplier for camera drift */
    flySpeed?: number;
}

const DepthParallaxCanvas: React.FC<DepthParallaxCanvasProps> = ({
    layers,
    analyser,
    isPlaying,
    intensity = 0.4,
    flyThrough = true,
    flySpeed = 1.0,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef<number | null>(null);
    const mouseRef = useRef({ x: 0, y: 0 });           // normalised -1..1
    const smoothMouseRef = useRef({ x: 0, y: 0 });     // smoothed version
    const lastBassRef = useRef(0);
    const lastBeatRef = useRef(0);
    const beatPulseRef = useRef(0);

    const onMouseMove = useCallback((e: MouseEvent) => {
        mouseRef.current = {
            x: (e.clientX / window.innerWidth - 0.5) * 2,
            y: (e.clientY / window.innerHeight - 0.5) * 2,
        };
    }, []);

    useEffect(() => {
        window.addEventListener('mousemove', onMouseMove, { passive: true });
        return () => window.removeEventListener('mousemove', onMouseMove);
    }, [onMouseMove]);

    useEffect(() => {
        const animate = () => {
            const canvas = canvasRef.current;
            if (!canvas) { rafRef.current = requestAnimationFrame(animate); return; }

            if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            }

            const ctx = canvas.getContext('2d');
            if (!ctx) { rafRef.current = requestAnimationFrame(animate); return; }

            // ── Audio analysis ────────────────────────────────────────────────
            let bass = 0;
            if (analyser && isPlaying) {
                const buf = new Uint8Array(analyser.frequencyBinCount);
                analyser.getByteFrequencyData(buf);
                let bSum = 0;
                for (let i = 0; i < 5; i++) bSum += buf[i];
                bass = (bSum / 5) / 255;

                const now = performance.now();
                if (bass > 0.55 && bass > lastBassRef.current * 1.2 && now - lastBeatRef.current > 250) {
                    lastBeatRef.current = now;
                    beatPulseRef.current = 1.0;
                }
                lastBassRef.current = bass;
            }
            if (beatPulseRef.current > 0) beatPulseRef.current = Math.max(0, beatPulseRef.current - 0.05);

            // ── Camera position ───────────────────────────────────────────────
            // Smooth mouse tracking (lag filter)
            const sm = smoothMouseRef.current;
            sm.x += (mouseRef.current.x - sm.x) * 0.06;
            sm.y += (mouseRef.current.y - sm.y) * 0.06;

            const t = performance.now() * 0.001 * flySpeed;
            // Slow orbital drift for fly-through feel
            const driftX = flyThrough ? Math.sin(t * 0.11) * 0.35 + Math.sin(t * 0.07) * 0.15 : 0;
            const driftY = flyThrough ? Math.sin(t * 0.09 + 1.2) * 0.2 + Math.cos(t * 0.13) * 0.1 : 0;
            // Zoom breathe
            const breathe = flyThrough ? 1 + Math.sin(t * 0.17) * 0.018 + bass * 0.025 : 1;
            // Beat pulse: momentary depth push
            const pulseMag = beatPulseRef.current * 0.03;

            const camX = sm.x * 0.6 + driftX;
            const camY = sm.y * 0.6 + driftY;

            const maxTravel = Math.min(canvas.width, canvas.height) * 0.08 * intensity;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // ── Composite depth layers ────────────────────────────────────────
            for (const layer of layers) {
                const srcCanvas = document.querySelector<HTMLCanvasElement>(layer.selector);
                if (!srcCanvas || !srcCanvas.width) continue;

                const depth = layer.depth;
                // Parallax offset: positive depth = foreground = moves more
                const ox = camX * depth * maxTravel;
                const oy = camY * depth * maxTravel;
                // Subtle scale: foreground slightly bigger (perspective convergence)
                const scale = breathe + depth * (0.014 + pulseMag);
                const cx = canvas.width / 2, cy = canvas.height / 2;

                ctx.save();
                ctx.globalCompositeOperation = (layer.blendMode ?? 'source-over') as GlobalCompositeOperation;
                ctx.globalAlpha = layer.opacity ?? 1;

                // Centre, scale, translate by parallax offset, then draw
                ctx.translate(cx + ox, cy + oy);
                ctx.scale(scale, scale);
                ctx.drawImage(srcCanvas, -cx, -cy);

                ctx.restore();
            }

            rafRef.current = requestAnimationFrame(animate);
        };

        rafRef.current = requestAnimationFrame(animate);
        return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
    }, [layers, analyser, isPlaying, intensity, flyThrough, flySpeed]);

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 pointer-events-none"
            style={{ zIndex: 55 }}
        />
    );
};

export default DepthParallaxCanvas;

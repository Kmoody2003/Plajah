
import React, { useRef, useEffect, useMemo } from 'react';
import { VisualizationConfig } from '../types';

interface GlobalLightingProps {
    config: VisualizationConfig;
    analyser: AnalyserNode | null;
    isPlaying: boolean;
    id?: string;
}

interface Fixture {
    mountFrac: number;   // 0-1 normalized horizontal mount position along top rig
    hue: number;         // resolved hex colour
    panPhase: number;    // LFO phase offset so fixtures sweep out of sync
    panFreq: number;     // LFO sweep frequency (rad/s equivalent)
    tiltOffset: number;  // slight downward tilt variation per fixture
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return r
        ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) }
        : { r: 255, g: 255, b: 255 };
}

function buildFixtures(count: number): Fixture[] {
    return Array.from({ length: count }, (_, i) => ({
        mountFrac: (i + 0.5) / count,
        hue: 0,                             // resolved per-frame from palette
        panPhase: (i / count) * Math.PI * 2,
        panFreq: 0.28 + i * 0.06,           // each fixture sweeps at slightly different rate
        tiltOffset: (i % 2 === 0 ? 1 : -1) * 0.05,
    }));
}

const GlobalLighting: React.FC<GlobalLightingProps> = ({ config, analyser, isPlaying, id }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef<number | null>(null);
    const lastFrameRef = useRef(0);
    const beatRef = useRef(false);
    const beatDecayRef = useRef(0);
    const lastBassRef = useRef(0);
    const lastBeatTimeRef = useRef(0);
    // Live config ref — the rAF loop reads this every frame so sliders update
    // instantly without restarting the loop (which would reset beat state).
    const configRef = useRef(config);
    useEffect(() => { configRef.current = config; }, [config]);

    const fixtures = useMemo(
        () => buildFixtures(Math.max(1, Math.min(6, config.beamCount ?? 3))),
        [config.beamCount],
    );

    const palette = useMemo(
        () => (config.beamColors?.length ? config.beamColors : config.colorPalette),
        [config.beamColors, config.colorPalette],
    );

    useEffect(() => {
        const animate = (time: number) => {
            const cfg = configRef.current;
            const fps = cfg.targetFrameRate || 60;
            const elapsed = time - lastFrameRef.current;
            if (elapsed < 1000 / fps) {
                rafRef.current = requestAnimationFrame(animate);
                return;
            }
            lastFrameRef.current = time - (elapsed % (1000 / fps));

            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // ── Audio analysis ────────────────────────────────────────────────
            let bass = 0, mid = 0, treble = 0;
            if (analyser && isPlaying) {
                const buf = new Uint8Array(analyser.frequencyBinCount);
                analyser.getByteFrequencyData(buf);
                let bSum = 0, mSum = 0, tSum = 0;
                for (let i = 0; i < 4; i++) bSum += buf[i];
                for (let i = 8; i < 24; i++) mSum += buf[i];
                for (let i = 40; i < 80; i++) tSum += buf[i];
                bass = (bSum / 4) / 255;
                mid = (mSum / 16) / 255;
                treble = (tSum / 40) / 255;

                // Beat detection: bass spike above previous + time gate
                const now = performance.now();
                const isBeat = bass > 0.55 && bass > lastBassRef.current * 1.2 && now - lastBeatTimeRef.current > 250;
                if (isBeat) {
                    lastBeatTimeRef.current = now;
                    beatRef.current = true;
                    beatDecayRef.current = 1.0;
                }
                lastBassRef.current = bass;
            }

            // Beat strobe decay
            if (beatDecayRef.current > 0) beatDecayRef.current = Math.max(0, beatDecayRef.current - 0.06);
            const strokeFlash = cfg.beamStrobeOnBeat ? beatDecayRef.current : 0;

            const t = performance.now() * 0.001 * (cfg.speed || 1);
            const intensity = cfg.lightingIntensity ?? 1;
            const W = canvas.width;
            const H = canvas.height;

            ctx.globalCompositeOperation = 'screen';

            // ── 1. Ambient moving lissajous wash ────────────────────────────
            {
                const lightColorHex = cfg.lightColor || palette[0] || '#ffffff';
                const rgb = hexToRgb(lightColorHex);
                const lx = W * 0.5 + Math.sin(t * 0.7) * W * 0.38;
                const ly = H * 0.5 + Math.sin(t * 1.3) * H * 0.28;
                const baseR = Math.max(W, H) * 0.5;
                const pulseR = baseR + bass * baseR * 0.4 * intensity;
                const op = (0.12 + bass * 0.22) * intensity;
                const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, pulseR);
                g.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${op})`);
                g.addColorStop(0.5, `rgba(${rgb.r},${rgb.g},${rgb.b},${op * 0.4})`);
                g.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, W, H);
            }

            // ── 2. Volumetric stage fixtures ─────────────────────────────────
            if (cfg.enableBeams) {
                fixtures.forEach((fix, fi) => {
                    const colorHex = palette[fi % palette.length] || '#ffffff';
                    const rgb = hexToRgb(colorHex);

                    // Mount point (slightly above canvas top for clean cone origin)
                    const mx = fix.mountFrac * W;
                    const my = -8;

                    // Pan sweep: slow LFO gives moving-head feel
                    const panSweep = Math.sin(t * fix.panFreq + fix.panPhase) * (Math.PI / 5.5);
                    // Base angle: pointing downward (PI/2) + tilt offset per fixture + sweep
                    const angle = Math.PI * 0.5 + fix.tiltOffset + panSweep;

                    // Beam length reaches well past canvas diagonal
                    const beamLen = Math.sqrt(W * W + H * H) * 1.15;

                    // Target point (may extend off canvas — that's fine)
                    const tx = mx + Math.cos(angle) * beamLen;
                    const ty = my + Math.sin(angle) * beamLen;

                    // Beam direction unit vector
                    const dx = tx - mx, dy = ty - my;
                    const dLen = Math.sqrt(dx * dx + dy * dy);
                    const udx = dx / dLen, udy = dy / dLen;
                    // Normal (perpendicular) unit vector
                    const nx = -udy, ny = udx;

                    // Spread expands with bass + beat
                    const spreadBase = beamLen * 0.055;
                    const spread = spreadBase + bass * spreadBase * 0.6 + strokeFlash * spreadBase * 0.4;

                    // Strobe: on beat flash to white then decay
                    const strobeBlend = strokeFlash;
                    const beamR = Math.round(rgb.r + (255 - rgb.r) * strobeBlend);
                    const beamG = Math.round(rgb.g + (255 - rgb.g) * strobeBlend);
                    const beamB = Math.round(rgb.b + (255 - rgb.b) * strobeBlend);

                    // Base beam opacity driven by mid + treble
                    const beamOp = Math.min(1, (0.18 + mid * 0.35 + treble * 0.1 + strokeFlash * 0.55) * intensity);

                    // ── 5 volumetric scatter passes (simulate atmospheric fog) ──
                    for (let pass = 0; pass < 5; pass++) {
                        const pSpread = spread * (1.0 + pass * 0.45);
                        const pOp = beamOp * (0.85 - pass * 0.14);
                        if (pOp <= 0) continue;

                        // Cone tip → two far-end corners
                        const ex1x = tx + nx * pSpread, ex1y = ty + ny * pSpread;
                        const ex2x = tx - nx * pSpread, ex2y = ty - ny * pSpread;

                        const grad = ctx.createLinearGradient(mx, my, tx, ty);
                        grad.addColorStop(0, `rgba(${beamR},${beamG},${beamB},${pOp})`);
                        grad.addColorStop(0.65, `rgba(${beamR},${beamG},${beamB},${pOp * 0.35})`);
                        grad.addColorStop(1, `rgba(${beamR},${beamG},${beamB},0)`);

                        ctx.beginPath();
                        ctx.moveTo(mx, my);
                        ctx.lineTo(ex1x, ex1y);
                        ctx.lineTo(ex2x, ex2y);
                        ctx.closePath();
                        ctx.fillStyle = grad;
                        ctx.fill();
                    }

                    // ── Core ray (tight bright centre line) ──────────────────
                    {
                        const coreSpread = spread * 0.08;
                        const coreLen = beamLen * 0.72;
                        const ctx_x = mx + udx * coreLen, ctx_y = my + udy * coreLen;
                        const c1x = ctx_x + nx * coreSpread, c1y = ctx_y + ny * coreSpread;
                        const c2x = ctx_x - nx * coreSpread, c2y = ctx_y - ny * coreSpread;

                        const coreGrad = ctx.createLinearGradient(mx, my, ctx_x, ctx_y);
                        const coreOp = Math.min(1, beamOp * 1.6 + strokeFlash * 0.6);
                        coreGrad.addColorStop(0, `rgba(255,255,255,${coreOp})`);
                        coreGrad.addColorStop(0.6, `rgba(${beamR},${beamG},${beamB},${coreOp * 0.6})`);
                        coreGrad.addColorStop(1, `rgba(${beamR},${beamG},${beamB},0)`);

                        ctx.beginPath();
                        ctx.moveTo(mx, my);
                        ctx.lineTo(c1x, c1y);
                        ctx.lineTo(c2x, c2y);
                        ctx.closePath();
                        ctx.fillStyle = coreGrad;
                        ctx.fill();
                    }

                    // ── Floor illumination pool ───────────────────────────────
                    {
                        // Find where beam axis crosses the stage floor (H * 0.93)
                        const floorY = H * 0.93;
                        if (ty > my) {                          // only if beam points downward
                            const tf = (floorY - my) / (ty - my);
                            const floorX = mx + udx * dLen * tf;
                            const poolW = spread * tf * 0.9;
                            const poolH = poolW * 0.22;         // squash to look like an ellipse on a flat stage

                            const poolGrad = ctx.createRadialGradient(floorX, floorY, 0, floorX, floorY, poolW);
                            const poolOp = beamOp * 0.65;
                            poolGrad.addColorStop(0, `rgba(${beamR},${beamG},${beamB},${poolOp})`);
                            poolGrad.addColorStop(0.5, `rgba(${beamR},${beamG},${beamB},${poolOp * 0.3})`);
                            poolGrad.addColorStop(1, `rgba(${beamR},${beamG},${beamB},0)`);

                            ctx.save();
                            ctx.translate(floorX, floorY);
                            ctx.scale(1, poolH / poolW);
                            ctx.beginPath();
                            ctx.arc(0, 0, poolW, 0, Math.PI * 2);
                            ctx.fillStyle = poolGrad;
                            ctx.fill();
                            ctx.restore();
                        }
                    }

                    // ── Fixture head glow (mount point) ──────────────────────
                    {
                        const headGrad = ctx.createRadialGradient(mx, my + 12, 0, mx, my + 12, 28);
                        const headOp = Math.min(1, beamOp * 1.2 + strokeFlash * 0.8);
                        headGrad.addColorStop(0, `rgba(255,255,255,${headOp})`);
                        headGrad.addColorStop(0.4, `rgba(${beamR},${beamG},${beamB},${headOp * 0.5})`);
                        headGrad.addColorStop(1, `rgba(${beamR},${beamG},${beamB},0)`);
                        ctx.beginPath();
                        ctx.arc(mx, my + 12, 28, 0, Math.PI * 2);
                        ctx.fillStyle = headGrad;
                        ctx.fill();
                    }
                });
            }

            ctx.globalCompositeOperation = 'source-over';
            rafRef.current = requestAnimationFrame(animate);
        };

        if (configRef.current.enableLighting) {
            rafRef.current = requestAnimationFrame(animate);
        }

        return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
    }, [
        // Only restart when structural things change (analyser, isPlaying, fixtures, palette).
        // All config fields are read live from configRef.current inside animate so slider
        // changes apply on the very next frame without resetting beat detection state.
        config.enableLighting, fixtures, palette, analyser, isPlaying,
    ]);

    if (!config.enableLighting) return null;

    return (
        <canvas
            id={id}
            ref={canvasRef}
            className="absolute inset-0 pointer-events-none z-[12]"
            style={{ mixBlendMode: 'screen' }}
        />
    );
};

export default GlobalLighting;

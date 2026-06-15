
import React, { useRef, useEffect } from 'react';
import { VisualizationConfig } from '../types';

interface TextOverlayProps {
    config: VisualizationConfig;
    analyser: AnalyserNode | null;
    isPlaying: boolean;
    id?: string;
}

interface TextShard {
    points: { x: number; y: number }[];
    offsetX: number;
    offsetY: number;
    angle: number;
}

interface CharState {
    x: number; y: number;
    vx: number; vy: number;
}

// ─── Google Font loader ────────────────────────────────────────────────────────
export const TEXT_FONTS: { name: string; label: string; gfUrl?: string }[] = [
    { name: 'Inter', label: 'Inter' },
    { name: 'Impact', label: 'Impact' },
    { name: 'Bebas Neue', label: 'Bebas', gfUrl: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap' },
    { name: 'Orbitron', label: 'Orbitron', gfUrl: 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap' },
    { name: 'Anton', label: 'Anton', gfUrl: 'https://fonts.googleapis.com/css2?family=Anton&display=swap' },
    { name: 'VT323', label: 'VT323', gfUrl: 'https://fonts.googleapis.com/css2?family=VT323&display=swap' },
    { name: 'Permanent Marker', label: 'Marker', gfUrl: 'https://fonts.googleapis.com/css2?family=Permanent+Marker&display=swap' },
    { name: 'Rajdhani', label: 'Rajdhani', gfUrl: 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@700&display=swap' },
    { name: 'Share Tech Mono', label: 'Mono', gfUrl: 'https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap' },
    { name: 'Audiowide', label: 'Audio', gfUrl: 'https://fonts.googleapis.com/css2?family=Audiowide&display=swap' },
    { name: 'Exo 2', label: 'Exo 2', gfUrl: 'https://fonts.googleapis.com/css2?family=Exo+2:wght@900&display=swap' },
    { name: 'Righteous', label: 'Righteous', gfUrl: 'https://fonts.googleapis.com/css2?family=Righteous&display=swap' },
];

export function ensureFontLoaded(family: string) {
    const font = TEXT_FONTS.find(f => f.name === family);
    if (!font?.gfUrl) return;
    const id = `gf-${family.replace(/\s+/g, '-').toLowerCase()}`;
    if (!document.getElementById(id)) {
        const link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href = font.gfUrl;
        document.head.appendChild(link);
    }
}

const TextOverlay: React.FC<TextOverlayProps> = ({ config, analyser, isPlaying }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef<number | null>(null);
    const lastFrameRef = useRef(0);
    const startTimeRef = useRef(performance.now());
    const shardsRef = useRef<TextShard[]>([]);
    const charStatesRef = useRef<CharState[]>([]);
    const elasticRef = useRef(1);
    const lastBassHitRef = useRef(0);

    // Load Google Font when textFont changes
    useEffect(() => {
        if (config.textFont) ensureFontLoaded(config.textFont);
    }, [config.textFont]);

    // Rebuild shards on text/shatter change
    useEffect(() => {
        if (!config.textShatter) return;
        const shards: TextShard[] = [];
        for (let i = 0; i < 20; i++) {
            const r1 = Math.random() * 200;
            const a1 = Math.random() * Math.PI * 2;
            const r2 = Math.random() * 200;
            const a2 = a1 + Math.random() * 1.5;
            shards.push({
                points: [
                    { x: 0, y: 0 },
                    { x: Math.cos(a1) * r1, y: Math.sin(a1) * r1 },
                    { x: Math.cos(a2) * r2, y: Math.sin(a2) * r2 },
                ],
                offsetX: Math.random() - 0.5,
                offsetY: Math.random() - 0.5,
                angle: (Math.random() - 0.5) * 0.5,
            });
        }
        shardsRef.current = shards;
    }, [config.textShatter, config.textContent]);

    // Reset char states when text changes
    useEffect(() => {
        const len = Array.from(config.textContent || '').length;
        charStatesRef.current = Array.from({ length: len }, () => ({ x: 0, y: 0, vx: 0, vy: 0 }));
        elasticRef.current = 1;
    }, [config.textContent]);

    // Main animation loop
    useEffect(() => {
        const animate = (time: number) => {
            const fpsInterval = 1000 / (config.targetFrameRate || 60);
            const elapsed = time - lastFrameRef.current;
            if (elapsed < fpsInterval) {
                rafRef.current = requestAnimationFrame(animate);
                return;
            }
            const dt = Math.min(elapsed, 50) / 1000;
            lastFrameRef.current = time - (elapsed % fpsInterval);

            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            const dw = rect.width * dpr, dh = rect.height * dpr;
            if (canvas.width !== dw || canvas.height !== dh) {
                canvas.width = dw; canvas.height = dh;
                ctx.scale(dpr, dpr);
            }
            ctx.clearRect(0, 0, rect.width, rect.height);

            // ── Audio analysis ─────────────────────────────────────────────
            let bassLevel = 0, vowelLevel = 0, consonantLevel = 0;
            let jitterX = 0, jitterY = 0, blur = 0, explosion = 0;

            if (analyser && isPlaying) {
                const bufLen = analyser.frequencyBinCount;
                const data = new Uint8Array(bufLen);
                analyser.getByteFrequencyData(data);

                // Bass 0–250 Hz
                let bassSum = 0;
                for (let i = 0; i < 10; i++) bassSum += data[i];
                bassLevel = (bassSum / 10) / 255;

                // Vowels ~300–3000 Hz
                const nyq = analyser.context.sampleRate / 2;
                const binHz = nyq / bufLen;
                const vs = Math.floor(300 / binHz), ve = Math.floor(3000 / binHz);
                let vSum = 0;
                for (let i = vs; i < ve && i < bufLen; i++) vSum += data[i];
                vowelLevel = vSum / (Math.max(1, ve - vs) * 255);

                // Consonants ~6000–12000 Hz
                const cs = Math.floor(6000 / binHz), ce = Math.floor(12000 / binHz);
                let cSum = 0;
                for (let i = cs; i < ce && i < bufLen; i++) cSum += data[i];
                consonantLevel = cSum / (Math.max(1, ce - cs) * 255);

                // Heavy kick jitter
                if (bassLevel * config.sensitivity > 0.7) {
                    const s = (bassLevel * config.sensitivity - 0.7) * 20;
                    jitterX = (Math.random() - 0.5) * s;
                    jitterY = (Math.random() - 0.5) * s;
                    blur = s * 0.5;
                }
                explosion = Math.pow(bassLevel, 3) * (config.textShatterIntensity || 1) * 150;
            }

            const pulse = bassLevel * config.sensitivity * 0.4;
            if (!config.textContent) { rafRef.current = requestAnimationFrame(animate); return; }

            const cx = rect.width / 2;
            const cy = rect.height / 2;
            const t = (time - startTimeRef.current) / 1000;

            // ── Reactor levels ────────────────────────────────────────────
            const ri = config.textReactorIntensity ?? 1;
            const vowelAct = (config.textVowelReactor && vowelLevel > 0.15) ? vowelLevel * ri : 0;
            const consAct = (config.textConsonantReactor && consonantLevel > 0.15) ? consonantLevel * ri : 0;

            // ── Physics update ─────────────────────────────────────────────
            const physics = config.textPhysics || 'none';
            const pi = (config.textPhysicsIntensity ?? 1);
            const chars = Array.from(config.textContent);

            while (charStatesRef.current.length < chars.length) {
                charStatesRef.current.push({ x: 0, y: 0, vx: 0, vy: 0 });
            }
            const states = charStatesRef.current;

            if (physics === 'bounce' || physics === 'scatter') {
                const isBassHit = bassLevel > 0.75 && (time - lastBassHitRef.current) > 220;
                if (isBassHit) {
                    lastBassHitRef.current = time;
                    for (let i = 0; i < chars.length; i++) {
                        if (physics === 'bounce') {
                            states[i].vy = -280 * pi;
                        } else {
                            const a = Math.random() * Math.PI * 2;
                            const spd = (70 + Math.random() * 100) * pi;
                            states[i].vx = Math.cos(a) * spd;
                            states[i].vy = Math.sin(a) * spd;
                        }
                    }
                }
                for (let i = 0; i < chars.length; i++) {
                    if (physics === 'bounce') {
                        states[i].vy += 550 * dt;
                        states[i].y += states[i].vy * dt;
                        if (states[i].y > 0) { states[i].y = 0; states[i].vy *= -0.5; }
                    } else {
                        const friction = Math.pow(0.9, 60 * dt);
                        states[i].vx *= friction; states[i].vy *= friction;
                        states[i].x += states[i].vx * dt;
                        states[i].y += states[i].vy * dt;
                        // spring back
                        states[i].x += -states[i].x * Math.min(1, dt * 3);
                        states[i].y += -states[i].y * Math.min(1, dt * 3);
                    }
                }
            } else if (physics === 'elastic') {
                const target = 1 + bassLevel * pi * 0.7;
                elasticRef.current += (target - elasticRef.current) * 0.25;
            } else if (physics === 'none') {
                for (let i = 0; i < chars.length; i++) { states[i].x = 0; states[i].y = 0; }
            }

            // ── Font setup ─────────────────────────────────────────────────
            const fontFamily = config.textFont || 'Inter';
            const fontSize = config.textSize || 120;
            const weight = (fontFamily === 'VT323' || fontFamily === 'Permanent Marker' || fontFamily === 'Audiowide' || fontFamily === 'Righteous') ? '400' : '900';
            ctx.font = `${weight} ${fontSize}px '${fontFamily}', sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';

            // ── Char widths + text width ───────────────────────────────────
            const charWidths = chars.map(ch => ctx.measureText(ch).width);
            const totalWidth = charWidths.reduce((s, w) => s + w, 0);
            const startX = cx - totalWidth / 2;

            // ── Gradient fill ─────────────────────────────────────────────
            let fillStyle: string | CanvasGradient = config.textColor || '#FFFFFF';
            if (config.textGradient && (config.textGradientColors?.length ?? 0) >= 2) {
                const colors = config.textGradientColors!;
                const deg = config.textGradientAngle ?? 0;
                const rad = (deg * Math.PI) / 180;
                const hw = totalWidth / 2, hh = fontSize / 2;
                const gx1 = cx - Math.cos(rad) * hw - Math.sin(rad) * hh;
                const gy1 = cy - Math.sin(rad) * hw + Math.cos(rad) * hh;
                const gx2 = cx + Math.cos(rad) * hw + Math.sin(rad) * hh;
                const gy2 = cy + Math.sin(rad) * hw - Math.cos(rad) * hh;
                const grad = ctx.createLinearGradient(gx1, gy1, gx2, gy2);
                colors.forEach((c, i) => grad.addColorStop(i / (colors.length - 1), c));
                fillStyle = grad;
            }

            // ── Vowel scale ────────────────────────────────────────────────
            let vowelScale = 1 + pulse;
            if (vowelAct && config.textVowelEffect === 'scale') vowelScale += vowelAct * 0.25;
            const elasticStretch = physics === 'elastic' ? elasticRef.current : 1;

            // ── Shatter mode (existing logic, updated fill) ────────────────
            if (config.textShatter && explosion > 1) {
                shardsRef.current.forEach(shard => {
                    ctx.save();
                    ctx.translate(cx + jitterX, cy + jitterY);
                    ctx.translate(shard.offsetX * explosion, shard.offsetY * explosion);
                    ctx.rotate(shard.angle * (explosion / 50));
                    ctx.beginPath();
                    ctx.moveTo(shard.points[0].x, shard.points[0].y);
                    ctx.lineTo(shard.points[1].x, shard.points[1].y);
                    ctx.lineTo(shard.points[2].x, shard.points[2].y);
                    ctx.closePath();
                    ctx.clip();
                    const sc = 1 + pulse;
                    ctx.scale(sc, sc);
                    ctx.font = `${weight} ${fontSize}px '${fontFamily}', sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    if (config.textOutline) {
                        ctx.strokeStyle = config.textColor;
                        ctx.lineWidth = 2 + pulse * 2;
                        ctx.strokeText(config.textContent, 0, 0);
                    } else {
                        ctx.fillStyle = fillStyle;
                        ctx.fillText(config.textContent, 0, 0);
                    }
                    ctx.restore();
                });
                rafRef.current = requestAnimationFrame(animate);
                return;
            }

            // ── Normal render ──────────────────────────────────────────────
            ctx.save();
            ctx.translate(jitterX, jitterY);

            // Glow
            if (config.glowIntensity > 0 || (vowelAct && config.textVowelEffect === 'glow')) {
                const glowExtra = (vowelAct && config.textVowelEffect === 'glow') ? vowelAct * 30 : 0;
                ctx.shadowBlur = config.glowIntensity + pulse * 20 + glowExtra;
                ctx.shadowColor = (vowelAct && config.textVowelEffect === 'color')
                    ? `hsl(${(t * 60) % 360}, 100%, 70%)`
                    : (Array.isArray(config.textGradientColors) ? config.textGradientColors[0] : config.textColor);
            }

            // Consonant blur
            if (consAct && config.textConsonantEffect === 'blur') {
                ctx.filter = `blur(${consAct * 4}px)`;
            } else if (blur > 0) {
                ctx.filter = `blur(${blur}px)`;
            }

            const needPerChar = (physics !== 'none' && physics !== 'float') || consAct > 0 || (vowelAct && config.textVowelEffect === 'color');

            if (!needPerChar) {
                // ── Fast path: single fillText ────────────────────────────
                ctx.save();
                ctx.translate(cx, cy);
                ctx.scale(vowelScale * elasticStretch, vowelScale);
                let yOff = 0;
                if (physics === 'float') yOff = Math.sin(t * 0.8) * 14 * pi;
                ctx.translate(-totalWidth / 2, yOff);
                ctx.font = `${weight} ${fontSize}px '${fontFamily}', sans-serif`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                if (config.textOutline) {
                    ctx.strokeStyle = typeof fillStyle === 'string' ? fillStyle : config.textColor;
                    ctx.lineWidth = 2 + pulse * 2;
                    ctx.strokeText(config.textContent, 0, 0);
                } else {
                    ctx.fillStyle = fillStyle;
                    ctx.fillText(config.textContent, 0, 0);
                }
                ctx.restore();

                // Chromatic aberration on heavy kick
                if (jitterX !== 0) {
                    ctx.save();
                    ctx.translate(cx - totalWidth / 2, cy);
                    ctx.globalCompositeOperation = 'screen';
                    ctx.globalAlpha = 0.45;
                    ctx.fillStyle = '#ff0000';
                    ctx.fillText(config.textContent, 5, 0);
                    ctx.fillStyle = '#0000ff';
                    ctx.fillText(config.textContent, -5, 0);
                    ctx.restore();
                }
            } else {
                // ── Per-character path ────────────────────────────────────
                ctx.font = `${weight} ${fontSize}px '${fontFamily}', sans-serif`;
                ctx.textBaseline = 'middle';
                ctx.textAlign = 'left';

                let curX = startX;
                for (let i = 0; i < chars.length; i++) {
                    const ch = chars[i];
                    const cw = charWidths[i];
                    const charCX = curX + cw / 2;

                    let wavY = 0;
                    if (physics === 'wave') wavY = Math.sin(t * 3 + i * 0.8) * 16 * pi;
                    if (physics === 'float') wavY = Math.sin(t * 0.8 + i * 0.25) * 14 * pi;

                    const px = states[i]?.x ?? 0;
                    const py = (states[i]?.y ?? 0) + wavY;

                    let shX = 0, shY = 0;
                    if (consAct) {
                        if (config.textConsonantEffect === 'shake') {
                            shX = (Math.random() - 0.5) * consAct * 14;
                            shY = (Math.random() - 0.5) * consAct * 14;
                        } else if (config.textConsonantEffect === 'scatter') {
                            const a = (i / chars.length) * Math.PI * 2 + t;
                            shX = Math.cos(a) * consAct * 22;
                            shY = Math.sin(a) * consAct * 22;
                        }
                    }

                    const fx = charCX + px + shX;
                    const fy = cy + py + shY;

                    ctx.save();
                    ctx.translate(fx, fy);
                    ctx.scale(vowelScale * elasticStretch, vowelScale);

                    // Glitch: shift every other char
                    if (consAct && config.textConsonantEffect === 'glitch') {
                        if (i % 2 === 0) ctx.translate(consAct * 7, 0);
                        ctx.globalCompositeOperation = i % 2 === 0 ? 'screen' : 'source-over';
                    }

                    // Vowel color cycle
                    if (vowelAct && config.textVowelEffect === 'color') {
                        ctx.fillStyle = `hsl(${((t * 60) + i * 30) % 360}, 100%, 65%)`;
                    } else {
                        ctx.fillStyle = fillStyle;
                    }

                    if (config.textOutline) {
                        ctx.strokeStyle = typeof fillStyle === 'string' ? fillStyle : config.textColor;
                        ctx.lineWidth = 2 + pulse * 2;
                        ctx.strokeText(ch, -cw / 2, 0);
                    } else {
                        ctx.fillText(ch, -cw / 2, 0);
                    }
                    ctx.restore();

                    curX += cw;
                }
            }

            ctx.restore();
            rafRef.current = requestAnimationFrame(animate);
        };

        rafRef.current = requestAnimationFrame(animate);
        return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
    }, [config, analyser, isPlaying]);

    if (!config.enableText) return null;

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 pointer-events-none z-[13] w-full h-full"
        />
    );
};

export default TextOverlay;

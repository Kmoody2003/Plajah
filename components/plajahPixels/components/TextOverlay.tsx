
import React, { useRef, useEffect } from 'react';
import { VisualizationConfig } from '../types';

interface TextOverlayProps {
    config: VisualizationConfig;
    analyser: AnalyserNode | null;
    isPlaying: boolean;
}

interface TextShard {
    points: {x: number, y: number}[];
    offsetX: number;
    offsetY: number;
    angle: number;
}

const TextOverlay: React.FC<TextOverlayProps> = ({ config, analyser, isPlaying }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number | null>(null);
    const lastFrameTimeRef = useRef(0);
    const shardsRef = useRef<TextShard[]>([]);

    useEffect(() => {
        // Generate random shards when config changes
        if (config.textShatter) {
            const count = 20;
            const newShards: TextShard[] = [];
            for (let i = 0; i < count; i++) {
                // Creates random triangles relative to center (approximate shattering)
                const r1 = Math.random() * 200;
                const a1 = Math.random() * Math.PI * 2;
                const r2 = Math.random() * 200;
                const a2 = a1 + (Math.random() * 1.5);
                
                newShards.push({
                    points: [
                        {x: 0, y: 0},
                        {x: Math.cos(a1) * r1, y: Math.sin(a1) * r1},
                        {x: Math.cos(a2) * r2, y: Math.sin(a2) * r2}
                    ],
                    offsetX: (Math.random() - 0.5), // Direction vector X
                    offsetY: (Math.random() - 0.5), // Direction vector Y
                    angle: (Math.random() - 0.5) * 0.5
                });
            }
            shardsRef.current = newShards;
        }
    }, [config.textShatter, config.textContent]);

    useEffect(() => {
        const animate = (time: number) => {
             // Throttling logic
             const fpsInterval = 1000 / (config.targetFrameRate || 60);
             const elapsed = time - lastFrameTimeRef.current;
             
             if (elapsed < fpsInterval) {
                 requestRef.current = requestAnimationFrame(animate);
                 return;
             }
             lastFrameTimeRef.current = time - (elapsed % fpsInterval);

            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Handle resize
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            const desiredWidth = rect.width * dpr;
            const desiredHeight = rect.height * dpr;
            
            if (canvas.width !== desiredWidth || canvas.height !== desiredHeight) {
                canvas.width = desiredWidth;
                canvas.height = desiredHeight;
                ctx.scale(dpr, dpr);
            }

            // Clear
            ctx.clearRect(0, 0, rect.width, rect.height);

            // Audio Analysis
            let pulse = 0;
            let jitterX = 0;
            let jitterY = 0;
            let blur = 0;
            let explosion = 0;

            if (analyser && isPlaying) {
                const bufferLength = analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                analyser.getByteFrequencyData(dataArray);

                // Analyze Bass for Pulse/Scale
                let bassSum = 0;
                for(let i=0; i<10; i++) bassSum += dataArray[i];
                const bassLevel = (bassSum / 10) / 255;
                
                pulse = bassLevel * config.sensitivity * 0.4; // Max 40% growth
                explosion = Math.pow(bassLevel, 3) * (config.textShatterIntensity || 1.0) * 150;

                // Heavy Kick for Jitter
                if (bassLevel * config.sensitivity > 0.7) {
                    const shakeAmt = (bassLevel * config.sensitivity - 0.7) * 20;
                    jitterX = (Math.random() - 0.5) * shakeAmt;
                    jitterY = (Math.random() - 0.5) * shakeAmt;
                    blur = shakeAmt * 0.5;
                }
            }

            if (!config.textContent) return;

            const cx = rect.width / 2;
            const cy = rect.height / 2;

            if (config.textShatter && explosion > 1) {
                // Render Shattered Text
                const shards = shardsRef.current;
                
                shards.forEach(shard => {
                    ctx.save();
                    ctx.translate(cx + jitterX, cy + jitterY);
                    
                    // Explosion offset
                    const ex = shard.offsetX * explosion;
                    const ey = shard.offsetY * explosion;
                    const ea = shard.angle * (explosion / 50);

                    ctx.translate(ex, ey);
                    ctx.rotate(ea);
                    
                    // Clip to shard shape
                    ctx.beginPath();
                    ctx.moveTo(shard.points[0].x, shard.points[0].y);
                    ctx.lineTo(shard.points[1].x, shard.points[1].y);
                    ctx.lineTo(shard.points[2].x, shard.points[2].y);
                    ctx.closePath();
                    ctx.clip();

                    // Draw text relative to center (so clipping shows piece of text)
                    // We need to inverse translate so text stays 'centered' but clipped area moves?
                    // No, for shattering, we want the piece of text to move WITH the shard.
                    // So we draw the text at 0,0 (center) relative to the shard.
                    
                    const scale = 1 + pulse;
                    ctx.scale(scale, scale);
                    ctx.font = `900 ${config.textSize}px Inter, sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    
                    if (config.textOutline) {
                        ctx.strokeStyle = config.textColor;
                        ctx.lineWidth = 2 + (pulse * 2);
                        ctx.strokeText(config.textContent, 0, 0);
                    } else {
                        ctx.fillStyle = config.textColor;
                        ctx.fillText(config.textContent, 0, 0);
                    }
                    
                    ctx.restore();
                });

            } else {
                // Normal Render
                ctx.save();
                ctx.translate(cx + jitterX, cy + jitterY);
                
                // Pulse Scale
                const scale = 1 + pulse;
                ctx.scale(scale, scale);

                // Font Settings
                ctx.font = `900 ${config.textSize}px Inter, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                // Glow Effect based on volume
                if (config.glowIntensity > 0) {
                    ctx.shadowBlur = config.glowIntensity + (pulse * 20);
                    ctx.shadowColor = config.textColor;
                }

                if (blur > 0) {
                    ctx.filter = `blur(${blur}px)`;
                }

                if (config.textOutline) {
                    ctx.strokeStyle = config.textColor;
                    ctx.lineWidth = 2 + (pulse * 2);
                    ctx.strokeText(config.textContent, 0, 0);
                } else {
                    ctx.fillStyle = config.textColor;
                    ctx.fillText(config.textContent, 0, 0);
                }
                
                // Add a subtle second layer for chromatic aberration on heavy beats
                if (jitterX !== 0) {
                    ctx.globalCompositeOperation = 'screen';
                    ctx.fillStyle = '#ff0000'; // Red shift
                    ctx.globalAlpha = 0.5;
                    ctx.fillText(config.textContent, 5, 0);
                    
                    ctx.fillStyle = '#0000ff'; // Blue shift
                    ctx.fillText(config.textContent, -5, 0);
                }

                ctx.restore();
            }

            requestRef.current = requestAnimationFrame(animate);
        };

        requestRef.current = requestAnimationFrame(animate);

        return () => {
            if (requestRef.current !== null) cancelAnimationFrame(requestRef.current);
        };
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
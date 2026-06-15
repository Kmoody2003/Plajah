
import React, { useRef, useEffect, useMemo } from 'react';
import { VisualizationConfig } from '../types';

interface GlobalLightingProps {
    config: VisualizationConfig;
    analyser: AnalyserNode | null;
    isPlaying: boolean;
}

const GlobalLighting: React.FC<GlobalLightingProps> = ({ config, analyser, isPlaying }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number | null>(null);
    const lastFrameTimeRef = useRef(0);

    // Helper to convert hex to rgba - computed only when config.lightColor changes
    const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 255, g: 255, b: 255 };
    };

    // Memoize the RGB value to avoid parsing hex in every frame
    const lightRgb = useMemo(() => {
        const lightColorHex = config.lightColor || config.colorPalette[0] || '#ffffff';
        return hexToRgb(lightColorHex);
    }, [config.lightColor, config.colorPalette]);

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
            if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            }

            // Clear
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Audio Analysis
            let kick = 0;
            let mid = 0;
            if (analyser && isPlaying) {
                const bufferLength = analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                analyser.getByteFrequencyData(dataArray);
                // Bass sum
                let sum = 0;
                for(let i=0; i<5; i++) sum += dataArray[i];
                kick = (sum / 5) / 255; // 0.0 to 1.0
                
                // Mid sum for beams
                let midSum = 0;
                for(let i=10; i<30; i++) midSum += dataArray[i];
                mid = (midSum / 20) / 255;
            }

            const frameTime = performance.now() * 0.001 * config.speed;
            const cx = canvas.width / 2;
            const cy = canvas.height / 2;
            const rgb = lightRgb; // Use memoized value

            // --- 1. Ambient / Moving Light (Lissajous) ---
            const radiusX = canvas.width * 0.4;
            const radiusY = canvas.height * 0.3;
            const lx = cx + Math.sin(frameTime) * radiusX;
            const ly = cy + Math.sin(frameTime * 2) * radiusY;

            // Light Size & Intensity reacting to Kick
            const baseSize = Math.max(canvas.width, canvas.height) * 0.5;
            const pulseSize = baseSize + (kick * baseSize * 0.5 * config.lightingIntensity);
            const opacity = 0.2 + (kick * 0.5 * config.lightingIntensity);

            const gradient = ctx.createRadialGradient(lx, ly, 0, lx, ly, pulseSize);
            gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`);
            gradient.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity * 0.5})`);
            gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);

            ctx.globalCompositeOperation = 'screen'; // Additive
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // --- 2. Moving Light Beams ---
            if (config.enableBeams) {
                const drawBeam = (originX: number, originY: number, angle: number, beamWidth: number, length: number) => {
                    ctx.save();
                    ctx.translate(originX, originY);
                    ctx.rotate(angle);
                    
                    // Create Beam Gradient (Fade out at end and sides)
                    // We simulate a volumetric cone
                    const grd = ctx.createLinearGradient(0, 0, 0, length);
                    const beamOpacity = (0.2 + mid * 0.5) * config.lightingIntensity;
                    
                    grd.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${beamOpacity * 0.8})`);
                    grd.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);

                    ctx.fillStyle = grd;
                    
                    ctx.beginPath();
                    ctx.moveTo(0, 0); // Origin
                    ctx.lineTo(-beamWidth / 2, length); // Bottom Left
                    // Curved bottom
                    ctx.bezierCurveTo(-beamWidth/4, length + beamWidth/4, beamWidth/4, length + beamWidth/4, beamWidth/2, length);
                    ctx.lineTo(0, 0); // Back to Origin
                    ctx.fill();

                    // Inner core (brighter, narrower)
                    const coreGrd = ctx.createLinearGradient(0, 0, 0, length * 0.8);
                    coreGrd.addColorStop(0, `rgba(255, 255, 255, ${beamOpacity * 0.9})`);
                    coreGrd.addColorStop(1, `rgba(255, 255, 255, 0)`);
                    ctx.fillStyle = coreGrd;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(-beamWidth / 6, length * 0.8);
                    ctx.lineTo(beamWidth / 6, length * 0.8);
                    ctx.fill();

                    ctx.restore();
                };

                // Beam Settings
                const beamLength = Math.max(canvas.width, canvas.height) * 1.5;
                const beamW = 150 + kick * 50; 
                
                // Beam 1: Top Left
                const angle1 = Math.PI * 0.2 + Math.sin(frameTime * 0.8) * 0.3; // Swing
                drawBeam(0, 0, angle1, beamW, beamLength);

                // Beam 2: Top Right
                const angle2 = Math.PI * -0.2 + Math.sin(frameTime * 0.8 + Math.PI) * 0.3; 
                drawBeam(canvas.width, 0, angle2, beamW, beamLength);

                // Beam 3: Moving Spot (follows lissajous ambient light X)
                // Looks like a stage scan light
                const angle3 = Math.PI * 0.5 + Math.sin(frameTime * 1.5) * 0.4;
                // Origin oscillates at top
                const topX = canvas.width/2 + Math.sin(frameTime * 0.5) * (canvas.width * 0.3);
                drawBeam(topX, -50, angle3 - Math.PI/2, beamW * 0.6, beamLength * 0.8);
            }

            ctx.globalCompositeOperation = 'source-over';
            requestRef.current = requestAnimationFrame(animate);
        };

        if (config.enableLighting) {
            requestRef.current = requestAnimationFrame(animate);
        }

        return () => {
            if (requestRef.current !== null) cancelAnimationFrame(requestRef.current);
        };
    }, [config.enableLighting, config.enableBeams, config.lightingIntensity, config.speed, lightRgb, analyser, isPlaying]);

    if (!config.enableLighting) return null;

    return (
        <canvas 
            ref={canvasRef}
            className="absolute inset-0 pointer-events-none z-[12]"
            style={{ mixBlendMode: 'overlay' }} 
        />
    );
};

export default GlobalLighting;
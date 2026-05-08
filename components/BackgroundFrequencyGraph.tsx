import React, { useRef, useEffect } from 'react';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';

const BackgroundFrequencyGraph: React.FC = () => {
  const { analyser, isPlaying, isFrequencyVisualizerEnabled } = useGlobalPlayerState();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef<'bars' | 'spectrum'>('spectrum');
  const morphProgressRef = useRef(1); // 0 (bars) to 1 (spectrum)

  useEffect(() => {
    const interval = setInterval(() => {
      modeRef.current = modeRef.current === 'bars' ? 'spectrum' : 'bars';
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!analyser || !isFrequencyVisualizerEnabled) {
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const bands = 16;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const barData = new Float32Array(bands);
    
    let animationId: number;

    const render = () => {
      const winW = window.innerWidth;
      const winH = window.innerHeight;

      if (canvas.width !== winW || canvas.height !== winH) {
        canvas.width = winW;
        canvas.height = winH;
      }

      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, winW, winH);

      // Morph logic using basic easing
      const targetMorph = modeRef.current === 'spectrum' ? 1 : 0;
      morphProgressRef.current += (targetMorph - morphProgressRef.current) * 0.05;
      const t = morphProgressRef.current; // 0 is bars, 1 is curve

      const minIndex = 1;
      const maxIndex = Math.min(bufferLength - 1, 600);
      
      for (let i = 0; i < bands; i++) {
        const startRatio = i / bands;
        const endRatio = (i + 1) / bands;
        const startBin = Math.floor(minIndex * Math.pow(maxIndex/minIndex, startRatio));
        const endBin = Math.floor(minIndex * Math.pow(maxIndex/minIndex, endRatio));
        const actualStart = startBin;
        const actualEnd = Math.max(actualStart + 1, endBin);
        
        let sum = 0;
        let maxInBin = 0;
        for (let j = actualStart; j < actualEnd; j++) {
          sum += dataArray[j];
          if (dataArray[j] > maxInBin) maxInBin = dataArray[j];
        }
        
        // Blend average and peak for a punchier reaction
        const value = (sum / (actualEnd - actualStart)) * 0.4 + maxInBin * 0.6;
        
        // High frequencies naturally have less energy, boost them
        const highFreqBoost = 1 + (i / bands) * 1.5;

        // amplify slightly to make it pop more
        const normalized = Math.min(1, (value / 255) * 1.4 * highFreqBoost);
        
        // Apply easing for "liquid" fluid movement
        barData[i] += (normalized - barData[i]) * 0.25; 
      }

      // Base gradient (Orange -> Pink -> Transparent)
      const gradient = ctx.createLinearGradient(0, winH, 0, winH * 0.7);
      gradient.addColorStop(0, 'rgba(255, 140, 0, 1)'); // small-orange
      gradient.addColorStop(0.5, 'rgba(212, 0, 85, 0.5)'); // pinkish
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      
      ctx.fillStyle = gradient;

      const padding = winW * 0.05;
      const availableWidth = winW - (padding * 2);
      const barWidthRaw = availableWidth / bands;
      
      // Control points for the curve
      const ptsX = [0];
      const ptsY = [winH];

      for (let i = 0; i < bands; i++) {
        // scale height down to see movement
        const h = barData[i] * (winH * 0.25) + (barData[i] > 0.01 ? winH * 0.02 : 0);
        const y = winH - h;
        
        // As t approaches 0, gap increases to create discrete bars
        // As t approaches 1, gap becomes 0 for a continuous spectrum
        const gap = barWidthRaw * 0.4 * (1 - t);
        const w = barWidthRaw - gap;
        const leftX = padding + i * barWidthRaw + gap / 2;
        const rightX = leftX + w;
        const centerX = leftX + w / 2;
        
        // For drawing actual distinct rectangles when t < 1
        if (t < 0.99) {
           ctx.fillRect(leftX, y, w, winH - y);
        }
        
        ptsX.push(centerX);
        ptsY.push(y);
      }
      
      ptsX.push(winW);
      ptsY.push(winH);

      // Only draw the fluid shape if we have some spectrum (t > 0)
      if (t > 0.01) {
          ctx.beginPath();
          ctx.moveTo(ptsX[0], ptsY[0]);
          for (let i = 1; i < ptsX.length - 2; i++) {
              const xc = (ptsX[i] + ptsX[i + 1]) / 2;
              const yc = (ptsY[i] + ptsY[i + 1]) / 2;
              // Mix the curve's y visually based on `t` so it lifts up from the bars
              const mixedYCenter = winH + (yc - winH) * t;
              const mixedX = ptsX[i];
              const mixedY = winH + (ptsY[i] - winH) * t;
              ctx.quadraticCurveTo(mixedX, mixedY, xc, mixedYCenter);
          }
          const lastX = ptsX[ptsX.length - 2];
          const lastY = winH + (ptsY[ptsY.length - 2] - winH) * t;
          const endX = ptsX[ptsX.length - 1];
          const endY = ptsY[ptsY.length - 1];
          
          ctx.quadraticCurveTo(lastX, lastY, endX, endY);
          ctx.lineTo(winW, winH);
          ctx.lineTo(0, winH);
          ctx.closePath();
          
          // Apply variable opacity based on the morph stage
          ctx.globalAlpha = t;
          ctx.fill();
          ctx.globalAlpha = 1.0;
      }

      animationId = requestAnimationFrame(render);
    };

    if (isPlaying) {
      render();
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    return () => cancelAnimationFrame(animationId);
  }, [analyser, isPlaying, isFrequencyVisualizerEnabled]);

  if (!isFrequencyVisualizerEnabled) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0" 
      style={{
         opacity: 0.6,
         filter: 'blur(6px)',
      }}
    />
  );
};

export default BackgroundFrequencyGraph;

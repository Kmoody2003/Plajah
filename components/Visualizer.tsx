
import React, { useEffect, useRef, useState } from 'react';
import { generateTrackLyrics } from '../services/geminiService';

interface VisualizerProps {
  analyser: AnalyserNode | null;
  themeColor: string;
  trackTitle: string;
  artist: string;
  isPlaying: boolean;
  scrollingText?: string;
  isVideoMode?: boolean;
  simplified?: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ analyser, themeColor, trackTitle, artist, isPlaying, scrollingText, isVideoMode, simplified }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const rotationRef = useRef(0);
  const lyricPosRef = useRef(0);

  useEffect(() => {
    if (!canvasRef.current || !analyser || isVideoMode) {
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      if (isVideoMode) return;
      
      if (simplified) {
        animationRef.current = requestAnimationFrame(() => {
          setTimeout(render, 33); // 30fps
        });
      } else {
        animationRef.current = requestAnimationFrame(render);
      }
      analyser.getByteFrequencyData(dataArray);

      const width = (canvas.width = canvas.clientWidth * devicePixelRatio);
      const height = (canvas.height = canvas.clientHeight * devicePixelRatio);
      const centerX = width / 2;
      const centerY = height / 2;
      const baseRadius = Math.min(width, height) / 4;

      ctx.clearRect(0, 0, width, height);

      let bass = 0;
      let mid = 0;
      
      let isFlat = true;
      for(let i = 0; i < dataArray.length; i++) {
        if (dataArray[i] > 0) { isFlat = false; break; }
      }

      if (isPlaying && isFlat) {
        const time = Date.now() / 1000;
        bass = (Math.sin(time * 2) * 0.5 + 0.5 + Math.random() * 0.2) * 0.8;
        mid = (Math.cos(time * 4) * 0.5 + 0.5 + Math.random() * 0.3) * 0.6;
      } else {
        for(let i=0; i<15; i++) bass += dataArray[i];
        for(let i=15; i<80; i++) mid += dataArray[i];
        bass = (bass / 15) / 255;
        mid = (mid / 65) / 255;
      }

      if (isPlaying) {
        rotationRef.current += 0.002 + (bass * 0.01);
        lyricPosRef.current += 1 + (bass * 2);
      }

      // 1. 16-Band Visualizer Bars (Removed as requested)
      
      // 2. Hypnotic Flow
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(rotationRef.current);
      
      const ribbonCount = 6;
      for (let i = 0; i < ribbonCount; i++) {
        const angle = (i / ribbonCount) * Math.PI * 2;
        ctx.save();
        ctx.rotate(angle);
        
        ctx.beginPath();
        ctx.moveTo(baseRadius * 0.5, 0);
        
        const cp1x = baseRadius * (1.5 + mid * 2);
        const cp1y = -baseRadius * (1 + bass * 2);
        const cp2x = baseRadius * (2 + bass * 3);
        const cp2y = baseRadius * (1 + mid * 2);
        
        const grad = ctx.createLinearGradient(0, 0, cp2x, cp2y);
        let colorToUse = '#ffffff';
        if (themeColor && typeof themeColor === 'string') {
          const c = themeColor.trim();
          if (c !== 'undefined' && c !== '#undefined' && c !== 'null' && c !== '#null' && c !== '') {
            colorToUse = c;
          }
        }
        
        try {
          grad.addColorStop(0, colorToUse);
        } catch (e) {
          grad.addColorStop(0, '#ffffff');
        }
        grad.addColorStop(1, 'transparent');

        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, baseRadius, baseRadius);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2 + bass * 15;
        ctx.globalAlpha = 0.4 + mid * 0.4;
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();

      // 2. Scrolling Text at bottom of visualizer
      if (scrollingText) {
        ctx.save();
        ctx.font = `bold ${Math.floor(18 * devicePixelRatio)}px 'Space Grotesk'`;
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.textAlign = 'left';
        
        const textToScroll = scrollingText.toUpperCase();
        const textWidth = ctx.measureText(textToScroll).width;
        
        if (lyricPosRef.current > textWidth + width) lyricPosRef.current = 0;
        
        ctx.fillText(textToScroll, width - lyricPosRef.current, height - (40 * devicePixelRatio));
        ctx.restore();
      }
    };

    render();
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [analyser, themeColor, isPlaying, scrollingText, isVideoMode, simplified]);

  return <canvas ref={canvasRef} className="w-full h-full pointer-events-none" />;
};

export default Visualizer;

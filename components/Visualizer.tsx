
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
  alwaysAnimate?: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ analyser, themeColor, trackTitle, artist, isPlaying, scrollingText, isVideoMode, simplified, alwaysAnimate }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const rotationRef = useRef(0);
  const lyricPosRef = useRef(0);
  const bassMaxRef = useRef(0.35);
  const midMaxRef = useRef(0.30);

  useEffect(() => {
    if (!canvasRef.current || isVideoMode || (!analyser && !alwaysAnimate)) {
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser?.frequencyBinCount ?? 1024;
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
      if (analyser) analyser.getByteFrequencyData(dataArray);

      const width = (canvas.width = canvas.clientWidth * devicePixelRatio);
      const height = (canvas.height = canvas.clientHeight * devicePixelRatio);
      const centerX = width / 2;
      const centerY = height / 2;
      const baseRadius = Math.min(width, height) / 4;

      ctx.clearRect(0, 0, width, height);

      let bass = 0;
      let mid = 0;

      let isFlat = !analyser;
      if (analyser) {
        for(let i = 0; i < Math.min(dataArray.length, 64); i++) {
          if (dataArray[i] > 2) { isFlat = false; break; }
        }
      }

      if (!analyser || (isFlat && (isPlaying || alwaysAnimate))) {
        const time = Date.now() / 1000;
        bass = (Math.sin(time * 2) * 0.5 + 0.5 + Math.random() * 0.2) * 0.8;
        mid = (Math.cos(time * 4) * 0.5 + 0.5 + Math.random() * 0.3) * 0.6;
      } else {
        let rawBass = 0;
        let rawMid = 0;
        for(let i=0; i<15; i++) rawBass += dataArray[i];
        for(let i=15; i<80; i++) rawMid += dataArray[i];
        rawBass = (rawBass / 15) / 255;
        rawMid = (rawMid / 65) / 255;

        // Adaptive Gain Control (AGC): dynamically adapts to track volume and mastering levels
        // so quiet acoustic tracks and loud electronic tracks both achieve full visual excursion.
        bassMaxRef.current = Math.max(bassMaxRef.current * 0.996, 0.22, rawBass);
        midMaxRef.current = Math.max(midMaxRef.current * 0.996, 0.18, rawMid);

        const normBass = Math.min(1.0, rawBass / Math.max(0.12, bassMaxRef.current));
        const normMid = Math.min(1.0, rawMid / Math.max(0.10, midMaxRef.current));

        // Power-curve mapping: kicks and transient drops snap punchily instead of linear numbness
        bass = Math.pow(normBass, 1.35) * 1.30;
        mid = Math.pow(normMid, 1.20) * 1.15;
      }

      if (isPlaying || alwaysAnimate) {
        rotationRef.current += 0.003 + (bass * 0.02);
        lyricPosRef.current += 1.2 + (bass * 2.5);
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
        const cp1y = -baseRadius * (1 + bass * 2.5);
        const cp2x = baseRadius * (2 + bass * 3.5);
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
        ctx.lineWidth = 2.5 + bass * 22;
        ctx.globalAlpha = 0.45 + mid * 0.45;
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
  }, [analyser, themeColor, isPlaying, scrollingText, isVideoMode, simplified, alwaysAnimate]);

  return <canvas ref={canvasRef} className="w-full h-full pointer-events-none" />;
};

export default Visualizer;

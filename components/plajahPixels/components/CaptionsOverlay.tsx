
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { VisualizationConfig } from '../types';

interface CaptionsOverlayProps {
    config: VisualizationConfig;
    analyser: AnalyserNode | null;
    isPlaying: boolean;
    audioRef: React.RefObject<HTMLAudioElement | null>; // Access to raw audio time
}

interface LRCParsedLine {
    time: number;
    text: string;
}

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y', 'A', 'E', 'I', 'O', 'U', 'Y']);

const CaptionsOverlay: React.FC<CaptionsOverlayProps> = ({ config, analyser, isPlaying, audioRef }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number | null>(null);
    const lastFrameTimeRef = useRef(0);
    const [lines, setLines] = useState<string[]>([]);
    
    // LRC State
    const lrcDataRef = useRef<LRCParsedLine[]>([]);

    // Automation State
    const lineIndexRef = useRef(0);
    const beatCountRef = useRef(0);
    const lastBeatTimeRef = useRef(0);
    const lastLineChangeTimeRef = useRef(0);

    // Parse LRC function
    const parseLRC = (text: string): LRCParsedLine[] => {
        const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;
        return text.split('\n').reduce<LRCParsedLine[]>((acc, line) => {
            const match = line.match(regex);
            if (match) {
                const minutes = parseInt(match[1]);
                const seconds = parseInt(match[2]);
                const ms = parseInt(match[3]);
                const content = match[4].trim();
                // Convert to seconds
                const time = minutes * 60 + seconds + (ms / (match[3].length === 3 ? 1000 : 100));
                if (content) acc.push({ time, text: content });
            }
            return acc;
        }, []);
    };

    // Update lines logic
    useEffect(() => {
        if (config.captionsText) {
            
            // Check for LRC format
            if (config.captionsSyncMode === 'lrc' && config.captionsText.includes('[')) {
                lrcDataRef.current = parseLRC(config.captionsText);
                // If parsing successful, we don't set 'lines' for cycling, we assume rendering will pull from LRC ref
            } else {
                lrcDataRef.current = []; // Clear LRC data
            }

            const newLines = config.captionsText.split('\n').filter(l => l.trim().length > 0 && !l.startsWith('['));
            
            // For standard/beat mode, we just need the raw text lines
            const prevLinesJSON = JSON.stringify(lines);
            const newLinesJSON = JSON.stringify(newLines);
            
            if (prevLinesJSON !== newLinesJSON) {
                setLines(newLines);
                
                if (config.enableLiveCaptions) {
                    const newIndex = Math.max(0, newLines.length - 1);
                    if (newIndex !== lineIndexRef.current) {
                        lineIndexRef.current = newIndex;
                        lastLineChangeTimeRef.current = performance.now();
                    }
                }
            }
        } else {
            setLines([]);
            lrcDataRef.current = [];
        }
    }, [config.captionsText, config.enableLiveCaptions, config.captionsSyncMode]);

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
            let bassLevel = 0;
            let midLevel = 0;
            let vocalLevel = 0; // Specific range for voice 300hz-3khz
            let beatDetected = false;

            if (analyser && isPlaying) {
                const bufferLength = analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                analyser.getByteFrequencyData(dataArray);

                // Bass (Vowels/Kick)
                let bassSum = 0;
                for(let i=0; i<5; i++) bassSum += dataArray[i];
                bassLevel = (bassSum / 5) / 255;
                
                // Mids (Consonants)
                let midSum = 0;
                for(let i=10; i<50; i++) midSum += dataArray[i];
                midLevel = (midSum / 40) / 255;

                // Vocal Range (~300Hz to 2.5kHz)
                // Assuming 48kHz SR, 2048 FFT -> ~23Hz per bin.
                // 300Hz ~ bin 13. 2500Hz ~ bin 110.
                let vocalSum = 0;
                let count = 0;
                for(let i=15; i<120; i++) {
                    vocalSum += dataArray[i];
                    count++;
                }
                vocalLevel = (vocalSum / count) / 255;

                // Beat Detection for Auto-Line Switching
                const now = performance.now();
                if (bassLevel * config.sensitivity > 0.6 && now - lastBeatTimeRef.current > 300) {
                    lastBeatTimeRef.current = now;
                    beatDetected = true;
                }
            }

            // --- SYNC LOGIC ---

            let currentLine = "";
            let triggerLineChange = false;

            if (config.enableLiveCaptions) {
                // LIVE MODE
                currentLine = lines[lineIndexRef.current] || "";
            } 
            else if (config.captionsSyncMode === 'lrc' && lrcDataRef.current.length > 0 && audioRef?.current) {
                // LRC SYNC MODE
                const currentTime = audioRef.current.currentTime;
                // Find the line closest to current time without going over
                let activeIdx = -1;
                for(let i = 0; i < lrcDataRef.current.length; i++) {
                    if (currentTime >= lrcDataRef.current[i].time) {
                        activeIdx = i;
                    } else {
                        break;
                    }
                }
                
                if (activeIdx !== -1) {
                    if (activeIdx !== lineIndexRef.current) {
                        lineIndexRef.current = activeIdx;
                        triggerLineChange = true;
                    }
                    currentLine = lrcDataRef.current[activeIdx].text;
                } else {
                    currentLine = ""; // Intro or silence
                }

            } else {
                // BEAT SYNC MODE (Fallback)
                if (beatDetected && lines.length > 0) {
                    beatCountRef.current++;
                    const beatsPerLine = (config.captionsSpeed || 4) * 4;
                    if (beatCountRef.current >= beatsPerLine) {
                        beatCountRef.current = 0;
                        lineIndexRef.current = (lineIndexRef.current + 1) % lines.length;
                        triggerLineChange = true;
                    }
                }
                currentLine = lines[lineIndexRef.current] || "";
            }

            if (triggerLineChange) {
                lastLineChangeTimeRef.current = performance.now();
            }

            // Expose lyric-drive metrics to a global window variable for other components
            if (typeof window !== 'undefined') {
                if (currentLine) {
                    let vowelsCount = 0;
                    let consonantsCount = 0;
                    const cleanLine = currentLine.toLowerCase();
                    for (let i = 0; i < cleanLine.length; i++) {
                        const char = cleanLine[i];
                        if (char >= 'a' && char <= 'z') {
                            if (VOWELS.has(char) || char === 'y') {
                                vowelsCount++;
                            } else {
                                consonantsCount++;
                            }
                        }
                    }
                    const totalLetters = vowelsCount + consonantsCount || 1;
                    (window as any).__sonicLyricsState = {
                        active: true,
                        currentLine,
                        vowelRatio: vowelsCount / totalLetters,
                        consonantRatio: consonantsCount / totalLetters,
                        vowelScore: (vowelsCount / totalLetters) * (vocalLevel || 0.5) * (config.lyricsDriveStrength || 1.0),
                        consonantScore: (consonantsCount / totalLetters) * (midLevel || 0.5) * (config.lyricsDriveStrength || 1.0),
                        lastUpdated: performance.now()
                    };
                } else {
                    (window as any).__sonicLyricsState = {
                        active: false,
                        currentLine: "",
                        vowelRatio: 0,
                        consonantRatio: 0,
                        vowelScore: 0,
                        consonantScore: 0,
                        lastUpdated: performance.now()
                    };
                }
            }

            // Rendering Lyrics
            if (!currentLine && !config.enableLiveCaptions) {
                 requestRef.current = requestAnimationFrame(animate);
                 return;
            }

            const cx = rect.width / 2;
            const cy = rect.height - (config.captionsSize * 1.5) - 40; // Bottom positioning

            ctx.font = `700 ${config.captionsSize}px 'Orbitron', sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // --- Entrance Animation ---
            let animY = 0;
            let animAlpha = 1.0;
            
            const animDuration = 600;
            const timeSinceChange = performance.now() - lastLineChangeTimeRef.current;
            
            if (timeSinceChange < animDuration) {
                const progress = timeSinceChange / animDuration;
                const ease = 1 - Math.pow(1 - progress, 3);
                animY = 50 * (1 - ease);
                animAlpha = ease;
            }

            const floatX = Math.sin(time * 0.001) * 20;
            const floatY = Math.cos(time * 0.002) * 5;

            ctx.globalAlpha = animAlpha;

            const totalWidth = ctx.measureText(currentLine).width;
            let currentX = cx - (totalWidth / 2) + floatX;

            // Per Character Rendering
            for (let i = 0; i < currentLine.length; i++) {
                const char = currentLine[i];
                const charWidth = ctx.measureText(char).width;
                const isVowel = VOWELS.has(char);
                
                ctx.save();
                ctx.translate(currentX + charWidth/2, cy + animY + floatY);

                // Reactivity
                // Use Vocal Level for primary scale to simulate "singing"
                let scale = 1.0;
                let yOffset = 0;
                const sens = config.captionsSensitivity || 1.0;

                // Sync the "Singing" effect to vocal frequencies specifically
                // This makes the text "open mouth" when the singer does
                const activeVocal = vocalLevel * sens;
                
                scale = 1.0 + (activeVocal * 0.4); 
                
                if (isVowel) {
                    yOffset = -activeVocal * 15;
                    scale += bassLevel * 0.2; // Extra punch on bass for vowels
                } 

                ctx.translate(0, yOffset);
                ctx.scale(scale, scale);

                // Color Shift
                const intensity = activeVocal; // Use vocal energy for brightness
                const shiftStrength = config.captionsColorShiftIntensity || 0;
                
                if (intensity * shiftStrength > 0.1) {
                    const hue = isVowel ? 320 : 160; 
                    const sat = Math.min(100, intensity * shiftStrength * 120);
                    const light = 100 - (intensity * shiftStrength * 30);
                    ctx.fillStyle = `hsl(${hue}, ${sat}%, ${light}%)`;
                    
                    // Glow
                    ctx.shadowColor = `hsl(${hue}, ${sat}%, 50%)`;
                    ctx.shadowBlur = intensity * 30;
                } else {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.shadowBlur = 0;
                }
                
                ctx.lineWidth = 3;
                ctx.strokeStyle = 'rgba(0,0,0,0.8)';
                ctx.strokeText(char, 0, 0);

                ctx.fillText(char, 0, 0);
                ctx.restore();

                currentX += charWidth;
            }
            
            ctx.globalAlpha = 1.0;
            requestRef.current = requestAnimationFrame(animate);
        };

        requestRef.current = requestAnimationFrame(animate);

        return () => {
            if (requestRef.current !== null) cancelAnimationFrame(requestRef.current);
        };
    }, [config, analyser, isPlaying, lines, audioRef]); // Added audioRef dependency

    if (!config.enableCaptions) return null;

    return (
        <canvas 
            ref={canvasRef}
            className="absolute inset-0 pointer-events-none z-[16] w-full h-full"
        />
    );
};

export default CaptionsOverlay;


import React, { useRef, useEffect, useState, useMemo } from 'react';
import { VisualizationConfig, BackgroundMedia } from '../types';

interface BackgroundLayerProps {
    mediaList1: BackgroundMedia[];
    mediaList2: BackgroundMedia[];
    config: VisualizationConfig;
    analyser: AnalyserNode | null;
    isPlaying: boolean;
    id?: string;
    /** Live driver-bus opacity multipliers (Step 5b): 1 = unmodulated. */
    media1Opacity?: number;
    media2Opacity?: number;
}

const BackgroundLayer: React.FC<BackgroundLayerProps> = ({ mediaList1, mediaList2, config, analyser, isPlaying, media1Opacity = 1, media2Opacity = 1 }) => {
    // Refs for the persistent source elements (off-screen)
    const source1Ref = useRef<HTMLVideoElement | HTMLImageElement>(null);
    const source2Ref = useRef<HTMLVideoElement | HTMLImageElement>(null);

    // Live opacity multipliers from the driver bus, read inside the rAF render loop
    // (refs so a 60fps modulation stream never restarts the animation).
    const media1OpacityRef = useRef(1);
    const media2OpacityRef = useRef(1);
    media1OpacityRef.current = media1Opacity;
    media2OpacityRef.current = media2Opacity;
    
    // Ref for the output canvas
    const canvasRef = useRef<HTMLCanvasElement>(null);
    
    // Animation loop state
    const requestRef = useRef<number | null>(null);
    const lastFrameTimeRef = useRef(0);
    const mouseRef = useRef<{x: number, y: number}>({ x: 0, y: 0 });

    // Automation State
    const [automatedValues, setAutomatedValues] = useState({
        count: config.sliceCount,
        rotation: config.sliceRotation
    });
    
    const [activeMediaIndex1, setActiveMediaIndex1] = useState(0);
    const [activeMediaIndex2, setActiveMediaIndex2] = useState(0);

    const beatCounterRef = useRef(0);
    const lastBeatTimeRef = useRef(0);
    const rotationBeatCounterRef = useRef(0);
    const sliceRotBeatCounterRef = useRef(0);
    const sliceRotNextTriggerRef = useRef(2); // for 'random' mode: beats until next snap
    const oscillatorPhaseRef = useRef(0);
    const energyAccumulatorRef = useRef(0);

    // --- Media Switching Logic ---
    const activeMedia1 = mediaList1[activeMediaIndex1] || mediaList1[0];
    const activeMedia2 = config.enableLayer2 ? (mediaList2[activeMediaIndex2] || mediaList2[0]) : null;

    useEffect(() => {
        // Ensure indices are valid
        if (activeMediaIndex1 >= mediaList1.length) setActiveMediaIndex1(0);
        if (activeMediaIndex2 >= mediaList2.length) setActiveMediaIndex2(0);
    }, [mediaList1.length, mediaList2.length]);

    // --- Automatic Background Cycling Interval ---
    useEffect(() => {
        if (!config.enableBackgroundRotation) return;
        if (config.enableRotationOnBeat || config.rotationMusicGovern) return;
        
        const intervalTime = (config.backgroundRotationInterval || 4) * 1000;
        const timer = setInterval(() => {
            setActiveMediaIndex1(p => mediaList1.length > 0 ? (p + 1) % mediaList1.length : 0);
            setActiveMediaIndex2(p => mediaList2.length > 0 ? (p + 1) % mediaList2.length : 0);
        }, intervalTime);
        return () => clearInterval(timer);
    }, [config.enableBackgroundRotation, config.backgroundRotationInterval, config.enableRotationOnBeat, config.rotationMusicGovern, mediaList1.length, mediaList2.length]);

    // --- Mouse Parallax ---
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!config.enableParallax) return;
            // Normalize -1 to 1
            const x = (e.clientX / window.innerWidth) * 2 - 1;
            const y = (e.clientY / window.innerHeight) * 2 - 1;
            mouseRef.current = { x, y };
        };
        if (config.enableParallax) {
            window.addEventListener('mousemove', handleMouseMove);
        }
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [config.enableParallax]);

    // --- Render Loop ---
    useEffect(() => {
        const render = (time: number) => {
            // FPS Throttling
            const targetFPS = config.targetFrameRate || 60;
            const fpsInterval = 1000 / targetFPS;
            const elapsed = time - lastFrameTimeRef.current;

            if (elapsed < fpsInterval) {
                requestRef.current = requestAnimationFrame(render);
                return;
            }
            lastFrameTimeRef.current = time - (elapsed % fpsInterval);

            // 1. Audio Analysis & Automation
            let dataArray: Uint8Array | null = null;
            let pulseFactor = 0;
            let beatDetected = false;

            let overallLvl = 0;
            let bassLvl = 0;
            let midsLvl = 0;
            let trebleLvl = 0;

            if (analyser) { // Analysis runs even if music paused (visuals might react to mic or last frame)
                const bufferLength = analyser.frequencyBinCount;
                dataArray = new Uint8Array(bufferLength);
                analyser.getByteFrequencyData(dataArray);

                let totalSum = 0;
                let bassSum = 0;
                let midsSum = 0;
                let trebleSum = 0;
                const len = dataArray.length;
                for (let i = 0; i < len; i++) {
                    const val = dataArray[i];
                    totalSum += val;
                    if (i < 15) bassSum += val;
                    else if (i >= 15 && i < 110) midsSum += val;
                    else trebleSum += val;
                }
                overallLvl = totalSum / len / 255;
                bassLvl = bassSum / 15 / 255;
                midsLvl = midsSum / 95 / 255;
                trebleLvl = trebleSum / (len - 110) / 255;

                const bassAvg = bassSum / 15;
                const now = performance.now();
                
                // Beat Detection
                const threshold = 180;
                const adjustedLevel = bassAvg * config.sensitivity;
                if (adjustedLevel > threshold && now - lastBeatTimeRef.current > 250) {
                    lastBeatTimeRef.current = now;
                    beatDetected = true;
                }

                // Pulse Calculation
                if (config.backgroundPulseIntensity > 0) {
                     pulseFactor = bassLvl * (config.backgroundPulseIntensity * 0.15);
                }
            }

            // Calculate delta-time in seconds
            const dt = elapsed / 1000;

            // Resolve music level based on config for L2 blend drive
            let selectedMusicLvl = 0;
            const driveRange = config.l2MusicDriveRange || 'bass';
            if (driveRange === 'bass') selectedMusicLvl = bassLvl;
            else if (driveRange === 'mids') selectedMusicLvl = midsLvl;
            else if (driveRange === 'treble') selectedMusicLvl = trebleLvl;
            else selectedMusicLvl = overallLvl;

            // Oscillator logic
            const oscFreq = config.l2OscillatorFreq !== undefined ? config.l2OscillatorFreq : 1.0;
            const musicMod = config.l2OscillatorMusicMod !== undefined ? config.l2OscillatorMusicMod : 0.0;
            const currentFreq = oscFreq * (1.0 + selectedMusicLvl * musicMod);
            oscillatorPhaseRef.current = (oscillatorPhaseRef.current + currentFreq * dt) % 1.0;

            let oscVal = 0;
            const oscType = config.l2OscillatorType || 'sine';
            const phase = oscillatorPhaseRef.current;
            if (oscType === 'sine') {
                oscVal = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
            } else if (oscType === 'square') {
                oscVal = phase < 0.5 ? 1.0 : 0.0;
            } else if (oscType === 'triangle') {
                oscVal = phase < 0.5 ? (phase * 2.0) : (2.0 - phase * 2.0);
            } else if (oscType === 'sawtooth') {
                oscVal = phase;
            }

            // Combine with direct music drive if enabled
            let layer1Opacity = 1.0;
            let layer2Opacity = config.layer2Opacity;

            if (config.enableL2BlendDrive) {
                const musicDirectStrength = config.l2MusicDriveStrength !== undefined ? config.l2MusicDriveStrength : 0.5;
                const blendFactor = Math.min(1.0, Math.max(0.0, oscVal + selectedMusicLvl * musicDirectStrength));
                
                if (config.l2MusicDriveMode === 'crossover') {
                    layer1Opacity = 1.0 - blendFactor;
                    layer2Opacity = blendFactor;
                } else {
                    layer1Opacity = 1.0;
                    layer2Opacity = blendFactor;
                }
            }

            // Compositing Music Drive (dynamic blending modes)
            let activeBlendMode = config.layer2BlendMode;
            if (config.l2CompMusicDrive) {
                const compRange = config.l2CompMusicRange || 'bass';
                let compLvl = 0;
                if (compRange === 'bass') compLvl = bassLvl;
                else if (compRange === 'mids') compLvl = midsLvl;
                else if (compRange === 'treble') compLvl = trebleLvl;
                else compLvl = overallLvl;

                const compThreshold = config.l2CompDriveThreshold !== undefined ? config.l2CompDriveThreshold : 0.5;
                if (compLvl > compThreshold) {
                    const highEnergyModes: string[] = ['difference', 'color-dodge', 'exclusion', 'hard-light', 'screen'];
                    const modeIndex = Math.floor(compLvl * 10) % highEnergyModes.length;
                    activeBlendMode = highEnergyModes[modeIndex] as any;
                }
            }

            // Handle Automation Triggers
            if (isPlaying) {
                if (beatDetected) {
                    // Count automation (slice count randomizes on bar interval)
                    if (config.enableSliceAutomation) {
                        beatCounterRef.current++;
                        const beatsPerTrigger = (config.sliceAutomationInterval || 1) * 4;
                        if (beatCounterRef.current >= beatsPerTrigger) {
                            beatCounterRef.current = 0;
                            setAutomatedValues(prev => ({
                                ...prev,
                                count: Math.floor(Math.random() * 9) + 4,
                            }));
                        }
                    }

                    // Rotation automation — independent beat pattern
                    if (config.enableSliceAutomation && config.sliceRotationBeatPattern) {
                        sliceRotBeatCounterRef.current++;
                        let trigger: number;
                        if (config.sliceRotationBeatPattern === '2')      trigger = 2;
                        else if (config.sliceRotationBeatPattern === '4') trigger = 4;
                        else if (config.sliceRotationBeatPattern === '8') trigger = 8;
                        else /* 'random' */                               trigger = sliceRotNextTriggerRef.current;
                        if (sliceRotBeatCounterRef.current >= trigger) {
                            sliceRotBeatCounterRef.current = 0;
                            if (config.sliceRotationBeatPattern === 'random') {
                                sliceRotNextTriggerRef.current = Math.floor(Math.random() * 7) + 1; // 1–7 beats
                            }
                            const range = config.sliceRotationRange ?? 45;
                            setAutomatedValues(prev => ({
                                ...prev,
                                rotation: (Math.random() * range * 2) - range,
                            }));
                        }
                    }
                }

                // Handle Beat/Bar synchronized background media rotations
                if (config.enableBackgroundRotation) {
                    if (config.rotationMusicGovern) {
                        // Music energy-density governed rotation
                        const speedFactor = config.speed || 1.0;
                        energyAccumulatorRef.current += overallLvl * dt * speedFactor;
                        const targetBars = config.rotationBeatBars || 4;
                        // calibrate: ~3.5 energy units accumulated per bar
                        const targetEnergy = targetBars * 3.5;
                        if (energyAccumulatorRef.current >= targetEnergy) {
                            energyAccumulatorRef.current = 0;
                            setActiveMediaIndex1(p => mediaList1.length > 0 ? (p + 1) % mediaList1.length : 0);
                            setActiveMediaIndex2(p => mediaList2.length > 0 ? (p + 1) % mediaList2.length : 0);
                        }
                    } else if (config.enableRotationOnBeat && beatDetected) {
                        // Strict on-beat bar accumulation
                        rotationBeatCounterRef.current++;
                        const targetBars = config.rotationBeatBars || 4;
                        const targetBeats = targetBars * 4;
                        if (rotationBeatCounterRef.current >= targetBeats) {
                            rotationBeatCounterRef.current = 0;
                            setActiveMediaIndex1(p => mediaList1.length > 0 ? (p + 1) % mediaList1.length : 0);
                            setActiveMediaIndex2(p => mediaList2.length > 0 ? (p + 1) % mediaList2.length : 0);
                        }
                    }
                }
            }

            // 2. Video Playback Watchdog (Fix for stuck videos)
            const ensurePlaying = (ref: React.RefObject<HTMLVideoElement | HTMLImageElement>) => {
                if (ref.current && ref.current instanceof HTMLVideoElement) {
                    if (ref.current.paused && ref.current.readyState >= 2) {
                        ref.current.play().catch(() => {});
                    }
                }
            };
            ensurePlaying(source1Ref);
            ensurePlaying(source2Ref);

            // 3. Canvas Drawing
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d', { alpha: false }); // alpha: false for performance if we cover screen
            
            if (canvas && ctx) {
                const width = canvas.width;
                const height = canvas.height;

                // Resize if needed
                if (width !== window.innerWidth || height !== window.innerHeight) {
                    canvas.width = window.innerWidth;
                    canvas.height = window.innerHeight;
                }
                
                // Clear
                ctx.globalCompositeOperation = 'source-over';
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, width, height);

                // Helper to draw a layer
                const drawLayer = (source: HTMLVideoElement | HTMLImageElement | null, opacity: number, blendMode: string) => {
                    if (!source) return;
                    // Check ready state for video
                    if (source instanceof HTMLVideoElement && source.readyState < 2) return;
                    if (source instanceof HTMLImageElement && !source.complete) return;

                    ctx.globalAlpha = opacity;
                    ctx.globalCompositeOperation = blendMode as GlobalCompositeOperation;
                    
                    // Base Scale & Transform
                    let scale = 1.05 + pulseFactor;
                    let tx = 0;
                    let ty = 0;

                    if (config.enableParallax) {
                        tx = mouseRef.current.x * -20;
                        ty = mouseRef.current.y * -20;
                    }

                    const renderCount = config.enableSlicing ? (config.enableSliceAutomation ? automatedValues.count : config.sliceCount) : 1;
                    const renderRotation = config.enableSlicing ? (config.enableSliceAutomation ? automatedValues.rotation : config.sliceRotation) : 0;

                    // --- DRAWING LOGIC ---
                    if (!config.enableSlicing) {
                        // FULL DRAW
                        ctx.save();
                        ctx.translate(width/2 + tx, height/2 + ty);
                        ctx.scale(scale, scale);
                        ctx.translate(-width/2, -height/2);
                        try {
                            // Using drawImage on video is GPU accelerated in modern browsers
                            ctx.drawImage(source, 0, 0, width, height);
                        } catch(e) {}
                        ctx.restore();
                    } else {
                        // SLICED DRAW
                        const sliceW = width / renderCount;
                        
                        for (let i = 0; i < renderCount; i++) {
                            // Slice Specific Pulse
                            let sliceScale = scale;
                            if (dataArray) {
                                // Sample different frequencies for different slices
                                const bin = Math.floor((i / renderCount) * 40) + 2; 
                                const val = dataArray[bin] || 0;
                                if (config.backgroundPulseIntensity > 0) {
                                    sliceScale += (val / 255) * (config.backgroundPulseIntensity * 0.2);
                                }
                            }

                            // Parallax Depth per slice
                            const depth = config.enableParallax ? (1 + (i % 3) * 0.2) : 1;
                            const sliceTx = tx * depth;
                            let sliceTy = ty * depth;

                            // Per-slice push: each slice driven by its own frequency bin + LFO wave + beat spike
                            const basePush = config.slicePush ?? 0;
                            let pushVal = basePush;
                            if (config.enableSlicing && (basePush > 0 || config.slicePushMusicDriven || config.slicePushOscDriven)) {
                                // Map slice index → frequency spectrum (sub-bass left, treble right)
                                // Bins 2–180 cover ~40 Hz – 8 kHz for a 44100 Hz / 2048 FFT context
                                const specBin = Math.floor(2 + (i / renderCount) * 178);
                                const freqEnergy = dataArray ? (dataArray[specBin] || 0) / 255 : 0;

                                // Per-slice LFO: traveling wave across slices (phase offset by position)
                                const slicePhaseOff = (i / renderCount) * Math.PI * 2;
                                const sliceOscVal = 0.5 + 0.5 * Math.sin(oscillatorPhaseRef.current * Math.PI * 2 + slicePhaseOff);

                                // Beat spike: bass-bin slices (left ~30%) get an extra kick on beat detection
                                const isBassSlice = i / renderCount < 0.35;
                                const beatSpike = (beatDetected && isBassSlice) ? freqEnergy * 0.6 : 0;

                                pushVal = basePush;
                                if (config.slicePushMusicDriven) {
                                    // Each slice's push = its own frequency energy (normalized by base)
                                    pushVal += freqEnergy * (0.5 + basePush * 0.5);
                                    pushVal += beatSpike;
                                }
                                if (config.slicePushOscDriven) {
                                    pushVal += sliceOscVal * Math.max(basePush, 0.25);
                                }
                                pushVal = Math.min(1.2, Math.max(0, pushVal));

                                sliceScale += pushVal * 0.55;        // scale toward viewer
                                sliceTy   -= pushVal * height * 0.18; // push upward
                            }

                            ctx.save();
                            
                            // 1. Clip the slice area on the screen
                            const centerX = i * sliceW + sliceW / 2;
                            const centerY = height / 2;

                            // Move to slice center
                            ctx.translate(centerX, centerY);
                            ctx.rotate(renderRotation * Math.PI / 180); 
                            
                            // Define Slice Rect (centered at 0,0 after translate)
                            // Draw the content slightly larger to cover gaps
                            const drawW = sliceW + 2; 

                            // Clip to this slice's bounds
                            ctx.beginPath();
                            ctx.rect(-drawW/2, -height/2, drawW, height);
                            ctx.clip();

                            // 2. Draw the Content
                            // Inverse transforms to map image
                            ctx.rotate(-renderRotation * Math.PI / 180);
                            ctx.translate(-centerX, -centerY);
                            
                            // Apply global image transform (parallax/pulse)
                            const imgCx = width/2 + sliceTx;
                            const imgCy = height/2 + sliceTy;
                            
                            ctx.translate(imgCx, imgCy);
                            ctx.scale(sliceScale, sliceScale);
                            ctx.translate(-imgCx, -imgCy);

                            // Drop shadow for pushed slices
                            if (pushVal > 0.02) {
                                ctx.shadowColor = 'rgba(0,0,0,0.85)';
                                ctx.shadowBlur   = pushVal * 28;
                                ctx.shadowOffsetY = pushVal * height * 0.04;
                                ctx.shadowOffsetX = 0;
                            }

                            try {
                                ctx.drawImage(source, 0, 0, width, height);
                            } catch(e) {}

                            // Reset shadow before gradient pass
                            ctx.shadowColor = 'transparent';
                            ctx.shadowBlur = 0;
                            ctx.shadowOffsetY = 0;

                            // 3. Shadow / Depth
                            if (config.enableSliceShadow) {
                                ctx.globalCompositeOperation = 'source-over'; 
                                const grad = ctx.createLinearGradient(centerX + sliceW/2 - 20, 0, centerX + sliceW/2, 0);
                                grad.addColorStop(0, 'rgba(0,0,0,0)');
                                grad.addColorStop(1, 'rgba(0,0,0,0.6)');
                                ctx.fillStyle = grad;
                                ctx.fillRect(centerX - sliceW/2, 0, sliceW, height);
                            }

                            ctx.restore();
                        }
                    }
                };

                // Draw Layer 1 (Content) — × live bus opacity multiplier
                if (source1Ref.current) {
                    drawLayer(source1Ref.current, layer1Opacity * media1OpacityRef.current, 'source-over');
                }

                // Draw Layer 2 (Overlay/Environment) — × live bus opacity multiplier
                if (config.enableLayer2 && source2Ref.current) {
                    drawLayer(source2Ref.current, layer2Opacity * media2OpacityRef.current, activeBlendMode);
                }
            }

            requestRef.current = requestAnimationFrame(render);
        };

        requestRef.current = requestAnimationFrame(render);
        return () => {
            if (requestRef.current !== null) cancelAnimationFrame(requestRef.current);
        };

    }, [config, analyser, isPlaying, activeMedia1, activeMedia2, automatedValues]);

    // --- Persistent Source Rendering ---
    const renderSourceMedia = (media: BackgroundMedia | null, ref: React.RefObject<any>, layerClass: string) => {
        if (!media) return null;
        
        const hiddenStyle: React.CSSProperties = {
            position: 'absolute',
            top: 0,
            left: 0,
            width: '2px', // Needs dimension to force decode
            height: '2px', 
            opacity: 0.001, // Needs non-zero opacity to avoid resource culling
            pointerEvents: 'none',
            zIndex: -9999,
            visibility: 'visible'
        };

        if (media.type === 'video') {
            return (
                <video
                    ref={ref}
                    src={media.url}
                    className={`bg-media-source ${layerClass}`}
                    autoPlay
                    loop
                    muted
                    playsInline
                    style={hiddenStyle}
                    onEnded={(e) => {
                        const vid = e.target as HTMLVideoElement;
                        vid.currentTime = 0;
                        vid.play().catch(() => {});
                    }}
                    onPlay={(e) => {
                        const vid = e.target as HTMLVideoElement;
                        if (vid.paused) vid.play().catch(() => {});
                    }}
                />
            );
        }
        return (
             <img
                ref={ref}
                src={media.url}
                className={`bg-media-source ${layerClass}`}
                alt="source"
                style={hiddenStyle}
            />
        );
    };

    return (
        <div className="absolute inset-0 bg-black overflow-hidden">
            {/* The Output Canvas */}
            <canvas 
                ref={canvasRef}
                className="w-full h-full block"
                style={{ opacity: config.backgroundOpacity, willChange: 'transform' }} // Hint GPU
            />
            
            {/* Persistent Source Elements (Hidden but Active) */}
            {activeMedia1 && (
                <div key={`L1-${activeMedia1.id}`}>
                     {renderSourceMedia(activeMedia1, source1Ref, "layer-1")}
                </div>
            )}
            
            {activeMedia2 && (
                <div key={`L2-${activeMedia2.id}`}>
                    {renderSourceMedia(activeMedia2, source2Ref, "layer-2")}
                </div>
            )}
        </div>
    );
};

export default BackgroundLayer;
import React from 'react';
import { Play, Pause, Upload, Volume2, VolumeX, Disc, Square, SkipBack, SkipForward, Link2 } from 'lucide-react';
import { AudioState } from '../types';

interface ControlsProps {
    audioState: AudioState;
    onTogglePlay: () => void;
    onUpload: (file: File) => void;
    onVolumeChange: (vol: number) => void;
    isRecording: boolean;
    onToggleRecord: () => void;
    // ─── Platform-slaved mode (transport driven by the Plajah global player) ───
    hideUpload?: boolean;             // audio comes from the platform — no file upload
    slaved?: boolean;                 // show "synced to Plajah" hint, hide record
    onSeek?: (time: number) => void;  // make the progress bar interactive
    onPrev?: () => void;
    onNext?: () => void;
}

const Controls: React.FC<ControlsProps> = ({ audioState, onTogglePlay, onUpload, onVolumeChange, isRecording, onToggleRecord, hideUpload, slaved, onSeek, onPrev, onNext }) => {

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            onUpload(e.target.files[0]);
        }
    };

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!onSeek || !audioState.duration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        onSeek(ratio * audioState.duration);
    };

    const formatTime = (time: number) => {
        const min = Math.floor(time / 60);
        const sec = Math.floor(time % 60);
        return `${min}:${sec.toString().padStart(2, '0')}`;
    };

    return (
        <div className="flex items-center space-x-6">
            {/* Prev (slaved mode) */}
            {onPrev && (
                <button onClick={onPrev} title="Previous track" className="text-white/60 hover:text-white transition-colors">
                    <SkipBack className="w-5 h-5 fill-current" />
                </button>
            )}

            {/* Play/Pause */}
            <button
                onClick={onTogglePlay}
                className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-black hover:scale-105 transition-transform"
            >
                {audioState.isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
            </button>

            {/* Next (slaved mode) */}
            {onNext && (
                <button onClick={onNext} title="Next track" className="text-white/60 hover:text-white transition-colors">
                    <SkipForward className="w-5 h-5 fill-current" />
                </button>
            )}

            {/* Track Info */}
            <div className="flex flex-col min-w-[120px]">
                <div className="text-xs text-white/50 font-mono flex items-center gap-2">
                    <span>{formatTime(audioState.currentTime)} / {formatTime(audioState.duration)}</span>
                    {slaved && (
                        <span className="flex items-center gap-1 text-purple-300/70" title="Playback is driven by the Plajah transport">
                            <Link2 className="w-3 h-3" /> Synced
                        </span>
                    )}
                </div>
                {/* Progress Bar (interactive when onSeek provided) */}
                <div
                    className={`w-full h-1 bg-white/10 rounded-full mt-1 overflow-hidden ${onSeek ? 'cursor-pointer h-1.5' : ''}`}
                    onClick={onSeek ? handleSeek : undefined}
                >
                    <div
                        className="h-full bg-purple-500 transition-all duration-200"
                        style={{ width: `${(audioState.currentTime / (audioState.duration || 1)) * 100}%` }}
                    />
                </div>
            </div>

            {/* Volume */}
            <div className="group flex items-center space-x-2">
                 <button onClick={() => onVolumeChange(audioState.volume === 0 ? 0.8 : 0)}>
                     {audioState.volume === 0 ? <VolumeX className="w-5 h-5 text-white/70" /> : <Volume2 className="w-5 h-5 text-white/70" />}
                 </button>
                 <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.05"
                    value={audioState.volume}
                    onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                    className="w-20 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                 />
            </div>

            {/* Recording Controls — hidden in slaved mode */}
            {!slaved && (
                <button
                    onClick={onToggleRecord}
                    className={`flex items-center space-x-2 border rounded-full px-4 py-2 transition-all ${
                        isRecording
                        ? 'bg-red-500/20 border-red-500 text-red-400 hover:bg-red-500/30'
                        : 'bg-white/10 border-white/10 text-white hover:bg-white/20'
                    }`}
                >
                    {isRecording ? (
                        <>
                            <Square className="w-4 h-4 fill-current animate-pulse" />
                            <span className="text-sm font-medium">Stop Rec</span>
                        </>
                    ) : (
                        <>
                            <Disc className="w-4 h-4" />
                            <span className="text-sm font-medium">Record</span>
                        </>
                    )}
                </button>
            )}

            {/* Upload — hidden when audio is driven by the platform */}
            {!hideUpload && (
                <label className="cursor-pointer group relative">
                    <input
                        type="file"
                        accept="audio/mp3,audio/wav,audio/mpeg"
                        className="hidden"
                        onChange={handleFileChange}
                    />
                    <div className="flex items-center space-x-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full px-4 py-2 transition-all">
                        <Upload className="w-4 h-4 text-white" />
                        <span className="text-sm font-medium text-white">Upload MP3</span>
                    </div>
                </label>
            )}
        </div>
    );
};

export default Controls;
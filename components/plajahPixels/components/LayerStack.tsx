// LayerStack — the real composite. Renders EVERY active layer of the clip
// launcher at once, stacked: array order = z-order (top row of the deck, which
// is the LAST array element under flex-col-reverse, paints foremost; nothing
// below overrides what's above). Each layer renders its active clip's own source
// (media / generator / milkdrop / shader / color) with per-row opacity × per-clip
// opacity and the row's blend mode. An empty/bypassed/muted row renders nothing —
// clear is truly empty. This REPLACES the old bgMedia1/bgMedia2 + single-core
// pipeline.

import React from 'react';
import AudioVisualizer from './AudioVisualizer';
import StudioStage from './StudioStage';
import ButterchurnLayer from './ButterchurnLayer';
import ShaderLayer from './ShaderLayer';
import { VisualizationConfig, VisualizerMode, isStudioMode } from '../types';
import type { LauncherLayer, LauncherClip } from './ClipLauncher';

// Row blend mode → CSS mix-blend-mode (Add → plus-lighter; rest map 1:1).
const CSS_BLEND: Record<string, string> = {
  normal: 'normal', screen: 'screen', add: 'plus-lighter', multiply: 'multiply',
  overlay: 'overlay', lighten: 'lighten', exclusion: 'exclusion', difference: 'difference',
};

const LayerSource: React.FC<{ clip: LauncherClip; analyser: AnalyserNode | null; config: VisualizationConfig; isPlaying: boolean }>
  = ({ clip, analyser, config, isPlaying }) => {
  if (clip.type === 'color') {
    return <div className="absolute inset-0" style={{ background: clip.fillColor || '#000' }} />;
  }
  if (clip.type === 'media' && clip.mediaUrl) {
    return clip.mediaType === 'image'
      ? <img src={clip.mediaUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      : <video src={clip.mediaUrl} className="absolute inset-0 w-full h-full object-cover" autoPlay loop muted playsInline />;
  }
  // The rest need audio.
  if (!analyser) return null;
  if (clip.type === 'milkdrop') {
    return <ButterchurnLayer analyser={analyser} presetIndex={clip.milkdropIdx ?? 0} />;
  }
  if (clip.type === 'shader' && clip.shaderSrc) {
    return <ShaderLayer analyser={analyser} source={clip.shaderSrc} startTimeMs={0} params={clip.params} onError={() => { }} />;
  }
  if (clip.type === 'generator' && clip.sceneMode && !clip.sceneMode.startsWith('__fx_')) {
    const cfg: VisualizationConfig = { ...config, mode: clip.sceneMode as VisualizerMode };
    return isStudioMode(cfg.mode)
      ? <StudioStage analyser={analyser} config={cfg} isPlaying={isPlaying} />
      : <AudioVisualizer analyser={analyser} config={cfg} isPlaying={isPlaying} hasBackground={false} />;
  }
  return null;
};

const LayerStack: React.FC<{ layers: LauncherLayer[]; analyser: AnalyserNode | null; config: VisualizationConfig; isPlaying: boolean }>
  = ({ layers, analyser, config, isPlaying }) => {
  return (
    <div className="absolute inset-0">
      {layers.map((layer, i) => {
        if (layer.bypassed || layer.muted || layer.activeCol == null) return null;
        const clip = layer.clips[layer.activeCol];
        if (!clip || clip.type === 'empty') return null;
        if (clip.type === 'generator' && clip.sceneMode?.startsWith('__fx_')) return null; // FX flags, not a visual source
        const opacity = Math.max(0, Math.min(1, (layer.opacity ?? 1) * (clip.opacity ?? 1)));
        const blend = CSS_BLEND[(layer.blendMode || 'normal').toLowerCase()] || 'normal';
        return (
          <div key={layer.id} className="absolute inset-0" style={{ zIndex: i, opacity, mixBlendMode: blend as any }}>
            {/* key the source on type+identity so swapping a clip rebuilds the right renderer */}
            <LayerSource key={`${clip.type}:${clip.sceneMode ?? clip.shaderSrc?.slice(0, 24) ?? clip.mediaUrl ?? clip.milkdropIdx ?? clip.fillColor}`}
              clip={clip} analyser={analyser} config={config} isPlaying={isPlaying} />
          </div>
        );
      })}
    </div>
  );
};

export default LayerStack;

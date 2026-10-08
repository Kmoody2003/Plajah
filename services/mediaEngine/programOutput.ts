// mediaEngine/programOutput.ts — compositor + program audio, as one output.
//
// The single object both production surfaces drive:
//   • Control Room — MediaEngine pushes its switcher state in on every change.
//   • Sports Director — SmartDirectorView pushes the director's program feed in.
// Its `stream` (video + AFV audio) is what the program monitor shows, what recording
// captures, and what goes live.

import type { TransitionType } from './types';
import { ProgramCompositor, OverlayLayer, CompositorOptions } from './programCompositor';
import { ProgramAudioMixer } from './programAudio';

export interface ProgramSourceRef { id: string; stream: MediaStream | null | undefined }

export interface ProgramOutputState {
  program: ProgramSourceRef | null;
  preview: ProgramSourceRef | null;
  transition: { type: TransitionType; position: number };
  /** Every source that could contribute audio (AFV picks from these). */
  sources: ProgramSourceRef[];
  alwaysOnAudio?: string[];
  fadeToBlack?: number;
}

export class ProgramOutput {
  readonly compositor: ProgramCompositor;
  readonly audio: ProgramAudioMixer;
  private combined: MediaStream | null = null;

  constructor(opts: CompositorOptions = {}) {
    this.compositor = new ProgramCompositor(opts);
    this.audio = new ProgramAudioMixer();
  }

  start() { this.compositor.start(); this.audio.resume(); }

  update(s: ProgramOutputState) {
    this.compositor.setFrame({
      program: s.program?.stream ?? null,
      preview: s.preview?.stream ?? null,
      transition: s.transition,
      fadeToBlack: s.fadeToBlack,
    });
    this.audio.setSources(s.sources.map(x => ({ id: x.id, stream: x.stream ?? null })));
    this.audio.apply({
      programId: s.program?.id ?? null,
      previewId: s.preview?.id ?? null,
      position: s.transition.type === 'cut' ? 0 : s.transition.position,
      alwaysOn: s.alwaysOnAudio,
    });
  }

  addLayer(layer: OverlayLayer) { this.compositor.addLayer(layer); }
  removeLayer(id: string) { this.compositor.removeLayer(id); }

  /** Program video + program audio in one stream. */
  get stream(): MediaStream {
    if (!this.combined) {
      this.combined = new MediaStream([
        ...this.compositor.captureStream().getVideoTracks(),
        ...this.audio.stream.getAudioTracks(),
      ]);
    }
    return this.combined;
  }

  get canvas(): HTMLCanvasElement { return this.compositor.canvas; }

  dispose() {
    this.compositor.dispose();
    this.audio.dispose();
    this.combined = null;
  }
}

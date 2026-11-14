// visualProviders — registers every Plajah visual engine with visualFill.
// Browser-only; heavy engines load lazily the first time a fill needs them.
import { registerVisualProvider, type VisualInstance, type VisualSource, type VisualEntry } from './visualFill';
import { liveFeedVideo, releaseLiveFeed, liveFeedReady, LIVE_FEED_CHOICES } from './liveFeed';

/** Wrap an async-built frame source as a sync VisualInstance. */
function lazyInstance(build: () => Promise<{ frame(t: number): CanvasImageSource | null; dispose(): void; ready?(): boolean } | null>): VisualInstance {
  let inner: Awaited<ReturnType<typeof build>> = null, disposed = false;
  build().then(x => { if (disposed) x?.dispose(); else inner = x; }).catch(() => undefined);
  return {
    ready: () => !!inner && (inner.ready ? inner.ready() : true),
    frame: (t) => inner?.frame(t) ?? null,
    dispose: () => { disposed = true; inner?.dispose(); inner = null; },
  };
}

// ── Stage: generators, Flux, Studio GL, Milkdrop, Chora typo, shader library ──
registerVisualProvider({
  engine: 'stage', label: 'Visualizers (Pixels · Flux · Milkdrop · Chora typo · shaders)',
  create(src: VisualSource, w: number, h: number) {
    return lazyInstance(async () => {
      const [{ createSource }, picker] = await Promise.all([import('../ambo/layerSources'), import('../../components/scripture/AmboTemplateVisualizerPicker')]);
      const resolved = picker.resolveVisualizerValue(src.value);
      if (!resolved) return null;
      const content: any = resolved.kind === 'SHADER' ? { kind: 'SHADER', src: resolved.src } : { kind: 'GENERATOR', mode: resolved.mode, params: src.params || {} };
      const s: any = createSource(content, { w, h }, undefined, false);
      if (!s) return null;
      if (typeof s.setAudioSource === 'function') s.setAudioSource(src.audio === 'live-input' ? 'live-input' : src.audio === 'none' ? 'none' : 'ambo-playback');
      return { frame: (t: number) => s.frame(t), ready: () => s.ready(), dispose: () => s.dispose() };
    });
  },
  async catalog(): Promise<VisualEntry[]> {
    const picker: any = await import('../../components/scripture/AmboTemplateVisualizerPicker');
    const milk: string[] = picker.loadMilkdropNames ? await picker.loadMilkdropNames() : [];
    return picker.buildVisualizerCatalog(milk).map((e: any) => ({ engine: 'stage', value: e.value, name: e.name, group: e.group, hint: e.sub }));
  },
});

// ── Chora worship visualizers (Canvas2D, no GPU) ─────────────────────────────
registerVisualProvider({
  engine: 'worship', label: 'Chora worship visualizers',
  create(src: VisualSource, w: number, h: number) {
    return lazyInstance(async () => {
      const wv: any = await import('../ambo/worshipVisualizers');
      const def = wv.getWorshipVisualizerById(src.value);
      if (!def || typeof document === 'undefined') return null;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d')!;
      const params = { ...wv.DEFAULT_WORSHIP_PARAMS, showText: false, ...(src.params || {}) };
      return {
        frame: (t: number) => {
          const audio = wv.synthesizeWorshipAudioState(t, def.category, Number(params.reactivity) || 0.7);
          ctx.clearRect(0, 0, w, h);
          def.render({ ctx, w, h, t, audio, params, visualizer: def });
          return c;
        },
        dispose: () => { c.width = c.height = 1; },
      };
    });
  },
  async catalog() {
    const wv: any = await import('../ambo/worshipVisualizers');
    return wv.ALL_WORSHIP_VISUALIZERS.map((d: any) => ({ engine: 'worship', value: d.id, name: d.name, group: `Chora · ${String(d.category).replace(/-/g, ' ')}`, hint: d.subtitle }));
  },
});

// ── live video feeds ─────────────────────────────────────────────────────────
registerVisualProvider({
  engine: 'live', label: 'Live video (camera, program, Stage output)',
  create(src: VisualSource) {
    const v = liveFeedVideo(src.value);
    return { ready: () => liveFeedReady(v), frame: () => v, dispose: () => releaseLiveFeed(src.value) };
  },
  async catalog() { return LIVE_FEED_CHOICES.map(c => ({ engine: 'live', value: c.id, name: c.name, group: 'Live video' })); },
});

// ── live 3D avatars (VRM, face-tracked from a live feed, transparent) ────────
export const AVATAR_CHOICES: { id: string; name: string; url: string }[] = [
  { id: 'elise', name: 'Elise (VRM)', url: '/games/ravencrest/assets/vtuber/elise.vrm' },
];
/** value = '<avatarUrl>|<feedId>' — e.g. '/games/…/elise.vrm|camera'. */
export function avatarValue(url: string, feed = 'camera') { return `${url}|${feed}`; }

registerVisualProvider({
  engine: 'avatar', label: 'Live 3D avatars (face-tracked)',
  create(src: VisualSource, w: number, h: number) {
    const [url, feed = 'camera'] = src.value.split('|');
    return lazyInstance(async () => {
      const [{ VrmRig }, { LiveFaceTracker }, { FaceRetargeter }] = await Promise.all([
        import('../vtuber/vrmRig'), import('../vtuber/liveTrackers'), import('../vtuber/retarget'),
      ]);
      const rig: any = new VrmRig(w, h);
      if (!(await rig.loadAvatar(url))) { rig.dispose(); return null; }
      const tracker: any = new LiveFaceTracker({ blendshapes: true });
      const retarget: any = new FaceRetargeter();
      const video = liveFeedVideo(feed);
      return {
        ready: () => rig.hasAvatar,
        frame: (t: number) => {
          if (video && liveFeedReady(video)) {
            const f = tracker.step(video, performance.now());
            if (f) { const r = retarget.retarget(f, t); rig.applyFace(r.expressions, r.head); }
          }
          rig.render();
          return rig.canvas;
        },
        dispose: () => { tracker.dispose?.(); rig.dispose(); releaseLiveFeed(feed); },
      };
    });
  },
  async catalog() {
    return AVATAR_CHOICES.flatMap(a => LIVE_FEED_CHOICES.filter(f => f.id === 'camera' || f.id === 'switcher:pgm').map(f => ({ engine: 'avatar', value: avatarValue(a.url, f.id), name: `${a.name} · ${f.name}`, group: 'Live 3D avatars' })));
  },
});

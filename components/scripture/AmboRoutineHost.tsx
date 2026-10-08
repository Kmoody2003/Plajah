// AmboRoutineHost — runs the routine scheduler against the live presenter and
// renders the header chip (next routine + countdown, operator windows).
//
// It also owns the three things that need the presenter's live objects:
//   · output layouts  → open/re-place windows by monitor, incl. hot-plug
//   · scheduler       → 1 s tick, executes steps through the RoutineHost
//   · session leader  → publishes a snapshot to operator windows and runs their commands
//
// The presenter passes plain handlers; nothing here edits presenter state directly.

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Clock, Users } from 'lucide-react';
import type { Slide, Show } from '../../services/ambo/showModel';
import {
  OutputRouter, detectScreens, subscribeToDisplayChanges, type AmboOutput, type DetectedScreenInfo,
} from '../../services/ambo/outputRouter';
import {
  buildRoutineHost, getRoutineEngine, getLayouts, layoutApi, formatCountdown, type PresenterHandlers,
} from '../../services/ambo/routineHost';
import {
  captureLayout, resolvePlacements, applyResolved, diffScreens, planHotplug, type OutputLayoutPreset,
} from '../../services/ambo/outputLayouts';
import {
  SessionSync, operatorWindowUrl, type SessionCommand, type SessionSnapshot, type OperatorRole,
} from '../../services/ambo/sessionSync';
import { slideText } from '../../services/ambo/servicePlanDemo';
import { cuesForRef } from '../../services/ambo/autoScripture';
import { parseRef } from '../../services/scriptureRef';

const ACTIVE_LAYOUT_KEY = 'ambo_active_layout_v1';

export interface RoutineHostProps {
  /** Presenter's real handlers. Outputs/layout ones are supplied here, not by the presenter. */
  handlers: Omit<PresenterHandlers, 'openOutputs' | 'closeOutputs'>;
  outputs: AmboOutput[];
  setOutputs: React.Dispatch<React.SetStateAction<AmboOutput[]>>;
  router: OutputRouter | null;
  activeShow?: Show;
  slides: Slide[];
  liveSlideId: string | null;
  liveLabel?: string;
  scriptureRef?: string;
  blackout: boolean;
  stepSlide(delta: 1 | -1): void;
  fireScripture(cue: { refId: string; translation: string; lines: string[]; reference: string }): void;
  setBlackout(on: boolean): void;
}

const useNow = (ms: number) => {
  const [n, setN] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return n;
};

export default function AmboRoutineHost(props: RoutineHostProps) {
  const p = useRef(props);
  p.current = props;
  const eng = getRoutineEngine();
  useSyncExternalStore(eng.subscribe, eng.getVersion, eng.getVersion);
  const now = useNow(1000);
  const [presence, setPresence] = useState(1);
  const [menu, setMenu] = useState(false);
  const sessionRef = useRef<SessionSync | null>(null);
  const screensRef = useRef<DetectedScreenInfo[]>([]);
  const activeLayoutRef = useRef<string | null>((() => { try { return localStorage.getItem(ACTIVE_LAYOUT_KEY); } catch { return null; } })());

  // ── Output layouts ──
  const screenList = (s: DetectedScreenInfo[]) => s.map(x => ({ left: x.left, top: x.top, width: x.width, height: x.height }));

  const applyLayout = async (layoutId: string, opts: { onlyMoved?: boolean } = {}) => {
    const layout = getLayouts().find(l => l.id === layoutId);
    const router = p.current.router;
    if (!layout) throw new Error('Output layout not found');
    if (!router) throw new Error('Output router not ready');
    const screens = await detectScreens();
    screensRef.current = screens;
    const resolved = resolvePlacements(layout, screens);
    const before = p.current.outputs;
    const next = applyResolved(before, resolved, screens);
    p.current.setOutputs(next);
    router.outputs = next;
    for (const r of resolved) {
      const o = next.find(x => x.id === r.outputId);
      const was = before.find(x => x.id === r.outputId);
      if (!o) continue;
      if (opts.onlyMoved && was?.screenIndex === o.screenIndex) continue;
      if (was?.screenIndex !== o.screenIndex) router.closeWindow(o.id);
      router.openWindow(o, screenList(screens));
    }
    activeLayoutRef.current = layoutId;
    try { localStorage.setItem(ACTIVE_LAYOUT_KEY, layoutId); } catch { /* */ }
  };

  useEffect(() => {
    layoutApi.apply = id => applyLayout(id);
    layoutApi.capture = async (name): Promise<OutputLayoutPreset | null> => {
      const screens = await detectScreens();
      const lay = captureLayout(name, p.current.outputs, screens);
      return lay.placements.length ? lay : null;
    };
    layoutApi.closeAll = () => { for (const o of p.current.router?.outputs ?? []) p.current.router?.closeWindow(o.id); };
    return () => { layoutApi.apply = undefined; layoutApi.capture = undefined; layoutApi.closeAll = undefined; };
  }, []);

  // ── Host wiring + scheduler ──
  useEffect(() => {
    const handlers = (): PresenterHandlers => ({
      ...p.current.handlers,
      openOutputs: async a => {
        if (a.layoutId) return applyLayout(a.layoutId);
        const router = p.current.router;
        const screens = await detectScreens();
        for (const o of p.current.outputs) {
          if (a.outputIds?.length ? a.outputIds.includes(o.id) : o.enabled) router?.openWindow(o, screenList(screens));
        }
      },
      closeOutputs: async a => {
        for (const o of p.current.router?.outputs ?? []) if (!a.outputIds?.length || a.outputIds.includes(o.id)) p.current.router?.closeWindow(o.id);
      },
    });
    eng.setHost(buildRoutineHost(handlers));
    void eng.tick();
    const t = setInterval(() => { void eng.tick(); }, 1000);
    return () => clearInterval(t);
  }, [eng]);

  // slide-entered events
  useEffect(() => { if (props.liveSlideId) void eng.fireEvent({ event: 'slide-entered', key: props.liveSlideId }); }, [props.liveSlideId, eng]);

  // startup / service-start auto-open + hot-plug re-placement
  useEffect(() => {
    let alive = true;
    const opened = new Set<string>();
    (async () => {
      screensRef.current = await detectScreens();
      if (!alive) return;
      // wait a beat so the presenter's outputs are populated
      setTimeout(() => {
        for (const l of getLayouts()) if (l.autoOpen === 'startup') applyLayout(l.id).catch(() => {});
      }, 1500);
    })();
    const svcTimer = setInterval(() => {
      const d = eng.getData();
      for (const l of getLayouts()) {
        if (l.autoOpen !== 'service-start') continue;
        for (const st of d.serviceTimes) {
          if (st.enabled === false) continue;
          const secs = eng.secondsToService(st.id, Date.now());
          const key = `${l.id}@${st.id}@${secs != null ? Math.round((Date.now() + secs * 1000) / 60000) : ''}`;
          if (secs != null && secs <= 30 * 60 && !opened.has(key)) { opened.add(key); applyLayout(l.id).catch(() => {}); }
        }
      }
    }, 30000);
    const unsub = subscribeToDisplayChanges(screens => {
      const diff = diffScreens(screensRef.current, screens);
      screensRef.current = screens;
      if (!diff.changed) return;
      const layout = getLayouts().find(l => l.id === activeLayoutRef.current);
      const router = p.current.router;
      if (!layout || layout.followHotplug === false || !router) return;
      const plan = planHotplug(layout, p.current.outputs, screens);
      for (const id of plan.orphaned) router.closeWindow(id);
      if (plan.reopen.length) applyLayout(layout.id, { onlyMoved: true }).catch(() => {});
    });
    return () => { alive = false; clearInterval(svcTimer); unsub(); };
  }, [eng]);

  // ── Session leader ──
  useEffect(() => {
    const exec = async (cmd: SessionCommand) => {
      const h = p.current;
      switch (cmd.type) {
        case 'take-slide': await h.handlers.takeSlide({ slideId: cmd.slideId }); break;
        case 'next': h.stepSlide(1); break;
        case 'prev': h.stepSlide(-1); break;
        case 'clear': await h.handlers.clearLayers({ slot: cmd.slot ?? 'all' }); break;
        case 'blackout': h.setBlackout(cmd.on); break;
        case 'run-routine': if (!(await eng.runRoutine(cmd.routineId, 0, 'manual'))) throw new Error('Routine reported a problem'); break;
        case 'fire-scripture': {
          const ref = parseRef(cmd.reference);
          if (!ref) throw new Error(`Could not read "${cmd.reference}"`);
          const cues = await cuesForRef(ref, cmd.translation || 'KJV', 1);
          if (!cues[0]) throw new Error('Verse not found');
          h.fireScripture(cues[0]);
          break;
        }
      }
    };
    const s = new SessionSync({ role: 'all', label: 'Main', onCommand: exec, onChange: () => setPresence(s.presence.length) });
    sessionRef.current = s;
    return () => { s.close(); sessionRef.current = null; };
  }, [eng]);

  const snapshot: SessionSnapshot = useMemo(() => ({
    showId: props.activeShow?.id, showTitle: props.activeShow?.title,
    slides: props.slides.slice(0, 200).map(s => ({ id: s.id, label: s.label || s.group || '', group: s.group, text: slideText(s).slice(0, 140) })),
    liveSlideId: props.liveSlideId, liveLabel: props.liveLabel, scriptureRef: props.scriptureRef, blackout: props.blackout,
  }), [props.activeShow, props.slides, props.liveSlideId, props.liveLabel, props.scriptureRef, props.blackout]);
  useEffect(() => { sessionRef.current?.publish(snapshot); }, [snapshot]);

  // ── Chip ──
  const d = eng.getData();
  const next = eng.nextScheduled(now);
  const cd = d.countdowns.slice().sort((a, b) => a.endsAt - b.endsAt)[0];
  const openOp = (role: OperatorRole) => {
    setMenu(false);
    window.open(operatorWindowUrl(role), `ambo_op_${role}_${Date.now()}`, 'popup=yes,width=520,height=760');
  };

  return (
    <div className="relative flex items-center gap-1.5">
      <div
        className="flex items-center gap-1.5 px-2.5 h-9 rounded-lg border text-[11px] border-white/15 bg-white/5 text-white/70 max-w-[260px]"
        title={next ? `Next routine: ${next.routine.name}` : 'No routines scheduled (Routines tab)'}
      >
        <Clock size={13} className={cd ? 'text-[#FF8C00] animate-pulse' : 'text-white/50'} />
        {cd ? (
          <span className="font-mono text-[#FF8C00] truncate">{cd.label} {formatCountdown(cd.endsAt - now)}</span>
        ) : next ? (
          <span className="truncate"><span className="text-white/90">{next.routine.name}</span> <span className="font-mono text-[#00DAF3]">in {formatCountdown(next.at - now)}</span></span>
        ) : (
          <span className="text-white/40">No routines</span>
        )}
      </div>
      <button
        onClick={() => setMenu(v => !v)}
        className="flex items-center gap-1 px-2 h-9 rounded-lg border text-[11px] border-white/15 bg-white/5 text-white/70 hover:bg-white/10"
        title="Open another operator window for this project"
      >
        <Users size={13} /> <span className="font-mono">{presence}</span>
      </button>
      {menu && (
        <div className="absolute top-full mt-1 right-0 z-50 rounded-lg border border-white/15 bg-[#120c1c] p-1.5 w-52 shadow-xl">
          <div className="text-[9px] uppercase tracking-wide text-white/40 px-1.5 pb-1">New operator window ({presence} open)</div>
          {([['all', 'Full control'], ['lyrics', 'Lyrics / slides'], ['scripture', 'Scripture'], ['media', 'Media / routines']] as Array<[OperatorRole, string]>).map(([r, l]) => (
            <button key={r} onClick={() => openOp(r)} className="w-full text-left px-2 py-1 rounded text-[11px] text-white/80 hover:bg-white/10">{l}</button>
          ))}
          <div className="text-[9px] text-white/35 px-1.5 pt-1">Operator windows show the live state and send take / clear commands; this window stays the owner of the project.</div>
        </div>
      )}
    </div>
  );
}

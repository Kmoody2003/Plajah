// Co-editing lab: three simulated devices on the real merge engine (services/coedit/crdt.ts) with
// latency and offline switches, plus the real collaboration dock against an in-memory session.
//   npx vite --config coedit-lab.vite.config.mjs  ->  http://127.0.0.1:3182/coedit-lab.html
// No Firebase: the network here is a 350 ms in-page relay, so it runs signed out.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '/index.css';
import { applyOps, deepEqual, diff, fromDoc, type CrdtState, type Op } from './services/coedit/crdt';
import { newClock, observe, tick } from './services/coedit/hlc';
import { sentence, summarize } from './services/coedit/labels';
import { CollabDock } from './components/collab/CollabDock';
import type { UseCoedit } from './hooks/useCoedit';
import type { SessionSnapshot, VersionMeta } from './services/coedit/session';

interface Shape {
  id: string;
  kind: 'RECT' | 'CIRCLE';
  fill: string;
  label: string;
}
interface LabDoc {
  title: string;
  caption: string;
  shapes: Shape[];
}

const START: LabDoc = {
  title: 'Harvest Festival flyer',
  caption: 'Join us Saturday for food, music and games for the whole family.',
  shapes: [
    { id: 's1', kind: 'RECT', fill: '#ff6b6b', label: 'Banner' },
    { id: 's2', kind: 'CIRCLE', fill: '#4dabf7', label: 'Sun' },
    { id: 's3', kind: 'RECT', fill: '#51cf66', label: 'Footer' },
  ],
};

const COLORS = ['#ff6b6b', '#4dabf7', '#51cf66', '#fcc419', '#cc5de8', '#ff922b'];
const LATENCY = 350;

type Device = { name: string; color: string };
const DEVICES: Device[] = [
  { name: 'Kenne · laptop', color: '#00DAF3' },
  { name: 'Ana · phone', color: '#D40055' },
  { name: 'Jordan · tablet', color: '#fcc419' },
];

/** The relay: batches go to every other device after LATENCY, or wait while either side is offline. */
function useNetwork(n: number) {
  const [states, setStates] = useState<CrdtState<LabDoc>[]>(() => Array.from({ length: n }, () => fromDoc(structuredClone(START))));
  const [online, setOnline] = useState<boolean[]>(() => Array(n).fill(true));
  const [outbox, setOutbox] = useState<Op[][][]>(() => Array.from({ length: n }, () => []));
  const [feed, setFeed] = useState<string[]>([]);
  const clocks = useRef(DEVICES.map((d, i) => newClock(`d${i}`)));
  const statesRef = useRef(states);
  statesRef.current = states;
  const onlineRef = useRef(online);
  onlineRef.current = online;

  const deliver = (from: number, ops: Op[]) => {
    setTimeout(() => {
      setStates((all) =>
        all.map((s, i) => {
          if (i === from || !onlineRef.current[i]) return s;
          for (const o of ops) observe(clocks.current[i], o.s);
          return applyOps(s, ops).state;
        })
      );
      // devices that were offline get it when they reconnect (kept in the sender's sent log)
      sentLog.current.push({ from, ops });
    }, LATENCY);
  };
  const sentLog = useRef<{ from: number; ops: Op[] }[]>([]);

  const edit = (i: number, fn: (d: LabDoc) => LabDoc) => {
    const s = statesRef.current[i];
    const next = fn(structuredClone(s.doc));
    const ops = diff(s.doc, next, s.meta, () => tick(clocks.current[i]));
    if (!ops.length) return;
    setStates((all) => all.map((x, k) => (k === i ? applyOps(x, ops).state : x)));
    setFeed((f) => [`${DEVICES[i].name.split(' ·')[0]} ${sentence(summarize(ops, next, s.doc))}`, ...f].slice(0, 12));
    if (onlineRef.current[i]) deliver(i, ops);
    else setOutbox((o) => o.map((q, k) => (k === i ? [...q, ops] : q)));
  };

  const setDeviceOnline = (i: number, on: boolean) => {
    setOnline((o) => o.map((x, k) => (k === i ? on : x)));
    onlineRef.current = onlineRef.current.map((x, k) => (k === i ? on : x));
    if (!on) return;
    // catch up on everything sent while away, then drain this device's outbox
    setStates((all) =>
      all.map((s, k) => {
        if (k !== i) return s;
        let st = s;
        for (const b of sentLog.current) if (b.from !== i) st = applyOps(st, b.ops).state;
        return st;
      })
    );
    const queued = outbox[i];
    setOutbox((o) => o.map((q, k) => (k === i ? [] : q)));
    for (const ops of queued) deliver(i, ops);
  };

  const converged = states.every((s) => deepEqual(s.doc, states[0].doc));
  return { states, online, outbox, feed, edit, setDeviceOnline, converged };
}

const DeviceEditor: React.FC<{ i: number; net: ReturnType<typeof useNetwork> }> = ({ i, net }) => {
  const d = net.states[i].doc;
  const dev = DEVICES[i];
  const on = net.online[i];
  const queued = net.outbox[i].reduce((n, b) => n + b.length, 0);
  return (
    <div className="rounded-[14px] border border-white/10 bg-[#120f19] p-3 flex flex-col gap-2.5 min-w-0" style={{ boxShadow: `inset 0 2px 0 ${dev.color}` }}>
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: dev.color }} />
        <span className="text-[.74rem] font-extrabold flex-1">{dev.name}</span>
        <button
          data-testid={`toggle-${i}`}
          onClick={() => net.setDeviceOnline(i, !on)}
          className={`h-6 px-2 rounded-full text-[.6rem] font-extrabold ${on ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-300'}`}
        >
          {on ? 'Online' : `Offline · ${queued} queued`}
        </button>
      </div>
      <input data-testid={`title-${i}`} className="h-8 rounded-[8px] bg-black/30 border border-white/10 px-2 text-[.78rem] font-bold" value={d.title} onChange={(e) => net.edit(i, (x) => ({ ...x, title: e.target.value }))} />
      <textarea
        data-testid={`caption-${i}`}
        className="h-20 rounded-[8px] bg-black/30 border border-white/10 p-2 text-[.72rem] resize-none"
        value={d.caption}
        onChange={(e) => net.edit(i, (x) => ({ ...x, caption: e.target.value }))}
      />
      <div className="flex flex-col gap-1">
        {d.shapes.map((s, k) => (
          <div key={s.id} className="flex items-center gap-1.5 text-[.68rem]">
            <button title="Change colour" className={`w-5 h-5 shrink-0 ${s.kind === 'CIRCLE' ? 'rounded-full' : 'rounded-[4px]'}`} style={{ background: s.fill }} onClick={() => net.edit(i, (x) => ({ ...x, shapes: x.shapes.map((y) => (y.id === s.id ? { ...y, fill: COLORS[(COLORS.indexOf(y.fill) + 1) % COLORS.length] } : y)) }))} />
            <input className="flex-1 min-w-0 h-6 rounded bg-black/20 border border-white/5 px-1.5" value={s.label} onChange={(e) => net.edit(i, (x) => ({ ...x, shapes: x.shapes.map((y) => (y.id === s.id ? { ...y, label: e.target.value } : y)) }))} />
            <button className="text-white/40 hover:text-white" title="Move up" disabled={k === 0} onClick={() => net.edit(i, (x) => { const a = [...x.shapes]; [a[k - 1], a[k]] = [a[k], a[k - 1]]; return { ...x, shapes: a }; })}>↑</button>
            <button className="text-white/40 hover:text-red-300" title="Delete" onClick={() => net.edit(i, (x) => ({ ...x, shapes: x.shapes.filter((y) => y.id !== s.id) }))}>✕</button>
          </div>
        ))}
        <button
          data-testid={`add-${i}`}
          className="self-start text-[.64rem] font-bold text-[var(--pj-cyan,#00DAF3)]"
          onClick={() => net.edit(i, (x) => ({ ...x, shapes: [...x.shapes, { id: `n${Math.random().toString(36).slice(2, 7)}`, kind: 'RECT', fill: COLORS[i], label: `${dev.name.split(' ')[0]}'s shape` }] }))}
        >
          + Add shape
        </button>
      </div>
    </div>
  );
};

// ── the real dock against an in-memory session ──────────────────────────────

function useFakeCo(doc: LabDoc): UseCoedit<LabDoc> {
  const [shared, setShared] = useState(new URLSearchParams(location.search).get('shared') !== '0');
  const [mode, setMode] = useState<'live' | 'draft'>('live');
  const [notices, setNotices] = useState([
    { id: 'n1', at: Date.now() - 20_000, kind: 'overwritten' as const, path: ['shapes', '#s1', 'fill'], label: 'Banner › Fill', by: 'ana', byName: 'Ana', mine: '#ff6b6b', text: 'Ana changed Banner › Fill right after you.' },
    { id: 'n2', at: Date.now() - 60_000, kind: 'kept-deleted' as const, path: ['shapes', '#s3'], label: 'Footer', by: 'jordan', byName: 'Jordan', text: 'Jordan was still working on Footer, so it was kept.' },
  ]);
  const versions: VersionMeta[] = useMemo(
    () => [
      { id: 'v3', reason: 'named', label: 'Sent to pastor', at: Date.now() - 3_600_000, by: 'kenne', byName: 'Kenne', chunks: 1, size: 18_000, summary: 'Ana edited Caption · Jordan added Footer', pinned: true },
      { id: 'v2', reason: 'checkpoint', at: Date.now() - 7_200_000, by: 'ana', byName: 'Ana', chunks: 1, size: 17_500 },
      { id: 'v1', reason: 'personal', label: 'My copy', at: Date.now() - 86_400_000, by: 'kenne', byName: 'Kenne', private: true, chunks: 1, size: 16_000 },
    ],
    []
  );
  const presence = [
    { key: 'ana_1', uid: 'ana', name: 'Ana Ruiz', color: '#D40055', site: 'a', mode: 'live' as const, at: Date.now(), focus: 'Caption' },
    { key: 'jordan_1', uid: 'jordan', name: 'Jordan Lee', color: '#fcc419', site: 'j', mode: 'draft' as const, at: Date.now(), focus: 'Footer' },
  ];
  const snap: SessionSnapshot<LabDoc> = {
    doc,
    connection: 'live',
    mode,
    pending: 0,
    draftCount: mode === 'draft' ? 3 : 0,
    presence,
    notices,
    activity: [
      { id: 'a1', at: Date.now() - 4000, uid: 'ana', name: 'Ana Ruiz', summary: 'Ana Ruiz edited Caption', groups: [] },
      { id: 'a2', at: Date.now() - 90_000, uid: 'jordan', name: 'Jordan Lee', summary: 'Jordan Lee added “Footer”, moved Sun', groups: [] },
    ],
    lastSyncedAt: Date.now() - 2000,
    canUndo: true,
    canRedo: false,
  };
  const session: any = {
    me: { key: 'kenne_1', uid: 'kenne', name: 'Kenne', color: '#00DAF3', site: 'k', mode, at: Date.now() },
    undo() {},
    redo() {},
    setMode,
    discardDraft: () => setMode('live'),
    draftConflicts: () => [{ path: ['caption'], label: 'Caption', byName: 'Ana', theirs: 'Join us Saturday for food and music!', mine: 'Join us Saturday for food, music and games.' }],
    publishDraft: async () => setMode('live'),
    keepMine: (id: string) => setNotices((n) => n.filter((x) => x.id !== id)),
    dismissNotice: (id: string) => setNotices((n) => n.filter((x) => x.id !== id)),
    deleteAnyway: (id: string) => setNotices((n) => n.filter((x) => x.id !== id)),
    listVersions: async () => versions,
    saveVersion: async () => versions[0],
    loadVersion: async () => START,
    compare: () => summarize(diff(doc, START, fromDoc(doc).meta, () => 'x'), START, doc),
    restore: async () => {},
    renameVersion: async () => {},
    deleteVersion: async () => {},
    describe: () => 'Front',
  };
  return {
    projectId: 'lab__flyer',
    project: shared
      ? { id: 'lab__flyer', kind: 'lab', localId: 'flyer', title: doc.title, ownerId: 'kenne', members: { kenne: 'owner', ana: 'editor', jordan: 'editor' }, memberIds: ['kenne', 'ana', 'jordan'], names: { kenne: 'Kenne', ana: 'Ana Ruiz', jordan: 'Jordan Lee' }, createdAt: 1, updatedAt: 1 }
      : null,
    role: shared ? 'owner' : null,
    isShared: shared,
    session: shared ? session : null,
    snap: shared ? snap : null,
    share: async () => (setShared(true), null as any),
    signedIn: true,
  };
}

const Lab: React.FC = () => {
  const net = useNetwork(3);
  const co = useFakeCo(net.states[0].doc);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    (window as any).coeditLab = net;
  });
  return (
    <div className="min-h-screen text-white" style={{ paddingRight: open ? 360 : 0 }}>
      <header ref={undefined} className="h-14 px-4 flex items-center gap-3 border-b border-white/10" style={{ background: 'linear-gradient(180deg,#140D20,#0E0A16)' }}>
        <div className="font-extrabold text-[.9rem]">Co-editing lab</div>
        <div data-testid="converged" className={`text-[.66rem] font-extrabold px-2 h-6 rounded-full flex items-center ${net.converged ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-300'}`}>
          {net.converged ? 'All devices match' : 'Syncing / offline differences'}
        </div>
        <div className="ml-auto">
          <CollabDock co={co} kind="lab" title={net.states[0].doc.title} pill="inline" top={56} open={open} onOpenChange={setOpen} />
        </div>
      </header>
      <main className="p-4 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {DEVICES.map((_, i) => (
          <DeviceEditor key={i} i={i} net={net} />
        ))}
      </main>
      <section className="px-4 pb-6">
        <div className="text-[.6rem] font-extrabold uppercase tracking-[.14em] text-white/40 mb-1">What happened</div>
        {net.feed.map((f, i) => (
          <div key={i} className="text-[.7rem] text-white/70">
            {f}
          </div>
        ))}
      </section>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<Lab />);

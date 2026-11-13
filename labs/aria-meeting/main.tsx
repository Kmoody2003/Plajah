// Aria meeting lab: the real Aria hook + panel writing to a real Tela doc model (applyTelaOp,
// story-backed Writer page), fed by a scripted meeting instead of microphones.
//   npx vite --config aria-meeting-lab.vite.config.mjs  ->  http://127.0.0.1:3251/
//   The clock runs 10× so Aria's 20 s pacing shows in ~2 s. "Cloud" uses a fake model that answers
//   in Gemini's JSON shape (exercises parse/guard); "Notes without AI" is the real rules lane.
//   window.lab: { doc, posts, editLine(old, new), say(name, text) }
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import type { TelaBlock, TelaDoc, TelaWriterDevice } from '../../types';
import { applyTelaOp, PRESETS, type TelaOp } from '../../components/tela/telaOps';
import { storyFromBlocks } from '../../services/text/document';
import { useAriaMeeting, type AriaNotesSink } from '../../hooks/useAriaMeeting';
import { AriaMeetingPanel } from '../../components/collab/AriaMeetingPanel';
import { EMPTY_NOTES, rulesStep, wakeRequest, type AriaLine, type AriaNotes } from '../../services/meetings/ariaMeetingCore';

const T0 = Date.now();
const fastNow = () => T0 + (Date.now() - T0) * 10;

const SCRIPT: [string, string][] = [
  ['Dana', 'Okay, thanks everyone for joining. This is about the fall food drive at Greater Grace.'],
  ['Marcus', 'We have about forty volunteers signed up so far, which is more than last year.'],
  ['Dana', 'Great. We decided to hold it on Saturday the 22nd in the fellowship hall.'],
  ['Keisha', 'Who is handling the truck from Gleaners this time?'],
  ['Marcus', 'I will call Gleaners on Monday and confirm the truck.'],
  ['Dana', 'Keisha, can you put together the volunteer shift sheet by Thursday?'],
  ['Keisha', 'Yes, I can do that.'],
  ['Dana', 'Aria, what have we decided so far?'],
  ['Marcus', 'We still need to figure out parking for the pickup line.'],
  ['Dana', "Let's go with the east lot for pickups and keep the main lot for seniors."],
];

/** A stand-in for Gemini: real rules output, wrapped as a model would answer (with a code fence). */
async function fakeModel(_lane: 'local' | 'cloud', user: string): Promise<string> {
  await new Promise(r => setTimeout(r, 400));
  const notes: AriaNotes = JSON.parse(user.match(/Current notes \(JSON\):\n(.*)/)?.[1] || 'null') || EMPTY_NOTES;
  const fresh = (user.split('New transcript:\n')[1] || '').split('\n\n')[0].split('\n')
    .map(l => l.match(/^\[[\d:]+\] ([^:]+): (.*)$/)).filter(Boolean)
    .map((m, i) => ({ uid: m![1], name: m![1], text: m![2], at: i }));
  const asks = [...user.matchAll(/^- ([^:]+): (.*)$/gm)].map(m => ({ by: m[1], request: m[2] }));
  const r = rulesStep(notes, fresh as AriaLine[], 0, []);
  const out = {
    ...r,
    summary: `The team is planning the fall food drive. ${r.decisions.length} decision(s) and ${r.actions.length} action item(s) so far.`,
    requests: [...notes.requests, ...asks.map(a => ({ ...a, response: `So far: ${r.decisions.join(' ') || 'nothing decided yet.'}` }))],
  };
  return '```json\n' + JSON.stringify(out) + '\n```';
}

function newDoc(): TelaDoc {
  const intro: TelaBlock[] = [{ id: 'b1', kind: 'h1', text: 'Fall food drive' }, { id: 'b2', kind: 'p', text: 'Planning doc.' }];
  const w: TelaWriterDevice = { id: 'dev_intro', type: 'WRITER', blocks: intro, story: storyFromBlocks(intro) };
  return {
    id: 'lab', title: 'Fall food drive', frames: [{ id: 'f1', kind: 'PAPER', preset: 'LETTER', x: 0, y: 0, w: PRESETS.LETTER.w, h: PRESETS.LETTER.h, deviceIds: [w.id], label: 'Page 1' }],
    devices: { [w.id]: w }, updatedAt: Date.now(),
  } as unknown as TelaDoc;
}

function Lab() {
  const [doc, setDoc] = useState<TelaDoc>(newDoc);
  const docRef = useRef(doc);
  const [posts, setPosts] = useState<string[]>([]);
  const [keepOut, setKeepOut] = useState(false);
  const dispatch = (op: TelaOp) => { docRef.current = applyTelaOp(docRef.current, op); setDoc(docRef.current); };

  const sink: AriaNotesSink = useMemo(() => ({
    title: 'Fall food drive',
    createPage: (blocks, label) => {
      const id = `dev_aria_${Math.random().toString(36).slice(2, 7)}`;
      const device: TelaWriterDevice = { id, type: 'WRITER', blocks, story: storyFromBlocks(blocks) };
      dispatch({ type: 'ADD_FRAME', frame: { id: `f_${id}`, kind: 'PAPER', preset: 'LETTER', x: 900, y: 0, w: 816, h: 1056, deviceIds: [id], label }, devices: [device] });
      return id;
    },
    readPage: id => { const d = docRef.current.devices[id]; return d?.type === 'WRITER' ? d.blocks : null; },
    writePage: (id, blocks) => dispatch({ type: 'SET_WRITER_BLOCKS', deviceId: id, blocks }),
    focusPage: id => document.getElementById(`page_${id}`)?.scrollIntoView({ behavior: 'smooth' }),
  }), []);

  const aria = useAriaMeeting({ sink, roomId: 'lab_room', callModel: fakeModel, postRecap: async (_r, t) => setPosts(p => [...p, t]), now: fastNow });
  const ariaRef = useRef(aria); ariaRef.current = aria;
  const say = (name: string, text: string) => { if (!keepOut || name !== 'Dana') ariaRef.current.feed({ uid: name, name, text, at: fastNow() }); };
  const [said, setSaid] = useState<string[]>([]);
  const play = async () => {
    for (const [n, t] of SCRIPT) {
      say(n, t); setSaid(s => [...s, `${n}: ${t}${wakeRequest(t) ? '  ← asks Aria' : ''}`]);
      await new Promise(r => setTimeout(r, 700));
    }
  };

  useEffect(() => {
    (window as any).lab = {
      get doc() { return docRef.current; }, get posts() { return posts; }, get aria() { return ariaRef.current; }, say,
      editLine: (oldText: string, newText: string) => {
        const d = Object.values(docRef.current.devices).find(x => x.type === 'WRITER' && x.blocks.some(b => b.text === oldText)) as TelaWriterDevice | undefined;
        if (!d) return false;
        dispatch({ type: 'SET_WRITER_BLOCKS', deviceId: d.id, blocks: d.blocks.map(b => (b.text === oldText ? { ...b, text: newText } : b)) });
        return true;
      },
    };
  });

  const writers = doc.frames.map(f => ({ f, d: doc.devices[f.deviceIds[0]] as TelaWriterDevice }));
  return (
    <div className="h-full flex gap-4 p-4 text-white overflow-hidden">
      <div className="w-[340px] shrink-0 flex flex-col gap-2 overflow-y-auto">
        <div className="text-sm font-extrabold">Call (simulated)</div>
        <AriaMeetingPanel aria={aria.active ? aria : null} remote={null} canBring onBring={l => aria.start(l)} onStop={() => void aria.stop()}
          keepMeOut={keepOut} onKeepMeOut={setKeepOut} localLane={{ available: false }} cloudHourUsd={0.29} />
        <button data-testid="play" onClick={() => void play()} disabled={!aria.active} className="h-8 rounded bg-white/10 hover:bg-white/20 text-xs font-bold disabled:opacity-40">Play scripted meeting</button>
        <div className="text-[11px] text-white/60 flex flex-col gap-1">{said.map((s, i) => <div key={i}>{s}</div>)}</div>
        {posts.map((p, i) => <pre key={i} data-testid="recap" className="text-[10px] whitespace-pre-wrap bg-white/5 rounded p-2">Team chat ← {p}</pre>)}
      </div>
      <div className="flex-1 overflow-y-auto flex flex-col gap-4">
        {writers.map(({ f, d }) => (
          <div key={f.id} id={`page_${d.id}`} data-testid={f.label} className="bg-white text-black rounded shadow p-8 max-w-[640px]">
            <div className="text-[10px] uppercase tracking-wider text-black/40 mb-2">{f.label}</div>
            {d.blocks.map(b => b.kind === 'h1' ? <h1 key={b.id} className="text-xl font-bold mb-1">{b.text}</h1>
              : b.kind === 'h2' ? <h2 key={b.id} className="text-sm font-bold mt-3 mb-1">{b.text}</h2>
              : b.kind === 'li' ? <li key={b.id} className="text-sm ml-4">{b.text}</li>
              : <p key={b.id} className="text-sm mb-1">{b.text}</p>)}
          </div>
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Lab />);

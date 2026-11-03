/**
 * CreatureRoom.tsx — the finished model, alive. What it understood, how it was built, and how it behaves.
 * Reactions are on by default: it watches the pointer, gets nervous around fast movement, and recoils when poked.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Download, Sparkles } from 'lucide-react';
import type { CodexEntry } from '../../services/argilla/creature/codex';
import type { CreatureModel } from '../../services/argilla/creature/finish';
import { CreatureStage, StageStats } from '../../services/argilla/creature/stage';
import { creatureToGlb } from '../../services/argilla/creature/exportCreature';
import type { ClipName } from '../../services/argilla/creature/motion';

const CLIP_LABELS: Record<ClipName, string> = { idle: 'Stand', walk: 'Walk', run: 'Run', signature: 'Signature' };
const SIGNATURE: Record<string, string> = { howl: 'Howl', lunge: 'Lunge', lurch: 'Lurch', hiss: 'Hiss', roar: 'Roar', rear: 'Rear up', bow: 'Bow' };

export interface CreatureRoomProps {
  model: CreatureModel;
  entry: CodexEntry;
  lineageId: string | null;
  title: string;
  onBack: () => void;
  onStage?: (stage: CreatureStage) => void;
}

export default function CreatureRoom({ model, entry, lineageId, title, onBack, onStage }: CreatureRoomProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<CreatureStage | null>(null);
  const [clip, setClip] = useState<ClipName>('idle');
  const [reactive, setReactive] = useState(true);
  const [stats, setStats] = useState<StageStats | null>(null);
  const [saving, setSaving] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stage = new CreatureStage(canvas);
    stage.onStats = setStats;
    stage.show(model, entry.motion, entry.surface);
    stageRef.current = stage;
    onStage?.(stage);
    return () => { stage.dispose(); stageRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, entry]);

  useEffect(() => { if (stageRef.current) stageRef.current.clip = clip; }, [clip]);
  useEffect(() => { if (stageRef.current) stageRef.current.reactive = reactive; }, [reactive]);

  const save = async () => {
    setSaving('Packing the model…');
    try {
      const glb = await creatureToGlb(model, entry.motion, title.replace(/[^\w\- ]+/g, '').trim() || 'creature');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(glb);
      link.download = `${title.replace(/[^\w\- ]+/g, '').trim() || 'creature'}.glb`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 30_000);
      setSaving(`${(glb.size / 1048576).toFixed(0)} MB, rigged, with four clips and muscle`);
    } catch (error) {
      setSaving(error instanceof Error ? error.message : 'Could not export this model.');
    }
  };

  const lineage = entry.lineages?.find((l) => l.id === lineageId);
  return (
    <div className="absolute inset-0 z-10 bg-[#0d0c11] flex" data-testid="creature-room">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none" style={{ cursor: reactive ? 'grab' : 'default' }} />
      <button onClick={onBack} className="absolute top-3 left-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 text-xs font-semibold hover:bg-black/80"><ArrowLeft size={14}/>Back to clay</button>
      <aside className="absolute top-3 right-3 w-64 max-h-[calc(100%-24px)] overflow-y-auto p-3 rounded-xl bg-black/65 backdrop-blur text-xs flex flex-col gap-2.5">
        <div>
          <div className="text-sm font-bold">{entry.name}{lineage ? ` · ${lineage.label}` : ''}</div>
          <p className="text-white/65 mt-0.5 leading-snug">{lineage?.note ?? entry.understood}</p>
          {lineage && <p className="text-white/40 mt-0.5">Direction from {lineage.source}</p>}
        </div>
        <div className="flex flex-wrap gap-1">
          {(Object.keys(CLIP_LABELS) as ClipName[]).map((c) => (
            <button key={c} aria-pressed={clip === c} onClick={() => setClip(c)} className={`px-2.5 py-1 rounded-md font-semibold ${clip === c ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20'}`}>
              {c === 'signature' ? SIGNATURE[entry.motion.signature] : CLIP_LABELS[c]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={reactive} onChange={(e) => setReactive(e.target.checked)}/>Reacts to you</label>
        <p className="text-white/45 leading-snug">{reactive ? 'It follows your pointer, tenses when you move fast, and recoils when you click it.' : 'Holding its own pose.'}</p>
        <button onClick={save} className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-bold bg-gradient-to-br from-[#6B0099] to-[#D40055]"><Download size={13}/>Export GLB</button>
        {!!saving && <p role="status" className="text-white/60">{saving}</p>}
        <p className="text-white/35 leading-snug">{model.stats.triangles.toLocaleString()} triangles · {model.anatomy.bones.length} bones · {model.muscles.length} muscles{stats ? ` · ${Math.round(1000 / Math.max(stats.frameMs, 1))} fps · ${stats.shells} fur layers` : ''}</p>
      </aside>
      <span className="absolute bottom-3 left-3 flex items-center gap-1 text-[11px] text-white/40"><Sparkles size={11}/>Drag to turn · wheel to zoom · click to poke</span>
    </div>
  );
}

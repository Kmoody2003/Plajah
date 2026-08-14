// The dedicated Mixer page (approved mockup 06): every pad, bus and arrangement track as a
// channel strip, console order left→right — pads → buses A–D → tracks → Master. The biggest
// matte slab in the room; faders are things you turn.

import React from 'react';
import type { GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { GROUP_NAMES } from '../../../../services/melos/beats/grooveDoc';
import { ChannelStrip } from '../shared/ChannelStrip';
import { GROUP_COLORS, PLAYHEAD, slabPanel } from '../theme';

const GROUP_LABELS = ['Bus A', 'Bus B', 'Bus C', 'Bus D'];

interface MixerViewProps {
  doc: GrooveDoc;
  meters: { groups: number[]; master: number };
  limiterReduction: number;
  selectedPad: number;
  onSelectPad: (i: number) => void;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
}

export const MixerView: React.FC<MixerViewProps> = ({ doc, meters, limiterReduction, selectedPad, onSelectPad, onMutate }) => (
  <div className="flex-1 min-h-0 overflow-auto p-4">
    <div className={`${slabPanel} p-4 inline-flex gap-2 items-stretch min-w-full`}>

      <div className="flex gap-1.5">
        {doc.kit.map((pad, i) => (
          <div key={pad.id} onPointerDown={() => onSelectPad(i)} className="rounded-[10px]" style={i === selectedPad ? { outline: '1px solid #D40055', outlineOffset: 1 } : undefined}>
            <ChannelStrip
              label={pad.name}
              color={pad.color !== '#F5F0FA' ? pad.color : undefined}
              routeTag={GROUP_NAMES[pad.group]}
              gainDb={pad.gainDb}
              pan={pad.pan}
              mute={!!pad.mute}
              meter={0}
              onGain={(db) => onMutate((d) => { const p = d.kit[i]; if (p) p.gainDb = db; })}
              onPan={(v) => onMutate((d) => { const p = d.kit[i]; if (p) p.pan = v; })}
              onMute={() => onMutate((d) => { const p = d.kit[i]; if (p) p.mute = !p.mute; })}
            />
          </div>
        ))}
      </div>

      <div className="w-px bg-white/[0.16] flex-none" />

      <div className="flex gap-1.5">
        {doc.mixer.groups.map((g, i) => (
          <ChannelStrip
            key={GROUP_LABELS[i]}
            label={GROUP_LABELS[i]}
            color={GROUP_COLORS[i]}
            gainDb={g.gainDb}
            mute={g.mute}
            solo={g.solo}
            meter={meters.groups[i] || 0}
            meterColor={GROUP_COLORS[i]}
            onGain={(db) => onMutate((d) => { d.mixer.groups[i].gainDb = db; })}
            onMute={() => onMutate((d) => { d.mixer.groups[i].mute = !d.mixer.groups[i].mute; })}
            onSolo={() => onMutate((d) => { d.mixer.groups[i].solo = !d.mixer.groups[i].solo; })}
          />
        ))}
      </div>

      {doc.arrangement.length > 0 && <div className="w-px bg-white/[0.16] flex-none" />}

      <div className="flex gap-1.5">
        {doc.arrangement.map((t) => (
          <ChannelStrip
            key={t.id}
            label={t.name}
            color={t.kind === 'audio' ? PLAYHEAD : '#B84DFF'}
            gainDb={t.gainDb}
            pan={t.pan}
            mute={t.mute}
            solo={t.solo}
            meter={0}
            dimmed={!!t.foreign}
            onGain={t.foreign ? undefined : (db) => onMutate((d) => { const x = d.arrangement.find((a) => a.id === t.id); if (x) x.gainDb = db; })}
            onPan={t.foreign ? undefined : (v) => onMutate((d) => { const x = d.arrangement.find((a) => a.id === t.id); if (x) x.pan = v; })}
            onMute={t.foreign ? undefined : () => onMutate((d) => { const x = d.arrangement.find((a) => a.id === t.id); if (x) x.mute = !x.mute; })}
            onSolo={t.foreign ? undefined : () => onMutate((d) => { const x = d.arrangement.find((a) => a.id === t.id); if (x) x.solo = !x.solo; })}
          />
        ))}
      </div>

      <div className="w-px bg-white/[0.16] flex-none" />

      <ChannelStrip
        label="MASTER"
        wide
        gainDb={doc.mixer.master.gainDb}
        meter={meters.master}
        onGain={(db) => onMutate((d) => { d.mixer.master.gainDb = db; })}
      >
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={() => onMutate((d) => { d.mixer.master.limiterOn = !d.mixer.master.limiterOn; })}
            className="text-[8.5px] font-semibold rounded-[4px] px-1.5 py-0.5 border"
            style={doc.mixer.master.limiterOn
              ? { color: '#06D6A0', borderColor: 'rgba(6,214,160,0.4)' }
              : { color: 'rgba(255,255,255,0.3)', borderColor: 'rgba(255,255,255,0.15)' }}
          >LIMITER</button>
          <span className="font-mono text-[8.5px] text-white/40">GR {limiterReduction.toFixed(1)} dB</span>
        </div>
      </ChannelStrip>
    </div>
  </div>
);

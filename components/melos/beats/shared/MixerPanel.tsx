// The compact mixer dock under the Timeline (approved mockup 05) — the same ChannelStrip unit
// as the Mixer page at dock density, and the SAME channel list in the SAME order: every pad,
// every (non-pad-backed) arrangement track, buses A–D, send returns, Master. The dock used to
// skip the pads and double-count pad instruments, so its channel count never matched the
// Mixer page or the other song views.

import React from 'react';
import type { GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { ChannelStrip } from './ChannelStrip';
import { GROUP_COLORS, PLAYHEAD } from '../theme';

interface MixerPanelProps {
  doc: GrooveDoc;
  meters: { groups: number[]; master: number; sends: number[] };
  onMutate: (fn: (d: GrooveDoc) => void) => void;
}

export const MixerPanel: React.FC<MixerPanelProps> = ({ doc, meters, onMutate }) => {
  const eng = BeatsEngine.get();
  return (
    <div className="flex gap-1.5 overflow-x-auto px-3 py-2.5 bg-[#0E0E12] border-t border-white/[0.14]">
      {doc.kit.map((pad, i) => pad.empty ? null : (
        <ChannelStrip
          key={pad.id}
          compact
          label={pad.name}
          color={pad.color}
          gainDb={pad.gainDb}
          mute={!!pad.mute}
          solo={false}
          meter={eng.padMeter(i)}
          meterColor={pad.color}
          onGain={(db) => onMutate((d) => { const x = d.kit[i]; if (x) x.gainDb = db; })}
          onMute={() => onMutate((d) => { const x = d.kit[i]; if (x) x.mute = !x.mute; })}
        />
      ))}
      {doc.kit.some((p) => !p.empty) && <div className="w-px bg-white/[0.14] flex-none" />}
      {doc.arrangement.filter((t) => !t.padOwned).map((t) => (
        <ChannelStrip
          key={t.id}
          compact
          label={t.name}
          color={t.kind === 'audio' ? PLAYHEAD : t.color || '#B84DFF'}
          gainDb={t.gainDb}
          mute={t.mute}
          solo={t.solo}
          meter={t.kind === 'audio' ? eng.trackMeter(t.id) : 0}
          dimmed={!!t.foreign}
          onGain={t.foreign ? undefined : (db) => onMutate((d) => { const x = d.arrangement.find((a) => a.id === t.id); if (x) x.gainDb = db; })}
          onMute={t.foreign ? undefined : () => onMutate((d) => { const x = d.arrangement.find((a) => a.id === t.id); if (x) x.mute = !x.mute; })}
          onSolo={t.foreign ? undefined : () => onMutate((d) => { const x = d.arrangement.find((a) => a.id === t.id); if (x) x.solo = !x.solo; })}
        />
      ))}
      {doc.arrangement.some((t) => !t.padOwned) && <div className="w-px bg-white/[0.14] flex-none" />}
      {doc.mixer.groups.map((g, i) => (
        <ChannelStrip
          key={`bus-${i}`}
          compact
          label={`Bus ${'ABCD'[i]}`}
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
      {(doc.mixer.sendBuses ?? [{ name: 'FX 1', gainDb: 0 }, { name: 'FX 2', gainDb: 0 }]).slice(0, 2).map((s, i) => (
        <ChannelStrip
          key={`send-${i}`}
          compact
          label={s.name || `FX ${i + 1}`}
          color="#06D6A0"
          gainDb={s.gainDb}
          mute={false}
          solo={false}
          meter={meters.sends[i] || 0}
          meterColor="#06D6A0"
          onGain={(db) => onMutate((d) => {
            if (!d.mixer.sendBuses) d.mixer.sendBuses = [{ name: 'FX 1', gainDb: 0 }, { name: 'FX 2', gainDb: 0 }];
            if (d.mixer.sendBuses[i]) d.mixer.sendBuses[i].gainDb = db;
          })}
        />
      ))}
      <ChannelStrip
        compact
        wide
        label="MASTER"
        gainDb={doc.mixer.master.gainDb}
        meter={meters.master}
        onGain={(db) => onMutate((d) => { d.mixer.master.gainDb = db; })}
      />
    </div>
  );
};

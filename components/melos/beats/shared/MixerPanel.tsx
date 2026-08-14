// The compact mixer dock under the Timeline (approved mockup 05) — the same ChannelStrip unit
// as the Mixer page at dock density: arrangement tracks, buses A–D, Master.

import React from 'react';
import type { GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { ChannelStrip } from './ChannelStrip';
import { GROUP_COLORS, PLAYHEAD } from '../theme';

interface MixerPanelProps {
  doc: GrooveDoc;
  meters: { groups: number[]; master: number };
  onMutate: (fn: (d: GrooveDoc) => void) => void;
}

export const MixerPanel: React.FC<MixerPanelProps> = ({ doc, meters, onMutate }) => (
  <div className="flex gap-1.5 overflow-x-auto px-3 py-2.5 bg-[#0E0E12] border-t border-white/[0.14]">
    {doc.arrangement.map((t) => (
      <ChannelStrip
        key={t.id}
        compact
        label={t.name}
        color={t.kind === 'audio' ? PLAYHEAD : '#B84DFF'}
        gainDb={t.gainDb}
        mute={t.mute}
        solo={t.solo}
        meter={0}
        dimmed={!!t.foreign}
        onGain={t.foreign ? undefined : (db) => onMutate((d) => { const x = d.arrangement.find((a) => a.id === t.id); if (x) x.gainDb = db; })}
        onMute={t.foreign ? undefined : () => onMutate((d) => { const x = d.arrangement.find((a) => a.id === t.id); if (x) x.mute = !x.mute; })}
        onSolo={t.foreign ? undefined : () => onMutate((d) => { const x = d.arrangement.find((a) => a.id === t.id); if (x) x.solo = !x.solo; })}
      />
    ))}
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

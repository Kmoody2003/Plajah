// Smart lights inside the console: connection state per platform, rooms as selectable groups, and
// per-light control that goes through the programmer, so a smart light records into cues like any
// other fixture.

import React, { useMemo } from 'react';
import { Power, Wifi } from 'lucide-react';
import { boardEngine, useBoard } from '../../services/lighting/boardEngine';
import { BrandMark } from './SmartArt';
import { hexToRgb, rgbToHex } from '../../services/lighting/boardCore';
import { useLightingService, type LightPlatform } from '../../services/smartLightingService';

const PLATFORMS: { id: LightPlatform }[] = [{ id: 'hue' }, { id: 'govee' }, { id: 'nanoleaf' }, { id: 'razer' }];

export function SmartTab({ onConnect }: { onConnect?: () => void }) {
  const board = useBoard();
  const smart = useLightingService();
  const fixtures = useMemo(() => board.show.fixtures.filter((f) => f.smartId), [board.show.fixtures]);
  const idOf = (lightId: string) => fixtures.find((f) => f.smartId === lightId)?.id;

  return (
    <div className="p-3 space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {PLATFORMS.map((p) => (
          <span key={p.id} className={`px-2 py-1 rounded text-xs ${smart.connected[p.id] ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/[0.06] text-white/50'}`}>
            <BrandMark platform={p.id} size={14} />{smart.connected[p.id] ? ` · ${smart.lights.filter((l) => l.platform === p.id).length}` : ''}
          </span>
        ))}
        {onConnect && <button onClick={onConnect} className="ml-auto px-2.5 py-1.5 rounded bg-white/10 hover:bg-white/[0.16] text-xs font-medium inline-flex items-center gap-1"><Wifi size={12} /> Connect lights</button>}
      </div>

      {smart.rooms.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold mb-1.5">Rooms</h3>
          <div className="flex flex-wrap gap-1">
            {smart.rooms.map((r) => {
              const ids = r.lightIds.map(idOf).filter(Boolean) as string[];
              return <button key={r.id} disabled={!ids.length} onClick={() => boardEngine.setSelection(ids)} className="px-2.5 py-1.5 rounded bg-white/10 hover:bg-white/[0.16] text-xs disabled:opacity-40">{r.name}</button>;
            })}
          </div>
        </section>
      )}

      {smart.lights.length === 0 ? (
        <p className="text-sm text-white/50">No smart lights connected yet. Once they are, they sit in the fixture grid and take looks, cues and effects alongside your DMX rig.</p>
      ) : (
        <ul className="grid gap-1.5 md:grid-cols-2">
          {smart.lights.map((light) => {
            const id = idOf(light.id);
            const levels = id ? board.programmer[id] ?? board.liveLook[id] : undefined;
            const dim = levels?.dimmer ?? light.brightness / 100;
            const hex = levels?.red != null ? rgbToHex({ r: levels.red, g: levels.green ?? 0, b: levels.blue ?? 0 }) : rgbToHex({ r: light.color[0] / 255, g: light.color[1] / 255, b: light.color[2] / 255 });
            return (
              <li key={light.id} className="flex items-center gap-2 p-2 rounded bg-white/[0.04]">
                <button aria-label={`Toggle ${light.name}`} disabled={!id} onClick={() => id && boardEngine.toggleFixture(id)} className="p-1.5 rounded hover:bg-white/10"><Power size={13} style={{ color: dim > 0 ? hex : undefined }} /></button>
                <span className="flex-1 min-w-0">
                  <span className="block text-xs truncate">{light.name}</span>
                  <span className="block text-[10px] text-white/50"><BrandMark platform={light.platform} size={11} /></span>
                </span>
                <input type="range" min={0} max={100} aria-label={`${light.name} brightness`} value={Math.round(dim * 100)} disabled={!id} onChange={(e) => id && boardEngine.setFixtureLevels(id, { dimmer: Number(e.target.value) / 100 })} className="w-20 accent-[#FF8C00]" />
                <input type="color" aria-label={`${light.name} colour`} value={hex} disabled={!id} onChange={(e) => { const c = hexToRgb(e.target.value); if (id) boardEngine.setFixtureLevels(id, { red: c.r, green: c.g, blue: c.b, dimmer: dim || 1 }); }} className="w-7 h-6 bg-transparent cursor-pointer" />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

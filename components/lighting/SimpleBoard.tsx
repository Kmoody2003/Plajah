// Simple mode: no channels, no universes. Pick a look, set the brightness, let it follow the music.
// Adding stage lights asks what you have and how many, then tells you what to set on each unit.

import React, { useMemo, useState } from 'react';
import { ArrowRight, Check, Minus, Music, Plus, Power, Sliders, Wifi, X, Zap } from 'lucide-react';
import { boardEngine, useBoard } from '../../services/lighting/boardEngine';
import { SCENE_RECIPES, dipSwitches, displayAddress, previewColor, profileOf, type PatchedFixture } from '../../services/lighting/boardCore';
import { BUILTIN_PROFILES, type FixtureProfile } from '../../services/lighting/fixtureProfiles';
import { OutputSetup } from './OutputSetup';
import { LooksGallery } from './LooksGallery';

export const DipRow: React.FC<{ address: number }> = ({ address }) => (
  <div className="flex gap-0.5" aria-label={`DIP switches for address ${address}`}>
    {dipSwitches(address).map((on, i) => (
      <div key={i} className="flex flex-col items-center gap-0.5">
        <div className="w-3 h-5 rounded-[2px] bg-black border border-white/20 relative">
          <div className={`absolute left-px right-px h-2 rounded-[1px] ${on ? 'top-px bg-[#FF8C00]' : 'bottom-px bg-white/40'}`} />
        </div>
        <span className="text-[9px] text-white/40 tabular-nums">{i + 1}</span>
      </div>
    ))}
  </div>
);

function LightTile({ fixture, onTap }: { fixture: PatchedFixture; onTap: () => void }) {
  const board = useBoard();
  const profile = profileOf(fixture, board.show.customProfiles);
  const { css, on } = previewColor(board.liveLook[fixture.id], profile);
  return (
    <button onClick={onTap} title={fixture.name} className="flex flex-col items-center gap-1.5 w-[4.5rem] shrink-0 p-1.5 rounded-lg hover:bg-white/[0.06]">
      <span className="w-9 h-9 rounded-full border border-white/15 transition-[background,box-shadow] duration-100"
        style={{ background: on > 0.01 ? css : '#17151c', opacity: on > 0.01 ? 0.25 + on * 0.75 : 1, boxShadow: on > 0.05 ? `0 0 ${10 + on * 18}px ${css}` : 'none' }} />
      <span className="text-[11px] leading-tight text-white/60 truncate w-full text-center">{fixture.name}</span>
    </button>
  );
}

const SHORT_NAME: Record<string, string> = { dimmer: 'Dimmer', par: 'Par', bar: 'LED bar', spot: 'Spot', wash: 'Wash', strobe: 'Strobe', fog: 'Fog' };

function ConnectOnly({ onClose }: { onClose: () => void }) {
  return (
    <div role="dialog" aria-label="Connect stage lights" className="absolute inset-0 z-30 bg-[#08070b] flex flex-col">
      <div className="flex items-center justify-between h-12 px-4 border-b border-white/10 shrink-0">
        <h2 className="text-sm font-semibold">Connect stage lights</h2>
        <button aria-label="Close" onClick={onClose} className="p-2 -mr-2 rounded-lg hover:bg-white/10"><X size={18} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 max-w-2xl w-full mx-auto space-y-4">
        <p className="text-sm text-white/70">Plug your DMX interface into this computer, then choose it.</p>
        <OutputSetup compact />
        <button onClick={onClose} className="w-full py-3 rounded-lg bg-white text-black font-semibold text-sm">Done</button>
      </div>
    </div>
  );
}

function AddStageLights({ onClose }: { onClose: () => void }) {
  const choices = useMemo(() => BUILTIN_PROFILES.filter((p) => p.friendly), []);
  const [profile, setProfile] = useState<FixtureProfile | null>(null);
  const [count, setCount] = useState(4);
  const [added, setAdded] = useState<PatchedFixture[] | null>(null);
  const board = useBoard();

  const add = () => {
    if (!profile) return;
    const before = new Set(board.show.fixtures.map((f) => f.id));
    boardEngine.addFixtures(profile, count, SHORT_NAME[profile.category]);
    setAdded(boardEngine.show.fixtures.filter((f) => !before.has(f.id)));
  };

  return (
    <div role="dialog" aria-label="Add stage lights" className="absolute inset-0 z-30 bg-[#08070b] flex flex-col">
      <div className="flex items-center justify-between h-12 px-4 border-b border-white/10 shrink-0">
        <h2 className="text-sm font-semibold">{added ? 'Set up each light' : 'Add stage lights'}</h2>
        <button aria-label="Close" onClick={onClose} className="p-2 -mr-2 rounded-lg hover:bg-white/10"><X size={18} /></button>
      </div>

      {!added ? (
        <div className="flex-1 overflow-y-auto p-4 max-w-2xl w-full mx-auto space-y-5">
          <div>
            <p className="text-sm text-white/70 mb-2.5">What kind of light is it? Its manual lists how many channels it uses.</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {choices.map((p) => (
                <button key={p.id} onClick={() => setProfile(p)} aria-pressed={profile?.id === p.id}
                  className={`flex items-center gap-2 px-3 py-3 rounded-lg border text-sm text-left ${profile?.id === p.id ? 'border-[#FF8C00] bg-[#FF8C00]/10' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'}`}>
                  <span className="flex-1">{p.friendly}</span>
                  {profile?.id === p.id && <Check size={15} className="text-[#FF8C00]" />}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-white/70">How many?</span>
            <button aria-label="Fewer" onClick={() => setCount((c) => Math.max(1, c - 1))} className="p-2.5 rounded-lg bg-white/10 hover:bg-white/15"><Minus size={15} /></button>
            <span className="w-8 text-center text-lg font-semibold tabular-nums">{count}</span>
            <button aria-label="More" onClick={() => setCount((c) => Math.min(99, c + 1))} className="p-2.5 rounded-lg bg-white/10 hover:bg-white/15"><Plus size={15} /></button>
          </div>
          <button disabled={!profile} onClick={add} className="w-full py-3 rounded-lg bg-[#FF8C00] text-black font-semibold text-sm disabled:opacity-30">Add {count} light{count > 1 ? 's' : ''}</button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 max-w-2xl w-full mx-auto space-y-5">
          <p className="text-sm text-white/70">Plajah chose an address for each light so none of them clash. Set it on the unit using its menu or the switches on the back, and chain them with DMX cables in any order.</p>
          <ul className="space-y-1.5">
            {added.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3 rounded-lg bg-white/[0.05]">
                <span className="text-sm font-medium flex-1 min-w-[8rem]">{f.name}</span>
                <span className="font-mono text-lg font-semibold text-[#FF8C00]">{displayAddress(f.address!)}</span>
                <DipRow address={f.address!} />
                <button onClick={() => boardEngine.identify(f.id)} className="px-2.5 py-1.5 rounded-md bg-white/10 hover:bg-white/15 text-xs">Test</button>
              </li>
            ))}
          </ul>
          <div>
            <h3 className="text-sm font-semibold mb-2">Connect to this computer</h3>
            <OutputSetup compact />
          </div>
          <button onClick={onClose} className="w-full py-3 rounded-lg bg-white text-black font-semibold text-sm">Done</button>
        </div>
      )}
    </div>
  );
}

export function SimpleBoard({ onConnectSmart, nowPlaying, onOpenPro }: { onConnectSmart?: () => void; nowPlaying?: string; onOpenPro: () => void }) {
  const board = useBoard();
  const [adding, setAdding] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const fixtures = board.show.fixtures;
  const empty = fixtures.length === 0;

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-4 space-y-6">
        {empty ? (
          <section className="py-8 text-center">
            <h2 className="text-xl font-semibold">Let's add your lights</h2>
            <p className="text-sm text-white/60 mt-1.5 mb-6">Bulbs at home, or a full rig on stage. You can use both together.</p>
            <div className="grid gap-3 sm:grid-cols-2 text-left">
              {onConnectSmart && (
                <button onClick={onConnectSmart} className="p-4 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08]">
                  <Wifi size={20} className="text-[#FF8C00] mb-2.5" />
                  <span className="block text-sm font-semibold">Smart lights</span>
                  <span className="block text-xs text-white/50 mt-0.5">Hue, Govee, Nanoleaf, Razer</span>
                </button>
              )}
              <button onClick={() => setAdding(true)} className="p-4 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08]">
                <Zap size={20} className="text-[#FF8C00] mb-2.5" />
                <span className="block text-sm font-semibold">Stage lights</span>
                <span className="block text-xs text-white/50 mt-0.5">Pars, bars, moving heads and other DMX gear</span>
              </button>
            </div>
          </section>
        ) : (
          <>
            <section aria-label="Your lights">
              <div className="flex gap-1 overflow-x-auto pb-1 -mx-1">
                {fixtures.map((f) => <LightTile key={f.id} fixture={f} onTap={() => boardEngine.toggleFixture(f.id)} />)}
              </div>
            </section>

            <section aria-label="Scenes">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {SCENE_RECIPES.map((r) => {
                  const active = board.activeSceneId === r.id && !board.followMusic && !board.blackout;
                  return (
                    <button key={r.id} onClick={() => boardEngine.playRecipe(r.id)} aria-pressed={active}
                      className={`relative h-20 rounded-xl p-3 text-left overflow-hidden border-2 transition-colors ${active ? 'border-white' : 'border-transparent hover:border-white/30'}`}
                      style={{ background: `linear-gradient(135deg, ${r.color}, ${r.color}55)` }}>
                      <span className="absolute left-3 bottom-2.5 text-sm font-semibold text-white [text-shadow:0_1px_3px_rgb(0_0_0/.7)]">{r.name}</span>
                    </button>
                  );
                })}
                <button onClick={() => boardEngine.setBlackout(!board.blackout)} aria-pressed={board.blackout}
                  className={`h-20 rounded-xl p-3 text-left border-2 flex flex-col justify-between ${board.blackout ? 'border-white bg-black' : 'border-white/10 bg-black hover:border-white/30'}`}>
                  <Power size={16} className="text-white/70" />
                  <span className="text-sm font-semibold">{board.blackout ? 'Lights off' : 'All off'}</span>
                </button>
              </div>
            </section>

            <button onClick={() => setBrowsing(true)} className="w-full py-2.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] text-sm font-medium">Browse all looks</button>

            <section className="space-y-4">
              <label className="block">
                <span className="flex justify-between text-sm mb-2"><span>Brightness</span><span className="text-white/60 tabular-nums">{Math.round(board.grandMaster * 100)}%</span></span>
                <input type="range" min={0} max={100} value={Math.round(board.grandMaster * 100)} onChange={(e) => boardEngine.setGrandMaster(Number(e.target.value) / 100)} className="w-full h-2 accent-[#FF8C00] cursor-pointer" />
              </label>
              <button onClick={() => boardEngine.setFollowMusic(!board.followMusic)} aria-pressed={board.followMusic}
                className={`w-full flex items-center gap-3 p-3.5 rounded-xl border text-left ${board.followMusic ? 'border-[#FF8C00] bg-[#FF8C00]/10' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'}`}>
                <Music size={18} className={board.followMusic ? 'text-[#FF8C00]' : 'text-white/60'} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold">Follow the music</span>
                  <span className="block text-xs text-white/50 truncate">{nowPlaying ? `Now playing: ${nowPlaying}` : 'Moves with whatever is playing in Plajah'}</span>
                </span>
                <span className="text-xs font-semibold text-white/70">{board.followMusic ? 'On' : 'Off'}</span>
              </button>
            </section>

            <section className="flex flex-wrap gap-2">
              <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.07] hover:bg-white/[0.12] text-xs font-medium"><Plus size={14} /> Stage lights</button>
              {onConnectSmart && <button onClick={onConnectSmart} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.07] hover:bg-white/[0.12] text-xs font-medium"><Wifi size={14} /> Smart lights</button>}
              {fixtures.some((f) => !f.smartId) && !board.outputs.some((o) => o.status === 'live') && (
                <button onClick={() => setConnecting(true)} className="px-3 py-2 rounded-lg bg-amber-500/15 text-amber-200 text-xs font-medium">Stage lights aren't connected yet</button>
              )}
              <button onClick={onOpenPro} className="flex items-center gap-1.5 px-3 py-2 ml-auto rounded-lg text-white/60 hover:text-white text-xs font-medium"><Sliders size={14} /> Full console <ArrowRight size={13} /></button>
            </section>
          </>
        )}
      </div>
      {adding && <AddStageLights onClose={() => setAdding(false)} />}
      {connecting && <ConnectOnly onClose={() => setConnecting(false)} />}
      {browsing && (
        <div role="dialog" aria-label="All looks" className="absolute inset-0 z-30 bg-[#08070b] flex flex-col">
          <div className="flex items-center justify-between h-12 px-4 border-b border-white/10 shrink-0">
            <h2 className="text-sm font-semibold">All looks</h2>
            <button aria-label="Close" onClick={() => setBrowsing(false)} className="p-2 -mr-2 rounded-lg hover:bg-white/10"><X size={18} /></button>
          </div>
          <div className="flex-1 overflow-y-auto"><LooksGallery /></div>
        </div>
      )}
    </div>
  );
}

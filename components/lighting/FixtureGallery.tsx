// The Fixture Gallery: real fixtures, what they are, and one click to patch them.

import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Plus, Search, X } from 'lucide-react';
import { boardEngine } from '../../services/lighting/boardEngine';
import { FORM_LABEL, loadFixtureCatalog, searchCatalog, type CatalogFixture, type FixtureForm } from '../../services/lighting/fixtureCatalog';
import { FixtureArt } from './FixtureArt';
import { BrandMark, SmartArt } from './SmartArt';
import { SMART_BRANDS, searchSmartModels, type SmartModel } from '../../services/lighting/smartCatalog';
import { useLightingService, type LightPlatform } from '../../services/smartLightingService';

const FORMS = Object.keys(FORM_LABEL) as FixtureForm[];

const specRows = (f: CatalogFixture): [string, string][] => {
  const s = f.spec;
  const rows: [string, string | undefined][] = [
    ['Light source', s.source],
    ['Power', s.powerW ? `${s.powerW} W` : undefined],
    ['Output', s.lumens ? `${s.lumens.toLocaleString()} lm` : undefined],
    ['Colour temp', s.colorTempK ? `${s.colorTempK.toLocaleString()} K` : undefined],
    ['Beam angle', s.beamDeg ? (s.beamDeg[0] === s.beamDeg[1] ? `${s.beamDeg[0]}°` : `${s.beamDeg[0]}°–${s.beamDeg[1]}°`) : undefined],
    ['Weight', s.weightKg ? `${s.weightKg} kg` : undefined],
    ['Size', s.dimensionsMm ? `${s.dimensionsMm.join(' × ')} mm` : undefined],
    ['DMX connector', s.dmxConnector],
    ['RDM', s.rdm ? 'Yes' : undefined],
  ];
  return rows.filter((r): r is [string, string] => !!r[1]);
};

function Detail({ fixture, onClose }: { fixture: CatalogFixture; onClose: () => void }) {
  const [modeId, setModeId] = useState(fixture.profiles[0].id);
  const [count, setCount] = useState(1);
  const [added, setAdded] = useState('');
  const profile = fixture.profiles.find((p) => p.id === modeId) ?? fixture.profiles[0];
  const rows = specRows(fixture);

  return (
    <div role="dialog" aria-label={fixture.name} className="absolute inset-0 z-20 bg-[#08070b] overflow-y-auto">
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-white/50">{fixture.manufacturer} · {FORM_LABEL[fixture.form]}</p>
            <h3 className="text-lg font-semibold">{fixture.name}</h3>
          </div>
          <button aria-label="Close" onClick={onClose} className="p-2 rounded-lg hover:bg-white/10"><X size={18} /></button>
        </div>
        <div className="grid gap-4 sm:grid-cols-[11rem_1fr]">
          <div className="rounded-xl bg-white/[0.04] p-4"><FixtureArt form={fixture.form} /></div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm content-start">
            {rows.map(([k, v]) => (
              <React.Fragment key={k}><dt className="text-white/50">{k}</dt><dd>{v}</dd></React.Fragment>
            ))}
            {!rows.length && <dd className="col-span-2 text-white/50">The library lists no physical specs for this one.</dd>}
          </dl>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          {fixture.productPage && <a href={fixture.productPage} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#FFB266] hover:underline">Product page and photos <ExternalLink size={12} /></a>}
          {fixture.manual && <a href={fixture.manual} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#FFB266] hover:underline">Manual <ExternalLink size={12} /></a>}
        </div>
        <div className="rounded-xl border border-white/10 p-3 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-white/60 flex-1 min-w-[12rem]">DMX mode
              <select value={modeId} onChange={(e) => setModeId(e.target.value)} className="bg-white/[0.06] border border-white/10 rounded px-2 py-1.5 text-sm text-white [&>option]:bg-zinc-900">
                {fixture.profiles.map((p) => <option key={p.id} value={p.id}>{p.name.split(' · ').pop()} ({p.channels.length} ch)</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-white/60">Qty
              <input type="number" min={1} max={512} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))} className="w-16 bg-white/[0.06] border border-white/10 rounded px-2 py-1.5 text-sm text-white" />
            </label>
            <button onClick={() => { boardEngine.addFixtures(profile, count, fixture.name); setAdded(`Added ${count} to the patch`); }} className="px-3 py-2 rounded bg-[#FF8C00] text-black text-sm font-semibold inline-flex items-center gap-1"><Plus size={14} /> Add to patch</button>
          </div>
          {added && <p role="status" className="text-xs text-emerald-400">{added}</p>}
          <ol className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5 text-xs text-white/70 max-h-44 overflow-y-auto">
            {profile.channels.map((c, i) => <li key={i} className="truncate"><span className="text-white/40 tabular-nums mr-1.5">{i + 1}</span>{c.label}</li>)}
          </ol>
        </div>
      </div>
    </div>
  );
}

function SmartCatalog({ onConnect }: { onConnect?: () => void }) {
  const smart = useLightingService();
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState<LightPlatform | 'all'>('all');
  const [open, setOpen] = useState<SmartModel | null>(null);
  const shown = searchSmartModels(query, platform);
  const brand = open ? SMART_BRANDS.find((b) => b.platform === open.platform)! : null;

  return (
    <div className="relative space-y-3">
      <label className="relative block">
        <Search size={13} className="absolute left-2 top-2 text-white/40" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Hue, strip, screen sync, Matter…" aria-label="Search smart lights" className="w-full bg-white/[0.06] border border-white/10 rounded pl-7 pr-2 py-1.5 text-xs text-white outline-none focus:border-[#FF8C00]/70" />
      </label>
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setPlatform('all')} aria-pressed={platform === 'all'} className={`px-3 py-1.5 rounded-lg text-xs ${platform === 'all' ? 'bg-white text-black font-medium' : 'bg-white/[0.07] text-white/70'}`}>All brands</button>
        {SMART_BRANDS.map((b) => (
          <button key={b.platform} onClick={() => setPlatform(b.platform)} aria-pressed={platform === b.platform} className={`px-3 py-1.5 rounded-lg text-xs border ${platform === b.platform ? 'border-[#FF8C00] bg-[#FF8C00]/10' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'}`}>
            <BrandMark platform={b.platform} />
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2">
        {shown.map((m) => (
          <button key={m.id} onClick={() => setOpen(m)} className="text-left rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] p-2.5">
            <SmartArt form={m.form} className="h-20 w-full" />
            <span className="block text-[11px] text-white/60 mt-1"><BrandMark platform={m.platform} size={12} /></span>
            <span className="block text-xs font-medium truncate">{m.name}</span>
            <span className="block text-[11px] text-white/50 truncate">{m.capabilities.slice(0, 2).join(' · ')}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-white/40">Features are a hand-written guide, and vary by model year and region. Check the maker's page before buying. Logos belong to their owners.</p>
      {open && brand && (
        <div role="dialog" aria-label={open.name} className="absolute inset-0 z-20 bg-[#08070b] overflow-y-auto min-h-[24rem]">
          <div className="max-w-3xl mx-auto p-1 space-y-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-white/60"><BrandMark platform={open.platform} /></p>
                <h3 className="text-lg font-semibold">{open.name}</h3>
                <p className="text-sm text-white/60">{open.note}</p>
              </div>
              <button aria-label="Close" onClick={() => setOpen(null)} className="p-2 rounded-lg hover:bg-white/10"><X size={18} /></button>
            </div>
            <div className="grid gap-4 sm:grid-cols-[11rem_1fr]">
              <div className="rounded-xl bg-white/[0.04] p-4"><SmartArt form={open.form} /></div>
              <div className="space-y-3">
                <div>
                  <h4 className="text-xs font-semibold mb-1.5">Capabilities and features</h4>
                  <ul className="flex flex-wrap gap-1">{open.capabilities.map((c) => <li key={c} className="px-2 py-1 rounded bg-white/[0.08] text-xs">{c}</li>)}</ul>
                </div>
                <div>
                  <h4 className="text-xs font-semibold mb-1">In Plajah today</h4>
                  <p className="text-xs text-white/70">{brand.control}</p>
                </div>
                <div>
                  <h4 className="text-xs font-semibold mb-1">Connecting</h4>
                  <p className="text-xs text-white/70">{brand.connect}{smart.connected[open.platform] ? ' Connected now; your lights are in the fixture grid.' : ''}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {onConnect && <button onClick={onConnect} className="px-3 py-2 rounded bg-[#FF8C00] text-black text-sm font-semibold">Connect {brand.name}</button>}
                  <a href={brand.site} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[#FFB266] hover:underline">{brand.name} site <ExternalLink size={12} /></a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function FixtureGallery({ onConnectSmart }: { onConnectSmart?: () => void }) {
  const [library, setLibrary] = useState<'dmx' | 'smart'>('dmx');
  const [fixtures, setFixtures] = useState<CatalogFixture[]>([]);
  const [source, setSource] = useState('');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<FixtureForm | 'all'>('all');
  const [open, setOpen] = useState<CatalogFixture | null>(null);

  useEffect(() => { void loadFixtureCatalog().then((c) => { setFixtures(c.fixtures); setSource(c.source); }); }, []);

  const shown = useMemo(() => searchCatalog(fixtures, query, form), [fixtures, query, form]);
  const forms = useMemo(() => FORMS.filter((f) => fixtures.some((x) => x.form === f)), [fixtures]);

  const switcher = (
    <div className="flex p-0.5 rounded-lg bg-white/[0.07] w-fit">
      {([['dmx', 'DMX fixtures'], ['smart', 'Smart lights']] as const).map(([id, label]) => (
        <button key={id} onClick={() => setLibrary(id)} aria-pressed={library === id} className={`px-3 py-1.5 rounded-md text-xs font-medium ${library === id ? 'bg-white text-black' : 'text-white/60'}`}>{label}</button>
      ))}
    </div>
  );

  if (library === 'smart') return <div className="min-h-full p-3 space-y-3">{switcher}<SmartCatalog onConnect={onConnectSmart} /></div>;

  return (
    <div className="relative min-h-full p-3 space-y-3">
      {switcher}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[12rem]">
          <Search size={13} className="absolute left-2 top-2 text-white/40" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Chauvet, MAC Aura, par…" aria-label="Search fixtures" className="w-full bg-white/[0.06] border border-white/10 rounded pl-7 pr-2 py-1.5 text-xs text-white outline-none focus:border-[#FF8C00]/70" />
        </label>
        <span className="text-xs text-white/50 tabular-nums">{shown.length} fixtures</span>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {(['all', ...forms] as const).map((f) => (
          <button key={f} onClick={() => setForm(f)} aria-pressed={form === f} className={`px-2.5 py-1 rounded-full text-xs whitespace-nowrap ${form === f ? 'bg-white text-black font-medium' : 'bg-white/[0.07] text-white/70 hover:text-white'}`}>{f === 'all' ? 'All' : FORM_LABEL[f]}</button>
        ))}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2">
        {shown.map((f) => (
          <button key={f.id} onClick={() => setOpen(f)} className="text-left rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] p-2.5">
            <FixtureArt form={f.form} className="h-20 w-full" />
            <span className="block text-[11px] text-white/50 mt-1 truncate">{f.manufacturer}</span>
            <span className="block text-xs font-medium truncate">{f.name}</span>
            <span className="block text-[11px] text-white/50 truncate">{[f.spec.powerW && `${f.spec.powerW} W`, `${f.profiles[0].channels.length} ch`].filter(Boolean).join(' · ')}</span>
          </button>
        ))}
      </div>
      {source && <p className="text-[11px] text-white/40">Specs and DMX modes: {source}. Drawings are illustrative. Check the manual before a show.</p>}
      {open && <Detail fixture={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

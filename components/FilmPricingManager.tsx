import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  DollarSign, Clock, Tag, Globe, ChevronDown, Check,
  Loader2, Film, Zap, Lock, Radio,
} from 'lucide-react';
import { fetchUserAlbums, updateAlbum, auth } from '../services/backendService';
import type { Album } from '../types';

// ── Territory data ────────────────────────────────────────────────────────────

const REGIONS = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'JP', name: 'Japan' },
  { code: 'BR', name: 'Brazil' },
  { code: 'IN', name: 'India' },
  { code: 'MX', name: 'Mexico' },
];

// ── Local state per film ───────────────────────────────────────────────────────

interface PricingConfig {
  model: 'FREE' | 'RENTAL' | 'PURCHASE' | 'HYBRID' | 'FAST';
  rentalPrice: string;
  purchasePrice: string;
  rentalWindow: '24' | '48' | '72';
  promoEnabled: boolean;
  promoPrice: string;
  promoStart: string;
  promoEnd: string;
  territories: string[];        // empty = worldwide
  membershipGated: boolean;
}

function defaultConfig(): PricingConfig {
  return {
    model: 'FREE',
    rentalPrice: '4.99',
    purchasePrice: '9.99',
    rentalWindow: '48',
    promoEnabled: false,
    promoPrice: '1.99',
    promoStart: '',
    promoEnd: '',
    territories: [],
    membershipGated: false,
  };
}

function configFromAlbum(album: Album): PricingConfig {
  const cfg = defaultConfig();
  if (album.isAdSupported && !album.isPaywalled) cfg.model = 'FAST';
  else if (album.isPaywalled && album.price) cfg.model = 'PURCHASE';
  else cfg.model = 'FREE';
  if (album.price) cfg.purchasePrice = String(album.price);
  return cfg;
}

// ── Model option card ─────────────────────────────────────────────────────────

function ModelCard({ id, label, desc, icon, selected, color, onClick }: {
  id: string; label: string; desc: string; icon: React.ReactNode;
  selected: boolean; color: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flex items-start gap-3 p-4 rounded-2xl border transition-all text-left"
      style={{
        background:  selected ? `${color}10` : 'rgba(255,255,255,0.02)',
        borderColor: selected ? `${color}40` : 'rgba(255,255,255,0.07)',
      }}>
      <span style={{ color: selected ? color : 'rgba(255,255,255,0.2)' }} className="mt-0.5 flex-shrink-0">{icon}</span>
      <div className="flex-1">
        <p className={`text-xs font-black uppercase tracking-widest ${selected ? 'text-white' : 'text-white/40'}`}>{label}</p>
        <p className="text-[9px] text-white/25 mt-0.5">{desc}</p>
      </div>
      {selected && <Check size={12} style={{ color }} className="flex-shrink-0 mt-1" />}
    </button>
  );
}

const MODELS: { id: PricingConfig['model']; label: string; desc: string; icon: React.ReactNode; color: string }[] = [
  { id: 'FREE',     label: 'Free',             desc: 'No charge — open to all',                       icon: <Globe size={14} />,    color: '#22c55e' },
  { id: 'FAST',     label: 'Free + FAST Ads',  desc: 'Ad-supported on your channel',                  icon: <Radio size={14} />,    color: '#38bdf8' },
  { id: 'RENTAL',   label: 'Rental only',      desc: 'Timed access window',                           icon: <Clock size={14} />,    color: '#818cf8' },
  { id: 'PURCHASE', label: 'Purchase only',    desc: 'Permanent digital copy',                        icon: <DollarSign size={14} />, color: '#FF8C00' },
  { id: 'HYBRID',   label: 'Rent + Buy',       desc: 'Let viewers choose either option',              icon: <Zap size={14} />,      color: '#f472b6' },
];

// ── Main component ─────────────────────────────────────────────────────────────

export default function FilmPricingManager() {
  const [albums, setAlbums]         = useState<Album[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [config, setConfig]         = useState<PricingConfig>(defaultConfig());
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;
    fetchUserAlbums(auth.currentUser.uid).then(a => {
      const films = a.filter(x => x.type === 'VIDEO');
      setAlbums(films);
      if (films.length > 0) {
        setSelectedId(films[0].id);
        setConfig(configFromAlbum(films[0]));
      }
      setLoading(false);
    });
  }, []);

  const album = albums.find(a => a.id === selectedId);

  const handleSave = async () => {
    if (!album || saving) return;
    setSaving(true);
    const isFAST = config.model === 'FAST';
    const isFree = config.model === 'FREE';
    const updates: Partial<Album> = {
      isPaywalled:  !isFAST && !isFree,
      isAdSupported: isFAST,
      price: config.model === 'PURCHASE' || config.model === 'HYBRID'
        ? parseFloat(config.purchasePrice) || 0 : 0,
    };
    await updateAlbum(album.id, updates);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const set = <K extends keyof PricingConfig>(k: K, v: PricingConfig[K]) =>
    setConfig(prev => ({ ...prev, [k]: v }));

  const toggleTerritory = (code: string) =>
    setConfig(prev => ({
      ...prev,
      territories: prev.territories.includes(code)
        ? prev.territories.filter(t => t !== code)
        : [...prev.territories, code],
    }));

  const inputCls = 'bg-white/5 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/20 transition-all';
  const labelCls = 'block text-[9px] font-black uppercase tracking-[0.3em] text-white/25 mb-2';

  const isRental   = config.model === 'RENTAL' || config.model === 'HYBRID';
  const isPurchase = config.model === 'PURCHASE' || config.model === 'HYBRID';

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none text-white">Pricing<br />Manager</h1>
          <p className="text-white/30 text-sm font-bold uppercase tracking-widest mt-2">Dynamic pricing · rental windows · promo rates · territories</p>
        </div>
        <button onClick={handleSave} disabled={saving || !album}
          className="flex items-center gap-2 px-7 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 disabled:opacity-40 flex-shrink-0"
          style={{ background: saved ? '#22c55e' : '#FF8C00', color: '#000' }}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <><Check size={14} /> Saved!</> : 'Save Pricing'}
        </button>
      </div>

      {/* Film selector */}
      {albums.length > 0 && (
        <div className="relative w-full max-w-sm">
          <select value={selectedId} onChange={e => {
            setSelectedId(e.target.value);
            const a = albums.find(x => x.id === e.target.value);
            if (a) setConfig(configFromAlbum(a));
          }} className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white appearance-none outline-none pr-10">
            {albums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
        </div>
      )}

      {/* Pricing model */}
      <section>
        <label className={labelCls}>Access model</label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {MODELS.map(m => (
            <ModelCard key={m.id} {...m} selected={config.model === m.id} onClick={() => set('model', m.id)} />
          ))}
        </div>
      </section>

      {/* Rental settings */}
      {isRental && (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <label className={labelCls}>Rental settings</label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Rental price (USD)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
                <input type="number" min="0" step="0.01" value={config.rentalPrice}
                  onChange={e => set('rentalPrice', e.target.value)}
                  className={`${inputCls} pl-8 w-full`} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Rental window</label>
              <div className="flex gap-2">
                {(['24','48','72'] as const).map(h => (
                  <button key={h} onClick={() => set('rentalWindow', h)}
                    className="flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                    style={{
                      background: config.rentalWindow === h ? 'rgba(129,140,248,0.15)' : 'rgba(255,255,255,0.04)',
                      color:      config.rentalWindow === h ? '#818cf8' : 'rgba(255,255,255,0.3)',
                      border:     `1px solid ${config.rentalWindow === h ? 'rgba(129,140,248,0.35)' : 'rgba(255,255,255,0.07)'}`,
                    }}>
                    {h}h
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.section>
      )}

      {/* Purchase price */}
      {isPurchase && (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <label className={labelCls}>Purchase price (USD)</label>
          <div className="relative w-48">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
            <input type="number" min="0" step="0.01" value={config.purchasePrice}
              onChange={e => set('purchasePrice', e.target.value)}
              className={`${inputCls} pl-8 w-full`} />
          </div>
        </motion.section>
      )}

      {/* Promo pricing */}
      {config.model !== 'FREE' && config.model !== 'FAST' && (
        <section className="space-y-4">
          <button onClick={() => set('promoEnabled', !config.promoEnabled)}
            className="flex items-center gap-3 p-4 rounded-2xl border transition-all w-full text-left"
            style={{
              background:  config.promoEnabled ? 'rgba(251,191,36,0.06)' : 'rgba(255,255,255,0.02)',
              borderColor: config.promoEnabled ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.07)',
            }}>
            <Tag size={14} className={config.promoEnabled ? 'text-yellow-400' : 'text-white/20'} />
            <div className="flex-1">
              <p className={`text-xs font-black uppercase tracking-widest ${config.promoEnabled ? 'text-white' : 'text-white/35'}`}>Promotional Pricing</p>
              <p className="text-[9px] text-white/25">Temporarily discount your film during a promo window</p>
            </div>
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${config.promoEnabled ? 'border-yellow-400 bg-yellow-400' : 'border-white/15'}`}>
              {config.promoEnabled && <Check size={9} className="text-black" />}
            </div>
          </button>

          {config.promoEnabled && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-3 gap-4 pl-2">
              <div>
                <label className={labelCls}>Promo price (USD)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
                  <input type="number" min="0" step="0.01" value={config.promoPrice}
                    onChange={e => set('promoPrice', e.target.value)}
                    className={`${inputCls} pl-8 w-full`} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Promo start</label>
                <input type="date" value={config.promoStart} onChange={e => set('promoStart', e.target.value)}
                  className={`${inputCls} w-full`} />
              </div>
              <div>
                <label className={labelCls}>Promo end</label>
                <input type="date" value={config.promoEnd} onChange={e => set('promoEnd', e.target.value)}
                  className={`${inputCls} w-full`} />
              </div>
            </motion.div>
          )}
        </section>
      )}

      {/* Membership gate */}
      <section>
        <button onClick={() => set('membershipGated', !config.membershipGated)}
          className="flex items-center gap-3 p-4 rounded-2xl border transition-all w-full text-left"
          style={{
            background:  config.membershipGated ? 'rgba(107,0,153,0.08)' : 'rgba(255,255,255,0.02)',
            borderColor: config.membershipGated ? 'rgba(107,0,153,0.3)' : 'rgba(255,255,255,0.07)',
          }}>
          <Lock size={14} className={config.membershipGated ? 'text-purple-400' : 'text-white/20'} />
          <div className="flex-1">
            <p className={`text-xs font-black uppercase tracking-widest ${config.membershipGated ? 'text-white' : 'text-white/35'}`}>Fan Club Members Only</p>
            <p className="text-[9px] text-white/25">Restrict access to your paying fan club subscribers</p>
          </div>
          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${config.membershipGated ? 'border-purple-400 bg-purple-400' : 'border-white/15'}`}>
            {config.membershipGated && <Check size={9} className="text-black" />}
          </div>
        </button>
      </section>

      {/* Territory restrictions */}
      <section className="space-y-3">
        <div>
          <label className={labelCls}>Territory restrictions</label>
          <p className="text-[9px] text-white/20 mb-3">Leave all unselected = worldwide. Select specific countries to restrict availability.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {REGIONS.map(r => {
            const active = config.territories.includes(r.code);
            return (
              <button key={r.code} onClick={() => toggleTerritory(r.code)}
                className="px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                style={{
                  background:  active ? 'rgba(255,140,0,0.12)' : 'rgba(255,255,255,0.04)',
                  color:       active ? '#FF8C00' : 'rgba(255,255,255,0.3)',
                  border:      `1px solid ${active ? 'rgba(255,140,0,0.3)' : 'rgba(255,255,255,0.07)'}`,
                }}>
                {r.code} — {r.name}
              </button>
            );
          })}
        </div>
        {config.territories.length > 0 && (
          <p className="text-[9px] text-white/30">
            Available in: {config.territories.length === REGIONS.length ? 'All listed regions' : config.territories.join(', ')}
            {' '}· <button onClick={() => set('territories', [])} className="underline text-white/40 hover:text-white">Clear all</button>
          </p>
        )}
      </section>

      {/* Pricing summary */}
      <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 mb-3">Pricing Summary</p>
        {[
          { label: 'Access Model',    val: config.model                                     },
          ...(isRental   ? [{ label: 'Rental',       val: `$${config.rentalPrice} / ${config.rentalWindow}h` }] : []),
          ...(isPurchase ? [{ label: 'Purchase',      val: `$${config.purchasePrice}`        }] : []),
          ...(config.promoEnabled ? [{ label: 'Promo Price', val: `$${config.promoPrice} (${config.promoStart || '?'} – ${config.promoEnd || '?'})` }] : []),
          { label: 'Territories',    val: config.territories.length === 0 ? 'Worldwide' : config.territories.join(', ') },
          { label: 'Members Only',   val: config.membershipGated ? 'Yes' : 'No' },
        ].map(row => (
          <div key={row.label} className="flex items-center justify-between">
            <span className="text-[9px] text-white/25 font-black uppercase tracking-widest">{row.label}</span>
            <span className="text-[10px] text-white/50 font-black">{row.val}</span>
          </div>
        ))}
      </div>

      {albums.length === 0 && !loading && (
        <div className="py-16 flex flex-col items-center gap-4 border-2 border-dashed border-white/5 rounded-[2.5rem] text-center">
          <Film size={28} className="text-white/12" />
          <p className="text-[10px] font-black uppercase tracking-widest text-white/20">No films found</p>
        </div>
      )}
    </motion.div>
  );
}

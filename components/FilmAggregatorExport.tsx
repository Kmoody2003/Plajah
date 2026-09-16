import React, { useState, useEffect } from 'react';
import { cleanDescription } from '../utils/description';
import { motion } from 'motion/react';
import {
  Download, Copy, Check, ChevronDown, ExternalLink,
  Film, Globe, FileText, Image as ImageIcon, Music2,
} from 'lucide-react';
import { fetchUserAlbums, auth } from '../services/backendService';
import type { Album } from '../types';

// ── Aggregator configs ────────────────────────────────────────────────────────

interface Aggregator {
  id: string;
  name: string;
  color: string;
  url: string;
  requiredFields: string[];
  posterSpec: string;
  subtitleFormats: string[];
  metadataFormat: string;
}

const AGGREGATORS: Aggregator[] = [
  {
    id: 'filmhub',    name: 'FilmHub',          color: '#6B0099',
    url: 'https://filmhub.com',
    requiredFields: ['Title','Director','Year','Genre','Runtime','Synopsis','Rating','Cast','Keywords'],
    posterSpec: '1920×1080 JPG, < 10 MB', subtitleFormats: ['SRT'], metadataFormat: 'CSV',
  },
  {
    id: 'apple',      name: 'Apple TV / iTunes', color: '#007AFF',
    url: 'https://support.apple.com/en-us/111900',
    requiredFields: ['Title','Director','Studio','Year','Genre','Rating','Cast','Synopsis','Keywords','ISBN_ISAN'],
    posterSpec: '3840×2160 JPG, RGB', subtitleFormats: ['SRT','iTT'], metadataFormat: 'XML (iTMF)',
  },
  {
    id: 'amazon',     name: 'Amazon Prime',      color: '#00A8E0',
    url: 'https://videodirectpublishing.amazon.com',
    requiredFields: ['Title','Director','Year','Genre','Rating','Synopsis','Cast','Keywords','EIDR'],
    posterSpec: '1200×1600 JPG', subtitleFormats: ['SRT','TTML','SCC'], metadataFormat: 'CSV + XML',
  },
  {
    id: 'tubi',       name: 'Tubi',              color: '#FA4B10',
    url: 'https://tubitv.com/static/content-partners',
    requiredFields: ['Title','Director','Year','Genre','Synopsis','Rating','Cast'],
    posterSpec: '1280×720 JPG', subtitleFormats: ['SRT','VTT'], metadataFormat: 'MRSS Feed',
  },
  {
    id: 'distribber', name: 'Distribber',        color: '#22c55e',
    url: 'https://distribber.com',
    requiredFields: ['Title','Director','Year','Genre','Synopsis','Rating','Cast','Keywords'],
    posterSpec: '1920×1080 JPG', subtitleFormats: ['SRT'], metadataFormat: 'Web Form',
  },
];

// ── Metadata builder ──────────────────────────────────────────────────────────

function buildMetadata(album: Album): Record<string, string> {
  const meta = album.movieMetadata;
  return {
    Title:     album.title || '',
    Director:  album.artist || '',
    Year:      String(meta?.releaseYear || new Date().getFullYear()),
    Genre:     album.genre || '',
    Synopsis:  cleanDescription(album.description),
    Tagline:   meta?.tagline || '',
    Cast:      (meta?.castMembers ?? []).map(c => c.actorName).join(', '),
    Keywords:  (album.tags ?? []).join(', '),
    Rating:    '',
    Runtime:   '',
    EIDR:      '',
    ISAN:      '',
  };
}

function buildXML(fields: Record<string, string>): string {
  const inner = Object.entries(fields)
    .map(([k, v]) => `  <${k}>${v.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</${k}>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Film>\n${inner}\n</Film>`;
}

function buildCSV(fields: Record<string, string>): string {
  const headers = Object.keys(fields).join(',');
  const values  = Object.values(fields).map(v => `"${v.replace(/"/g, '""')}"`).join(',');
  return `${headers}\n${values}`;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function FilmAggregatorExport() {
  const [albums, setAlbums]         = useState<Album[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [activeAgg, setActiveAgg]   = useState<string>('filmhub');
  const [copied, setCopied]         = useState(false);
  const [loading, setLoading]       = useState(true);
  const [overrides, setOverrides]   = useState<Record<string, string>>({});

  useEffect(() => {
    if (!auth.currentUser) return;
    fetchUserAlbums(auth.currentUser.uid).then(a => {
      const films = a.filter(x => x.type === 'VIDEO');
      setAlbums(films);
      if (films.length > 0) setSelectedId(films[0].id);
      setLoading(false);
    });
  }, []);

  const album = albums.find(a => a.id === selectedId);
  const agg   = AGGREGATORS.find(a => a.id === activeAgg)!;

  const baseFields = album ? buildMetadata(album) : {} as Record<string, string>;
  const fields: Record<string, string> = { ...baseFields, ...overrides };
  const filteredFields = Object.fromEntries(
    agg.requiredFields.map(k => [k, fields[k] ?? ''])
  );

  const xmlOutput = buildXML(filteredFields);
  const csvOutput = buildCSV(filteredFields);

  const missingFields = agg.requiredFields.filter(k => !filteredFields[k]);
  const readinessPct  = Math.round(((agg.requiredFields.length - missingFields.length) / agg.requiredFields.length) * 100);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const inputCls = 'w-full bg-white/5 border border-white/8 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/20 transition-all';
  const labelCls = 'block text-[9px] font-black uppercase tracking-[0.3em] text-white/25 mb-1.5';

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div>
        <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none text-white">Aggregator<br />Export</h1>
        <p className="text-white/30 text-sm font-bold uppercase tracking-widest mt-2">Generate platform-ready metadata packages for distribution submission</p>
      </div>

      {/* Film selector */}
      {albums.length > 0 && (
        <div className="relative w-full max-w-sm">
          <select value={selectedId} onChange={e => { setSelectedId(e.target.value); setOverrides({}); }}
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white appearance-none outline-none pr-10">
            {albums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
        </div>
      )}

      {/* Aggregator tabs */}
      <div className="flex flex-wrap gap-2">
        {AGGREGATORS.map(a => (
          <button key={a.id} onClick={() => setActiveAgg(a.id)}
            className="px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
            style={{
              background: activeAgg === a.id ? `${a.color}18` : 'rgba(255,255,255,0.04)',
              color:      activeAgg === a.id ? a.color : 'rgba(255,255,255,0.3)',
              border:     `1px solid ${activeAgg === a.id ? `${a.color}40` : 'rgba(255,255,255,0.07)'}`,
            }}>
            {a.name}
          </button>
        ))}
      </div>

      {/* Aggregator info banner */}
      <div className="flex items-start gap-4 p-5 rounded-2xl border" style={{ borderColor: `${agg.color}25`, background: `${agg.color}08` }}>
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs font-black uppercase tracking-widest" style={{ color: agg.color }}>{agg.name}</p>
            <span className="text-[8px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest bg-white/8 text-white/40">
              {agg.metadataFormat}
            </span>
          </div>
          <p className="text-[9px] text-white/35">Poster: {agg.posterSpec} · Subtitles: {agg.subtitleFormats.join(', ')}</p>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1.5 bg-white/8 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${readinessPct}%`, background: readinessPct === 100 ? '#22c55e' : readinessPct >= 60 ? '#f59e0b' : '#ef4444' }} />
            </div>
            <span className="text-[9px] font-black" style={{ color: readinessPct === 100 ? '#22c55e' : readinessPct >= 60 ? '#f59e0b' : '#ef4444' }}>
              {readinessPct}% complete
            </span>
          </div>
        </div>
        <a href={agg.url} target="_blank" rel="noreferrer"
          className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest hover:underline flex-shrink-0"
          style={{ color: agg.color }}>
          Submit <ExternalLink size={10} />
        </a>
      </div>

      {/* Editable fields */}
      {album && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agg.requiredFields.map(key => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1.5">
                <label className={labelCls}>{key}</label>
                {filteredFields[key]
                  ? <span className="text-[7px] text-green-400 font-black uppercase">✓ Set</span>
                  : <span className="text-[7px] text-red-400 font-black uppercase">Required</span>}
              </div>
              <input
                value={filteredFields[key] ?? ''}
                onChange={e => setOverrides(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder={`Enter ${key.toLowerCase()}`}
                className={inputCls}
              />
            </div>
          ))}
        </div>
      )}

      {/* Export actions */}
      {album && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* XML export */}
          <div className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/25">Metadata XML</p>
              <div className="flex gap-2">
                <button onClick={() => copyToClipboard(xmlOutput)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest bg-white/8 text-white/40 hover:text-white transition-all">
                  {copied ? <Check size={10} /> : <Copy size={10} />} Copy
                </button>
                <button onClick={() => downloadFile(xmlOutput, `${album.title}_metadata.xml`, 'application/xml')}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest bg-white/8 text-white/40 hover:text-white transition-all">
                  <Download size={10} /> XML
                </button>
              </div>
            </div>
            <pre className="text-[9px] text-white/35 overflow-x-auto bg-black/30 rounded-xl p-4 max-h-48 leading-relaxed">
              {xmlOutput}
            </pre>
          </div>

          {/* CSV export */}
          <div className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/25">Metadata CSV</p>
              <button onClick={() => downloadFile(csvOutput, `${album.title}_metadata.csv`, 'text/csv')}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest bg-white/8 text-white/40 hover:text-white transition-all">
                <Download size={10} /> CSV
              </button>
            </div>
            <pre className="text-[9px] text-white/35 overflow-x-auto bg-black/30 rounded-xl p-4 max-h-48 leading-relaxed">
              {csvOutput}
            </pre>
          </div>
        </div>
      )}

      {/* Poster + subtitle checklist */}
      {album && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { icon: <ImageIcon size={16} />, label: 'Poster',    req: agg.posterSpec,           status: !!album.coverImage, action: 'Upload poster in AlbumCreator' },
            { icon: <FileText size={16} />,  label: 'Subtitles', req: agg.subtitleFormats.join(' / '), status: false,               action: 'Attach SRT/VTT in Rights & Docs' },
          ].map(item => (
            <div key={item.label} className="flex items-start gap-4 p-5 rounded-2xl border"
              style={{ background: item.status ? 'rgba(34,197,94,0.05)' : 'rgba(255,255,255,0.02)', borderColor: item.status ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.07)' }}>
              <span className={item.status ? 'text-green-400' : 'text-white/20'}>{item.icon}</span>
              <div>
                <p className={`text-xs font-black uppercase tracking-widest ${item.status ? 'text-white' : 'text-white/40'}`}>{item.label}</p>
                <p className="text-[9px] text-white/25 mt-0.5">Required: {item.req}</p>
                {!item.status && <p className="text-[8px] text-white/20 mt-1 italic">{item.action}</p>}
              </div>
              {item.status && <Check size={14} className="text-green-400 ml-auto flex-shrink-0" />}
            </div>
          ))}
        </div>
      )}

      {albums.length === 0 && !loading && (
        <div className="py-16 flex flex-col items-center gap-4 border-2 border-dashed border-white/5 rounded-[2.5rem] text-center">
          <Film size={28} className="text-white/12" />
          <p className="text-[10px] font-black uppercase tracking-widest text-white/20">No films found</p>
          <p className="text-[9px] text-white/12">Upload a film in Film Studio first</p>
        </div>
      )}
    </motion.div>
  );
}

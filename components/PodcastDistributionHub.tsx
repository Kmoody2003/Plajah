import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Mic2, Copy, Check, Download, ExternalLink, ChevronDown,
  Radio, AlertCircle, Globe,
} from 'lucide-react';
import { fetchUserAlbums, auth } from '../services/backendService';
import { generatePodcastRSS, PODCAST_DIRECTORIES } from '../services/podcastRSSService';
import type { Album } from '../types';

export default function PodcastDistributionHub() {
  const [albums, setAlbums]         = useState<Album[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [copied, setCopied]         = useState(false);
  const [xmlCopied, setXmlCopied]   = useState(false);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;
    fetchUserAlbums(auth.currentUser.uid).then(a => {
      const pods = a.filter(x =>
        x.type === 'MUSIC' && (x.subType === 'PODCAST' || (x.tracks ?? []).some(t => t.podcastMetadata))
      );
      setAlbums(pods);
      if (pods.length > 0) setSelectedId(pods[0].id);
      setLoading(false);
    });
  }, []);

  const album = albums.find(a => a.id === selectedId);
  const rssXml = album ? generatePodcastRSS(album, { siteUrl: window.location.origin }) : '';
  const feedUrl = album ? `${window.location.origin}/rss/${album.id}` : '';

  const copyFeedUrl = () => { navigator.clipboard.writeText(feedUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const copyXML     = () => { navigator.clipboard.writeText(rssXml);  setXmlCopied(true); setTimeout(() => setXmlCopied(false), 2000); };
  const downloadXML = () => {
    if (!album) return;
    const blob = new Blob([rssXml], { type: 'application/xml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${album.title.replace(/\s+/g, '_')}_podcast.xml`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div>
        <h1 className="text-3xl sm:text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none text-white">Podcast<br />Distribution</h1>
        <p className="text-white/30 text-sm font-bold uppercase tracking-widest mt-2">RSS 2.0 + iTunes feed · submit to every major directory</p>
      </div>

      {albums.length === 0 && !loading ? (
        <div className="py-16 flex flex-col items-center gap-4 border-2 border-dashed border-white/5 rounded-[2.5rem] text-center">
          <Mic2 size={28} className="text-white/12" />
          <p className="text-[10px] font-black uppercase tracking-widest text-white/20">No podcast albums found</p>
          <p className="text-[9px] text-white/12">Create an album with subType: PODCAST or add PodcastMetadata to tracks</p>
        </div>
      ) : (
        <>
          {/* Selector */}
          <div className="relative w-full max-w-sm">
            <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white appearance-none outline-none pr-10">
              {albums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
          </div>

          {album && (
            <>
              {/* RSS Feed URL */}
              <div className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-7 space-y-4">
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20">Your RSS Feed URL</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-5 py-3 font-mono text-sm text-white/60 truncate">
                    {feedUrl}
                  </div>
                  <button onClick={copyFeedUrl}
                    className="flex items-center gap-1.5 px-5 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest bg-violet-500/15 text-violet-400 hover:bg-violet-500/20 transition-all border border-violet-500/25 flex-shrink-0">
                    {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'Copied!' : 'Copy URL'}
                  </button>
                </div>
                <div className="flex items-start gap-2 p-3 rounded-xl bg-yellow-400/6 border border-yellow-400/15">
                  <AlertCircle size={12} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[9px] text-white/35">This RSS URL requires a hosted endpoint. Download the XML below and host it via Firebase Hosting, or use a podcast hosting service to serve your feed.</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={downloadXML}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest bg-white/8 text-white/40 hover:text-white transition-all">
                    <Download size={11} /> Download .xml
                  </button>
                  <button onClick={copyXML}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest bg-white/8 text-white/40 hover:text-white transition-all">
                    {xmlCopied ? <Check size={11} /> : <Copy size={11} />} {xmlCopied ? 'Copied!' : 'Copy XML'}
                  </button>
                </div>
              </div>

              {/* Episode summary */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Episodes',  value: album.tracks?.length ?? 0 },
                  { label: 'Paywalled', value: album.tracks?.filter(t => t.isPaywalled).length ?? 0 },
                  { label: 'Free',      value: album.tracks?.filter(t => !t.isPaywalled).length ?? 0 },
                ].map(s => (
                  <div key={s.label} className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 text-center">
                    <p className="text-[8px] font-black uppercase tracking-widest text-white/20 mb-1">{s.label}</p>
                    <p className="text-3xl font-black">{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Directory submission */}
              <section>
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 mb-4">Submit to Podcast Directories</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {PODCAST_DIRECTORIES.map(dir => (
                    <a key={dir.id} href={dir.submitUrl} target="_blank" rel="noreferrer"
                      className="flex items-start gap-4 p-5 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all group">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: `${dir.color}18` }}>
                        <Radio size={14} style={{ color: dir.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black uppercase tracking-widest text-white group-hover:text-white/80">{dir.name}</p>
                        <p className="text-[9px] text-white/25 mt-0.5">{dir.instructions}</p>
                      </div>
                      <ExternalLink size={12} className="text-white/15 group-hover:text-white/40 transition-all flex-shrink-0 mt-0.5" />
                    </a>
                  ))}
                </div>
              </section>

              {/* RSS preview */}
              <div className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-6">
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 mb-3">RSS Feed Preview</p>
                <pre className="text-[8px] text-white/30 leading-relaxed overflow-x-auto max-h-48 bg-black/30 rounded-xl p-4">
                  {rssXml.slice(0, 1200)}…
                </pre>
              </div>
            </>
          )}
        </>
      )}
    </motion.div>
  );
}

import React, { useState, useRef } from 'react';
import { ChevronLeft, ChevronRight, RotateCw, ExternalLink, Globe, AlertTriangle } from 'lucide-react';

const PARTNER_SHORTCUTS = [
  { label: 'Impact', url: 'https://impact.com', emoji: '⚡' },
  { label: 'Mainstreem', url: 'https://mainstreem.com', emoji: '🎵' },
];

const toProxyUrl = (url: string) => `/api/browse?url=${encodeURIComponent(url)}`;

const normalizeUrl = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return 'https://' + trimmed;
};

interface BrowserPanelProps {
  initialUrl?: string;
}

const BrowserPanel: React.FC<BrowserPanelProps> = ({ initialUrl = 'https://impact.com' }) => {
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const [loadedUrl, setLoadedUrl] = useState(initialUrl);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const navigate = (url: string) => {
    const normalized = normalizeUrl(url);
    if (!normalized) return;
    setInputUrl(normalized);
    setLoadedUrl(normalized);
    setLoading(true);
    setReloadKey(k => k + 1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') navigate(inputUrl);
  };

  const handleRefresh = () => {
    setLoading(true);
    setReloadKey(k => k + 1);
  };

  const tryBack = () => {
    try { iframeRef.current?.contentWindow?.history.back(); } catch {}
  };

  const tryForward = () => {
    try { iframeRef.current?.contentWindow?.history.forward(); } catch {}
  };

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden">
      {/* Browser chrome */}
      <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-white/10 bg-black/30 shrink-0">
        <button
          onClick={tryBack}
          className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-white transition-colors"
          title="Back"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={tryForward}
          className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-white transition-colors"
          title="Forward"
        >
          <ChevronRight size={16} />
        </button>
        <button
          onClick={handleRefresh}
          className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-white transition-colors"
          title="Refresh"
        >
          <RotateCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>

        {/* URL bar */}
        <div className="flex-1 flex items-center gap-2 bg-white/5 border border-white/10 hover:border-white/20 focus-within:border-primary/40 rounded-xl px-3 h-8 transition-colors">
          <Globe size={12} className="text-white/25 shrink-0" />
          <input
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={e => e.target.select()}
            className="flex-1 bg-transparent text-[11px] text-white/70 outline-none font-mono min-w-0"
            spellCheck={false}
            placeholder="Enter URL..."
          />
        </div>

        <a
          href={loadedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-white transition-colors"
          title="Open in new tab"
        >
          <ExternalLink size={14} />
        </a>
      </div>

      {/* Partner shortcuts */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-black/10 shrink-0 overflow-x-auto">
        <span className="text-[9px] font-black uppercase tracking-widest text-white/20 shrink-0 mr-1">
          Partners
        </span>
        {PARTNER_SHORTCUTS.map(s => (
          <button
            key={s.url}
            onClick={() => navigate(s.url)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-all shrink-0 ${
              loadedUrl === s.url
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'bg-white/5 hover:bg-white/10 text-white/40 hover:text-white border border-transparent'
            }`}
          >
            <span>{s.emoji}</span>
            {s.label}
          </button>
        ))}
      </div>

      {/* Iframe viewport */}
      <div className="flex-1 relative bg-white">
        <iframe
          ref={iframeRef}
          key={`${loadedUrl}-${reloadKey}`}
          src={toProxyUrl(loadedUrl)}
          className="w-full h-full border-none block"
          title="Plajah Browser"
          sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts"
          onLoad={() => setLoading(false)}
          onError={() => setLoading(false)}
          allow="autoplay; fullscreen; encrypted-media"
        />

        {loading && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary/30 overflow-hidden">
            <div className="h-full bg-primary animate-pulse w-2/3" />
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-t border-white/5 bg-black/20 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/60" />
          <span className="text-[9px] font-mono text-white/20 truncate max-w-xs">
            via plajah proxy · {loadedUrl}
          </span>
        </div>
        <span className="ml-auto text-[9px] text-white/15 uppercase tracking-widest font-black">
          Plajah Browser
        </span>
      </div>
    </div>
  );
};

export default BrowserPanel;

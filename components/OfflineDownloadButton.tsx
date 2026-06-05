import React, { useState, useEffect } from 'react';
import { Download, Check, Loader2, WifiOff, Trash2 } from 'lucide-react';
import {
  isAvailableOffline,
  cacheMediaFile,
  removeCachedMedia,
  OfflineCacheEntry,
} from '../services/offlineStorageService';

interface OfflineDownloadButtonProps {
  url: string;
  meta: Omit<OfflineCacheEntry, 'cachedAt' | 'size' | 'url'>;
  size?: 'sm' | 'md';
  className?: string;
}

const OfflineDownloadButton: React.FC<OfflineDownloadButtonProps> = ({
  url,
  meta,
  size = 'md',
  className = '',
}) => {
  const [status, setStatus] = useState<'idle' | 'downloading' | 'cached' | 'error'>('idle');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    isAvailableOffline(url).then(cached => {
      if (cached) setStatus('cached');
    });
  }, [url]);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (status === 'downloading') return;
    if (status === 'cached') {
      if (!confirm('Remove from offline storage?')) return;
      await removeCachedMedia(url);
      setStatus('idle');
      return;
    }
    setStatus('downloading');
    setProgress(0);
    try {
      await cacheMediaFile(url, meta);
      setStatus('cached');
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const iconSize = size === 'sm' ? 12 : 16;
  const btnBase = size === 'sm'
    ? 'w-7 h-7 rounded-full text-[8px]'
    : 'w-9 h-9 rounded-xl text-[9px]';

  const colorMap = {
    idle:        'text-white/30 hover:text-white hover:bg-white/10',
    downloading: 'text-blue-400 bg-blue-400/10 cursor-wait',
    cached:      'text-green-400 hover:text-red-400 hover:bg-red-400/10',
    error:       'text-red-400 bg-red-400/10',
  };

  const icons = {
    idle:        <Download size={iconSize} />,
    downloading: <Loader2 size={iconSize} className="animate-spin" />,
    cached:      <WifiOff size={iconSize} />,
    error:       <Download size={iconSize} />,
  };

  const titles = {
    idle:        'Save for offline',
    downloading: 'Downloading…',
    cached:      'Available offline — tap to remove',
    error:       'Download failed — tap to retry',
  };

  return (
    <button
      onClick={handleDownload}
      title={titles[status]}
      className={`flex items-center justify-center transition-all ${btnBase} ${colorMap[status]} ${className}`}
    >
      {icons[status]}
    </button>
  );
};

export default OfflineDownloadButton;

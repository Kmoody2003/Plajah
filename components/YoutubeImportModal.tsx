import React, { useState } from 'react';
import { Youtube, X, Link as LinkIcon, Plus, CheckCircle, AlertCircle } from 'lucide-react';
import { uploadVideo } from '../services/backendService';
import { auth } from '../services/backendService';

export default function YoutubeImportModal({ onClose, onImported }: { onClose: () => void, onImported: () => void }) {
  const [urls, setUrls] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [results, setResults] = useState<{ url: string, status: 'success' | 'error', message?: string }[]>([]);

  const handleImport = async () => {
    if (!auth.currentUser) return;
    const urlList = urls.split('\n').map(u => u.trim()).filter(u => u);
    if (!urlList.length) return;

    setIsImporting(true);
    const newResults: typeof results = [];

    for (const url of urlList) {
      if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
         newResults.push({ url, status: 'error', message: 'Not a recognized YouTube URL' });
         continue;
      }

      try {
        // Attempt to extract basic ID and use default thumbnails
        let videoId = '';
        const vMatch = url.match(/[?&]v=([^&#]*)/);
        if (vMatch && vMatch[1]) videoId = vMatch[1];
        else if (url.includes('youtu.be/')) {
          videoId = url.split('youtu.be/')[1].split('?')[0];
        }

        const thumbUrl = videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : '';

        // Ideally we would fetch Youtube Data API for title/desc but since we are doing this client side without the Google API Key injected for YouTube, we will import as basic and let them edit later, or fetch oembed.
        // Let's use oEmbed to fetch title
        let title = 'Imported YouTube Video';
        let author = '';
        try {
           const oemRes = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
           if (oemRes.ok) {
             const oemData = await oemRes.json();
             if (oemData && oemData.title) title = oemData.title;
             if (oemData && oemData.author_name) author = oemData.author_name;
           }
        } catch(e) { console.log('oEmbed failed', e); }

        await uploadVideo({
           title: title,
           url: url,
           embedUrl: url,
           description: `Imported from ${author} on YouTube`,
           thumbnailUrl: thumbUrl,
           coverImageUrl: thumbUrl,
           isPrivate: false,
           genre: 'Imported',
        });
        newResults.push({ url, status: 'success' });
      } catch (err: any) {
        newResults.push({ url, status: 'error', message: err.message || 'Import failed' });
      }
    }

    setResults(newResults);
    setIsImporting(false);
    if (newResults.every(r => r.status === 'success')) {
       setTimeout(() => {
          onImported();
          onClose();
       }, 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl relative">
         <button onClick={onClose} className="absolute top-6 right-6 p-4 bg-white/5 hover:bg-white/10 rounded-full text-white transition-all backdrop-blur-md">
            <X size={20} />
         </button>

         <div className="p-10 text-center">
            <div className="w-20 h-20 bg-red-600/20 rounded-full flex items-center justify-center mx-auto mb-6">
               <Youtube size={32} className="text-red-500" />
            </div>
            <h2 className="text-3xl font-display font-black uppercase tracking-tight text-white mb-2">Import from YouTube</h2>
            <p className="text-white/40 text-[10px] font-black uppercase tracking-widest leading-loose">Paste YouTube URLs (one per line) to instantly migrate them into your Plajah archive.</p>
         </div>

         <div className="px-10 pb-10 space-y-6">
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#ff8c00]">
                 <LinkIcon size={14} /> Video URLs
              </label>
              <textarea 
                 value={urls}
                 onChange={(e) => setUrls(e.target.value)}
                 placeholder="https://youtube.com/watch?v=...\nhttps://youtu.be/..."
                 rows={5}
                 disabled={isImporting || results.length > 0}
                 className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-sm font-bold text-white outline-none focus:ring-2 ring-[#ff8c00] transition-all resize-none shadow-inner"
              />
            </div>

            {results.length > 0 && (
               <div className="bg-white/5 rounded-2xl p-4 space-y-3 border border-white/10">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-white/50 mb-4 px-2">Import Status</h4>
                  {results.map((r, i) => (
                     <div key={i} className={`flex items-center gap-3 p-3 rounded-xl ${r.status === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                        {r.status === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                        <span className="text-xs font-bold truncate flex-1">{r.url}</span>
                        {r.status === 'error' && <span className="text-[10px] uppercase font-black">{r.message}</span>}
                     </div>
                  ))}
               </div>
            )}

            {results.length === 0 ? (
                <button 
                  onClick={handleImport}
                  disabled={!urls.trim() || isImporting}
                  className="w-full py-5 bg-white text-black rounded-full font-black text-xs uppercase tracking-widest shadow-[0_0_40px_rgba(255,255,255,0.3)] hover:scale-[1.02] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-3"
                >
                   {isImporting ? 'Importing...' : 'Start Migration'}
                </button>
            ) : (
               <button 
                  onClick={() => { setResults([]); setUrls(''); onImported(); }}
                  className="w-full py-5 bg-white/10 text-white hover:bg-white/20 rounded-full font-black text-xs uppercase tracking-widest transition-all"
               >
                  Import More
               </button>
            )}
         </div>
      </div>
    </div>
  );
}

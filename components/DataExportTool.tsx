import React, { useState } from 'react';
import { Download, Database, Music, Film, FileText, Image, Loader, CheckCircle, ShieldCheck } from 'lucide-react';
import { auth, db, storage } from '../services/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { ref, listAll } from 'firebase/storage';

interface ExportCategory {
  id: string;
  icon: React.FC<any>;
  label: string;
  description: string;
}

const CATEGORIES: ExportCategory[] = [
  { id: 'profile', icon: Database, label: 'Profile & account data', description: 'Display name, bio, settings, connected accounts' },
  { id: 'music', icon: Music, label: 'Music uploads', description: 'Album metadata, track listings, and artwork URLs' },
  { id: 'video', icon: Film, label: 'Video & film library', description: 'Video metadata, FAST channel schedule, episode data' },
  { id: 'articles', icon: FileText, label: 'Articles & writing', description: 'All published articles, books, and drafts' },
  { id: 'media', icon: Image, label: 'Media file index', description: 'Downloadable list of all your upload URLs (photos, audio, video)' },
  { id: 'revenue', icon: Download, label: 'Revenue records', description: 'Transaction history, tip records, subscription revenue' },
];

interface ExportResult {
  category: string;
  rows: number;
  data: any[];
}

async function exportCategory(uid: string, categoryId: string): Promise<ExportResult> {
  const collectionMap: Record<string, string | null> = {
    profile: 'users',
    music: 'albums',
    video: 'videos',
    articles: 'articles',
    media: null,
    revenue: 'transactions',
  };

  const col = collectionMap[categoryId];

  if (categoryId === 'media') {
    // List Firebase Storage objects
    const storageRef = ref(storage, `users/${uid}`);
    try {
      const listing = await listAll(storageRef);
      const items = listing.items.map((item) => ({ path: item.fullPath, name: item.name }));
      return { category: categoryId, rows: items.length, data: items };
    } catch {
      return { category: categoryId, rows: 0, data: [] };
    }
  }

  if (!col) return { category: categoryId, rows: 0, data: [] };

  const q = query(collection(db, col), where('userId', '==', uid));
  const snap = await getDocs(q);
  const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return { category: categoryId, rows: data.length, data };
}

function downloadJSON(data: any, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DataExportTool() {
  const [selected, setSelected] = useState<Set<string>>(new Set(CATEGORIES.map((c) => c.id)));
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [results, setResults] = useState<ExportResult[]>([]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleExport = async () => {
    const user = auth.currentUser;
    if (!user) return;

    setStatus('loading');
    try {
      const exports = await Promise.all(
        [...selected].map((id) => exportCategory(user.uid, id))
      );
      setResults(exports);

      const bundle: Record<string, any> = {
        exportedAt: new Date().toISOString(),
        accountId: user.uid,
        email: user.email,
      };
      for (const r of exports) {
        bundle[r.category] = r.data;
      }
      downloadJSON(bundle, `plajah-export-${Date.now()}.json`);
      setStatus('done');
    } catch (e) {
      console.error('Export error:', e);
      setStatus('error');
    }
  };

  const user = auth.currentUser;
  if (!user) {
    return (
      <div className="rounded-2xl bg-white/[0.03] border border-white/5 p-8 text-center">
        <ShieldCheck size={32} className="text-white/20 mx-auto mb-3" />
        <p className="text-white/50 text-sm">Sign in to export your data</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-2">
          <ShieldCheck size={20} className="text-green-400" />
          <h3 className="font-bold">Export your Plajah data</h3>
        </div>
        <p className="text-sm text-white/40 mb-6">
          Download a complete copy of your data in JSON format. Your data is yours — always.
        </p>

        <div className="space-y-2 mb-6">
          {CATEGORIES.map(({ id, icon: Icon, label, description }) => (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                selected.has(id)
                  ? 'bg-white/5 border-white/20'
                  : 'bg-transparent border-white/5 opacity-50'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                selected.has(id) ? 'bg-orange-500/10' : 'bg-white/5'
              }`}>
                <Icon size={16} className={selected.has(id) ? 'text-orange-400' : 'text-white/30'} />
              </div>
              <div>
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-white/30">{description}</div>
              </div>
              <div className="ml-auto">
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                  selected.has(id) ? 'border-orange-400 bg-orange-400' : 'border-white/20'
                }`}>
                  {selected.has(id) && <span className="text-black text-xs">✓</span>}
                </div>
              </div>
            </button>
          ))}
        </div>

        {status === 'done' && results.length > 0 && (
          <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
            <div className="flex items-center gap-2 text-green-400 text-sm mb-1">
              <CheckCircle size={14} />
              Export downloaded successfully
            </div>
            <div className="text-xs text-white/30">
              {results.map((r) => `${r.category}: ${r.rows} items`).join(' · ')}
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
            Export failed. Please try again or contact team@plajah.com.
          </div>
        )}

        <button
          onClick={handleExport}
          disabled={status === 'loading' || selected.size === 0}
          className="w-full py-3 bg-orange-500 text-black font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-orange-400 transition-colors disabled:opacity-40"
        >
          {status === 'loading' ? (
            <><Loader size={16} className="animate-spin" /> Exporting…</>
          ) : (
            <><Download size={16} /> Download {selected.size} categor{selected.size === 1 ? 'y' : 'ies'}</>
          )}
        </button>
      </div>

      <div className="text-xs text-white/25 text-center space-y-1">
        <div>Your export will download as a single JSON file.</div>
        <div>For account deletion, go to Settings → Account → Delete Account.</div>
      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { auth } from '../../services/backendService';
import type { MUSIC_ENGINES } from '../../services/musicEnginePolicy';

type Engine = typeof MUSIC_ENGINES[number] & {
  permissionRecorded: boolean;
  access: { reason: string };
};

export default function AdminMusicLab() {
  const [engines, setEngines] = useState<Engine[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error('Admin authentication required');
        const response = await fetch('/api/admin/music-lab/engines', {
          headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load music engines');
        if (!controller.signal.aborted) setEngines(data.engines);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load music engines');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);
  return <section className="max-w-5xl space-y-6">
    <div><h2 className="text-3xl font-bold">Melos music lab</h2>
      <p className="text-white/60 mt-2">Configure private evaluation runtimes, then open Generate in Melos Studio to create audio, MIDI or samples.</p>
      <p className="text-white/60 mt-2">YuE2 and SheetSage2 are included. Written evaluation permission is required before testing their weights. All lab engines remain unavailable to public users.</p>
    </div>
    {loading && <p role="status">Loading engine status…</p>}
    {error && <p role="alert" className="text-red-300">{error}</p>}
    <div className="grid md:grid-cols-2 gap-4">{engines.map(engine => <article key={engine.id} className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-2">
      <h3 className="font-bold text-lg">{engine.name}</h3>
      <p className="text-white/70">{engine.purpose}</p>
      <p className="text-sm text-white/50">{engine.license}</p>
      <p className="text-amber-200">{engine.access.reason}</p>
      {engine.permissionRequired && engine.permissionRecorded && <p className="text-sm text-white/60">Evaluation permission recorded; public access remains blocked.</p>}
    </article>)}</div>
  </section>;
}

/**
 * LinkedStationsManager — the owner's manage/remove surface for linked internet-radio stations.
 *
 * Lives in Settings › Master Control (UserDashboard BROADCAST tab), the same home the Broadcast
 * Master Control multiview will grow into. Lists the stations this account has brought on by link,
 * with add (reusing AddStationModal) and remove; it closes the loop opened in the directory, where a
 * station could be added but never taken back off.
 *
 * Styling follows the Master Control tab (rounded slabs, glass, uppercase tracking) with the radio
 * cyan (#00DAF3) as the section accent.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  Radio, Link2, Plus, Trash2, ExternalLink, Loader2, ShieldAlert, CheckCircle2, Globe,
} from 'lucide-react';
import type { LinkedRadioStation } from '../../types';
import { fetchMyLinkedStations, removeLinkedStation } from '../../services/linkedStations';
import AddStationModal from './AddStationModal';

interface Props {
  uid: string;
  ownerName: string;
  ownerAvatar?: string;
}

const LinkedStationsManager: React.FC<Props> = ({ uid, ownerName, ownerAvatar }) => {
  const [stations, setStations] = useState<LinkedRadioStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!uid) { setLoading(false); return; }
    setLoading(true);
    const rows = await fetchMyLinkedStations(uid);
    setStations(rows);
    setLoading(false);
  }, [uid]);

  useEffect(() => { load(); }, [load]);

  const remove = useCallback(async (id: string) => {
    setRemovingId(id);
    try {
      await removeLinkedStation(id);
      setStations(prev => prev.filter(s => s.id !== id));
    } catch {
      // A failed delete leaves the row in place rather than lying that it's gone.
    } finally {
      setRemovingId(null);
      setConfirmId(null);
    }
  }, []);

  const isSecurePage = typeof window !== 'undefined' && window.location.protocol === 'https:';

  return (
    <div className="w-full p-6 sm:p-8 rounded-[2rem] bg-white/5 border border-white/10 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="w-12 h-12 rounded-2xl bg-[#00DAF3]/15 border border-[#00DAF3]/25 flex items-center justify-center shrink-0">
          <Link2 size={22} className="text-[#00DAF3]" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-black text-white tracking-tight">Your Internet Radio Stations</h3>
          <p className="text-sm text-white/40 mt-0.5">
            Stations you broadcast off-platform, brought on by link — shown in the Radio directory and on your profile
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white shrink-0 transition-all"
          style={{ background: 'linear-gradient(135deg,#6B0099,#D40055)', boxShadow: '0 6px 22px rgba(212,0,85,0.34)' }}
        >
          <Plus size={14} /> Link a station
        </button>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-10 text-white/40">
          <Loader2 size={22} className="animate-spin text-[#00DAF3]" />
        </div>
      ) : stations.length === 0 ? (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full p-8 rounded-2xl border border-dashed border-white/15 text-white/40 hover:bg-white/5 hover:text-white/60 transition-colors flex flex-col items-center justify-center gap-2"
        >
          <Radio size={22} />
          <span className="text-[11px] font-black uppercase tracking-widest">Link your first station</span>
          <span className="text-[10px] text-white/30 normal-case tracking-normal">Paste the public stream URL you already broadcast on</span>
        </button>
      ) : (
        <div className="space-y-3">
          {stations.map(s => {
            const blocked = !s.isSecure && isSecurePage;
            const confirming = confirmId === s.id;
            const removing = removingId === s.id;
            return (
              <div key={s.id} className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                {/* Favicon / gradient */}
                <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-black flex items-center justify-center">
                  {s.favicon ? (
                    <img src={s.favicon} alt="" loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <span className="w-full h-full flex items-center justify-center" style={{ background: 'radial-gradient(80% 80% at 30% 25%, #00DAF3 0%, transparent 60%), radial-gradient(70% 70% at 75% 70%, #6B0099 0%, transparent 62%), linear-gradient(140deg,#04222A,#2A0033)' }}>
                      <Radio size={18} className="text-white/70" />
                    </span>
                  )}
                </div>

                {/* Meta */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-black text-white truncate">{s.name}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/35 truncate mt-0.5">
                    {[s.genre, s.country].filter(Boolean).join(' · ') || 'Live broadcast'}
                    {s.codec ? ` · ${s.codec}${s.bitrate ? ` ${s.bitrate}k` : ''}` : ''}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {s.lastCheckOk && !blocked ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                        <CheckCircle2 size={9} /> Verified
                      </span>
                    ) : blocked ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-amber-500/15 text-amber-300 border border-amber-500/25">
                        <ShieldAlert size={9} /> http · web-blocked
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-white/5 text-white/40 border border-white/10">
                        Unverified
                      </span>
                    )}
                    {s.isHls && (
                      <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-white/5 text-white/40 border border-white/10">HLS</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {s.homepage && (
                    <a
                      href={s.homepage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                      title="Open station site"
                    >
                      <ExternalLink size={15} />
                    </a>
                  )}
                  {confirming ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => remove(s.id)}
                        disabled={removing}
                        className="px-3 py-2 rounded-xl bg-red-500 text-white text-[9px] font-black uppercase tracking-widest hover:bg-red-600 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                      >
                        {removing ? <Loader2 size={12} className="animate-spin" /> : null} Remove
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="px-3 py-2 rounded-xl bg-white/5 text-white/50 text-[9px] font-black uppercase tracking-widest hover:text-white transition-colors"
                      >
                        Keep
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmId(s.id)}
                      className="p-2.5 rounded-xl bg-white/5 hover:bg-red-500/20 text-white/50 hover:text-red-400 transition-colors"
                      title="Unlink station"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <p className="text-[10px] text-white/30 flex items-center gap-1.5 pt-1">
            <Globe size={11} /> Linked stations are public — anyone can find them in the Radio directory.
          </p>
        </div>
      )}

      {showAdd && (
        <AddStationModal
          ownerUid={uid}
          ownerName={ownerName}
          ownerAvatar={ownerAvatar}
          onClose={() => setShowAdd(false)}
          onAdded={(station) => { setShowAdd(false); setStations(prev => [station, ...prev]); }}
        />
      )}
    </div>
  );
};

export default LinkedStationsManager;

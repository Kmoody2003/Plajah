import React, { useEffect, useState } from 'react';
import { Check, Eye, Loader2, ShieldCheck } from 'lucide-react';
import type { HqSecurityAlert } from '../services/hqSecurityAlerts';
import { dismissHqAlert, fetchHqAlerts, markHqAlertsSeen } from '../services/hqSecurityClient';

const TEAL = '#34e0d0';

/** Owner and IT Admin only: the server refuses everyone else. Quiet unless there's something to do. */
const HqSecurityAlerts: React.FC<{
  scope: { kind: string; id: string };
  onOpenFile: (assetId: string) => void;
  onSeen?: () => void;
}> = ({ scope, onOpenFile, onSeen }) => {
  const [alerts, setAlerts] = useState<HqSecurityAlert[] | null>(null);

  useEffect(() => {
    let live = true;
    fetchHqAlerts(scope).then(r => { if (live) setAlerts(r?.alerts || []); });
    markHqAlertsSeen(scope).then(() => onSeen?.());
    return () => { live = false; };
  }, [scope.kind, scope.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!alerts) return <div className="grid place-items-center h-40 text-white/40"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!alerts.length) {
    return <div className="grid place-items-center h-48 text-center px-8">
      <div>
        <ShieldCheck className="w-7 h-7 mx-auto mb-3" style={{ color: `${TEAL}99` }} />
        <div className="text-sm font-semibold text-white/70">Nothing needs your attention.</div>
        <p className="text-xs text-white/35 mt-1">If something does, it will show up here.</p>
      </div>
    </div>;
  }
  return <div className="h-full overflow-y-auto space-y-2 max-w-3xl">
    {alerts.map(a => <div key={a.id} className="flex items-start gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/8">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold">{a.title}</div>
        <p className="text-xs text-white/50 mt-1 leading-relaxed">{a.detail}</p>
        <div className="text-[10px] text-white/30 mt-1.5">{new Date(a.at).toLocaleString()}</div>
      </div>
      <div className="flex gap-1.5 shrink-0">
        {a.action === 'open_file' && a.assetId && <button onClick={() => onOpenFile(a.assetId!)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 text-white/70 hover:text-white text-[10px] font-black uppercase tracking-widest"><Eye className="w-3.5 h-3.5" /> Open file</button>}
        <button onClick={async () => { setAlerts(rows => (rows || []).filter(x => x.id !== a.id)); await dismissHqAlert(scope, a.id); }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 text-white/70 hover:text-white text-[10px] font-black uppercase tracking-widest"><Check className="w-3.5 h-3.5" /> Done</button>
      </div>
    </div>)}
  </div>;
};

export default HqSecurityAlerts;

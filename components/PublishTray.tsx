// PublishTray — the notification-tray surface for background project uploads. Shows every publish
// job from the PublishQueue with live progress; click a job to open its detail ("workload dashboard")
// with full status + retry. Collapses to a compact chip. Multiple uploads run at once and each has
// its own row here.

import React, { useState } from 'react';
import { UploadCloud, ChevronDown, ChevronUp, X, RotateCcw, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { usePublishQueue } from '../contexts/PublishQueueContext';

const T = { panel: '#12121a', border: '#23232f', ink: '#fff', muted: '#9a9aa6', orange: '#FF8C00', green: '#5fd17f', red: '#e2473b', font: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" };

const PublishTray: React.FC = () => {
  const { jobs, remove, clearFinished, retry } = usePublishQueue();
  const [min, setMin] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  if (!jobs.length) return null;
  const running = jobs.filter(j => j.status === 'RUNNING').length;
  const done = jobs.filter(j => j.status === 'DONE').length;

  return (
    <div style={{ position: 'fixed', bottom: 24, left: 24, zIndex: 320, width: 330, maxWidth: '92vw', fontFamily: T.font }}>
      <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 18, overflow: 'hidden', boxShadow: '0 18px 50px rgba(0,0,0,0.5)' }}>
        {/* header */}
        <div onClick={() => setMin(m => !m)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer', background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(255,140,0,0.15)', color: T.orange, display: 'grid', placeItems: 'center' }}>
            {running > 0 ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, color: T.ink }}>{running > 0 ? `Publishing ${running}…` : 'Uploads'}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{done} done · {jobs.length} total</div>
          </div>
          {jobs.some(j => j.status !== 'RUNNING') && <button onClick={e => { e.stopPropagation(); clearFinished(); }} title="Clear finished" style={{ background: 'transparent', border: 'none', color: T.muted, fontSize: 9, fontWeight: 800, cursor: 'pointer', textTransform: 'uppercase' }}>Clear</button>}
          <span style={{ color: T.muted }}>{min ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
        </div>

        {!min && (
          <div style={{ maxHeight: '52vh', overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {jobs.map(j => {
              const open = openId === j.id;
              const color = j.status === 'ERROR' ? T.red : j.status === 'DONE' ? T.green : T.orange;
              return (
                <div key={j.id} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
                  <button onClick={() => setOpenId(open ? null : j.id)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: '9px 11px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {j.status === 'RUNNING' ? <Loader2 size={12} className="animate-spin" style={{ color }} /> : j.status === 'DONE' ? <CheckCircle2 size={12} style={{ color }} /> : <AlertCircle size={12} style={{ color }} />}
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.title}</span>
                      <span style={{ fontSize: 9, fontWeight: 800, color: T.muted, textTransform: 'uppercase' }}>{j.kind}</span>
                      <span style={{ fontSize: 10, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{j.status === 'RUNNING' ? `${j.percent}%` : ''}</span>
                    </div>
                    <div style={{ marginTop: 7, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 9, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${j.percent}%`, background: color, transition: 'width 300ms' }} />
                    </div>
                  </button>
                  {open && (
                    <div style={{ padding: '0 11px 11px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 11, color: T.muted }}>{j.error || j.text}</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {j.status === 'ERROR' && <button onClick={() => retry(j.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: `1px solid ${T.orange}`, background: 'transparent', color: T.orange, fontSize: 10, fontWeight: 800, cursor: 'pointer' }}><RotateCcw size={11} /> Retry</button>}
                        <button onClick={() => remove(j.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: `1px solid ${T.border}`, background: 'transparent', color: T.muted, fontSize: 10, fontWeight: 800, cursor: 'pointer' }}><X size={11} /> Dismiss</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PublishTray;

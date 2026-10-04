import React, { useState } from 'react';
import { FlaskConical, Video } from 'lucide-react';
import { ensureGuestAuth } from '../../services/backendService';
import TelehealthPatientView from './TelehealthPatientView';

/** Standalone page for ?telehealth=<session>: the "patient" opens the link, accepts the demo notice, and joins. */
export const TelehealthJoinPage: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('telehealth') || '';
  const [name, setName] = useState(params.get('n') || 'Demo Patient');
  const [agreed, setAgreed] = useState(false);
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!/^thdemo-[a-z0-9]{10,}$/.test(sessionId)) {
    return <div className="min-h-screen bg-[#07030d] text-white flex items-center justify-center p-6 text-sm text-white/60">This visit link isn't valid.</div>;
  }
  if (joined) return <TelehealthPatientView sessionId={sessionId} patientName={name.trim() || 'Demo Patient'} onLeave={() => setJoined(false)} />;

  const join = async () => {
    setBusy(true); setErr(null);
    const user = await ensureGuestAuth();
    if (!user) { setErr("Guest access isn't turned on yet. Open this link in a browser where you're signed in to Plajah (any test account works), then join."); setBusy(false); return; }
    setJoined(true); setBusy(false);
  };

  return (
    <div className="min-h-screen bg-[#07030d] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-7 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#00DAF3]/10 text-[#00DAF3] flex items-center justify-center"><Video size={22} /></div>
          <div>
            <h1 className="text-lg font-black font-['Space_Grotesk']">Join your video visit</h1>
            <p className="text-xs text-white/50">Plajah telehealth · demo</p>
          </div>
        </div>
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4 text-xs text-amber-100/90 space-y-1.5">
          <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-[10px] text-amber-300"><FlaskConical size={13} /> Demonstration only</div>
          <p>This is a product demo with a fictional patient. It is not a medical visit. Do not share real health information.</p>
          <p>Your camera and microphone will be used for the call. The call is not recorded.</p>
        </div>
        <label className="block text-xs text-white/60">Your (demo) name
          <input value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-sm text-white outline-none focus:border-[#00DAF3]" />
        </label>
        <label className="flex items-start gap-3 text-sm text-white/80 cursor-pointer">
          <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-1 accent-[#00DAF3]" />
          I understand this is a demo and I'll share only fictional information.
        </label>
        {err && <p className="text-xs text-red-300">{err}</p>}
        <button disabled={!agreed || busy} onClick={join} className="w-full py-3 rounded-2xl bg-[#00DAF3] text-black font-black text-sm disabled:opacity-30 disabled:cursor-not-allowed">
          {busy ? 'Starting…' : 'Join with camera & mic'}
        </button>
      </div>
    </div>
  );
};

export default TelehealthJoinPage;

// Copyright notice intake (routes/copyright.ts). The same completeness check runs here and on the
// server (services/legal/copyrightCore.ts), so the sender sees exactly what a valid notice still needs.
import React, { useMemo, useState } from 'react';
import { ShieldAlert, Loader, CheckCircle, AlertCircle, FileText, ExternalLink } from 'lucide-react';
import { auth } from '../services/firebase';
import { COPYRIGHT_AGENT_EMAIL, missingElements, parseNotice, type NoticeKind } from '../services/legal/copyrightCore';

const REQUEST_TYPES: { value: NoticeKind; label: string; description: string }[] = [
  { value: 'takedown', label: 'DMCA Takedown', description: 'I own the copyright (or act for the owner) and want material removed' },
  { value: 'counter', label: 'Counter-Notice', description: 'My material was removed by mistake or misidentification' },
  { value: 'dispute', label: 'License Dispute', description: 'A licensing or credit issue that is not a DMCA matter' },
];

const input = 'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30';

export default function DMCARequestForm({ initialKind = 'takedown', noticeId = '' }: { initialKind?: NoticeKind; noticeId?: string }) {
  const [form, setForm] = useState({
    kind: initialKind, name: '', email: '', phone: '', address: '', country: '', org: '', onBehalfOf: '',
    urls: '', originalWork: '', description: '', noticeId,
    goodFaith: false, perjury: false, consentJurisdiction: false, acceptService: false, signature: '',
  });
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [ref, setRef] = useState('');

  const set = (key: keyof typeof form, value: any) => setForm((f) => ({ ...f, [key]: value }));
  const notice = useMemo(() => parseNotice(form), [form]);
  const missing = useMemo(() => missingElements(notice), [notice]);
  const counter = form.kind === 'counter';
  const dispute = form.kind === 'dispute';
  const signedIn = !!auth.currentUser;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (missing.length) return;
    setStatus('loading'); setError('');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (counter) {
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error('Sign in to the account that posted the material.');
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(counter ? '/api/copyright/counter' : '/api/copyright/notice', { method: 'POST', headers, body: JSON.stringify(notice) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.missing?.length ? `Still needed: ${body.missing.join(', ')}.` : body?.error || `HTTP ${res.status}`);
      setRef(String(body.id || ''));
      setStatus('success');
    } catch (err: any) {
      setError(err?.message || 'Submission failed.');
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className="rounded-2xl bg-white/[0.03] border border-white/5 p-8 text-center">
        <CheckCircle size={48} className="text-green-400 mx-auto mb-4" />
        <h3 className="text-xl font-bold mb-2">Received · {ref}</h3>
        <p className="text-white/50 text-sm max-w-sm mx-auto">
          {counter
            ? 'We sent a copy to the person who filed the original notice. Unless they tell us they have filed a court action, your material is restored 10 to 14 business days from today.'
            : dispute
              ? `We'll look into it and reply at ${form.email}.`
              : `A confirmation is on its way to ${form.email}. We review complete notices promptly and email you the outcome.`}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5">
        <div className="flex items-center gap-2 text-amber-400 mb-2">
          <ShieldAlert size={16} />
          <span className="font-bold text-sm">Important legal notice</span>
        </div>
        <p className="text-xs text-white/50">
          Under 17 U.S.C. § 512(f), anyone who knowingly misrepresents that material is infringing, or that it was removed
          by mistake, can be liable for damages, including costs and attorney fees. Consider fair use before filing.
          Your notice, including your contact details, may be shared with the person whose material it concerns.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2 mb-2">
          <FileText size={18} className="text-orange-400" />
          <h3 className="font-bold">Copyright notice</h3>
        </div>

        <div>
          <label className="block text-xs text-white/40 mb-2">Request type *</label>
          <div className="grid grid-cols-1 gap-2">
            {REQUEST_TYPES.map(({ value, label, description }) => (
              <button key={value} type="button" onClick={() => set('kind', value)}
                className={`p-3 rounded-xl border text-left transition-colors ${form.kind === value ? 'bg-orange-500/10 border-orange-500/40' : 'bg-white/[0.02] border-white/5 hover:bg-white/5'}`}>
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-white/40">{description}</div>
              </button>
            ))}
          </div>
          {counter && !signedIn && <p className="mt-2 text-xs text-amber-300">Sign in to the account that posted the material to file a counter-notice.</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Legal name *</label>
            <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} className={input} placeholder="Your full legal name" />
          </div>
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Email address *</label>
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={input} placeholder="your@email.com" />
          </div>
          {!dispute && (
            <>
              <div>
                <label className="block text-xs text-white/40 mb-1.5">Phone *</label>
                <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} className={input} placeholder="+1 555 555 5555" />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1.5">Country *</label>
                <input type="text" value={form.country} onChange={(e) => set('country', e.target.value)} className={input} placeholder="United States" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-white/40 mb-1.5">Mailing address *</label>
                <input type="text" value={form.address} onChange={(e) => set('address', e.target.value)} className={input} placeholder="Street, city, state / region, postal code" />
              </div>
            </>
          )}
        </div>

        {form.kind === 'takedown' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-white/40 mb-1.5">Company / organization</label>
              <input type="text" value={form.org} onChange={(e) => set('org', e.target.value)} className={input} placeholder="Label, publisher, studio…" />
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1.5">Acting for (if not yourself)</label>
              <input type="text" value={form.onBehalfOf} onChange={(e) => set('onBehalfOf', e.target.value)} className={input} placeholder="The copyright owner you represent" />
            </div>
          </div>
        )}

        {counter && (
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Notice reference (from your removal message)</label>
            <input type="text" value={form.noticeId} onChange={(e) => set('noticeId', e.target.value)} className={input} placeholder="tk_…" />
          </div>
        )}

        {!dispute && (
          <div>
            <label className="block text-xs text-white/40 mb-1.5">
              {counter ? 'Where the material was on Plajah (one link per line) *' : 'Links to the infringing material on Plajah (one per line) *'}
            </label>
            <textarea rows={3} value={form.urls} onChange={(e) => set('urls', e.target.value)} className={`${input} resize-none`} placeholder="https://plajah.com/..." />
          </div>
        )}

        {form.kind === 'takedown' && (
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Where your original work can be found</label>
            <input type="text" value={form.originalWork} onChange={(e) => set('originalWork', e.target.value)} className={input} placeholder="Link, registration number, or release details" />
          </div>
        )}

        <div>
          <label className="block text-xs text-white/40 mb-1.5">
            {counter ? 'What was removed, and why the removal was a mistake *' : dispute ? 'Describe the issue *' : 'Identify the copyrighted work and how it is infringed *'}
          </label>
          <textarea rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} className={`${input} resize-none`} />
        </div>

        {!dispute && (
          <div className="space-y-3">
            {form.kind === 'takedown' && (
              <Check checked={form.goodFaith} onChange={(v) => set('goodFaith', v)}>
                I have a good-faith belief that the use of the material described above is not authorized by the copyright owner, its agent, or the law.
              </Check>
            )}
            <Check checked={form.perjury} onChange={(v) => set('perjury', v)}>
              {counter
                ? 'Under penalty of perjury, I have a good-faith belief that the material was removed or disabled as a result of mistake or misidentification.'
                : 'Under penalty of perjury, the information in this notice is accurate, and I am the copyright owner or authorized to act on the owner’s behalf.'}
            </Check>
            {counter && (
              <>
                <Check checked={form.consentJurisdiction} onChange={(v) => set('consentJurisdiction', v)}>
                  I consent to the jurisdiction of the Federal District Court for the judicial district of my address (or, if my address is outside the United States, any judicial district in which Plajah may be found).
                </Check>
                <Check checked={form.acceptService} onChange={(v) => set('acceptService', v)}>
                  I will accept service of process from the person who provided the original notice, or their agent.
                </Check>
              </>
            )}
          </div>
        )}

        <div>
          <label className="block text-xs text-white/40 mb-1.5">Electronic signature (type your full legal name) *</label>
          <input type="text" value={form.signature} onChange={(e) => set('signature', e.target.value)} className={`${input} italic`} placeholder="Type your full name as your electronic signature" />
        </div>

        {missing.length > 0 && (form.name || form.email) && (
          <p className="text-xs text-white/40">Still needed: {missing.join(', ')}.</p>
        )}
        {status === 'error' && (
          <div className="flex items-start gap-2 text-red-400 text-sm">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{error} You can also email {COPYRIGHT_AGENT_EMAIL}.</span>
          </div>
        )}

        <button type="submit" disabled={missing.length > 0 || status === 'loading' || (counter && !signedIn)}
          className="w-full py-3 bg-orange-500 text-black font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-orange-400 transition-colors disabled:opacity-40">
          {status === 'loading' ? <><Loader size={16} className="animate-spin" /> Submitting…</> : counter ? 'Submit counter-notice' : dispute ? 'Send' : 'Submit DMCA notice'}
        </button>

        <p className="text-center text-xs text-white/25">
          Or email our designated agent at{' '}
          <a href={`mailto:${COPYRIGHT_AGENT_EMAIL}`} className="underline hover:text-white/40">{COPYRIGHT_AGENT_EMAIL}</a>.
        </p>
      </form>

      <div className="text-center">
        <a href="https://www.copyright.gov/dmca/" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-white/25 hover:text-white/40 transition-colors">
          <ExternalLink size={12} />
          Learn about DMCA at copyright.gov
        </a>
      </div>
    </div>
  );
}

const Check: React.FC<{ checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }> = ({ checked, onChange, children }) => (
  <label className="flex items-start gap-3 cursor-pointer">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 accent-orange-500" />
    <span className="text-xs text-white/60">{children}</span>
  </label>
);

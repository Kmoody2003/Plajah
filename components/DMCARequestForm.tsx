import React, { useState } from 'react';
import { ShieldAlert, Loader, CheckCircle, AlertCircle, FileText, ExternalLink } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase';

type RequestType = 'takedown' | 'counter' | 'license_dispute';

const REQUEST_TYPES: { value: RequestType; label: string; description: string }[] = [
  { value: 'takedown', label: 'DMCA Takedown', description: 'I own the copyright and want content removed' },
  { value: 'counter', label: 'Counter-Notice', description: 'Content was wrongly removed from my account' },
  { value: 'license_dispute', label: 'License Dispute', description: 'I have a licensing issue that is not a DMCA matter' },
];

export default function DMCARequestForm() {
  const [form, setForm] = useState({
    requestType: 'takedown' as RequestType,
    claimantName: '',
    claimantEmail: '',
    claimantOrg: '',
    infringingUrl: '',
    originalWorkUrl: '',
    copyrightedWorkDescription: '',
    ownershipStatement: '',
    goodFaithBelief: false,
    accuracyPenaltyAcknowledged: false,
    signature: '',
  });

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const set = (key: keyof typeof form, value: any) =>
    setForm((f) => ({ ...f, [key]: value }));

  const canSubmit =
    form.claimantName &&
    form.claimantEmail &&
    form.infringingUrl &&
    form.copyrightedWorkDescription &&
    form.goodFaithBelief &&
    form.accuracyPenaltyAcknowledged &&
    form.signature;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setStatus('loading');
    try {
      await addDoc(collection(db, 'dmca_requests'), {
        ...form,
        status: 'received',
        createdAt: serverTimestamp(),
        targetedForRemoval: null,
        reviewedAt: null,
        reviewedBy: null,
      });
      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className="rounded-2xl bg-white/[0.03] border border-white/5 p-8 text-center">
        <CheckCircle size={48} className="text-green-400 mx-auto mb-4" />
        <h3 className="text-xl font-bold mb-2">Request received</h3>
        <p className="text-white/50 text-sm max-w-sm mx-auto">
          We'll review your DMCA {form.requestType === 'counter' ? 'counter-notice' : 'request'} within
          <strong className="text-white"> 3–5 business days</strong> and respond at {form.claimantEmail}.
          If the request is valid, the content will be removed within 24 hours of our review.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Legal notice */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5">
        <div className="flex items-center gap-2 text-amber-400 mb-2">
          <ShieldAlert size={16} />
          <span className="font-bold text-sm">Important legal notice</span>
        </div>
        <p className="text-xs text-white/50">
          Filing a false DMCA notice is a crime under 17 U.S.C. § 512(f) and may result in
          liability for damages including attorney fees. Only submit this form if you are the
          copyright owner or authorized to act on their behalf.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2 mb-2">
          <FileText size={18} className="text-orange-400" />
          <h3 className="font-bold">DMCA / Copyright Request</h3>
        </div>

        {/* Request type */}
        <div>
          <label className="block text-xs text-white/40 mb-2">Request type *</label>
          <div className="grid grid-cols-1 gap-2">
            {REQUEST_TYPES.map(({ value, label, description }) => (
              <button
                key={value}
                type="button"
                onClick={() => set('requestType', value)}
                className={`p-3 rounded-xl border text-left transition-colors ${
                  form.requestType === value
                    ? 'bg-orange-500/10 border-orange-500/40'
                    : 'bg-white/[0.02] border-white/5 hover:bg-white/5'
                }`}
              >
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-white/40">{description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Claimant info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Legal name *</label>
            <input
              type="text"
              required
              value={form.claimantName}
              onChange={(e) => set('claimantName', e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30"
              placeholder="Your full legal name"
            />
          </div>
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Email address *</label>
            <input
              type="email"
              required
              value={form.claimantEmail}
              onChange={(e) => set('claimantEmail', e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30"
              placeholder="your@email.com"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-white/40 mb-1.5">Company / Organization (if applicable)</label>
          <input
            type="text"
            value={form.claimantOrg}
            onChange={(e) => set('claimantOrg', e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30"
            placeholder="Record label, studio, publisher, etc."
          />
        </div>

        {/* Infringing content */}
        <div>
          <label className="block text-xs text-white/40 mb-1.5">
            URL of the infringing content on Plajah *
          </label>
          <input
            type="url"
            required
            value={form.infringingUrl}
            onChange={(e) => set('infringingUrl', e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30"
            placeholder="https://plajah.com/..."
          />
        </div>

        <div>
          <label className="block text-xs text-white/40 mb-1.5">
            URL or description of the original copyrighted work
          </label>
          <input
            type="text"
            value={form.originalWorkUrl}
            onChange={(e) => set('originalWorkUrl', e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30"
            placeholder="Link or description of your original work"
          />
        </div>

        <div>
          <label className="block text-xs text-white/40 mb-1.5">
            Describe the copyrighted work and how it is being infringed *
          </label>
          <textarea
            required
            rows={4}
            value={form.copyrightedWorkDescription}
            onChange={(e) => set('copyrightedWorkDescription', e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 resize-none"
            placeholder="Describe the original work you own and how the content at the URL above infringes on it..."
          />
        </div>

        {/* Statutory declarations */}
        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.goodFaithBelief}
              onChange={(e) => set('goodFaithBelief', e.target.checked)}
              className="mt-0.5 accent-orange-500"
            />
            <span className="text-xs text-white/60">
              I have a good-faith belief that the use of the copyrighted material described above
              is not authorized by the copyright owner, its agent, or the law.
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.accuracyPenaltyAcknowledged}
              onChange={(e) => set('accuracyPenaltyAcknowledged', e.target.checked)}
              className="mt-0.5 accent-orange-500"
            />
            <span className="text-xs text-white/60">
              Under penalty of perjury, the information in this notice is accurate, and I am
              the copyright owner or authorized to act on the owner's behalf.
            </span>
          </label>
        </div>

        {/* Electronic signature */}
        <div>
          <label className="block text-xs text-white/40 mb-1.5">
            Electronic signature (type your full legal name) *
          </label>
          <input
            type="text"
            required
            value={form.signature}
            onChange={(e) => set('signature', e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 italic"
            placeholder="Type your full name as your electronic signature"
          />
        </div>

        {status === 'error' && (
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle size={14} />
            Submission failed. Email dmca@plajah.com directly.
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit || status === 'loading'}
          className="w-full py-3 bg-orange-500 text-black font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-orange-400 transition-colors disabled:opacity-40"
        >
          {status === 'loading' ? (
            <><Loader size={16} className="animate-spin" /> Submitting…</>
          ) : (
            'Submit DMCA request'
          )}
        </button>

        <p className="text-center text-xs text-white/25">
          You can also email{' '}
          <a href="mailto:dmca@plajah.com" className="underline hover:text-white/40">
            dmca@plajah.com
          </a>{' '}
          directly. We respond within 3–5 business days.
        </p>
      </form>

      {/* Reference */}
      <div className="text-center">
        <a
          href="https://www.copyright.gov/dmca/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-white/25 hover:text-white/40 transition-colors"
        >
          <ExternalLink size={12} />
          Learn about DMCA at copyright.gov
        </a>
      </div>
    </div>
  );
}

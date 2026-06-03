import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { CheckCircle, Loader, AlertCircle } from 'lucide-react';

export type WaitlistSegment = 'music' | 'film' | 'writer' | 'worldbuilder' | 'general';

interface Props {
  segment: WaitlistSegment;
  onSuccess?: () => void;
}

const SEGMENT_LABELS: Record<WaitlistSegment, { title: string; color: string; placeholder: string }> = {
  music: {
    title: 'Founding Musician',
    color: 'bg-orange-500',
    placeholder: 'Link to your music (SoundCloud, Spotify, YouTube, etc.)',
  },
  film: {
    title: 'Founding Director',
    color: 'bg-blue-500',
    placeholder: 'Link to your film, IMDb page, or Vimeo portfolio',
  },
  writer: {
    title: 'Founding Writer',
    color: 'bg-emerald-500',
    placeholder: 'Link to your publication, Substack, or portfolio',
  },
  worldbuilder: {
    title: 'Founding Worldbuilder',
    color: 'bg-purple-500',
    placeholder: 'Link to your World Anvil, Notion, or any world-building work',
  },
  general: {
    title: 'Founding Creator',
    color: 'bg-orange-500',
    placeholder: 'Link to your best work',
  },
};

const NEEDS_OPTIONS = [
  'Direct fan revenue / memberships',
  'Music / video distribution',
  'Own FAST TV channel',
  'E-book / article publishing',
  'Fan community tools',
  'Better analytics',
  'Replace multiple tools with one',
];

export default function FoundingCreatorWaitlist({ segment, onSuccess }: Props) {
  const cfg = SEGMENT_LABELS[segment];

  const [form, setForm] = useState({
    name: '',
    email: '',
    workLink: '',
    needs: [] as string[],
    message: '',
  });
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'duplicate' | 'error'>('idle');

  const set = (key: keyof typeof form, value: any) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggleNeed = (need: string) =>
    set('needs', form.needs.includes(need)
      ? form.needs.filter((n) => n !== need)
      : [...form.needs, need]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return;

    setStatus('loading');
    try {
      // Check for duplicate email in this segment
      const q = query(
        collection(db, 'founding_creator_waitlist'),
        where('email', '==', form.email.toLowerCase()),
        where('segment', '==', segment)
      );
      const existing = await getDocs(q);
      if (!existing.empty) {
        setStatus('duplicate');
        return;
      }

      await addDoc(collection(db, 'founding_creator_waitlist'), {
        name: form.name.trim(),
        email: form.email.toLowerCase().trim(),
        workLink: form.workLink.trim(),
        needs: form.needs,
        message: form.message.trim(),
        segment,
        createdAt: serverTimestamp(),
        status: 'pending',
        tier: 'founding',
      });

      setStatus('success');
      onSuccess?.();
    } catch {
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-8 text-center">
        <CheckCircle size={48} className="text-green-400 mx-auto mb-4" />
        <h3 className="text-xl font-bold mb-2">You're on the list!</h3>
        <p className="text-white/50 text-sm">
          We'll review your application within 48 hours and reach out at {form.email}.
          Look for an email from team@plajah.com.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-white/40 mb-1.5">Your name *</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30"
            placeholder="Full name or artist name"
          />
        </div>
        <div>
          <label className="block text-xs text-white/40 mb-1.5">Email address *</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30"
            placeholder="you@email.com"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-white/40 mb-1.5">Link to your work</label>
        <input
          type="url"
          value={form.workLink}
          onChange={(e) => set('workLink', e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30"
          placeholder={cfg.placeholder}
        />
      </div>

      <div>
        <label className="block text-xs text-white/40 mb-2">What do you need most? (pick all that apply)</label>
        <div className="flex flex-wrap gap-2">
          {NEEDS_OPTIONS.map((need) => (
            <button
              key={need}
              type="button"
              onClick={() => toggleNeed(need)}
              className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                form.needs.includes(need)
                  ? 'bg-white/10 border-white/30 text-white'
                  : 'bg-transparent border-white/10 text-white/40 hover:border-white/20'
              }`}
            >
              {need}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs text-white/40 mb-1.5">Anything else we should know?</label>
        <textarea
          value={form.message}
          onChange={(e) => set('message', e.target.value)}
          rows={3}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 resize-none"
          placeholder="Tell us about your work, audience size, what you're trying to do..."
        />
      </div>

      {status === 'duplicate' && (
        <div className="flex items-center gap-2 text-yellow-400 text-sm">
          <AlertCircle size={16} />
          You're already on the list for this segment! We'll be in touch.
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle size={16} />
          Something went wrong. Try again or email team@plajah.com directly.
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'loading' || !form.name || !form.email}
        className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-40 ${cfg.color} text-black`}
      >
        {status === 'loading' && <Loader size={16} className="animate-spin" />}
        Apply for a {cfg.title} spot
      </button>

      <p className="text-center text-xs text-white/25">
        No spam. We'll only email you about your application and Plajah launch updates.
      </p>
    </form>
  );
}

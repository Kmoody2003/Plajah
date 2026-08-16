// DisclosureAssist — the one screen a teacher sees when they activate their Independent persona.
//
// Most districts (Detroit PSCD included) permit outside employment; what gets teachers into
// trouble is failing to DISCLOSE it, or using district time and resources. Plajah can enforce
// the second half automatically. The first half is the one step only the teacher can take — so
// this screen makes it as close to one tap as it can be: generate the letter, hand it to HR.
//
// Cheap to build, and it pre-empts the single most common way this goes wrong.

import React, { useState } from 'react';
import { FileText, Check, ShieldCheck, Loader2 } from 'lucide-react';
import { T, cardStyle, btn, downloadText } from './integrityTheme';

interface Props {
  teacherName: string;
  districtName: string;
  /** Persist the acknowledgement (writes integritySettings.disclosureAcknowledged + a log entry). */
  onAcknowledge: () => Promise<boolean>;
  onDone?: () => void;
}

export function buildDisclosureLetter(teacherName: string, districtName: string): string {
  const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  return [
    today,
    '',
    `To: Human Resources, ${districtName}`,
    'Re: Disclosure of outside employment',
    '',
    'Dear HR team,',
    '',
    'In line with district policy on outside employment, I am writing to disclose that I',
    'operate an independent teaching practice on the Plajah platform. This work takes place',
    'entirely outside of contracted hours and without the use of district time, facilities,',
    'equipment, or materials.',
    '',
    'The platform enforces that separation technically rather than leaving it to my judgement:',
    '',
    '  1. My independent tools are automatically disabled while I am on school grounds or',
    '     within my contracted hours.',
    '  2. Paid one-to-one tutoring is blocked for any student on my current rosters, and that',
    '     block lifts only when the term ends.',
    '  3. Every instance of the above is written to an exportable log that I can share with',
    '     the district on request.',
    '',
    'I am happy to provide that log, or to answer any questions about how the separation works.',
    '',
    'Sincerely,',
    teacherName,
  ].join('\n');
}

const DisclosureAssist: React.FC<Props> = ({ teacherName, districtName, onAcknowledge, onDone }) => {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = () => {
    downloadText(
      'outside-employment-disclosure.txt',
      buildDisclosureLetter(teacherName || 'Your name', districtName || 'your district'),
    );
  };

  const acknowledge = async () => {
    setBusy(true);
    setError(null);
    try {
      const ok = await onAcknowledge();
      if (ok) { setDone(true); onDone?.(); }
      else setError("We couldn't record that just now. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ ...cardStyle, padding: 22, maxWidth: 560, fontFamily: T.font, color: T.ink }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center',
          background: `linear-gradient(135deg, ${T.purple}, ${T.magenta})`,
        }}>
          <ShieldCheck size={17} />
        </div>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 900 }}>Before you open your practice</h2>
      </div>

      <p style={{ color: T.muted, fontSize: 14.5, lineHeight: 1.7, margin: '0 0 12px' }}>
        Most districts allow outside teaching, as long as it doesn't conflict with your duties and
        you disclose it. Plajah keeps you on the right side of the second part automatically —
        Silent Mode on campus, a block on paid tutoring for your current students, and a log you own.
      </p>
      <p style={{ color: T.muted, fontSize: 14.5, lineHeight: 1.7, margin: '0 0 18px' }}>
        The one step only you can take is telling your district. Here's a letter that makes it easy.
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={download} style={btn('outline', T.cyan)}>
          <FileText size={14} /> Download disclosure letter
        </button>
        {done ? (
          <span style={{ ...btn('outline', T.success), cursor: 'default' }}>
            <Check size={14} /> Acknowledged
          </span>
        ) : (
          <button onClick={acknowledge} disabled={busy} style={{ ...btn('solid', T.orange), opacity: busy ? 0.6 : 1 }}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {busy ? 'Recording…' : "I understand my district's policy"}
          </button>
        )}
      </div>

      {error && <p role="alert" style={{ color: T.danger, fontSize: 12.5, marginTop: 12 }}>{error}</p>}

      <p style={{ fontSize: 12, color: T.faint, lineHeight: 1.6, margin: '18px 0 0' }}>
        District policies vary — read yours, and ask HR if anything is unclear. Plajah can't give
        legal advice, and this letter is a starting point rather than a substitute for your
        district's own disclosure form.
      </p>
    </section>
  );
};

export default DisclosureAssist;

import React, { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { parseRef, refId, formatRef } from '../../services/scriptureRef';
import { fetchRefText, type ResolvedRef } from '../../services/scriptureText';
import { usesScripture, type SchoolProfile } from '../../services/schoolProfile';

/**
 * A short passage for the day, shown only to schools and families that turned scripture on. The
 * list is deliberately broad and well loved (psalms, proverbs, the Sermon on the Mount, the great
 * letters), rotating by date so everyone in a class sees the same passage on the same day.
 */
export const DAILY_PASSAGES = [
  'Psalm 23:1-4', 'Psalm 121:1-2', 'Proverbs 3:5-6', 'Micah 6:8', 'Isaiah 40:28-31', 'Matthew 5:3-10', 'Matthew 6:9-13', 'Luke 10:25-37',
  'John 3:16-17', 'Romans 12:9-18', '1 Corinthians 13:1-8', 'Galatians 5:22-23', 'Philippians 4:4-8', 'Ecclesiastes 3:1-8', 'Psalm 19:1-4',
  'Genesis 1:1-5', 'Joshua 1:9', 'Psalm 46:1-3', 'Proverbs 15:1', 'Colossians 3:12-14', 'James 1:19-20', 'Psalm 100:1-5', 'Psalm 8:3-5',
  'Proverbs 22:6', 'Psalm 139:13-14', 'Matthew 7:12', 'Hebrews 11:1-3', 'Psalm 27:1', 'Deuteronomy 6:4-7', 'Lamentations 3:22-23', 'Micah 4:3-4',
];

const dayIndex = (d = new Date()) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);

const DailyScripture: React.FC<{ school?: SchoolProfile; className?: string }> = ({ school, className }) => {
  const [res, setRes] = useState<ResolvedRef | null>(null);
  const enabled = usesScripture(school);
  const refText = DAILY_PASSAGES[dayIndex() % DAILY_PASSAGES.length];
  useEffect(() => {
    if (!enabled) return;
    let alive = true; const ref = parseRef(refText);
    if (ref) fetchRefText(ref, school!.scripture.translation, 6).then(r => alive && setRes(r)).catch(() => {});
    return () => { alive = false; };
  }, [enabled, refText, school?.scripture?.translation]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!enabled) return null;
  const ref = parseRef(refText);
  return (
    <section className={`rounded-2xl border border-[#fbbf24]/30 bg-[#fbbf24]/[0.06] p-4 ${className || ''}`} aria-label="Passage for today">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#fbbf24] mb-1.5 flex items-center gap-1.5"><BookOpen size={12} /> Passage for today</p>
      {res
        ? <blockquote className="text-[14px] leading-relaxed text-white/90">{res.verses.map(v => <span key={v.verse}><sup className="text-[9px] text-white/40 mr-0.5">{v.verse}</sup>{v.text} </span>)}</blockquote>
        : <p className="text-[13px] text-white/50">{refText}</p>}
      <div className="flex items-center gap-3 mt-2">
        <span className="text-[11px] font-black text-white/60">{ref ? formatRef(ref, 'display') : refText}{res ? ` · ${res.translation}` : ''}</span>
        {ref && <button type="button" onClick={() => { try { window.dispatchEvent(new CustomEvent('OPEN_BIBLE', { detail: { refId: refId(ref) } })); } catch { /* */ } }} className="text-[11px] text-white/45 hover:text-white underline underline-offset-2">Read the chapter</button>}
      </div>
    </section>
  );
};

export default DailyScripture;

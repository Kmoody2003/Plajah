/**
 * VisionModelOffer — in the desktop app, offers the one-time download that lets Argilla name parts by looking at the
 * whole picture (Gemma 4 E4B and its vision projector) instead of guessing from small crops. Shown only when it's
 * missing; the click is the person's consent, and the size is said up front.
 */

import React, { useEffect, useState } from 'react';
import { downloadNativeLlmModel, getNativeLlmStatus, isWindowsApp } from '../../services/windowsBridgeService';

const gb = (bytes: number) => `${(bytes / 1e9).toFixed(1)} GB`;

export default function VisionModelOffer() {
  const [bytes, setBytes] = useState<number | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!isWindowsApp()) return;
    let live = true;
    getNativeLlmStatus().then((s) => { if (live && s.vision === false) setBytes(s.visionDownloadBytes ?? 6.4e9); }).catch(() => {});
    return () => { live = false; };
  }, []);

  if (bytes == null) return null;
  if (note === 'ready') return <p className="text-white/55 leading-snug" role="status">Ready. Your next picture's parts are named by looking at it.</p>;

  const download = async () => {
    setNote('');
    setProgress(0);
    try {
      const done = await downloadNativeLlmModel('gemma-4-vision', (have, total) => setProgress(total ? have / total : 0));
      if (done.success) setNote('ready');
      else setNote(done.error === 'cancelled' ? 'Stopped. It picks up where it left off.' : `Didn't finish: ${done.error ?? 'unknown error'}. Try again to resume it.`);
    } catch (error) {
      setNote(`Didn't finish: ${(error as Error).message}`);
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="flex flex-col gap-1 pt-1 border-t border-white/10">
      <p className="text-white/55 leading-snug">These names are guesses from small crops. A vision model on this PC can look at the whole picture and name each part, and it runs offline.</p>
      {progress == null ? (
        <button onClick={() => void download()} className="py-1 rounded-lg bg-white/10 hover:bg-white/20 font-semibold">Download Gemma 4 vision ({gb(bytes)})</button>
      ) : (
        <div role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Downloading Gemma 4 vision" className="h-1.5 rounded bg-white/10 overflow-hidden">
          <div className="h-full bg-white/70" style={{ width: `${Math.round(progress * 100)}%` }}/>
        </div>
      )}
      {progress != null && <span className="text-[10.5px] text-white/45">{Math.round(progress * 100)}% of {gb(bytes)}. You can keep working.</span>}
      {note && <p className="text-white/55 leading-snug" role="status">{note}</p>}
    </div>
  );
}

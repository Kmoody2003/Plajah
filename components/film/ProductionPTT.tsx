import React, { useEffect, useRef, useState } from 'react';
import { Play, Radio, X } from 'lucide-react';
import { Button, IconButton, Surface, Chip, Eyebrow } from '../ui';
import { playChirp, playRadioTransmission, getAudioContext } from '../../services/walkieTalkie/radioFX';
import {
  sendProductionRadio, subscribeProductionRadio, type ProductionRadioTransmission,
} from '../../services/productionChatService';

interface Props {
  productionId: string;
  channelKey: string;
  channelName: string;
  radioChannel: number;
  selfUid: string;
  selfName: string;
  onClose: () => void;
}

const ProductionPTT: React.FC<Props> = ({ productionId, channelKey, channelName, radioChannel, selfUid, selfName, onClose }) => {
  const [rows, setRows] = useState<ProductionRadioTransmission[]>([]);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState('Standby');
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);

  useEffect(() => subscribeProductionRadio(productionId, channelKey, setRows), [productionId, channelKey]);
  useEffect(() => () => { try { recorder.current?.stop(); } catch {} stream.current?.getTracks().forEach(track => track.stop()); }, []);

  const start = async () => {
    if (recording) return;
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder.current = new MediaRecorder(stream.current);
      chunks.current = [];
      recorder.current.ondataavailable = event => { if (event.data.size) chunks.current.push(event.data); };
      recorder.current.onstop = async () => {
        const durationMs = Date.now() - startedAt.current;
        const blob = new Blob(chunks.current, { type: 'audio/webm' });
        stream.current?.getTracks().forEach(track => track.stop());
        if (durationMs < 300 || !blob.size) { setStatus('Standby'); return; }
        setStatus('Sending…');
        try {
          await sendProductionRadio(productionId, channelKey, radioChannel, selfUid, selfName, blob, durationMs);
          setStatus('Sent'); setTimeout(() => setStatus('Standby'), 900);
        } catch { setStatus('Send failed'); }
      };
      recorder.current.start(); startedAt.current = Date.now(); setRecording(true); setStatus('On air');
      playChirp(getAudioContext(), 'start');
    } catch { setStatus('Microphone blocked'); }
  };
  const stop = () => {
    if (!recording) return;
    setRecording(false); playChirp(getAudioContext(), 'end');
    try { recorder.current?.stop(); } catch {}
  };

  return (
    <Surface level={4} shape="sheet" className="w-[380px] max-w-[94vw] p-4">
      <div className="flex items-start justify-between gap-3">
        <div><Eyebrow>Plajah production PTT</Eyebrow><h3 className="type-title-lg mt-1">{channelName}</h3></div>
        <IconButton variant="ghost" size="sm" aria-label="Close production radio" onClick={onClose}><X /></IconButton>
      </div>
      <div className="mt-4 flex items-center gap-2"><Chip brand><Radio size={12} /> CH {radioChannel}</Chip><Chip selected={recording}>{status}</Chip></div>
      <Button
        variant={recording ? 'accent' : 'secondary'} size="xl" className="mt-4 w-full select-none"
        onPointerDown={start} onPointerUp={stop} onPointerLeave={stop}
      >{recording ? 'Release to send' : 'Hold to talk'}</Button>
      <div className="mt-5 pj-stack-2">
        <p className="type-label-sm text-[var(--text-secondary)]">Recent transmissions</p>
        {rows.length === 0 && <p className="type-body-sm text-[var(--text-secondary)]">No radio traffic on this channel yet.</p>}
        {[...rows].reverse().slice(0, 8).map(row => (
          <Surface key={row.id} level={1} className="flex items-center gap-3 p-3">
            <IconButton variant="accent" size="sm" aria-label={`Play transmission from ${row.fromName}`} onClick={() => playRadioTransmission(row.audioUrl).catch(() => {})}><Play /></IconButton>
            <div className="min-w-0 flex-1"><p className="type-label-lg truncate">{row.fromName}</p><p className="type-body-sm text-[var(--text-secondary)]">{(row.durationMs / 1000).toFixed(1)}s · {new Date(row.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p></div>
          </Surface>
        ))}
      </div>
    </Surface>
  );
};

export default ProductionPTT;

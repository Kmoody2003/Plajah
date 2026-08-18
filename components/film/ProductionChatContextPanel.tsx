import React, { useEffect, useMemo, useState } from 'react';
import { Clock, Radio, Save, ShieldCheck, X } from 'lucide-react';
import type { ChatRoom } from '../../types';
import { buildDailyBrief, subCallSheets, subMembers, type CallSheet, type ProductionMember } from '../../services/filmProductionService';
import { savePersonalProductionNote, subscribePersonalProductionNote } from '../../services/productionChatService';
import { Button, Chip, IconButton, Surface, Textarea, Eyebrow } from '../ui';

const ProductionChatContextPanel: React.FC<{ room: ChatRoom; uid: string; onClose: () => void }> = ({ room, uid, onClose }) => {
  const productionId = room.productionId || '';
  const [members, setMembers] = useState<ProductionMember[]>([]);
  const [sheets, setSheets] = useState<CallSheet[]>([]);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!productionId) return;
    return subMembers(productionId, setMembers);
  }, [productionId]);
  useEffect(() => {
    if (!productionId) return;
    return subCallSheets(productionId, setSheets);
  }, [productionId]);
  useEffect(() => {
    if (!productionId || !uid) return;
    return subscribePersonalProductionNote(productionId, uid, row => setNote(row?.text || ''));
  }, [productionId, uid]);

  const me = members.find(member => member.uid === uid);
  const activeSheet = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return sheets.find(sheet => sheet.status === 'PUBLISHED' && sheet.date === today)
      || [...sheets].filter(sheet => sheet.status === 'PUBLISHED').sort((a, b) => a.shootDay - b.shootDay)[0];
  }, [sheets]);
  const brief = me && activeSheet ? buildDailyBrief(activeSheet, me) : null;

  return (
    <Surface level={4} shape="sheet" className="absolute right-3 top-16 z-50 w-[360px] max-w-[calc(100vw-24px)] max-h-[calc(100%-80px)] overflow-y-auto p-4">
      <div className="flex items-start justify-between gap-3">
        <div><Eyebrow>Production context</Eyebrow><h3 className="type-title-lg mt-1">{room.productionTitle}</h3></div>
        <IconButton variant="ghost" size="sm" aria-label="Close production context" onClick={onClose}><X /></IconButton>
      </div>
      <Surface level={1} className="mt-4 p-4 pj-stack-2">
        <div className="flex flex-wrap gap-2"><Chip brand>#{room.name}</Chip><Chip><Radio size={12} /> CH {room.radioChannel || 1}</Chip><Chip><ShieldCheck size={12} /> Nibbles off</Chip></div>
        <p className="type-body-sm text-[var(--text-secondary)]">{room.channelDescription}</p>
      </Surface>
      {me && (
        <Surface level={1} className="mt-3 p-4 pj-stack-2">
          <Eyebrow>My position</Eyebrow>
          <p className="type-title-md">{me.role}</p>
          <p className="type-body-sm text-[var(--text-secondary)]">{me.dept.replace(/_/g, ' ')} · {me.status}</p>
          {brief && <><div className="flex flex-wrap gap-2"><Chip brand><Clock size={12} /> Call {brief.yourCall}</Chip><Chip><Radio size={12} /> Radio {brief.channel}</Chip></div><p className="type-body-sm text-[var(--text-secondary)]">{brief.focus.slice(0, 2).join(' · ')}</p></>}
        </Surface>
      )}
      <Surface level={1} className="mt-3 p-4">
        <Textarea label="My private production notes" value={note} rows={7} onChange={event => { setNote(event.target.value); setSaved(false); }} placeholder="Your handoff, reminders, questions, and set notes…" />
        <Button className="mt-3" variant={saved ? 'success' : 'secondary'} icon={<Save />} onClick={async () => { await savePersonalProductionNote(productionId, uid, note); setSaved(true); }}>{saved ? 'Saved' : 'Save notes'}</Button>
        <p className="type-body-sm text-[var(--text-secondary)] mt-2">Only you can read or change these notes.</p>
      </Surface>
    </Surface>
  );
};

export default ProductionChatContextPanel;

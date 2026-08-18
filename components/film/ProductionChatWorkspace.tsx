import React, { useEffect, useMemo, useState } from 'react';
import { BellRing, Hash, MessageSquare, Radio, RefreshCw, ShieldCheck, User } from 'lucide-react';
import type { ChatRoom, UserProfile } from '../../types';
import ChatWindow from '../ChatWindow';
import { auth, createChatRoom, fetchChatRooms, fetchUserProfiles } from '../../services/backendService';
import { provisionProductionChat, subscribeProductionRooms } from '../../services/productionChatService';
import { useCall } from '../../contexts/CallContext';
import { Button, Chip, Surface, Eyebrow } from '../ui';
import { useProd } from './FilmProductionSuite';
import ProductionOperationsInbox from './ProductionOperationsInbox';

const ProductionChatWorkspace: React.FC = () => {
  const { prod, members, scenes, callSheets, can, readOnly } = useProd();
  const { placeCall } = useCall();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoom, setActiveRoom] = useState<ChatRoom | null>(null);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [syncing, setSyncing] = useState(false);
  const [workspaceView, setWorkspaceView] = useState<'CHANNELS' | 'WORK'>('CHANNELS');
  const uid = auth.currentUser?.uid || '';
  const canStructure = !!prod && !readOnly && (prod.ownerUid === uid || can('MANAGE_ROSTER') || can('MANAGE_SCHEDULE'));

  useEffect(() => {
    if (!prod) return;
    return subscribeProductionRooms(prod.id, uid, rows => {
      setRooms(rows);
      setActiveRoom(current => current ? rows.find(room => room.id === current.id) || current : rows.find(room => room.productionChannelKey === 'general') || rows[0] || null);
    });
  }, [prod?.id, uid]);
  useEffect(() => {
    const uids = Array.from(new Set(members.map(member => member.uid).filter(Boolean) as string[]));
    if (!uids.length) return;
    fetchUserProfiles(uids).then(rows => setProfiles(Object.fromEntries(rows.map(row => [row.uid, row])))).catch(() => {});
  }, [members]);

  const grouped = useMemo(() => ({
    CORE: rooms.filter(room => ['ANNOUNCEMENTS', 'GENERAL', 'SCHEDULE', 'SAFETY', 'HELP'].includes(room.productionChannelKind || '')),
    DEPARTMENTS: rooms.filter(room => room.productionChannelKind === 'DEPARTMENT'),
    SHOOT_DAYS: rooms.filter(room => room.productionChannelKind === 'SHOOT_DAY'),
  }), [rooms]);

  const sync = async () => {
    if (!prod || !uid) return;
    setSyncing(true);
    try { await provisionProductionChat(prod, members, scenes, callSheets, uid); } finally { setSyncing(false); }
  };
  const openDm = async (memberUid: string) => {
    if (!uid || memberUid === uid) return;
    const id = await createChatRoom([uid, memberUid], 'PRIVATE');
    const all = await fetchChatRooms();
    setActiveRoom(all.find(room => room.id === id) || { id, participants: [uid, memberUid], type: 'PRIVATE', updatedAt: Date.now(), nibblesEnabled: false });
  };

  if (!prod) return null;
  return (
    <div className="h-[min(760px,calc(100vh-230px))] min-h-[560px] grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] overflow-hidden rounded-sheet border border-[var(--m3-border)] bg-[var(--glass-1)]">
      <aside className={`${workspaceView === 'WORK' || activeRoom ? 'hidden md:flex' : 'flex'} min-h-0 flex-col border-r border-[var(--m3-border)]`}>
        <div className="p-4 border-b border-[var(--m3-border)]">
          <Eyebrow>Production chat</Eyebrow><h2 className="type-title-lg mt-1">{prod.title}</h2>
          <div className="flex flex-wrap gap-2 mt-3"><Chip brand><Radio size={12} /> PTT ready</Chip><Chip><ShieldCheck size={12} /> Nibbles off</Chip></div>
          <div className="grid grid-cols-2 gap-2 mt-3"><Button size="sm" variant={workspaceView === 'CHANNELS' ? 'secondary' : 'ghost'} icon={<MessageSquare />} onClick={() => setWorkspaceView('CHANNELS')}>Channels</Button><Button size="sm" variant={workspaceView === 'WORK' ? 'secondary' : 'ghost'} icon={<BellRing />} onClick={() => setWorkspaceView('WORK')}>My work</Button></div>
          {canStructure && <Button className="mt-3" size="sm" variant="secondary" icon={<RefreshCw />} loading={syncing} onClick={sync}>Sync structure</Button>}
        </div>
        <div className="flex-1 overflow-y-auto p-3 pj-stack-6">
          {Object.entries(grouped).map(([label, channelRows]) => channelRows.length > 0 && <section key={label}><p className="pj-eyebrow px-2 mb-2">{label.replace('_', ' ')}</p><div className="pj-stack-2">{channelRows.map(room => <Button key={room.id} variant={activeRoom?.id === room.id ? 'secondary' : 'ghost'} className="w-full justify-start" icon={<Hash />} onClick={() => setActiveRoom(room)}>{room.name}</Button>)}</div></section>)}
          {!readOnly && <section><p className="pj-eyebrow px-2 mb-2">Direct messages</p><div className="pj-stack-2">{members.filter(member => member.uid && member.uid !== uid && member.status === 'ACTIVE').map(member => <Button key={member.id} variant="ghost" className="w-full justify-start" icon={<User />} onClick={() => openDm(member.uid!)}>{member.name}<span className="ml-auto text-[var(--text-secondary)]">{member.role}</span></Button>)}</div></section>}
        </div>
      </aside>
      <main className={`${workspaceView === 'WORK' || activeRoom ? 'flex' : 'hidden md:flex'} min-w-0 min-h-0 flex-col`}>
        {workspaceView === 'WORK' ? <ProductionOperationsInbox onShowChannels={() => setWorkspaceView('CHANNELS')} /> : activeRoom ? <ChatWindow room={activeRoom} profiles={profiles} readOnly={readOnly} onBack={() => setActiveRoom(null)} onOpenCollab={() => {}} onStartAudio={readOnly ? undefined : () => placeCall(activeRoom, 'AUDIO')} onStartVideo={readOnly ? undefined : () => placeCall(activeRoom, 'VIDEO')} /> : <div className="flex-1 grid place-items-center"><Surface level={1} className="p-8 text-center"><MessageSquare className="mx-auto text-brand-orange" /><p className="type-title-lg mt-3">Choose a production channel</p></Surface></div>}
      </main>
    </div>
  );
};

export default ProductionChatWorkspace;

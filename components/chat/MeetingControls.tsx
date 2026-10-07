import React, { useState } from 'react';
import { ChatRoom } from '../../types';
import { canModerateMeeting, meetingRoomFor, MeetingAction, MeetingControl, newMeeting } from '../../services/meetingCore';
import { updateMeeting } from '../../services/meetingService';
export default function MeetingControls({ room, state, uid, participants, onError }: { room: ChatRoom; state: MeetingControl | null; uid: string; participants: { id: string; name?: string }[]; onError: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const control = state || newMeeting(room.ownerId || '');
  const moderate = canModerateMeeting(control, uid);
  const currentRoom = meetingRoomFor(state, uid);
  const apply = async (action: MeetingAction) => {
    setBusy(true);
    try { await updateMeeting(room.id, action); onError(''); if (action.type === 'create-room') setName(''); }
    catch (error) { onError((error as Error).message); }
    finally { setBusy(false); }
  };
  return <div className="border-b border-white/10 bg-white/[0.03] text-xs">
    <div className="flex items-center gap-3 px-4 py-2"><span className="text-white/60">{control.breakoutRooms[currentRoom] || 'Main meeting'}</span>{moderate && <button aria-expanded={open} onClick={() => setOpen(v => !v)} className="rounded-lg bg-white/10 px-3 py-2">People & breakout rooms</button>}</div>
    {open && moderate && <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
      <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); void apply({ type: 'create-room', id: `breakout_${crypto.randomUUID()}`, name }); }}>
        <input aria-label="Breakout room name" value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="Breakout room name" className="bg-white/5 border border-white/20 rounded-lg px-3 py-2" />
        <button disabled={busy || !name.trim()} className="bg-small-orange rounded-lg px-3 py-2 disabled:opacity-40">Create room</button>
        {!!Object.keys(control.breakoutRooms).length && <button type="button" disabled={busy} onClick={() => void apply({ type: 'close-rooms' })} className="bg-white/10 rounded-lg px-3 py-2">Return everyone to main</button>}
      </form>
      {[{ id: uid, name: 'You' }, ...participants.filter(p => p.id !== uid)].filter(p => room.participants.includes(p.id)).map(person => <div key={person.id} className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-2">
        <span className="w-36 truncate">{person.name || 'Participant'}{person.id === control.hostId ? ' · Host' : control.moderatorIds.includes(person.id) ? ' · Moderator' : ''}</span>
        <select aria-label={`Room for ${person.name || 'participant'}`} disabled={busy} value={meetingRoomFor(state, person.id)} onChange={e => void apply({ type: 'assign', uid: person.id, roomId: e.target.value })} className="bg-[#171717] rounded-lg px-2 py-2"><option value="main">Main meeting</option>{Object.entries(control.breakoutRooms).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
        {person.id !== uid && <button disabled={busy} onClick={() => void apply({ type: 'mute', uid: person.id })} className="px-2 py-2 bg-white/10 rounded-lg">Request mute</button>}
        {uid === control.hostId && person.id !== uid && <button disabled={busy} onClick={() => void apply({ type: 'moderator', uid: person.id, enabled: !control.moderatorIds.includes(person.id) })} className="px-2 py-2 bg-white/10 rounded-lg">{control.moderatorIds.includes(person.id) ? 'Remove moderator role' : 'Make moderator'}</button>}
        {person.id !== uid && person.id !== control.hostId && <button disabled={busy} onClick={() => void apply({ type: 'remove', uid: person.id, removed: !control.removedIds.includes(person.id) })} className="px-2 py-2 text-red-300 bg-red-500/10 rounded-lg">{control.removedIds.includes(person.id) ? 'Allow rejoin' : 'Remove from meeting'}</button>}
      </div>)}
    </div>}
  </div>;
}

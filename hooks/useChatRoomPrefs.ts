import { useEffect, useState } from 'react';
import { listenMyRoomPrefs } from '../services/chat/chatActions';
import type { RoomPrefs } from '../services/chat/chatCore';

/** Your read cursor + mute for every room (users/{uid}/chat_prefs), one shared listener. */
export function useChatRoomPrefs(uid: string | null | undefined): Record<string, RoomPrefs> {
  const [prefs, setPrefs] = useState<Record<string, RoomPrefs>>({});
  useEffect(() => {
    if (!uid) { setPrefs({}); return; }
    return listenMyRoomPrefs(setPrefs);
  }, [uid]);
  return prefs;
}

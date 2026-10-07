import React, { useEffect, useState } from 'react';
import { decryptText, isEncrypted } from '../../services/cryptoService';

/** Decode room previews on the client; never flash ciphertext in the chat list. */
export default function RoomMessagePreview({ roomId, text, fallback = 'No messages yet' }: { roomId: string; text?: string; fallback?: string }) {
  const encrypted = !!text && isEncrypted(text);
  const [resolved, setResolved] = useState<{ source: string; roomId: string; text: string } | null>(null);
  useEffect(() => {
    if (!encrypted || !text) return;
    let live = true;
    decryptText(text, roomId).then(plain => { if (live) setResolved({ source: text, roomId, text: plain }); });
    return () => { live = false; };
  }, [text, roomId, encrypted]);
  return <>{encrypted ? resolved?.source === text && resolved.roomId === roomId ? resolved.text : 'Encrypted message' : text || fallback}</>;
}

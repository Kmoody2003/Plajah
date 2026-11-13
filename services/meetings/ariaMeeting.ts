// ariaMeeting — the side-effect half of Aria in a meeting: model calls and the closing chat post.
// The pure logic (pacing, prompt, parsing, page merge) lives in ariaMeetingCore.

import { auth } from '../firebase';
import { DEFAULT_CLOUD_MODEL, costUsd } from '../ai/aiLane';
import { ARIA_SYSTEM, cloudHourTokens, type AriaLane } from './ariaMeetingCore';

/** Lanes this device can offer. The desktop GPU model is preferred (nothing leaves the PC). */
export async function ariaLanes(): Promise<{ local: boolean; localModel?: string }> {
  try {
    const { localStatus } = await import('../ai/localLane');
    const s = await localStatus();
    return { local: !!s.qualifies, localModel: s.model };
  } catch { return { local: false }; }
}

/** Estimated cloud cost for one hour of meeting, for the button label (the click is the consent). */
export function ariaCloudHourUsd(): number | null {
  const t = cloudHourTokens();
  return costUsd(DEFAULT_CLOUD_MODEL, t.input, t.output);
}

/** One model call. Throws with a person-readable message; the caller keeps the previous notes. */
export async function ariaModelCall(lane: Exclude<AriaLane, 'rules'>, user: string, signal?: AbortSignal): Promise<string> {
  if (lane === 'local') {
    const { createLocalLane } = await import('../ai/localLane');
    return createLocalLane({ signal })(ARIA_SYSTEM, user, 1400);
  }
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Sign in to use Aria in the cloud.');
  const res = await fetch('/api/ai/gemini', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      model: DEFAULT_CLOUD_MODEL,
      contents: [{ role: 'user', parts: [{ text: user }] }],
      config: { systemInstruction: ARIA_SYSTEM, responseMimeType: 'application/json', maxOutputTokens: 1600, temperature: 0.2 },
    }),
  });
  if (!res.ok) {
    throw new Error(res.status === 503 ? 'The cloud assistant is not set up yet.'
      : res.status === 429 ? 'Aria is busy; she will catch up on the next pass.'
      : 'Aria could not update the notes this time.');
  }
  return ((await res.json()) as { text?: string }).text || '';
}

/** Post Aria's closing recap into the project's team chat. */
export async function postAriaRecap(roomId: string, text: string): Promise<void> {
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in to share the recap.');
  const [{ sendMessage }, { encryptText }] = await Promise.all([import('../backendService'), import('../cryptoService')]);
  await sendMessage(roomId, {
    senderId: u.uid, senderName: u.displayName || 'Host', senderPhoto: u.photoURL || '',
    type: 'TEXT',
    text: await encryptText(text, roomId),
  } as any);
}

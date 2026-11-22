// Online race lobby for the Plajah Realtime server: Quick match (rated 1v1) or a room code for friends,
// then the roster with ready lights. The car sits on the grid behind this panel; the server's countdown
// releases it (region.ts reads OnlineSessionManager.raceHold()).

import type { RtEvent, RtPlayer, RtStanding } from '../../../services/realtime/client';
import { OnlineSessionManager, resolveGamerToken, type ServerRaceJoin } from './onlineMultiplayer';

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(2).padStart(5, '0')}`;

export interface LobbyHooks {
  apiBase: string;
  circuitId: string;
  /** Put the player's car on the grid (called once the room is joined). */
  onEnterGrid(): void;
  onBanner(text: string, kind: 'ok' | 'bad' | 'gold' | ''): void;
  /** Lobby closed without racing. */
  onCancel(): void;
}

export function openOnlineRaceLobby(session: OnlineSessionManager, hooks: LobbyHooks): void {
  document.getElementById('rtLobby')?.remove();
  const el = document.createElement('div');
  el.id = 'rtLobby';
  el.style.cssText = 'position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:60;min-width:min(420px,92vw);max-width:92vw;padding:18px 20px;'
    + 'background:rgba(8,12,18,.88);border:1px solid rgba(255,190,110,.35);border-radius:10px;color:#f4ead8;font:14px/1.45 system-ui,sans-serif;backdrop-filter:blur(6px)';
  el.innerHTML = `
    <div style="font-weight:800;letter-spacing:.14em;font-size:12px;color:#ffbe6e">ONLINE CIRCUIT RACE · IRONPORT</div>
    <div data-k="status" style="margin:8px 0 12px;color:#d8cdb9">Race other drivers through the Plajah server. Results go on your gamer record.</div>
    <div data-k="pick" style="display:flex;flex-wrap:wrap;gap:8px">
      <button data-a="quick">Quick match (rated)</button>
      <button data-a="create">Create room</button>
      <input data-k="code" placeholder="CODE" maxlength="6" style="width:84px;text-transform:uppercase;padding:4px 6px;background:#0b1118;color:#fff;border:1px solid #445">
      <button data-a="join">Join</button>
    </div>
    <div data-k="room" style="display:none">
      <div data-k="code-line" style="margin-bottom:6px"></div>
      <ul data-k="players" style="list-style:none;margin:0 0 12px;padding:0"></ul>
      <button data-a="ready">Ready</button>
    </div>
    <div style="margin-top:12px;text-align:right"><button data-a="leave">Leave</button></div>`;
  el.querySelectorAll('button').forEach((b) => { b.style.cssText = 'padding:6px 12px;background:#2a1d10;color:#ffe2b8;border:1px solid #a86a2c;border-radius:5px;cursor:pointer;font-weight:700'; });
  document.body.appendChild(el);

  const q = <T extends HTMLElement>(sel: string) => el.querySelector(sel) as T;
  const status = q<HTMLDivElement>('[data-k=status]');
  let ready = false, raced = false;

  const renderPlayers = (players: RtPlayer[], min: number) => {
    const me = session.rt?.seat ?? -1;
    q<HTMLUListElement>('[data-k=players]').innerHTML = players.map(p =>
      `<li style="padding:3px 0">${p.ready ? '🟢' : p.connected ? '⚪' : '⚫'} ${escapeHtml(p.name)}${p.seat === me ? ' <span style="color:#ffbe6e">(you)</span>' : ''}</li>`).join('');
    status.textContent = players.length < min ? `Waiting for drivers (${players.length}/${min})…` : players.every(p => p.ready) ? 'Everyone is ready' : 'Press Ready when you are on the grid';
  };
  const showResult = (st: RtStanding[]) => {
    const lines = st.map(s => `P${s.place} ${s.name}${s.timeMs !== null ? ` ${fmt(s.timeMs)}` : s.dnf ? ' DNF' : ''}`);
    hooks.onBanner(`RESULT · ${lines.join(' · ')}`, st.find(s => s.seat === session.rt?.seat)?.place === 1 ? 'gold' : 'ok');
  };

  const onRt = (e: RtEvent) => {
    if (e.type === 'code') q<HTMLDivElement>('[data-k=code-line]').innerHTML = `Room code <b style="letter-spacing:.2em;color:#ffbe6e">${escapeHtml(e.code)}</b> — share it with a friend`;
    else if (e.type === 'phase') {
      if (e.phase === 'queue') status.textContent = 'Finding a driver near your rating…';
      if (e.phase === 'connecting') status.textContent = 'Joining the room…';
      if (e.phase === 'closed' && !raced) status.textContent = 'Disconnected from the room.';
    } else if (e.type === 'lobby') renderPlayers(e.players, e.min);
    else if (e.type === 'countdown') { status.textContent = 'Lights are coming on…'; el.style.opacity = '0.55'; }
    else if (e.type === 'go') { raced = true; el.style.display = 'none'; }
    else if (e.type === 'finish') hooks.onBanner(`P${e.place} · ${session.rt?.nameOf(e.seat) ?? ''} · ${fmt(e.timeMs)}`, e.seat === session.rt?.seat ? 'gold' : 'ok');
    else if (e.type === 'result') showResult(e.standings);
    else if (e.type === 'recorded') hooks.onBanner(e.ok ? 'Result saved to your gamer record' : 'Could not save the result — it will retry', e.ok ? 'ok' : 'bad');
    else if (e.type === 'error') status.textContent = e.message;
  };

  const start = async (how: ServerRaceJoin) => {
    q<HTMLDivElement>('[data-k=pick]').style.display = 'none';
    status.textContent = 'Signing in…';
    try {
      await session.joinServerRace(hooks.circuitId, { apiBase: hooks.apiBase, getToken: () => resolveGamerToken(), how, onRt });
      q<HTMLDivElement>('[data-k=room]').style.display = 'block';
      hooks.onEnterGrid();
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : String(err);
      q<HTMLDivElement>('[data-k=pick]').style.display = 'flex';
    }
  };

  el.addEventListener('click', ev => {
    const a = (ev.target as HTMLElement).closest('button')?.dataset.a;
    if (a === 'quick') void start('quick');
    else if (a === 'create') void start('create');
    else if (a === 'join') {
      const code = q<HTMLInputElement>('[data-k=code]').value.trim().toUpperCase();
      if (code.length === 6) void start({ code }); else status.textContent = 'Codes are 6 letters and numbers';
    } else if (a === 'ready') {
      ready = !ready; session.setReady(ready);
      (ev.target as HTMLButtonElement).textContent = ready ? 'Not ready' : 'Ready';
    } else if (a === 'leave') { session.disconnect(); el.remove(); hooks.onCancel(); }
  });
  // Keep keystrokes in the code box from driving the car.
  q<HTMLInputElement>('[data-k=code]').addEventListener('keydown', ev => ev.stopPropagation());
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

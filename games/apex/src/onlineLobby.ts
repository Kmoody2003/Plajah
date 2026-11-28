// Plajah Motorsport: Apex — Online Multiplayer, Matchmaking & Persistent Open-World Hub
//
// First-class Plajah-branded UI supporting BOTH:
//   1. ONLINE OPEN WORLD (32-player Forza Horizon-style Ironport cruising shard with 950 m spatial interest-radius
//      via Plajah Realtime `apex-world`, or instant zero-config local multi-tab BroadcastChannel sync when offline)
//   2. ONLINE CIRCUIT RACES (12-player Quick Match Elo matchmaking, Create Private Room with 6-char shareable code,
//      Join by Room Code, circuit selector across all 8 Ironport courses, ready lights, proximity voice, server countdown)

import { RealtimeClient, type RtEvent, type RtPlayer, type RtStanding } from '../../../services/realtime/client';
import { OnlineSessionManager, resolveGamerToken, type ServerRaceJoin } from './onlineMultiplayer';
import type { GameVoiceState } from '../../../services/gamerNet/gameVoiceCore';

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(2).padStart(5, '0')}`;

export const ONLINE_CIRCUITS: Array<{ id: string; name: string; tag: string }> = [
  { id: 'ironport_grand_circuit', name: 'Ironport Grand Circuit', tag: '4.2 km · City' },
  { id: 'great_lakes_cliff_raceway', name: 'Great Lakes Cliff Raceway', tag: '9.8 km · Coastal' },
  { id: 'pinewood_rally_stage', name: 'Pinewood Rally Stage', tag: '11 km · Off-Road' },
  { id: 'ironworks_industrial_circuit', name: 'Ironworks Industrial Circuit', tag: '5.3 km · Port' },
  { id: 'harbor_district_circuit', name: 'Harbor District Street Circuit', tag: '5.4 km · Piers' },
  { id: 'civic_riverfront_circuit', name: 'Civic Riverfront Street Circuit', tag: '5.4 km · Marina' },
  { id: 'superior_range_circuit', name: 'Superior Range Circuit', tag: '23 km · Mountain' },
  { id: 'escarpment_circuit', name: 'Escarpment Circuit', tag: '10.4 km · Viaduct' },
];

export interface LobbyHooks {
  apiBase: string;
  circuitId: string;
  /** Initial tab when opening the hub ('world' | 'race'). */
  initialTab?: 'world' | 'race';
  /** Put the player's car on the chosen circuit grid or into open-world free roam. */
  onEnterGrid(circuitId?: string): void;
  onEnterOpenWorld?(): void;
  onBanner(text: string, kind: 'ok' | 'bad' | 'gold' | ''): void;
  onCancel(): void;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function openOnlineMultiplayerHub(session: OnlineSessionManager, hooks: LobbyHooks): void {
  document.getElementById('rtLobby')?.remove();
  let selectedCircuit = hooks.circuitId || 'ironport_grand_circuit';
  let activeTab: 'world' | 'race' = hooks.initialTab ?? 'race';
  let serverAvailable = false;

  const el = document.createElement('div');
  el.id = 'rtLobby';
  el.style.cssText =
    'position:fixed;left:50%;top:11%;transform:translateX(-50%);z-index:70;width:min(540px,94vw);max-height:82vh;overflow:auto;padding:22px 24px;' +
    'background:rgba(16,4,28,.92);border:1px solid rgba(0,218,243,.36);border-radius:22px;color:#f6f0ff;' +
    'font:400 13px/1.5 Inter,system-ui,sans-serif;backdrop-filter:blur(18px);box-shadow:0 28px 80px rgba(0,0,0,.72)';

  const circuitOpts = ONLINE_CIRCUITS.map(
    (c) => `<option value="${c.id}"${c.id === selectedCircuit ? ' selected' : ''}>${escapeHtml(c.name)} (${escapeHtml(c.tag)})</option>`,
  ).join('');

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px">
      <div>
        <div style="font:800 11px 'JetBrains Mono',monospace;letter-spacing:.26em;color:#00DAF3;text-transform:uppercase">PLAJAH NETWORK · MULTIPLAYER HUB</div>
        <div style="font:900 22px Outfit,sans-serif;letter-spacing:.04em;margin-top:2px">ONLINE LOBBIES &amp; OPEN WORLD</div>
      </div>
      <span data-k="srvBadge" style="padding:4px 10px;border-radius:999px;font:700 10px 'JetBrains Mono',monospace;letter-spacing:.12em;background:rgba(255,255,255,.08);color:#D0BCFF">CHECKING SERVER…</span>
    </div>

    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;margin-bottom:14px">
      <span style="font:700 10px 'JetBrains Mono',monospace;letter-spacing:.16em;color:#D0BCFF">DRIVER CALLSIGN</span>
      <input data-k="callsign" value="${escapeHtml(session.profile.driverName)}" maxlength="20" style="flex:1;padding:6px 10px;border-radius:8px;background:rgba(8,2,16,.75);color:#fff;border:1px solid rgba(255,255,255,.16);font:600 13px Outfit,sans-serif" />
      <span style="font:600 11px 'JetBrains Mono',monospace;color:#FF8C00">${session.profile.wins} WINS</span>
    </div>

    <div data-k="tabs" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      <button data-tab="world" style="padding:10px 12px;border-radius:12px;font:800 12px Outfit,sans-serif;letter-spacing:.14em;cursor:pointer">OPEN WORLD SHARD (32P)</button>
      <button data-tab="race" style="padding:10px 12px;border-radius:12px;font:800 12px Outfit,sans-serif;letter-spacing:.14em;cursor:pointer">CIRCUIT MATCHMAKING (12P)</button>
    </div>

    <div data-k="status" style="margin:0 0 12px;color:#e6dcfa;font-size:13px">Connect to Ironport Online to cruise with other players or queue into ranked circuit lobbies.</div>

    <div data-k="worldPane" style="display:none;padding:14px;border-radius:14px;background:rgba(0,218,243,.07);border:1px solid rgba(0,218,243,.24);margin-bottom:12px">
      <div style="font:700 11px 'JetBrains Mono',monospace;letter-spacing:.16em;color:#00DAF3;margin-bottom:6px">FORZA-STYLE SHARED IRONPORT MAP · 950 M SPATIAL INTEREST RADIUS</div>
      <div style="color:rgba(255,255,255,.82);margin-bottom:12px">Drop directly into the 150 km&sup2; map with up to 32 live players, floating gamertags, live minimap blips, proximity voice, and instant convoy race invites.</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        <button data-a="world-join" style="padding:9px 18px;border-radius:999px;background:linear-gradient(90deg,#00DAF3,#00a6d6);color:#090312;border:0;font:800 12px Outfit,sans-serif;letter-spacing:.12em;cursor:pointer">ENTER ONLINE OPEN WORLD</button>
        <button data-a="world-private" style="padding:9px 14px;border-radius:999px;background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.18);font:700 11px Outfit,sans-serif;letter-spacing:.1em;cursor:pointer">PRIVATE CONVOY SHARD</button>
        <input data-k="worldCode" placeholder="CONVOY CODE" maxlength="6" style="width:116px;text-transform:uppercase;padding:7px 10px;border-radius:999px;background:rgba(8,2,16,.85);color:#fff;border:1px solid rgba(0,218,243,.32);font:700 12px 'JetBrains Mono',monospace;letter-spacing:.14em;text-align:center" />
        <button data-a="world-code" style="padding:9px 14px;border-radius:999px;background:rgba(0,218,243,.16);color:#00DAF3;border:1px solid rgba(0,218,243,.45);font:800 11px Outfit,sans-serif;letter-spacing:.12em;cursor:pointer">JOIN CONVOY</button>
      </div>
    </div>

    <div data-k="racePane" style="display:none;padding:14px;border-radius:14px;background:rgba(255,140,0,.07);border:1px solid rgba(255,140,0,.24);margin-bottom:12px">
      <label style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px">
        <span style="font:700 11px 'JetBrains Mono',monospace;letter-spacing:.14em;color:#FF8C00">CIRCUIT</span>
        <select data-k="circuitSel" style="flex:1;padding:7px 10px;border-radius:10px;background:#1a062c;color:#fff;border:1px solid rgba(255,140,0,.45);font:600 12px Outfit,sans-serif">${circuitOpts}</select>
      </label>
      <div data-k="pick" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        <button data-a="quick" style="padding:9px 16px;border-radius:999px;background:linear-gradient(90deg,#D40055,#FF8C00);color:#fff;border:0;font:800 12px Outfit,sans-serif;letter-spacing:.12em;cursor:pointer">QUICK MATCH (RATED)</button>
        <button data-a="create" style="padding:9px 14px;border-radius:999px;background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,140,0,.45);font:700 11px Outfit,sans-serif;letter-spacing:.1em;cursor:pointer">CREATE LOBBY</button>
        <input data-k="code" placeholder="6-CHAR CODE" maxlength="6" style="width:110px;text-transform:uppercase;padding:7px 10px;border-radius:999px;background:rgba(8,2,16,.85);color:#fff;border:1px solid rgba(255,255,255,.22);font:700 12px 'JetBrains Mono',monospace;letter-spacing:.14em;text-align:center" />
        <button data-a="join" style="padding:9px 14px;border-radius:999px;background:rgba(0,218,243,.16);color:#00DAF3;border:1px solid rgba(0,218,243,.45);font:800 11px Outfit,sans-serif;letter-spacing:.12em;cursor:pointer">JOIN CODE</button>
      </div>
    </div>

    <div data-k="room" style="display:none;padding:14px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);margin-bottom:12px">
      <div data-k="code-line" style="margin-bottom:8px;font:600 13px 'JetBrains Mono',monospace;color:#00DAF3"></div>
      <ul data-k="players" style="list-style:none;margin:0 0 12px;padding:0"></ul>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        <button data-a="ready" style="padding:9px 18px;border-radius:999px;background:linear-gradient(90deg,#00DAF3,#00a6d6);color:#090312;border:0;font:800 12px Outfit,sans-serif;letter-spacing:.12em;cursor:pointer">READY UP</button>
        <button data-a="voice" title="Proximity voice: hear drivers near you" style="padding:8px 14px;border-radius:999px;background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.18);font:700 11px Outfit,sans-serif;cursor:pointer">🎙 PROXIMITY VOICE</button>
        <span data-k="voice" style="font-size:12px;color:#D0BCFF"></span>
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
      <span style="font:500 11px 'JetBrains Mono',monospace;color:rgba(208,188,255,.62)">Tip: Open 2 tabs on local dev to test live multi-car sync immediately</span>
      <button data-a="leave" style="padding:7px 14px;border-radius:999px;background:rgba(255,255,255,.06);color:#fff;border:1px solid rgba(255,255,255,.16);font:700 11px Outfit,sans-serif;letter-spacing:.12em;cursor:pointer">CLOSE</button>
    </div>`;

  document.body.appendChild(el);

  const q = <T extends HTMLElement>(sel: string) => el.querySelector(sel) as T;
  const status = q<HTMLDivElement>('[data-k=status]');
  const srvBadge = q<HTMLSpanElement>('[data-k=srvBadge]');
  const worldPane = q<HTMLDivElement>('[data-k=worldPane]');
  const racePane = q<HTMLDivElement>('[data-k=racePane]');
  const callsignInput = q<HTMLInputElement>('[data-k=callsign]');
  const circuitSel = q<HTMLSelectElement>('[data-k=circuitSel]');
  let ready = false;
  let raced = false;

  const syncTabs = (): void => {
    worldPane.style.display = activeTab === 'world' ? 'block' : 'none';
    racePane.style.display = activeTab === 'race' ? 'block' : 'none';
    el.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
      const on = b.dataset.tab === activeTab;
      b.style.background = on ? (activeTab === 'world' ? 'rgba(0,218,243,.22)' : 'rgba(255,140,0,.22)') : 'rgba(255,255,255,.05)';
      b.style.border = on ? (activeTab === 'world' ? '1px solid #00DAF3' : '1px solid #FF8C00') : '1px solid rgba(255,255,255,.12)';
      b.style.color = on ? '#fff' : 'rgba(255,255,255,.65)';
    });
  };
  syncTabs();

  void RealtimeClient.enabled(hooks.apiBase).then((on) => {
    serverAvailable = on;
    srvBadge.textContent = on ? '● PLAJAH REALTIME LIVE' : '● LOCAL MULTI-TAB SYNC';
    srvBadge.style.color = on ? '#00f5a0' : '#FF8C00';
    srvBadge.style.background = on ? 'rgba(0,245,160,.12)' : 'rgba(255,140,0,.14)';
  });

  callsignInput.addEventListener('change', () => session.setDriverName(callsignInput.value));
  callsignInput.addEventListener('keydown', (ev) => ev.stopPropagation());
  q<HTMLInputElement>('[data-k=code]').addEventListener('keydown', (ev) => ev.stopPropagation());
  q<HTMLInputElement>('[data-k=worldCode]').addEventListener('keydown', (ev) => ev.stopPropagation());
  circuitSel.addEventListener('change', () => { selectedCircuit = circuitSel.value; });

  const renderPlayers = (players: RtPlayer[], min: number) => {
    const me = session.rt?.seat ?? -1;
    q<HTMLUListElement>('[data-k=players]').innerHTML = players
      .map(
        (p) =>
          `<li style="padding:5px 8px;margin-bottom:4px;border-radius:8px;background:rgba(255,255,255,.04);display:flex;justify-content:space-between">` +
          `<span>${p.ready ? '🟢' : p.connected ? '⚪' : '⚫'} ${escapeHtml(p.name)}${p.seat === me ? ' <span style="color:#FF8C00">(you)</span>' : ''}</span>` +
          `<span style="font:600 11px 'JetBrains Mono',monospace;color:#00DAF3">${p.ready ? 'READY' : 'WAITING'}</span></li>`,
      )
      .join('');
    status.textContent =
      players.length < min
        ? `Waiting for drivers (${players.length}/${min})…`
        : players.every((p) => p.ready)
        ? 'All drivers ready — launching grid countdown!'
        : 'Press READY UP once you are set on the grid.';
  };

  const showResult = (st: RtStanding[]) => {
    const lines = st.map((s) => `P${s.place} ${s.name}${s.timeMs !== null ? ` ${fmt(s.timeMs)}` : s.dnf ? ' DNF' : ''}`);
    hooks.onBanner(`RESULT · ${lines.join(' · ')}`, st.find((s) => s.seat === session.rt?.seat)?.place === 1 ? 'gold' : 'ok');
  };

  const voiceText = (v: GameVoiceState) =>
    v.status === 'on'
      ? `Voice live${v.muted ? ' (muted)' : ''} · ${v.peers.length} driver${v.peers.length === 1 ? '' : 's'} · M mutes`
      : v.status === 'connecting'
      ? 'Connecting proximity voice…'
      : v.status === 'unavailable'
      ? 'Voice unavailable right now'
      : v.status === 'error'
      ? v.error
      : '';

  const onVoice = (v: GameVoiceState) => {
    q<HTMLSpanElement>('[data-k=voice]').textContent = voiceText(v);
    const chip = document.getElementById('rtVoiceChip');
    if (chip) {
      chip.textContent = v.status === 'on' ? (v.muted ? '🔇 Voice muted (M)' : `🎙 Voice · ${v.speaking.length ? 'talking' : 'on'} (M)`) : '';
      chip.style.display = v.status === 'on' ? 'block' : 'none';
    }
  };

  const voiceChip = () => {
    if (document.getElementById('rtVoiceChip')) return;
    const c = document.createElement('button');
    c.id = 'rtVoiceChip';
    c.style.cssText =
      'position:fixed;left:14px;bottom:14px;z-index:65;display:none;padding:7px 14px;background:rgba(16,4,28,.88);color:#00DAF3;border:1px solid rgba(0,218,243,.45);border-radius:999px;font:700 12px Outfit,sans-serif;cursor:pointer';
    c.addEventListener('click', () => {
      const v = session.voice;
      if (v) v.setMuted(!v.state.muted);
    });
    addEventListener('keydown', (ev) => {
      if ((ev.key === 'm' || ev.key === 'M') && session.voice && !(ev.target instanceof HTMLInputElement)) {
        session.voice.setMuted(!session.voice.state.muted);
      }
    });
    document.body.appendChild(c);
  };

  const onRt = (e: RtEvent) => {
    if (e.type === 'code') {
      q<HTMLDivElement>('[data-k=code-line]').innerHTML =
        `ROOM CODE <b style="letter-spacing:.22em;color:#FF8C00;font-size:16px">${escapeHtml(e.code)}</b> — share with friends`;
    } else if (e.type === 'phase') {
      if (e.phase === 'queue') status.textContent = 'Matchmaking: searching for drivers near your rating…';
      if (e.phase === 'connecting') status.textContent = 'Connecting to Plajah Realtime shard…';
      if (e.phase === 'closed' && !raced) status.textContent = 'Disconnected from room.';
    } else if (e.type === 'lobby') {
      renderPlayers(e.players, e.min);
    } else if (e.type === 'countdown') {
      status.textContent = 'Starting lights active — get ready!';
      el.style.opacity = '0.55';
    } else if (e.type === 'go') {
      raced = true;
      el.style.display = 'none';
    } else if (e.type === 'finish') {
      hooks.onBanner(`P${e.place} · ${session.rt?.nameOf(e.seat) ?? ''} · ${fmt(e.timeMs)}`, e.seat === session.rt?.seat ? 'gold' : 'ok');
    } else if (e.type === 'result') {
      showResult(e.standings);
    } else if (e.type === 'recorded') {
      hooks.onBanner(e.ok ? 'Result saved to your Plajah Gamer Record' : 'Could not save result — will retry', e.ok ? 'ok' : 'bad');
    } else if (e.type === 'error') {
      status.textContent = e.message;
    }
  };

  const startRace = async (how: ServerRaceJoin) => {
    session.setDriverName(callsignInput.value);
    if (!serverAvailable) {
      session.joinOnlineRace(selectedCircuit);
      el.remove();
      hooks.onEnterGrid(selectedCircuit);
      hooks.onBanner(`LOCAL MULTI-TAB LOBBY · ${selectedCircuit.replace(/_/g, ' ').toUpperCase()}`, 'ok');
      return;
    }
    q<HTMLDivElement>('[data-k=pick]').style.display = 'none';
    status.textContent = 'Authenticating with Plajah Realtime…';
    try {
      const joined = await session.joinServerRace(selectedCircuit, { apiBase: hooks.apiBase, getToken: () => resolveGamerToken(), how, onRt });
      selectedCircuit = joined.circuitId;
      circuitSel.value = selectedCircuit;
      q<HTMLDivElement>('[data-k=room]').style.display = 'block';
      hooks.onEnterGrid(selectedCircuit);
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : String(err);
      q<HTMLDivElement>('[data-k=pick]').style.display = 'flex';
    }
  };

  const startOpenWorld = async (how: ServerRaceJoin) => {
    session.setDriverName(callsignInput.value);
    if (!serverAvailable) {
      session.connectPersistentWorld();
      el.remove();
      hooks.onEnterOpenWorld?.();
      hooks.onBanner(`ONLINE OPEN WORLD · CONNECTED AS ${session.profile.driverName}`, 'ok');
      return;
    }
    status.textContent = 'Joining Ironport 32-player Open World shard…';
    try {
      const joined = await session.joinServerOpenWorld({ apiBase: hooks.apiBase, getToken: () => resolveGamerToken(), how, onRt });
      el.remove();
      hooks.onEnterOpenWorld?.();
      hooks.onBanner(
        joined.code
          ? `PRIVATE CONVOY SHARD · CODE ${joined.code} · LIVE AS ${session.profile.driverName}`
          : `IRONPORT OPEN WORLD SHARD · LIVE AS ${session.profile.driverName}`,
        'ok',
      );
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : String(err);
    }
  };

  el.addEventListener('click', (ev) => {
    const tabBtn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-tab]');
    if (tabBtn?.dataset.tab) {
      activeTab = tabBtn.dataset.tab as 'world' | 'race';
      syncTabs();
      return;
    }
    const a = (ev.target as HTMLElement).closest('button')?.dataset.a;
    if (a === 'world-join') void startOpenWorld('quick');
    else if (a === 'world-private') void startOpenWorld('create');
    else if (a === 'world-code') {
      const code = q<HTMLInputElement>('[data-k=worldCode]').value.trim().toUpperCase();
      if (code.length === 6) void startOpenWorld({ code });
      else status.textContent = 'Convoy codes are 6 letters/numbers.';
    } else if (a === 'quick') void startRace('quick');
    else if (a === 'create') void startRace('create');
    else if (a === 'join') {
      const code = q<HTMLInputElement>('[data-k=code]').value.trim().toUpperCase();
      if (code.length === 6) void startRace({ code });
      else status.textContent = 'Room codes are 6 letters/numbers.';
    } else if (a === 'ready') {
      ready = !ready;
      session.setReady(ready);
      (ev.target as HTMLButtonElement).textContent = ready ? 'NOT READY' : 'READY UP';
    } else if (a === 'voice') {
      if (session.voice) {
        session.stopVoice();
        onVoice({ status: 'off', error: '', muted: false, peers: [], speaking: [] });
        (ev.target as HTMLButtonElement).textContent = '🎙 PROXIMITY VOICE';
        return;
      }
      voiceChip();
      void session.startVoice(hooks.apiBase, () => resolveGamerToken(), onVoice).then((v) => {
        if (v?.status === 'on' || v?.status === 'connecting') (ev.target as HTMLButtonElement).textContent = 'LEAVE VOICE';
      });
    } else if (a === 'leave') {
      if (session.rt && !raced) session.disconnect();
      document.getElementById('rtVoiceChip')?.remove();
      el.remove();
      hooks.onCancel();
    }
  });
}

/** Backwards-compatible alias for direct circuit lobby launches. */
export function openOnlineRaceLobby(session: OnlineSessionManager, hooks: LobbyHooks): void {
  openOnlineMultiplayerHub(session, { ...hooks, initialTab: 'race' });
}

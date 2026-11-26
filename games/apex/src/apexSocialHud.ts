/**
 * apexSocialHud.ts — Slim Plajah In-Game Chat & Proximity Voice HUD for `region.html`.
 *
 * Built directly on Plajah's shared Gamer Network primitives:
 *   - `services/gamerNet/chat.ts`: `cleanText` (profanity mask), `QUICK_CHAT` (child-safe 1-tap lines), `rateCheck`
 *   - `services/gamerNet/gameVoiceCore.ts`: `GameVoiceSession` (LiveKit proximity voice with 3D SpatialVoice rolloff)
 *   - `onlineMultiplayer.ts`: `OnlineSessionManager` (BroadcastChannel multi-tab chat + Plajah Realtime `/api/gamer/chat`)
 *
 * Designed as a minimal translucent Plajah pill bar + collapsible 310 px drawer docked bottom-left
 * (above the minimap / opposite the speedometer) so it never occludes the road, cars, or racing HUD.
 */

import { cleanText, QUICK_CHAT, rateCheck } from '../../../services/gamerNet/chat';
import type { GameVoiceState } from '../../../services/gamerNet/gameVoiceCore';
import { OnlineSessionManager, resolveGamerToken } from './onlineMultiplayer';

export type ChatChannel = 'all' | 'lobby' | 'proximity';

export interface ApexChatMessage {
  id: string;
  senderId: string;
  sender: string;
  channel: ChatChannel;
  text: string;
  at: number;
  system?: boolean;
  quick?: string;
}

export interface ApexSocialHudOpts {
  session: OnlineSessionManager;
  apiBase: string;
  onOpenHub?: () => void;
}

const RACING_QUICK_CHAT: ReadonlyArray<{ id: string; text: string }> = [
  ...QUICK_CHAT.slice(0, 6),
  { id: 'follow', text: 'Follow me!' },
  { id: 'cops', text: 'Cops ahead!' },
  { id: 'convoy', text: 'Join convoy?' },
];

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export class ApexSocialHud {
  readonly root: HTMLDivElement;
  private drawer: HTMLDivElement;
  private feedEl: HTMLDivElement;
  private inputEl: HTMLInputElement;
  private chatBtn: HTMLButtonElement;
  private voiceBtn: HTMLButtonElement;
  private badgeEl: HTMLSpanElement;
  private peerStatusEl: HTMLSpanElement;
  private voiceMetaEl: HTMLDivElement;
  private voiceToggleBtn: HTMLButtonElement;
  private voiceMuteBtn: HTMLButtonElement;

  private open = false;
  private channel: ChatChannel = 'all';
  private unread = 0;
  private messages: ApexChatMessage[] = [];
  private sendTimes: number[] = [];
  private mutedSenders = new Set<string>();
  private lastVoiceState: GameVoiceState = { status: 'off', error: '', muted: false, peers: [], speaking: [] };
  private pollTimer = 0;
  private lastServerSeq = 0;
  private lastScope = '';
  private localChan: BroadcastChannel | null = null;

  constructor(private opts: ApexSocialHudOpts) {
    this.root = document.createElement('div');
    this.root.id = 'apexSocialHud';
    this.root.style.cssText =
      'position:fixed;left:114px;bottom:8px;z-index:35;display:flex;flex-direction:column;align-items:flex-start;gap:8px;' +
      'font-family:Inter,system-ui,sans-serif;pointer-events:none;user-select:none';

    // Collapsible slim Plajah chat + voice drawer
    this.drawer = document.createElement('div');
    this.drawer.style.cssText =
      'display:none;width:316px;max-width:calc(100vw - 32px);border-radius:18px;overflow:hidden;pointer-events:auto;' +
      'background:rgba(16,4,28,.86);border:1px solid rgba(255,255,255,.13);backdrop-filter:blur(16px);' +
      'box-shadow:0 18px 48px rgba(0,0,0,.58);color:#f3ebff';

    const quickHtml = RACING_QUICK_CHAT.map(
      (q) =>
        `<button type="button" data-quick="${esc(q.id)}" style="flex:0 0 auto;padding:3px 9px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:#e9dcff;font:600 10px Inter,sans-serif;cursor:pointer;white-space:nowrap">${esc(q.text)}</button>`,
    ).join('');

    this.drawer.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px 7px;border-bottom:1px solid rgba(255,255,255,.08);background:linear-gradient(90deg,rgba(107,0,153,.32),rgba(0,218,243,.14))">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="width:7px;height:7px;border-radius:50%;background:#00DAF3;box-shadow:0 0 8px #00DAF3"></span>
          <span style="font:800 10px 'JetBrains Mono',monospace;letter-spacing:.18em;color:#00DAF3">PLAJAH COMMS</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span data-k="peers" style="font:600 10px 'JetBrains Mono',monospace;color:rgba(208,188,255,.78)">LOCAL</span>
          <button type="button" data-a="hub" title="Open Online Hub" style="padding:2px 8px;border-radius:999px;font:700 9px Outfit,sans-serif;letter-spacing:.1em;background:rgba(255,140,0,.18);border:1px solid rgba(255,140,0,.45);color:#ffb347;cursor:pointer">LOBBY</button>
          <button type="button" data-a="close" aria-label="Collapse chat" style="width:22px;height:22px;padding:0;border-radius:50%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);color:#fff;font-size:14px;line-height:1;cursor:pointer">&times;</button>
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;padding:6px 10px;border-bottom:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.03)">
        <div data-k="voiceMeta" style="font:600 11px Inter,sans-serif;color:#D0BCFF;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">🎙 Voice off · Join room to talk</div>
        <button type="button" data-a="voiceToggle" style="padding:3px 9px;border-radius:999px;font:700 10px Outfit,sans-serif;letter-spacing:.08em;background:rgba(0,218,243,.16);border:1px solid rgba(0,218,243,.45);color:#00DAF3;cursor:pointer">JOIN VOICE</button>
        <button type="button" data-a="voiceMute" style="display:none;padding:3px 8px;border-radius:999px;font:700 10px Outfit,sans-serif;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);color:#fff;cursor:pointer">MUTE (M)</button>
      </div>

      <div data-k="tabs" style="display:flex;gap:4px;padding:6px 10px 4px">
        <button type="button" data-ch="all" style="flex:1;padding:4px 6px;border-radius:999px;font:700 10px 'JetBrains Mono',monospace;letter-spacing:.08em;cursor:pointer">ALL</button>
        <button type="button" data-ch="lobby" style="flex:1;padding:4px 6px;border-radius:999px;font:700 10px 'JetBrains Mono',monospace;letter-spacing:.08em;cursor:pointer">LOBBY</button>
        <button type="button" data-ch="proximity" style="flex:1;padding:4px 6px;border-radius:999px;font:700 10px 'JetBrains Mono',monospace;letter-spacing:.08em;cursor:pointer">PROXIMITY</button>
      </div>

      <div data-k="feed" style="height:156px;overflow-y:auto;padding:6px 10px;display:flex;flex-direction:column;gap:5px;font-size:12px;line-height:1.38"></div>

      <div style="display:flex;gap:5px;overflow-x:auto;padding:4px 10px 6px;border-top:1px solid rgba(255,255,255,.06);scrollbar-width:none">${quickHtml}</div>

      <form data-k="form" style="display:flex;gap:6px;padding:6px 10px 10px">
        <input data-k="input" type="text" maxlength="200" placeholder="Message drivers… (Enter)" autocomplete="off"
          style="flex:1;min-width:0;padding:7px 11px;border-radius:999px;background:rgba(6,2,14,.84);border:1px solid rgba(255,255,255,.16);color:#fff;font:500 12px Inter,sans-serif;outline:none" />
        <button type="submit" style="padding:6px 13px;border-radius:999px;background:linear-gradient(90deg,#D40055,#FF8C00);border:0;color:#fff;font:800 11px Outfit,sans-serif;letter-spacing:.1em;cursor:pointer">SEND</button>
      </form>
    `;

    // Compact bottom-left pill bar (always light, 1-click access to Chat & Voice)
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;gap:6px;pointer-events:auto';

    this.chatBtn = document.createElement('button');
    this.chatBtn.type = 'button';
    this.chatBtn.title = 'Open slim Plajah Chat (Y)';
    this.chatBtn.style.cssText =
      'position:relative;display:inline-flex;align-items:center;gap:6px;padding:6px 13px;border-radius:999px;' +
      'background:rgba(16,4,28,.80);border:1px solid rgba(255,255,255,.16);color:#f3ebff;backdrop-filter:blur(12px);' +
      'font:700 11px Outfit,sans-serif;letter-spacing:.1em;cursor:pointer';
    this.chatBtn.innerHTML = '<span>💬 CHAT</span><span data-k="badge" style="display:none;padding:1px 6px;border-radius:999px;background:#D40055;color:#fff;font:700 10px \'JetBrains Mono\',monospace">0</span>';

    this.voiceBtn = document.createElement('button');
    this.voiceBtn.type = 'button';
    this.voiceBtn.title = 'Proximity Voice Chat (M mutes once active)';
    this.voiceBtn.style.cssText =
      'display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;' +
      'background:rgba(16,4,28,.80);border:1px solid rgba(0,218,243,.32);color:#00DAF3;backdrop-filter:blur(12px);' +
      'font:700 11px Outfit,sans-serif;letter-spacing:.08em;cursor:pointer';
    this.voiceBtn.textContent = '🎙 VOICE';

    bar.append(this.chatBtn, this.voiceBtn);
    this.root.append(this.drawer, bar);
    document.body.appendChild(this.root);

    this.feedEl = this.drawer.querySelector('[data-k=feed]') as HTMLDivElement;
    this.inputEl = this.drawer.querySelector('[data-k=input]') as HTMLInputElement;
    this.badgeEl = this.chatBtn.querySelector('[data-k=badge]') as HTMLSpanElement;
    this.peerStatusEl = this.drawer.querySelector('[data-k=peers]') as HTMLSpanElement;
    this.voiceMetaEl = this.drawer.querySelector('[data-k=voiceMeta]') as HTMLDivElement;
    this.voiceToggleBtn = this.drawer.querySelector('[data-a=voiceToggle]') as HTMLButtonElement;
    this.voiceMuteBtn = this.drawer.querySelector('[data-a=voiceMute]') as HTMLButtonElement;

    this.wireEvents();
    this.openLocalBroadcast();
    this.pushMessage({
      id: 'sys-boot',
      senderId: 'system',
      sender: 'Plajah Comms',
      channel: 'all',
      text: 'Slim Plajah Chat & Proximity Voice ready. Press Y for chat or click VOICE to talk.',
      at: Date.now(),
      system: true,
    }, false);
    this.syncTabs();
    this.syncVoiceUi(this.lastVoiceState);

    this.pollTimer = window.setInterval(() => {
      this.syncPeerBadge();
      void this.pollServerChat();
    }, 2500);
  }

  setVisible(on: boolean): void {
    this.root.style.display = on ? 'flex' : 'none';
  }

  /** Reposition cleanly when the bottom-left racing minimap is active vs map overview. */
  setDrivingMode(driving: boolean): void {
    // Sit neatly beside PRE-ALPHA pill in menu/map view, and above the 210 px minimap in drive mode!
    this.root.style.left = driving ? '16px' : '114px';
    this.root.style.bottom = driving ? '248px' : '8px';
  }

  toggleOpen(force?: boolean): void {
    this.open = force !== undefined ? force : !this.open;
    this.drawer.style.display = this.open ? 'block' : 'none';
    if (this.open) {
      this.unread = 0;
      this.syncBadge();
      this.renderFeed();
    }
  }

  private wireEvents(): void {
    this.chatBtn.addEventListener('click', () => this.toggleOpen());
    this.drawer.querySelector('[data-a=close]')?.addEventListener('click', () => this.toggleOpen(false));
    this.drawer.querySelector('[data-a=hub]')?.addEventListener('click', () => this.opts.onOpenHub?.());

    this.voiceBtn.addEventListener('click', () => {
      const v = this.opts.session.voice;
      if (v && v.state.status === 'on') {
        v.setMuted(!v.state.muted);
      } else {
        void this.handleVoiceJoinOrToggle();
      }
    });
    this.voiceToggleBtn.addEventListener('click', () => { void this.handleVoiceJoinOrToggle(); });
    this.voiceMuteBtn.addEventListener('click', () => {
      const v = this.opts.session.voice;
      if (v) v.setMuted(!v.state.muted);
    });

    this.drawer.querySelectorAll<HTMLButtonElement>('[data-ch]').forEach((b) => {
      b.addEventListener('click', () => {
        this.channel = (b.dataset.ch as ChatChannel) ?? 'all';
        this.syncTabs();
        this.renderFeed();
      });
    });

    this.drawer.querySelectorAll<HTMLButtonElement>('[data-quick]').forEach((b) => {
      b.addEventListener('click', () => {
        const q = RACING_QUICK_CHAT.find((x) => x.id === b.dataset.quick);
        if (q) void this.send(q.text, q.id);
      });
    });

    const form = this.drawer.querySelector('[data-k=form]') as HTMLFormElement;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const raw = this.inputEl.value;
      this.inputEl.value = '';
      void this.send(raw);
    });

    // Prevent driving/siren keys from firing while typing in chat
    this.inputEl.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        this.inputEl.blur();
        this.toggleOpen(false);
      }
    });

    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        this.toggleOpen(true);
        setTimeout(() => this.inputEl.focus(), 20);
      } else if ((e.key === 'm' || e.key === 'M') && this.opts.session.voice) {
        this.opts.session.voice.setMuted(!this.opts.session.voice.state.muted);
      }
    });

    this.opts.session.onChat = (msg) => {
      this.pushMessage(msg, true);
    };
  }

  private openLocalBroadcast(): void {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      this.localChan = new BroadcastChannel('apex_plajah_chat_v1');
      this.localChan.onmessage = (ev) => {
        const d = ev.data as ApexChatMessage | null;
        if (!d || d.senderId === this.opts.session.peerId) return;
        this.pushMessage(d, true);
      };
    } catch { /* ignore */ }
  }

  private async handleVoiceJoinOrToggle(): Promise<void> {
    const s = this.opts.session;
    if (s.voice && (s.voice.state.status === 'on' || s.voice.state.status === 'connecting')) {
      s.stopVoice();
      this.syncVoiceUi({ status: 'off', error: '', muted: false, peers: [], speaking: [] });
      return;
    }
    if (!s.rt?.matchId) {
      this.toggleOpen(true);
      this.pushMessage({
        id: `sys-${Date.now()}`,
        senderId: 'system',
        sender: 'Voice',
        channel: 'all',
        text: 'Join an Online Open World or Circuit Lobby (click LOBBY above) to activate LiveKit Proximity Voice.',
        at: Date.now(),
        system: true,
      }, false);
      return;
    }
    const st = await s.startVoice(this.opts.apiBase, () => resolveGamerToken(), (v) => this.syncVoiceUi(v));
    if (st) this.syncVoiceUi(st);
  }

  private syncVoiceUi(v: GameVoiceState): void {
    this.lastVoiceState = v;
    if (v.status === 'on') {
      const talking = v.speaking.length > 0;
      this.voiceBtn.textContent = v.muted ? '🔇 MUTED (M)' : talking ? `🎙 TALKING (${v.peers.length})` : `🎙 VOICE · ${v.peers.length}`;
      this.voiceBtn.style.borderColor = v.muted ? 'rgba(255,140,0,.55)' : '#00f5a0';
      this.voiceBtn.style.color = v.muted ? '#FF8C00' : '#00f5a0';
      this.voiceMetaEl.textContent = v.muted
        ? `🔇 Mic muted · ${v.peers.length} nearby`
        : `🎙 Proximity live · ${v.peers.length} peer${v.peers.length === 1 ? '' : 's'}`;
      this.voiceToggleBtn.textContent = 'LEAVE';
      this.voiceMuteBtn.style.display = 'inline-block';
      this.voiceMuteBtn.textContent = v.muted ? 'UNMUTE (M)' : 'MUTE (M)';
    } else if (v.status === 'connecting') {
      this.voiceBtn.textContent = '🎙 CONNECTING…';
      this.voiceMetaEl.textContent = 'Connecting LiveKit spatial voice…';
      this.voiceMuteBtn.style.display = 'none';
    } else {
      this.voiceBtn.textContent = '🎙 VOICE';
      this.voiceBtn.style.borderColor = 'rgba(0,218,243,.32)';
      this.voiceBtn.style.color = '#00DAF3';
      this.voiceMetaEl.textContent = v.error ? `⚠ ${v.error}` : '🎙 Spatial proximity voice (LiveKit)';
      this.voiceToggleBtn.textContent = 'JOIN VOICE';
      this.voiceMuteBtn.style.display = 'none';
    }
  }

  private async send(raw: string, quickId?: string): Promise<void> {
    const cleaned = quickId ? raw : cleanText(raw);
    if (!cleaned) return;
    const now = Date.now();
    const rc = rateCheck(this.sendTimes, now);
    if ('retryMs' in rc) {
      this.pushMessage({
        id: `sys-rate-${now}`,
        senderId: 'system',
        sender: 'Plajah Comms',
        channel: this.channel,
        text: `Slow down — try again in ${Math.ceil(rc.retryMs / 1000)}s`,
        at: now,
        system: true,
      }, false);
      return;
    }
    this.sendTimes = rc.times;
    const msg: ApexChatMessage = {
      id: `${this.opts.session.peerId}_${now}`,
      senderId: this.opts.session.peerId,
      sender: this.opts.session.profile.driverName,
      channel: this.channel,
      text: cleaned,
      at: now,
      quick: quickId,
    };
    this.pushMessage(msg, false);
    this.opts.session.sendChatMessage(msg);
    try { this.localChan?.postMessage(msg); } catch { /* ignore */ }

    // Also post to Plajah Gamer Network chat API if connected to a Realtime match room
    const matchId = this.opts.session.rt?.matchId;
    if (matchId) {
      try {
        const tok = await resolveGamerToken(1000);
        if (tok) {
          await fetch(`${this.opts.apiBase}/api/gamer/chat/post`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
            body: JSON.stringify({ scope: `rt_${matchId}`, text: cleaned, quick: quickId }),
          });
        }
      } catch { /* fallback stays live via local/WS */ }
    }
  }

  private async pollServerChat(): Promise<void> {
    const matchId = this.opts.session.rt?.matchId;
    if (!matchId) return;
    const scope = `rt_${matchId}`;
    if (scope !== this.lastScope) { this.lastScope = scope; this.lastServerSeq = 0; }
    try {
      const tok = await resolveGamerToken(800);
      if (!tok) return;
      const res = await fetch(`${this.opts.apiBase}/api/gamer/chat?scope=${encodeURIComponent(scope)}&since=${this.lastServerSeq}`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (!res.ok) return;
      const data = await res.json() as { lines?: Array<{ seq: number; id: string; uid: string; name: string; text: string; kind: string; at: number }> };
      for (const l of data.lines ?? []) {
        if (l.seq > this.lastServerSeq) this.lastServerSeq = l.seq;
        if (this.messages.some((m) => m.id === l.id)) continue;
        this.pushMessage({
          id: l.id,
          senderId: l.uid || 'system',
          sender: l.name || 'Driver',
          channel: 'lobby',
          text: l.text,
          at: l.at || Date.now(),
          system: l.kind === 'system',
        }, true);
      }
    } catch { /* offline/local mode */ }
  }

  private pushMessage(msg: ApexChatMessage, countUnread: boolean): void {
    if (this.mutedSenders.has(msg.senderId)) return;
    if (this.messages.some((m) => m.id === msg.id)) return;
    this.messages.push(msg);
    if (this.messages.length > 60) this.messages.shift();
    if (countUnread && !this.open) {
      this.unread = Math.min(99, this.unread + 1);
      this.syncBadge();
    }
    if (this.open) this.renderFeed();
  }

  private syncBadge(): void {
    this.badgeEl.textContent = String(this.unread);
    this.badgeEl.style.display = this.unread > 0 ? 'inline-block' : 'none';
  }

  private syncPeerBadge(): void {
    const s = this.opts.session;
    const n = s.remotes.size;
    if (s.rt) {
      this.peerStatusEl.textContent = `ONLINE · ${n + 1}P`;
      this.peerStatusEl.style.color = '#00f5a0';
    } else if (s.mode !== 'offline') {
      this.peerStatusEl.textContent = `SYNC · ${n + 1}P`;
      this.peerStatusEl.style.color = '#FF8C00';
    } else {
      this.peerStatusEl.textContent = 'SOLO / LOCAL';
      this.peerStatusEl.style.color = 'rgba(208,188,255,.72)';
    }
  }

  private syncTabs(): void {
    this.drawer.querySelectorAll<HTMLButtonElement>('[data-ch]').forEach((b) => {
      const on = b.dataset.ch === this.channel;
      b.style.background = on ? 'rgba(0,218,243,.22)' : 'rgba(255,255,255,.05)';
      b.style.border = on ? '1px solid rgba(0,218,243,.55)' : '1px solid rgba(255,255,255,.10)';
      b.style.color = on ? '#fff' : 'rgba(255,255,255,.62)';
    });
  }

  private renderFeed(): void {
    const filtered = this.messages.filter((m) =>
      !this.mutedSenders.has(m.senderId) && (this.channel === 'all' || m.system || m.channel === this.channel),
    );
    this.feedEl.innerHTML = filtered.map((m) => {
      if (m.system) {
        return `<div style="color:rgba(208,188,255,.74);font-size:11px;font-style:italic">${esc(m.text)}</div>`;
      }
      const isMe = m.senderId === this.opts.session.peerId;
      const tagCol = m.channel === 'proximity' ? '#00f5a0' : m.channel === 'lobby' ? '#FF8C00' : '#00DAF3';
      const muteAction = !isMe
        ? `<button type="button" data-mute="${esc(m.senderId)}" title="Mute player" style="margin-left:4px;padding:0 4px;border:0;background:transparent;color:rgba(255,255,255,.35);font-size:10px;cursor:pointer">✕</button>`
        : '';
      return `<div><span style="color:${tagCol};font:700 10px 'JetBrains Mono',monospace">[${m.channel.slice(0, 3).toUpperCase()}]</span> <b style="color:${isMe ? '#FF8C00' : '#fff'}">${esc(m.sender)}</b>: <span>${esc(m.text)}</span>${muteAction}</div>`;
    }).join('');
    this.feedEl.querySelectorAll<HTMLButtonElement>('[data-mute]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.mute;
        if (id) { this.mutedSenders.add(id); this.renderFeed(); }
      });
    });
    this.feedEl.scrollTop = this.feedEl.scrollHeight;
  }

  dispose(): void {
    clearInterval(this.pollTimer);
    this.localChan?.close();
    this.root.remove();
  }
}

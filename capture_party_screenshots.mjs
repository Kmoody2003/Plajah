// capture_brochure_assets.mjs — Puppeteer script to capture pixel-perfect screenshots of Ambo Party/Event Mode UI
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/Kenne/.gemini/antigravity/brain/2b6d27d4-a254-4e33-8358-852de0ebf37d';
const SCRATCH_DIR = path.join(ARTIFACT_DIR, 'scratch');

if (!fs.existsSync(SCRATCH_DIR)) {
  fs.mkdirSync(SCRATCH_DIR, { recursive: true });
}

// ── HTML Templates for the exact UI States ───────────────────────────────────

const htmlHeader = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap">
  <style>
    * { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; }
    .font-mono { font-family: 'JetBrains Mono', monospace; }
  </style>
</head>
<body class="bg-[#0A0711] text-white p-0 m-0 overflow-hidden antialiased">`;

const htmlFooter = `</body></html>`;

// 1. Central Command Modal View
const modalHtml = `${htmlHeader}
<div class="w-[1280px] h-[820px] bg-[#0A0711] p-8 flex items-center justify-center relative overflow-hidden">
  <!-- Backdrop subtle UI -->
  <div class="absolute inset-0 opacity-15 filter blur-sm pointer-events-none bg-[radial-gradient(ellipse_at_top,#6B0099_0%,transparent_60%)]"></div>

  <!-- Modal Container -->
  <div class="relative w-full max-w-5xl rounded-2xl bg-[#0d091a] border border-white/20 shadow-[0_20px_60px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
      <div class="flex items-center gap-3.5">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6B0099] to-[#D40055] flex items-center justify-center shadow-lg shadow-purple-900/40">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/></svg>
        </div>
        <div>
          <div class="flex items-center gap-2.5">
            <h2 class="text-base font-black tracking-wide uppercase">Party / Event Central Command</h2>
            <span class="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1.5 shadow-[0_0_10px_rgba(52,211,153,0.25)]">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              LIVE ON AIR
            </span>
          </div>
          <p class="text-xs text-white/50 mt-0.5">Transform all signed-in browsers & screens into synchronized or independent audio/visual destinations.</p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <button class="px-4 py-2 rounded-xl text-xs font-black tracking-wide uppercase bg-red-500/20 text-red-300 border border-red-500/40 flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-red-400 animate-pulse"></span>
          End Event Mode
        </button>
      </div>
    </div>

    <!-- Master Hero Bar -->
    <div class="p-5 bg-gradient-to-r from-[#190e2e] via-[#120b22] to-[#1e1035] border-b border-white/10 flex items-center justify-between">
      <div class="flex items-center gap-4">
        <!-- Master Sync Button -->
        <div class="px-6 py-3.5 rounded-xl text-xs font-black uppercase flex items-center gap-3.5 bg-[#FF8C00] text-black shadow-[0_0_25px_rgba(255,140,0,0.4)] ring-2 ring-[#FF8C00]/60">
          <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          <div class="text-left">
            <div class="text-sm font-black tracking-wider">⚡ MASTER SYNC: ALL DEVICES SLAVED</div>
            <div class="text-[10.5px] font-medium opacity-85 normal-case tracking-normal">Every device follows Master presentation, live video, and audio.</div>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs text-white/60 font-mono bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">4 Active Screen(s) Connected</span>
        <div class="px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-white/80 flex items-center gap-2">
          <span class="text-[#00DAF3] font-mono text-[11px]">https://plajah.com/?partyDisplay=1</span>
          <span class="px-2 py-0.5 rounded bg-[#00DAF3] text-black text-[10px] font-bold">Copy Link</span>
        </div>
      </div>
    </div>

    <!-- Tabs Header -->
    <div class="flex items-center gap-2 px-6 pt-3 border-b border-white/10 bg-white/[0.01]">
      <div class="px-4 py-2 border-b-2 border-[#00DAF3] text-xs font-bold uppercase tracking-wider text-[#00DAF3] flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
        <span>Output Devices (4)</span>
      </div>
      <div class="px-4 py-2 border-b-2 border-transparent text-xs font-bold uppercase tracking-wider text-white/40 flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
        <span>Project Playlist Architecture</span>
      </div>
      <div class="px-4 py-2 border-b-2 border-transparent text-xs font-bold uppercase tracking-wider text-white/40 flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
        <span>Pair New Display</span>
      </div>
    </div>

    <!-- Device List Table -->
    <div class="p-6 space-y-3 overflow-y-auto max-h-[460px]">
      <!-- Device 1: Living Room TV -->
      <div class="p-4 rounded-xl border border-white/15 bg-white/[0.03] flex items-center justify-between gap-4 shadow-sm">
        <div class="flex items-center gap-3.5 min-w-[240px]">
          <div class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[#00DAF3]">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="font-extrabold text-sm text-white">Living Room TV (Samsung 65")</span>
              <span class="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]"></span>
            </div>
            <div class="text-[11px] text-white/40 flex items-center gap-1.5 mt-0.5">
              <span>Smart TV</span><span>·</span><span>3840×2160 (4K)</span><span>·</span><span class="text-emerald-400 font-mono text-[10px]">ONLINE</span>
            </div>
          </div>
        </div>
        <div class="flex flex-col gap-1 min-w-[210px]">
          <span class="text-[10px] font-bold uppercase tracking-wider text-white/50">Assigned Duty</span>
          <div class="bg-black/60 border border-[#00DAF3]/50 rounded-lg px-3 py-1.5 text-xs font-bold text-white flex items-center justify-between">
            <span>Ambo Program Out</span>
            <span class="text-[9px] text-[#00DAF3] font-mono">LIVE PGM</span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-4 h-4 rounded bg-[#FF8C00] flex items-center justify-center text-black text-xs font-black">✓</span>
          <div>
            <div class="text-xs font-bold text-white">Participates in Master Sync</div>
            <div class="text-[10px] text-white/40">Follows master when sync engaged</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <div class="p-2 rounded-lg bg-white/5 border border-white/10 text-white/70">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/></svg>
          </div>
          <button class="px-2.5 py-1.5 rounded-lg bg-[#00DAF3]/15 border border-[#00DAF3]/30 text-[#00DAF3] text-xs font-bold">Ping</button>
          <div class="p-2 rounded-lg bg-white/5 border border-white/10 text-white/50">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
          </div>
        </div>
      </div>

      <!-- Device 2: Patio iPad Pro -->
      <div class="p-4 rounded-xl border border-white/15 bg-white/[0.03] flex items-center justify-between gap-4 shadow-sm">
        <div class="flex items-center gap-3.5 min-w-[240px]">
          <div class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-purple-400">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="font-extrabold text-sm text-white">Patio iPad Pro (Safari)</span>
              <span class="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]"></span>
            </div>
            <div class="text-[11px] text-white/40 flex items-center gap-1.5 mt-0.5">
              <span>Tablet</span><span>·</span><span>2732×2048 Retina</span><span>·</span><span class="text-emerald-400 font-mono text-[10px]">ONLINE</span>
            </div>
          </div>
        </div>
        <div class="flex flex-col gap-1 min-w-[210px]">
          <span class="text-[10px] font-bold uppercase tracking-wider text-white/50">Assigned Duty</span>
          <div class="bg-black/60 border border-purple-500/50 rounded-lg px-3 py-1.5 text-xs font-bold text-white flex items-center justify-between">
            <span class="flex items-center gap-1.5 text-purple-300">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg>
              Chora Music Playlist
            </span>
            <span class="text-[9px] text-purple-400 font-mono">LOUNGE</span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-4 h-4 rounded bg-[#FF8C00] flex items-center justify-center text-black text-xs font-black">✓</span>
          <div>
            <div class="text-xs font-bold text-white">Participates in Master Sync</div>
            <div class="text-[10px] text-white/40">Returns to Chora when sync muted</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <div class="p-2 rounded-lg bg-white/5 border border-white/10 text-white/70">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/></svg>
          </div>
          <button class="px-2.5 py-1.5 rounded-lg bg-[#00DAF3]/15 border border-[#00DAF3]/30 text-[#00DAF3] text-xs font-bold">Ping</button>
          <div class="p-2 rounded-lg bg-white/5 border border-white/10 text-white/50">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
          </div>
        </div>
      </div>

      <!-- Device 3: Front Bar Monitor -->
      <div class="p-4 rounded-xl border border-white/15 bg-white/[0.03] flex items-center justify-between gap-4 shadow-sm">
        <div class="flex items-center gap-3.5 min-w-[240px]">
          <div class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[#FF8C00]">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"/></svg>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="font-extrabold text-sm text-white">Front Bar Monitor (Booth Mac)</span>
              <span class="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]"></span>
            </div>
            <div class="text-[11px] text-white/40 flex items-center gap-1.5 mt-0.5">
              <span>Desktop</span><span>·</span><span>1920×1080 FHD</span><span>·</span><span class="text-emerald-400 font-mono text-[10px]">ONLINE</span>
            </div>
          </div>
        </div>
        <div class="flex flex-col gap-1 min-w-[210px]">
          <span class="text-[10px] font-bold uppercase tracking-wider text-white/50">Assigned Duty</span>
          <div class="bg-black/60 border border-[#FF8C00]/50 rounded-lg px-3 py-1.5 text-xs font-bold text-white flex items-center justify-between">
            <span class="flex items-center gap-1.5 text-amber-300">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              Reello Video Loop
            </span>
            <span class="text-[9px] text-[#FF8C00] font-mono">REEL 4K</span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-4 h-4 rounded bg-[#FF8C00] flex items-center justify-center text-black text-xs font-black">✓</span>
          <div>
            <div class="text-xs font-bold text-white">Participates in Master Sync</div>
            <div class="text-[10px] text-white/40">Returns to Video Loop on mute</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <div class="p-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"/></svg>
          </div>
          <button class="px-2.5 py-1.5 rounded-lg bg-[#00DAF3]/15 border border-[#00DAF3]/30 text-[#00DAF3] text-xs font-bold">Ping</button>
          <div class="p-2 rounded-lg bg-white/5 border border-white/10 text-white/50">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
          </div>
        </div>
      </div>

      <!-- Device 4: Backstage Confidence Monitor -->
      <div class="p-4 rounded-xl border border-white/15 bg-white/[0.03] flex items-center justify-between gap-4 shadow-sm">
        <div class="flex items-center gap-3.5 min-w-[240px]">
          <div class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-amber-400">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="font-extrabold text-sm text-white">Backstage Monitor (Tablet)</span>
              <span class="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]"></span>
            </div>
            <div class="text-[11px] text-white/40 flex items-center gap-1.5 mt-0.5">
              <span>Foldback</span><span>·</span><span>1920×1200</span><span>·</span><span class="text-emerald-400 font-mono text-[10px]">ONLINE</span>
            </div>
          </div>
        </div>
        <div class="flex flex-col gap-1 min-w-[210px]">
          <span class="text-[10px] font-bold uppercase tracking-wider text-white/50">Assigned Duty</span>
          <div class="bg-black/60 border border-amber-500/50 rounded-lg px-3 py-1.5 text-xs font-bold text-white flex items-center justify-between">
            <span class="text-amber-200">Stage Confidence Display</span>
            <span class="text-[9px] text-amber-400 font-mono">NOTES</span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-4 h-4 rounded border border-white/30 flex items-center justify-center text-white/40 text-xs"></span>
          <div>
            <div class="text-xs font-bold text-white/70">Always Independent</div>
            <div class="text-[10px] text-white/40">Retains notes & clocks during sync</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <div class="p-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"/></svg>
          </div>
          <button class="px-2.5 py-1.5 rounded-lg bg-[#00DAF3]/15 border border-[#00DAF3]/30 text-[#00DAF3] text-xs font-bold">Ping</button>
          <div class="p-2 rounded-lg bg-white/5 border border-white/10 text-white/50">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
${htmlFooter}`;

// 2. Horizontal Multiview with Party Devices Dock View
const multiviewHtml = `${htmlHeader}
<div class="w-[1280px] h-[360px] bg-[#07050C] border-t border-b border-white/10 flex flex-col justify-between p-3 select-none">
  <!-- Bar Header -->
  <div class="flex items-center justify-between pb-2 border-b border-white/[0.08]">
    <div class="flex items-center gap-3">
      <span class="text-[11px] font-black tracking-wider uppercase flex items-center gap-1.5 text-white/90">
        <svg class="w-3.5 h-3.5 text-[#00DAF3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/></svg>
        Ambo Multiview
      </span>
      <!-- Mode Tabs -->
      <div class="flex items-center bg-black/50 rounded-lg p-0.5 border border-white/10 text-[10px]">
        <button class="px-2.5 py-0.5 rounded font-bold uppercase text-white/50">Studio Busses (5)</button>
        <button class="px-2.5 py-0.5 rounded font-black uppercase bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-sm flex items-center gap-1">
          <span>✨ Party Devices (4)</span>
        </button>
      </div>
      <!-- Live Status & Sync Toggle -->
      <div class="flex items-center gap-2">
        <span class="text-[9.5px] font-black uppercase px-2.5 py-0.5 rounded-full bg-gradient-to-r from-purple-500/30 to-pink-500/30 text-pink-300 border border-pink-500/40 flex items-center gap-1">
          <span>🎉 EVENT MODE: LIVE</span>
        </span>
        <div class="text-[9.5px] font-black uppercase px-2.5 py-0.5 rounded flex items-center gap-1.5 bg-[#FF8C00] text-black shadow-md shadow-[#FF8C00]/40">
          <svg class="w-3 h-3 fill-current" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          <span>⚡ MASTER SYNC: ON</span>
        </div>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <div class="px-2.5 py-1 rounded text-[10px] font-bold text-white/80 bg-white/5 border border-white/10">Configure Mesh</div>
      <div class="px-3 py-1 rounded text-[10.5px] font-black text-[#04222a] bg-[#00DAF3] flex items-center gap-1">
        <span>CUT PRV → PGM</span>
      </div>
    </div>
  </div>

  <!-- 4 Wide Tiles -->
  <div class="grid grid-cols-4 gap-3 pt-2 h-[280px]">
    <!-- TILE 1: Living Room TV (Slaved to Program) -->
    <div class="rounded-xl border border-[#FF8C00]/70 bg-[#FF8C00]/[0.03] p-2 flex flex-col justify-between shadow-[0_0_15px_rgba(255,140,0,0.15)]">
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-[10px] font-extrabold text-white truncate flex items-center gap-1">
            <span class="text-[#00DAF3]">📺</span> Living Room TV (65")
          </span>
          <span class="text-[8px] font-black px-1.5 py-0.2 rounded bg-[#FF8C00]/25 text-[#FF8C00] uppercase font-mono">SLAVED</span>
        </div>
        <!-- Monitor canvas -->
        <div class="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-white/10 flex flex-col items-center justify-center p-3 text-center bg-gradient-to-br from-indigo-950/60 to-black">
          <div class="text-xs font-black text-amber-200 uppercase tracking-widest mb-1">Coming Home</div>
          <div class="text-[11px] font-semibold text-white/90">Luke 15:11–24 · KJV</div>
          <div class="text-[8.5px] text-white/50 mt-1">Pastor Dave Ellison</div>
        </div>
      </div>
      <div class="mt-2 pt-1 border-t border-white/10 flex items-center justify-between text-[9px]">
        <span class="font-bold text-[#FF8C00]">DUTY: Ambo Program Out</span>
        <span class="text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-white/80">Follows PGM</span>
      </div>
    </div>

    <!-- TILE 2: Patio iPad (Independent Chora Music) -->
    <div class="rounded-xl border border-emerald-500/50 bg-emerald-500/[0.03] p-2 flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-[10px] font-extrabold text-white truncate flex items-center gap-1">
            <span class="text-purple-400">📱</span> Patio iPad Pro
          </span>
          <span class="text-[8px] font-black px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 uppercase font-mono">INDEPENDENT</span>
        </div>
        <!-- Music monitor -->
        <div class="relative w-full aspect-video rounded-lg overflow-hidden border border-white/10 flex flex-col items-center justify-center p-2 text-center bg-gradient-to-br from-[#1b092f] via-[#0b0313] to-[#040816]">
          <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-500 to-pink-500 p-0.5 shadow-lg mb-1 animate-spin" style="animation-duration: 12s">
            <div class="w-full h-full rounded-full bg-black flex items-center justify-center">
              <span class="text-[10px]">🎵</span>
            </div>
          </div>
          <div class="text-[10px] font-black text-white truncate max-w-[200px]">Summer Vibes & Sunset</div>
          <div class="text-[8px] text-white/50">Chora Lounge Mix · 124 BPM</div>
        </div>
      </div>
      <div class="mt-2 pt-1 border-t border-white/10 flex items-center justify-between text-[9px]">
        <span class="font-bold text-purple-300">DUTY: Chora Music</span>
        <span class="text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">Playing Local</span>
      </div>
    </div>

    <!-- TILE 3: Front Bar Monitor (Independent Reello Video) -->
    <div class="rounded-xl border border-emerald-500/50 bg-emerald-500/[0.03] p-2 flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-[10px] font-extrabold text-white truncate flex items-center gap-1">
            <span class="text-emerald-400">🖥️</span> Front Bar Monitor
          </span>
          <span class="text-[8px] font-black px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 uppercase font-mono">INDEPENDENT</span>
        </div>
        <!-- Video monitor -->
        <div class="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-white/10 flex flex-col items-center justify-center p-2 text-center bg-gradient-to-br from-[#241300] to-black">
          <span class="text-2xl mb-1">🎬</span>
          <div class="text-[10px] font-black text-white truncate max-w-[200px]">Festival Highlights 4K</div>
          <div class="text-[8px] text-amber-400/80 font-mono">Loop Active · Reello Cinema</div>
        </div>
      </div>
      <div class="mt-2 pt-1 border-t border-white/10 flex items-center justify-between text-[9px]">
        <span class="font-bold text-amber-300">DUTY: Reello Video</span>
        <span class="text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">Looping</span>
      </div>
    </div>

    <!-- TILE 4: Backstage Confidence Monitor -->
    <div class="rounded-xl border border-emerald-500/50 bg-emerald-500/[0.03] p-2 flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-[10px] font-extrabold text-white truncate flex items-center gap-1">
            <span class="text-amber-400">⏱️</span> Backstage Monitor
          </span>
          <span class="text-[8px] font-black px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 uppercase font-mono">INDEPENDENT</span>
        </div>
        <!-- Stage monitor -->
        <div class="relative w-full aspect-video bg-[#0a0815] rounded-lg overflow-hidden border border-white/10 flex flex-col justify-between p-2">
          <div class="flex items-center justify-between">
            <span class="font-mono text-xs font-bold text-amber-300">10:45:12 AM</span>
            <span class="font-mono text-[9px] bg-white/10 px-1 rounded text-white/70">+14:22</span>
          </div>
          <div class="text-center my-auto">
            <div class="text-[8px] text-white/40 uppercase">CURRENT SLIDE</div>
            <div class="text-[10.5px] font-bold text-white truncate">The Father Runs</div>
          </div>
          <div class="text-[8px] text-[#00DAF3] truncate">NEXT: Compassion & Robe</div>
        </div>
      </div>
      <div class="mt-2 pt-1 border-t border-white/10 flex items-center justify-between text-[9px]">
        <span class="font-bold text-amber-300">DUTY: Stage Confidence</span>
        <span class="text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-white/70">Foldback Active</span>
      </div>
    </div>
  </div>
</div>
${htmlFooter}`;

// 3. Receiver Chora Duty View (What's on the iPad)
const choraReceiverHtml = `${htmlHeader}
<div class="w-[1280px] h-[720px] bg-gradient-to-br from-[#12061f] via-[#090312] to-[#040817] flex flex-col items-center justify-center p-8 relative overflow-hidden">
  <!-- Glowing ambient orb -->
  <div class="absolute w-[650px] h-[650px] rounded-full bg-gradient-to-tr from-purple-600/30 via-pink-500/20 to-cyan-500/20 blur-3xl animate-pulse pointer-events-none"></div>

  <!-- HUD Bar -->
  <div class="absolute top-6 left-6 right-6 flex items-center justify-between">
    <div class="flex items-center gap-2 bg-black/80 backdrop-blur-md border border-white/15 px-4 py-2 rounded-xl shadow-2xl">
      <span class="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]"></span>
      <span class="text-xs font-extrabold tracking-wide uppercase text-white/90">Patio iPad Pro (Safari)</span>
      <span class="text-white/20">|</span>
      <span class="text-[10.5px] font-bold uppercase px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1.5">
        <span>🎵</span>
        DUTY: CHORA MUSIC LOUNGE
      </span>
    </div>
    <div class="flex items-center gap-2">
      <div class="px-3.5 py-1.5 rounded-xl bg-black/80 backdrop-blur-md border border-white/15 text-xs font-mono text-emerald-400">● AUDIO UNLOCKED</div>
      <div class="p-2 rounded-xl bg-black/80 backdrop-blur-md border border-white/15 text-white/70">⛶ Fullscreen (F)</div>
    </div>
  </div>

  <!-- Main Centerpiece -->
  <div class="relative z-10 flex flex-col items-center text-center max-w-2xl">
    <!-- Vinyl Artwork -->
    <div class="relative w-64 h-64 rounded-3xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.8)] border border-white/25 mb-8 bg-black/60 flex items-center justify-center">
      <div class="w-full h-full bg-gradient-to-br from-[#6B0099] via-[#85006b] to-[#D40055] flex flex-col items-center justify-center p-4">
        <div class="w-20 h-20 rounded-full border-4 border-white/30 flex items-center justify-center mb-2">
          <div class="w-8 h-8 rounded-full bg-white/80"></div>
        </div>
        <div class="font-black text-sm tracking-widest text-white/90 uppercase">PLAJAH CHORA</div>
      </div>
    </div>

    <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 text-xs font-bold uppercase tracking-wider mb-3">
      <span>CHORA RECORDINGS · LOCAL HIGH-RES STEREO</span>
    </div>

    <h1 class="text-4xl md:text-5xl font-black text-white mb-2 tracking-tight">Summer Vibes & Sunset (Original Mix)</h1>
    <p class="text-xl text-white/60 font-medium">Chora Artists Collective · 24-bit 96kHz Lossless</p>

    <!-- Animated Waveform Visualizer -->
    <div class="flex items-center gap-2 mt-8 h-14">
      <span class="w-2 bg-gradient-to-t from-purple-500 to-cyan-400 rounded-full h-[35%]"></span>
      <span class="w-2 bg-gradient-to-t from-purple-500 to-cyan-400 rounded-full h-[65%]"></span>
      <span class="w-2 bg-gradient-to-t from-purple-500 to-cyan-400 rounded-full h-[90%]"></span>
      <span class="w-2 bg-gradient-to-t from-purple-500 to-cyan-400 rounded-full h-[45%]"></span>
      <span class="w-2 bg-gradient-to-t from-purple-500 to-cyan-400 rounded-full h-[100%]"></span>
      <span class="w-2 bg-gradient-to-t from-purple-500 to-cyan-400 rounded-full h-[75%]"></span>
      <span class="w-2 bg-gradient-to-t from-purple-500 to-cyan-400 rounded-full h-[60%]"></span>
      <span class="w-2 bg-gradient-to-t from-purple-500 to-cyan-400 rounded-full h-[85%]"></span>
      <span class="w-2 bg-gradient-to-t from-purple-500 to-cyan-400 rounded-full h-[95%]"></span>
      <span class="w-2 bg-gradient-to-t from-purple-500 to-cyan-400 rounded-full h-[55%]"></span>
      <span class="w-2 bg-gradient-to-t from-purple-500 to-cyan-400 rounded-full h-[80%]"></span>
      <span class="w-2 bg-gradient-to-t from-purple-500 to-cyan-400 rounded-full h-[40%]"></span>
      <span class="w-2 bg-gradient-to-t from-purple-500 to-cyan-400 rounded-full h-[70%]"></span>
    </div>
  </div>
</div>
${htmlFooter}`;

// 4. Receiver Master Sync View (What's on the Living Room TV)
const masterSyncReceiverHtml = `${htmlHeader}
<div class="w-[1280px] h-[720px] bg-black flex flex-col items-center justify-center p-12 relative overflow-hidden">
  <!-- HUD Bar -->
  <div class="absolute top-6 left-6 right-6 flex items-center justify-between z-20">
    <div class="flex items-center gap-2 bg-black/85 backdrop-blur-md border border-white/20 px-4 py-2 rounded-xl shadow-2xl">
      <span class="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]"></span>
      <span class="text-xs font-extrabold tracking-wide uppercase text-white/90">Living Room TV (Samsung 65")</span>
      <span class="text-white/20">|</span>
      <span class="text-[10.5px] font-black uppercase px-2.5 py-0.5 rounded bg-[#FF8C00]/25 text-[#FF8C00] border border-[#FF8C00]/40 flex items-center gap-1.5 animate-pulse">
        <svg class="w-3 h-3 fill-current" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        SLAVED TO AMBO MASTER CONTROL
      </span>
    </div>
    <div class="flex items-center gap-2">
      <div class="px-3.5 py-1.5 rounded-xl bg-black/85 backdrop-blur-md border border-white/20 text-xs font-mono text-cyan-300">STREAM: 0ms LATENCY</div>
      <div class="p-2 rounded-xl bg-black/85 backdrop-blur-md border border-white/20 text-white/70">⛶ Fullscreen (F)</div>
    </div>
  </div>

  <!-- Simulated Audience Program Out Canvas -->
  <div class="relative w-full h-full max-w-5xl rounded-2xl overflow-hidden shadow-2xl flex flex-col justify-center items-center text-center p-12 bg-gradient-to-br from-[#120824] via-[#090514] to-[#04010a] border border-white/10">
    <!-- Golden scripture header -->
    <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#E3C57E]/15 border border-[#E3C57E]/30 text-[#E3C57E] text-xs font-bold uppercase tracking-widest mb-6">
      <span>LUKE 15:11–24 · MESSAGE</span>
    </div>

    <h1 class="text-6xl md:text-7xl font-serif font-bold text-white mb-6 tracking-tight leading-tight" style="font-family: 'Georgia', serif;">
      "The Father Runs"
    </h1>

    <p class="text-2xl text-white/80 max-w-3xl font-light leading-relaxed mb-8">
      "And he arose and came to his father. But while he was still a long way off, his father saw him and felt compassion, and ran and embraced him and kissed him."
    </p>

    <div class="text-sm font-semibold text-white/40 tracking-wider uppercase font-mono">
      Pastor Dave Ellison · Sunday Morning Gathering
    </div>
  </div>
</div>
${htmlFooter}`;

// ── Run Puppeteer to generate screenshots ─────────────────────────────────────

async function main() {
  console.log('Launching Puppeteer...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 2 });

  // 1. Central Command Modal
  console.log('Capturing ambo_party_command_modal.png...');
  await page.setContent(modalHtml, { waitUntil: 'networkidle0' });
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'ambo_party_command_modal.png'),
    type: 'png',
  });

  // 2. Multiview Dock
  console.log('Capturing ambo_multiview_party_dock.png...');
  await page.setViewport({ width: 1280, height: 360, deviceScaleFactor: 2 });
  await page.setContent(multiviewHtml, { waitUntil: 'networkidle0' });
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'ambo_multiview_party_dock.png'),
    type: 'png',
  });

  // 3. Receiver Chora Duty
  console.log('Capturing party_receiver_chora_duty.png...');
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
  await page.setContent(choraReceiverHtml, { waitUntil: 'networkidle0' });
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'party_receiver_chora_duty.png'),
    type: 'png',
  });

  // 4. Receiver Master Sync
  console.log('Capturing party_receiver_master_sync.png...');
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
  await page.setContent(masterSyncReceiverHtml, { waitUntil: 'networkidle0' });
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'party_receiver_master_sync.png'),
    type: 'png',
  });

  await browser.close();
  console.log('All screenshots successfully captured in:', ARTIFACT_DIR);
}

main().catch(console.error);

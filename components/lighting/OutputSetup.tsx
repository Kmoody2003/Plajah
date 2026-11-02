// Connecting the rig. Shared by the Simple add-a-light flow and Pro's Output tab, and honest about
// what each environment can do: a web page has USB through Web Serial but no UDP.

import React, { useState } from 'react';
import { Network, Trash2, Usb } from 'lucide-react';
import { boardEngine, useBoard } from '../../services/lighting/boardEngine';
import { OUTPUT_LABEL, networkSupported, openNetworkOutput, openSerialOutput, serialSupported } from '../../services/lighting/dmxOutput';
import { uid } from '../../services/lighting/boardCore';

const inputCls = 'bg-white/[0.06] border border-white/10 rounded-md px-2 py-1.5 text-xs text-white outline-none focus:border-[#FF8C00]/60 min-w-0';

export function OutputSetup({ compact }: { compact?: boolean }) {
  const board = useBoard();
  const [error, setError] = useState('');
  const [universe, setUniverse] = useState(1);
  const [host, setHost] = useState('');

  const usb = async (kind: 'enttec-pro' | 'open-dmx') => {
    setError('');
    try {
      const output = await openSerialOutput(kind, universe, uid('out'));
      if (output) boardEngine.addOutput(output);
    } catch (e: any) {
      setError(e?.message || 'That interface would not open. Is another program using it?');
    }
  };

  const net = (kind: 'artnet' | 'sacn') => {
    setError('');
    boardEngine.addOutput(openNetworkOutput(kind, universe, uid('out'), host || undefined));
  };

  const hasSerial = serialSupported(), hasNet = networkSupported();

  return (
    <div className="space-y-3">
      {!compact && (
        <label className="flex items-center gap-2 text-xs text-white/60">
          Universe
          <input type="number" min={1} max={32767} value={universe} onChange={(e) => setUniverse(Math.max(1, Number(e.target.value) || 1))} className={`${inputCls} w-20`} />
        </label>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <button disabled={!hasSerial} onClick={() => usb('enttec-pro')} className="flex items-center gap-2.5 p-3 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-left disabled:opacity-40">
          <Usb size={16} className="text-[#FF8C00] shrink-0" />
          <span><span className="block text-sm font-medium">USB DMX box</span><span className="block text-xs text-white/50">ENTTEC Pro, DMXKing and similar</span></span>
        </button>
        <button disabled={!hasSerial} onClick={() => usb('open-dmx')} className="flex items-center gap-2.5 p-3 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-left disabled:opacity-40">
          <Usb size={16} className="text-white/60 shrink-0" />
          <span><span className="block text-sm font-medium">USB cable (basic)</span><span className="block text-xs text-white/50">Open DMX and other FTDI dongles</span></span>
        </button>
      </div>
      {!hasSerial && <p className="text-xs text-amber-300/80">USB needs Chrome, Edge or the Plajah desktop app.</p>}

      {!compact && (
        <div className="p-3 rounded-lg border border-white/10 bg-white/[0.03] space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium"><Network size={15} className="text-white/60" /> Network nodes</div>
          {hasNet ? (
            <>
              <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="Node IP (blank: Art-Net broadcast, sACN multicast)" className={`${inputCls} w-full`} />
              <div className="flex gap-2">
                <button onClick={() => net('artnet')} className="flex-1 py-2 rounded-md bg-white/10 hover:bg-white/15 text-xs font-semibold">Add Art-Net</button>
                <button onClick={() => net('sacn')} className="flex-1 py-2 rounded-md bg-white/10 hover:bg-white/15 text-xs font-semibold">Add sACN</button>
              </div>
            </>
          ) : (
            <p className="text-xs text-white/50">Art-Net and sACN run from the Plajah desktop app. A web page isn't allowed to send them.</p>
          )}
        </div>
      )}

      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}

      {board.outputs.length > 0 && (
        <ul className="space-y-1.5">
          {board.outputs.map((o) => (
            <li key={o.config.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] text-xs">
              <span className={`w-2 h-2 rounded-full shrink-0 ${o.status === 'live' ? 'bg-emerald-400' : 'bg-red-500'}`} />
              <span className="flex-1 min-w-0">
                <span className="block truncate">{OUTPUT_LABEL[o.config.kind]} · Universe {o.config.universe}{o.config.host ? ` → ${o.config.host}` : ''}</span>
                <span className="block text-white/50 truncate">{o.status === 'live' ? `${o.framesSent.toLocaleString()} frames sent` : o.detail || o.status}</span>
              </span>
              <button aria-label="Remove output" onClick={() => boardEngine.removeOutput(o.config.id)} className="p-1.5 rounded hover:bg-white/10"><Trash2 size={13} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

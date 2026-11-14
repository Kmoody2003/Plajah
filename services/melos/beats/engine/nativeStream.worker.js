// Between the native engine's socket and the ring worklets, so no audio crosses the main thread.
// Chunks: u32 track, u32 flags, f64 frame, then 1024 left + 1024 right f32 unless silent.
const CHUNK = 1024;
const HEADER = 16;
const FLAG_SILENT = 1;

let socket = null;
const rings = new Map();
const pending = [];

function send(buffer) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(buffer);
  else pending.push(buffer);
}

self.onmessage = (e) => {
  const d = e.data;
  if (d.type === 'open') {
    socket = new WebSocket(d.url);
    socket.binaryType = 'arraybuffer';
    socket.onopen = () => {
      for (const b of pending.splice(0)) socket.send(b);
      self.postMessage({ type: 'open' });
    };
    socket.onclose = () => self.postMessage({ type: 'closed' });
    socket.onmessage = (m) => {
      const v = new DataView(m.data);
      const ring = rings.get(v.getUint32(0, true));
      if (!ring) return;
      const flags = v.getUint32(4, true);
      const frame = v.getFloat64(8, true);
      if (flags & FLAG_SILENT) ring.postMessage({ frame, epoch: flags >>> 1, silent: true });
      else ring.postMessage({ frame, epoch: flags >>> 1, samples: new Float32Array(m.data, HEADER, CHUNK * 2) }, [m.data]);
    };
  } else if (d.type === 'clock') {
    d.port.onmessage = (m) => send(new Float64Array([0, 0, m.data, 0, 0, 0, 0]).buffer);
  } else if (d.type === 'ring') {
    rings.set(d.track, d.port);
  } else if (d.type === 'dropRing') {
    rings.delete(d.track);
  } else if (d.type === 'rows') {
    send(d.rows);
  }
};

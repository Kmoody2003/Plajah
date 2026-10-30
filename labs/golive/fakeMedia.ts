// Lab-only synthetic camera + mic for frames with no real devices (the browser pane has none).
// getUserMedia returns a moving test card (canvas) and a speech-like tone with a periodic burst
// that hits full scale, so meters move and the clip light can be checked. ?fake=1 forces it.
export function installFakeMedia() {
  const md = navigator.mediaDevices;
  const realGum = md.getUserMedia?.bind(md);
  let ac: AudioContext | null = null;
  const fakeAudio = () => {
    ac ??= new AudioContext();
    const osc = ac.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 180;
    const syll = ac.createOscillator(); syll.frequency.value = 3.2;          // ~3 syllables/s envelope
    const syllGain = ac.createGain(); syllGain.gain.value = 0.18;
    const amp = ac.createGain(); amp.gain.value = 0.2;
    syll.connect(syllGain).connect(amp.gain);
    const burst = ac.createGain(); burst.gain.value = 0;                     // every 4 s: 150 ms at 3× = clips
    const t0 = ac.currentTime;
    for (let i = 0; i < 400; i++) { burst.gain.setValueAtTime(0, t0 + i * 4); burst.gain.setValueAtTime(3, t0 + i * 4 + 2); burst.gain.setValueAtTime(0, t0 + i * 4 + 2.15); }
    const dest = ac.createMediaStreamDestination();
    osc.connect(amp).connect(dest); osc.connect(burst).connect(dest);
    osc.start(); syll.start();
    return dest.stream.getAudioTracks()[0];
  };
  const fakeVideo = () => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 480;
    const g = c.getContext('2d')!;
    const bars = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
    let f = 0;
    const draw = () => {
      f++;
      bars.forEach((col, i) => { g.fillStyle = col; g.fillRect(i * (640 / 7), 0, 640 / 7 + 1, 300); });
      const grd = g.createLinearGradient(0, 0, 640, 0); grd.addColorStop(0, '#000'); grd.addColorStop(1, '#fff');
      g.fillStyle = grd; g.fillRect(0, 300, 640, 80);
      g.fillStyle = '#e8b796'; g.beginPath(); g.ellipse(320 + Math.sin(f / 20) * 120, 220, 70, 90, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#111'; g.fillRect(0, 380, 640, 100);
      g.fillStyle = '#fff'; g.font = 'bold 28px monospace'; g.fillText(`LAB CAM  ${new Date().toLocaleTimeString()}  f${f}`, 20, 440);
    };
    draw(); setInterval(draw, 33);
    return (c as any).captureStream(30).getVideoTracks()[0] as MediaStreamTrack;
  };
  md.getUserMedia = async (c?: MediaStreamConstraints) => {
    if (realGum && !(window as any).__forceFake) {
      try { return await realGum(c); } catch { /* fall through to synthetic */ }
    }
    const s = new MediaStream();
    if (c?.audio) s.addTrack(fakeAudio());
    if (c?.video) s.addTrack(fakeVideo());
    return s;
  };
  const realEnum = md.enumerateDevices?.bind(md);
  md.enumerateDevices = async () => {
    const real = realEnum ? await realEnum().catch(() => []) : [];
    if (real.some(d => d.kind === 'audioinput' && d.label) && !(window as any).__forceFake) return real;
    const mk = (kind: MediaDeviceKind, id: string, label: string) => ({ kind, deviceId: id, groupId: 'lab', label, toJSON() { return this; } }) as MediaDeviceInfo;
    return [mk('audioinput', 'lab-mic', 'Lab tone mic'), mk('videoinput', 'lab-cam', 'Lab test card')];
  };
}

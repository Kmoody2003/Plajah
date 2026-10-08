// Standalone test bench for the live lenses — no login, no app shell.
// Runs the REAL streamer pipeline (LiveComposer: camera → lens → look → captured canvas) on your
// webcam, so what you see here is what a stream would publish. Delete this + lens-lab.html any time.
import { LiveComposer, LOOKS, type LookId } from './services/liveComposer';
import { LENSES, type LensId } from './services/lenses/lensEngine';
import { tapToFrame } from './services/lenses/auraOrbs';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const out = $('out') as HTMLVideoElement, diag = $('diag'), err = $('err');

// ?fake → a still portrait standing in for the camera (for machines/panes with no webcam).
async function fakeCamera(): Promise<MediaStream> {
  const img = new Image(); img.crossOrigin = 'anonymous';
  img.src = 'https://storage.googleapis.com/mediapipe-assets/portrait.jpg';
  await img.decode();
  const c = document.createElement('canvas'); c.width = 540; c.height = 720;
  const x = c.getContext('2d')!;
  const k = Math.max(c.width / img.naturalWidth, c.height / img.naturalHeight);
  let t = 0;
  setInterval(() => { t += 1; x.drawImage(img, (c.width - img.naturalWidth * k) / 2 + Math.sin(t / 8) * 6, (c.height - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k); }, 33);
  return c.captureStream(30);
}

async function main() {
  const cam = location.search.includes('fake') ? await fakeCamera() : await navigator.mediaDevices.getUserMedia({
    audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: 'user' },
  });
  (window as any).__comp = null;
  const comp = new LiveComposer();
  (window as any).__comp = comp;
  await comp.adoptFrontTrack(cam.getVideoTracks()[0]);
  await comp.setMode('front');
  out.srcObject = comp.getStream();
  await out.play().catch(() => {});

  let lens: LensId = 'none', look: LookId = 'none';
  const mk = (host: HTMLElement, items: { id: string; label: string; icon?: string }[], pick: (id: string) => void, active: () => string) => {
    const btns = items.map(it => {
      const b = document.createElement('button');
      b.textContent = `${it.icon ? it.icon + ' ' : ''}${it.label}`;
      b.onclick = async () => { try { await pick(it.id); } catch (e: any) { err.textContent = e?.message || String(e); } paint(); };
      host.append(b); return { b, id: it.id };
    });
    const paint = () => btns.forEach(x => x.b.classList.toggle('on', x.id === active()));
    paint(); return paint;
  };
  mk($('lenses'), LENSES, async id => { lens = id as LensId; await comp.setLens(lens); }, () => lens);
  mk($('looks'), LOOKS.slice(0, 7), id => { look = id as LookId; comp.setLook(look); }, () => look);

  const mirror = $('mirror');
  mirror.onclick = () => { const on = out.style.transform !== 'scaleX(-1)'; out.style.transform = on ? 'scaleX(-1)' : ''; mirror.classList.toggle('on', on); };
  out.style.transform = 'scaleX(-1)';

  // Aura lens: click/tap the video to collect orbs (the same call a viewer's tap event makes on the host)
  out.addEventListener('pointerup', e => {
    const pt = tapToFrame(e, out, out.style.transform === 'scaleX(-1)');
    if (pt) comp.tapLens(pt.x, pt.y, 'You');
  });

  setInterval(() => {
    const d = comp.getDiagnostics(), a = comp.getAuraInfo();
    const aura = lens === 'aura' && a ? ` · ${a.icon} ${a.label} · orbs:${a.orbsOnScreen}${a.leaderboard.length ? ' · ' + a.leaderboard.map(l => `${l.who} ${l.pts}`).join(', ') : ''}` : '';
    diag.textContent = `${d.size} · grade:${d.grade} · lens:${d.lens}${aura}`;
  }, 500);
}
main().catch(e => {
  err.textContent = e?.name === 'NotAllowedError'
    ? 'Camera permission was blocked — click the camera icon in the address bar and allow it, then reload.'
    : `Could not start: ${e?.message || e}`;
  diag.textContent = '';
});

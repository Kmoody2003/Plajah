import {
  type Interactive3DTicketConfig,
  generateTicketSecurityProof,
} from './interactive3dTicketService';

export interface StandalonePassExportOptions {
  includeAudio?: boolean;
  offlineBundle?: boolean;
  originBaseUrl?: string;
}

/**
 * Generates a shareable Web URL for an interactive 3D ticket or evite.
 */
export function generateInteractivePassShareUrl(
  config: Interactive3DTicketConfig,
  baseUrl = 'https://plajah.app'
): string {
  const proof = generateTicketSecurityProof(config);
  const params = new URLSearchParams({
    e: config.eventId,
    p: config.projectId,
    t: config.ticketNumber,
    h: config.holderName,
    tier: config.tierName,
    theme: config.themeId,
    mode: config.mode,
    hash: proof.hash,
    nonce: proof.nonce,
  });

  return `${baseUrl.replace(/\/$/, '')}/pass#${params.toString()}`;
}

/**
 * Generates an offline, self-contained HTML document for the interactive 3D ticket.
 * The output file can be saved, emailed, or opened locally in any modern browser.
 */
export function buildStandalone3DPassHtml(
  config: Interactive3DTicketConfig,
  options: StandalonePassExportOptions = {}
): string {
  const proof = generateTicketSecurityProof(config);
  const jsonPayload = JSON.stringify(config).replace(/</g, '\\u003c');
  const proofJson = JSON.stringify(proof).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
<title>${escapeHtml(config.eventTitle)} · 3D Pass</title>
<style>
  :root { --void: #05060a; --accent: ${config.palette[1] || '#00ffaa'}; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--void); color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; overflow: hidden; width: 100vw; height: 100vh; touch-action: none; }
  #canvas3d { width: 100%; height: 100%; display: block; }
  .hud { position: absolute; top: 16px; left: 16px; right: 16px; display: flex; justify-content: space-between; pointer-events: none; z-index: 10; }
  .badge { background: rgba(14,20,30,0.85); border: 1px solid rgba(255,255,255,0.15); padding: 8px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; backdrop-filter: blur(10px); }
  .actions { position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); display: flex; gap: 10px; z-index: 10; }
  .btn { background: var(--accent); color: #000; border: none; padding: 12px 22px; border-radius: 30px; font-size: 13px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
  .btn-sub { background: rgba(20,25,35,0.85); color: #fff; border: 1px solid rgba(255,255,255,0.2); backdrop-filter: blur(10px); }
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
</head>
<body>
<div class="hud">
  <div class="badge">PLAJAH · VERIFIED 3D PASS</div>
  <div class="badge" id="status-tag">${escapeHtml(config.status)}</div>
</div>
<canvas id="canvas3d"></canvas>
<div class="actions">
  <button class="btn btn-sub" id="btn-gyro">📱 Enable Tilt Gyro</button>
  <button class="btn" id="btn-flip">⇄ Flip Pass</button>
</div>
<script>
(function() {
  const config = ${jsonPayload};
  const proof = ${proofJson};
  let isFlipped = false;
  let targetRotY = 0, targetRotX = 0, curRotY = 0, curRotX = 0;
  let isDragging = false, lastX = 0, lastY = 0;

  const canvas = document.getElementById('canvas3d');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060a);
  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 50);
  camera.position.set(0, 0.2, 5.0);

  const amb = new THREE.AmbientLight(0xffffff, 1.2);
  scene.add(amb);
  const spot = new THREE.PointLight(0xffffff, 2.5, 10);
  spot.position.set(0, 0, 3.5);
  scene.add(spot);

  // Dynamic front/back textures
  const fCv = document.createElement('canvas'); fCv.width = 1024; fCv.height = 512;
  const fCtx = fCv.getContext('2d');
  fCtx.fillStyle = config.palette[0] || '#050a12';
  fCtx.fillRect(0,0,1024,512);
  fCtx.strokeStyle = config.palette[1] || '#00ffaa';
  fCtx.lineWidth = 10; fCtx.strokeRect(20,20,984,472);
  fCtx.fillStyle = config.palette[1] || '#00ffaa';
  fCtx.font = 'bold 24px monospace'; fCtx.fillText('PLAJAH CHORA // VERIFIED PASS', 60, 75);
  fCtx.fillStyle = '#ffffff'; fCtx.font = 'bold 44px sans-serif'; fCtx.fillText(config.eventTitle, 60, 150);
  fCtx.fillStyle = config.palette[2] || '#ff2255'; fCtx.font = 'bold 22px sans-serif'; fCtx.fillText(config.artistName + ' · ' + config.venueName, 60, 200);
  fCtx.fillStyle = '#94a3b8'; fCtx.font = '16px monospace'; fCtx.fillText('ATTENDEE: ' + config.holderName, 60, 300);
  fCtx.fillText('TIER: ' + config.tierName, 60, 335);
  fCtx.fillText('DATE: ' + config.dateTime, 60, 370);
  fCtx.fillStyle = config.palette[1] || '#00ffaa';
  fCtx.font = '900 68px sans-serif'; fCtx.fillText('01', 820, 160);
  fCtx.font = 'bold 16px monospace'; fCtx.fillText('ADMIT', 820, 90);
  const fTex = new THREE.CanvasTexture(fCv);

  const bCv = document.createElement('canvas'); bCv.width = 1024; bCv.height = 512;
  const bCtx = bCv.getContext('2d');
  bCtx.fillStyle = '#08080c'; bCtx.fillRect(0,0,1024,512);
  bCtx.strokeStyle = config.palette[2] || '#ff2255'; bCtx.lineWidth = 8; bCtx.strokeRect(20,20,984,472);
  bCtx.fillStyle = config.palette[2] || '#ff2255'; bCtx.font = 'bold 22px monospace'; bCtx.fillText('SECURITY LEDGER // VERIFICATION PROOF', 60, 75);
  bCtx.fillStyle = '#94a3b8'; bCtx.font = '14px monospace';
  bCtx.fillText('PROJECT: ' + config.projectTitle, 60, 115);
  bCtx.fillText('HASH: SHA256:' + proof.hash + proof.nonce, 60, 140);
  bCtx.fillStyle = '#ffffff'; bCtx.fillRect(740, 70, 200, 200);
  bCtx.fillStyle = '#000000'; bCtx.fillRect(755, 85, 50, 50); bCtx.fillRect(875, 85, 50, 50); bCtx.fillRect(755, 205, 50, 50);
  bCtx.fillStyle = '#000000'; bCtx.font = 'bold 14px monospace'; bCtx.fillText('SCAN ENTRY', 790, 295);
  const bTex = new THREE.CanvasTexture(bCv);

  const aspect = config.mode === 'evite' ? (600 / 800) : (900 / 420);
  const w = 3.6, h = w / aspect, d = 0.06;
  const geo = new THREE.BoxGeometry(w, h, d);
  const edgeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(config.palette[1]), metalness: 0.9, roughness: 0.1 });
  const frontMat = new THREE.MeshStandardMaterial({ map: fTex, metalness: 0.4, roughness: 0.2 });
  const backMat = new THREE.MeshStandardMaterial({ map: bTex, metalness: 0.7, roughness: 0.25 });
  const mesh = new THREE.Mesh(geo, [edgeMat, edgeMat, edgeMat, edgeMat, frontMat, backMat]);
  scene.add(mesh);

  function flip() { isFlipped = !isFlipped; targetRotY = isFlipped ? Math.PI : 0; }
  document.getElementById('btn-flip').onclick = flip;

  window.onpointerdown = e => { isDragging = true; lastX = e.clientX; lastY = e.clientY; };
  window.onpointermove = e => {
    const ndcX = (e.clientX / window.innerWidth) * 2 - 1;
    const ndcY = -(e.clientY / window.innerHeight) * 2 + 1;
    spot.position.x = ndcX * 3; spot.position.y = ndcY * 2;
    if (isDragging) {
      targetRotY += (e.clientX - lastX) * 0.008;
      targetRotX += (e.clientY - lastY) * 0.008;
      lastX = e.clientX; lastY = e.clientY;
    } else if (!isFlipped) {
      targetRotX = -ndcY * 0.25; targetRotY = ndcX * 0.35;
    }
  };
  window.onpointerup = () => { isDragging = false; };

  // Gyroscope setup
  const gyroBtn = document.getElementById('btn-gyro');
  gyroBtn.onclick = () => {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(state => {
        if (state === 'granted') bindGyro();
      });
    } else {
      bindGyro();
    }
  };

  function bindGyro() {
    gyroBtn.style.display = 'none';
    window.addEventListener('deviceorientation', e => {
      if (e.gamma !== null && e.beta !== null && !isDragging) {
        const tiltX = (e.gamma / 45); // Left/Right
        const tiltY = ((e.beta - 45) / 45); // Front/Back
        targetRotY = (isFlipped ? Math.PI : 0) + tiltX * 0.6;
        targetRotX = tiltY * 0.4;
      }
    });
  }

  function loop() {
    requestAnimationFrame(loop);
    curRotX += (targetRotX - curRotX) * 0.08;
    curRotY += (targetRotY - curRotY) * 0.08;
    mesh.rotation.x = curRotX; mesh.rotation.y = curRotY;
    mesh.position.y = Math.sin(Date.now() * 0.002) * 0.06;
    renderer.render(scene, camera);
  }
  loop();
  window.onresize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
})();
</script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Rift Realm entry point: WebGPU renderer, Soul Vessels, Touch/Gamepad, Rhythm & Plajah Bridge.
import * as THREE from 'three/webgpu';
import { CollisionWorld } from './collision';
import { RhythmEngine, type BeatQuality } from './rhythm';
import type { Tier } from './shrine';
import { moduleByParam } from './studio/levelModules';
import { Objectives } from './objectives';
import { applyStudioProject } from './studio/projectHook';
import { createRules } from './studio/rulesHost';
import { createPost } from './post';
import { preloadCharacters } from './characters';
import { initKTX2, preloadSets } from './textures';
import { PlayerController } from './player';
import { EnemyManager, enemyNav } from './enemies';
import { VESSEL_ORDER, VESSELS, type VesselId } from './vessels';
import { UnifiedControls } from './controls';
import { PlajahGamesBridge } from './plajahBridge';

interface Beam {
  line: THREE.Mesh;
  life: number;
}

interface SurgeWave {
  mesh: THREE.Mesh;
  life: number;
}

async function boot() {
  const view = document.getElementById('view')!;
  const overlay = document.getElementById('overlay')!;
  const startBtn = document.getElementById('startBtn')!;
  const beatRing = document.getElementById('beatRing')!;
  const beatPop = document.getElementById('beatPop')!;
  const hpText = document.getElementById('hpText')!;
  const hpBar = document.getElementById('hpBar')!;
  const resText = document.getElementById('resText')!;
  const resBar = document.getElementById('resBar')!;
  const scoreText = document.getElementById('scoreText')!;
  const waveText = document.getElementById('waveText')!;
  const camText = document.getElementById('camText')!;
  const vesselTag = document.getElementById('vesselTag')!;
  const surgeTag = document.getElementById('surgeTag')!;
  const touchHud = document.getElementById('touchHud')!;
  const achToast = document.getElementById('achToast')!;

  let renderer: THREE.WebGPURenderer;
  try {
    renderer = new THREE.WebGPURenderer({ antialias: true, powerPreference: 'high-performance' });
    await renderer.init();
  } catch (err) {
    console.warn('[rift-realm] WebGPU init failed, falling back to WebGL backend:', err);
    renderer = new THREE.WebGPURenderer({ antialias: true, powerPreference: 'high-performance', forceWebGL: true });
    await renderer.init();
  }
  // quality tier: Intel iGPUs (the baseline) get the light path; discrete GPUs get shadows, bloom and full foliage
  const adapter = (renderer.backend as any)?.device?.adapterInfo ?? {};
  const forced = new URLSearchParams(location.search).get('q');
  const tier: Tier = forced === 'low' || forced === 'high' ? forced : adapter.vendor === 'intel' ? 'low' : 'high';
  console.info('[rift-realm] tier', tier, adapter.vendor, adapter.architecture);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = tier === 'high';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const pixelRatio = tier === 'low' ? 0.7 : Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  view.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 260);
  scene.add(camera);

  const levelId = new URLSearchParams(location.search).get('level') ?? 'elderwood';
  initKTX2(renderer);
  // one table of levels (studio/levelModules.ts), shared with the Game Studio
  const levelModule = moduleByParam(levelId);
  await preloadSets(levelModule.sets);
  const arena = levelModule.build(scene, tier);
  await arena.prepare?.(renderer, camera);
  camera.far = levelModule.look.far; camera.updateProjectionMatrix(); renderer.toneMappingExposure = levelModule.look.exposure;
  // Game Studio Play view: the project's edits to this level (spawns, enemy spots, control points, props, look) apply before anyone spawns.
  const studioLook = await applyStudioProject(levelId, arena);
  if (studioLook) { camera.far = studioLook.far; camera.updateProjectionMatrix(); renderer.toneMappingExposure = studioLook.exposure; }
  document.querySelectorAll<HTMLButtonElement>('#levelPick .lvl').forEach((b) => {
    b.classList.toggle('on', b.dataset.level === levelId);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (b.dataset.level === levelId) return;
      const q = new URLSearchParams(location.search); q.set('level', b.dataset.level!);
      location.search = q.toString();
    });
  });
  const collision = new CollisionWorld(arena.group);
  collision.rebuild();
  const post = tier === 'high' ? createPost(renderer, scene, camera) : null;

  let currentBiomeName = arena.info.name;
  let lastWave = 1;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyB' && player.enabled) {
      const b = arena.setBiome(arena.biomeIndex + 1);
      currentBiomeName = b.name;
      rhythm.setTrack(b.track);
      showBeatFeedback(`REALM · ${b.name.toUpperCase()}`, '#fbbf24');
    }
  });

  const rhythm = new RhythmEngine();
  const controls = new UnifiedControls(renderer.domElement);
  const usedVessels = new Set<VesselId>(['aegis']);
  let toastTimer: number | undefined;
  const plajah = new PlajahGamesBridge((title) => {
    achToast.textContent = `ACHIEVEMENT UNLOCKED · ${title}`;
    achToast.classList.add('on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => achToast.classList.remove('on'), 2800);
  });

  await preloadCharacters();
  const player = new PlayerController(camera, renderer.domElement);
  player.world = collision;
  player.spawnAt(arena.spawns.a.pos, arena.spawns.a.yaw);
  scene.add(player.object);

  // a Studio level with rules decides who arrives and how the level ends (studio/rulesHost.ts); else the endless trials run
  const ruled = !!studioLook?.level.rules.some(r => r.enabled);
  const enemies = new EnemyManager(scene, collision, arena.enemySpots, !ruled);
  const objectives = new Objectives(scene, arena.controlPoints ?? [], (x, z, y) => collision.groundAt(x, z, y, 10));
  enemyNav.goal = (arena.controlPoints?.length && !ruled) ? (p) => objectives.targetFor(p) : null;

  // Domination match (levels with control points, no Studio rules): first side to MATCH_SCORE points (each owned point
  // scores every 2 s), or the leader when the clock runs out. Downed players respawn at their spawn.
  const MATCH_SCORE = 100, MATCH_SECONDS = 8 * 60;
  const match = { on: !!arena.controlPoints?.length && !ruled, over: false, time: 0, downs: 0, kills: 0 };
  if (match.on) enemies.onKilled = () => { match.kills++; };
  const endMatch = (won: boolean) => {
    match.over = true;
    player.enabled = false;
    if (document.pointerLockElement) document.exitPointerLock();
    const m = Math.floor(match.time / 60), sec = Math.floor(match.time % 60).toString().padStart(2, '0');
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:radial-gradient(#06101cdd,#02060cf2);font-family:Segoe UI,sans-serif;color:#e6f1ff';
    box.innerHTML = `<div style="text-align:center"><div style="letter-spacing:.4em;font-size:13px;color:#8fb3d9">${arena.info.name.toUpperCase()} · DOMINATION</div>
      <div style="font-size:64px;font-weight:800;letter-spacing:.08em;margin:10px 0;color:${won ? '#38bdf8' : '#fb923c'};text-shadow:0 0 24px ${won ? '#38bdf8' : '#fb923c'}">${won ? 'VICTORY' : 'DEFEAT'}</div>
      <div style="font-size:18px;margin-bottom:6px">${objectives.score.blue} — ${objectives.score.orange}</div>
      <div style="font-size:13px;color:#9fb6cc;margin-bottom:22px">${m}:${sec} · ${match.kills} kills · downed ${match.downs}×</div>
      <button id="rrAgain" style="padding:12px 28px;font:700 14px Segoe UI,sans-serif;letter-spacing:.14em;color:#04111c;background:linear-gradient(90deg,#38bdf8,#fbbf24);border:0;cursor:pointer">PLAY AGAIN</button></div>`;
    document.body.appendChild(box);
    box.querySelector<HTMLButtonElement>('#rrAgain')!.onclick = () => location.reload();
  };
  objectives.onCapture = (def, owner) => showBeatFeedback(`${def.id} · ${def.name.toUpperCase()} ${owner === 'blue' ? 'CAPTURED' : 'LOST'}`, owner === 'blue' ? '#38bdf8' : '#fb923c');
  let hazardCooldown = 0;
  const rules = ruled && studioLook ? createRules({
    scene, enemies, player, level: studioLook.level, names: studioLook.names, fallbackSpots: arena.enemySpots,
    groundAt: (x, z, y) => collision.groundAt(x, z, y, 10),
    respawn: () => { player.hp = player.maxHp; player.spawnAt(arena.spawns.a.pos, arena.spawns.a.yaw); },
  }) : null;

  let resonance = 1.0;
  let score = 0;
  let popTimeout: number | undefined;
  const beams: Beam[] = [];
  const surges: SurgeWave[] = [];
  const raycaster = new THREE.Raycaster();

  if (controls.isTouchDevice) {
    touchHud.classList.add('on');
  }

  function showBeatFeedback(label: string, color: string) {
    beatPop.textContent = label;
    beatPop.style.color = color;
    beatPop.style.opacity = '1';
    window.clearTimeout(popTimeout);
    popTimeout = window.setTimeout(() => { beatPop.style.opacity = '0'; }, 380);
  }

  function showQuality(quality: BeatQuality) {
    const label = quality === 'PERFECT' ? 'PERFECT RESONANCE' : quality === 'GOOD' ? 'ON BEAT' : 'OFF BEAT';
    const color = quality === 'PERFECT' ? '#fbbf24' : quality === 'GOOD' ? '#38bdf8' : '#94a3b8';
    showBeatFeedback(label, color);
  }

  // Every shot has to read at a glance (Kenne: "the mouse buttons don't do anything" — the old 2–4 cm grey beam lasted
  // 0.13 s): a bright core in a soft additive glow, an impact flash where it lands, a hit marker on the reticle.
  function spawnBeam(from: THREE.Vector3, to: THREE.Vector3, quality: BeatQuality, primaryHex: number, hit = false) {
    const dist = from.distanceTo(to);
    const col = quality === 'PERFECT' ? 0xfbbf24 : primaryHex;
    const core = quality === 'PERFECT' ? 0.06 : quality === 'GOOD' ? 0.045 : 0.035;
    const g = new THREE.Group();
    for (const [r, op] of [[core, 1.0], [core * 3.2, quality === 'OFF' ? 0.22 : 0.35]] as const) {
      const geo = new THREE.CylinderGeometry(r, r, dist, 8);
      geo.rotateX(Math.PI / 2);
      const mat = new THREE.MeshBasicNodeMaterial({ color: r === core ? 0xffffff : col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });
      if (r === core) mat.color.lerp(new THREE.Color(col), 0.35);
      g.add(new THREE.Mesh(geo, mat));
    }
    g.position.copy(from).lerp(to, 0.5);
    g.lookAt(to);
    scene.add(g);
    beams.push({ line: g as unknown as THREE.Mesh, life: 0.2 });
    // impact flash
    const flash = new THREE.Mesh(new THREE.SphereGeometry(hit ? 0.55 : 0.35, 12, 8), new THREE.MeshBasicNodeMaterial({ color: col, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    flash.position.copy(to);
    scene.add(flash);
    beams.push({ line: flash, life: 0.16 });
    if (hit) {
      const ret = document.getElementById('reticle');
      if (ret) { ret.animate([{ transform: 'translate(-50%,-50%) scale(1.5) rotate(45deg)', filter: 'drop-shadow(0 0 6px #fb7185)' }, { transform: 'translate(-50%,-50%) scale(1)', filter: 'none' }], { duration: 180 }); }
    }
  }

  function fireSingleRay(quality: BeatQuality, spreadRad: number, baseDmg: number, primaryHex: number) {
    const { origin, dir } = player.getAimRay();
    if (spreadRad > 0) {
      dir.x += (Math.random() - 0.5) * spreadRad * 2;
      dir.y += (Math.random() - 0.5) * spreadRad * 2;
      dir.z += (Math.random() - 0.5) * spreadRad * 2;
      dir.normalize();
    }

    const worldDist = collision.rayDistance(origin, dir, 120);
    raycaster.set(origin, dir);
    raycaster.far = worldDist;
    const hits = raycaster.intersectObjects(enemies.getHitMeshes(), false);

    const muzzle = player.getMuzzleWorldPos();
    let endPt = origin.clone().addScaledVector(dir, worldDist);

    if (hits.length > 0) {
      endPt = hits[0].point;
      const enemyId = hits[0].object.userData.enemyId as number;
      const dmg = Math.round(baseDmg * (1 + (resonance - 1) * 0.25));
      const res = enemies.damageEnemy(enemyId, dmg);
      if (res) {
        rhythm.playHit(res.killed);
        if (res.killed) {
          const pts = Math.round(100 * resonance);
          score += pts;
          plajah.creditXp(Math.round(15 * resonance), enemies.wave);
          plajah.unlock('rift_realm_first_blood');
          if (enemies.wave >= 3) plajah.unlock('rift_realm_trial_3');
        }
      }
    }

    spawnBeam(muzzle, endPt, quality, primaryHex, hits.length > 0);
  }

  function fireShot() {
    if (!player.enabled) return;
    const beat = rhythm.evaluateBeat();
    const spec = player.vessel;
    showQuality(beat.quality);

    if (beat.quality === 'PERFECT') resonance = Math.min(4.0, resonance + 0.35);
    else if (beat.quality === 'GOOD') resonance = Math.min(4.0, resonance + 0.15);
    else resonance = Math.max(1.0, resonance - 0.25);

    if (resonance >= 4.0) plajah.unlock('rift_realm_perfect_resonance');

    const baseDmg =
      beat.quality === 'PERFECT' ? spec.dmgPerfect : beat.quality === 'GOOD' ? spec.dmgGood : spec.dmgOff;

    const triggerBurst = () => {
      rhythm.playShot(beat.quality);
      player.triggerMuzzleFlash();
      for (let p = 0; p < spec.pellets; p++) {
        fireSingleRay(beat.quality, spec.spreadRad, baseDmg, spec.primaryColor);
      }
    };

    triggerBurst();
    for (let b = 1; b < spec.burstCount; b++) {
      window.setTimeout(triggerBurst, b * spec.burstDelayMs);
    }
  }

  function triggerSoulSurge() {
    if (resonance < 2.0) {
      showBeatFeedback('NEED 2.0x RESONANCE', '#f43f5e');
      return;
    }
    resonance = Math.max(1.0, resonance - 1.0);
    rhythm.playSurge();
    plajah.unlock('rift_realm_soul_surge');
    showBeatFeedback('SOUL SURGE!', '#f59e0b');

    const center = player.object.position.clone();
    const ringGeo = new THREE.TorusGeometry(1.0, 0.12, 8, 36);
    ringGeo.rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshBasicNodeMaterial({
      color: player.vessel.accentColor,
      transparent: true,
      opacity: 0.9,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(center.x, center.y + 0.6, center.z);
    scene.add(ring);
    surges.push({ mesh: ring, life: 0.35 });

    // Damage & knock back all enemies within 8.5 m
    const targets = [...enemies.enemies];
    for (const e of targets) {
      const toEnemy = new THREE.Vector3().subVectors(e.mesh.position, center);
      toEnemy.y = 0;
      const d = toEnemy.length();
      if (d <= 8.5) {
        if (d > 0.01) toEnemy.divideScalar(d);
        const res = enemies.damageEnemy(e.id, 45, toEnemy, 3.6);
        if (res?.killed) score += Math.round(125 * resonance);
      }
    }
  }

  function updateVesselUI(activeId: VesselId) {
    const spec = VESSELS[activeId];
    vesselTag.textContent = `${spec.name} · ${spec.weaponName}`;
    for (const id of VESSEL_ORDER) {
      const el = document.getElementById(`v-${id}`);
      el?.classList.toggle('active', id === activeId);
    }
  }

  for (const id of VESSEL_ORDER) {
    const el = document.getElementById(`v-${id}`);
    el?.addEventListener('click', () => {
      if (player.enabled) player.setVessel(id);
    });
    el?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (player.enabled) player.setVessel(id);
    }, { passive: false });
  }

  player.onSwitchVessel = (spec) => {
    usedVessels.add(spec.id);
    if (usedVessels.size === VESSEL_ORDER.length) {
      plajah.unlock('rift_realm_vessel_master');
    }
    updateVesselUI(spec.id);
  };
  updateVesselUI(player.vessel.id);

  player.onToggleView = (fp) => {
    camText.textContent = fp ? '1ST PERSON [V]' : '3RD PERSON [V]';
  };

  player.onDash = () => {
    const evalRes = rhythm.evaluateBeat();
    const onBeat = evalRes.quality !== 'OFF';
    rhythm.playDash(onBeat);
    if (onBeat) {
      resonance = Math.min(4.0, resonance + 0.25);
      showQuality(evalRes.quality);
    }
  };

  player.onSoulSurge = triggerSoulSurge;

  function triggerMeleeStrike() {
    if (!player.enabled) return;
    const beat = rhythm.evaluateBeat();
    const pPos = player.object.position;
    const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));

    let hitAny = false;
    for (const e of [...enemies.enemies]) {
      const toE = new THREE.Vector3().subVectors(e.mesh.position, pPos);
      toE.y = 0;
      const dist = toE.length();
      if (dist > 3.6) continue;
      if (dist > 0.01) toE.divideScalar(dist);
      if (forward.dot(toE) < 0.25 && dist > 1.3) continue;

      hitAny = true;
      if (e.staggered) {
        // DOOM-meets-Mortal Kombat Soul-Rend Finisher!
        const res = enemies.damageEnemy(e.id, e.hp + 999);
        rhythm.playSurge();
        player.hp = Math.min(player.maxHp, player.hp + 25);
        resonance = Math.min(4.0, resonance + 0.6);
        score += Math.round(180 * resonance);
        plajah.creditXp(Math.round(30 * resonance), enemies.wave);
        plajah.unlock('rift_realm_soul_rend');
        plajah.unlock('rift_realm_first_blood');
        if (res?.killed && enemies.wave >= 3) plajah.unlock('rift_realm_trial_3');
        showBeatFeedback('SOUL-REND FINISHER! +25 HP', '#fbbf24');
        break;
      } else {
        const dmg = beat.quality === 'PERFECT' ? 36 : beat.quality === 'GOOD' ? 26 : 16;
        const res = enemies.damageEnemy(e.id, dmg, toE, 3.2);
        rhythm.playHit(Boolean(res?.killed));
        if (res?.killed) {
          score += Math.round(120 * resonance);
          plajah.creditXp(Math.round(20 * resonance), enemies.wave);
          plajah.unlock('rift_realm_first_blood');
        }
        showBeatFeedback(beat.quality === 'OFF' ? 'MELEE STRIKE' : 'ON-BEAT STRIKE!', '#38bdf8');
      }
    }

    if (!hitAny) {
      rhythm.playDash(false);
    }
  }

  player.onStrike = triggerMeleeStrike;

  renderer.domElement.addEventListener('mousedown', (e) => {
    if (!player.enabled) return;
    if (e.button === 0) fireShot();
    if (e.button === 2) triggerSoulSurge();
  });
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  const enterRift = (fromTouch = false) => {
    rhythm.start();
    if (fromTouch || controls.isTouchDevice || window.matchMedia('(pointer: coarse)').matches) {
      controls.isTouchDevice = true;
      player.enabled = true;
      overlay.classList.add('hidden');
      touchHud.classList.add('on');
    } else {
      // A refused pointer lock (embedded views, some browsers) must never block play: drag-look takes over.
      const enterUnlocked = () => { player.enabled = true; overlay.classList.add('hidden'); };
      try {
        const p = renderer.domElement.requestPointerLock?.() as Promise<void> | undefined;
        if (p && typeof p.catch === 'function') p.catch(enterUnlocked); else if (!p) enterUnlocked();
      } catch { enterUnlocked(); }
    }
  };

  startBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    enterRift(true);
  }, { passive: false });
  startBtn.addEventListener('click', () => enterRift(false));

  document.addEventListener('pointerlockchange', () => {
    if (controls.isTouchDevice) return;
    const locked = document.pointerLockElement === renderer.domElement;
    if (locked) { player.enabled = true; overlay.classList.add('hidden'); return; }
    // lock released (Esc): pause on the menu
    player.enabled = false;
    overlay.classList.remove('hidden');
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  let last = performance.now();
  let trapDamageCooldown = 0;
  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    trapDamageCooldown = Math.max(0, trapDamageCooldown - dt);

    const input = controls.poll(dt);
    if (input.isTouchActive) touchHud.classList.add('on');

    rhythm.update();
    arena.update(dt, rhythm.pulse, rhythm.beatIndex);
    player.update(dt, rhythm.pulse, input);
    arena.resolveDynamicGates(player.object.position, 0.38);

    if (player.enabled) {
      // lava / abyss hazard
      hazardCooldown = Math.max(0, hazardCooldown - dt);
      if (arena.hazardBelow !== undefined && player.object.position.y < arena.hazardBelow && hazardCooldown <= 0) {
        hazardCooldown = 0.4;
        player.hp = Math.max(0, player.hp - 20);
        showBeatFeedback('BURNING! -20 HP', '#f97316');
        if (player.hp === 0) { player.hp = player.maxHp; resonance = 1.0; score = Math.max(0, score - 150); player.spawnAt(arena.spawns.a.pos, arena.spawns.a.yaw); rules?.playerDowned(); }
      }
      objectives.update(dt, player.object.position, enemies.enemies.map((e) => e.mesh.position));
      if (match.on && !match.over) {
        match.time += dt;
        const { blue, orange } = objectives.score;
        if (blue >= MATCH_SCORE || orange >= MATCH_SCORE || match.time >= MATCH_SECONDS) endMatch(blue > orange);
      }
      if (input.firePressed) fireShot();
      if (rules) { rules.start(); rules.update(dt, objectives.heldSeconds, score); }
      enemies.update(dt, rhythm.pulse, player.object.position, collision, (dmg) => {
        player.hp = Math.max(0, player.hp - dmg);
        if (player.hp === 0) {
          player.hp = player.maxHp;
          resonance = 1.0;
          score = Math.max(0, score - 150);
          rules?.playerDowned();
          if (match.on) { match.downs++; player.spawnAt(arena.spawns.a.pos, arena.spawns.a.yaw); showBeatFeedback('DOWNED · BACK AT SPAWN', '#fb7185'); }
        }
      });
    }

    for (let i = beams.length - 1; i >= 0; i--) {
      beams[i].life -= dt;
      beams[i].line.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshBasicNodeMaterial | undefined; if (m) m.opacity *= Math.max(0, 1 - dt * 7); });
      if (beams[i].life <= 0) {
        scene.remove(beams[i].line);
        beams.splice(i, 1);
      }
    }

    for (let i = surges.length - 1; i >= 0; i--) {
      const s = surges[i];
      s.life -= dt;
      const t = 1 - Math.max(0, s.life) / 0.35;
      s.mesh.scale.setScalar(1 + t * 7.5);
      (s.mesh.material as THREE.MeshBasicNodeMaterial).opacity = 1 - t;
      if (s.life <= 0) {
        scene.remove(s.mesh);
        surges.splice(i, 1);
      }
    }

    const ringScale = 1.0 - rhythm.phase * 0.62;
    beatRing.style.transform = `translate(-50%, -50%) scale(${ringScale.toFixed(3)})`;
    beatRing.style.borderColor = rhythm.pulse > 0.65 ? '#fbbf24' : '#38bdf8aa';

    hpText.textContent = `${player.hp}/${player.maxHp}`;
    hpBar.style.width = `${(player.hp / player.maxHp) * 100}%`;
    resText.textContent = `${resonance.toFixed(1)}x`;
    resBar.style.width = `${((resonance - 1) / 3) * 100}%`;
    scoreText.textContent = String(score);
    if (enemies.wave !== lastWave) {
      lastWave = enemies.wave;
      const b = arena.setBiome(enemies.wave - 1);
      currentBiomeName = b.name;
      rhythm.setTrack(b.track);
      showBeatFeedback(`TRIAL ${enemies.wave} · ${b.name.toUpperCase()}`, '#fbbf24');
    }
    waveText.textContent = rules ? rules.title : `Trial ${enemies.wave} · ${currentBiomeName}`;
    surgeTag.textContent = resonance >= 2.0 ? 'SOUL SURGE READY [Q / RMB]' : 'SURGE AT 2.0x RESONANCE';
    surgeTag.style.color = resonance >= 2.0 ? '#fbbf24' : '#64748b';

    if (post) post.render(); else renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  if (new URLSearchParams(location.search).has('rrdebug')) {
    (window as any).__rr = { player, camera, enemies, arena, collision, renderer, scene, post, THREE, frame, tier, objectives, match };
    player.enabled = true;
    overlay.classList.add('hidden');
    // a hidden Browser pane freezes rAF; drive the loop from a timer in that case
    if (document.hidden) (window as any).requestAnimationFrame = (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 16);
  }
  requestAnimationFrame(frame);
}

boot().catch((err) => {
  console.error('[rift-realm] Boot error:', err);
  const lore = document.querySelector('#overlay .lore');
  if (lore) lore.textContent = `Renderer error: ${err instanceof Error ? err.message : String(err)}`;
});

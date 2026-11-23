// Rift Realm entry point: WebGPU renderer, Soul Vessels, Touch/Gamepad, Rhythm & Plajah Bridge.
import * as THREE from 'three/webgpu';
import { CollisionWorld } from './collision';
import { RhythmEngine, type BeatQuality } from './rhythm';
import type { Tier } from './shrine';
import { setSecondaryTier } from './secondary';
import { moduleByParam } from './studio/levelModules';
import { Objectives } from './objectives';
import { applyStudioProject } from './studio/projectHook';
import { createRules } from './studio/rulesHost';
import { createPost } from './post';
import { wetten } from './wetness';
import { getKTX2, initKTX2 } from './textures';
// front end + loading (menu/*): Start → Map → Character → loading screen; prefetch and the faster shader precompile
import { applyVolume, menuSkipped, prefetch, settings as menuSettings, startMenu } from './menu/menu';
import { LoadScreen } from './menu/loadProgress';
import { CHARS, MAPS } from './menu/content';
import { compileEverything, compileStats, installFastCompile, warmFrame } from './menu/fastCompile';
import { PlayerController } from './player';
import { EnemyManager, enemyNav } from './enemies';
import { VESSEL_ORDER, VESSELS, type VesselId } from './vessels';
import { Tracers, recipe } from './weapons';
import { UnifiedControls } from './controls';
import { Targeting } from './targeting';
import { createDanger } from './danger';
import { Melee } from './combat/melee';
import { COMBAT, DEFAULT_TUNING, applyCombatTuning, initCombatTuning, resetCombatTuning, type Archetype } from './combat/tuning';
import { PlajahGamesBridge } from './plajahBridge';
import { VfxSystem, HIT_SPARKS, HIT_PERFECT, KILL_BURST, SHADOW_BURST, SLASH, SLASH_PERFECT, SLASH_SHADOW, BLADE_TRAIL, STREAK_TRAIL } from '../../../services/vfx';

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
  // ammo: magazine count bottom-right (Fortnite-style), reload bar while reloading
  const ammoEl = document.createElement('div');
  ammoEl.style.cssText = 'position:fixed;right:24px;bottom:64px;z-index:12;pointer-events:none;font:800 22px/1 system-ui,sans-serif;letter-spacing:.06em;color:#e2f3ff;text-shadow:0 2px 6px #000';
  document.body.appendChild(ammoEl);
  const touchHud = document.getElementById('touchHud')!;
  const achToast = document.getElementById('achToast')!;

  // ── front end: the menus run (DOM + video) while the renderer starts behind them; ?rrdebug / ?studio=1 / ?menu=0 skip ──
  const menu = menuSkipped() ? null : startMenu();

  let renderer: THREE.WebGPURenderer;
  try {
    renderer = new THREE.WebGPURenderer({ antialias: true, powerPreference: 'high-performance' });
    await renderer.init();
  } catch (err) {
    console.warn('[rift-realm] WebGPU init failed, falling back to WebGL backend:', err);
    renderer = new THREE.WebGPURenderer({ antialias: true, powerPreference: 'high-performance', forceWebGL: true });
    await renderer.init();
  }
  menu?.attachRenderer(renderer, view);
  const choice = menu ? await menu.choice : null;
  const pickMap = MAPS.find((m) => m.param === (choice?.level ?? new URLSearchParams(location.search).get('level') ?? 'elderwood')) ?? MAPS[0];
  const pickChar = CHARS.find((c) => c.id === (choice?.vessel ?? 'aegis')) ?? CHARS[0];
  const loading = new LoadScreen({ mapName: pickMap.name, mapVideo: pickMap.video, mapPoster: pickMap.poster, charName: pickChar.name, charVideo: pickChar.turn, charPoster: pickChar.turnPoster, accent: pickMap.accent });
  // batched, parallel shader precompile with progress (menu/fastCompile.ts); ?fastcompile=0 = three's own
  if (new URLSearchParams(location.search).get('fastcompile') !== '0') {
    installFastCompile(renderer, (p) => loading.progress((p.built + p.ready) / Math.max(1, p.objects + p.pipelines), `${p.ready} / ${p.pipelines} shaders`));
  }
  // quality tier: Intel iGPUs (the baseline) get the light path; discrete GPUs get shadows, bloom and full foliage
  const adapter = (renderer.backend as any)?.device?.adapterInfo ?? {};
  const forced = new URLSearchParams(location.search).get('q') ?? (menuSettings.quality !== 'auto' ? menuSettings.quality : null);
  const tier: Tier = forced === 'low' || forced === 'high' ? forced : adapter.vendor === 'intel' ? 'low' : 'high';
  console.info('[rift-realm] tier', tier, adapter.vendor, adapter.architecture);
  setSecondaryTier(tier); // cloth / wing solver budget (secondary.ts)
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

  const levelId = choice?.level ?? new URLSearchParams(location.search).get('level') ?? 'elderwood';
  if (!getKTX2()) initKTX2(renderer);
  // one table of levels (studio/levelModules.ts), shared with the Game Studio
  const levelModule = moduleByParam(levelId);
  await loading.stage('assets');
  // the menus already started these (menu.ts prefetch); the same promises, so nothing loads twice
  prefetch.files(levelId);
  await Promise.all([prefetch.level(levelModule), prefetch.characters()]);
  await loading.stage('world');
  const arena = levelModule.build(scene, tier);
  // wet forest: damp surfaces, glossy wet patches, puddle shine (?dry turns it off); models that stream in later get it too
  if (!new URLSearchParams(location.search).has('dry')) {
    wetten(arena.group);
    for (const ms of [3000, 8000, 20000]) window.setTimeout(() => wetten(arena.group), ms);
  }
  await loading.stage('prepare');
  await arena.prepare?.(renderer, camera);
  camera.far = levelModule.look.far; camera.updateProjectionMatrix(); renderer.toneMappingExposure = levelModule.look.exposure;
  // Game Studio Play view: the project's edits to this level (spawns, enemy spots, control points, props, look) apply before anyone spawns.
  const studioLook = await applyStudioProject(levelId, arena);
  if (studioLook) { camera.far = studioLook.far; camera.updateProjectionMatrix(); renderer.toneMappingExposure = studioLook.exposure; }
  await loading.stage('collision');
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

  const rhythm = menu?.rhythm ?? new RhythmEngine(); // the menus' score keeps playing into the level
  const controls = new UnifiedControls(renderer.domElement);
  const usedVessels = new Set<VesselId>(['aegis']);
  let toastTimer: number | undefined;
  const plajah = new PlajahGamesBridge((title) => {
    achToast.textContent = `ACHIEVEMENT UNLOCKED · ${title}`;
    achToast.classList.add('on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => achToast.classList.remove('on'), 2800);
  });

  await loading.stage('characters');
  await prefetch.characters();
  const player = new PlayerController(camera, renderer.domElement);
  player.world = collision;
  player.spawnAt(arena.spawns.a.pos, arena.spawns.a.yaw);
  scene.add(player.object);
  if (choice) player.setVessel(choice.vessel); // the vessel picked on the character screen

  // a Studio level with rules decides who arrives and how the level ends (studio/rulesHost.ts); else the endless trials run
  const ruled = !!studioLook?.level.rules.some(r => r.enabled);
  initCombatTuning(); // combat/tuning.ts: the Studio's / a saved override applies before anyone spawns
  const enemies = new EnemyManager(scene, collision, arena.enemySpots, !ruled);
  const targeting = new Targeting(camera, collision);
  let moveAmt = 0; // 0…1 how hard the player is moving (aim assist widens on the run)
  const objectives = new Objectives(scene, arena.controlPoints ?? [], (x, z, y) => collision.groundAt(x, z, y, 10));
  enemyNav.goal = (arena.controlPoints?.length && !ruled) ? (p) => objectives.targetFor(p) : null;

  // Domination match (levels with control points, no Studio rules): first side to MATCH_SCORE points (each owned point
  // scores every 2 s), or the leader when the clock runs out. Downed players respawn at their spawn.
  const MATCH_SCORE = 100, MATCH_SECONDS = 8 * 60;
  // The match waits for you (Kenne: "keeps telling me defeat with no activity fighting against me" — enemies took the
  // points while he explored): it starts when you step onto a point, land a hit or get hit; until then nobody captures.
  const match = { on: !!arena.controlPoints?.length && !ruled, started: false, over: false, time: 0, downs: 0, kills: 0 };
  const startMatch = () => { if (!match.on || match.started || match.over) return; match.started = true; showBeatFeedback('MATCH ON · HOLD A / B / C', '#38bdf8'); };
  if (match.on) enemies.onKilled = () => { match.kills++; };
  const endMatch = (won: boolean, draw = false) => {
    match.over = true;
    rhythm.setMood(won || draw ? 'victory' : 'defeat');
    player.enabled = false;
    if (document.pointerLockElement) document.exitPointerLock();
    const m = Math.floor(match.time / 60), sec = Math.floor(match.time % 60).toString().padStart(2, '0');
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:radial-gradient(#06101cdd,#02060cf2);font-family:Segoe UI,sans-serif;color:#e6f1ff';
    box.innerHTML = `<div style="text-align:center"><div style="letter-spacing:.4em;font-size:13px;color:#8fb3d9">${arena.info.name.toUpperCase()} · DOMINATION</div>
      <div style="font-size:64px;font-weight:800;letter-spacing:.08em;margin:10px 0;color:${won ? '#38bdf8' : draw ? '#e2e8f0' : '#fb923c'};text-shadow:0 0 24px ${won ? '#38bdf8' : draw ? '#94a3b8' : '#fb923c'}">${won ? 'VICTORY' : draw ? 'DRAW' : 'DEFEAT'}</div>
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
  const shakeV = new THREE.Vector3(), assistV = new THREE.Vector3();
  const AIM_STYLE = new URLSearchParams(location.search).get('aim') ?? 'cursor';
  let releasingLock = false; // the game dropped the pointer lock itself (cursor aim), so the unlock isn't a pause
  const surges: SurgeWave[] = [];
  const raycaster = new THREE.Raycaster();
  // Particles (services/vfx): sparks on every hit, a burst of shards on a kill; bounce off the real ground.
  const vfx = new VfxSystem({ ground: (x, z, y) => collision.groundAt(x, z, y, 4) });
  scene.add(vfx.group);
  // Each weapon's tracer (weapons.ts: lance beam, scatter streaks, chord bolts), pooled.
  const tracers = new Tracers();
  scene.add(tracers.group);
  // Strikes: a blade trail off the right hand (third person) and a dash streak, fed each frame while active.
  const blade = vfx.trail(BLADE_TRAIL), dashTrail = vfx.trail(STREAK_TRAIL);
  const bladeA = new THREE.Vector3(), bladeB = new THREE.Vector3(), dashP = new THREE.Vector3();
  let bladeT = 0, dashT = 0, strikeFlip = false;
  // A dangerous world (danger/*, Elderwood + the Wilds): predators that hunt you and the rift's creatures, environment
  // hazards with status effects, night danger. Predators join the shot raycast, melee, Soul Surge and the lock-on list.
  const danger = createDanger({
    scene, camera, collision, vfx, player, enemies, level: levelId, lo: tier === 'low',
    beat: () => rhythm.beatIndex, pulse: () => rhythm.pulse, phase: () => rhythm.phase,
    busy: () => melee.busy || melee.blocking, // no eating mid-strike / while blocking
    addResonance: (n) => { resonance = Math.min(4.0, resonance + n); showBeatFeedback(`RESONANCE +${n.toFixed(1)}`, '#b36aff'); },
    hurt: (dmg) => { if (player.downed) return; startMatch(); player.hp = Math.max(0, player.hp - dmg); if (player.hp === 0) downPlayer(match.on); else player.takeHit(dmg); },
    say: (t, c) => showBeatFeedback(t, c),
    onKill: (xp, name) => { score += Math.round(xp * 4 * resonance); plajah.creditXp(Math.round(xp * resonance), enemies.wave); plajah.unlock('rift_realm_first_blood'); showBeatFeedback(`${name.toUpperCase()} DOWN · +${xp} XP`, '#ffb366'); },
  });
  const foes = () => (danger ? danger.foes(enemies.enemies) : enemies.enemies);

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

  // Hit feedback (Fortnite-style): an X hit marker on the crosshair (white, red on a kill) and the damage number
  // popping up at the hit point, rising and fading.
  const hitMarker = document.createElement('div');
  hitMarker.style.cssText = 'position:fixed;left:50%;top:50%;width:26px;height:26px;transform:translate(-50%,-50%);pointer-events:none;z-index:13;opacity:0';
  hitMarker.innerHTML = '<svg viewBox="0 0 26 26" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M3 3l6 6M23 3l-6 6M3 23l6-6M23 23l-6-6"/></svg>';
  document.body.appendChild(hitMarker);
  const projV = new THREE.Vector3();
  function showHit(point: THREE.Vector3, dmg: number, killed: boolean) {
    hitMarker.style.color = killed ? '#ff3b4e' : '#ffffff';
    hitMarker.style.filter = `drop-shadow(0 0 3px ${killed ? '#ff3b4e' : '#000'})`;
    hitMarker.animate([
      { opacity: 1, transform: `translate(-50%,-50%) scale(${killed ? 1.5 : 1.25})` },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.35 },
      { opacity: 0, transform: 'translate(-50%,-50%) scale(1)' },
    ], { duration: killed ? 420 : 280, easing: 'ease-out' });
    projV.copy(point).project(camera);
    if (projV.z > 1) return;
    const n = document.createElement('div');
    const x = (projV.x * 0.5 + 0.5) * window.innerWidth + (Math.random() - 0.5) * 24;
    const y = (-projV.y * 0.5 + 0.5) * window.innerHeight;
    n.textContent = String(dmg);
    n.style.cssText = `position:fixed;left:${x}px;top:${y}px;transform:translate(-50%,-50%);pointer-events:none;z-index:13;font:800 ${killed ? 24 : 18}px/1 system-ui,sans-serif;color:${killed ? '#ff3b4e' : '#ffffff'};-webkit-text-stroke:1px #000;text-shadow:0 2px 4px #000`;
    document.body.appendChild(n);
    n.animate([
      { transform: 'translate(-50%,-50%) scale(1.35)', opacity: 1 },
      { transform: 'translate(-50%,-90%) scale(1)', opacity: 1, offset: 0.3 },
      { transform: 'translate(-50%,-220%) scale(0.9)', opacity: 0 },
    ], { duration: 750, easing: 'ease-out' }).onfinish = () => n.remove();
  }

  /** One ray of a shot (a pellet of the scatter); the weapon's tracer, impact FX and sounds. Returns whether it hit. */
  function fireSingleRay(quality: BeatQuality, spreadRad: number, baseDmg: number, primaryHex: number, muzzle: THREE.Vector3, quiet = false) {
    const w = player.weapon;
    const { origin, dir } = player.getAimRay();
    targeting.assist(origin, dir, moveAmt); // locked: straight at the target; soft: pulled toward it
    if (spreadRad > 0) {
      dir.x += (Math.random() - 0.5) * spreadRad * 2;
      dir.y += (Math.random() - 0.5) * spreadRad * 2;
      dir.z += (Math.random() - 0.5) * spreadRad * 2;
      dir.normalize();
    }

    const worldDist = collision.rayDistance(origin, dir, 120);
    raycaster.set(origin, dir);
    raycaster.far = worldDist;
    const hits = raycaster.intersectObjects(danger ? [...enemies.getHitMeshes(), ...danger.hitMeshes()] : enemies.getHitMeshes(), false);

    let endPt = origin.clone().addScaledVector(dir, worldDist);

    const pHit = hits.length && danger ? danger.damage(hits[0].object, Math.round(baseDmg * (1 + (resonance - 1) * 0.25) * (danger?.dmgMul ?? 1)), origin) : null;
    if (pHit) { // a predator
      endPt = hits[0].point;
      if (!quiet || pHit.killed) rhythm.playHit(pHit.killed);
      showHit(hits[0].point, Math.round(baseDmg * (1 + (resonance - 1) * 0.25) * (danger?.dmgMul ?? 1)), pHit.killed);
      vfx.spawn(recipe(quality === 'PERFECT' ? w.fx.impactPerfect : w.fx.impact), hits[0].point, { dir: [-dir.x, -dir.y, -dir.z], tint: primaryHex });
    } else if (hits.length > 0) {
      endPt = hits[0].point;
      const enemyId = hits[0].object.userData.enemyId as number;
      const dmg = Math.round(baseDmg * (1 + (resonance - 1) * 0.25) * (danger?.dmgMul ?? 1));
      const res = enemies.damageEnemy(enemyId, dmg, dir, 0, { source: 'shot' });
      if (res) {
        startMatch();
        melee.onShot(res); // shots interrupt wind-ups, fill the stagger meter, keep launched enemies up
        if (!quiet || res.killed) rhythm.playHit(res.killed);
        if (!quiet) rhythm.playSfx(w.sounds.impact, { gain: 0.55, send: 0.3 });
        showHit(hits[0].point, dmg, res.killed);
        vfx.spawn(recipe(quality === 'PERFECT' ? w.fx.impactPerfect : w.fx.impact), hits[0].point, { dir: [-dir.x, -dir.y, -dir.z], tint: primaryHex, count: quality === 'PERFECT' && spreadRad > 0.03 ? 0.5 : 1 });
        if (res.killed) vfx.spawn(KILL_BURST, res.pos.clone().setY(res.pos.y + 1), { tint: primaryHex });
        if (res.killed) {
          const pts = Math.round(100 * resonance);
          score += pts;
          plajah.creditXp(Math.round(15 * resonance), enemies.wave);
          plajah.unlock('rift_realm_first_blood');
          if (enemies.wave >= 3) plajah.unlock('rift_realm_trial_3');
        }
      }
    }

    enemies.shotFired(origin, dir); // enemies near the line may juke the next shot
    if (!hits.length && worldDist < 120) {
      vfx.spawn(recipe(w.fx.impact), endPt, { dir: [-dir.x, -dir.y, -dir.z], tint: primaryHex, count: 0.7 });
      if (!quiet) rhythm.playSfx(w.sounds.impact, { gain: 0.3, send: 0.5 });
    }
    tracers.spawn(muzzle, endPt, w.fx.tracer, primaryHex, quality === 'PERFECT');
    return hits.length > 0;
  }

  function fireShot() {
    if (!player.enabled) return;
    if (!player.useRound()) return; // reloading, switching, down, or dry (player.onDryFire clicks; the reload starts)
    combatT = Math.min(combatT, 3); // firing keeps the combat music going
    const beat = rhythm.evaluateBeat();
    const spec = player.vessel;
    showQuality(beat.quality);
    danger?.noise(player.object.position, 60); // predators hear gunshots

    if (beat.quality === 'PERFECT') resonance = Math.min(4.0, resonance + 0.35);
    else if (beat.quality === 'GOOD') resonance = Math.min(4.0, resonance + 0.15);
    else resonance = Math.max(1.0, resonance - 0.25);

    if (resonance >= 4.0) plajah.unlock('rift_realm_perfect_resonance');

    const baseDmg =
      beat.quality === 'PERFECT' ? spec.dmgPerfect : beat.quality === 'GOOD' ? spec.dmgGood : spec.dmgOff;

    const triggerBurst = () => {
      if (player.vessel.id !== spec.id || player.downed) return; // switched away mid-burst
      rhythm.playShot(beat.quality, spec.id);
      player.triggerMuzzleFlash();
      // the shot leaves the real barrel tip (the Chord Repeater cycles its three barrels)
      const muzzle = player.getMuzzleWorldPos(true), d = player.getAimRay().dir;
      vfx.spawn(recipe(player.weapon.fx.muzzle), muzzle, { dir: [d.x, d.y, d.z], tint: spec.primaryColor });
      // bloom: hip fire on the move sprays, standing and aiming is near-exact (player.spreadRad, weapons.ts spread)
      const spread = player.spreadRad(spec.spreadRad);
      for (let p = 0; p < spec.pellets; p++) {
        fireSingleRay(beat.quality, spread, baseDmg, spec.primaryColor, muzzle, p > 0);
      }
      player.recoil();
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
        const res = enemies.damageEnemy(e.id, 45, toEnemy, 3.6, { source: 'surge', hitstun: 0.7, guardDmg: 80, launch: 7 });
        if (res?.killed) score += Math.round(125 * resonance);
      }
    }
    danger?.blast(center, 8.5, 45);
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
    melee.noteDash(); // i-frames; a strike right after is the lunge
    dashTrail.setColor(player.vessel.primaryColor); dashTrail.emitting = true; dashT = 0.32;
    const evalRes = rhythm.evaluateBeat();
    const onBeat = evalRes.quality !== 'OFF';
    rhythm.playDash(onBeat);
    if (onBeat) {
      resonance = Math.min(4.0, resonance + 0.25);
      showQuality(evalRes.quality);
    }
  };

  player.onSoulSurge = triggerSoulSurge;
  const reticleEl = document.getElementById('reticle') as HTMLElement | null;
  let lastAim = 0;

  // Close combat (combat/melee.ts): light / heavy chains, guard + perfect parry, launchers, guard breaks, Soul-Rend.
  const melee = new Melee({
    player, enemies, vfx, rhythm, targeting, camera,
    dmgMul: () => danger?.dmgMul ?? 1, // Furyberry (danger/forage.ts)
    rayDistance: (o, d, m) => collision.rayDistance(o, d, m),
    resonance: { get: () => resonance, set: (v) => { resonance = v; if (resonance >= 4.0) plajah.unlock('rift_realm_perfect_resonance'); } },
    addScore: (pts) => { score += pts; },
    feedback: showBeatFeedback,
    showHit,
    onKill: (_e, how) => {
      plajah.creditXp(Math.round((how === 'rend' ? 30 : 20) * resonance), enemies.wave);
      plajah.unlock('rift_realm_first_blood');
      if (how === 'rend') plajah.unlock('rift_realm_soul_rend');
      if (enemies.wave >= 3) plajah.unlock('rift_realm_trial_3');
    },
    onContact: () => { startMatch(); combatT = 0; },
    onSwing: (tint, perfect) => {
      blade.setColor(perfect ? 0xffd36a : tint, perfect ? 0xff9a2a : tint); blade.emitting = true; bladeT = 0.42;
      if (danger) { // the swing also lands on predators in reach (combat/melee.ts handles the rift's creatures)
        const pp = player.object.position, fwd = new THREE.Vector3(-Math.sin(player.bodyYaw), 0, -Math.cos(player.bodyYaw)), t = targeting.target;
        if (t && danger.isPredator(t)) { const to = t.mesh.position.clone().sub(pp).setY(0); if (to.length() < 4.5 && to.length() > 0.2) fwd.copy(to.normalize()); }
        for (const h of danger.melee(pp, fwd, perfect ? 36 : 24)) { showHit(h.pos, perfect ? 36 : 24, h.killed); vfx.spawn(perfect ? HIT_PERFECT : HIT_SPARKS, h.pos, { tint }); rhythm.playHit(h.killed); }
      }
    },
  });
  const triggerMeleeStrike = () => { if (player.enabled) melee.light(); };
  melee.wireEnemyFx(); // enemy tells: wind-up sounds, the slam's shock ring, bolts bursting on walls
  const camSave = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() }, cinPos = new THREE.Vector3(), cinLook = new THREE.Vector3(), cinM = new THREE.Matrix4(), cinQ = new THREE.Quaternion();

  player.onStrike = triggerMeleeStrike;
  player.onReload = () => rhythm.playReload();
  player.onFists = (on) => showBeatFeedback(on ? 'HAND TO HAND' : 'WEAPON DRAWN', on ? '#fb7185' : '#38bdf8');

  // Mouse: right = fire (hold to keep firing on the beat), left = melee strike, middle / Tab = lock-on — all read
  // through UnifiedControls (controls.ts). Soul Surge is Q (Y on a controller), LT holds the lock.
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) targeting.release(); });

  // ── score: the music fits the moment (rhythm.ts music director); N skips to another song of the same mood ──
  let combatT = 99; // seconds since the last fight contact (shot, hit, enemy close)
  const nowPlaying = document.createElement('div');
  nowPlaying.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:12;pointer-events:none;font:600 11px/1.3 system-ui,sans-serif;letter-spacing:.12em;color:#bfe9ff;text-shadow:0 0 6px #000;opacity:0;transition:opacity .6s';
  document.body.appendChild(nowPlaying);
  let npTimer: number | undefined;
  rhythm.onTrackChange = (title) => {
    nowPlaying.textContent = `♪ ${title.toUpperCase()}`;
    nowPlaying.style.opacity = '0.9';
    window.clearTimeout(npTimer); npTimer = window.setTimeout(() => { nowPlaying.style.opacity = '0'; }, 5000);
  };
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyN' && player.enabled) rhythm.skip(); });
  const updateMood = (dt: number) => {
    if (match.over || !player.enabled) return;
    const pp = player.object.position;
    const near = enemies.enemies.some((e) => e.mesh.position.distanceToSquared(pp) < 28 * 28) || !!danger?.engaged;
    combatT = near ? 0 : combatT + dt;
    player.inCombat = combatT < 1.5; // A / D strafe in a fight, turn when exploring
    const boss = enemies.enemies.some((e) => e.boss);
    const tight = match.on && MATCH_SECONDS - match.time < 60 && Math.abs(objectives.score.blue - objectives.score.orange) <= 15;
    rhythm.setMood(boss ? 'boss' : tight ? 'showdown' : combatT < 10 ? 'combat' : 'explore');
  };

  // Weapon sounds (weapons.ts names them, rhythm.ts banks them): the reload plays beat by beat in step with the
  // body's reload clip (mag out, mag in, charge), a dry click on an empty mag, a holster rattle on a switch.
  player.onReload = () => { /* the reload sounds now play per beat (onReloadBeat) */ };
  player.onReloadBeat = (beat, w) => {
    const name = beat === 'out' ? w.sounds.magOut : beat === 'in' ? w.sounds.magIn : beat === 'charge' ? w.sounds.charge : w.sounds.dry;
    rhythm.playSfx(name, { gain: beat === 'release' ? 0.45 : 0.85, send: 0.15 });
  };
  player.onDryFire = (w) => { if (!rhythm.playSfx(w.sounds.dry, { gain: 0.8, send: 0.1 })) rhythm.playEmpty(); };
  player.onWeaponSwitch = (w) => rhythm.playSfx(w.sounds.switch, { gain: 0.7, send: 0.15 });

  const enterRift = (fromTouch = false) => {
    rhythm.setMood('explore');
    rhythm.start();
    applyVolume(rhythm); // the menus' volume setting
    if (fromTouch || controls.isTouchDevice || window.matchMedia('(pointer: coarse)').matches) {
      controls.isTouchDevice = true;
      player.enabled = true;
      overlay.classList.add('hidden');
      touchHud.classList.add('on');
    } else {
      // A refused pointer lock (embedded views, some browsers) must never block play: drag-look takes over.
      const enterUnlocked = () => { player.enabled = true; overlay.classList.add('hidden'); };
      // third person aims with the cursor: no pointer lock to take (taking it, then dropping it for the cursor, read
      // as Esc and paused the game on entry and on every resume)
      if (!player.firstPerson && AIM_STYLE !== 'look') { enterUnlocked(); return; }
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
  // Sound must never stay off while you play: browsers only start / resume audio on a click or key, and a
  // suspended context (tab hidden, debug entry that skipped the menu) stays silent until then — so any click or key
  // during play (re)starts the score.
  const wakeAudio = () => { if (player.enabled) rhythm.start(); };
  window.addEventListener('pointerdown', wakeAudio, true);
  window.addEventListener('keydown', wakeAudio, true);

  document.addEventListener('pointerlockchange', () => {
    if (controls.isTouchDevice) return;
    const locked = document.pointerLockElement === renderer.domElement;
    if (locked) { player.enabled = true; overlay.classList.add('hidden'); return; }
    // released by the game itself (switching to cursor aim): not a pause
    if (releasingLock) { releasingLock = false; return; }
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
  // Downed: the mocap death fall plays and holds on the floor, then you respawn (match / hazard) or get back up.
  function downPlayer(toSpawn: boolean) {
    if (player.downed) return;
    resonance = 1.0;
    score = Math.max(0, score - 150);
    rules?.playerDowned();
    if (match.on) match.downs++;
    showBeatFeedback(toSpawn ? 'DOWNED · BACK AT SPAWN' : 'DOWNED', '#fb7185');
    player.goDown(() => {
      player.hp = player.maxHp;
      if (toSpawn) player.spawnAt(arena.spawns.a.pos, arena.spawns.a.yaw);
      else player.playClip('get_up', 1);
    });
  }
  function frame(now: number, once = false) {
    const realDt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    // hit-stop freezes the world for a few frames, a parry / Soul-Rend slows it (combat/melee.ts)
    melee.update(realDt);
    const dt = realDt * melee.timeScale;
    trapDamageCooldown = Math.max(0, trapDamageCooldown - dt);

    const input = controls.poll(dt);
    if (input.isTouchActive) touchHud.classList.add('on');

    rhythm.update();
    updateMood(dt);
    arena.update(dt, rhythm.pulse, rhythm.beatIndex);
    // targeting: soft target under the crosshair, lock-on follows its enemy (the view turns to it while you move)
    moveAmt = Math.min(1, Math.hypot(input.moveX, input.moveY) + (['KeyW', 'KeyA', 'KeyS', 'KeyD'].some((k) => player.keys.has(k)) ? 1 : 0));
    targeting.setView(player.firstPerson, (o) => player.chestPos(o)); // each view has its own catch / assist tuning
    // third person: cursor aim — the crosshair is where the mouse points, shots and the body go there, the camera turns
    // with A / D and the screen edges (Kenne: "the crosshair is never where I'm pointing the mouse"). First person and
    // ?aim=look keep mouse-look.
    controls.cursorAim = !player.firstPerson && AIM_STYLE !== 'look';
    if (controls.cursorAim && document.pointerLockElement) { releasingLock = true; document.exitPointerLock?.(); }
    targeting.cursor = input.cursor; player.aimNdc = input.cursor;
    if (input.lockPressed && player.enabled) targeting.toggle(foes());
    targeting.update(realDt, foes(), input.lockHeld, player.enabled, moveAmt);
    hitMarker.style.left = `${targeting.screenX}px`; hitMarker.style.top = `${targeting.screenY}px`; // hit marks sit on the crosshair
    {
      const tp = targeting.profile;
      // aim assist is for sticks (Fortnite / CoD): a mouse gets raw aim, no pull, no slow-down over targets
      targeting.assistOn = input.padAim;
      if (targeting.locked) player.aimAt(targeting.aimPoint(targeting.locked), dt, tp.lockRate);
      else if (input.padAim) { const ap = targeting.assistPoint(assistV); if (ap && moveAmt > 0.15) player.aimAt(ap, dt, tp.assist * moveAmt, false); }
      player.aimFriction = input.padAim && targeting.soft && !targeting.locked ? tp.friction : 1;
      player.lockedOn = targeting.isLocked;
      // locked: a sideways flick hops to the next enemy that way; slow drift decays and never adds up to a switch
      if (player.lockedOn && Math.abs(player.flickX) > tp.flick) { targeting.flickSwitch(foes(), player.flickX); player.flickX = 0; }
      player.flickX *= Math.exp(-dt * 6);
    }
    player.aiming = targeting.isLocked || input.aimHeld; // right mouse / LT holds aim down sights
    player.update(dt, rhythm.pulse, input);
    if (document.body.classList.contains('rr-ingame') !== player.enabled) document.body.classList.toggle('rr-ingame', player.enabled); // no OS cursor in play
    // bodies are solid: the player can't walk through enemies or predators (pushed out sideways, a boss is wider)
    if (player.enabled) {
      const pp = player.object.position;
      for (const f of foes()) {
        if (!f.mesh || (f as { hp?: number }).hp! <= 0) continue;
        const fp = f.mesh.position, dx = pp.x - fp.x, dz = pp.z - fp.z, d = Math.hypot(dx, dz);
        const min = 0.38 + ((f as { boss?: boolean }).boss ? 1.1 : 0.5);
        if (d >= min || d < 1e-4 || Math.abs(pp.y - fp.y) > 1.6) continue;
        pp.x += (dx / d) * (min - d); pp.z += (dz / d) * (min - d);
      }
    }
    // the reticle shows the spread: it opens with bloom (moving, jumping, firing) and tightens while aiming
    if (reticleEl) { const k = player.aimBlend; const sc = (0.8 + player.bloom * 0.9) * (1 - k * 0.4); if (Math.abs(sc - lastAim) > 0.005) { lastAim = sc; reticleEl.style.transform = `translate(-50%, -50%) scale(${sc.toFixed(3)})`; reticleEl.style.opacity = String(1 - k * 0.15); } }
    arena.resolveDynamicGates(player.object.position, 0.38);

    if (player.enabled) {
      // lava / abyss hazard
      hazardCooldown = Math.max(0, hazardCooldown - dt);
      if (arena.hazardBelow !== undefined && player.object.position.y < arena.hazardBelow && hazardCooldown <= 0) {
        hazardCooldown = 0.4;
        player.hp = Math.max(0, player.hp - 20);
        showBeatFeedback('BURNING! -20 HP', '#f97316');
        if (player.hp === 0) downPlayer(true);
      }
      if (match.on && !match.started && arena.controlPoints!.some((c) => Math.hypot(player.object.position.x - c.pos.x, player.object.position.z - c.pos.z) < c.radius)) startMatch();
      objectives.update(dt, player.object.position, !match.on || match.started ? enemies.enemies.map((e) => e.mesh.position) : [], !match.on || match.started);
      if (match.on && match.started && !match.over) {
        match.time += dt;
        const { blue, orange } = objectives.score;
        if (blue >= MATCH_SCORE || orange >= MATCH_SCORE || match.time >= MATCH_SECONDS) endMatch(blue > orange, blue === orange);
      }
      // gun out: left fires, right throws a quick strike. Fists: left = light, right = heavy (combat/melee.ts chains them)
      if (input.fistsPressed && player.enabled) player.setFists(!player.fists);
      if (input.firePressed) { if (player.fists) { if (player.enabled) melee.light(); } else fireShot(); }
      if (input.meleePressed && player.enabled) { if (player.fists) melee.heavy(); else melee.light(); }
      if (rules) { rules.start(); rules.update(dt, objectives.heldSeconds, score); }
      enemies.playerForward.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
      enemies.playerChest = player.crouched ? 1.0 : 1.3;
      enemies.update(dt, rhythm.pulse, player.object.position, collision, (_dmg, strike) => {
        if (player.downed) return 'evaded';
        startMatch();
        combatT = 0;
        // evade (dash i-frames), block, perfect parry or take it (combat/melee.ts)
        const { outcome, dmg: raw } = melee.incoming(strike);
        if (outcome === 'hit' || outcome === 'blocked') player.faceThreat(strike.from); // a hit from behind turns you to face it
        const dmg = danger && raw > 0 ? danger.absorb(raw) : raw; // a Shellfruit shield soaks it first
        if (dmg > 0) {
          player.hp = Math.max(0, player.hp - dmg);
          if (player.hp === 0) downPlayer(match.on);
          else if (outcome === 'hit') player.takeHit(dmg);
        }
        return outcome;
      });
    }

    danger?.update(dt);
    if (bladeT > 0) { bladeT -= dt; if (player.bladeEdge(bladeA, bladeB)) blade.push(bladeA, bladeB); if (bladeT <= 0) blade.emitting = false; }
    if (dashT > 0) { dashT -= dt; dashTrail.push(dashP.copy(player.object.position).setY(player.object.position.y + 1.0)); if (dashT <= 0) dashTrail.emitting = false; }
    vfx.update(dt, camera);
    tracers.update(dt);

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
    surgeTag.textContent = resonance >= 2.0 ? 'SOUL SURGE READY [Q]' : 'SURGE AT 2.0x RESONANCE';
    const ammoTxt = player.fists ? 'FISTS  ·  MMB / T: gun' : player.reloading ? `RELOADING ${'▮'.repeat(Math.round(player.reloadProgress * 8)).padEnd(8, '▯')}` : `${player.ammo} / ${player.magSize}${player.ammo === 0 ? '  [R]' : ''}${player.crouched ? '  · CROUCHED' : ''}`;
    if (ammoEl.textContent !== ammoTxt) { ammoEl.textContent = ammoTxt; ammoEl.style.color = player.ammo <= Math.ceil(player.magSize / 4) && !player.reloading ? '#fb7185' : '#e2f3ff'; }
    surgeTag.style.color = resonance >= 2.0 ? '#fbbf24' : '#64748b';

    // a kill's shake, applied for this render only (the player controller owns the camera)
    const shk = vfx.shake * 0.06;
    if (shk > 0.001) camera.position.add(shakeV.set((Math.random() - 0.5) * shk, (Math.random() - 0.5) * shk, (Math.random() - 0.5) * shk));
    // Soul-Rend: a side-on camera beat, for this render only
    const cinW = melee.cinematic(cinPos, cinLook);
    if (cinW > 0) {
      camSave.pos.copy(camera.position); camSave.quat.copy(camera.quaternion);
      cinQ.setFromRotationMatrix(cinM.lookAt(cinPos, cinLook, THREE.Object3D.DEFAULT_UP));
      camera.position.lerp(cinPos, cinW); camera.quaternion.slerp(cinQ, cinW);
    }
    if (post) post.render(); else renderer.render(scene, camera);
    if (cinW > 0) { camera.position.copy(camSave.pos); camera.quaternion.copy(camSave.quat); }
    if (shk > 0.001) camera.position.sub(shakeV);
    if (!once) requestAnimationFrame(frame);
  }

  // ── loading: compile what joined after the level's precompile (vessel, enemies, VFX, post), draw one frame behind
  //    the loading screen so the first visible frame doesn't stall, then wait for the player to enter ──
  await loading.stage('spawn');
  const tSpawn = performance.now();
  try { await renderer.compileAsync(scene, camera); } catch (e) { console.warn('[load] spawn precompile', e); }
  const tFirst = performance.now();
  // shadow / post pipelines compile async in a no-draw pass first (menu/fastCompile.ts warmFrame), then the real frame
  const warmed = new URLSearchParams(location.search).get('fastcompile') === '0' ? 0
    : await warmFrame(renderer, () => frame(performance.now(), true), (n, t) => loading.progress(0.5 + 0.45 * (n / Math.max(1, t)), `${n} / ${t} frame shaders`));
  const tWarm = performance.now();
  frame(performance.now(), true);
  await (renderer.backend as any).device?.queue?.onSubmittedWorkDone?.(); // the GPU actually finished that frame
  console.info(`[load] spawn: precompile ${Math.round(tFirst - tSpawn)} ms, warm frame ${Math.round(tWarm - tFirst)} ms (${warmed} pipelines), first frame ${Math.round(performance.now() - tWarm)} ms`);
  console.info(`[load] precompile: ${compileStats.objects} objects, ${compileStats.pipelines} pipelines, ${Math.round(compileStats.ms)} ms in ${compileStats.calls} passes`);
  const entered = loading.ready().then(() => {
    loading.hide();
    prefetch.remember(levelId);
    if (!new URLSearchParams(location.search).has('rrdebug')) enterRift(controls.isTouchDevice);
    // the rest of the world's shaders (areas out of view at spawn), in the background so walking on doesn't hitch
    window.setTimeout(() => { void compileEverything(renderer, scene, camera).then(() => console.info('[load] background warm-up done')); }, 1500);
  });
  document.getElementById('menuBtn')?.addEventListener('click', () => { location.href = location.pathname; }); // pause → back to the menus
  // Esc pauses drag-look play too (no pointer lock to release, e.g. an embedded view that refused the lock)
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || controls.isTouchDevice || document.pointerLockElement || document.querySelector('.rr-load')) return;
    if (player.enabled) { player.enabled = false; overlay.classList.remove('hidden'); } else if (!overlay.classList.contains('hidden')) enterRift(false);
  });

  if (new URLSearchParams(location.search).has('rrdebug')) {
    loading.release(); await entered;
    (window as any).__rr = { vfx, tracers, player, camera, enemies, arena, collision, renderer, scene, post, THREE, frame, tier, objectives, match, targeting, rhythm, danger };
    // combat checks: __rr.combat.arena(['rusher', 'caster', 'brute']) clears the field and rings those around you;
    // .passive(true) freezes their AI; .tune({...}) edits the table live; .state() reads the fight
    (window as any).__rr.combat = {
      melee, tuning: COMBAT, defaults: DEFAULT_TUNING, tune: applyCombatTuning, reset: resetCombatTuning,
      passive: (on = true) => { enemies.passive = on; },
      arena: (kinds: Archetype[] = ['rusher', 'rusher', 'caster', 'brute'], radius = 9) => {
        enemies.clear();
        const pp = player.object.position;
        kinds.forEach((k, i) => {
          const a = (i / kinds.length) * Math.PI * 2 + player.yaw + Math.PI;
          const at = new THREE.Vector3(pp.x + Math.sin(a) * radius, pp.y, pp.z + Math.cos(a) * radius);
          at.y = collision.groundAt(at.x, at.z, pp.y + 4, 12) ?? pp.y;
          enemies.spawnAt(at, k);
        });
        return enemies.enemies.map((e) => `${e.id}:${e.archetype}`);
      },
      light: () => melee.light(), heavy: () => melee.heavy(),
      state: () => ({
        combo: melee.combo, chain: melee.chain, move: melee.move?.id ?? null, guard: Math.round(melee.guard), counter: melee.counterT > 0, exec: !!melee.exec, stats: { ...melee.stats }, tokens: enemies.tokenState,
        enemies: enemies.enemies.map((e) => ({ id: e.id, a: e.archetype, s: e.state, hp: e.hp, air: +e.air.toFixed(2), d: +e.mesh.position.distanceTo(player.object.position).toFixed(1), fin: e.staggered })),
      }),
    };
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
  document.getElementById('overlay')?.classList.remove('hidden');
  document.querySelector('.rr-load')?.remove();
});

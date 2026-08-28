// FloraWing — the Living Forest. Phase I: a walkable dusk hall of procedurally
// grown specimens, museum labels, a growth scrubber, and layered ambience.
//
// Design (see docs/MUSEION_LIVING_MUSEUM_HANDOFF.md): deep green-black ground,
// light falling from the canopy, living green as the only interface colour,
// latin binomials always in italic serif. Labels float as frosted glass in the
// scene rather than sitting on a flat page.

import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Sky, SoftShadows } from '@react-three/drei';
import { EffectComposer, N8AO, Bloom, ToneMapping, SMAA, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { ArrowLeft, Volume2, VolumeX, Sprout, BookOpen } from 'lucide-react';
import TreeMesh from './TreeMesh';
import SpecimenModel from './SpecimenModel';
import GrassField from './GrassField';
import { disposeFloraTextures } from './textures';
import { ForestAudio, roomForGallery } from './ForestAudio';
import { FLORA, GALLERY_META, LINEAGE_LABEL, CONSERVATION_LABEL, populatedGalleries } from '../../../data/flora';
import type { FloraSpecimen, Gallery } from '../../../data/flora';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Fire-TV contract: cap DPR and drop branch sides on small/weak devices. */
function tierFor(): { dpr: [number, number]; radial: number; grass: number; post: boolean } {
  if (typeof window === 'undefined') return { dpr: [1, 1.5], radial: 6, grass: 20000, post: true };
  const tv = /TV|BRAVIA|AFT|SmartTV|Tizen/i.test(navigator.userAgent);
  const small = window.innerWidth < 700;
  if (tv) return { dpr: [1, 1], radial: 5, grass: 9000, post: false };
  if (small) return { dpr: [1, 1.5], radial: 5, grass: 12000, post: false };
  return { dpr: [1, 1.75], radial: 7, grass: 32000, post: true };
}

/** Ground plane + a hint of mist, so trees stand in a place rather than a void. */
function ForestFloor() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[52, 64]} />
        <meshStandardMaterial color="#1b2a14" roughness={1} metalness={0} />
      </mesh>
    </>
  );
}

/** Dusk light: a warm shaft from the canopy plus cool sky fill. */
function ForestLight() {
  return (
    <>
      <hemisphereLight args={['#cfe8ff', '#20301a', 0.45]} />
      <directionalLight
        position={[30, 26, 16]}
        intensity={3.2}
        color="#ffe2b0"
        castShadow
        shadow-bias={-0.0006}
        shadow-normalBias={0.035}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={60}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
      />
      <pointLight position={[-10, 6, -8]} intensity={0.35} color="#57c26a" distance={40} />
    </>
  );
}

export default function FloraWing({ onBack, onOpenStudyRoom }: { onBack: () => void; onOpenStudyRoom?: () => void }) {
  const galleries = useMemo(() => populatedGalleries(), []);
  const [gallery, setGallery] = useState<Gallery>(galleries[0] || 'canopy');
  const specimens = useMemo(() => FLORA.filter((s) => s.gallery === gallery), [gallery]);
  const [selectedId, setSelectedId] = useState<string>(specimens[0]?.id ?? '');
  const selected: FloraSpecimen | undefined =
    specimens.find((s) => s.id === selectedId) ?? specimens[0];

  const [growth, setGrowth] = useState(1);
  const [season, setSeason] = useState(0);
  const [audioOn, setAudioOn] = useState(false);
  const audioRef = useRef<ForestAudio | null>(null);
  const reduced = useMemo(prefersReducedMotion, []);
  const tier = useMemo(tierFor, []);
  const grassCount = tier.grass;

  useEffect(() => { setSelectedId(specimens[0]?.id ?? ''); }, [gallery]); // eslint-disable-line

  // Ambience follows the room; gesture-gated start (browsers refuse otherwise).
  useEffect(() => {
    if (audioOn) audioRef.current?.applyRoom(roomForGallery(gallery));
  }, [gallery, audioOn]);

  useEffect(() => () => { audioRef.current?.stop(); audioRef.current = null; disposeFloraTextures(); }, []);

  const toggleAudio = async () => {
    if (audioOn) { audioRef.current?.stop(); audioRef.current = null; setAudioOn(false); return; }
    const fa = new ForestAudio();
    const ok = await fa.start();
    if (!ok) { fa.stop(); setAudioOn(false); return; }   // no beds installed yet → stay silent, no error
    fa.applyRoom(roomForGallery(gallery));
    audioRef.current = fa;
    setAudioOn(true);
  };

  // Lay the gallery out as a shallow arc so several specimens read at once.
  const layout = useMemo(() => specimens.map((s, i) => {
    const n = specimens.length;
    const spread = Math.min(1.05, 0.42 + n * 0.08);
    const a = n === 1 ? 0 : (i / (n - 1) - 0.5) * spread * Math.PI;
    const r = 11;
    return { id: s.id, pos: [Math.sin(a) * r, 0, -Math.cos(a) * r] as [number, number, number], rot: -a };
  }), [specimens]);

  const meta = GALLERY_META[gallery];

  return (
    <div className="flora-wing">
      <style>{CSS}</style>

      <div className="fw-stage">
        <Canvas
          shadows
          dpr={tier.dpr}
          camera={{ position: [0, 4.2, 15], fov: 52 }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          onCreated={({ scene, gl }) => {
            gl.toneMappingExposure = 1.05;
            gl.shadowMap.type = THREE.PCFSoftShadowMap;
            scene.fog = new THREE.FogExp2('#a8c6b4', 0.0095);
          }}
        >
          {/* Preetham atmospheric sky — no asset, and it sets the horizon colour
              the whole hall is lit against. */}
          <Sky distance={4500} sunPosition={[26, 18, 14]} turbidity={7} rayleigh={2.2}
            mieCoefficient={0.006} mieDirectionalG={0.86} />
          <SoftShadows size={26} samples={12} focus={0.7} />
          <ForestLight />
          <ForestFloor />
          <GrassField count={grassCount} outerRadius={26} season={season} wind={reduced ? 0 : 1} />
          {/* Image-based lighting generated in-engine: a warm sky dome over a
              green ground bounce. Real IBL without downloading an HDRI. */}
          <Environment resolution={128} frames={1}>
            <mesh scale={100}>
              <sphereGeometry args={[1, 24, 16]} />
              <meshBasicMaterial color="#9fd3ff" side={THREE.BackSide} />
            </mesh>
            <mesh position={[0, -40, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={140}>
              <planeGeometry />
              <meshBasicMaterial color="#2c4a1e" />
            </mesh>
            <mesh position={[34, 26, 18]} scale={16}>
              <sphereGeometry args={[1, 16, 12]} />
              <meshBasicMaterial color="#fff0cf" />
            </mesh>
          </Environment>
          {specimens.map((s, i) => {
            const spot = layout[i];
            if (!s.model || !spot) return null;
            const isSel = s.id === selected?.id;
            // A hero specimen is a real model; everything else grows procedurally.
            if (s.model.kind === 'glb') {
              return (
                <Suspense key={s.id} fallback={null}>
                  <SpecimenModel
                    url={s.model.url}
                    position={spot.pos}
                    rotation={spot.rot}
                    targetHeight={s.model.scale}
                    seed={i * 977 + 13}
                    wind={reduced ? 0 : isSel ? 1.1 : 0.6}
                    onClick={() => setSelectedId(s.id)}
                  />
                </Suspense>
              );
            }
            return (
              <TreeMesh
                key={s.id}
                params={s.model.params}
                seed={i * 977 + 13}
                growth={isSel ? growth : 1}
                season={season}
                position={spot.pos}
                rotation={spot.rot}
                radialSegments={tier.radial}
                wind={reduced ? 0 : isSel ? 1.25 : 0.7}
                onClick={() => setSelectedId(s.id)}
              />
            );
          })}
          {/* The realism pass. ACES filmic tone mapping is the single biggest
              lever available without assets — it turns clipped, plasticky
              highlights into film-like rolloff. N8AO grounds trunks in the grass
              and darkens the crown interior; SMAA cleans the alpha-tested leaf
              edges that otherwise shimmer. Tiered off on weak devices. */}
          {tier.post && (
            <EffectComposer enableNormalPass multisampling={0}>
              <N8AO aoRadius={1.6} intensity={2.4} distanceFalloff={0.9} quality="performance" halfRes />
              <Bloom intensity={0.42} luminanceThreshold={0.86} luminanceSmoothing={0.28} mipmapBlur />
              <SMAA />
              <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
              <Vignette offset={0.32} darkness={0.5} />
            </EffectComposer>
          )}
          <OrbitControls
            enablePan={false}
            minDistance={6}
            maxDistance={30}
            maxPolarAngle={Math.PI / 2 - 0.06}
            autoRotate={!reduced}
            autoRotateSpeed={0.22}
            target={[0, 3.2, 0]}
          />
        </Canvas>
      </div>

      {/* ── chrome ── */}
      <header className="fw-top">
        <button className="fw-back" onClick={onBack}><ArrowLeft size={14} /> Museion</button>
        <div className="fw-title">
          <span className="fw-eyebrow">The Living Forest</span>
          <h1>{meta.name}</h1>
          <span className="fw-latin">{meta.latin}</span>
        </div>
        <div className="fw-topright">
          <button className={`fw-icon ${audioOn ? 'on' : ''}`} onClick={toggleAudio}
            title={audioOn ? 'Silence the forest' : 'Let the forest in'}>
            {audioOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>
          {onOpenStudyRoom && (
            <button className="fw-icon" onClick={onOpenStudyRoom} title="The Study Room — cells, photosynthesis, microscopy">
              <BookOpen size={15} />
            </button>
          )}
        </div>
      </header>

      <nav className="fw-galleries">
        {galleries.map((g) => (
          <button key={g} className={`fw-gal ${g === gallery ? 'on' : ''}`}
            style={{ '--accent': GALLERY_META[g].accent } as React.CSSProperties}
            onClick={() => setGallery(g)}>
            <span className="fw-gal-name">{GALLERY_META[g].name}</span>
            <span className="fw-gal-lat">{GALLERY_META[g].latin}</span>
          </button>
        ))}
      </nav>

      {selected && (
        <aside className="fw-label">
          <div className="fw-label-head">
            <h2>{selected.commonName}</h2>
            <p className="fw-sci">{selected.sciName}</p>
          </div>
          <div className="fw-chips">
            <span className="fw-chip">{selected.family}</span>
            <span className="fw-chip ghost">{LINEAGE_LABEL[selected.lineage].split(' — ')[0]}</span>
            {selected.conservation && (
              <span className={`fw-chip iucn ${selected.conservation === 'LC' ? 'ok' : 'warn'}`}>
                {selected.conservation} · {CONSERVATION_LABEL[selected.conservation]}
              </span>
            )}
          </div>
          <p className="fw-story">{selected.story}</p>
          {selected.model?.kind === 'glb' && (
            <p className="fw-credit">Model: {selected.model.credit} · {selected.model.license}</p>
          )}
          <dl className="fw-stats">
            {selected.stats.height && <><dt>Height</dt><dd>{selected.stats.height}</dd></>}
            {selected.stats.lifespan && <><dt>Lifespan</dt><dd>{selected.stats.lifespan}</dd></>}
            <dt>Range</dt><dd>{selected.stats.range}</dd>
          </dl>

          <div className="fw-scrub">
            <label>
              <span className="fw-scrub-l"><Sprout size={12} /> Growth</span>
              <input type="range" min={0.04} max={1} step={0.01} value={growth}
                onChange={(e) => setGrowth(parseFloat(e.target.value))} />
              <span className="fw-scrub-v">{growth >= 1 ? 'mature' : `${Math.round(growth * 100)}%`}</span>
            </label>
            <label>
              <span className="fw-scrub-l">Season</span>
              <input type="range" min={0} max={1} step={0.01} value={season}
                onChange={(e) => setSeason(parseFloat(e.target.value))} />
              <span className="fw-scrub-v">{season < 0.5 ? 'summer' : 'autumn'}</span>
            </label>
          </div>
        </aside>
      )}

      <div className="fw-specimens">
        {specimens.map((s) => (
          <button key={s.id} className={`fw-spec ${s.id === selected?.id ? 'on' : ''}`}
            onClick={() => { setSelectedId(s.id); setGrowth(1); }}>
            <span className="fw-spec-common">{s.commonName}</span>
            <span className="fw-spec-sci">{s.sciName}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const CSS = `
.flora-wing{position:fixed;inset:0;background:#0a120c;color:#e7ece6;overflow:hidden;
  font-family:'Public Sans',system-ui,sans-serif}
.flora-wing .fw-stage{position:absolute;inset:0}
.flora-wing canvas{display:block}

.fw-top{position:absolute;top:0;left:0;right:0;display:flex;align-items:flex-start;gap:16px;
  padding:16px 20px;z-index:10;pointer-events:none;
  background:linear-gradient(180deg,rgba(6,12,8,.86),transparent)}
.fw-top > *{pointer-events:auto}
.fw-back{display:flex;align-items:center;gap:6px;background:rgba(12,22,14,.6);border:1px solid rgba(200,230,200,.16);
  color:rgba(231,236,230,.8);font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;
  padding:7px 12px;border-radius:999px;cursor:pointer;backdrop-filter:blur(8px);font-family:inherit}
.fw-back:hover{color:#fff;border-color:rgba(87,194,106,.5)}
.fw-title{flex:1;text-align:center}
.fw-eyebrow{display:block;font-size:9.5px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;
  color:rgba(184,230,160,.6)}
.fw-title h1{font-family:Fraunces,Georgia,serif;font-size:clamp(20px,3.4vw,32px);font-weight:600;
  margin:2px 0 0;letter-spacing:-.01em}
.fw-latin{font-family:Fraunces,Georgia,serif;font-style:italic;font-size:12.5px;color:rgba(232,220,192,.55)}
.fw-topright{display:flex;gap:8px}
.fw-icon{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;cursor:pointer;
  background:rgba(12,22,14,.6);border:1px solid rgba(200,230,200,.16);color:rgba(231,236,230,.75);
  backdrop-filter:blur(8px)}
.fw-icon:hover{color:#fff;border-color:rgba(87,194,106,.5)}
.fw-icon.on{color:#0a120c;background:#57c26a;border-color:#57c26a}

.fw-galleries{position:absolute;left:0;right:0;bottom:0;display:flex;gap:8px;justify-content:center;
  padding:14px 20px 16px;z-index:10;overflow-x:auto;
  background:linear-gradient(0deg,rgba(6,12,8,.9),transparent)}
.fw-gal{flex:none;background:rgba(12,22,14,.66);border:1px solid rgba(200,230,200,.14);border-radius:10px;
  padding:8px 14px;cursor:pointer;display:flex;flex-direction:column;gap:1px;backdrop-filter:blur(10px);
  font-family:inherit;text-align:left;border-bottom:2px solid transparent}
.fw-gal:hover{border-color:rgba(200,230,200,.3)}
.fw-gal.on{border-bottom-color:var(--accent);background:rgba(20,38,24,.85)}
.fw-gal-name{font-size:12px;font-weight:700;color:#e7ece6}
.fw-gal-lat{font-family:Fraunces,Georgia,serif;font-style:italic;font-size:10.5px;color:rgba(232,220,192,.5)}

.fw-label{position:absolute;left:20px;top:50%;transform:translateY(-50%);width:min(330px,32vw);
  background:rgba(10,20,13,.72);border:1px solid rgba(200,230,200,.14);border-radius:14px;
  padding:18px 20px;backdrop-filter:blur(18px) saturate(1.1);z-index:10;
  box-shadow:0 18px 50px rgba(0,0,0,.5);max-height:74vh;overflow-y:auto}
.fw-label-head h2{font-family:Fraunces,Georgia,serif;font-size:22px;font-weight:600;margin:0;line-height:1.15}
.fw-sci{font-family:Fraunces,Georgia,serif;font-style:italic;font-size:14px;color:rgba(232,220,192,.66);margin:2px 0 0}
.fw-chips{display:flex;flex-wrap:wrap;gap:5px;margin:12px 0 10px}
.fw-chip{font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:3px 8px;
  border-radius:4px;background:rgba(87,194,106,.14);color:#8fd8a0}
.fw-chip.ghost{background:rgba(232,220,192,.1);color:rgba(232,220,192,.75)}
.fw-chip.iucn.ok{background:rgba(87,194,106,.14);color:#8fd8a0}
.fw-chip.iucn.warn{background:rgba(255,179,71,.15);color:#ffc077}
.fw-story{font-size:13.5px;line-height:1.65;color:rgba(231,236,230,.72);margin:0}
.fw-credit{font-size:10px;color:rgba(231,236,230,.4);margin:10px 0 0;line-height:1.45}
.fw-stats{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;margin:14px 0 0;font-size:12px}
.fw-stats dt{color:rgba(231,236,230,.4);font-weight:600;font-size:9.5px;letter-spacing:.12em;
  text-transform:uppercase;align-self:center}
.fw-stats dd{margin:0;color:rgba(231,236,230,.85)}
.fw-scrub{margin-top:16px;padding-top:14px;border-top:1px solid rgba(200,230,200,.1);display:flex;
  flex-direction:column;gap:10px}
.fw-scrub label{display:flex;align-items:center;gap:9px}
.fw-scrub-l{display:flex;align-items:center;gap:5px;font-size:9.5px;font-weight:700;letter-spacing:.12em;
  text-transform:uppercase;color:rgba(184,230,160,.75);width:74px;flex:none}
.fw-scrub input[type=range]{flex:1;accent-color:#57c26a;min-width:0}
.fw-scrub-v{font-family:'JetBrains Mono',monospace;font-size:10px;color:rgba(231,236,230,.6);
  width:52px;text-align:right;font-variant-numeric:tabular-nums}

.fw-specimens{position:absolute;right:20px;top:50%;transform:translateY(-50%);display:flex;
  flex-direction:column;gap:6px;z-index:10;max-height:70vh;overflow-y:auto}
.fw-spec{background:rgba(10,20,13,.62);border:1px solid rgba(200,230,200,.12);border-right:3px solid transparent;
  border-radius:9px;padding:8px 12px;cursor:pointer;text-align:right;backdrop-filter:blur(10px);
  display:flex;flex-direction:column;gap:1px;font-family:inherit;min-width:150px}
.fw-spec:hover{border-color:rgba(200,230,200,.28)}
.fw-spec.on{border-right-color:#57c26a;background:rgba(22,42,26,.85)}
.fw-spec-common{font-size:12px;font-weight:700;color:#e7ece6}
.fw-spec-sci{font-family:Fraunces,Georgia,serif;font-style:italic;font-size:10.5px;color:rgba(232,220,192,.55)}

@media (max-width:860px){
  .fw-label{left:12px;right:12px;width:auto;top:auto;bottom:96px;transform:none;max-height:40vh}
  .fw-specimens{display:none}
}
@media (prefers-reduced-motion:reduce){.flora-wing *{transition:none!important;animation:none!important}}
`;

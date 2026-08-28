import React, { useState, useRef, Suspense, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useTexture } from '@react-three/drei';
import { EffectComposer, Bloom, ToneMapping, SMAA, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { ELEMENTS, orbitalPosition, orbitPath, AXIAL_TILT, ROTATION_PERIOD } from './museion/orrery/orbits';
import Atmosphere, { ATMOSPHERES } from './museion/orrery/Atmosphere';
import Starfield from './museion/orrery/Starfield';
import CameraRig from './museion/orrery/CameraRig';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Info, Camera, Layers, Zap, Sparkles, Volume2, VolumeX, Brain, Newspaper, Orbit } from 'lucide-react';
import { generatePlanetInsight } from '../services/geminiService';

// ─── Textures ────────────────────────────────────────────────────────────────
// ALL SELF-HOSTED. These were hot-linked to the three.js repo, which removed the
// files, so most of the solar system silently rendered as untextured spheres in
// production. Nothing here may point at another origin: an external host is free
// to delete, rename or rate-limit at any time, and the failure is invisible
// until someone opens the module.
const TX = {
  sun:          '/textures/solar/2k_sun.jpg',
  mercury:      '/textures/solar/2k_mercury.jpg',
  venus:        '/textures/solar/2k_venus_atmosphere.jpg',
  earthDay:     '/textures/solar/earth_atmos_2048.jpg',
  earthNight:   '/textures/solar/earth_lights_2048.png',
  earthClouds:  '/textures/solar/earth_clouds_1024.png',
  earthNormal:  '/textures/solar/earth_normal_2048.jpg',
  earthSpec:    '/textures/solar/earth_specular_2048.jpg',
  mars:         '/textures/solar/2k_mars.jpg',
  jupiter:      '/textures/solar/2k_jupiter.jpg',
  saturn:       '/textures/solar/2k_saturn.jpg',
  saturnRing:   '/textures/solar/2k_saturn_ring_alpha.png',
  uranus:       '/textures/solar/2k_uranus.jpg',
  neptune:      '/textures/solar/2k_neptune.jpg',
};

// ─── Planet Data ─────────────────────────────────────────────────────────────
const PLANET_DATA = [
  {
    name: 'Sun', type: 'Star', color: '#FDB813', size: 2.2, distance: 0, speed: 0,
    description: 'The Sun is a G-type main-sequence star — a hot ball of plasma sustained by nuclear fusion. Its 15-million-°C core converts 620 million tonnes of hydrogen to helium per second. The heliosphere it generates extends beyond Neptune, shielding the solar system from interstellar radiation.',
    facts: ['Contains 99.86% of the solar system\'s total mass', 'Light takes 8 minutes 20 seconds to reach Earth', '4.6 billion years old — halfway through its main-sequence lifetime'],
    stats: { temp: '5,500°C surface / 15M°C core', diameter: '1,392,000 km', type: 'G2V Yellow Dwarf', gravity: '274 m/s²', moons: '0', dayLength: '25 Earth days', yearLength: '225 million yrs (galactic)' },
    probes: ['Parker Solar Probe', 'SOHO', 'Solar Orbiter'],
    gallery: [
      'https://upload.wikimedia.org/wikipedia/commons/b/b4/The_Sun_by_the_Atmospheric_Imaging_Assembly_of_NASA%27s_Solar_Dynamics_Observatory_-_20100819.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/1/1c/Solar_Orbiter%27s_first_view_of_the_Sun.jpg',
    ],
  },
  {
    name: 'Mercury', type: 'Terrestrial', color: '#A5A5A5', size: 0.38, distance: 4.5, speed: 1.6,
    description: 'Mercury is the smallest planet and closest to the Sun, orbiting in just 88 Earth days. Without a significant atmosphere, temperatures swing from +430°C in sunlight to −180°C in darkness. MESSENGER discovered water ice locked inside permanently shadowed polar craters.',
    facts: ['Its iron core is 85% of its radius — disproportionately massive', 'A Mercurian day (176 Earth days) is longer than its year', 'BepiColombo is scheduled for orbital insertion in 2026'],
    stats: { temp: '+430°C / −180°C', diameter: '4,879 km', type: 'Terrestrial', gravity: '3.7 m/s²', moons: '0', dayLength: '59 Earth days', yearLength: '88 Earth days' },
    probes: ['MESSENGER', 'BepiColombo'],
    gallery: [
      'https://upload.wikimedia.org/wikipedia/commons/4/4a/Mercury_in_color_-_Prockter07-centered.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/3/30/Mercury_MDIS_basemap_LOI_global_mosaic_166m.jpg',
    ],
  },
  {
    name: 'Venus', type: 'Terrestrial', color: '#E3BB76', size: 0.95, distance: 6.5, speed: 1.15,
    description: 'Venus is Earth\'s twin in size but a hellish world. Its thick CO₂ atmosphere traps heat in a runaway greenhouse effect — hotter than Mercury despite being farther from the Sun. It rotates backwards so slowly that a Venusian day is longer than its year.',
    facts: ['Surface pressure is 92× Earth\'s — equivalent to 900m underwater', 'Rotates retrograde: the Sun rises in the west', 'JAXA\'s Akatsuki detected massive atmospheric bow waves'],
    stats: { temp: '465°C (constant)', diameter: '12,104 km', type: 'Terrestrial', gravity: '8.87 m/s²', moons: '0', dayLength: '243 Earth days', yearLength: '225 Earth days' },
    probes: ['Magellan', 'Akatsuki', 'EnVision (planned 2031)'],
    gallery: [
      'https://upload.wikimedia.org/wikipedia/commons/e/e5/Venus-real_color.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/a/a9/PIA23791-Venus-RealAndEnhancedColor-20200211_%28cropped%29.jpg',
    ],
  },
  {
    name: 'Earth', type: 'Terrestrial', color: '#2271B3', size: 1.0, distance: 9, speed: 1.0,
    description: 'Earth is the only world known to harbor life. Plate tectonics continuously recycle its crust, the Moon stabilizes its axial tilt creating stable seasons, and liquid water covers 71% of its surface. A thin atmosphere of nitrogen and oxygen protects life from solar radiation.',
    facts: ['Only planet with an active hydrological cycle on its surface', 'Magnetic field deflects solar wind, protecting the atmosphere', 'The Moon likely formed from a giant impact 4.5 billion years ago'],
    stats: { temp: '15°C average', diameter: '12,742 km', type: 'Terrestrial', gravity: '9.81 m/s²', moons: '1 (Moon)', dayLength: '24 hours', yearLength: '365.25 days' },
    probes: ['Terra', 'Aqua', 'DSCOVR', 'Sentinel series'],
    gallery: [
      'https://upload.wikimedia.org/wikipedia/commons/9/97/The_Earth_seen_from_Apollo_17.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/b/b4/The_Blue_Marble_%28remastered%29.jpg',
    ],
  },
  {
    name: 'Mars', type: 'Terrestrial', color: '#E27B58', size: 0.55, distance: 12, speed: 0.78,
    description: 'Mars is a cold desert world with evidence of a wetter, warmer past. Olympus Mons — at 21.9 km — is the tallest volcano in the solar system. NASA\'s Perseverance rover is actively caching rock samples for a future Earth return mission.',
    facts: ['Olympus Mons is 3× the height of Mount Everest', 'Subsurface radar found possible briny water under south polar ice', 'Ingenuity helicopter completed 72 flights — far exceeding its 5-flight design'],
    stats: { temp: '−63°C average', diameter: '6,779 km', type: 'Terrestrial', gravity: '3.72 m/s²', moons: '2 (Phobos, Deimos)', dayLength: '24h 37m', yearLength: '687 Earth days' },
    probes: ['Perseverance', 'Curiosity', 'Ingenuity', 'MRO', 'MAVEN'],
    gallery: [
      'https://upload.wikimedia.org/wikipedia/commons/0/02/OSIRIS_Mars_true_color.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/5/56/Mars_Valles_Marineris.jpg',
    ],
  },
  {
    name: 'Jupiter', type: 'Gas Giant', color: '#D39C7E', size: 1.85, distance: 16.5, speed: 0.48,
    description: 'Jupiter is the solar system\'s colossus — more than twice as massive as all other planets combined. Its Great Red Spot is a storm that has raged for over 350 years. Europa harbors a global subsurface ocean beneath its icy crust, making it one of the most promising places to search for life.',
    facts: ['The Great Red Spot is 1.3× the diameter of Earth', 'Europa has more liquid water than all Earth\'s oceans combined', 'Juno spacecraft discovered massive cyclones at both poles'],
    stats: { temp: '−110°C cloud tops', diameter: '139,820 km', type: 'Gas Giant', gravity: '24.79 m/s²', moons: '95 confirmed', dayLength: '9.9 hours', yearLength: '11.9 Earth years' },
    probes: ['Juno', 'Galileo', 'Europa Clipper (en route)'],
    gallery: [
      'https://upload.wikimedia.org/wikipedia/commons/2/2b/Jupiter_and_its_shrunken_Great_Red_Spot.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/e/e1/Jupiter_by_Cassini-Huygens.jpg',
    ],
  },
  {
    name: 'Saturn', type: 'Gas Giant', color: '#C5AB6E', size: 1.55, distance: 21.5, speed: 0.3,
    description: 'Saturn\'s ring system spans 282,000 km but is only ~10 meters thick — composed of ice and rock particles. Titan, its largest moon, has a dense nitrogen atmosphere with methane lakes and rain — the only moon with a significant atmosphere and the only world besides Earth with stable surface liquids.',
    facts: ['Saturn is the least dense planet — it would float on water', 'Titan\'s methane rain cycle mirrors Earth\'s water cycle', 'Cassini-Huygens orbited for 13 years before a planned dive into Saturn'],
    stats: { temp: '−140°C cloud tops', diameter: '116,460 km', type: 'Gas Giant', gravity: '10.44 m/s²', moons: '146 confirmed', dayLength: '10.7 hours', yearLength: '29.4 Earth years' },
    probes: ['Cassini-Huygens', 'Pioneer 11', 'Voyager 1 & 2'],
    gallery: [
      'https://upload.wikimedia.org/wikipedia/commons/c/c7/Saturn_during_Equinox.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/b/b4/Saturn%27s_rings_dark_side_Mosaic.jpg',
    ],
  },
  {
    name: 'Uranus', type: 'Ice Giant', color: '#B5D5D5', size: 1.2, distance: 26, speed: 0.2,
    description: 'Uranus is the solar system\'s oddity — tilted 98° on its side, it rolls around the Sun rather than spinning upright. Its pale blue-green color comes from methane ice in the upper atmosphere. Seasons last 21 years. Its magnetic poles are severely misaligned with its spin axis.',
    facts: ['Rotational axis nearly parallel to its orbital plane', 'Both magnetic poles are displaced from the geographic poles', 'First planet confirmed via telescope — William Herschel, 1781'],
    stats: { temp: '−195°C', diameter: '50,724 km', type: 'Ice Giant', gravity: '8.87 m/s²', moons: '28 known', dayLength: '17.2 hours', yearLength: '84 Earth years' },
    probes: ['Voyager 2 (1986)'],
    gallery: [
      'https://upload.wikimedia.org/wikipedia/commons/3/3d/Uranus2.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/b/bb/Uranus_rings.jpg',
    ],
  },
  {
    name: 'Neptune', type: 'Ice Giant', color: '#4B70DD', size: 1.1, distance: 30.5, speed: 0.14,
    description: 'Neptune is the most distant major planet — 30× farther from the Sun than Earth. Its winds, exceeding 2,100 km/h, are the fastest in the solar system. Triton, its largest moon, orbits backwards and is thought to be a captured Kuiper Belt object with active nitrogen geysers.',
    facts: ['Winds up to 2,100 km/h — fastest in the solar system', 'Triton has nitrogen geysers erupting from its surface', 'Neptune completed its first full orbit since discovery in 2011'],
    stats: { temp: '−201°C', diameter: '49,244 km', type: 'Ice Giant', gravity: '11.15 m/s²', moons: '16 known', dayLength: '16.1 hours', yearLength: '165 Earth years' },
    probes: ['Voyager 2 (1989)'],
    gallery: [
      'https://upload.wikimedia.org/wikipedia/commons/5/56/Neptune_Full.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/0/06/Neptune_Atmosphere.jpg',
    ],
  },
];

type PlanetData = typeof PLANET_DATA[0];

const PROBE_DB: Record<string, { launched: string; status: string; desc: string }> = {
  'Parker Solar Probe': { launched: '2018', status: 'Solar Orbit', desc: 'Diving through the Sun\'s corona — humanity\'s closest-ever approach to a star.' },
  'SOHO': { launched: '1995', status: 'L1 Orbit', desc: '30 years of continuous solar monitoring from the L1 Lagrange point.' },
  'Solar Orbiter': { launched: '2020', status: 'Solar Orbit', desc: 'ESA/NASA mission providing unprecedented close-up views of the Sun\'s poles.' },
  'MESSENGER': { launched: '2004', status: 'Mission Complete', desc: 'First Mercury orbiter — discovered water ice in shadowed polar craters.' },
  'BepiColombo': { launched: '2018', status: 'Mercury Approach', desc: 'ESA/JAXA joint mission — orbital insertion at Mercury planned 2026.' },
  'Magellan': { launched: '1989', status: 'Mission Complete', desc: 'Radar-mapped 98% of Venus\'s surface through its thick cloud cover.' },
  'Akatsuki': { launched: '2010', status: 'Venus Orbit', desc: 'JAXA climate orbiter studying Venus\'s atmosphere and weather systems.' },
  'Terra': { launched: '1999', status: 'Earth Orbit', desc: 'Long-term Earth observation — monitoring climate, land, and ocean changes.' },
  'DSCOVR': { launched: '2015', status: 'L1 Orbit', desc: 'Deep Space Climate Observatory — daily full-disk Earth images and solar wind data.' },
  'Perseverance': { launched: '2020', status: 'Mars Surface', desc: 'Searching for ancient life, caching rock samples for future return mission.' },
  'Curiosity': { launched: '2011', status: 'Mars Surface', desc: 'Exploring Gale Crater — found organic molecules and ancient habitable conditions.' },
  'Ingenuity': { launched: '2020', status: 'Mars Surface', desc: 'First powered flight on another world — completed 72 flights, far exceeding its 5-flight design.' },
  'MRO': { launched: '2005', status: 'Mars Orbit', desc: 'Mars Reconnaissance Orbiter — highest-resolution imaging of the Martian surface.' },
  'Juno': { launched: '2011', status: 'Jupiter Orbit', desc: 'Mapping Jupiter\'s interior, magnetic field, and polar cyclone systems.' },
  'Europa Clipper': { launched: '2024', status: 'En Route', desc: 'Dedicated mission to assess Europa\'s subsurface ocean habitability.' },
  'Cassini-Huygens': { launched: '1997', status: 'Mission Complete', desc: '13-year Saturn orbiter — discovered Enceladus geysers and Titan\'s methane lakes.' },
  'Voyager 2': { launched: '1977', status: 'Interstellar Space', desc: 'Only spacecraft to visit all four outer planets — entered interstellar space 2018.' },
  'Voyager 1': { launched: '1977', status: 'Interstellar Space', desc: 'Most distant human-made object — crossed the heliopause in 2012.' },
};

const SPACE_NEWS = [
  { title: 'Europa Clipper Crosses the Asteroid Belt', source: 'NASA JPL', date: '2025', excerpt: 'Spacecraft transmitted first science data while traversing the asteroid belt en route to Jupiter.' },
  { title: 'BepiColombo\'s Final Mercury Flyby', source: 'ESA', date: '2025', excerpt: 'Penultimate flyby complete before orbital insertion in 2026 — closest Mercury images ever captured.' },
  { title: 'Perseverance Completes Sample Depot', source: 'NASA', date: '2025', excerpt: '23 scientifically selected rock cores cached in Jezero Crater for future Earth return.' },
  { title: 'Record Solar Storm — G5 Class', source: 'NOAA', date: '2024', excerpt: 'Strongest geomagnetic storm in 20 years produced auroras visible at tropical latitudes.' },
];

// One Earth year per this many seconds of wall clock. Slow enough that the inner
// planets don't strobe, fast enough that Jupiter visibly moves while you watch.
const YEARS_PER_SECOND = 1 / 26;

// ─── 3D Components ────────────────────────────────────────────────────────────

const SunBody = ({ onSelect }: { onSelect: () => void }) => {
  const ref = useRef<THREE.Mesh>(null);
  const texture = useTexture(TX.sun);

  useEffect(() => {
    if (texture) { texture.anisotropy = 8; texture.needsUpdate = true; }
  }, [texture]);

  useFrame(() => { if (ref.current) ref.current.rotation.y += 0.0012; });

  return (
    <group>
      <mesh ref={ref} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
        <sphereGeometry args={[2.2, 64, 64]} />
        <meshStandardMaterial map={texture} emissive="#FF7700" emissiveMap={texture} emissiveIntensity={1.6} roughness={1} metalness={0} />
      </mesh>
      {/* Corona layers */}
      <mesh>
        <sphereGeometry args={[2.55, 32, 32]} />
        <meshBasicMaterial color="#FF9900" opacity={0.13} transparent side={THREE.BackSide} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[3.3, 32, 32]} />
        <meshBasicMaterial color="#FF6600" opacity={0.055} transparent side={THREE.BackSide} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[4.8, 32, 32]} />
        <meshBasicMaterial color="#FF4400" opacity={0.02} transparent side={THREE.BackSide} depthWrite={false} />
      </mesh>
      <pointLight intensity={4.5} color="#FFF5C0" decay={2} castShadow />
    </group>
  );
};

const EarthBody = ({ onSelect }: { onSelect: () => void }) => {
  const sphereRef = useRef<THREE.Mesh>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);
  const [dayMap, cloudsMap, normalMap, specMap] = useTexture([TX.earthDay, TX.earthClouds, TX.earthNormal, TX.earthSpec]);

  useEffect(() => {
    [dayMap, cloudsMap, normalMap, specMap].forEach(t => { if (t) { t.anisotropy = 16; t.needsUpdate = true; } });
  }, [dayMap, cloudsMap, normalMap, specMap]);

  useFrame(() => {
    if (sphereRef.current) sphereRef.current.rotation.y += 0.003;
    if (cloudsRef.current) cloudsRef.current.rotation.y += 0.0033;
  });

  return (
    <group>
      <mesh ref={sphereRef} onClick={(e) => { e.stopPropagation(); onSelect(); }} castShadow receiveShadow>
        <sphereGeometry args={[1.0, 64, 64]} />
        <meshStandardMaterial map={dayMap} normalMap={normalMap} metalnessMap={specMap} roughness={0.75} metalness={0.1} />
      </mesh>
      <mesh ref={cloudsRef}>
        <sphereGeometry args={[1.016, 64, 64]} />
        <meshStandardMaterial map={cloudsMap} transparent opacity={0.55} depthWrite={false} roughness={1} />
      </mesh>
      {/* Atmosphere halo */}
      <mesh>
        <sphereGeometry args={[1.065, 32, 32]} />
        <meshBasicMaterial color="#4FA8FF" opacity={0.09} transparent side={THREE.BackSide} depthWrite={false} />
      </mesh>
    </group>
  );
};

// Saturn's rings, with the planet's shadow falling across them.
//
// Rings lit evenly all the way round are the most obvious tell in an amateur
// solar system: in every real image Saturn throws a hard dark band across the
// far side of its own rings. The test is cheap — a ring point is shadowed when
// it lies behind the planet along the sun direction and within a planet-radius
// of that axis, which is just a cylinder test in ring space.
const SaturnRings = ({ ringMap, planetRadius, sunDir }: {
  ringMap: THREE.Texture | null; planetRadius: number; sunDir: THREE.Vector3;
}) => {
  const uniforms = useMemo(() => ({
    uSun: { value: new THREE.Vector3(1, 0, 0) },
    uPlanetR: { value: planetRadius },
  }), [planetRadius]);

  useFrame(() => { uniforms.uSun.value.copy(sunDir); });

  const onBeforeCompile = useMemo(() => (shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uSun = uniforms.uSun;
    shader.uniforms.uPlanetR = uniforms.uPlanetR;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', ['#include <common>', 'varying vec3 vRingPos;'].join('\n'))
      .replace('#include <begin_vertex>', ['#include <begin_vertex>', 'vRingPos = position;'].join('\n'));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', [
        '#include <common>',
        'uniform vec3 uSun;',
        'uniform float uPlanetR;',
        'varying vec3 vRingPos;',
      ].join('\n'))
      .replace('#include <dithering_fragment>', [
        '#include <dithering_fragment>',
        '// Split the ring point into components along and across the sun',
        '// direction. Behind the planet AND within a planet radius of that',
        '// axis means the planet is between this point and the Sun.',
        'float along = dot(vRingPos, uSun);',
        'float across = length(vRingPos - uSun * along);',
        'float shadow = (along < 0.0) ? smoothstep(uPlanetR, uPlanetR * 0.82, across) : 0.0;',
        'gl_FragColor.rgb *= mix(1.0, 0.16, shadow);',
      ].join('\n'));
  }, [uniforms]);

  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <mesh receiveShadow>
        <ringGeometry args={[2.05, 3.65, 192]} />
        <meshBasicMaterial
          map={ringMap ?? undefined}
          color="#D4B896"
          side={THREE.DoubleSide}
          transparent
          opacity={0.88}
          depthWrite={false}
          onBeforeCompile={onBeforeCompile}
        />
      </mesh>
      <mesh>
        <ringGeometry args={[3.65, 4.3, 192]} />
        <meshBasicMaterial
          color="#C4A060"
          side={THREE.DoubleSide}
          transparent
          opacity={0.18}
          depthWrite={false}
          onBeforeCompile={onBeforeCompile}
        />
      </mesh>
    </group>
  );
};

const SaturnBody = ({ onSelect, worldPos }: { onSelect: () => void; worldPos: [number, number, number] }) => {
  const ref = useRef<THREE.Mesh>(null);
  const [saturnMap, ringMap] = useTexture([TX.saturn, TX.saturnRing]);
  const air = ATMOSPHERES.Saturn;

  useEffect(() => {
    [saturnMap, ringMap].forEach(t => { if (t) { t.anisotropy = 16; t.needsUpdate = true; } });
  }, [saturnMap, ringMap]);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y =
      (clock.getElapsedTime() * YEARS_PER_SECOND * 365.25 * Math.PI * 2) / ROTATION_PERIOD.Saturn;
  });

  // Direction from Saturn to the Sun in the planet's own frame. The Sun is at
  // the origin, so this is simply the negated world position.
  const sunDir = useMemo(() => new THREE.Vector3(1, 0, 0), []);
  useFrame(() => {
    sunDir.set(-worldPos[0], -worldPos[1], -worldPos[2]);
    if (sunDir.lengthSq() < 1e-9) sunDir.set(1, 0, 0);
    sunDir.normalize();
  });

  return (
    <group rotation={[0, 0, AXIAL_TILT.Saturn]}>
      <mesh ref={ref} onClick={(e) => { e.stopPropagation(); onSelect(); }} castShadow>
        <sphereGeometry args={[1.55, 64, 64]} />
        <meshStandardMaterial map={saturnMap} roughness={0.9} metalness={0.05} />
      </mesh>
      <Atmosphere
        radius={1.55}
        color={air.color}
        thickness={air.thickness}
        falloff={air.falloff}
        intensity={air.intensity}
        sunPosition={[-worldPos[0], -worldPos[1], -worldPos[2]]}
      />
      <SaturnRings ringMap={ringMap ?? null} planetRadius={1.55} sunDir={sunDir} />
    </group>
  );
};

const GENERIC_TEXTURE_MAP: Record<string, string> = {
  Mercury: TX.mercury, Venus: TX.venus, Mars: TX.mars,
  Jupiter: TX.jupiter, Uranus: TX.uranus, Neptune: TX.neptune,
};

const GenericPlanetBody = ({ data, onSelect, worldPos }: {
  data: PlanetData; onSelect: () => void; worldPos: [number, number, number];
}) => {
  const ref = useRef<THREE.Mesh>(null);
  const texture = useTexture(GENERIC_TEXTURE_MAP[data.name] || TX.mercury);
  const air = ATMOSPHERES[data.name];

  useEffect(() => { if (texture) { texture.anisotropy = 16; texture.needsUpdate = true; } }, [texture]);

  // Spin at the planet's REAL rate, on the same clock the orbits use, so a
  // Venusian day really does outlast a Venusian year and Venus really does turn
  // backwards. Spinning every planet at one arbitrary speed throws away the most
  // teachable fact several of them have.
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const days = ROTATION_PERIOD[data.name] ?? 1;
    ref.current.rotation.y = (clock.getElapsedTime() * YEARS_PER_SECOND * 365.25 * Math.PI * 2) / days;
  });

  return (
    <group rotation={[0, 0, AXIAL_TILT[data.name] ?? 0]}>
      <mesh ref={ref} onClick={(e) => { e.stopPropagation(); onSelect(); }} castShadow receiveShadow>
        <sphereGeometry args={[data.size, 64, 64]} />
        <meshStandardMaterial map={texture} roughness={0.85} metalness={0.05} />
      </mesh>
      {/* The limb glow, which is what makes a sphere read as a world. Mercury
          is airless and correctly gets none. */}
      {air && (
        <Atmosphere
          radius={data.size}
          color={air.color}
          thickness={air.thickness}
          falloff={air.falloff}
          intensity={air.intensity}
          sunPosition={[-worldPos[0], -worldPos[1], -worldPos[2]]}
        />
      )}
    </group>
  );
};

// ─── Asteroid Belt ────────────────────────────────────────────────────────────
const AsteroidBelt = () => {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const COUNT = 900;

  useEffect(() => {
    if (!ref.current) return;
    for (let i = 0; i < COUNT; i++) {
      const angle = (i / COUNT) * Math.PI * 2 + Math.random() * 0.35;
      const radius = 13.8 + Math.random() * 1.8;
      dummy.position.set(Math.cos(angle) * radius, (Math.random() - 0.5) * 0.28, Math.sin(angle) * radius);
      dummy.scale.setScalar(Math.random() * 0.04 + 0.006);
      dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  }, [dummy]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, COUNT]}>
      <dodecahedronGeometry args={[0.06, 0]} />
      <meshStandardMaterial color="#7A6848" roughness={1} metalness={0.1} />
    </instancedMesh>
  );
};

// ─── Error Boundary ───────────────────────────────────────────────────────────
class PEB extends React.Component<{ children: React.ReactNode; fallback: React.ReactNode }, { err: boolean }> {
  constructor(props: any) { super(props); this.state = { err: false }; }
  static getDerivedStateFromError() { return { err: true }; }
  render() { return this.state.err ? this.props.fallback : this.props.children; }
}

const FallbackSphere = ({ data }: { data: PlanetData }) => {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => { if (ref.current) ref.current.rotation.y += 0.008; });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[data.size, 32, 32]} />
      <meshStandardMaterial color={data.color} emissive={data.name === 'Sun' ? data.color : '#000'} emissiveIntensity={data.name === 'Sun' ? 1.5 : 0} />
    </mesh>
  );
};

// ─── Orbiting Wrapper ─────────────────────────────────────────────────────────
const OrbitingPlanet = ({ data, onSelect, isSelected, onPose }: {
  data: PlanetData; onSelect: (n: string) => void; isSelected: boolean;
  onPose?: (name: string, p: THREE.Vector3) => void;
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const el = ELEMENTS[data.name];

  useFrame(({ clock }) => {
    const g = groupRef.current;
    if (!g) return;
    if (data.distance === 0 || !el) {
      onPose?.(data.name, g.position);
      return;
    }
    // REAL KEPLERIAN MOTION. The planet traces its true ellipse on its true
    // orbital plane, and — because the Sun sits at a focus rather than the
    // centre — it genuinely accelerates through perihelion. That change of pace
    // is most of what separates a solar system from a carousel.
    const t = clock.getElapsedTime() * YEARS_PER_SECOND;
    const [x, y, z] = orbitalPosition(el, data.distance, t);
    g.position.set(x, y, z);
    onPose?.(data.name, g.position);
  });

  const sel = () => onSelect(data.name);
  const fb = <FallbackSphere data={data} />;

  // Sampled once per render rather than per frame: it only steers the direction
  // of a terminator and a ring shadow, both of which turn far too slowly for the
  // update rate to be visible — and a per-frame React update here would cost
  // more than the entire scene.
  const [wp, setWp] = useState<[number, number, number]>([data.distance, 0, 0]);
  useEffect(() => {
    const id = setInterval(() => {
      const g = groupRef.current;
      if (g) setWp([g.position.x, g.position.y, g.position.z]);
    }, 400);
    return () => clearInterval(id);
  }, []);

  const body =
    data.name === 'Sun'    ? <SunBody onSelect={sel} /> :
    data.name === 'Earth'  ? <EarthBody onSelect={sel} /> :
    data.name === 'Saturn' ? <SaturnBody onSelect={sel} worldPos={wp} /> :
                             <GenericPlanetBody data={data} onSelect={sel} worldPos={wp} />;

  return (
    <group ref={groupRef}>
      {isSelected && data.name !== 'Sun' && (
        <mesh>
          <sphereGeometry args={[data.size * 1.45, 32, 32]} />
          <meshBasicMaterial color="#FFFFFF" opacity={0.04} transparent side={THREE.BackSide} />
        </mesh>
      )}
      <PEB fallback={fb}>
        <Suspense fallback={fb}>{body}</Suspense>
      </PEB>
    </group>
  );
};

// ─── Orbit Paths ──────────────────────────────────────────────────────────────
// Traced from the same mechanics that move the planets, so a planet can never
// drift off the line drawn for it — these were flat concentric rings, which sat
// wrong under every inclined orbit and made the system look like a target.
const OrbitLine = ({ name, distance, highlight }: { name: string; distance: number; highlight: boolean }) => {
  const geometry = useMemo(() => {
    const el = ELEMENTS[name];
    if (!el) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(orbitPath(el, distance, 512), 3));
    return g;
  }, [name, distance]);

  useEffect(() => () => { geometry?.dispose(); }, [geometry]);
  if (!geometry) return null;

  return (
    <line>
      <primitive object={geometry} attach="geometry" />
      <lineBasicMaterial
        color={highlight ? '#9FD4FF' : '#8899BB'}
        transparent
        opacity={highlight ? 0.5 : 0.13}
        depthWrite={false}
      />
    </line>
  );
};

const OrbitRings = ({ selected }: { selected: string }) => (
  <group>
    {PLANET_DATA.filter(p => p.distance > 0).map(p => (
      <OrbitLine key={p.name} name={p.name} distance={p.distance} highlight={p.name === selected} />
    ))}
  </group>
);

// ─── Full Scene ───────────────────────────────────────────────────────────────
const Scene = ({ selected, setSelected, tourEnabled }: {
  selected: string; setSelected: (n: string) => void; tourEnabled: boolean;
}) => {
  // Live positions, kept in a ref rather than state: the camera rig reads them
  // every frame, and routing that through React would re-render the whole scene
  // sixty times a second.
  const poses = useRef<Record<string, THREE.Vector3>>({});
  const targetRef = useRef<THREE.Vector3 | null>(null);
  const [arrived, setArrived] = useState(true);

  const onPose = useMemo(() => (name: string, p: THREE.Vector3) => {
    const store = poses.current[name] ?? (poses.current[name] = new THREE.Vector3());
    store.copy(p);
  }, []);

  const selectedData = PLANET_DATA.find(p => p.name === selected) ?? PLANET_DATA[0];
  targetRef.current = poses.current[selected] ?? null;

  useEffect(() => { setArrived(false); }, [selected]);

  return (
    <>
      {/* Deep space is not lit, but a scene with literally zero fill reads as
          cut-out silhouettes rather than as night. */}
      <ambientLight intensity={0.05} />

      {/* The real sky, with the Milky Way in it. */}
      <Starfield radius={620} intensity={0.5} sparkleCount={1400} />

      <OrbitRings selected={selected} />
      <AsteroidBelt />
      {PLANET_DATA.map(p => (
        <OrbitingPlanet
          key={p.name}
          data={p}
          onSelect={setSelected}
          isSelected={selected === p.name}
          onPose={onPose}
        />
      ))}

      {/* Fly to whatever was selected, then hand control back. */}
      {tourEnabled && (
        <CameraRig
          target={targetRef.current}
          targetRadius={selectedData.size}
          targetKey={selected}
          framing={selected === 'Sun' ? 6.5 : 4.5}
          onArrive={() => setArrived(true)}
        />
      )}

      <OrbitControls
        makeDefault
        enablePan
        maxDistance={200}
        minDistance={2}
        enableDamping
        dampingFactor={0.06}
        // Don't fight the rig mid-flight; the user takes over on arrival.
        enabled={arrived || !tourEnabled}
      />
    </>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const SolarSystemModule: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [selected, setSelected] = useState('Earth');
  const [tab, setTab] = useState<'OVERVIEW' | 'STATS' | 'GALLERY' | 'PROBES' | 'AI'>('OVERVIEW');
  const [showNews, setShowNews] = useState(false);
  const [muted, setMuted] = useState(false);
  // Cinematic tour: fly to whatever is selected. On by default, because the
  // module's whole point is looking AT things — but a visitor who wants to
  // stay put and drive the camera themselves can switch it off.
  const [tour, setTour] = useState(true);
  const [aiInsight, setAiInsight] = useState<{ summary: string; fact: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const planet = useMemo(() => PLANET_DATA.find(p => p.name === selected) || PLANET_DATA[3], [selected]);

  useEffect(() => {
    setAiLoading(true);
    setAiInsight(null);
    generatePlanetInsight(selected).then(insight => { setAiInsight(insight); setAiLoading(false); });
  }, [selected]);

  const TABS = [
    { id: 'OVERVIEW', icon: Info },
    { id: 'AI', icon: Brain },
    { id: 'STATS', icon: Layers },
    { id: 'GALLERY', icon: Camera },
    { id: 'PROBES', icon: Zap },
  ] as const;

  return (
    <div className="fixed inset-0 z-[1000] bg-black text-white flex flex-col overflow-hidden">
      <audio src="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-17.mp3" autoPlay loop muted={muted} />

      {/* 3D Canvas */}
      <div className="absolute inset-0 z-0">
        <Canvas
          shadows
          dpr={[1, 1.75]}
          gl={{ antialias: false, powerPreference: 'high-performance' }}
          camera={{ position: [0, 28, 65], fov: 48, near: 0.1, far: 2000 }}
          onCreated={({ gl }) => { gl.toneMappingExposure = 1.1; }}
        >
          <Suspense fallback={null}>
            <Scene selected={selected} setSelected={setSelected} tourEnabled={tour} />
            {/* The grade. Space has the widest dynamic range of any subject the
                app renders — a star beside an unlit ice giant — and showing it
                on an untouched linear buffer is what made the module look like a
                diagram of the solar system rather than a photograph of it.

                Bloom is the important one: it is how a real lens responds to the
                Sun, and it is the only thing here that makes a star read as
                painfully bright rather than as a bright circle. The threshold is
                set so only genuinely emissive surfaces bloom and lit planets do
                not smear. ACES then rolls those highlights off the way film
                does, instead of clipping them flat to white. */}
            <EffectComposer multisampling={0}>
              <Bloom intensity={1.15} luminanceThreshold={0.62} luminanceSmoothing={0.32} mipmapBlur />
              <SMAA />
              <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
              <Vignette offset={0.28} darkness={0.62} />
            </EffectComposer>
          </Suspense>
        </Canvas>
      </div>

      {/* The vignette moved into the composer, where it lands on the rendered
          image rather than as a DOM overlay. Keeping both would double it. */}

      {/* Header */}
      <header className="relative z-10 px-8 pt-8 pb-4 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-5 pointer-events-auto">
          <button
            onClick={onBack}
            className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all text-white/50 hover:text-white"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.5em] text-white/30">Classroom Module 01</p>
            <h1 className="text-xl font-black uppercase tracking-tight leading-none">Solar System Explorer</h1>
          </div>
        </div>
        <div className="flex items-center gap-3 pointer-events-auto">
          <button
            onClick={() => setShowNews(v => !v)}
            className="flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/10 transition-all"
          >
            <Newspaper size={14} /> Space News
          </button>
          <button
            onClick={() => setTour(v => !v)}
            title={tour ? 'Camera follows your selection' : 'Camera stays where you put it'}
            aria-pressed={tour}
            className={`w-11 h-11 rounded-xl border flex items-center justify-center transition-all ${
              tour
                ? 'bg-[#9FD4FF]/15 border-[#9FD4FF]/40 text-[#9FD4FF]'
                : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:bg-white/10'
            }`}
          >
            <Orbit size={18} />
          </button>
          <button
            onClick={() => setMuted(v => !v)}
            className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all text-white/50 hover:text-white"
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 relative z-10 flex pointer-events-none overflow-hidden">
        {/* Left Panel */}
        <motion.div
          key={selected}
          initial={{ x: -40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-[22rem] p-6 flex flex-col pointer-events-auto"
        >
          <div className="bg-black/50 backdrop-blur-2xl border border-white/10 rounded-3xl p-7 flex-1 overflow-hidden flex flex-col">
            {/* Planet name */}
            <div className="mb-6">
              <span className="text-[8px] font-black uppercase tracking-[0.5em] text-white/25">{planet.type}</span>
              <h2 className="text-5xl font-black uppercase tracking-tight leading-none mt-1">{planet.name}</h2>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-5 p-1 bg-white/5 rounded-xl border border-white/8">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex-1 py-2.5 rounded-lg flex items-center justify-center transition-all ${tab === t.id ? 'bg-white text-black' : 'text-white/30 hover:text-white/70'}`}
                >
                  <t.icon size={15} />
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
              <AnimatePresence mode="wait">
                {tab === 'OVERVIEW' && (
                  <motion.div key="ov" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
                    <p className="text-sm leading-relaxed text-white/55">{planet.description}</p>
                    <div className="space-y-2">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Key Facts</p>
                      {planet.facts.map((f, i) => (
                        <div key={i} className="flex gap-3 p-3 bg-white/4 rounded-xl border border-white/6">
                          <Sparkles size={12} className="text-yellow-400/60 mt-0.5 shrink-0" />
                          <p className="text-[11px] text-white/60 leading-relaxed">{f}</p>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {tab === 'AI' && (
                  <motion.div key="ai" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                    <div className="p-5 rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-500/5 border border-violet-500/20">
                      <div className="flex items-center gap-2 mb-4">
                        <Brain size={14} className="text-violet-400" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-violet-400">AI Insight — {planet.name}</span>
                      </div>
                      {aiLoading ? (
                        <div className="space-y-3">
                          {[100, 75, 90].map((w, i) => (
                            <div key={i} className="h-3 bg-white/10 rounded animate-pulse" style={{ width: `${w}%` }} />
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <p className="text-sm text-white/80 leading-relaxed">{aiInsight?.summary}</p>
                          <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                            <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">Discovery</p>
                            <p className="text-[11px] text-violet-300">{aiInsight?.fact}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {tab === 'STATS' && (
                  <motion.div key="st" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid grid-cols-2 gap-2">
                    {Object.entries(planet.stats).map(([k, v]) => (
                      <div key={k} className={`p-4 bg-white/4 rounded-2xl border border-white/8 ${k === 'temp' || k === 'diameter' ? 'col-span-2' : ''}`}>
                        <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-1">{k === 'dayLength' ? 'Day Length' : k === 'yearLength' ? 'Year Length' : k}</p>
                        <p className={`font-black text-white leading-tight ${k === 'temp' || k === 'diameter' ? 'text-2xl' : 'text-base'}`}>{v}</p>
                      </div>
                    ))}
                  </motion.div>
                )}

                {tab === 'GALLERY' && (
                  <motion.div key="ga" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                    {planet.gallery.map((url, i) => (
                      <div key={i} className="aspect-video rounded-2xl overflow-hidden border border-white/10 group">
                        <img src={url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt={`${planet.name} ${i + 1}`} />
                      </div>
                    ))}
                    <p className="text-[8px] text-white/20 text-center">Images: NASA / ESA / Wikimedia Commons</p>
                  </motion.div>
                )}

                {tab === 'PROBES' && (
                  <motion.div key="pr" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                    {planet.probes.map((name, i) => {
                      const p = PROBE_DB[name] || { launched: '–', status: 'In Transit', desc: 'Exploring the depths of the solar system.' };
                      return (
                        <div key={i} className="p-4 bg-white/4 border border-white/8 rounded-2xl">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <p className="text-sm font-black">{name}</p>
                              <p className="text-[8px] text-white/30 uppercase tracking-widest">Launched {p.launched}</p>
                            </div>
                            <span className="text-[7px] font-black text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-lg uppercase tracking-wider">{p.status}</span>
                          </div>
                          <p className="text-[10px] text-white/45 leading-relaxed">{p.desc}</p>
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>

        {/* Right side */}
        <div className="flex-1 flex flex-col items-end p-6 gap-4 pointer-events-none">
          {/* News Panel */}
          <AnimatePresence>
            {showNews && (
              <motion.div
                initial={{ x: 320, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 320, opacity: 0 }}
                className="w-80 bg-black/60 backdrop-blur-2xl border border-white/10 rounded-3xl p-7 pointer-events-auto shadow-2xl"
              >
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-base font-black uppercase tracking-tight">Space News</h3>
                  <button onClick={() => setShowNews(false)} className="text-white/30 hover:text-white transition-colors">
                    <ArrowLeft size={18} className="rotate-180" />
                  </button>
                </div>
                <div className="space-y-5">
                  {SPACE_NEWS.map((n, i) => (
                    <div key={i} className="group cursor-pointer border-b border-white/6 pb-5 last:border-0">
                      <p className="text-[8px] font-black text-emerald-400/70 uppercase tracking-widest mb-1">{n.date} · {n.source}</p>
                      <h4 className="text-sm font-black leading-tight mb-1 group-hover:text-white/80 transition-colors">{n.title}</h4>
                      <p className="text-[10px] text-white/35 leading-relaxed line-clamp-2">{n.excerpt}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Planet selector */}
          <div className="mt-auto flex flex-wrap justify-end gap-2 pointer-events-auto">
            {PLANET_DATA.map(p => (
              <button
                key={p.name}
                onClick={() => { setSelected(p.name); setTab('OVERVIEW'); }}
                className={`px-3.5 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest border transition-all ${selected === p.name ? 'bg-white text-black border-white scale-110 shadow-xl' : 'bg-black/40 border-white/12 text-white/40 hover:text-white hover:border-white/30 hover:bg-white/8'}`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 px-8 pb-6 flex items-center justify-between pointer-events-none opacity-25">
        <p className="text-[8px] font-black uppercase tracking-[0.4em]">Solar Exploration Terminal v2.0</p>
        <p className="text-[8px] font-black uppercase tracking-[0.4em]">Textures: NASA · ESA · Three.js</p>
      </footer>
    </div>
  );
};

export default SolarSystemModule;

from pathlib import Path

p = Path("components/taleo/HauntedCastleExhibition.tsx")
t = p.read_text(encoding="utf-8").replace("\r\n", "\n")

# 1. Main Playable Character = MALE (Kenji) or FEMALE (Anya), + Pumpkin Patch Bonus Helper state
t = t.replace(
    "const [survivorGender, setSurvivorGender] = useState<'PUMPKIN_PATCH' | 'MALE' | 'FEMALE'>('PUMPKIN_PATCH');",
    "const [survivorGender, setSurvivorGender] = useState<'MALE' | 'FEMALE'>('MALE');\n  const [pumpkinHelperActive, setPumpkinHelperActive] = useState<boolean>(true);\n  const pumpkinHelperActiveRef = useRef<boolean>(pumpkinHelperActive);\n  pumpkinHelperActiveRef.current = pumpkinHelperActive;"
)
t = t.replace(
    "const survivorGenderRef = useRef<'PUMPKIN_PATCH' | 'MALE' | 'FEMALE'>(survivorGender);",
    "const survivorGenderRef = useRef<'MALE' | 'FEMALE'>(survivorGender);"
)

# 2. Separate Pumpkin Patch into his own Bonus AI Helper Group (`pumpkinAllyRoot`) in the scene
old_player_groups = """    const pumpkinHeroGroup = new THREE.Group();
    pumpkinHeroGroup.rotation.y = Math.PI;
    const maleSurvivorGroup = new THREE.Group();
    maleSurvivorGroup.rotation.y = Math.PI;
    maleSurvivorGroup.visible = false;
    const femaleSurvivorGroup = new THREE.Group();
    femaleSurvivorGroup.rotation.y = Math.PI;
    femaleSurvivorGroup.visible = false;
    playerRoot.add(pumpkinHeroGroup);
    playerRoot.add(maleSurvivorGroup);
    playerRoot.add(femaleSurvivorGroup);"""

new_player_groups = """    const maleSurvivorGroup = new THREE.Group();
    maleSurvivorGroup.rotation.y = Math.PI;
    const femaleSurvivorGroup = new THREE.Group();
    femaleSurvivorGroup.rotation.y = Math.PI;
    femaleSurvivorGroup.visible = false;
    playerRoot.add(maleSurvivorGroup);
    playerRoot.add(femaleSurvivorGroup);

    // Bonus AI Helper Character: Pumpkin Patch (Melvin Lester) who comes in and helps fight monsters!
    const pumpkinAllyRoot = new THREE.Group();
    pumpkinAllyRoot.position.set(2.4, 0, 50.0);
    scene.add(pumpkinAllyRoot);
    const pumpkinHeroGroup = new THREE.Group();
    pumpkinHeroGroup.rotation.y = Math.PI;
    pumpkinAllyRoot.add(pumpkinHeroGroup);
    const allySlashMat = new THREE.MeshBasicMaterial({
      color: '#ff6a00',
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
    });
    const allySlashRibbon = new THREE.Mesh(
      new THREE.RingGeometry(1.0, 2.25, 24, 1, -Math.PI * 0.65, Math.PI * 1.3),
      allySlashMat
    );
    allySlashRibbon.rotation.x = -Math.PI / 2;
    allySlashRibbon.position.set(0, 1.18, -0.35);
    pumpkinAllyRoot.add(allySlashRibbon);"""

assert old_player_groups in t, "old_player_groups not found"
t = t.replace(old_player_groups, new_player_groups)

# 3. Remove fallback attach of MaleSurvivor_Rig to pumpkinHeroGroup
t = t.replace(
    "        if (!loadedTemplates['PumpkinPatch_Rig']) {\n          attachLoadedRigToSlot(pumpkinHeroGroup, 'MaleSurvivor_Rig', 1.06);\n        }\n",
    ""
)

# 4. Add 'p' hotkey to summon/toggle Pumpkin Patch Bonus Helper
t = t.replace(
    "      } else if (k === 't') {",
    "      } else if (k === 'p') {\n        e.preventDefault();\n        setPumpkinHelperActive((prev) => {\n          const next = !prev;\n          if (next) halloweenAudio.playPlasmaBladesAppear();\n          setCombatLogText(next ? '🎃 BONUS ALLY: Pumpkin Patch materialized with Dual Orange Plasma Blades to help you fight!' : '🎃 Pumpkin Patch stepped back into the shadows.');\n          return next;\n        });\n      } else if (k === 't') {"
)

# 5. Update Player visibility & add Autonomous Pumpkin Patch Bonus Helper AI Combat in animate()
old_toggle = """      // Toggle Playable Hero Rig: Pumpkin Patch (Default) vs Male Survivor vs Female Survivor
      const heroChoice = survivorGenderRef.current;
      pumpkinHeroGroup.visible = heroChoice === 'PUMPKIN_PATCH';
      maleSurvivorGroup.visible = heroChoice === 'MALE';
      femaleSurvivorGroup.visible = heroChoice === 'FEMALE';"""

new_toggle = """      // Toggle Playable Survivor Rig: Kenji (Male Survivor) vs Anya (Female Survivor)
      const isMale = survivorGenderRef.current === 'MALE';
      maleSurvivorGroup.visible = isMale;
      femaleSurvivorGroup.visible = !isMale;"""

assert old_toggle in t, "old_toggle not found"
t = t.replace(old_toggle, new_toggle)

old_active_slot = """      const activeSurvivorSlot =
        heroChoice === 'PUMPKIN_PATCH'
          ? pumpkinHeroGroup
          : heroChoice === 'MALE'
          ? maleSurvivorGroup
          : femaleSurvivorGroup;"""

new_active_slot = """      const activeSurvivorSlot = isMale ? maleSurvivorGroup : femaleSurvivorGroup;"""
assert old_active_slot in t, "old_active_slot not found"
t = t.replace(old_active_slot, new_active_slot)

target_anim_call = """      animateHumanoidSkeleton(
        activeSurvivorSlot,
        t,
        smoothedGaitSpeed,
        swingPhase,
        bushidoStanceRef.current,
        p.comboIndex
      );"""

bonus_helper_ai = target_anim_call + """

      // --- A2. BONUS AI HELPER: PUMPKIN PATCH (MELVIN LESTER) COMES IN & HELPS FIGHT! ---
      pumpkinAllyRoot.visible = pumpkinHelperActiveRef.current;
      if (pumpkinHelperActiveRef.current) {
        let allyTargetMonster: MonsterAgent | null = null;
        let bestMonDist = 20.0;
        for (let i = 0; i < monsters.length; i++) {
          const m = monsters[i];
          if (m.respawnTimer > 0 || Math.abs(m.floorY - p.y) > 2.8) continue;
          const dToPlayer = Math.hypot(m.x - p.x, m.z - p.z);
          if (dToPlayer < bestMonDist) {
            bestMonDist = dToPlayer;
            allyTargetMonster = m;
          }
        }

        const curAx = pumpkinAllyRoot.position.x;
        const curAz = pumpkinAllyRoot.position.z;
        if (Math.hypot(curAx - p.x, curAz - p.z) > 22.0) {
          pumpkinAllyRoot.position.set(p.x + 2.2, p.y, p.z - 1.5);
        }

        let goalX = p.x + Math.cos(p.yaw) * 2.2 + Math.sin(p.yaw) * 1.4;
        let goalZ = p.z - Math.sin(p.yaw) * 2.2 + Math.cos(p.yaw) * 1.4;
        if (allyTargetMonster) {
          goalX = allyTargetMonster.x;
          goalZ = allyTargetMonster.z;
        }

        const adx = goalX - pumpkinAllyRoot.position.x;
        const adz = goalZ - pumpkinAllyRoot.position.z;
        const adist = Math.hypot(adx, adz) || 0.001;
        let allyGait = 0.0;
        let allySwingPhase = 0.0;

        if (adist > 1.75) {
          const allySpeed = allyTargetMonster ? 9.2 : 8.2;
          pumpkinAllyRoot.position.x += (adx / adist) * allySpeed * dt;
          pumpkinAllyRoot.position.z += (adz / adist) * allySpeed * dt;
          pumpkinAllyRoot.rotation.y = Math.atan2(-adx, -adz);
          allyGait = allyTargetMonster ? 1.3 : 1.0;
        } else if (allyTargetMonster) {
          pumpkinAllyRoot.rotation.y = Math.atan2(-adx, -adz);
          allySwingPhase = (t * 2.8) % 1.0;
          allySlashMat.opacity = Math.sin(allySwingPhase * Math.PI) * 0.72;
          allySlashRibbon.rotation.z = allySwingPhase * Math.PI * 1.6;
          if (Math.random() < dt * 2.6) {
            allyTargetMonster.hp -= 35;
            allyTargetMonster.hitFlashTimer = 0.25;
            allyTargetMonster.vx += (adx / adist) * 8.0;
            allyTargetMonster.vz += (adz / adist) * 8.0;
            if (allyTargetMonster.hp <= 0) {
              allyTargetMonster.respawnTimer = 8.5;
              allyTargetMonster.group.visible = false;
              p.kills += 1;
              setMonstersSlain(p.kills);
              setCombatCallout({
                text: '🎃 PUMPKIN PATCH ALLY CLEAVE!',
                color: '#fb923c',
                id: Date.now(),
              });
            }
          }
        } else {
          allySlashMat.opacity = 0.0;
        }
        pumpkinAllyRoot.position.y += (p.y - pumpkinAllyRoot.position.y) * Math.min(1, dt * 12);
        if (!allyTargetMonster || adist > 1.75) {
          allySlashMat.opacity = 0.0;
        }
        animateHumanoidSkeleton(pumpkinHeroGroup, t + 0.4, allyGait, allySwingPhase, 'HIGH', 3);
      }"""

assert target_anim_call in t, "target_anim_call not found"
t = t.replace(target_anim_call, bonus_helper_ai)

# 6. Update Top Bar UI: Kenji (Male Survivor) / Anya (Female Survivor) + Bonus Helper Pumpkin Patch Button
old_ui = """          {/* Playable Hero Selector: Pumpkin Patch (Melvin) / Grindhouse Male / Agent Katrina */}
          <div className="flex items-center bg-zinc-950/90 border border-orange-500/40 rounded-lg p-0.5">
            <button
              onClick={() => setSurvivorGender('PUMPKIN_PATCH')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider transition cursor-pointer ${
                survivorGender === 'PUMPKIN_PATCH'
                  ? 'bg-orange-600 text-white shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              🎃 Pumpkin Patch
            </button>
            <button
              onClick={() => setSurvivorGender('MALE')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider transition cursor-pointer ${
                survivorGender === 'MALE'
                  ? 'bg-red-600 text-white shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              ⚔️ Survivor
            </button>
            <button
              onClick={() => setSurvivorGender('FEMALE')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider transition cursor-pointer ${
                survivorGender === 'FEMALE'
                  ? 'bg-pink-600 text-white shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              🕵️‍♀️ Katrina
            </button>
          </div>"""

new_ui = """          {/* Playable Survivor Switch: Kenji 'Road Rash' Tanaka (Male) vs Anya 'Scrap' Petrovic (Female) */}
          <div className="flex items-center bg-zinc-950/90 border border-zinc-800 rounded-lg p-0.5">
            <button
              onClick={() => setSurvivorGender('MALE')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider transition cursor-pointer ${
                survivorGender === 'MALE'
                  ? 'bg-red-600 text-white shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              🧑 Kenji (Male)
            </button>
            <button
              onClick={() => setSurvivorGender('FEMALE')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider transition cursor-pointer ${
                survivorGender === 'FEMALE'
                  ? 'bg-pink-600 text-white shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              👩 Anya (Female)
            </button>
          </div>

          {/* Bonus AI Helper Character: Pumpkin Patch (Melvin Lester) */}
          <button
            onClick={() => {
              setPumpkinHelperActive((prev) => {
                const next = !prev;
                if (next) halloweenAudio.playPlasmaBladesAppear();
                return next;
              });
            }}
            className={`px-2.5 py-1 rounded-lg border text-[11px] font-black uppercase tracking-wider transition cursor-pointer ${
              pumpkinHelperActive
                ? 'bg-orange-600/90 border-orange-400 text-white shadow-[0_0_16px_rgba(249,115,22,0.5)]'
                : 'bg-zinc-950/90 border-orange-500/40 text-orange-300 hover:text-white'
            }`}
            title="Summon/Toggle Pumpkin Patch as your AI Bonus Helper (Hotkey: P)"
          >
            🎃 Ally: Pumpkin Patch {pumpkinHelperActive ? 'ON' : 'OFF'} (P)
          </button>"""

assert old_ui in t, "old_ui not found"
t = t.replace(old_ui, new_ui)

p.write_text(t, encoding="utf-8")
print("Successfully updated HauntedCastleExhibition.tsx!")

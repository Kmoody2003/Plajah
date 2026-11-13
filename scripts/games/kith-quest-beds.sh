#!/usr/bin/env bash
# Lyria RealTime cinematic beds for the Kith Quest hybrid score (Kenne 2026-11-13: "Hybrid + rewrite").
# Each bed: the cue's tempo and a Lyria scale holding exactly the cue's notes, no drums (Lyria can't lock to our beat
# grid), body length + 8 s so the build can crossfade it into a seamless loop.
#   bash scripts/games/kith-quest-beds.sh [cue ...]
set -u
OUT="${KITHQUEST_AUDIO_CACHE:-D:/Plajah Runtime/cache/kith-quest-audio}/beds"; mkdir -p "$OUT"
NO="no drums, no percussion, no piano, no synthesizer, no electronic sounds"
bed() { # cue seconds bpm scale density brightness prompt [prompt2]
  local cue=$1 secs=$2 bpm=$3 scale=$4; export LYRIA_DENSITY=$5 LYRIA_BRIGHTNESS=$6; shift 6
  if [ -n "${ONLY:-}" ] && [[ " $ONLY " != *" $cue "* ]]; then return; fi
  echo "== $cue"; timeout $((secs + 120)) node node_modules/tsx/dist/cli.mjs scripts/games/lyriaBed.ts "$OUT/$cue.wav" "$secs" "$bpm" "$scale" "$@" 2>&1 | grep -v experimental
}
ONLY="${*:-}"
bed title          80 108 F_MAJOR_D_MINOR        0.55 0.55 "Cinematic orchestral film score underscore, lush sustained divisi strings, noble French horn chorale, soft choir, swelling crescendos, grand concert hall, $NO:1.3" "Heroic fantasy adventure, wonder and hope:0.6"
bed calm-glowmoss  98  64 F_MAJOR_D_MINOR        0.35 0.45 "Tender orchestral film score lullaby underscore, warm sustained strings, soft woodwinds, gentle swells, concert hall, $NO:1.3" "Enchanted glowing forest at night, magical, peaceful:0.6"
bed calm-cascade   88  72 A_MAJOR_G_FLAT_MINOR   0.4  0.6  "Shimmering orchestral film score underscore, airy high strings, flowing sustained violins, soft flutes, gentle swells, concert hall, $NO:1.3" "Waterfalls in the sky, floating, luminous wonder:0.6"
bed calm-keep     107  58 F_MAJOR_D_MINOR        0.35 0.35 "Hushed dark orchestral film score underscore, low sustained strings, distant choir, cathedral reverb, slow swells, $NO:1.3" "Moonlit ancient castle, melancholy, mystery:0.6"
bed energy-glowmoss 50 138 F_MAJOR_D_MINOR       0.7  0.6  "Driving adventurous orchestral film score, sustained strings and bold brass swells, rising energy, concert hall, $NO:1.3" "Chase through an enchanted forest, excitement:0.6"
bed energy-cascade 48 144 A_MAJOR_G_FLAT_MINOR   0.7  0.7  "Soaring adventurous orchestral film score, sweeping high strings and brass swells, exhilarating, concert hall, $NO:1.3" "Flying over waterfalls, triumphant sky chase:0.6"
bed energy-keep    52 132 F_MAJOR_D_MINOR        0.7  0.45 "Dark heroic orchestral film score, surging low strings, brass chorale swells, choir, gothic cathedral reverb, $NO:1.3" "Climbing a haunted castle, urgent courage:0.6"
bed danger         54  63 F_MAJOR_D_MINOR        0.45 0.3  "Suspenseful dark orchestral film score underscore, low string clusters, tense sustained strings, ominous brass swells, $NO:1.3" "Something is following in the dark thorns, dread:0.7"
bed fear           54  84 B_FLAT_MAJOR_G_MINOR   0.5  0.3  "Tense frightening orchestral film score underscore, trembling low strings, dissonant swells, breathy choir, $NO:1.3" "One last chance, fragile, heartbeat panic:0.7"
bed battle         44 160 F_MAJOR_D_MINOR        0.8  0.55 "Epic boss battle orchestral film score, massive brass, surging strings, powerful choir, huge crescendos, $NO:1.3" "Desperate heroic fight against a dark guardian:0.7"

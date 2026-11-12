#!/usr/bin/env bash
# forgeFitLoop.sh — the fidelity loop: build Haru v3, score him against the turnaround, fold the measured head
# corrections into the warp, and go again, until the score passes TARGET or stops improving.
#   bash scripts/eraclash3d/forgeFitLoop.sh [passes=4] [target=0.95]
set -e
PASSES=${1:-4}; TARGET=${2:-0.95}
OUT="D:/Plajah Runtime/eraclash3d/forge/fidelity"
best=0
for i in $(seq 1 "$PASSES"); do
  npx tsx scripts/eraclash3d/forgeHaru.ts > /dev/null
  line=$(npx tsx scripts/eraclash3d/forgeFidelity.ts --update-warp | tee "$OUT/pass_$i.txt" | grep -E '^fidelity')
  score=$(node -e "console.log(require('$OUT/fidelity.json').overall)")
  echo "pass $i: $line"
  if node -e "process.exit($score >= $TARGET ? 0 : 1)"; then echo "passed $TARGET"; break; fi
  if node -e "process.exit($score <= $best + 0.002 ? 0 : 1)"; then echo "no further gain (best $best)"; break; fi
  best=$score
done

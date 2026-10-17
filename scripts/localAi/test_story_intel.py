import sys
import time
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, r"c:\Users\Kenne\plajah\scripts\localAi")
from story_intelligence_engine import story_intel_engine as story_intel

prose_sample = """Rain hammered the neon-lit alley of New Meridian as Silas Vane crouched beside the shattered skylight.
SILAS VANE: "They breached the lower vault—Echo, lock the perimeter!"
BOOM! A crimson plasma charge obliterated the steel bulkhead below.
ECHO-9: "Too late, Silas! The Chrome Apostle is already inside the cathedral!" """

character_bible = [
    {
        "name": "Silas Vane",
        "role": "Cyber-Noir Detective",
        "look": "scarred jawline, glowing amber cybernetic left eye, drenched charcoal trenchcoat, brass neural collar"
    },
    {
        "name": "Echo-9",
        "role": "Tactical Synth Companion",
        "look": "sleek porcelain-white chassis, holographic cobalt visor, twin shoulder pulse emitters"
    }
]

print("=== [TEST 1] Warm-Pool Preload & Dual-Engine Cascade Deconstruction ===")
res1 = story_intel.decompose_prose(
    prose_sample,
    title="The Chrome Apostle: Breach",
    style="comic_western",
    model_preference="cascade",
    character_bible=character_bible,
)
print(f"Model: {res1.get('inferenceModel')} | Cold Load + Inference Latency: {res1.get('latencyMs')}ms | Speed: {res1.get('tokensPerSec')} t/s")
print(f"Resident VRAM Pool: {res1.get('vramResidentModels')}")
print(f"Recommended Layout: {res1.get('recommendedLayoutId')} | Discovered Cast: {res1.get('discoveredCharacters')}")
for b in res1.get("beats", []):
    print(f"  [Panel {b.get('panelIndex')}] ({b.get('cameraShot')}) {b.get('actionSummary')}")
    print(f"     [Continuity]: {b.get('continuityNote')}")
    print(f"     [Diffusion]:  {b.get('diffusionPrompt')[:135]}...")

print("\n=== [TEST 2] Warm-Pool Hot Repeat (0ms Model Reload) ===")
res1_warm = story_intel.decompose_prose(
    prose_sample,
    title="The Chrome Apostle: Breach",
    style="comic_western",
    model_preference="gemma-2-2b",
    character_bible=character_bible,
)
print(f"Warm Gemma 2 2B Latency (No Disk Reload!): {res1_warm.get('latencyMs')}ms | Speed: {res1_warm.get('tokensPerSec')} t/s")

print("\n=== [TEST 3] Nemotron 4B Editorial Writers Council (Warm in VRAM) ===")
res2 = story_intel.critique_council(prose_sample, model_preference="nemotron-4b")
print(f"Model: {res2.get('inferenceModel')} | Latency: {res2.get('latencyMs')}ms | Speed: {res2.get('tokensPerSec')} t/s | Score: {res2.get('overallScore')}/100")
print(f"Summary: {res2.get('executiveSummary')}")

print("\n=== [TEST 4] Warm Switch Back to Gemma 2 2B (Dual-Resident VRAM Pool Proof) ===")
res_switch = story_intel.decompose_prose(
    prose_sample,
    title="Instant Switch Test",
    style="manga",
    model_preference="gemma-2-2b",
    character_bible=character_bible,
)
print(f"Warm Switch Latency (Both Gemma 2 2B + Nemotron 4B Resident in VRAM): {res_switch.get('latencyMs')}ms | Resident: {res_switch.get('vramResidentModels')}")

print("\n=== [TEST 5] On-Device Full-Book Continuity Audit (Nemotron 4B) ===")
contradiction_manuscript = """
=== Chapter 1: The Ash Vault ===
Silas Vane adjusted his glowing amber cybernetic left eye, staring through the rain with his organic brown right eye. His left arm had been replaced with a matte-black titanium prosthetic after the Siege of Orion.

=== Chapter 14: Cathedral of Rust ===
Silas Vane blinked both of his natural green eyes as he rolled up his sleeve, flexing his flesh-and-blood left hand where no scar had ever touched him.
"""
res_cont = story_intel.check_continuity(contradiction_manuscript, model_preference="nemotron-4b")
print(f"Continuity Audit Latency: {res_cont.get('latencyMs')}ms | Cost: ${res_cont.get('costUsd')} | Summary: {res_cont.get('summary')}")
for f in res_cont.get("findings", []):
    print(f"  [!] [{f.get('severity').upper()}] ({f.get('kind')}) {f.get('title')}: {f.get('detail')}")

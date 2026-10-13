import sys
sys.path.insert(0, r"c:\Users\Kenne\plajah\scripts\localAi")
from story_intelligence_engine import story_intel_engine

print("[TEST] Gemma 2 2B path:", story_intel_engine.find_model_path("gemma-2-2b"))
print("[TEST] Nemotron 4B path:", story_intel_engine.find_model_path("nemotron-4b"))

test_prose = """Rain lashed against the rusted steel fire escapes of Lower Sector 4.
Kael tightened the seal on his kinetic rebreather. "Command, do you copy? The seal is broken."
From the shadows beneath the monorail arches, a glowing crimson optic ignited with a sharp electronic hiss.
BOOM! An explosive concussive bolt shattered the stone pavement between them."""

print("\n--- Testing Gemma 2 2B Beat Decomposition on GPU ---")
res = story_intel_engine.decompose_prose(test_prose, title="Sector 4 Infiltration", style="manga", model_preference="gemma-2-2b")
print("Model:", res.get("inferenceModel"))
print("Latency:", res.get("latencyMs"), "ms")
if "tokensPerSec" in res:
    print("Inference speed:", res["tokensPerSec"], "tokens/sec")
print("Beats generated:", len(res.get("beats", [])))
for b in res.get("beats", []):
    print(f"  [Panel {b.get('panelIndex')}] Shot: {b.get('cameraShot')} | SFX: {b.get('suggestedSfx')} | Action: {b.get('actionSummary')[:60]}... | Dialogues: {len(b.get('dialogueLines', []))}")

print("\n--- Testing Editorial Writers Council on GPU ---")
critique = story_intel_engine.critique_council(test_prose, model_preference="nemotron-4b")
print("Council Overall Score:", critique.get("overallScore"))
print("Council Members:", [m.get("role") for m in critique.get("councilMembers", [])])
print("Executive Summary:", critique.get("executiveSummary"))

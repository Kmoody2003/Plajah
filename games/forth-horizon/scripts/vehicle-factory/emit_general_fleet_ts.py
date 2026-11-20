import json
from pathlib import Path

plan = json.loads(
    Path(r"C:\Users\Kenne\.gemini\antigravity\brain\42e3bfd8-faf9-4bbd-85bf-ae0b60e1bbba\scratch\general_vehicles_plan.json").read_text(encoding="utf-8")
)

def summary_for(e: dict) -> str:
    a = e["archetype"]
    ev = e["powertrain"] == "ev"
    if a == "compact":
        return f"Everyday {e['engineText']} city compact from Ironport's street fleet. Nimble and quiet stock, wild as a sleeper build."
    if a == "sedan":
        if "taxi" in e["id"]:
            return "Ironport Metro yellow taxi cruiser. Quiet factory V6 stock — ready to transform into a street-circuit sleeper."
        if "police" in e["id"]:
            return "Vernon City Police Interceptor with heavy-duty push bar, pursuit suspension, and high-output V8."
        return f"Refined everyday {e['engineText']} street sedan from Ironport's daily traffic fleet. Smooth stock, fully upgradeable."
    if a == "gt":
        return f"Rear-drive {e['engineText']} sport coupe from the Valoris showroom. Balanced chassis ready for street or track tuning."
    if a == "van":
        return f"Practical {e['engineText']} utility and fleet van built for Ironport deliveries and sleeper van builds."
    if a == "truck":
        return f"Work-ready {e['engineText']} Ironport pickup with rugged chassis and full off-road and power upgrade support."
    if a == "commercial":
        return f"Heavy-duty {e['engineText']} commercial fleet rig serving Ironport streets and coastal highways. Fully drivable and tunable."
    prefix = "electric " if ev else ""
    return f"Versatile {e['engineText']} {prefix}SUV built for Ironport city avenues, suburbs, and Pinewood trails."

lines = [
    "// Auto-integrated 58-vehicle General Street & Commercial Fleet from the 3D Vehicle Asset Library.",
    "// Every vehicle is built (60k-face Class-A GLB + measured spec.json), buyable & upgradeable in the Garage,",
    "// starts with a quiet authentic stock engine bank, and spawns in live Ironport free-roam traffic.",
    "import type { CarDef } from './catalog';",
    "",
    "const VL = '/vehicle-lib/';",
    "",
    "export const GENERAL_CAR_DEFS: CarDef[] = [",
]

for e in plan:
    name = e["name"].replace("Forza", "Summit").replace("Horizon", "Summit")
    unlock = "{ kind: 'start' }" if e["price"] <= 26000 else ("{ kind: 'level', level: 2 }" if e["price"] <= 48000 else "{ kind: 'level', level: 4 }")
    bank_part = f", soundBank: '{e['soundBank']}'" if e.get("soundBank") else ""
    vid_part = f", videoUrl: VL + {json.dumps(Path(e['turntablePath']).name)}" if e.get("turntableExists") and e.get("turntablePath") else ""
    summ = summary_for(e)
    lines.append(
        f"  {{ id: '{e['id']}', make: {json.dumps(e['make'])}, name: {json.dumps(name)}, pi: {e['pi']}, drivetrain: '{e['drivetrain']}', powertrain: '{e['powertrain']}', aspiration: {json.dumps(e['aspiration'])}, engineText: {json.dumps(e['engineText'])}, hp: {e['hp']}, kg: {e['kg']}, archetype: '{e['archetype']}', price: {e['price']}, unlock: {unlock}, body: 'scan', traffic: true{bank_part}, summary: {json.dumps(summ)}, sheetUrl: VL + {json.dumps(e['sheetFile'])}{vid_part} }},"
    )

lines.append("];")
out = Path(r"c:\Users\Kenne\plajah\games\forth-horizon\src\garage\generalFleet.ts")
out.write_text("\n".join(lines) + "\n", encoding="utf-8")
print("WROTE", out, "entries:", len(plan))

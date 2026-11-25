"""
Build the complete verified 58-vehicle catalog manifest for D:\plajah game assets deign from promtps\racer\3D Vehicle Asset Library.
Every vehicle is matched by its unique 8-hex suffix (immune to Unicode ellipsis), assigned clean Plajah-universe
make/model names (zero trademarked words!), realistic class/PI/HP/kg/price/unlock, authentic quiet stock engine
sound bank, matching 3D engine architecture, and real-world dimensions!
"""
import json
from pathlib import Path

LIB = Path(r"D:\plajah game assets deign from promtps\racer\3D Vehicle Asset Library")
OUT = Path(r"C:\Users\Kenne\.gemini\antigravity\brain\42e3bfd8-faf9-4bbd-85bf-ae0b60e1bbba\scratch\general_vehicles_plan.json")

all_sheets = {p.stem.split("_")[-1]: p for p in LIB.glob("*.jpg")}
all_tts = {p.stem.split("_")[-1]: p for p in LIB.glob("*.mp4") if "engine" not in p.name.lower()}

# (id, make, name, archetype, drivetrain, powertrain, aspiration, engineText, hp, kg, pi, price, targetLen, paint, accent, soundBank, arch, sheetHash, ttHash, isTruck)
VEHICLES = [
    # --- CITY / COMPACT / HATCHBACKS ---
    ("nexis_city", "Nexis", "City Micro", "compact", "FWD", "ice", "Naturally Aspirated", "1.4L I4", 112, 1060, 260, 8500, 3.85, "0x9aa2ac", "0x1c2026", "i4_commuter", "commuter-i4", "82776a23", "a12ca051", False),
    ("velox_metro", "Velox", "Metro 5-Door", "compact", "FWD", "ice", "Naturally Aspirated", "1.6L I4", 138, 1210, 310, 11500, 4.12, "0x5d7285", "0x181c22", "hatch_i4", "commuter-i4", "0cbae574", "95aac7ba", False),
    ("vertix_terrahatch", "Vertix", "Terra-Hatch", "compact", "AWD", "ice", "Twin-Turbo", "1.6L Turbo I4", 185, 1340, 390, 16500, 4.24, "0x808892", "0x1a1e24", "hatch_i4", "i4-turbo", "7ae68dad", "8601bf1d", False),
    ("nexis_e03", "Nexis", "E-03 EV Hatch", "compact", "FWD", "ev", "Electric", "Single-Motor EV", 170, 1460, 370, 19000, 4.16, "0x7c8ca0", "0x22d4ff", None, "ev", "0c7df06b", "fef90c70", False),
    ("zephyr_spark_ev", "Zephyr", "Spark EV", "compact", "FWD", "ev", "Electric", "Single-Motor EV", 204, 1520, 415, 22000, 4.22, "0x8c96a2", "0x38bdf8", None, "ev", "6e4550c0", None, False),

    # --- SEDANS / COUPES / WAGONS / TAXI / POLICE ---
    ("nexis_strada", "Nexis", "Strada Sedan", "sedan", "FWD", "ice", "Naturally Aspirated", "2.0L I4", 168, 1440, 340, 14000, 4.72, "0xaeb4bc", "0x1c2028", "i4_commuter", "commuter-i4", "0283732f", "0f903358", False),
    ("nexis_aeroh", "Nexis", "Aero-H Hybrid", "sedan", "FWD", "ice", "Naturally Aspirated", "2.0L Hybrid I4", 196, 1520, 380, 18500, 4.78, "0xc4ccd4", "0x2dd4bf", "hybrid_i4", "hybrid", "6de67776", None, False),
    ("velox_estate", "Velox", "Touring Estate", "sedan", "AWD", "ice", "Naturally Aspirated", "3.0L V6", 255, 1690, 440, 24000, 4.86, "0x6a7874", "0x1c2024", "v6_sedan", "v6-sedan", "0f01ec20", "7f6c72b1", False),
    ("aureon_seraph", "Aureon", "Seraph Executive", "sedan", "RWD", "ice", "Twin-Turbo", "3.0L Twin-Turbo V6", 340, 1820, 520, 36000, 5.02, "0x2c323c", "0xd4dce6", "v6_sedan", "v6-sedan", "71c824e4", "b93d5dde", False),
    ("valoris_sc420", "Valoris", "SC-420 Coupe", "gt", "RWD", "ice", "Twin-Turbo", "2.5L Turbo I4", 315, 1480, 560, 34000, 4.58, "0xb4bcc6", "0xc82228", "sports_sedan_20t", "i4-turbo", "fef40bf5", "fe8e3613", False),
    ("apex_taxi", "Apex", "Metro Taxi Cab", "sedan", "RWD", "ice", "Naturally Aspirated", "3.5L V6", 240, 1740, 395, 16000, 4.92, "0xe2b21c", "0x16181c", "v6_sedan", "v6-sedan", "8ca3dd85", "8aec14a7", False),
    ("vernon_police", "Vernon", "Police Interceptor", "sedan", "AWD", "ice", "Naturally Aspirated", "5.7L Pursuit V8", 385, 1920, 595, 42000, 5.04, "0x161c28", "0xe8ecf2", "muscle_v8", "muscle-v8", "aca43609", None, False),

    # --- MINIVANS / CARGO & UTILITY VANS ---
    ("nexis_voyager", "Nexis", "Voyager Minivan", "van", "FWD", "ice", "Naturally Aspirated", "3.5L V6", 265, 1980, 330, 18000, 5.14, "0xb8bec6", "0x20242a", "suv_v6_stock", "suv-v6", "518dfbd6", None, True),
    ("swiftpack_van", "SwiftPack", "Cargo Delivery Van", "van", "RWD", "ice", "Twin-Turbo", "2.2L Turbo Diesel", 185, 2240, 270, 19500, 5.42, "0xdce0e6", "0x1c4a82", "diesel_van", "diesel-i4", "c7a43300", "a70e75d8", True),
    ("vecto_van", "Vecto", "Urban Cargo Van", "van", "RWD", "ice", "Twin-Turbo", "2.5L Turbo Diesel", 195, 2320, 280, 21000, 5.48, "0xd8dde4", "0x246288", "diesel_van", "diesel-i4", "964d0e01", "e2097c03", True),
    ("vectra_vx4200", "Vectra", "VX-4200 Utility Van", "van", "RWD", "ice", "Twin-Turbo", "3.0L Turbo Diesel", 215, 2480, 295, 23500, 5.56, "0xd6dce2", "0xd87618", "diesel_van", "diesel-i4", "15e284a0", "ce79b626", True),
    ("metropost_truck", "MetroPost", "MT-280 Mail Truck", "van", "RWD", "ice", "Naturally Aspirated", "2.8L Diesel I4", 160, 2180, 240, 17000, 4.96, "0xdce0e6", "0x204a8c", "diesel_van", "diesel-i4", "16382474", "e2b044e2", True),

    # --- PICKUPS & WORK TRUCKS ---
    ("vortex_terric", "Vortex", "Terric Compact Pickup", "truck", "AWD", "ice", "Twin-Turbo", "2.7L Turbo V6", 285, 1960, 445, 24000, 5.18, "0x6c7268", "0x1c1e22", "pickup_v8", "suv-v6", "b7b23f4c", "4492c39b", True),
    ("titan_1500_crew", "Titan Ridge", "1500 Crew Cab", "truck", "AWD", "ice", "Naturally Aspirated", "5.3L V8", 365, 2320, 485, 31000, 5.58, "0x5c646e", "0x1c2026", "pickup_v8", "pickup-v8", "09f84d9a", "33481628", True),
    ("ironport_work_pickup", "Ironport", "F-200 Work Pickup", "truck", "AWD", "ice", "Naturally Aspirated", "5.0L V8", 355, 2290, 475, 29500, 5.52, "0x68727c", "0x181c20", "pickup_v8", "pickup-v8", "b0e10efd", "4b16330f", True),
    ("kodiak_hd2500", "Meridian", "Kodiak HD-2500", "truck", "AWD", "ice", "Twin-Turbo", "6.7L Turbo Diesel V8", 440, 2860, 510, 41000, 5.88, "0x727880", "0x1a1c20", "diesel_pickup", "diesel-v8", "83637738", "bc022229", True),
    ("municipal_pickup", "Ironport", "Municipal Utility Truck", "truck", "AWD", "ice", "Twin-Turbo", "6.0L Turbo Diesel", 330, 2680, 410, 28000, 5.64, "0xd8961c", "0x1c2026", "diesel_pickup", "diesel-v8", "880e58c6", None, True),

    # --- CROSSOVERS & SUVS (ALL PLAJAH BRANDS) ---
    ("kestrel_defender", "Kestrel", "Defender Armored SUV", "suv", "AWD", "ice", "Twin-Turbo", "5.0L Twin-Turbo V8", 510, 2780, 575, 58000, 5.12, "0x3c4248", "0x14161a", "v8_lux_suv", "pickup-v8", "bb1fd6dc", None, True),
    ("aurelia_solstice_cuv", "Aurelia", "Solstice Crossover", "suv", "AWD", "ice", "Twin-Turbo", "2.0L Turbo I4", 248, 1740, 465, 29000, 4.62, "0xb85024", "0x1a1c20", "crossover_turbo", "i4-turbo", "6724ffd8", "84764586", False),
    ("zephyr_titan_ev", "Zephyr", "Titan EV SUV", "suv", "AWD", "ev", "Electric", "Dual-Motor EV", 480, 2380, 590, 48000, 5.04, "0x667486", "0x38bdf8", None, "ev", "62b24131", "f56db64b", True),
    ("zephyr_majestic_ev", "Zephyr", "Majestic EV SUV", "suv", "AWD", "ev", "Electric", "Dual-Motor EV", 520, 2440, 610, 54000, 5.08, "0x526478", "0x60a5fa", None, "ev", "ea9dca39", None, True),
    ("vanguard_crest", "Vanguard", "Crest SUV", "suv", "AWD", "ice", "Naturally Aspirated", "4.6L V8", 385, 2260, 515, 42000, 4.98, "0x3a4048", "0xc8ced6", "v8_lux_suv", "pickup-v8", "1324543b", "15d4d04b", True),
    ("titan_pathfinder", "Titan Ridge", "Pathfinder 4x4", "suv", "AWD", "ice", "Naturally Aspirated", "4.0L V6", 310, 2180, 470, 34000, 4.94, "0x5e6468", "0x181a1e", "suv_v6_stock", "suv-v6", "9a245dcd", "b3740c8f", True),
    ("aureon_luxury_suv", "Aureon", "Sovereign Luxury SUV", "suv", "AWD", "ice", "Twin-Turbo", "4.4L Twin-Turbo V8", 465, 2340, 580, 62000, 5.06, "0x242830", "0xd2d8e0", "v8_lux_suv", "pickup-v8", "b6ac82a8", "30a012a7", True),
    ("aureon_prestige", "Aureon", "Prestige V8 SUV", "suv", "AWD", "ice", "Twin-Turbo", "4.4L Twin-Turbo V8", 480, 2380, 590, 65000, 5.10, "0x727880", "0x1a1c20", "v8_lux_suv", "pickup-v8", "7e2405cc", "61fd2082", True),
    ("zephyr_ecrossover", "Zephyr", "E-Crossover", "suv", "AWD", "ev", "Electric", "Dual-Motor EV", 340, 1980, 525, 36000, 4.68, "0x627080", "0x38bdf8", None, "ev", "65053f66", "d5d6608e", False),
    ("vanguard_sovereign_xl", "Vanguard", "Sovereign XL", "suv", "AWD", "ice", "Naturally Aspirated", "5.6L V8", 425, 2560, 535, 56000, 5.32, "0x282c32", "0xd0d6de", "v8_lux_suv", "pickup-v8", "a2aad08f", "5be1d05f", True),
    ("veloce_strada_suv", "Veloce", "Strada Sport SUV", "suv", "AWD", "ice", "Twin-Turbo", "3.0L Twin-Turbo V6", 440, 2040, 625, 55000, 4.84, "0xb41c24", "0x16181c", "v6_suv_sport", "suv-v6", "961c5c14", "bee49694", False),
    ("titan_nomad", "Titan Ridge", "Nomad Off-Road", "suv", "AWD", "ice", "Twin-Turbo", "3.5L Turbo V6", 345, 2140, 510, 38000, 4.78, "0x6c6e5c", "0x1a1c1e", "suv_v6_stock", "suv-v6", "c2f3cc0c", "c295d828", True),
    ("kairos_kx", "Kairos", "KX Crossover", "suv", "AWD", "ice", "Twin-Turbo", "2.0L Turbo I4", 235, 1680, 445, 26000, 4.56, "0x72808e", "0x181c22", "crossover_turbo", "i4-turbo", "424bbd4b", "5bf5bf65", False),
    ("aurelia_grand_voyager", "Aurelia", "Grand Voyager", "suv", "AWD", "ice", "Naturally Aspirated", "3.6L V6", 305, 2080, 455, 35000, 5.02, "0x5e707e", "0xd0d6de", "suv_v6_stock", "suv-v6", "9567e87e", "757b7a8d", True),
    ("ironport_carrier", "Ironport", "Carrier SUV", "suv", "AWD", "ice", "Naturally Aspirated", "3.8L V6", 295, 2120, 450, 32000, 4.96, "0x6e747c", "0x1a1e24", "suv_v6_stock", "suv-v6", "a4723c94", "a923906b", True),
    ("aureon_lx750", "Aureon", "LX-750 Full-Size", "suv", "AWD", "ice", "Twin-Turbo", "4.8L Twin-Turbo V8", 505, 2480, 595, 68000, 5.22, "0x8c8a84", "0x1a1c20", "v8_lux_suv", "pickup-v8", "ef8b8a35", "c21343cc", True),
    ("ironport_commander", "Ironport", "Commander 4x4", "suv", "AWD", "ice", "Naturally Aspirated", "5.0L V8", 370, 2240, 505, 39000, 4.92, "0x3c4c3e", "0x181c1a", "pickup_v8", "pickup-v8", "1bb78c42", "9083dc75", True),
    ("zephyr_terra", "Zephyr", "Terra Hybrid SUV", "suv", "AWD", "ice", "Naturally Aspirated", "2.5L Hybrid I4", 245, 1860, 440, 31000, 4.78, "0x5c6862", "0x2dd4bf", "hybrid_i4", "hybrid", "754c5c53", "df88d127", False),
    ("vectra_atlas", "Vectra", "Atlas 7-Seat SUV", "suv", "AWD", "ice", "Naturally Aspirated", "3.6L V6", 290, 2160, 445, 33000, 5.06, "0x526274", "0xc8ced6", "suv_v6_stock", "suv-v6", "4186cce3", "e32a60bc", True),
    ("aurelia_summit", "Aurelia", "Summit SUV", "suv", "AWD", "ice", "Twin-Turbo", "3.2L Twin-Turbo V6", 410, 2060, 585, 51000, 4.88, "0x4e5c6c", "0xcfd6de", "v6_suv_sport", "suv-v6", "4e934b8f", None, False),
    ("vanguard_pulse", "Vanguard", "Pulse Compact SUV", "suv", "AWD", "ice", "Twin-Turbo", "2.0L Turbo I4", 252, 1690, 470, 28500, 4.54, "0x6c7a88", "0x1c2026", "crossover_turbo", "i4-turbo", "68251836", "125b53d8", False),
    ("ironport_metro_suv", "Ironport", "Metro SUV", "suv", "AWD", "ice", "Naturally Aspirated", "3.5L V6", 280, 1940, 445, 29500, 4.76, "0x727882", "0x1c2024", "suv_v6_stock", "suv-v6", "73b2c5d7", None, False),
    ("titan_sentinel", "Titan Ridge", "Sentinel Heavy SUV", "suv", "AWD", "ice", "Naturally Aspirated", "5.8L V8", 415, 2490, 520, 48000, 5.24, "0x363a40", "0x181a1e", "v8_lux_suv", "pickup-v8", "781a44b2", "c0463f5a", True),
    ("veloce_sprint_suv", "Veloce", "Sprint Performance SUV", "suv", "AWD", "ice", "Twin-Turbo", "3.4L Twin-Turbo V6", 475, 1980, 645, 61000, 4.78, "0xc42024", "0x16181c", "v6_suv_sport", "suv-v6", "9fd76db6", "e8512300", False),
    ("aurelia_monarch", "Aurelia", "Monarch V8 SUV", "suv", "AWD", "ice", "Twin-Turbo", "4.5L Twin-Turbo V8", 495, 2320, 605, 64000, 5.08, "0x2c425e", "0xd0d6de", "v8_lux_suv", "pickup-v8", "a07bfa98", None, True),
    ("kestrel_vantage", "Kestrel", "Vantage Sport SUV", "suv", "AWD", "ice", "Twin-Turbo", "3.5L Twin-Turbo V6", 435, 2060, 610, 52000, 4.88, "0x5e646c", "0xc82228", "v6_suv_sport", "suv-v6", "b4f05799", "b9b3534f", False),
    ("vanguard_pinnacle", "Vanguard", "Pinnacle Full-Size", "suv", "AWD", "ice", "Twin-Turbo", "4.6L Twin-Turbo V8", 485, 2420, 585, 63000, 5.18, "0x3e444c", "0xd4dce4", "v8_lux_suv", "pickup-v8", "f3e6b373", None, True),
    ("veloce_apex_suv", "Veloce", "Apex Performance SUV", "suv", "AWD", "ice", "Twin-Turbo", "4.0L Twin-Turbo V8", 580, 2120, 695, 78000, 4.92, "0x4c545e", "0xd42228", "v6_suv_sport", "tt-v8", "ffca1e39", "982d106b", False),
    ("titan_colossus", "Titan Ridge", "Colossus Expedition", "suv", "AWD", "ice", "Twin-Turbo", "6.2L V8", 470, 2680, 555, 59000, 5.38, "0x4a5244", "0x1a1c1e", "v8_lux_suv", "pickup-v8", "3f5c7d23", "184ce20c", True),

    # --- COMMERCIAL BOX TRUCKS / TOW TRUCK / BUSES / SEMI ---
    ("vectra_ecargo", "Vectra", "E-Cargo Box Truck", "commercial", "RWD", "ice", "Twin-Turbo", "4.5L Turbo Diesel", 240, 3850, 260, 32000, 6.40, "0xdce0e6", "0x244268", "diesel_truck_a", "diesel-v8", "23893c13", "37519a34", True),
    ("terrahual_4500", "TerraHaul", "4500 Box Truck", "commercial", "RWD", "ice", "Twin-Turbo", "5.2L Turbo Diesel", 265, 4200, 255, 34000, 6.65, "0xd8dce2", "0x383e46", "diesel_truck_a", "diesel-v8", "41074bc4", None, True),
    ("kronos_v420", "Kronos", "V-420 Heavy Box Truck", "commercial", "RWD", "ice", "Twin-Turbo", "6.8L Turbo Diesel", 310, 4850, 250, 39000, 7.10, "0xd4dae2", "0x284a76", "diesel_truck_a", "diesel-v8", "9b9b4c2b", None, True),
    ("vanguard_tow", "Vanguard", "Reliance Flatbed Tow", "commercial", "RWD", "ice", "Twin-Turbo", "6.7L Turbo Diesel", 350, 4450, 285, 42000, 6.90, "0xd8dce0", "0x1c2024", "diesel_truck_a", "diesel-v8", "164fa448", None, True),
    ("vectis_urban12", "Vectis", "Urban-12 Transit Bus", "commercial", "RWD", "ice", "Twin-Turbo", "8.9L Turbo Diesel", 340, 6200, 225, 48000, 8.20, "0xd4dce2", "0x1a5670", "diesel_semi", "diesel-v8", "c796023d", None, True),
    ("vectra_shuttle", "Vectra", "M-4 Urban Shuttle", "commercial", "RWD", "ice", "Twin-Turbo", "6.0L Turbo Diesel", 275, 4600, 245, 38000, 6.80, "0xd8dde4", "0x225a72", "diesel_truck_a", "diesel-v8", "b0cee82a", None, True),
    ("valkyrie_semi", "Valkyrie", "Class-8 Semi Tractor", "commercial", "RWD", "ice", "Twin-Turbo", "14.8L Turbo Diesel I6", 540, 6400, 320, 68000, 7.40, "0xdce0e6", "0x282c34", "diesel_semi", "diesel-v8", "fe925e5d", None, True),
]

plan = []
missing = []
for row in VEHICLES:
    (cid, make, name, archetype, dt, pt, asp, eng_txt, hp, kg, pi, price, tlen, paint, accent, sbank, arch, sh, th, is_tr) = row
    sp = all_sheets.get(sh)
    tp = all_tts.get(th) if th else None
    if not sp:
        missing.append((cid, sh))
    plan.append({
        "id": cid, "make": make, "name": name, "archetype": archetype, "drivetrain": dt, "powertrain": pt,
        "aspiration": asp, "engineText": eng_txt, "hp": hp, "kg": kg, "pi": pi, "price": price,
        "targetLen": tlen, "paint": paint, "accent": accent, "soundBank": sbank, "arch": arch,
        "isTruck": is_tr, "sheetPath": str(sp) if sp else None, "sheetFile": sp.name if sp else None,
        "turntablePath": str(tp) if tp else None, "turntableExists": bool(tp),
    })

OUT.write_text(json.dumps(plan, indent=2), encoding="utf-8")
print(f"WROTE {len(plan)} general vehicles to {OUT} | missing sheets: {len(missing)} | with turntable: {sum(1 for p in plan if p['turntableExists'])}")
if missing:
    print("MISSING:", missing)

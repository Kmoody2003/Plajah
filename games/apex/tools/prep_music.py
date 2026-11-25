"""Copy the soundtrack from the racer 'Music apex elohim' folder into the game and write music.json.
Identical files (same MD5) are used once. Titles containing 'apex elohim' are menu tracks, the rest play while driving."""
import glob, hashlib, json, os, shutil
SRC = "D:/plajah game assets deign from promtps/racer/Music apex elohim"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "public", "games", "apex", "music")
os.makedirs(OUT, exist_ok=True)
for f in glob.glob(os.path.join(OUT, "*.mp3")):
    os.remove(f)
seen, menu, drive, dup = {}, [], [], []
for f in sorted(glob.glob(os.path.join(SRC, "*.mp3"))):
    h = hashlib.md5(open(f, "rb").read()).hexdigest()
    name = os.path.basename(f)
    if h in seen:
        dup.append((name, seen[h]))
        continue
    seen[h] = name
    kind = "menu" if "apex elohim" in name.lower() else "drive"
    fn = f"{kind}{len(menu) if kind == 'menu' else len(drive)}.mp3"
    shutil.copyfile(f, os.path.join(OUT, fn))
    (menu if kind == "menu" else drive).append({"file": fn, "title": os.path.splitext(name)[0]})
json.dump({"menu": menu, "drive": drive}, open(os.path.join(OUT, "music.json"), "w"), indent=1)
print("menu", [m["title"] for m in menu], "drive", [d["title"] for d in drive], "duplicates skipped", dup)

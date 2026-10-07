"""
Builds a Fabula production (editable timeline) that mirrors the Douglass documentary short.

  python scripts/dossier/build_fabula_project.py [workdir] [--slug=douglass|ford|persia]

Reads the same inputs as build_film.py and the trimmed narration wavs it produced, writes
data/dossier/douglassFabula.json. Open it in Fabula from the hall ("Open film in Fabula").
"""
import json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FFDIR = os.environ.get("FFMPEG_DIR", r"C:\Users\Kenne\tools\ffmpeg\ffmpeg-9.0.2-essentials_build\bin")
FFPROBE = os.path.join(FFDIR, "ffprobe.exe")
SLUG = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--slug=")), "douglass")
NAME = {"douglass": "Douglass", "ford": "Ford", "persia": "Persia"}.get(SLUG, SLUG.title())
_pos = [a for a in sys.argv[1:] if not a.startswith("--")]
work = os.path.abspath(_pos[0]) if _pos else os.path.join(ROOT, ".film-work")

film = json.load(open(os.path.join(ROOT, "data/dossier/" + SLUG + "Film.json"), encoding="utf-8"))
assets = {a["id"]: a for a in json.load(open(os.path.join(ROOT, "data/dossier/" + SLUG + "Assets.json"), encoding="utf-8"))}


def dur(path):
    out = subprocess.run([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path],
                         capture_output=True, text=True, check=True).stdout
    return float(out.strip())


def thumb(url, width=1280):
    m = re.match(r"^(https://upload\.wikimedia\.org/wikipedia/commons)/([0-9a-f]/[0-9a-f]{2})/([^/]+)$", url)
    return f"{m[1]}/thumb/{m[2]}/{m[3]}/{width}px-{m[3]}" if m else url


SUB_FX = {"op": 1, "sc": 1, "x": 0, "y": 0, "rot": 0, "blur": 0, "bri": 1, "con": 1, "sat": 1, "blend": "screen",
          "fadeIn": 0.1, "fadeOut": 0.15, "matte": {"t": "none", "x": 50, "y": 50, "w": 60, "h": 60, "f": 0}, "genNote": ""}
PIC_FX = dict(SUB_FX, blend="normal", fadeIn=0.5, fadeOut=0.5)
AUD_FX = dict(SUB_FX, blend="normal", fadeIn=0.0, fadeOut=0.0)

TITLE_LEN, CREDITS_LEN, PAD = 4.5, 7.0, 0.9
media, clips = [], []
img_ids = {}
for b in film["beats"]:
    if "recon" in b:
        rid = b["recon"]
        if rid in img_ids:
            continue
        media.append({"id": f"img_{rid}", "name": b["caption"], "type": "image", "url": f"/dossier/{SLUG}/recon/{rid}." + ("jpg" if os.path.exists(os.path.join(ROOT, "public", "dossier", SLUG, "recon", rid + ".jpg")) else "png"), "bin": f"{NAME} · Reconstructions",
                      "tags": ["reconstruction", "generated"], "credit": "Reconstruction generated with Google Nano Banana Pro via Magnific", "license": "generated"})
        img_ids[rid] = f"img_{rid}"
        continue
    aid = b["asset"]
    if aid in img_ids:
        continue
    a = assets[aid]
    media.append({"id": f"img_{aid}", "name": a["title"], "type": "image", "url": thumb(a["url"]), "bin": f"{NAME} · Archive",
                  "tags": ["public-domain", "archive"], "credit": a["rights"]["credit"], "license": a["rights"]["status"], "source": a["recordUrl"]})
    img_ids[aid] = f"img_{aid}"

t = TITLE_LEN
clips.append({"id": "clip_title", "trackId": "s1", "start": 0, "duration": TITLE_LEN, "kind": "title", "text": film["displayTitle"],
              "subtitle": film["subtitle"], "titleStyle": "classic", "label": "Title", "srcIn": 0, "fx": dict(SUB_FX)})
for i, b in enumerate(film["beats"]):
    wav = os.path.join(work, "audio", f"beat_{i}.wav")
    d = dur(wav) + PAD
    narr_id = f"narr_{i}"
    media.append({"id": narr_id, "name": f"Narration {i + 1}", "type": "audio", "url": f"/dossier/{SLUG}/film/audio/beat_{i}.mp3",
                  "duration": round(d - PAD, 2), "bin": f"{NAME} · Narration", "tags": ["narration"],
                  "credit": "Synthetic voice (ElevenLabs via Magnific)", "license": "generated"})
    clips.append({"id": f"clip_pic_{i}", "trackId": "v1", "start": round(t, 3), "duration": round(d, 3), "kind": "media",
                  "label": b["caption"], "assetId": img_ids[b.get("recon") or b["asset"]], "srcIn": 0, "fx": dict(PIC_FX)})
    clips.append({"id": f"clip_narr_{i}", "trackId": "a1", "start": round(t + 0.15, 3), "duration": round(d - PAD, 3), "kind": "media",
                  "label": f"Narration {i + 1}", "assetId": narr_id, "srcIn": 0, "fx": dict(AUD_FX)})
    clips.append({"id": f"clip_sub_{i}", "trackId": "s1", "start": round(t + 0.15, 3), "duration": round(d - 0.65, 3), "kind": "subtitle",
                  "text": b["text"], "label": f"Line {i + 1}", "srcIn": 0, "fx": dict(SUB_FX)})
    t += d
clips.append({"id": "clip_credits", "trackId": "s1", "start": round(t, 3), "duration": CREDITS_LEN, "kind": "title", "text": "Images",
              "subtitle": "Public-domain archive images. Credits on screen and in the exhibit.", "titleStyle": "minimal",
              "label": "Credits", "srcIn": 0, "fx": dict(SUB_FX)})
total = t + CREDITS_LEN

media.append({"id": "score_main", "name": "Score — original orchestral underscore", "type": "audio", "url": f"/dossier/{SLUG}/score.mp3",
              "duration": round(dur(os.path.join(ROOT, "public", "dossier", SLUG, "score.mp3")), 1), "bin": f"{NAME} · Music", "tags": ["score"], "credit": "Generated with Google Lyria via Magnific", "license": "generated"})
clips.append({"id": "clip_score", "trackId": "a2", "start": 0, "duration": round(total, 3), "kind": "media", "label": "Score",
              "assetId": "score_main", "srcIn": 0, "fx": dict(AUD_FX)})

prod = {
    "id": f"prod_{SLUG}_explainer", "title": film["title"].replace(": A Life in Brief", "").replace(": A Journey in Brief", "") + " — documentary short", "type": "film",
    "description": "Generated by the Plajah Dossier pipeline. Real public-domain images; synthetic narration and score.",
    "themes": "", "world": "", "cast": [], "mediaPool": media,
    "tracks": [
        {"id": "s1", "name": "S1 · SUBTITLES", "type": "subtitle"},
        {"id": "v2", "name": "V2 · OVERLAY", "type": "video"},
        {"id": "v1", "name": "V1 · PICTURE", "type": "video"},
        {"id": "a1", "name": "A1 · DIALOGUE", "type": "audio"},
        {"id": "a2", "name": "A2 · MUSIC", "type": "audio"},
    ],
    "defaults": {"style": "", "aspect": "16:9", "service": "kling", "stillTarget": "mj_magnific",
                 "format": {"preset": "hd1080", "label": "HD 1080p", "w": 1920, "h": 1080, "fps": 30, "drop": False}},
    "acts": [{"id": f"act_{n}", "number": n, "title": "ACT " + ["I", "II", "III"][n - 1], "scenes": []} for n in (1, 2, 3)],
    "edits": [{"id": "edit_main", "title": "Documentary short", "timeline": {"clips": clips, "trackSettings": {}}, "updatedAt": 0}],
    "worldCats": {}, "design": {}, "createdAt": 0, "updatedAt": 0,
}
out = os.path.join(ROOT, "data", "dossier", f"{SLUG}Fabula.json")
json.dump(prod, open(out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print(f"wrote {out}: {len(clips)} clips, {len(media)} media items, {total:.1f}s")

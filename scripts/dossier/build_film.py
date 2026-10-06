"""
Builds a short documentary from a dossier film script using only real, rights-cleared images.

  python scripts/dossier/build_film.py [workdir]

Inputs : data/dossier/douglassFilm.json (beats), data/dossier/douglassAssets.json (credits)
Needs  : ffmpeg/ffprobe (set FFMPEG_DIR or default tools folder), Pillow, Windows SAPI voices.
Output : <workdir>/out/<id>.mp4 plus .srt (accessibility, and importable into Fabula).

Narration is a swappable layer: audio/beat_N.wav. Replace those files with a better voice and
rerun with --skip-tts to keep the same edit.
"""
import json, os, subprocess, sys, time, urllib.request, textwrap, re
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FFDIR = os.environ.get("FFMPEG_DIR", r"C:\Users\Kenne\tools\ffmpeg\ffmpeg-9.0.2-essentials_build\bin")
FFMPEG, FFPROBE = os.path.join(FFDIR, "ffmpeg.exe"), os.path.join(FFDIR, "ffprobe.exe")
UA = "PlajahDossier/0.1 (research; contact kmoody2003@gmail.com)"
W, H, FPS = 1280, 720, 30
GEORGIA = r"C:\Windows\Fonts\georgia.ttf"
GEORGIA_B = r"C:\Windows\Fonts\georgiab.ttf"

args = [a for a in sys.argv[1:] if not a.startswith("--")]
SKIP_TTS = "--skip-tts" in sys.argv
work = os.path.abspath(args[0]) if args else os.path.join(ROOT, ".film-work")
for d in ("img", "audio", "seg", "ovl", "out"):
    os.makedirs(os.path.join(work, d), exist_ok=True)

film = json.load(open(os.path.join(ROOT, "data/dossier/douglassFilm.json"), encoding="utf-8"))
assets = {a["id"]: a for a in json.load(open(os.path.join(ROOT, "data/dossier/douglassAssets.json"), encoding="utf-8"))}


def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        raise RuntimeError(f"{cmd[0]} failed:\n{r.stderr[-1500:]}")
    return r


def commons_thumb(url, width=1280):
    m = re.match(r"^(https://upload\.wikimedia\.org/wikipedia/commons)/([0-9a-f]/[0-9a-f]{2})/([^/]+)$", url)
    return f"{m[1]}/thumb/{m[2]}/{m[3]}/{width}px-{m[3]}" if m else url


def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 5000:
        return
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as f:
                f.write(r.read())
            time.sleep(1.2)
            return
        except Exception as e:  # rate limits etc.
            time.sleep(3 * (attempt + 1))
            err = e
    raise RuntimeError(f"download failed {url}: {err}")


def duration(path):
    out = run([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path]).stdout
    return float(out.strip())


def tts(text, wav, voice):
    txt = wav + ".txt"
    open(txt, "w", encoding="utf-8").write(text)
    ps = (
        "Add-Type -AssemblyName System.Speech;"
        "$s=New-Object System.Speech.Synthesis.SpeechSynthesizer;"
        f"$s.SelectVoice('{voice}');$s.Rate=-1;"
        f"$s.SetOutputToWaveFile('{wav}');"
        f"$s.Speak([IO.File]::ReadAllText('{txt}'));$s.Dispose()"
    )
    run(["powershell", "-NoProfile", "-Command", ps])


def font(path, size):
    return ImageFont.truetype(path, size)


def subtitle_png(text, dest):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    f = font(GEORGIA, 30)
    lines = textwrap.wrap(text, width=58)
    lh = 42
    y0 = H - 40 - lh * len(lines)
    box_w = max(d.textlength(l, font=f) for l in lines) + 48
    d.rounded_rectangle([(W - box_w) / 2, y0 - 14, (W + box_w) / 2, y0 + lh * len(lines) + 6], 14, fill=(0, 0, 0, 150))
    for i, l in enumerate(lines):
        d.text((W / 2, y0 + i * lh), l, font=f, fill="white", anchor="ma")
    img.save(dest)


def credit_png(text, dest):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    f = font(GEORGIA, 16)
    d.text((W - 20, 18), text, font=f, fill=(255, 255, 255, 190), anchor="ra", stroke_width=2, stroke_fill=(0, 0, 0, 220))
    img.save(dest)


def card_png(lines, dest, sizes):
    img = Image.new("RGB", (W, H), (13, 11, 16))
    d = ImageDraw.Draw(img)
    total = sum(s + 18 for s in sizes)
    y = (H - total) / 2
    for line, s in zip(lines, sizes):
        d.text((W / 2, y), line, font=font(GEORGIA_B if s > 40 else GEORGIA, s), fill=(242, 236, 246), anchor="ma")
        y += s + 18
    img.save(dest)


# 1 ── narration + timing
segs = []
t = 0.0
srt = []
for i, b in enumerate(film["beats"]):
    wav = os.path.join(work, "audio", f"beat_{i}.wav")
    if not SKIP_TTS or not os.path.exists(wav):
        tts(b["text"], wav, film["voice"])
    dur = duration(wav) + 1.0
    a = assets[b["asset"]]
    fetch(commons_thumb(a["url"]), os.path.join(work, "img", f"{b['asset']}.jpg"))
    segs.append((i, b, wav, dur))
    srt.append((t + 0.15, t + dur - 0.5, b["text"]))
    t += dur

# 2 ── segments
def common_out(path):
    return ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", str(FPS),
            "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", path]


seg_files = []
card_png([film["displayTitle"], film["subtitle"], "A Plajah Dossier"], os.path.join(work, "ovl", "title.png"), [72, 28, 20])
p = os.path.join(work, "seg", "title.mp4")
run([FFMPEG, "-y", "-loop", "1", "-t", "4.5", "-i", os.path.join(work, "ovl", "title.png"),
     "-f", "lavfi", "-t", "4.5", "-i", "anullsrc=r=48000:cl=stereo",
     "-vf", f"fade=t=in:st=0:d=0.8,fade=t=out:st=3.7:d=0.8", "-shortest"] + common_out(p))
seg_files.append(p)

for i, b, wav, dur in segs:
    a = assets[b["asset"]]
    img = os.path.join(work, "img", f"{b['asset']}.jpg")
    sub, cred = os.path.join(work, "ovl", f"sub_{i}.png"), os.path.join(work, "ovl", f"cred_{i}.png")
    subtitle_png(b["text"], sub)
    credit_png(f"{b['caption']} · Public domain", cred)
    with Image.open(img) as im:
        ar = im.width / im.height
    fh = 470
    fw = min(1180, int(fh * ar) // 2 * 2)
    fh = int(fw / ar) // 2 * 2 if fw == 1180 else fh
    n = int(dur * FPS)
    zoom = "1+0.10*on/%d" % n
    fc = (
        f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=28:6,eq=brightness=-0.28:saturation=0.8[bg];"
        f"[0:v]scale={fw*2}:{fh*2},zoompan=z='{zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={fw}x{fh}:fps={FPS}[fg];"
        f"[bg]trim=end_frame={n},setpts=PTS-STARTPTS[bgt];"
        f"[bgt][fg]overlay=(W-w)/2:48:shortest=1[v1];[v1][1:v]overlay[v2];[v2][2:v]overlay,"
        f"fade=t=in:st=0:d=0.5,fade=t=out:st={dur-0.5:.2f}:d=0.5[v]"
    )
    p = os.path.join(work, "seg", f"beat_{i}.mp4")
    run([FFMPEG, "-y", "-loop", "1", "-framerate", str(FPS), "-t", f"{dur:.2f}", "-i", img,
         "-loop", "1", "-t", f"{dur:.2f}", "-i", sub, "-loop", "1", "-t", f"{dur:.2f}", "-i", cred,
         "-i", wav, "-filter_complex", fc, "-map", "[v]", "-map", "3:a", "-af", "apad,volume=1.0", "-t", f"{dur:.2f}"] + common_out(p))
    seg_files.append(p)

credits = ["Images", "Public-domain photographs, engravings and documents from library and museum",
           "collections, via Wikimedia Commons. Each credit appears on screen and in the exhibit.",
           "Text reviewed against: Narrative (1845); My Bondage and My Freedom (1855); Life and Times (1881/1892);",
           "D. W. Blight, Frederick Douglass: Prophet of Freedom (2018). Draft narration: synthetic voice."]
card_png(credits, os.path.join(work, "ovl", "credits.png"), [34, 22, 22, 20, 20])
p = os.path.join(work, "seg", "credits.mp4")
run([FFMPEG, "-y", "-loop", "1", "-t", "7", "-i", os.path.join(work, "ovl", "credits.png"),
     "-f", "lavfi", "-t", "7", "-i", "anullsrc=r=48000:cl=stereo",
     "-vf", "fade=t=in:st=0:d=0.8,fade=t=out:st=6.2:d=0.8", "-shortest"] + common_out(p))
seg_files.append(p)

# 3 ── concat + srt
lst = os.path.join(work, "seg", "list.txt")
open(lst, "w").write("".join(f"file '{f.replace(chr(92), '/')}'\n" for f in seg_files))
out = os.path.join(work, "out", f"{film['id']}.mp4")
run([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", out])


def ts(x):
    h, m, s = int(x // 3600), int(x % 3600 // 60), x % 60
    return f"{h:02d}:{m:02d}:{int(s):02d},{int(round((s % 1) * 1000)):03d}"


offset = 4.5
with open(os.path.join(work, "out", f"{film['id']}.srt"), "w", encoding="utf-8") as f:
    for k, (a, z, text) in enumerate(srt, 1):
        f.write(f"{k}\n{ts(a + offset)} --> {ts(z + offset)}\n{text}\n\n")
print(f"OK {out}  {duration(out):.1f}s  {os.path.getsize(out)/1e6:.1f} MB")

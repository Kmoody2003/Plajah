import json
import math
import os
import subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.getcwd()
OUT_DIR = os.path.join(ROOT, "public", "promo", "chora")
AUDIO_DIR = os.path.join(OUT_DIR, "audio")
CLIPS_DIR = os.path.join(OUT_DIR, "clips")
PLATES_DIR = os.path.join(OUT_DIR, "plates")
FFMPEG = r"C:\Users\Kenne\tools\ffmpeg\ffmpeg-9.0.2-essentials_build\bin\ffmpeg.exe"

W, H = 1920, 1080
FPS = 30
DURATION = 30.0
TOTAL_FRAMES = int(DURATION * FPS)  # 900

# Plajah Brand Palette
C_BG = (6, 6, 12)
C_ORANGE = (255, 140, 0)      # #FF8C00
C_MAGENTA = (212, 0, 85)      # #D40055
C_PURPLE = (107, 0, 153)      # #6B0099
C_CYAN = (0, 218, 243)        # #00DAF3
C_BRASS = (224, 164, 88)      # #E0A458
C_EMERALD = (16, 185, 129)    # #10B981
C_WHITE = (248, 250, 252)
C_MUTED = (148, 163, 184)


def load_font(size: int, bold: bool = True, mono: bool = False):
    candidates = []
    if mono:
        candidates = [
            r"C:\Windows\Fonts\consolab.ttf",
            r"C:\Windows\Fonts\consola.ttf",
            r"C:\Windows\Fonts\courbd.ttf",
        ]
    elif bold:
        candidates = [
            r"C:\Windows\Fonts\bahnschrift.ttf",
            r"C:\Windows\Fonts\segoeuib.ttf",
            r"C:\Windows\Fonts\arialbd.ttf",
            r"C:\Windows\Fonts\impact.ttf",
        ]
    else:
        candidates = [
            r"C:\Windows\Fonts\segoeui.ttf",
            r"C:\Windows\Fonts\arial.ttf",
        ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
    return ImageFont.load_default()


FONTS = {
    "hero_xl": load_font(86, bold=True),
    "hero_lg": load_font(66, bold=True),
    "hero_md": load_font(48, bold=True),
    "title_sm": load_font(32, bold=True),
    "ui_lg": load_font(26, bold=True),
    "ui_md": load_font(20, bold=True),
    "ui_sm": load_font(16, bold=False),
    "ui_xs": load_font(13, bold=True),
    "mono_lg": load_font(24, bold=True, mono=True),
    "mono_md": load_font(17, bold=True, mono=True),
    "mono_sm": load_font(14, bold=True, mono=True),
}


def lerp_color(c1, c2, t: float):
    t = max(0.0, min(1.0, float(t)))
    return (
        int(c1[0] + (c2[0] - c1[0]) * t),
        int(c1[1] + (c2[1] - c1[1]) * t),
        int(c1[2] + (c2[2] - c1[2]) * t),
    )


def plajah_gradient_color(t: float):
    t = max(0.0, min(1.0, float(t)))
    if t < 0.5:
        return lerp_color(C_ORANGE, C_MAGENTA, t * 2.0)
    return lerp_color(C_MAGENTA, C_CYAN, (t - 0.5) * 2.0)


def make_base_background(bass: float, high: float, t_sec: float, accent_mode: int = 0) -> np.ndarray:
    """Fast vectorized 1920x1080 dark obsidian + audio-reactive radial aura background."""
    # Compute on 240x135 grid and upscale 8x for silky smooth gradients
    gw, gh = 240, 135
    y = np.linspace(-1.0, 1.0, gh)[:, None]
    x = np.linspace(-1.777, 1.777, gw)[None, :]

    cx1 = 0.55 * math.sin(t_sec * 0.9 + accent_mode)
    cy1 = 0.35 * math.cos(t_sec * 0.7 + accent_mode)
    d1 = np.sqrt((x - cx1) ** 2 + (y - cy1) ** 2)

    cx2 = -0.65 * math.cos(t_sec * 0.65)
    cy2 = -0.30 * math.sin(t_sec * 0.85)
    d2 = np.sqrt((x - cx2) ** 2 + (y - cy2) ** 2)

    glow1 = np.exp(-d1 * (1.85 - 0.55 * bass)) * (0.28 + 0.42 * bass)
    glow2 = np.exp(-d2 * 2.1) * (0.22 + 0.30 * high)

    if accent_mode % 3 == 0:
        c1, c2 = C_ORANGE, C_MAGENTA
    elif accent_mode % 3 == 1:
        c1, c2 = C_MAGENTA, C_CYAN
    else:
        c1, c2 = C_CYAN, C_PURPLE

    r = np.clip(6.0 + glow1 * c1[0] + glow2 * c2[0], 0, 255).astype(np.uint8)
    g = np.clip(6.0 + glow1 * c1[1] + glow2 * c2[1], 0, 255).astype(np.uint8)
    b = np.clip(14.0 + glow1 * c1[2] + glow2 * c2[2], 0, 255).astype(np.uint8)

    small = np.stack([r, g, b], axis=-1)
    img = Image.fromarray(small, mode="RGB").resize((W, H), Image.Resampling.BILINEAR)
    return img


def draw_cyber_grid_and_chrome(draw: ImageDraw.ImageDraw, t_sec: float, bass: float, bpm: float, sec_badge: str):
    """Draws Plajah Chora top masthead chrome, timecode telemetry, and subtle perspective grid."""
    # Subtle background architectural grid lines
    grid_col = (24, 26, 42)
    for gx in range(120, W, 160):
        draw.line([(gx, 72), (gx, H - 64)], fill=grid_col, width=1)
    for gy in range(140, H - 64, 140):
        draw.line([(0, gy), (W, gy)], fill=grid_col, width=1)

    # Top Chora Masthead Bar
    draw.rectangle([0, 0, W, 68], fill=(9, 10, 18))
    draw.line([(0, 68), (W, 68)], fill=(45, 48, 72), width=2)
    # Animated Plajah gradient accent line under masthead
    accent_w = int(W * (0.35 + 0.65 * bass))
    draw.line([(0, 69), (accent_w, 69)], fill=C_ORANGE, width=3)

    # Plajah Chora brand pill left
    draw.rounded_rectangle([36, 14, 290, 54], radius=10, fill=(22, 18, 34), outline=C_ORANGE, width=2)
    draw.ellipse([50, 26, 66, 42], fill=C_ORANGE)
    draw.text((76, 20), "PLAJAH CHORA", font=FONTS["ui_md"], fill=C_WHITE)

    # Masthead Navigation Tabs
    nav_items = ["THE LISTENING ROOM", "FX STAGE 3D", "ORRERY", "SKY TONIGHT", "THE VAULT", "CHORA STUDIO", "ARTIST OS"]
    active_nav = int((t_sec / DURATION) * len(nav_items)) % len(nav_items)
    nx = 320
    for idx, label in enumerate(nav_items):
        is_act = idx == active_nav
        col = C_ORANGE if is_act else C_MUTED
        if is_act:
            draw.rounded_rectangle([nx - 10, 18, nx + len(label) * 9 + 14, 50], radius=6, fill=(38, 24, 18), outline=C_ORANGE, width=1)
        draw.text((nx, 24), label, font=FONTS["mono_sm"], fill=col)
        nx += len(label) * 9 + 34

    # Right telemetry: Now Playing K-Moody + BPM + Section Badge
    draw.rounded_rectangle([W - 470, 14, W - 36, 54], radius=8, fill=(16, 18, 30), outline=(55, 60, 88), width=1)
    pulse_r = 5 + int(bass * 4)
    draw.ellipse([W - 452 - pulse_r, 34 - pulse_r, W - 452 + pulse_r, 34 + pulse_r], fill=C_MAGENTA)
    draw.text((W - 434, 23), f"K-MOODY · GOLIATH LIONESS  |  {int(bpm)} BPM", font=FONTS["mono_sm"], fill=C_WHITE)

    # Bottom status & waveform scrub bar
    draw.rectangle([0, H - 52, W, H], fill=(8, 9, 16))
    draw.line([(0, H - 52), (W, H - 52)], fill=(38, 42, 64), width=1)
    prog_x = int((t_sec / DURATION) * W)
    draw.rectangle([0, H - 52, prog_x, H - 48], fill=C_ORANGE)
    draw.text((36, H - 36), sec_badge, font=FONTS["mono_md"], fill=C_ORANGE)
    tc_frames = int((t_sec % 1.0) * FPS)
    tc_secs = int(t_sec)
    draw.text(
        (W - 380, H - 36),
        f"24-BIT / 192KHZ FLAC   TC 00:00:{tc_secs:02d}:{tc_frames:02d}",
        font=FONTS["mono_md"],
        fill=C_CYAN,
    )


def draw_fft_spectrum_bars(
    draw: ImageDraw.ImageDraw,
    bands32: list[float],
    x0: int,
    y_bottom: int,
    total_w: int,
    max_h: int,
    mirror: bool = False,
):
    n = len(bands32)
    step = total_w / n
    bar_w = max(4, int(step * 0.68))
    for i, val in enumerate(bands32):
        bx = int(x0 + i * step)
        bh = max(6, int(val * max_h))
        col = plajah_gradient_color(i / max(1, n - 1))
        draw.rounded_rectangle([bx, y_bottom - bh, bx + bar_w, y_bottom], radius=3, fill=col)
        # Peak cap
        cap_y = y_bottom - bh - 8
        draw.rectangle([bx, cap_y, bx + bar_w, cap_y + 4], fill=C_WHITE)
        if mirror:
            mh = max(3, int(bh * 0.35))
            mcol = (col[0] // 3, col[1] // 3, col[2] // 3)
            draw.rounded_rectangle([bx, y_bottom + 4, bx + bar_w, y_bottom + 4 + mh], radius=2, fill=mcol)


def draw_act1_sonic_sanctuary(
    img: Image.Image,
    draw: ImageDraw.ImageDraw,
    cover_img: Image.Image,
    t_sec: float,
    local_t: float,
    bass: float,
    bands32: list[float],
    beat_pulse: float,
):
    """ACT 1: K-Moody Goliath EP Vinyl/Cover Ignition + Radial Visualizer + Chora Sanctuary UI."""
    cx, cy = 540, 510
    # Concentric audio-reactive shockwave rings around the Goliath EP art
    for ring_i in range(6, 0, -1):
        rad = int(170 + ring_i * 42 + bass * 48 * (ring_i / 4.0) + math.sin(t_sec * 6.0 - ring_i) * 10)
        col = plajah_gradient_color((ring_i / 6.0 + t_sec * 0.2) % 1.0)
        dim_col = (col[0] // 2, col[1] // 2, col[2] // 2)
        draw.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], outline=dim_col, width=2 if ring_i % 2 else 3)

    # Radial 32-band equalizer spokes around the vinyl disc
    for i, val in enumerate(bands32):
        ang = (i / 32.0) * math.tau + t_sec * 0.45
        ang2 = ang + math.tau / 32.0 * 0.7
        r_in = 225 + int(bass * 18)
        r_out = r_in + int(35 + val * 145)
        col = plajah_gradient_color(i / 31.0)
        x1 = cx + int(math.cos(ang) * r_in)
        y1 = cy + int(math.sin(ang) * r_in)
        x2 = cx + int(math.cos(ang) * r_out)
        y2 = cy + int(math.sin(ang) * r_out)
        draw.line([(x1, y1), (x2, y2)], fill=col, width=8)
        # Glowing tip dot
        draw.ellipse([x2 - 4, y2 - 4, x2 + 4, y2 + 4], fill=C_WHITE)

    # Vinyl disc & rotating K-Moody Goliath EP cover art
    vinyl_r = 215 + int(beat_pulse * 14)
    draw.ellipse([cx - vinyl_r, cy - vinyl_r, cx + vinyl_r, cy + vinyl_r], fill=(12, 12, 18), outline=C_ORANGE, width=4)
    for gr in range(155, vinyl_r - 8, 12):
        draw.ellipse([cx - gr, cy - gr, cx + gr, cy + gr], outline=(32, 34, 48), width=1)

    art_size = 280 + int(beat_pulse * 16)
    rot_cover = cover_img.resize((art_size, art_size), Image.Resampling.BILINEAR).rotate(-t_sec * 24.0, resample=Image.Resampling.BILINEAR)
    # Circular mask for album cover
    mask = Image.new("L", (art_size, art_size), 0)
    mdraw = ImageDraw.Draw(mask)
    mdraw.ellipse([0, 0, art_size - 1, art_size - 1], fill=255)
    img.paste(rot_cover, (cx - art_size // 2, cy - art_size // 2), mask)
    draw.ellipse([cx - art_size // 2, cy - art_size // 2, cx + art_size // 2, cy + art_size // 2], outline=C_WHITE, width=3)

    # Right-side Chora Now Playing & Feature Telemetry Card
    px, py, pw, ph = 980, 145, 860, 740
    draw.rounded_rectangle([px, py, px + pw, py + ph], radius=22, fill=(12, 14, 26), outline=(58, 64, 96), width=2)
    draw.rounded_rectangle([px + 28, py + 26, px + 310, py + 62], radius=8, fill=(42, 24, 14), outline=C_ORANGE, width=1)
    draw.text((px + 44, py + 34), "NOW PLAYING ON CHORA", font=FONTS["mono_sm"], fill=C_ORANGE)
    draw.text((px + 340, py + 34), "ALBUM // GOLIATH EP", font=FONTS["mono_sm"], fill=C_CYAN)

    draw.text((px + 28, py + 82), "GOLIATH LIONESS", font=FONTS["hero_md"], fill=C_WHITE)
    draw.text((px + 28, py + 142), "K-MOODY  ·  FEAT. REAL-TIME AUDIO-REACTIVE ENGINE", font=FONTS["ui_md"], fill=C_BRASS)

    # Feature pills grid
    pills = [
        ("7 VISUALIZER ENGINES", "MILKDROP · SHADER · FLUX · TYPO", C_ORANGE),
        ("24-BIT / 192KHZ FLAC", "BIT-PERFECT LOSSLESS AUDIO", C_CYAN),
        ("CHORA STUDIO MIXER", "AI STEMS · MACKIE · MELOS DAW", C_MAGENTA),
        ("ARTIST MANAGER OS", "TOURS · SYNC · ROYALTIES · PROMO", C_EMERALD),
    ]
    for idx, (p_title, p_sub, p_col) in enumerate(pills):
        col_i = idx % 2
        row_i = idx // 2
        bx = px + 28 + col_i * 408
        by = py + 205 + row_i * 120
        draw.rounded_rectangle([bx, by, bx + 390, by + 102], radius=14, fill=(18, 21, 38), outline=p_col, width=2)
        draw.text((bx + 20, by + 20), p_title, font=FONTS["ui_md"], fill=p_col)
        draw.text((bx + 20, by + 56), p_sub, font=FONTS["mono_sm"], fill=C_WHITE)

    # Bottom FFT Analyzer inside the card
    draw.text((px + 28, py + 470), "LIVE 32-BAND HARMONIC TELEMETRY", font=FONTS["mono_sm"], fill=C_MUTED)
    draw_fft_spectrum_bars(draw, bands32, px + 28, py + 690, pw - 56, 185, mirror=True)


def draw_act2_fx_stage(
    img: Image.Image,
    draw: ImageDraw.ImageDraw,
    cover_img: Image.Image,
    t_sec: float,
    local_t: float,
    bass: float,
    bands32: list[float],
    beat_pulse: float,
):
    """ACT 2: Chora 7-Engine FX Stage (Milkdrop + Shader + Generator + Flux + Typo + Kaiju + Looks)."""
    # FX Stage Mode Selector Dock at top center
    modes = ["MILKDROP", "SHADER", "GENERATOR", "FLUX 3D", "TYPO", "KAIJU", "LOOKS"]
    active_m = int((local_t * 2.2) % len(modes))
    dock_x, dock_y, dock_w, dock_h = 260, 96, 1400, 64
    draw.rounded_rectangle([dock_x, dock_y, dock_x + dock_w, dock_y + dock_h], radius=32, fill=(14, 16, 28), outline=(64, 70, 108), width=2)

    cell_w = dock_w // len(modes)
    for i, m_name in enumerate(modes):
        mx = dock_x + i * cell_w
        if i == active_m:
            draw.rounded_rectangle([mx + 8, dock_y + 8, mx + cell_w - 8, dock_y + dock_h - 8], radius=24, fill=C_ORANGE, outline=C_WHITE, width=2)
            draw.text((mx + 34, dock_y + 21), m_name, font=FONTS["ui_md"], fill=(10, 10, 16))
        else:
            draw.text((mx + 34, dock_y + 21), m_name, font=FONTS["ui_md"], fill=C_WHITE)

    # Center Canvas: Psychedelic Milkdrop Sacred Geometry + Flux Particle Vortex
    cx, cy = W // 2, 545
    num_polygons = 9
    for p in range(num_polygons, 0, -1):
        scale = p * 44 + int(bass * 65)
        rot = t_sec * (1.2 if p % 2 == 0 else -0.9) + p * 0.35
        sides = 6 if p % 2 == 0 else 8
        pts = []
        for s in range(sides):
            ang = rot + (s / sides) * math.tau
            r_mod = scale * (1.0 + 0.18 * bands32[(p * 3 + s) % 32])
            pts.append((cx + int(math.cos(ang) * r_mod), cy + int(math.sin(ang) * r_mod)))
        pts.append(pts[0])
        col = plajah_gradient_color((p / num_polygons + t_sec * 0.25) % 1.0)
        draw.line(pts, fill=col, width=3 if p % 2 == 0 else 2)

    # Flux 3D orbiting particle swarm reacting to high/mid frequencies
    for pt_i in range(64):
        seed = pt_i * 1.6180339
        orbit_r = 90 + (pt_i * 9) % 440 + bass * 55
        ang = seed * 4.0 + t_sec * (1.5 + (pt_i % 5) * 0.3)
        px = cx + int(math.cos(ang) * orbit_r * 1.35)
        py = cy + int(math.sin(ang * 1.2) * orbit_r * 0.68)
        pr = 3 + int(bands32[pt_i % 32] * 9)
        pcol = C_CYAN if pt_i % 3 == 0 else (C_ORANGE if pt_i % 3 == 1 else C_MAGENTA)
        draw.ellipse([px - pr, py - pr, px + pr, py + pr], fill=pcol)

    # Left & Right Inspector Cards showing live shader uniforms & audio bindings
    draw.rounded_rectangle([56, 210, 470, 620], radius=18, fill=(12, 14, 24), outline=C_CYAN, width=2)
    draw.text((80, 234), "PLAJAH PIXELS // SHADER UNIFORMS", font=FONTS["mono_sm"], fill=C_CYAN)
    params = [
        ("SUB_BASS_GAIN", min(1.0, bass * 1.25), C_ORANGE),
        ("WARP_VORTEX", 0.65 + 0.30 * math.sin(t_sec * 3.0), C_MAGENTA),
        ("BLOOM_INTENSITY", 0.72 + 0.25 * beat_pulse, C_CYAN),
        ("CHROMATIC_SHIFT", 0.45 + 0.40 * bands32[8], C_EMERALD),
        ("KALEIDOSCOPE_SYM", 0.84, C_BRASS),
    ]
    for idx, (pname, pval, pcol) in enumerate(params):
        by = 282 + idx * 64
        draw.text((80, by), f"{pname}: {int(pval * 100)}%", font=FONTS["mono_sm"], fill=C_WHITE)
        draw.rounded_rectangle([80, by + 26, 442, by + 42], radius=6, fill=(28, 32, 52))
        draw.rounded_rectangle([80, by + 26, 80 + int(362 * pval), by + 42], radius=6, fill=pcol)

    # Right card: Preset & Look Stack
    draw.rounded_rectangle([W - 470, 210, W - 56, 620], radius=18, fill=(12, 14, 24), outline=C_ORANGE, width=2)
    draw.text((W - 446, 234), "ACTIVE VISUALIZER STACK", font=FONTS["mono_sm"], fill=C_ORANGE)
    stack_items = [
        ("01  HYPNOTIC FLOW", "Audio-Reactive Raymarching", C_ORANGE),
        ("02  NEON VORTEX 3D", "64K GPU Particle Swarm", C_MAGENTA),
        ("03  SACRED MANDALA", "Sub-Bass Harmonic Geometry", C_CYAN),
        ("04  ANAMORPHIC BLOOM", "Plajah Colorist LUT Grade", C_EMERALD),
    ]
    for idx, (st_title, st_sub, st_col) in enumerate(stack_items):
        by = 280 + idx * 80
        draw.rounded_rectangle([W - 446, by, W - 80, by + 66], radius=10, fill=(20, 24, 42), outline=st_col, width=1)
        draw.text((W - 426, by + 12), st_title, font=FONTS["ui_md"], fill=st_col)
        draw.text((W - 426, by + 38), st_sub, font=FONTS["mono_sm"], fill=C_WHITE)

    # Full-width bottom 32-band spectrum
    draw_fft_spectrum_bars(draw, bands32, 120, H - 90, W - 240, 180, mirror=False)


def draw_act3_orrery_and_lyrics(
    img: Image.Image,
    draw: ImageDraw.ImageDraw,
    cover_img: Image.Image,
    t_sec: float,
    local_t: float,
    bass: float,
    bands32: list[float],
    beat_pulse: float,
):
    """ACT 3: Chora Planetary Orrery Stage (8 Goliath EP tracks orbiting) + Kinetic 3D Time-Coded Lyrics."""
    # Left half: Planetary Orrery Stage
    ox, oy = 520, 520
    tracks = [
        "01 GOLIATH LIONESS",
        "02 DAVID VS GOLIATH",
        "03 SKATERS MIX",
        "04 GOLIATH WAR HORNS",
        "05 SHREDDERS MIX",
        "06 LIONESS VS GOLIATH",
        "07 TWO STEP MIX",
        "08 GOLIATH GRIME",
    ]
    # Elliptical planetary orbits
    for idx, tname in enumerate(tracks):
        rx = 135 + idx * 38
        ry = int(rx * 0.62)
        is_playing = idx == 0
        ocol = C_ORANGE if is_playing else (46, 54, 86)
        draw.ellipse([ox - rx, oy - ry, ox + rx, oy + ry], outline=ocol, width=3 if is_playing else 1)

        ang = t_sec * (1.1 - idx * 0.09) + idx * 0.95
        px = ox + int(math.cos(ang) * rx)
        py = oy + int(math.sin(ang) * ry)
        pr = (16 + int(bass * 10)) if is_playing else 9
        pcol = C_ORANGE if is_playing else (C_CYAN if idx % 2 == 0 else C_MAGENTA)
        draw.ellipse([px - pr, py - pr, px + pr, py + pr], fill=pcol, outline=C_WHITE, width=2 if is_playing else 1)
        draw.text((px + pr + 8, py - 8), tname, font=FONTS["mono_sm"], fill=C_WHITE if is_playing else C_MUTED)

    # Solar Core (Goliath EP Cover)
    core_s = 140 + int(beat_pulse * 14)
    core_art = cover_img.resize((core_s, core_s), Image.Resampling.BILINEAR)
    mask = Image.new("L", (core_s, core_s), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, core_s - 1, core_s - 1], fill=255)
    img.paste(core_art, (ox - core_s // 2, oy - core_s // 2), mask)
    draw.ellipse([ox - core_s // 2, oy - core_s // 2, ox + core_s // 2, oy + core_s // 2], outline=C_ORANGE, width=4)

    # Right half: Kinetic 3D Time-Coded Lyrics Stage (from K-Moody's actual Goliath Lioness lyrics!)
    lx, ly, lw, lh = 980, 130, 870, 760
    draw.rounded_rectangle([lx, ly, lx + lw, ly + lh], radius=22, fill=(11, 13, 24), outline=C_MAGENTA, width=2)
    draw.text((lx + 34, ly + 28), "TYPO 3D // TIME-CODED KINETIC LYRIC ENGINE", font=FONTS["mono_sm"], fill=C_MAGENTA)

    lyric_lines = [
        ("00:14.20", "HEAD OF A LION, HEART OF A GIANT", True),
        ("00:16.80", "I'VE BEEN DEFIANT — BUILT FOR THE CROWN", False),
        ("00:19.40", "WE THE BUILDERS AND THE DOERS", True),
        ("00:22.10", "LET THE TRUTH BE TOLD IN THE SOUND", False),
        ("00:25.00", "GOLIATH FALLS WHEN THE FREQUENCY RISES", True),
    ]
    active_line = int((local_t / 3.6) * len(lyric_lines)) % len(lyric_lines)
    for idx, (tc_str, line_txt, hi) in enumerate(lyric_lines):
        by = ly + 92 + idx * 104
        is_cur = idx == active_line
        if is_cur:
            pad_pulse = int(beat_pulse * 8)
            draw.rounded_rectangle(
                [lx + 26 - pad_pulse, by - 10, lx + lw - 26 + pad_pulse, by + 76],
                radius=14,
                fill=(38, 16, 36),
                outline=C_ORANGE,
                width=2,
            )
            draw.text((lx + 44, by + 2), f">> {tc_str}  ·  LIVE SYNC", font=FONTS["mono_sm"], fill=C_ORANGE)
            draw.text((lx + 44, by + 26), line_txt, font=FONTS["title_sm"], fill=C_WHITE)
        else:
            draw.text((lx + 44, by + 6), tc_str, font=FONTS["mono_sm"], fill=C_MUTED)
            draw.text((lx + 44, by + 28), line_txt, font=FONTS["ui_lg"], fill=(110, 120, 148))

    # Bottom spectrum inside lyric card
    draw_fft_spectrum_bars(draw, bands32, lx + 34, ly + lh - 36, lw - 68, 120, mirror=False)


def draw_act4_audience_hifi_observatory(
    img: Image.Image,
    draw: ImageDraw.ImageDraw,
    cover_img: Image.Image,
    t_sec: float,
    local_t: float,
    bass: float,
    bands32: list[float],
    beat_pulse: float,
):
    """ACT 4: Audience Immersion I — 24-Bit/192kHz Lossless FLAC Quality Switcher + Sky Tonight Observatory."""
    # Left Card: Chora Hi-Fi Lossless Signal Chain & Quality Selector
    qx, qy, qw, qh = 70, 130, 860, 760
    draw.rounded_rectangle([qx, qy, qx + qw, qy + qh], radius=22, fill=(10, 14, 24), outline=C_EMERALD, width=2)
    draw.rounded_rectangle([qx + 32, qy + 28, qx + 390, qy + 64], radius=8, fill=(10, 42, 32), outline=C_EMERALD, width=1)
    draw.text((qx + 48, qy + 36), "AUDIOPHILE SIGNAL PATH // VERIFIED", font=FONTS["mono_sm"], fill=C_EMERALD)

    draw.text((qx + 32, qy + 84), "24-BIT / 192KHZ LOSSLESS", font=FONTS["hero_md"], fill=C_WHITE)
    draw.text((qx + 32, qy + 144), "BIT-PERFECT FLAC  +  ADAPTIVE HLS STREAMING", font=FONTS["ui_md"], fill=C_CYAN)

    # Interactive ChoraQualityButton simulation showing switch to LOSSLESS FLAC
    modes = [
        ("DATA SAVER AAC", "128 kbps · Mobile", False),
        ("ADAPTIVE HLS", "320 kbps · Smart Buffer", False),
        ("LOSSLESS 24-BIT FLAC", "4,608 kbps · 192 kHz Master", True),
    ]
    for idx, (m_title, m_sub, is_active) in enumerate(modes):
        by = qy + 205 + idx * 102
        if is_active:
            draw.rounded_rectangle([qx + 32, by, qx + qw - 32, by + 86], radius=14, fill=(14, 48, 38), outline=C_EMERALD, width=3)
            draw.ellipse([qx + 56, by + 28, qx + 84, by + 56], fill=C_EMERALD)
            draw.text((qx + 104, by + 16), m_title + "   [ACTIVE]", font=FONTS["ui_lg"], fill=C_WHITE)
            draw.text((qx + 104, by + 48), m_sub, font=FONTS["mono_md"], fill=C_EMERALD)
        else:
            draw.rounded_rectangle([qx + 32, by, qx + qw - 32, by + 86], radius=14, fill=(18, 22, 36), outline=(48, 54, 78), width=1)
            draw.text((qx + 104, by + 16), m_title, font=FONTS["ui_lg"], fill=C_MUTED)
            draw.text((qx + 104, by + 48), m_sub, font=FONTS["mono_sm"], fill=C_MUTED)

    draw_fft_spectrum_bars(draw, bands32, qx + 32, qy + qh - 44, qw - 64, 175, mirror=False)

    # Right Card: Sky Tonight Sonic Observatory Dome
    sx, sy, sw, sh = 970, 130, 880, 760
    draw.rounded_rectangle([sx, sy, sx + sw, sy + sh], radius=22, fill=(10, 12, 26), outline=C_CYAN, width=2)
    draw.text((sx + 34, sy + 28), "CHORA NEXT // SKY TONIGHT SONIC OBSERVATORY", font=FONTS["mono_sm"], fill=C_CYAN)

    dcx, dcy, dr = sx + sw // 2, sy + 410, 285
    draw.ellipse([dcx - dr, dcy - dr, dcx + dr, dcy + dr], fill=(6, 8, 20), outline=C_CYAN, width=3)
    draw.ellipse([dcx - int(dr * 0.66), dcy - int(dr * 0.66), dcx + int(dr * 0.66), dcy + int(dr * 0.66)], outline=(32, 64, 92), width=1)
    draw.line([(dcx - dr, dcy), (dcx + dr, dcy)], fill=(32, 64, 92), width=1)
    draw.line([(dcx, dcy - dr), (dcx, dcy + dr)], fill=(32, 64, 92), width=1)

    # Constellation nodes pulsing to the beat
    const_pts = []
    for i in range(14):
        ang = i * 0.85 + t_sec * 0.25
        rad = 60 + (i * 37) % (dr - 75)
        px = dcx + int(math.cos(ang) * rad)
        py = dcy + int(math.sin(ang) * rad)
        const_pts.append((px, py))
        if i > 0:
            draw.line([const_pts[i - 1], (px, py)], fill=(0, 140, 180), width=2)
    for i, (px, py) in enumerate(const_pts):
        sr = 5 + int(bands32[i * 2] * 8)
        draw.ellipse([px - sr, py - sr, px + sr, py + sr], fill=C_ORANGE if i % 3 == 0 else C_CYAN)


def draw_act5_audience_party_and_vault(
    img: Image.Image,
    draw: ImageDraw.ImageDraw,
    cover_img: Image.Image,
    t_sec: float,
    local_t: float,
    bass: float,
    bands32: list[float],
    beat_pulse: float,
):
    """ACT 5: Audience Immersion II — Live Synchronized Listening Parties + The Cultural Vault."""
    # Left Card: Live Synchronized Listening Party (PartyBar + Live Crowd)
    px, py, pw, ph = 68, 130, 870, 760
    draw.rounded_rectangle([px, py, px + pw, py + ph], radius=22, fill=(14, 12, 26), outline=C_ORANGE, width=2)
    draw.rounded_rectangle([px + 28, py + 26, px + 440, py + 64], radius=18, fill=(48, 20, 12), outline=C_ORANGE, width=2)
    draw.ellipse([px + 46, py + 38, px + 60, py + 52], fill=C_ORANGE)
    draw.text((px + 72, py + 36), "LIVE LISTENING PARTY · 1,428 IN SYNC", font=FONTS["mono_sm"], fill=C_WHITE)

    draw.text((px + 28, py + 84), "LISTEN TOGETHER. FRAME-LOCKED.", font=FONTS["title_sm"], fill=C_WHITE)
    draw.text((px + 28, py + 128), "HOSTED BY K-MOODY  ·  SPATIAL ROOM AUDIO + LIVE CHAT", font=FONTS["ui_md"], fill=C_ORANGE)

    # Listener avatars & beat-reactive wave rings
    listeners = ["K-MOODY (HOST)", "ARIA AI", "MAYA V.", "DEVON R.", "ZION K.", "ELENA S.", "MARCUS T.", "SORA L."]
    for i, name in enumerate(listeners):
        col_i = i % 4
        row_i = i // 4
        ax = px + 115 + col_i * 205
        ay = py + 255 + row_i * 155
        ar = 42 + int(bands32[i * 3] * 14)
        acol = C_ORANGE if i == 0 else (C_CYAN if i % 2 == 1 else C_MAGENTA)
        draw.ellipse([ax - ar, ay - ar, ax + ar, ay + ar], fill=(24, 22, 42), outline=acol, width=3)
        initials = "".join(w[0] for w in name.split()[:2])
        draw.text((ax - 16, ay - 14), initials, font=FONTS["ui_lg"], fill=C_WHITE)
        draw.text((ax - 56, ay + 52), name, font=FONTS["mono_sm"], fill=acol if i == 0 else C_WHITE)

    # Live chat / reaction ticker at bottom of Party card
    draw.rounded_rectangle([px + 28, py + 530, px + pw - 28, py + 725], radius=14, fill=(20, 18, 36), outline=(58, 52, 88), width=1)
    chats = [
        ("K-MOODY", "Welcome to the Goliath EP premiere room! Turn the Flux shader on!", C_ORANGE),
        ("MAYA V.", "That sub drop at 0:18 in 24-bit FLAC is shaking my studio monitors!!", C_CYAN),
        ("ARIA AI", "Beat-sync lock: 0.4ms drift across 1,428 listeners worldwide.", C_MAGENTA),
    ]
    for idx, (user, msg, ucol) in enumerate(chats):
        cy = py + 550 + idx * 54
        draw.text((px + 48, cy), f"{user}:", font=FONTS["mono_sm"], fill=ucol)
        draw.text((px + 185, cy), msg, font=FONTS["ui_sm"], fill=C_WHITE)

    # Right Card: The Cultural Vault & Conservatory
    vx, vy, vw, vh = 972, 130, 880, 760
    draw.rounded_rectangle([vx, vy, vx + vw, vy + vh], radius=22, fill=(14, 12, 20), outline=C_BRASS, width=2)
    draw.text((vx + 32, vy + 28), "THE VAULT & CONSERVATORY // GLOBAL ARCHIVES", font=FONTS["mono_sm"], fill=C_BRASS)
    draw.text((vx + 32, vy + 70), "MILLIONS OF RARE RECORDINGS", font=FONTS["title_sm"], fill=C_WHITE)

    vault_sources = [
        ("LIBRARY OF CONGRESS", "National Jukebox · Early Field Recordings · Master Tapes", "1.2M+ ASSETS", C_BRASS),
        ("INTERNET ARCHIVE", "Live Concerts · Lossless Soundboards · World Radio", "3.8M+ AUDIO", C_ORANGE),
        ("EUROPEANA COLLECTIONS", "Classical Symphonies · Ethnomusicology · Opera Archives", "850K+ WORKS", C_CYAN),
        ("AUDIUS + CONSERVATORY", "Independent Underground + Interactive Theory & Scores", "LIVE STREAM", C_MAGENTA),
    ]
    for idx, (vtitle, vsub, vstat, vcol) in enumerate(vault_sources):
        by = vy + 140 + idx * 142
        draw.rounded_rectangle([vx + 32, by, vx + vw - 32, by + 122], radius=16, fill=(22, 20, 32), outline=vcol, width=2)
        draw.text((vx + 56, by + 22), vtitle, font=FONTS["ui_lg"], fill=vcol)
        draw.text((vx + 56, by + 62), vsub, font=FONTS["ui_sm"], fill=C_WHITE)
        draw.rounded_rectangle([vx + vw - 230, by + 20, vx + vw - 56, by + 56], radius=8, fill=(12, 12, 18), outline=vcol, width=1)
        draw.text((vx + vw - 214, by + 30), vstat, font=FONTS["mono_sm"], fill=vcol)


def draw_act6_creator_studio_mixer(
    img: Image.Image,
    draw: ImageDraw.ImageDraw,
    cover_img: Image.Image,
    t_sec: float,
    local_t: float,
    bass: float,
    bands32: list[float],
    beat_pulse: float,
):
    """ACT 6: Creator Command I — Chora Studio AI Stem Mixer, Motorized Mackie Faders & Melos DAW."""
    mx, my, mw, mh = 64, 118, W - 128, 780
    draw.rounded_rectangle([mx, my, mx + mw, my + mh], radius=22, fill=(11, 13, 22), outline=C_ORANGE, width=2)

    # Top Studio Header Bar
    draw.rounded_rectangle([mx + 24, my + 20, mx + mw - 24, my + 82], radius=12, fill=(18, 22, 36), outline=(52, 60, 90), width=1)
    draw.text((mx + 44, my + 38), "CHORA STUDIO // 8-BUS AI STEM CONSOLE  ·  MACKIE CONTROL + AVB MATRIX", font=FONTS["ui_md"], fill=C_ORANGE)
    draw.rounded_rectangle([mx + mw - 420, my + 30, mx + mw - 44, my + 72], radius=8, fill=C_MAGENTA)
    draw.text((mx + mw - 398, my + 42), ">> 1-CLICK SEND STEMS TO MELOS DAW", font=FONTS["mono_sm"], fill=C_WHITE)

    # 8 Motorized Channel Strips moving to K-Moody's real FFT bands
    channels = [
        ("CH 01", "LEAD VOCAL", C_ORANGE, 4),
        ("CH 02", "808 SUB BASS", C_MAGENTA, 1),
        ("CH 03", "WAR HORNS", C_BRASS, 7),
        ("CH 04", "DRUMTRANSIENT", C_CYAN, 2),
        ("CH 05", "SYNTH ARPS", C_EMERALD, 12),
        ("CH 06", "CHOIR STEMS", C_ORANGE, 16),
        ("CH 07", "ARIA AI DROP", C_MAGENTA, 20),
        ("MASTER", "STEREO BUS", C_WHITE, 0),
    ]
    strip_w = 195
    start_x = mx + 34
    for idx, (ch_num, ch_name, ch_col, b_idx) in enumerate(channels):
        sx = start_x + idx * (strip_w + 18)
        sy = my + 104
        sh = 645
        draw.rounded_rectangle([sx, sy, sx + strip_w, sy + sh], radius=14, fill=(16, 19, 32), outline=(44, 50, 76), width=2)

        # Channel header & MUTE/SOLO/AI STEM buttons
        draw.text((sx + 18, sy + 16), ch_num, font=FONTS["mono_sm"], fill=ch_col)
        draw.text((sx + 18, sy + 38), ch_name, font=FONTS["ui_md"], fill=C_WHITE)
        draw.rounded_rectangle([sx + 18, sy + 74, sx + 68, sy + 102], radius=6, fill=(36, 20, 26), outline=C_MAGENTA, width=1)
        draw.text((sx + 36, sy + 80), "M", font=FONTS["mono_sm"], fill=C_MAGENTA)
        draw.rounded_rectangle([sx + 76, sy + 74, sx + 126, sy + 102], radius=6, fill=(20, 38, 32), outline=C_EMERALD, width=1)
        draw.text((sx + 94, sy + 80), "S", font=FONTS["mono_sm"], fill=C_EMERALD)
        draw.rounded_rectangle([sx + 134, sy + 74, sx + 178, sy + 102], radius=6, fill=(38, 30, 14), outline=C_ORANGE, width=1)
        draw.text((sx + 146, sy + 80), "AI", font=FONTS["mono_sm"], fill=C_ORANGE)

        # Fader track & LED VU Meter
        track_top = sy + 130
        track_bot = sy + sh - 70
        track_h = track_bot - track_top
        fx_center = sx + 64
        # Fader slot
        draw.line([(fx_center, track_top), (fx_center, track_bot)], fill=(8, 10, 16), width=8)
        for db_i in range(11):
            ty = track_top + int((db_i / 10.0) * track_h)
            draw.line([(fx_center - 18, ty), (fx_center - 6, ty)], fill=(70, 76, 104), width=2)

        # Animated motorized fader cap position
        level = min(0.96, max(0.22, float(bands32[b_idx]) * 0.85 + 0.15 * math.sin(t_sec * 3.5 + idx)))
        fader_y = int(track_bot - level * track_h)
        draw.rounded_rectangle([fx_center - 26, fader_y - 16, fx_center + 26, fader_y + 16], radius=6, fill=ch_col, outline=C_WHITE, width=2)
        draw.line([(fx_center - 20, fader_y), (fx_center + 20, fader_y)], fill=(10, 10, 14), width=3)

        # Dual Stereo LED VU Meter bars on right side of strip
        vu_x = sx + 122
        num_leds = 24
        active_leds = int(level * num_leds)
        for led_i in range(num_leds):
            ly = track_bot - (led_i + 1) * (track_h // num_leds)
            if led_i < active_leds:
                lcol = C_EMERALD if led_i < 16 else (C_ORANGE if led_i < 21 else C_MAGENTA)
            else:
                lcol = (26, 30, 46)
            draw.rectangle([vu_x, ly, vu_x + 18, ly + 10], fill=lcol)
            draw.rectangle([vu_x + 24, ly, vu_x + 42, ly + 10], fill=lcol)

        db_val = (level - 0.78) * 24.0
        draw.text((sx + 48, sy + sh - 44), f"{db_val:+.1f} dB", font=FONTS["mono_sm"], fill=C_CYAN)


def draw_act7_creator_manager_and_promo(
    img: Image.Image,
    draw: ImageDraw.ImageDraw,
    cover_img: Image.Image,
    t_sec: float,
    local_t: float,
    bass: float,
    bands32: list[float],
    beat_pulse: float,
):
    """ACT 7: Creator Command II — Chora Artist Manager (Releases, Tours, Sync, Payroll) + Auto-Promo Suite."""
    # Left Card: Chora Artist Manager OS
    ax, ay, aw, ah = 64, 122, 1040, 770
    draw.rounded_rectangle([ax, ay, ax + aw, ay + ah], radius=22, fill=(11, 14, 24), outline=C_EMERALD, width=2)
    draw.text((ax + 32, ay + 26), "CHORA ARTIST MANAGER // FULL-STACK CREATOR BUSINESS OS", font=FONTS["mono_sm"], fill=C_EMERALD)

    tabs = ["RELEASES", "TOUR BOOKING", "BAND PAYROLL", "SYNC LICENSING", "ROYALTY INVOICES"]
    tx = ax + 32
    for i, tab in enumerate(tabs):
        is_sel = i == int(local_t * 1.5) % len(tabs)
        draw.rounded_rectangle([tx, ay + 64, tx + 184, ay + 104], radius=8, fill=C_EMERALD if is_sel else (20, 24, 38))
        draw.text((tx + 18, ay + 76), tab, font=FONTS["mono_sm"], fill=(10, 12, 16) if is_sel else C_WHITE)
        tx += 196

    # KPI Metric Cards
    kpis = [
        ("DIRECT FAN & SYNC REVENUE", f"${48920 + int(local_t * 1450):,}", "+100% ARTIST SHARE", C_EMERALD),
        ("GOLIATH WORLD TOUR", "18 DATES CONFIRMED", "SETTLEMENT + SPLIT SHEET READY", C_ORANGE),
        ("SYNC LICENSING GRANTS", "42 ACTIVE PLACEMENTS", "INSTANT FABULA + REELLO CLEARANCE", C_CYAN),
    ]
    for i, (k_label, k_val, k_sub, k_col) in enumerate(kpis):
        kx = ax + 32 + i * 328
        ky = ay + 128
        draw.rounded_rectangle([kx, ky, kx + 312, ky + 165], radius=14, fill=(18, 22, 36), outline=k_col, width=2)
        draw.text((kx + 20, ky + 20), k_label, font=FONTS["mono_sm"], fill=C_MUTED)
        draw.text((kx + 20, ky + 56), k_val, font=FONTS["title_sm"], fill=C_WHITE)
        draw.text((kx + 20, ky + 116), k_sub, font=FONTS["mono_sm"], fill=k_col)

    # Live Band Payroll & Royalty Ledger Table
    draw.rounded_rectangle([ax + 32, ay + 318, ax + aw - 32, ay + ah - 32], radius=16, fill=(16, 19, 32), outline=(48, 56, 84), width=1)
    draw.text((ax + 56, ay + 340), "AUTOMATED ROYALTY & TOUR PAYROLL DISBURSEMENTS", font=FONTS["mono_sm"], fill=C_ORANGE)
    rows = [
        ("K-MOODY · MASTER & PUBLISHING", "GOLIATH EP (ALL 8 TRACKS)", "INSTANT PAYOUT", "$31,400.00", C_EMERALD),
        ("CHORA SYNC LICENSE #8841", "COMMERCIAL SPOT · FABULA STUDIO", "CLEARED · 24-BIT", "$8,500.00", C_CYAN),
        ("BAND & SESSION PAYROLL", "HORN SECTION + TOUR AUDIO CREW", "PAID AUTOMATICALLY", "$6,220.00", C_ORANGE),
        ("LISTENING PARTY TICKET & MERCH", "VIP GATEFOLD ORRERY EDITION", "SETTLED", "$2,800.00", C_MAGENTA),
    ]
    for idx, (r_title, r_sub, r_status, r_amt, r_col) in enumerate(rows):
        ry = ay + 388 + idx * 86
        draw.rounded_rectangle([ax + 52, ry, ax + aw - 52, ry + 72], radius=10, fill=(22, 26, 44))
        draw.text((ax + 74, ry + 14), r_title, font=FONTS["ui_md"], fill=C_WHITE)
        draw.text((ax + 74, ry + 42), r_sub, font=FONTS["mono_sm"], fill=C_MUTED)
        draw.text((ax + 610, ry + 26), r_status, font=FONTS["mono_sm"], fill=r_col)
        draw.text((ax + aw - 220, ry + 22), r_amt, font=FONTS["mono_lg"], fill=r_col)

    # Right Card: 1-Click Auto-Promo Suite (ChoraPromoModal)
    px, py, pw, ph = 1134, 122, 722, 770
    draw.rounded_rectangle([px, py, px + pw, py + ph], radius=22, fill=(16, 12, 28), outline=C_MAGENTA, width=2)
    draw.text((px + 32, py + 26), "CHORA AUTO-PROMO SUITE // FABULA + REELLO", font=FONTS["mono_sm"], fill=C_MAGENTA)
    draw.text((px + 32, py + 64), "1-CLICK MULTI-FORMAT PROMO ENGINE", font=FONTS["title_sm"], fill=C_WHITE)

    # Preview frame inside Promo Suite showing K-Moody cover + waveform + export formats
    art_s = 230
    promo_art = cover_img.resize((art_s, art_s), Image.Resampling.BILINEAR)
    img.paste(promo_art, (px + 42, py + 135))
    draw.rectangle([px + 42, py + 135, px + 42 + art_s, py + 135 + art_s], outline=C_ORANGE, width=3)

    formats = [
        ("16:9 BROADCAST SPOT", "1920x1080 · Editable in Fabula"),
        ("9:16 REELLO VERTICAL", "1080x1920 · Beat-Synced Cuts"),
        ("1:1 GATEFOLD TEASER", "1080x1080 · Kinetic Lyrics"),
    ]
    for i, (f_title, f_sub) in enumerate(formats):
        fy = py + 135 + i * 80
        draw.rounded_rectangle([px + 296, fy, px + pw - 32, fy + 68], radius=10, fill=(26, 20, 44), outline=C_ORANGE if i == 0 else C_CYAN, width=2)
        draw.text((px + 316, fy + 12), f_title, font=FONTS["ui_md"], fill=C_WHITE)
        draw.text((px + 316, fy + 40), f_sub, font=FONTS["mono_sm"], fill=C_ORANGE if i == 0 else C_CYAN)

    draw.text((px + 42, py + 410), "ARIA AI VOICEOVER + BEAT-LOCKED TIMELINE READY", font=FONTS["mono_sm"], fill=C_ORANGE)
    draw_fft_spectrum_bars(draw, bands32, px + 42, py + 635, pw - 84, 175, mirror=False)

    draw.rounded_rectangle([px + 42, py + 670, px + pw - 42, py + 736], radius=14, fill=C_ORANGE)
    draw.text((px + 130, py + 690), ">> OPEN EDITABLE PROJECT IN PLAJAH FABULA", font=FONTS["ui_lg"], fill=(10, 10, 14))


def draw_act8_dramatic_cta(
    img: Image.Image,
    draw: ImageDraw.ImageDraw,
    cover_img: Image.Image,
    t_sec: float,
    local_t: float,
    bass: float,
    bands32: list[float],
    beat_pulse: float,
    include_text: bool = True,
):
    """ACT 8: Dramatic Shockwave Climax + Call To Action Finale (26.4s - 30.0s)."""
    cx, cy = W // 2, 470
    # Massive expanding shockwave rings triggered right at the start of Act 8
    shock_p = min(1.0, local_t / 1.8)
    for r_i in range(5):
        rad = int(80 + shock_p * (380 + r_i * 190) + bass * 45)
        col = C_ORANGE if r_i % 2 == 0 else C_MAGENTA
        draw.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], outline=col, width=max(1, 5 - r_i))

    # Full 360-degree radial harmonic crown around center stage
    for i, val in enumerate(bands32):
        for sym in range(2):
            ang = ((i + sym * 32) / 64.0) * math.tau - t_sec * 0.6
            r_in = 175 + int(bass * 20)
            r_out = r_in + int(50 + val * 220)
            col = plajah_gradient_color(i / 31.0)
            x1 = cx + int(math.cos(ang) * r_in)
            y1 = cy + int(math.sin(ang) * r_in)
            x2 = cx + int(math.cos(ang) * r_out)
            y2 = cy + int(math.sin(ang) * r_out)
            draw.line([(x1, y1), (x2, y2)], fill=col, width=6)

    # Center K-Moody Goliath EP Emblem
    art_s = 250 + int(beat_pulse * 18)
    c_art = cover_img.resize((art_s, art_s), Image.Resampling.BILINEAR)
    mask = Image.new("L", (art_s, art_s), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, art_s - 1, art_s - 1], fill=255)
    img.paste(c_art, (cx - art_s // 2, cy - art_s // 2), mask)
    draw.ellipse([cx - art_s // 2, cy - art_s // 2, cx + art_s // 2, cy + art_s // 2], outline=C_ORANGE, width=5)

    # Glowing CTA Button Bar at bottom center (drawn even on clean plate as interactive UI target, text added if include_text)
    btn_w, btn_h = 880 + int(beat_pulse * 24), 86
    bx0, by0 = cx - btn_w // 2, 855
    draw.rounded_rectangle([bx0 - 6, by0 - 6, bx0 + btn_w + 6, by0 + btn_h + 6], radius=46, outline=C_CYAN, width=2)
    draw.rounded_rectangle([bx0, by0, bx0 + btn_w, by0 + btn_h], radius=42, fill=C_ORANGE, outline=C_WHITE, width=3)
    if include_text:
        cta_str = "EXPERIENCE PLAJAH CHORA TODAY   >>   LAUNCH NOW"
        bbox = draw.textbbox((0, 0), cta_str, font=FONTS["ui_lg"])
        tw = bbox[2] - bbox[0]
        draw.text((cx - tw // 2, by0 + 26), cta_str, font=FONTS["ui_lg"], fill=(8, 8, 14))


# Overlay Kinetic Typography specs for each of the 8 acts
SCENE_TITLES = [
    {
        "segIndex": 0,
        "id": "seg_01_ignition",
        "name": "01 · Sonic Sanctuary Ignition",
        "headline": "STOP JUST STREAMING.",
        "subheadline": "WELCOME TO PLAJAH CHORA · THE LIVING SOUND UNIVERSE",
        "badge": "ACT I // THE SONIC SANCTUARY · K-MOODY 'GOLIATH LIONESS'",
        "accent": C_ORANGE,
        "y_pos": 815,
    },
    {
        "segIndex": 1,
        "id": "seg_02_fx_stage",
        "name": "02 · 7-Engine FX Stage Visualizer",
        "headline": "7 REAL-TIME VISUALIZERS.",
        "subheadline": "MILKDROP · SHADER · FLUX 3D · GENERATOR · TYPO · KAIJU · LOOKS",
        "badge": "ACT II // AUDIO-REACTIVE FX STAGE · 60FPS GPU SHADERS",
        "accent": C_CYAN,
        "y_pos": 775,
    },
    {
        "segIndex": 2,
        "id": "seg_03_orrery_lyrics",
        "name": "03 · Planetary Orrery & Kinetic 3D Lyrics",
        "headline": "ORBIT EVERY TRACK.",
        "subheadline": "GATEFOLD PLANETARY ORRERY STAGE  +  TIME-CODED 3D LYRICS",
        "badge": "ACT III // PLANETARY ORRERY & KINETIC LYRIC STAGE",
        "accent": C_MAGENTA,
        "y_pos": 825,
    },
    {
        "segIndex": 3,
        "id": "seg_04_audience_hifi",
        "name": "04 · 24-Bit Lossless & Sky Observatory",
        "headline": "24-BIT / 192KHZ LOSSLESS.",
        "subheadline": "BIT-PERFECT FLAC STREAMING  +  SKY TONIGHT SONIC OBSERVATORY",
        "badge": "ACT IV // AUDIENCE IMMERSION · AUDIOPHILE LOSSLESS",
        "accent": C_EMERALD,
        "y_pos": 825,
    },
    {
        "segIndex": 4,
        "id": "seg_05_audience_party_vault",
        "name": "05 · Live Listening Parties & Cultural Vault",
        "headline": "LISTEN LIVE IN SYNC.",
        "subheadline": "GLOBAL LISTENING PARTIES  +  THE CULTURAL VAULT ARCHIVES",
        "badge": "ACT V // LIVE LISTENING PARTIES & THE VAULT",
        "accent": C_ORANGE,
        "y_pos": 825,
    },
    {
        "segIndex": 5,
        "id": "seg_06_creator_studio",
        "name": "06 · Chora Studio AI Stem Mixer",
        "headline": "MIX LIVE AI STEMS.",
        "subheadline": "CHORA STUDIO CONSOLE · MACKIE CONTROL · 1-CLICK TO MELOS DAW",
        "badge": "ACT VI // CREATOR COMMAND · CHORA STUDIO MIXER",
        "accent": C_MAGENTA,
        "y_pos": 825,
    },
    {
        "segIndex": 6,
        "id": "seg_07_creator_manager_promo",
        "name": "07 · Artist Manager OS & Auto-Promo Suite",
        "headline": "RUN YOUR EMPIRE.",
        "subheadline": "TOURS · SYNC LICENSING · BAND PAYROLL · 1-CLICK AUTO-PROMO SUITE",
        "badge": "ACT VII // CREATOR COMMAND · ARTIST MANAGER OS",
        "accent": C_EMERALD,
        "y_pos": 825,
    },
    {
        "segIndex": 7,
        "id": "seg_08_dramatic_cta",
        "name": "08 · Dramatic Shockwave & Call To Action",
        "headline": "OWN THE STAGE. COMMAND THE FREQUENCY.",
        "subheadline": "PLAJAH CHORA  ·  FEATURING K-MOODY 'GOLIATH EP'",
        "badge": "ACT VIII // EXPERIENCE PLAJAH CHORA TODAY",
        "accent": C_ORANGE,
        "y_pos": 135,
    },
]


def draw_kinetic_title_overlay(
    draw: ImageDraw.ImageDraw,
    spec: dict,
    local_t: float,
    seg_dur: float,
    beat_pulse: float,
):
    """Draws bold, high-contrast Plajah kinetic typography banner for the master spot."""
    headline = spec["headline"]
    sub = spec["subheadline"]
    accent = spec["accent"]
    by = spec["y_pos"]

    # Entrance pop animation over first 0.28s
    entr = min(1.0, local_t / 0.25)
    y_offset = int((1.0 - entr) * 28)
    by += y_offset

    # Measure text
    h_font = FONTS["hero_lg"] if len(headline) < 28 else FONTS["hero_md"]
    hb = draw.textbbox((0, 0), headline, font=h_font)
    hw = hb[2] - hb[0]
    sb = draw.textbbox((0, 0), sub, font=FONTS["mono_md"])
    sw = sb[2] - sb[0]

    box_w = max(hw, sw) + 96 + int(beat_pulse * 16)
    box_h = 148
    bx = (W - box_w) // 2

    # Backdrop glass card with bold left/right Plajah accent bars
    draw.rounded_rectangle([bx, by, bx + box_w, by + box_h], radius=16, fill=(7, 8, 15), outline=accent, width=3)
    draw.rounded_rectangle([bx, by, bx + 14, by + box_h], radius=6, fill=accent)
    draw.rounded_rectangle([bx + box_w - 14, by, bx + box_w, by + box_h], radius=6, fill=C_MAGENTA if accent != C_MAGENTA else C_CYAN)

    # Headline shadow + main text
    hx = (W - hw) // 2
    draw.text((hx + 3, by + 19), headline, font=h_font, fill=(0, 0, 0))
    draw.text((hx, by + 16), headline, font=h_font, fill=C_WHITE)

    # Subheadline
    sx = (W - sw) // 2
    draw.text((sx, by + 102), sub, font=FONTS["mono_md"], fill=accent)


def encode_frames_to_mp4(frames: list[np.ndarray], out_mp4: str, audio_path: str | None = None, audio_ss: float = 0.0, audio_dur: float | None = None):
    cmd = [
        FFMPEG,
        "-y",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-s", f"{W}x{H}",
        "-pix_fmt", "rgb24",
        "-r", str(FPS),
        "-i", "-",
    ]
    if audio_path:
        if audio_dur is not None:
            cmd += ["-ss", f"{audio_ss:.3f}", "-t", f"{audio_dur:.3f}"]
        cmd += ["-i", audio_path]

    cmd += [
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
    ]
    if audio_path:
        cmd += ["-c:a", "aac", "-b:a", "256k", "-shortest"]

    cmd.append(out_mp4)
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    assert proc.stdin is not None
    for frame in frames:
        proc.stdin.write(frame.tobytes())
    proc.stdin.close()
    rc = proc.wait()
    if rc != 0:
        raise RuntimeError(f"FFmpeg exited with code {rc} encoding {out_mp4}")


def main():
    os.makedirs(CLIPS_DIR, exist_ok=True)
    os.makedirs(PLATES_DIR, exist_ok=True)

    analysis_path = os.path.join(OUT_DIR, "promo_analysis.json")
    with open(analysis_path, "r", encoding="utf-8") as f:
        meta = json.load(f)

    cover_path = os.path.join(OUT_DIR, "goliath_cover.png")
    cover_img = Image.open(cover_path).convert("RGB")

    cuts = meta["sceneCutsSec"]
    bpm = meta["bpm"]
    bass_arr = meta["bass"]
    high_arr = meta["high"]
    bands32_arr = meta["bands32"]
    beat_set = set(int(round(bt * FPS)) for bt in meta["beatTimesSec"])

    master_frames: list[np.ndarray] = []
    segment_meta = []

    for seg_i in range(8):
        t0 = cuts[seg_i]
        t1 = cuts[seg_i + 1]
        f_start = int(round(t0 * FPS))
        f_end = int(round(t1 * FPS)) if seg_i < 7 else TOTAL_FRAMES
        spec = SCENE_TITLES[seg_i]

        clean_frames: list[np.ndarray] = []
        titled_frames: list[np.ndarray] = []

        print(f"Rendering {spec['id']} ({t0:.2f}s -> {t1:.2f}s, {f_end - f_start} frames)...")
        for f_idx in range(f_start, f_end):
            t_sec = f_idx / FPS
            local_t = t_sec - t0
            seg_dur = max(0.1, t1 - t0)
            bass = float(bass_arr[min(f_idx, len(bass_arr) - 1)])
            high = float(high_arr[min(f_idx, len(high_arr) - 1)])
            bands32 = bands32_arr[min(f_idx, len(bands32_arr) - 1)]

            # Beat flash / pulse decay
            beat_pulse = bass
            if f_idx in beat_set or (f_idx - 1) in beat_set:
                beat_pulse = min(1.0, bass * 0.5 + 0.65)

            img_clean = make_base_background(bass, high, t_sec, accent_mode=seg_i)
            draw_clean = ImageDraw.Draw(img_clean)
            draw_cyber_grid_and_chrome(draw_clean, t_sec, bass, bpm, spec["badge"])

            if seg_i == 0:
                draw_act1_sonic_sanctuary(img_clean, draw_clean, cover_img, t_sec, local_t, bass, bands32, beat_pulse)
            elif seg_i == 1:
                draw_act2_fx_stage(img_clean, draw_clean, cover_img, t_sec, local_t, bass, bands32, beat_pulse)
            elif seg_i == 2:
                draw_act3_orrery_and_lyrics(img_clean, draw_clean, cover_img, t_sec, local_t, bass, bands32, beat_pulse)
            elif seg_i == 3:
                draw_act4_audience_hifi_observatory(img_clean, draw_clean, cover_img, t_sec, local_t, bass, bands32, beat_pulse)
            elif seg_i == 4:
                draw_act5_audience_party_and_vault(img_clean, draw_clean, cover_img, t_sec, local_t, bass, bands32, beat_pulse)
            elif seg_i == 5:
                draw_act6_creator_studio_mixer(img_clean, draw_clean, cover_img, t_sec, local_t, bass, bands32, beat_pulse)
            elif seg_i == 6:
                draw_act7_creator_manager_and_promo(img_clean, draw_clean, cover_img, t_sec, local_t, bass, bands32, beat_pulse)
            else:
                draw_act8_dramatic_cta(img_clean, draw_clean, cover_img, t_sec, local_t, bass, bands32, beat_pulse, include_text=False)

            # Subtle chromatic flash on the very first 2 frames of a cut (impact transition)
            if f_idx - f_start < 2 and seg_i > 0:
                flash_strength = 0.38 if (f_idx == f_start and seg_i == 7) else 0.18
                arr_c = np.array(img_clean, dtype=np.float32)
                arr_c = np.clip(arr_c + flash_strength * np.array(spec["accent"], dtype=np.float32), 0, 255).astype(np.uint8)
                img_clean = Image.fromarray(arr_c, mode="RGB")

            clean_np = np.array(img_clean, dtype=np.uint8)
            clean_frames.append(clean_np)

            # Create titled master frame (clean plate + kinetic typography overlay)
            img_titled = img_clean.copy()
            draw_titled = ImageDraw.Draw(img_titled)
            if seg_i == 7:
                # Re-draw CTA button text on Act 8 master frame
                draw_act8_dramatic_cta(img_titled, draw_titled, cover_img, t_sec, local_t, bass, bands32, beat_pulse, include_text=True)
            draw_kinetic_title_overlay(draw_titled, spec, local_t, seg_dur, beat_pulse)
            titled_np = np.array(img_titled, dtype=np.uint8)
            titled_frames.append(titled_np)
            master_frames.append(titled_np)

        # Save poster thumbnail PNG for Fabula media pool
        thumb_path = os.path.join(CLIPS_DIR, f"{spec['id']}_thumb.png")
        Image.fromarray(titled_frames[min(10, len(titled_frames) - 1)]).resize((640, 360), Image.Resampling.BILINEAR).save(thumb_path)

        # Encode clean plate MP4 (for Fabula V1 timeline so Fabula's S1 Title clips don't double-render)
        clean_mp4 = os.path.join(PLATES_DIR, f"{spec['id']}_clean.mp4")
        encode_frames_to_mp4(clean_frames, clean_mp4)

        # Encode titled clip MP4
        titled_mp4 = os.path.join(CLIPS_DIR, f"{spec['id']}.mp4")
        encode_frames_to_mp4(titled_frames, titled_mp4)

        segment_meta.append({
            "index": seg_i,
            "id": spec["id"],
            "name": spec["name"],
            "startSec": round(t0, 3),
            "endSec": round(t1, 3),
            "durationSec": round(t1 - t0, 3),
            "headline": spec["headline"],
            "subheadline": spec["subheadline"],
            "badge": spec["badge"],
            "accentHex": "#{:02X}{:02X}{:02X}".format(*spec["accent"]),
            "cleanUrl": f"/promo/chora/plates/{spec['id']}_clean.mp4",
            "titledUrl": f"/promo/chora/clips/{spec['id']}.mp4",
            "thumbUrl": f"/promo/chora/clips/{spec['id']}_thumb.png",
        })

    # Encode full 30.0s Master Spot MP4 with the mastered audio mix!
    mix_wav = os.path.join(AUDIO_DIR, "chora_promo_30s_mix.wav")
    master_mp4 = os.path.join(OUT_DIR, "chora_promo_30s_master.mp4")
    print(f"Encoding 30.0s Master Promo Video: {master_mp4}...")
    encode_frames_to_mp4(master_frames, master_mp4, audio_path=mix_wav)

    # Save master poster frame
    poster_path = os.path.join(OUT_DIR, "chora_promo_30s_poster.png")
    Image.fromarray(master_frames[int(27.2 * FPS)]).save(poster_path)

    meta["segments"] = segment_meta
    meta["masterVideoUrl"] = "/promo/chora/chora_promo_30s_master.mp4"
    meta["posterUrl"] = "/promo/chora/chora_promo_30s_poster.png"
    with open(analysis_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    print("All 8 segments + 30.0s Master Promo MP4 rendered successfully!")


if __name__ == "__main__":
    main()

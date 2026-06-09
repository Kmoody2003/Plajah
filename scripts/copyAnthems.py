# Copy anthem audio files and build anthemLyrics.ts from the Gemini antigravity scratch folder.
import shutil, os, re

SRC = r'C:\Users\Kenne\.gemini\antigravity\scratch\world-cup-2026-anthems\data'
AUDIO_DEST = r'C:\Users\Kenne\plajah\public\audio\anthems'
LYRICS_OUT = r'C:\Users\Kenne\plajah\data\anthemLyrics.ts'

# Map folder slug → team ID
FOLDER_TO_ID = {
    'A-czechia':              'cze',
    'A-korea-republic':       'kor',
    'A-mexico':               'mex',
    'A-south-africa':         'rsa',
    'B-bosnia-and-herzegovina': 'bih',
    'B-canada':               'can',
    'B-qatar':                'qat',
    'B-switzerland':          'sui',
    'C-brazil':               'bra',
    'C-haiti':                'hai',
    'C-morocco':              'mar',
    'C-scotland':             'sco',
    'D-australia':            'aus',
    'D-paraguay':             'par',
    'D-turkiye':              'tur',
    'D-united-states':        'usa',
    'E-cote-d-ivoire':        'civ',
    'E-curacao':              'cuw',
    'E-ecuador':              'ecu',
    'E-germany':              'ger',
    'F-japan':                'jpn',
    'F-netherlands':          'ned',
    'F-sweden':               'swe',
    'F-tunisia':              'tun',
    'G-belgium':              'bel',
    'G-egypt':                'egy',
    'G-ir-iran':              'irn',
    'G-new-zealand':          'nzl',
    'H-cabo-verde':           'cpv',
    'H-saudi-arabia':         'ksa',
    'H-spain':                'esp',
    'H-uruguay':              'ury',
    'I-france':               'fra',
    'I-iraq':                 'irq',
    'I-norway':               'nor',
    'I-senegal':              'sen',
    'J-algeria':              'alg',
    'J-argentina':            'arg',
    'J-austria':              'aut',
    'J-jordan':               'jor',
    'K-colombia':             'col',
    'K-dr-congo':             'cod',
    'K-portugal':             'por',
    'K-uzbekistan':           'uzb',
    'L-croatia':              'cro',
    'L-england':              'eng',
    'L-ghana':                'gha',
    'L-panama':               'pan',
}

def esc_ts(s):
    return s.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')

os.makedirs(AUDIO_DEST, exist_ok=True)
lyrics_map = {}
copied = 0
missing_audio = []
missing_lyrics = []

for folder, team_id in FOLDER_TO_ID.items():
    folder_path = os.path.join(SRC, folder)
    audio_src = os.path.join(folder_path, 'audio', 'anthem.mp3')
    lyrics_src = os.path.join(folder_path, 'lyrics.md')

    # Copy audio
    if os.path.exists(audio_src):
        dest = os.path.join(AUDIO_DEST, f'{team_id}.mp3')
        shutil.copy2(audio_src, dest)
        copied += 1
    else:
        missing_audio.append(team_id)

    # Read lyrics
    if os.path.exists(lyrics_src):
        with open(lyrics_src, 'r', encoding='utf-8') as f:
            lyrics_map[team_id] = f.read().strip()
    else:
        missing_lyrics.append(team_id)

print(f"Copied {copied}/48 audio files")
if missing_audio:
    print(f"Missing audio: {missing_audio}")
if missing_lyrics:
    print(f"Missing lyrics: {missing_lyrics}")

# Write anthemLyrics.ts
lines = []
w = lines.append
w("// National anthem lyrics for all 48 FIFA World Cup 2026 nations")
w("// Source: nationalanthems.info (CC BY 4.0). Audio © respective rights holders; kept in public/audio/anthems/")
w("")
w("export const ANTHEM_LYRICS: Record<string, string> = {")
for team_id, lyrics in sorted(lyrics_map.items()):
    escaped = esc_ts(lyrics)
    w(f"  {team_id}: `{escaped}`,")
    w("")
w("};")
w("")
w("export const ANTHEM_AUDIO_PATH = (teamId: string) => `/audio/anthems/${teamId}.mp3`;")

with open(LYRICS_OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines) + '\n')

print(f"Written {len(lyrics_map)} lyrics entries to {LYRICS_OUT}")

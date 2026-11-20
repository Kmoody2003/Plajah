"""
The civic riverfront on the east bank (docs/apex-elohim/east-bank-masterplan.md): Kenne's corridor map turned a quarter turn so its water side faces the
river, laid along the east bank's shoreline from the harbour circuit in the north down to downtown's river frontage.

The shoreline was traced from the drawn ground (scripts/apex-sample-ground.mjs): scanning east from the river, the first land that stays land for 150 m,
every 100 m of z. Writes public/games/forth-horizon/region/civic_riverfront.json:
  shore     the shoreline, north to south ([x, z], smoothed)
  sectors   along it by z: opera & marina, museum & botanical gardens, amphitheatre & urban beach, civic parklands, downtown frontage (promenade only)
Downtown itself is not changed: on its frontage only the promenade (embankment, railing, lamps, palms, benches) goes in, and only where nothing stands.
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
REGION = os.path.join(HERE, '..', '..', '..', 'public', 'games', 'forth-horizon', 'region')

# traced shoreline, every 100 m of z from the harbour circuit's south end to the end of downtown's frontage
SHORE = [(6620, -2500), (6500, -2400), (6400, -2300), (6320, -2200), (6200, -2100), (6080, -2000), (5980, -1900), (5920, -1800), (5880, -1700), (5860, -1600),
         (5840, -1500), (5800, -1400), (5760, -1300), (5700, -1200), (5660, -1100), (5640, -1000), (5540, -900), (5440, -800), (5340, -700), (5260, -600),
         (5180, -500), (5100, -400), (5110, -300), (5130, -200), (5140, -100), (5060, 0), (5000, 100), (4960, 200), (5030, 300), (5100, 400), (5160, 500),
         (5100, 600), (5040, 700), (5000, 800), (5020, 900), (5040, 1000), (5040, 1100), (4980, 1200), (4920, 1300), (4860, 1400), (4840, 1500),
         (4830, 1600), (4820, 1700), (4800, 1800), (4770, 1900), (4740, 2000)]

def smooth(pts, passes=3):
    for _ in range(passes):
        pts = [pts[0]] + [((pts[i - 1][0] + 2 * pts[i][0] + pts[i + 1][0]) / 4, pts[i][1]) for i in range(1, len(pts) - 1)] + [pts[-1]]
    return pts

def main():
    shore = smooth(SHORE)
    out = {
        'name': 'Civic Riverfront', 'shore': [[round(x, 1), z] for x, z in shore],
        'sectors': [
            {'id': 'opera_marina', 'name': 'Opera & Marina District', 'z': [-2450, -1700]},
            {'id': 'museum_gardens', 'name': 'Museum Plaza & Botanical Gardens', 'z': [-1700, -900]},
            {'id': 'amphitheatre_beach', 'name': 'Concert Amphitheatre & Urban Beach', 'z': [-900, -100]},
            {'id': 'parklands', 'name': 'Civic Parklands', 'z': [-100, 800]},
            {'id': 'downtown_frontage', 'name': 'Downtown Riverfront', 'z': [800, 2000], 'promenadeOnly': True},
        ],
    }
    f = os.path.join(REGION, 'civic_riverfront.json')
    json.dump(out, open(f, 'w'), indent=1)
    print('wrote', f, len(shore), 'shore points')

if __name__ == '__main__':
    main()

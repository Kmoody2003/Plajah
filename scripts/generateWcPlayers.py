"""
Generate data/worldCupPlayers.ts from the official FIFA WC2026 squad list PDF.
Writes directly to the output file.
"""
import sys, io, re
from pypdf import PdfReader
from datetime import date

tournament_date = date(2026, 6, 11)
reader = PdfReader(r'C:\Users\Kenne\Downloads\SquadLists-English.pdf')

POS_MAP = {'GK': 'GK', 'DF': 'DEF', 'MF': 'MID', 'FW': 'FWD'}

TEAMS = [
  (1,  'alg', 'Algeria'),
  (2,  'arg', 'Argentina'),
  (3,  'aus', 'Australia'),
  (4,  'aut', 'Austria'),
  (5,  'bel', 'Belgium'),
  (6,  'bih', 'Bosnia And Herzegovina'),
  (7,  'bra', 'Brazil'),
  (8,  'cpv', 'Cabo Verde'),
  (9,  'can', 'Canada'),
  (10, 'col', 'Colombia'),
  (11, 'cod', 'Congo DR'),
  (12, 'civ', 'Côte D\'Ivoire'),
  (13, 'cro', 'Croatia'),
  (14, 'cuw', 'Curaçao'),
  (15, 'cze', 'Czechia'),
  (16, 'ecu', 'Ecuador'),
  (17, 'egy', 'Egypt'),
  (18, 'eng', 'England'),
  (19, 'fra', 'France'),
  (20, 'ger', 'Germany'),
  (21, 'gha', 'Ghana'),
  (22, 'hai', 'Haiti'),
  (23, 'irn', 'IR Iran'),
  (24, 'irq', 'Iraq'),
  (25, 'jpn', 'Japan'),
  (26, 'jor', 'Jordan'),
  (27, 'kor', 'Korea Republic'),
  (28, 'mex', 'Mexico'),
  (29, 'mar', 'Morocco'),
  (30, 'ned', 'Netherlands'),
  (31, 'nzl', 'New Zealand'),
  (32, 'nor', 'Norway'),
  (33, 'pan', 'Panama'),
  (34, 'par', 'Paraguay'),
  (35, 'por', 'Portugal'),
  (36, 'qat', 'Qatar'),
  (37, 'ksa', 'Saudi Arabia'),
  (38, 'sco', 'Scotland'),
  (39, 'sen', 'Senegal'),
  (40, 'rsa', 'South Africa'),
  (41, 'esp', 'Spain'),
  (42, 'swe', 'Sweden'),
  (43, 'sui', 'Switzerland'),
  (44, 'tun', 'Tunisia'),
  (45, 'tur', 'Türkiye'),
  (46, 'ury', 'Uruguay'),
  (47, 'usa', 'USA'),
  (48, 'uzb', 'Uzbekistan'),
]

# Notable players: {slug_key: (wiki_slug, is_key, is_captain, custom_bio_or_None)}
NOTABLE = {
  # Argentina
  'arg_messi':      ('Lionel_Messi', True, True, 'The greatest player of all time, Messi leads Argentina as defending World Cup champion. His genius at 38 remains unmatched on the world stage.'),
  'arg_martinez_l': ('Lautaro_Martínez', True, False, 'Argentina\'s clinical striker and Champions League winner with Inter Milan, Martínez is lethal inside the box.'),
  'arg_mac_allister':('Alexis_Mac_Allister', True, False, 'Liverpool\'s energetic midfielder, Mac Allister was outstanding in Argentina\'s 2022 World Cup triumph.'),
  'arg_de_paul':    ('Rodrigo_De_Paul', False, False, 'A relentless engine in Argentina\'s midfield, De Paul has been central to their consecutive Copa América and World Cup victories.'),
  # Brazil
  'bra_vinicius':   ('Vinicius_Junior', True, False, 'The electrifying Real Madrid winger who won the Ballon d\'Or, Vinicius Junior is Brazil\'s most dangerous attacker with blistering pace and creativity.'),
  'bra_neymar':     ('Neymar_Jr', True, True, 'Brazil\'s all-time top scorer and global icon, Neymar returns from injury for a final chance at World Cup glory.'),
  'bra_rodrygo':    (None, False, False, None),
  'bra_alisson':    ('Alisson_Becker', True, False, 'One of the world\'s best goalkeepers, Alisson\'s shot-stopping and distribution are world-class.'),
  'bra_raphinha':   ('Raphinha', True, False, 'Barcelona\'s Brazilian winger, Raphinha is a creative force with goals, assists, and relentless energy.'),
  # France
  'fra_mbappe':     ('Kylian_Mbappé', True, True, 'The fastest and most lethal forward in the world, Mbappé carries France\'s World Cup aspirations. A 2018 winner seeking his second title.'),
  'fra_dembele':    ('Ousmane_Dembélé', True, False, 'PSG\'s lightning-quick winger, Dembélé brings pace and creativity to France\'s attack.'),
  'fra_maignan':    ('Mike_Maignan', True, False, 'One of Europe\'s elite goalkeepers, Maignan\'s reflexes and presence between the posts are world-class.'),
  'fra_tchouameni': ('Aurélien_Tchouaméni', False, False, 'Real Madrid\'s commanding defensive midfielder, Tchouaméni anchors France\'s midfield with physicality and intelligence.'),
  'fra_saliba':     ('William_Saliba', False, False, 'Arsenal\'s outstanding centre-back, Saliba has emerged as one of Europe\'s best defenders.'),
  # England
  'eng_kane':       ('Harry_Kane', True, True, 'England\'s all-time leading scorer, Kane seeks his first major trophy at his third World Cup.'),
  'eng_bellingham': ('Jude_Bellingham', True, False, 'Real Madrid\'s spectacular midfielder, Bellingham is England\'s most complete player — creative, hard-working, and lethal in front of goal.'),
  'eng_saka':       ('Bukayo_Saka', True, False, 'Arsenal\'s versatile and brilliant winger, Saka is one of the most consistent and dangerous players in world football.'),
  'eng_rice':       ('Declan_Rice', True, False, 'Arsenal\'s dominant defensive midfielder, Rice sets the tone for England with his tireless pressing and distribution.'),
  # Spain
  'esp_yamal':      ('Lamine_Yamal', True, False, 'The teenage prodigy who won Euro 2024 with Spain, Lamine Yamal is already one of the world\'s most exciting players.'),
  'esp_pedri':      ('Pedri', True, False, 'Barcelona\'s brilliant midfield maestro, Pedri combines vision, technique, and intelligence beyond his years.'),
  'esp_rodri':      ('Rodri_(footballer)', True, False, 'The Ballon d\'Or winner and Manchester City\'s midfield genius, Rodri is arguably the world\'s best defensive midfielder.'),
  'esp_olmo':       ('Dani_Olmo', False, False, 'A key figure in Spain\'s Euro 2024 triumph, Olmo provides creativity and goals from attacking midfield.'),
  # Germany
  'ger_wirtz':      ('Florian_Wirtz', True, False, 'Liverpool\'s gifted attacking midfielder, Wirtz is the most exciting young German talent since Müller.'),
  'ger_musiala':    ('Jamal_Musiala', True, False, 'Bayern Munich\'s brilliant midfielder, Musiala combines technical brilliance, pace, and game intelligence at age 23.'),
  'ger_havertz':    ('Kai_Havertz', False, False, 'Arsenal\'s versatile attacker and 2021 Champions League winner, Havertz is a dynamic threat in Germany\'s attack.'),
  'ger_neuer':      ('Manuel_Neuer', False, False, 'The legendary German goalkeeper and innovator of the sweeper-keeper role, Neuer leads Germany\'s defence at age 40.'),
  # Portugal
  'por_ronaldo':    ('Cristiano_Ronaldo', True, True, 'Football\'s all-time top scorer, Ronaldo plays his sixth and final World Cup, still lethal at 41 and hungry for glory.'),
  'por_felix':      ('João_Félix', False, False, 'One of Portugal\'s most gifted attacking players, João Félix brings flair and creativity to Portugal\'s attack.'),
  'por_leao':       ('Rafael_Leão', True, False, 'AC Milan\'s explosive Portuguese winger, Leão is one of Europe\'s most dangerous attackers on his day.'),
  'por_bruno':      ('Bruno_Fernandes', True, False, 'Manchester United\'s captain and creative hub, Bruno Fernandes is Portugal\'s key playmaker and set-piece specialist.'),
  # Netherlands
  'ned_van_dijk':   ('Virgil_van_Dijk', True, True, 'Liverpool\'s imposing captain and one of the world\'s best centre-backs, Van Dijk leads Netherlands\' defence with authority.'),
  'ned_gakpo':      ('Cody_Gakpo', True, False, 'Liverpool\'s clinical striker, Gakpo is one of the Premier League\'s most in-form attackers.'),
  'ned_de_jong':    ('Frenkie_de_Jong', False, False, 'Barcelona\'s elegant midfielder, De Jong is a creative force who controls games with his passing and movement.'),
  'ned_reijnders': ('Tijjani_Reijnders', False, False, 'Manchester City\'s dynamic midfielder, Reijnders brings energy and goals from midfield.'),
  # Morocco
  'mar_hakimi':     ('Achraf_Hakimi', True, True, 'PSG\'s dynamic right-back, Hakimi is one of the most attack-minded defenders in world football and Morocco\'s talisman.'),
  'mar_diaz_b':     ('Brahim_Díaz', True, False, 'Real Madrid\'s creative attacking midfielder, Brahim Díaz provides Morocco with skill and vision in the final third.'),
  'mar_amrabat':    ('Sofyan_Amrabat', False, False, 'Real Betis\'s combative defensive midfielder, Amrabat was outstanding in Morocco\'s historic 2022 World Cup run.'),
  # USA
  'usa_pulisic':    ('Christian_Pulisic', True, True, 'The face of American soccer, Pulisic\'s technical quality and finishing at AC Milan make him USMNT\'s most dangerous attacker.'),
  'usa_adams':      ('Tyler_Adams', False, False, 'A tenacious defensive midfielder and natural leader, Adams sets the tempo for USMNT with his pressing and intensity.'),
  'usa_mckennie':   ('Weston_McKennie', False, False, 'A combative box-to-box midfielder with a flair for big goals, McKennie has become a Serie A regular at Juventus.'),
  'usa_reyna':      ('Giovanni_Reyna', False, False, 'Borussia Mönchengladbach\'s technically gifted attacking midfielder, Reyna is one of America\'s most naturally talented players.'),
  # Mexico
  'mex_gimenez':    ('Santiago_Giménez', True, False, 'Mexico\'s most prolific striker, Giménez\'s goals for AC Milan have made him one of Serie A\'s most feared forwards.'),
  'mex_lozano':     ('Hirving_Lozano', False, False, 'Mexico\'s pacey and creative winger, "Chucky" Lozano is a constant threat with pace, trickery, and an eye for goal.'),
  # Canada
  'can_davies':     ('Alphonso_Davies', True, False, 'Bayern Munich\'s rocket-fuelled left-back, Davies is one of the fastest players in world football and Canada\'s star player.'),
  'can_david':      ('Jonathan_David', True, False, 'One of Europe\'s most prolific strikers, David has scored over 100 Ligue 1 goals and is Canada\'s chief finisher.'),
  # Colombia
  'col_diaz_l':     ('Luis_Díaz', True, False, 'Bayern Munich\'s explosive left winger, Díaz combines blistering pace with creativity and clinical finishing.'),
  'col_rodriguez':  ('James_Rodríguez', False, False, 'A World Cup legend from 2014, James Rodriguez brings world-class creativity and set-piece delivery to Colombia\'s attack.'),
  # Argentina
  'arg_romero':     ('Cristian_Romero', False, False, 'Tottenham\'s dominant centre-back, Romero is aggressive, commanding, and one of the Premier League\'s best defenders.'),
  # Norway
  'nor_haaland':    ('Erling_Haaland', True, True, 'Manchester City\'s prolific striker and Premier League record-breaker, Haaland is the most feared centre-forward in the world.'),
  'nor_odegaard':   ('Martin_Ødegaard', True, False, 'Arsenal\'s creative captain, Ødegaard is Norway\'s playmaker and one of the Premier League\'s most complete midfielders.'),
  # Sweden
  'swe_isak':       ('Alexander_Isak', True, False, 'Liverpool\'s clinical and technically outstanding striker, Isak is one of Europe\'s most exciting forwards.'),
  'swe_gyokeres':   ('Viktor_Gyökeres', True, False, 'Arsenal\'s prolific striker who shattered Sporting CP\'s goalscoring records, Gyökeres is one of football\'s hottest properties.'),
  # Japan
  'jpn_kubo':       ('Takefusa_Kubo', True, False, 'Real Sociedad\'s gifted attacking midfielder, Kubo is Japan\'s most creative and dangerous player.'),
  'jpn_endo':       ('Wataru_Endo', False, False, 'Liverpool\'s defensive midfielder, Endo provides Japan with leadership and ball-winning quality in the heart of midfield.'),
  # South Korea
  'kor_son':        ('Son_Heung-min', True, True, 'LAFC\'s prolific captain and former Tottenham legend, Son is one of the greatest Asian footballers of all time.'),
  'kor_kim_mj':     ('Kim_Min-jae', True, False, 'Bayern Munich\'s dominant centre-back, Kim Min-jae is one of the world\'s best defenders.'),
  # Senegal
  'sen_mane':       ('Sadio_Mané', True, True, 'Al Nassr\'s legendary winger and Africa Cup of Nations winner, Mané remains one of Africa\'s greatest players.'),
  'sen_jackson':    ('Nicolas_Jackson', True, False, 'Bayern Munich\'s dynamic striker, Jackson brings pace, power, and goals to Senegal\'s attack.'),
  'sen_pape_sarr':  ('Pape_Matar_Sarr', False, False, 'Tottenham\'s energetic midfielder, Pape Matar Sarr is a powerful ball-carrier and goal threat from midfield.'),
  # Egypt
  'egy_salah':      ('Mohamed_Salah', True, True, 'Liverpool\'s legendary winger and one of the greatest players of his generation, Salah is Egypt\'s all-time top scorer.'),
  'egy_marmou':     ('Omar_Marmoush', True, False, 'Manchester City\'s prolific Egyptian attacker, Marmoush was one of the Bundesliga\'s top scorers before his move to the Premier League.'),
  # Belgium
  'bel_de_bruyne':  ('Kevin_De_Bruyne', True, True, 'Napoli\'s creative genius and one of the greatest midfielders ever, De Bruyne\'s vision and passing are peerless.'),
  'bel_lukaku':     ('Romelu_Lukaku', True, False, 'Napoli\'s powerful striker and Belgium\'s all-time leading scorer, Lukaku is a physically dominant and technically capable centre-forward.'),
  'bel_doku':       ('Jeremy_Doku', False, False, 'Manchester City\'s lightning-quick winger, Doku is one of the most exciting young dribblers in world football.'),
  # Switzerland
  'sui_xhaka':      ('Granit_Xhaka', True, True, 'Sunderland\'s captain and Switzerland\'s experienced defensive midfielder, Xhaka is a combative and influential presence.'),
  # Croatia
  'cro_modric':     ('Luka_Modrić', True, True, 'AC Milan\'s legendary playmaker and Ballon d\'Or winner, Modrić graces the world stage one final time at 40.'),
  # IR Iran
  'irn_taremi':     ('Mehdi_Taremi', True, True, 'Olympiacos\'s prolific Iranian striker, Taremi is one of the most clinical forwards in Iranian football history.'),
  # Australia
  'aus_ryan':       ('Mat_Ryan', True, True, 'Levante\'s experienced goalkeeper and Socceroos captain, Ryan is Australia\'s most-capped player.'),
  # Algeria
  'alg_mahrez':     ('Riyad_Mahrez', True, True, 'Al Ahli\'s Algerian winger and former Premier League and Champions League winner, Mahrez brings world-class quality.'),
  # Ghana
  'gha_partey':     ('Thomas_Partey', True, True, 'Ghana\'s experienced defensive midfielder, Partey\'s combative style and range of passing make him the heart of the Black Stars.'),
  # Türkiye
  'tur_calhanoglu': ('Hakan_Çalhanoğlu', True, True, 'Inter Milan\'s creative captain, Çalhanoğlu is one of the world\'s best free-kick specialists and a devastating deep-lying playmaker.'),
  'tur_guler':      ('Arda_Güler', True, False, 'Real Madrid\'s gifted teenage midfielder, Güler is Turkey\'s brightest talent and one of world football\'s most exciting prospects.'),
  # Uruguay
  'ury_valverde':   ('Federico_Valverde', True, False, 'Real Madrid\'s box-to-box dynamo, Valverde is one of world football\'s most complete midfielders — energetic, creative, and clinical.'),
  'ury_nunez':      ('Darwin_Núñez', True, False, 'Al Hilal\'s powerful Uruguayan striker, Núñez brings pace, physicality, and an eye for goal.'),
  'ury_araujo':     ('Ronald_Araújo', False, False, 'Barcelona\'s commanding centre-back, Araújo is one of the world\'s best defenders — dominant in the air and aggressive in the tackle.'),
  # Qatar
  'qat_afif':       ('Akram_Afif', True, True, 'Qatar\'s star winger and Asian Player of the Year, Afif was the leading scorer at the 2023 Asian Cup.'),
}

def calc_age(dob_str):
    d, m, y = int(dob_str[:2]), int(dob_str[3:5]), int(dob_str[6:])
    born = date(y, m, d)
    age = 2026 - y
    if (born.month, born.day) > (tournament_date.month, tournament_date.day):
        age -= 1
    return age

def strip_country(club):
    return re.sub(r'\s*\([A-Z]{2,3}\)\s*$', '', club).strip()

def extract_name(raw):
    """Extract display name from PDF field (after POS prefix removed)."""
    raw = raw.strip()
    # Insert space at lowercase→uppercase transitions (handles 'RamsésBECKER')
    spaced = re.sub(r'([a-zÀ-ɏ])([A-Z])', r'\1 \2', raw)

    # Find first mixed-case start
    mc_m = re.search(r'[A-ZÀ-ɏ][a-zÀ-ɏ]', spaced)
    if not mc_m:
        # All caps name: use first word
        first_word = spaced.split()[0] if spaced.split() else spaced
        return first_word.title()

    # All-caps words in the text (3+ chars = significant)
    all_caps = re.findall(r'[A-Z]{3,}(?:\s[A-Z]{3,})*', spaced)

    # Last name = first all-caps block
    first_caps_m = re.match(r'([A-Z][A-Z\-\s]+?)(?=\s+[A-Z][a-zÀ-ɏ])', spaced)
    if first_caps_m:
        last_raw = first_caps_m.group(1).strip().split()[-1]  # last word of first caps block
    elif all_caps:
        last_raw = all_caps[0].split()[-1]
    else:
        last_raw = ''
    last_name = last_raw.title()

    # First name: from first mixed-case position
    from_mc = spaced[mc_m.start():]
    # Stop at first 3+ char all-caps block
    first_m = re.match(r'(.+?)(?=\s+[A-Z]{3,}|\s*$)', from_mc)
    first_raw = first_m.group(1).strip() if first_m else from_mc.strip()
    # Dedup: if 'WordWord' at start (e.g., 'LionelLionel'), collapse
    first_raw = re.sub(r'^([A-ZÀ-ɏ][a-zÀ-ɏ]\w*)\1\b', r'\1', first_raw)
    # Take only first word
    first_word = first_raw.split()[0] if first_raw.split() else first_raw

    # If first word == last_name (case-insensitive), use next all-caps word as last name
    if first_word.lower() == last_name.lower() and len(all_caps) > 1:
        last_name = all_caps[1].split()[-1].title()

    display = (first_word + ' ' + last_name).strip()
    return display

def make_slug(name):
    s = re.sub(r'[^a-z0-9]', '_', name.lower())
    s = re.sub(r'_+', '_', s).strip('_')
    return s[:20]

def esc(s):
    """Escape for TypeScript single-quoted string."""
    return s.replace('\\', '\\\\').replace("'", "\\'")

def parse_page(page_num, team_id, country_name):
    page = reader.pages[page_num - 1]
    text = page.extract_text().replace('\x00', '')
    lines = text.split('\n')
    players = []
    jersey = 1
    for line in lines:
        pos_m = re.match(r'^(GK|DF|MF|FW)', line)
        if not pos_m:
            continue
        dob_m = re.search(r'(\d{2}/\d{2}/\d{4})', line)
        if not dob_m:
            continue
        dob = dob_m.group(1)
        after_dob = line[dob_m.end():]
        h_m = re.search(r'\s(\d{3})\s*$', after_dob)
        club_raw = after_dob[:h_m.start()].strip() if h_m else after_dob.strip()
        club = strip_country(club_raw)
        pos = POS_MAP[pos_m.group(1)]
        before_dob = line[:dob_m.start()][2:].strip()  # remove pos prefix
        name = extract_name(before_dob)
        age = calc_age(dob)
        players.append({
            'jersey': jersey,
            'pos': pos,
            'name': name,
            'club': club,
            'age': age,
        })
        jersey += 1
    return players

def make_ts_entry(player, team_id, country_name):
    jersey = player['jersey']
    pos = player['pos']
    name = player['name']
    club = player['club']
    age = player['age']

    name_slug = make_slug(name)
    key = f"{team_id}_{name_slug}"

    notable = NOTABLE.get(key, None)
    is_key = notable[1] if notable else False
    is_cap = notable[2] if notable else False
    wiki = notable[0] if notable and notable[0] else None
    bio = notable[3] if notable and len(notable) > 3 and notable[3] else f"{name} represents {country_name} in the official FIFA World Cup 2026 squad."

    pos_role = {'GK': 'goalkeeper', 'DEF': 'defender', 'MID': 'midfielder', 'FWD': 'forward'}[pos]

    opts_parts = []
    if is_cap:
        opts_parts.append('captain: true')
    if is_key:
        opts_parts.append('key: true')
    if wiki:
        opts_parts.append(f"wiki: '{wiki}'")
    opts = '{ ' + ', '.join(opts_parts) + ' }' if opts_parts else '{}'

    name_esc = esc(name)
    club_esc = esc(club)
    bio_esc = esc(bio)

    return (
        f"  p('{name_slug}', '{team_id}', '{name_esc}', {jersey}, '{pos}', {age}, "
        f"'{club_esc}', 0, 0, 0, '{bio_esc}', {opts}),"
    )

OUTPUT_PATH = r'C:\Users\Kenne\plajah\data\worldCupPlayers.ts'

lines = []
w = lines.append

w("// FIFA World Cup 2026 — Official squad lists (48 nations x 26 players)")
w("// Source: FIFA official squad list PDF, June 9 2026")
w("// Jersey numbers = position in official list (sorted by squad number)")
w("")
w("export type WC26Position = 'GK' | 'DEF' | 'MID' | 'FWD';")
w("")
w("export interface WC26Player {")
w("  id: string;")
w("  teamId: string;")
w("  name: string;")
w("  number: number;")
w("  position: WC26Position;")
w("  age: number;")
w("  club: string;")
w("  caps: number;")
w("  goals: number;")
w("  assists: number;")
w("  isCaptain?: boolean;")
w("  isKeyPlayer?: boolean;")
w("  bio: string;")
w("  wikiSlug?: string;")
w("}")
w("")
w("const p = (")
w("  id: string, teamId: string, name: string, number: number,")
w("  position: WC26Position, age: number, club: string,")
w("  caps: number, goals: number, assists: number,")
w("  bio: string, opts: { captain?: boolean; key?: boolean; wiki?: string } = {}")
w("): WC26Player => ({")
w("  id: `${teamId}_${id}`,")
w("  teamId,")
w("  name,")
w("  number,")
w("  position,")
w("  age,")
w("  club,")
w("  caps,")
w("  goals,")
w("  assists,")
w("  bio,")
w("  isCaptain: opts.captain,")
w("  isKeyPlayer: opts.key,")
w("  wikiSlug: opts.wiki,")
w("});")
w("")
w("export const WC26_PLAYERS: WC26Player[] = [")

for page_num, team_id, country_name in TEAMS:
    players = parse_page(page_num, team_id, country_name)
    w("")
    w(f"  // ── {country_name} " + "─" * (42 - len(country_name)))
    for pl in players:
        w(make_ts_entry(pl, team_id, country_name))

w("];")
w("")
w("// ── Helpers ──────────────────────────────────────────────────────────────────────────")
w("")
w("const _playerMap = new Map(WC26_PLAYERS.map(p => [p.id, p]));")
w("const _teamMap = new Map<string, WC26Player[]>();")
w("for (const p of WC26_PLAYERS) {")
w("  if (!_teamMap.has(p.teamId)) _teamMap.set(p.teamId, []);")
w("  _teamMap.get(p.teamId)!.push(p);")
w("}")
w("")
w("export const getPlayersByTeam = (teamId: string): WC26Player[] =>")
w("  _teamMap.get(teamId) ?? [];")
w("")
w("export const getKeyPlayers = (teamId: string): WC26Player[] =>")
w("  (getPlayersByTeam(teamId)).filter(p => p.isKeyPlayer);")
w("")
w("export const getCaptain = (teamId: string): WC26Player | undefined =>")
w("  (getPlayersByTeam(teamId)).find(p => p.isCaptain);")
w("")
w("export const getPlayerById = (id: string): WC26Player | undefined =>")
w("  _playerMap.get(id);")
w("")
w("export const getPositionLabel = (pos: WC26Position): string =>")
w("  ({ GK: 'Goalkeeper', DEF: 'Defender', MID: 'Midfielder', FWD: 'Forward' }[pos]);")
w("")
w("export const getPositionColor = (pos: WC26Position): string =>")
w("  ({ GK: '#f59e0b', DEF: '#3b82f6', MID: '#10b981', FWD: '#ef4444' }[pos]);")

with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines) + '\n')

print(f"Written {len([l for l in lines if l.strip().startswith('p(')])} players to {OUTPUT_PATH}")

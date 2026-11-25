"""Build the Verse Bible library from eBible.org.

Rule: Verse carries Scripture in as many languages as Plajah may legally host.
Only texts whose licence allows redistribution on a commercial platform are built:
public domain, CC BY, CC BY-SA and CC BY-ND (shown verbatim, never altered).
Non-commercial (NC) licences and anything without a recognised open licence are
left out and listed in report.json for review.

Usage (run with -I; downloaded files are data, never executed):
  python -I scripts/bibleLibrary/build_library.py --work D:/plajah-tmp/bible-library [--only id,id] [--limit N]

Output (in <work>/out, uploaded to storage under bible/v1/):
  catalog.json            every built translation, its language and its licence
  <id>/index.json         books → chapter numbers
  <id>/<book>.json        {"b":book,"c":{"<chapter>":[[verse,text],...]}}

Publish (admin; storage.rules makes bible/** public-read):
  gcloud storage rsync <work>/out gs://gen-lang-client-0665118474.firebasestorage.app/bible/v1 --recursive
    --gzip-in-flight=json --cache-control="public, max-age=86400" --content-type=application/json
"""
import argparse, csv, html, io, json, os, re, sys, time, urllib.request, zipfile

UA = {'User-Agent': 'plajah-verse-library-builder'}
CATALOG_URL = 'https://ebible.org/Scriptures/translations.csv'

# eBible VPL (Haiola) book codes → Verse book numbers (bibleService BOOKS / bibleCanon).
CODES = ('GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SOL ISA JER LAM '
         'EZE DAN HOS JOE AMO OBA JON MIC NAH HAB ZEP HAG ZEC MAL MAT MAR LUK JOH ACT ROM 1CO 2CO GAL EPH PHI COL '
         '1TH 2TH 1TI 2TI TIT PHM HEB JAM 1PE 2PE 1JO 2JO 3JO JUD REV').split()
BOOK_NUM = {c: i + 1 for i, c in enumerate(CODES)}
# Deuterocanon / Septuagint books, numbered as services/bibleCanon.ts numbers them.
BOOK_NUM.update({'1ES': 67, 'TOB': 69, 'JDT': 70, 'WIS': 73, 'SIR': 74, 'BAR': 75, 'SUS': 77, 'BEL': 78,
                 '1MA': 80, '2MA': 81, '3MA': 82, '4MA': 83, 'LJE': 84, 'PSS': 85, 'ODE': 86, 'MAN': 87, '2ES': 88})
# Greek Esther / Daniel stand in for Esther / Daniel when the edition has no Hebrew-order book.
GREEK_FORMS = {'ESG': 17, 'DAG': 27, 'DNG': 27}
EXTRA_NAMES = {87: 'Prayer of Manasseh', 88: '2 Esdras'}


def fetch(url, retries=3):
    for attempt in range(retries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
        except Exception:
            if attempt == retries - 1: raise
            time.sleep(2 * (attempt + 1))


def text_of(raw: bytes) -> str:
    s = raw.decode('utf-8', 'replace')
    s = re.sub(r'<(script|style)[\s\S]*?</\1>', ' ', s, flags=re.I)
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()


def classify(page: str):
    """Return (licence id, allowed, licence url) from an eBible copyright page."""
    low = page.lower()
    m = re.search(r'(https?://creativecommons\.org/[a-z/.\-0-9]+)', page)
    url = m.group(1) if m else ''
    if 'creative commons' in low or 'creativecommons.org' in low:
        nc = 'noncommercial' in low or 'non-commercial' in low or '/by-nc' in low
        nd = 'no derivative' in low or 'noderivative' in low or '/by-nd' in low or '-nd/' in low
        sa = 'sharealike' in low or 'share alike' in low or 'share-alike' in low or '/by-sa' in low
        if nc: return ('CC BY-NC' + ('-ND' if nd else '-SA' if sa else ''), False, url)
        if nd: return ('CC BY-ND 4.0', True, url or 'https://creativecommons.org/licenses/by-nd/4.0/')
        if sa: return ('CC BY-SA 4.0', True, url or 'https://creativecommons.org/licenses/by-sa/4.0/')
        if 'cc0' in low or 'public domain dedication' in low: return ('CC0', True, url)
        return ('CC BY 4.0', True, url or 'https://creativecommons.org/licenses/by/4.0/')
    if 'public domain' in low: return ('Public domain', True, '')
    return ('Other / permission', False, '')


def copyright_line(row) -> str:
    return row['Copyright'].strip() or 'Public domain'


def parse_vpl(txt: str):
    books = {}
    present = set(re.findall(r'^([0-9A-Z]{3}) \d', txt, re.M))
    for line in txt.splitlines():
        m = re.match(r'^([0-9A-Z]{3}) (\d+):(\d+)[a-z]?(?:[-–]\d+[a-z]?)? ?(.*)$', line)
        if not m: continue
        code, ch, vs, body = m.group(1), int(m.group(2)), int(m.group(3)), m.group(4).strip()
        num = BOOK_NUM.get(code)
        if code in GREEK_FORMS and {'ESG': 'EST', 'DAG': 'DAN', 'DNG': 'DAN'}[code] not in present:
            num = GREEK_FORMS[code]
        if not num or not body: continue
        chap = books.setdefault(num, {}).setdefault(ch, {})
        chap[vs] = (chap[vs] + ' ' + body) if vs in chap else body
    return books


def build_one(row, work, out):
    tid = row['translationId']
    cache = os.path.join(work, 'vpl', tid + '_vpl.txt')
    if not os.path.exists(cache):
        z = zipfile.ZipFile(io.BytesIO(fetch(f'https://ebible.org/Scriptures/{tid}_vpl.zip')))
        name = next(n for n in z.namelist() if n.endswith('_vpl.txt'))
        os.makedirs(os.path.dirname(cache), exist_ok=True)
        open(cache, 'wb').write(z.read(name))
    books = parse_vpl(open(cache, encoding='utf-8-sig', errors='replace').read())
    if not books: return None
    d = os.path.join(out, tid); os.makedirs(d, exist_ok=True)
    index = []
    for num in sorted(books):
        chapters = books[num]
        payload = {'b': num, 'c': {str(c): [[v, chapters[c][v]] for v in sorted(chapters[c])] for c in sorted(chapters)}}
        json.dump(payload, open(os.path.join(d, f'{num}.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        index.append({'num': num, 'chapters': sorted(chapters)})
    json.dump({'id': tid, 'books': index}, open(os.path.join(d, 'index.json'), 'w', encoding='utf-8'), separators=(',', ':'))
    return index


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--work', required=True)
    ap.add_argument('--copr', help='folder of pre-fetched <id>.htm copyright pages')
    ap.add_argument('--only', default='')
    ap.add_argument('--limit', type=int, default=0)
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding='utf-8')
    out = os.path.join(a.work, 'out'); os.makedirs(out, exist_ok=True)
    copr = a.copr or os.path.join(a.work, 'copr'); os.makedirs(copr, exist_ok=True)
    csv_path = os.path.join(a.work, 'translations.csv')
    if not os.path.exists(csv_path): open(csv_path, 'wb').write(fetch(CATALOG_URL))
    rows = [r for r in csv.DictReader(open(csv_path, encoding='utf-8-sig'))
            if r['Redistributable'] == 'True' and r['downloadable'] == 'True']
    if a.only: rows = [r for r in rows if r['translationId'] in a.only.split(',')]
    if a.limit: rows = rows[:a.limit]

    catalog, excluded = [], []
    old = os.path.join(out, 'catalog.json')
    for i, r in enumerate(rows):
        tid = r['translationId']
        cp = os.path.join(copr, tid + '.htm')
        try:
            if not os.path.exists(cp):
                open(cp, 'wb').write(fetch(f'https://ebible.org/{tid}/copyright.htm')); time.sleep(0.15)
            page = text_of(open(cp, 'rb').read())
        except Exception as e:
            excluded.append({'id': tid, 'reason': f'no copyright page: {e}'}); continue
        lic, ok, lic_url = classify(page)
        if not ok:
            excluded.append({'id': tid, 'lang': r['languageNameInEnglish'], 'title': r['title'], 'licence': lic,
                             'copyright': r['Copyright']}); continue
        try:
            index = build_one(r, a.work, out)
        except Exception as e:
            excluded.append({'id': tid, 'reason': f'build failed: {e}'}); continue
        if not index:
            excluded.append({'id': tid, 'reason': 'no verses parsed'}); continue
        nums = [b['num'] for b in index]
        catalog.append({
            'id': tid, 'title': (r['shortTitle'] or r['title']).strip(), 'fullTitle': r['title'].strip(),
            'lang': r['languageCode'], 'langName': r['languageName'].strip(), 'langEnglish': r['languageNameInEnglish'].strip(),
            'dialect': r['dialect'].strip(), 'script': r['script'].strip(), 'dir': 'rtl' if r['textDirection'] == 'rtl' else 'ltr',
            'licence': lic, 'licenceUrl': lic_url, 'copyright': copyright_line(r),
            'source': f'https://ebible.org/find/details.php?id={tid}',
            'ot': any(n <= 39 for n in nums), 'nt': any(40 <= n <= 66 for n in nums), 'dc': any(n > 66 for n in nums),
            'books': len(nums), 'updated': r['UpdateDate'],
        })
        print(f'[{i + 1}/{len(rows)}] {tid} {lic} {len(nums)} books', flush=True)
    catalog.sort(key=lambda t: (t['langEnglish'].lower(), t['title'].lower()))
    if a.only and os.path.exists(old):  # partial run: merge into the existing catalog
        keep = [t for t in json.load(open(old, encoding='utf-8')) if t['id'] not in {c['id'] for c in catalog}]
        catalog = sorted(keep + catalog, key=lambda t: (t['langEnglish'].lower(), t['title'].lower()))
    json.dump({'schema': 'plajah-bible-library-v1', 'built': time.strftime('%Y-%m-%d'), 'source': 'https://ebible.org',
               'translations': catalog}, open(old, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump({'built': len(catalog), 'languages': len({t['lang'] for t in catalog}), 'excluded': excluded},
              open(os.path.join(a.work, 'report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'built {len(catalog)} translations in {len({t["lang"] for t in catalog})} languages; excluded {len(excluded)}')


if __name__ == '__main__':
    main()

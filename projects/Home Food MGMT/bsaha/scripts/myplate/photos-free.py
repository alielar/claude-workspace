"""Free-licence photos for the USDA recipes that never had one (data/myplate/no-photo.json).
Sources: Openverse (Flickr and friends, CC0/CC BY/CC BY-SA/PDM) then Wikimedia Commons. The search text per
slug is hand-written in QUERIES (the USDA titles are playful; the query names the plain dish). Photos are
resized like the USDA ones (720px, JPEG q65) into public/dishes/<slug>.jpg and recorded in photos.json with
credit, licence and source page, which the dish page shows. A review list goes to photos-free-review.json.
Run: python3 scripts/myplate/photos-free.py [--dry] ; then ./scripts/make-thumbs.sh and merge.py.
"""
import json, os, re, sys, time, subprocess, urllib.request, urllib.parse
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, 'data/myplate')
UA = 'Bsaha family meal app (contact: ali.elaraki@edueasy.group)'
DRY = '--dry' in sys.argv
ONLY = [a for a in sys.argv[1:] if not a.startswith('--')]

QUERIES = json.load(open(os.path.join(DATA, 'photo-queries.json')))
BAD = re.compile(r'\b(menu|sign|logo|drawing|illustration|packag\w*|book|poster|label|map|can of|cans|tin|seed packet|plants?|field|farm|market|shop|restaurant|recipe card|text|cartoon|clipart|clip art|vector|icon|diagram|chart|cookbook|advert\w*|painting|sketch|opening|spa|festival|recycle|day \d+|'
                 r'pork|bacon|ham|sausages?|prosciutto|pancetta|chorizo|lard|salami|pepperoni|wine|beer|champagne|cocktails?|whisky|whiskey|vodka|rum|sake|alcohol|raw|uncooked|dried beans|seeds?|garden|harvest|hot ?dogs?|baked beans|burgers?|kebab|sushi|paella|porridge|congee|noodle soup|ramen|pho)\b', re.I)
STOP = {'with', 'dish', 'style', 'fresh', 'sauteed', 'roast', 'homemade', 'baked', 'steamed', 'skillet'}
CACHE = os.path.join(DATA, 'photo-cache'); os.makedirs(CACHE, exist_ok=True)

def stem(w):
    return w[:-2] if w.endswith('es') and len(w) > 5 else (w[:-1] if w.endswith('s') else w)

def matches_all(keys, text):
    t = text.lower()
    return all(stem(k) in t for k in keys)

def rank(cands):
    # a short title naming every key word beats a long caption that happens to contain them
    return sorted(cands, key=lambda c: (0 if c['_title_all'] else 1, len(c['title'].split()), -c['_w']))
OK_LIC = re.compile(r'^(cc0|cc by(-sa)?( \d\.\d)?|public domain|pd|pdm)$', re.I)

def get(url, binary=False):
    cf = os.path.join(CACHE, re.sub(r'[^a-z0-9]+', '-', url.lower())[-150:] + '.json')
    if not binary and os.path.exists(cf): return json.load(open(cf))
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        b = r.read()
    if binary: return b
    j = json.loads(b.decode('utf-8')); json.dump(j, open(cf, 'w')); return j

def words(q):
    return [w for w in re.findall(r'[a-z]+', q.lower()) if len(w) > 2 and w not in STOP]

def shape_ok(w, h):
    return w >= 800 and h >= 500 and 1.0 <= w / h <= 2.0

def openverse(q):
    u = 'https://api.openverse.org/v1/images/?' + urllib.parse.urlencode({
        'q': q, 'license': 'cc0,by,by-sa,pdm', 'page_size': 20, 'aspect_ratio': 'wide,square', 'mature': 'false'})
    try:
        j = get(u)
    except Exception as e:
        print('   openverse error', e); return None
    keys = words(q)
    cands = []
    for it in j.get('results', []):
        w, h = int(it.get('width') or 0), int(it.get('height') or 0)
        if not shape_ok(w, h): continue
        title = it.get('title') or ''
        tags = ' '.join(t.get('name', '') for t in it.get('tags') or [])
        if BAD.search(title + ' ' + tags): continue
        if not matches_all(keys, title): continue  # tags are too noisy to trust on their own
        if len(title.split()) > 12: continue
        lic = f"CC {str(it['license']).upper()} {it.get('license_version') or ''}".strip().replace('CC PDM', 'Public domain').replace('CC CC0', 'CC0')
        cands.append({'url': it['url'], 'credit': (it.get('creator') or it.get('source') or 'Openverse')[:120], 'license': lic,
                      'source': it.get('foreign_landing_url') or it['url'], 'title': title, 'via': 'openverse', '_title_all': True, '_w': w})
    return rank(cands)[0] if cands else None

def commons(q):
    u = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({
        'action': 'query', 'format': 'json', 'generator': 'search', 'gsrnamespace': 6, 'gsrlimit': 20,
        'gsrsearch': f'{q} filetype:bitmap -incategory:Paintings', 'prop': 'imageinfo',
        'iiprop': 'url|extmetadata|size|mime', 'iiurlwidth': 1000})
    try:
        j = get(u)
    except Exception as e:
        print('   commons error', e); return None
    keys = words(q)
    cands = []
    for p in j.get('query', {}).get('pages', {}).values():
        ii = (p.get('imageinfo') or [None])[0]
        if not ii or ii.get('mime') not in ('image/jpeg', 'image/png'): continue
        m = ii.get('extmetadata') or {}
        lic = m.get('LicenseShortName', {}).get('value', '')
        w, h = int(ii.get('width') or 0), int(ii.get('height') or 0)
        desc = re.sub(r'<[^>]+>', ' ', m.get('ImageDescription', {}).get('value', ''))
        if not OK_LIC.match(lic) or not shape_ok(w, h) or BAD.search(p['title'] + ' ' + desc): continue
        title = re.sub(r'^File:|\.(jpe?g|png)$', '', p['title'], flags=re.I)
        if not matches_all(keys, title) or len(title.split()) > 12 or not re.search(r'[a-z]{3}', title.lower()): continue
        credit = re.sub(r'<[^>]+>', '', m.get('Artist', {}).get('value', '') or 'Wikimedia Commons').strip()
        cands.append({'url': ii.get('thumburl') or ii['url'], 'credit': credit[:120], 'license': lic,
                      'source': ii.get('descriptionurl') or f"https://commons.wikimedia.org/wiki/{urllib.parse.quote(p['title'])}",
                      'title': title, 'via': 'commons', '_title_all': True, '_w': w})
    return rank(cands)[0] if cands else None

def save(slug, url):
    tmp = os.path.join(ROOT, 'public/dishes', f'{slug}.tmp')
    out = os.path.join(ROOT, 'public/dishes', f'{slug}.jpg')
    try:
        b = get(url, binary=True)
    except Exception as e:
        print('   download error', e); return False
    if len(b) < 20000 or b[:3] not in (b'\xff\xd8\xff', b'\x89PN') and b[:4] != b'RIFF': return False
    open(tmp, 'wb').write(b)
    r = subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '65', '--resampleWidth', '720', tmp, '--out', out],
                       capture_output=True)
    os.remove(tmp)
    return r.returncode == 0 and os.path.exists(out) and os.path.getsize(out) > 10000

photos_file = os.path.join(DATA, 'photos.json')
photos = json.load(open(photos_file))
review_file = os.path.join(DATA, 'photos-free-review.json')
review = json.load(open(review_file)) if os.path.exists(review_file) else {}
slugs = ONLY or json.load(open(os.path.join(DATA, 'no-photo.json')))
found = missing = 0
for slug in slugs:
    if slug in photos and not ONLY: found += 1; continue
    q = QUERIES.get(slug)
    if not q: print('no query for', slug); missing += 1; continue
    hit = openverse(q); time.sleep(3.2)  # Openverse allows 20 a minute without a key
    if not hit: hit = commons(q); time.sleep(1)
    if not hit and QUERIES.get(slug + '#2'): hit = openverse(QUERIES[slug + '#2']) or commons(QUERIES[slug + '#2']); time.sleep(3.2)
    if not hit:
        print(f'none: {slug} ({q})'); missing += 1; continue
    if DRY:
        print(f'{slug}: {hit["via"]} · {hit["title"][:60]} · {hit["license"]} · {hit["source"]}'); continue
    if not save(slug, hit['url']):
        print(f'download failed: {slug}'); missing += 1; continue
    photos[slug] = {'file': f'{slug}.jpg', 'credit': hit['credit'], 'license': hit['license'], 'source': hit['source']}
    review[slug] = {'query': q, 'via': hit['via'], 'title': hit['title'], 'source': hit['source']}
    json.dump(photos, open(photos_file, 'w'), ensure_ascii=False, indent=1)
    json.dump(review, open(review_file, 'w'), ensure_ascii=False, indent=1)
    found += 1
    print(f'ok {found}: {slug} · {hit["via"]} · {hit["license"]} · {hit["title"][:50]}')
print(f'\n{found} with photo, {missing} still without')

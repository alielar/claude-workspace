"""Download the original USDA photo of each recipe from the Internet Archive and resize it for the app.
Writes public/dishes/<slug>.jpg (900 px wide) and data/myplate/photos.json. Run make-thumbs.sh after."""
import json, os, sys, re, time, subprocess, urllib.request, urllib.error, concurrent.futures as cf

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW = json.load(open(os.path.join(ROOT, 'data/myplate/raw.json')))
WORK = sys.argv[1] if len(sys.argv) > 1 else '/tmp/myplate'
TMP = os.path.join(WORK, 'photos-orig'); os.makedirs(TMP, exist_ok=True)
DEST = os.path.join(ROOT, 'public/dishes'); os.makedirs(DEST, exist_ok=True)
OUT = os.path.join(ROOT, 'data/myplate/photos.json')
WORKERS = int(sys.argv[2]) if len(sys.argv) > 2 else 3

def candidates(r):
    """Best archived rendition first: the site's `large` style (800 px), then the 600 px recipe style."""
    urls = []
    for u in (r.get('image_large'), r.get('image')):
        if not u: continue
        if 'im_/' not in u: u = re.sub(r'/web/(\d+)/', r'/web/\1im_/', u)
        urls.append(u)
    return urls

def fetch(r):
    slug = r['slug']
    dest = os.path.join(DEST, f'{slug}.jpg')
    if os.path.exists(dest) and os.path.getsize(dest) > 10000: return slug, 'have'
    for u in candidates(r):
        for attempt in range(4):
            try:
                req = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0 (bsaha recipe import)'})
                with urllib.request.urlopen(req, timeout=90) as resp: data = resp.read()
                if len(data) < 5000 or not data[:3] == b'\xff\xd8\xff': break  # not a JPEG (placeholder page)
                orig = os.path.join(TMP, f'{slug}.jpg'); open(orig, 'wb').write(data)
                subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '--resampleWidth', '900', orig, '--out', dest],
                               check=True, capture_output=True)
                time.sleep(0.4)
                return slug, 'ok'
            except urllib.error.HTTPError as e:
                if e.code == 404: break
                time.sleep(10 * (attempt + 1))
            except Exception:
                time.sleep(15 * (attempt + 1))
    return slug, 'missing'

res = {}
with cf.ThreadPoolExecutor(WORKERS) as ex:
    for i, (slug, st) in enumerate(ex.map(fetch, RAW)):
        res[slug] = st
        if i % 25 == 0 or st == 'missing': print(time.strftime('%H:%M:%S'), i, slug, st, flush=True)
photos = {}
for r in RAW:
    if res.get(r['slug']) in ('ok', 'have'):
        photos[r['slug']] = {'file': f"{r['slug']}.jpg", 'credit': 'USDA MyPlate Kitchen', 'license': 'Public domain', 'source': r['source_url']}
json.dump(photos, open(OUT, 'w'), indent=1)
import collections; print(collections.Counter(res.values()), '->', OUT)

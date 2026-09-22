"""Download the original USDA photo of each recipe from the Internet Archive and resize it for the app.
Writes public/dishes/<slug>.jpg (900 px wide) and data/myplate/photos.json. Run make-thumbs.sh after."""
import json, os, sys, re, time, subprocess, urllib.request, urllib.error, concurrent.futures as cf

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW = json.load(open(os.path.join(ROOT, 'data/myplate/raw.json')))
WORK = sys.argv[1] if len(sys.argv) > 1 else '/tmp/myplate'
TMP = os.path.join(WORK, 'photos-orig'); os.makedirs(TMP, exist_ok=True)
DEST = os.path.join(ROOT, 'public/dishes'); os.makedirs(DEST, exist_ok=True)
OUT = os.path.join(ROOT, 'data/myplate/photos.json')
WORKERS = int(sys.argv[2]) if len(sys.argv) > 2 else 2
PAUSE = float(sys.argv[3]) if len(sys.argv) > 3 else 2.0

def candidates(r):
    """The 600 px recipe-page rendition first (the `large` style is only 527 px wide), then the other."""
    urls = []
    for u in (r.get('image'), r.get('image_large')):
        if not u: continue
        if 'im_/' not in u: u = re.sub(r'/web/(\d+)/', r'/web/\1im_/', u)
        urls.append(u)
    return urls

def width(path):
    out = subprocess.run(['sips', '-g', 'pixelWidth', path], capture_output=True, text=True).stdout
    m = re.search(r'pixelWidth: (\d+)', out)
    return int(m.group(1)) if m else 0

def download(u):
    for attempt in range(4):
        try:
            req = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0 (bsaha recipe import)'})
            with urllib.request.urlopen(req, timeout=90) as resp: data = resp.read()
            time.sleep(PAUSE)  # the archive blocks the IP when downloads come too fast
            return data if len(data) > 5000 and data[:3] == b'\xff\xd8\xff' else None  # a placeholder page is not a JPEG
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            time.sleep(10 * (attempt + 1))
        except Exception:
            time.sleep(15 * (attempt + 1))
    return None

def fetch(r):
    """Try each archived rendition, keep the widest one, resize to at most 900 px wide."""
    slug = r['slug']
    dest = os.path.join(DEST, f'{slug}.jpg')
    if os.path.exists(dest) and os.path.getsize(dest) > 10000: return slug, 'have'
    best, best_w = None, 0
    for k, u in enumerate(candidates(r)):
        data = download(u)
        if not data: continue
        p = os.path.join(TMP, f'{slug}-{k}.jpg'); open(p, 'wb').write(data)
        w = width(p)
        if w > best_w: best, best_w = p, w
        if best_w >= 600: break  # good enough, do not spend a second request
    if not best: return slug, 'missing'
    args = ['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '65'] + (['--resampleWidth', '720'] if best_w > 720 else []) + [best, '--out', dest]
    subprocess.run(args, check=True, capture_output=True)
    return slug, 'ok'

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

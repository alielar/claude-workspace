"""Parse the archived USDA recipe pages in <workdir>/pages/ into data/myplate/raw.json."""
import re, html, json, sys, os, glob

WORK = sys.argv[1] if len(sys.argv) > 1 else '.'
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'data/myplate/raw.json')

def clean(x): return html.unescape(re.sub(r'<[^>]+>', '', x)).replace('\xa0', ' ').strip()
def ws(x): return re.sub(r'\s+', ' ', x).strip()
def num(x):
    m = re.search(r'-?\d+(?:\.\d+)?', x or '')
    return float(m.group(0)) if m else None

NUT_KEYS = {
    'total_calories': 'calories', 'total_fat': 'fat_g', 'saturated_fat': 'saturated_fat_g', 'cholesterol': 'cholesterol_mg',
    'sodium': 'sodium_mg', 'carbohydrates': 'carbs_g', 'dietary_fiber': 'fiber_g', 'total_sugars': 'sugars_g',
    'added_sugars': 'added_sugars_g', 'protein': 'protein_g', 'calcium': 'calcium_mg', 'iron': 'iron_mg',
    'potassium': 'potassium_mg', 'vitamin_d': 'vitamin_d_mcg', 'vitamin_c': 'vitamin_c_mg', 'vitamin_a': 'vitamin_a_mcg',
}
GROUPS = {'Vegetables': 'vegetables', 'Fruits': 'fruits', 'Grains': 'grains', 'Protein Foods': 'protein', 'Dairy': 'dairy'}
SKIP_STEP = re.compile(r'^wash (your )?hands', re.I)

TS = {}
try:
    for o, t, _st in json.load(open(os.path.join(WORK, 'cdx.json')))[1:]:
        m = re.match(r'https?://(www\.)?myplate\.gov/recipes/([a-z0-9-]+)/?$', o)
        if m and (m.group(2) not in TS or t > TS[m.group(2)]): TS[m.group(2)] = t
except Exception:
    pass

def archived(url, slug):
    """An image URL as served by the Internet Archive (raw file, no toolbar)."""
    if not url: return None
    url = html.unescape(url)
    m = re.match(r'https?://web\.archive\.org/web/(\d+)(?:im_|id_)?/(.*)', url)
    if m: return f'https://web.archive.org/web/{m.group(1)}im_/{m.group(2)}'
    if url.startswith('/web/'):
        m = re.match(r'/web/(\d+)(?:im_|id_)?/(.*)', url)
        return f'https://web.archive.org/web/{m.group(1)}im_/{m.group(2)}' if m else None
    return f'https://web.archive.org/web/{TS.get(slug, "2025")}im_/{url}'

def parse(s, slug):
    d = {'slug': slug, 'source_url': f'https://www.myplate.gov/recipes/{slug}'}
    ld = {}
    m = re.search(r'<script type="application/ld\+json">(.*?)</script>', s, re.S)
    if m:
        try:
            g = json.loads(m.group(1))
            ld = next((x for x in g.get('@graph', [g]) if x.get('@type') == 'Recipe'), {})
        except Exception:
            ld = {}
    t = re.search(r'<h1 class="mp-recipe-full__title">(.*?)</h1>', s, re.S)
    d['name'] = clean(t.group(1)) if t else ld.get('name', slug)
    dm = re.search(r'<meta name="description" content="([^"]*)"', s)
    d['description'] = ws(html.unescape(dm.group(1))) if dm else ld.get('description', '')
    det = {}
    for lab, val in re.findall(r'mp-recipe-full__detail--label[^>]*>(.*?)</[^>]+>\s*<[^>]*mp-recipe-full__detail--data[^>]*>(.*?)</', s, re.S):
        det[clean(lab).rstrip(':')] = clean(val)
    d['details'] = det
    d['yield'] = det.get('Makes') or ld.get('recipeYield', '')
    d['prep_time'] = det.get('Prep Time', '')
    d['cook_time'] = det.get('Cook Time') or ld.get('cookTime', '')
    img = re.search(r'mp-recipe-full__image.*?<img[^>]+src="([^"]+)"', s, re.S)
    og = re.search(r'property="og:image" content="([^"]+)"', s)
    d['image'] = archived(img.group(1), slug) if img else None
    d['image_large'] = archived(og.group(1), slug) if og else None
    d['ingredients'] = []
    ing = re.search(r'field--name-field-(?:mp-)?ingredients(.*?)field--name-field-instructions', s, re.S)
    if ing:
        # Some recipes split the list into parts ("For the Vinaigrette:"); the part name goes into the note.
        section = ''
        for kind, body in re.findall(r'<(b|li class="field__item")>(.*?)</(?:b|li)>', ing.group(1), re.S):
            if kind == 'b':
                section = ws(clean(body)).rstrip(':'); continue
            note = re.search(r'<span class="notes">(.*?)</span>', body, re.S)
            main = clean(re.sub(r'<span class="notes">.*?</span>', '', body, flags=re.S))
            n = ws(clean(note.group(1))) if note else ''
            if section: n = f'[{section}] {n}'.strip()
            if ws(main): d['ingredients'].append({'text': ws(main), 'note': n})
    d['directions'] = []; d['directions_extra'] = ''
    ins = re.search(r'field--name-field-instructions.*?<div class="field__item">(.*?)</div>\s*</div>', s, re.S)
    if ins:
        body = ins.group(1)
        ol = re.search(r'<ol>(.*?)</ol>', body, re.S)
        if ol:
            steps = [ws(clean(x)) for x in re.findall(r'<li>(.*?)</li>', ol.group(1), re.S)]
            extra = body.replace(ol.group(0), '')
        else:
            steps = [ws(clean(x)) for x in re.findall(r'<p>(.*?)</p>', body, re.S) if clean(x)]
            extra = ''
        d['directions'] = [x for x in steps if x and not SKIP_STEP.match(x)]
        d['directions_extra'] = ws(clean(re.sub(r'<li>', ' - ', extra)))
    notes = re.search(r'field--name-field-notes.*?<div class="field__item">(.*?)</div>\s*</div>', s, re.S)
    d['notes'] = ws(clean(re.sub(r'<li>', ' - ', notes.group(1)))) if notes else ''
    src = re.search(r'field--name-field-source.*?<span class="field__item">(.*?)</span>\s*</span>', s, re.S)
    d['source'] = ws(clean(src.group(1))) if src else ''
    ss = re.search(r'<strong>Serving Size:</strong>\s*([^<]+)<', s)
    d['serving_size'] = ws(ss.group(1)) if ss else ''
    nut = {}
    exp = re.search(r'<div class="panel panel-expanded">(.*?)</table>', s, re.S)
    tbl = exp.group(1) if exp else s
    for cls, lab, val in re.findall(r'<tr class="np_row ([a-z_0-9 -]+?)(?: odd| even)?">\s*<td>(.*?)</td>\s*<td>(.*?)</td>', tbl, re.S):
        key = [c for c in cls.split() if c not in ('indent-2', 'indent-3', 'bold', 'bold-underline', 'font-xl')][0]
        if key in NUT_KEYS:
            v = num(ws(clean(val)))
            if v is not None: nut[NUT_KEYS[key]] = v
    # the structured data has decimals for the headline values
    ldn = ld.get('nutrition', {}) if isinstance(ld.get('nutrition'), dict) else {}
    for k, key in [('calories', 'calories'), ('proteinContent', 'protein_g'), ('carbohydrateContent', 'carbs_g'),
                   ('fatContent', 'fat_g'), ('fiberContent', 'fiber_g'), ('sodiumContent', 'sodium_mg'), ('sugarContent', 'sugars_g'),
                   ('saturatedFatContent', 'saturated_fat_g'), ('cholesterolContent', 'cholesterol_mg')]:
        v = num(ldn.get(k))
        if v is not None: nut[key] = round(v, 1)
    d['nutrition'] = nut
    fg = []
    for lab, val in re.findall(r'mp-food-group__label">(.*?)</td>\s*<td class="mp-food-group__item">(.*?)</td>', s, re.S):
        g = GROUPS.get(clean(lab))
        if g: fg.append({'group': g, 'amount': ws(clean(val))})
    d['food_groups'] = fg
    ar = ld.get('aggregateRating', {}) or {}
    d['rating'] = round(float(ar['ratingValue']), 2) if ar.get('ratingValue') else None
    d['rating_count'] = int(ar['ratingCount']) if ar.get('ratingCount') else 0
    return d

def main():
    files = sorted(glob.glob(os.path.join(WORK, 'pages', '*.html')))
    out = []
    bad = []
    for f in files:
        slug = os.path.basename(f)[:-5]
        s = open(f, encoding='utf-8', errors='replace').read()
        try:
            d = parse(s, slug)
        except Exception as e:
            bad.append((slug, str(e))); continue
        if not d['ingredients'] or not d['directions'] or not d['nutrition'].get('calories'):
            bad.append((slug, f"ing={len(d['ingredients'])} dir={len(d['directions'])} kcal={d['nutrition'].get('calories')}"))
        out.append(d)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
    print(f'parsed {len(out)} recipes -> {OUT}; incomplete: {len(bad)}')
    for b in bad[:20]: print('  ', b)

if __name__ == '__main__':
    main()

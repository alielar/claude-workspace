"""Combine the deterministic pass (prepared.json), the hand-written dictionaries (ingredient-dict.json,
names.json), the Darija recipes (recipes-ar/<slug>.json), any model translations (translated/<slug>.json,
which win when present), raw nutrition and photos into data/dishes/myplate.json for the seed."""
import json, os, glob, re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
D = os.path.join(ROOT, 'data/myplate')
def load(name, default):
    p = os.path.join(D, name)
    return json.load(open(p)) if os.path.exists(p) else default

raw = {r['slug']: r for r in load('raw.json', [])}
prepared = {p['slug']: p for p in load('prepared.json', [])}
photos = load('photos.json', {})
# never show the site's generic logo as a dish photo, and never reference a file that is not there
for slug in list(photos):
    r = raw.get(slug)
    usda = photos[slug].get('credit') == 'USDA MyPlate Kitchen'
    if not r or (usda and 'default_images' in (r.get('image') or '')) or not os.path.exists(os.path.join(ROOT, 'public/dishes', photos[slug]['file'])):
        del photos[slug]
# photos.json is written when the download ends; until then, a file already in public/dishes counts
for slug, r in raw.items():
    f = os.path.join(ROOT, 'public/dishes', f'{slug}.jpg')
    if slug not in photos and 'default_images' not in (r.get('image') or '') and os.path.exists(f) and os.path.getsize(f) > 10000:
        photos[slug] = {'file': f'{slug}.jpg', 'credit': 'USDA MyPlate Kitchen', 'license': 'Public domain', 'source': r['source_url']}
DICT = {}                                        # key -> {fr, ar}, written in chunks
for f in sorted(glob.glob(os.path.join(D, 'ingredient-dict*.json'))): DICT.update(json.load(open(f)))
NAMES = {}                                       # slug -> {fr, ar, latin, cats?, desc_fr?}, written in chunks
for f in sorted(glob.glob(os.path.join(D, 'names-*.json'))): NAMES.update(json.load(open(f)))
CATS = ['main', 'side', 'salad', 'soup', 'sandwich', 'appetizer', 'sauce', 'dessert', 'breakfast', 'bread', 'snack', 'beverage']
UNITS = {'g', 'ml', 'piece', 'bunch', 'tbsp', 'tsp', 'pinch'}

AR = {}                                          # slug -> {steps, tips}, hand-written in chunks
for f in sorted(glob.glob(os.path.join(D, 'recipes-ar-*.json'))): AR.update(json.load(open(f)))
def recipe_ar(slug):
    p = os.path.join(D, 'recipes-ar', f'{slug}.json')
    r = json.load(open(p)) if os.path.exists(p) else AR.get(slug, {})
    return {'steps': r.get('steps', []), 'tips': r.get('tips', [])}

def model_translation(slug):
    p = os.path.join(D, 'translated', f'{slug}.json')
    return json.load(open(p)) if os.path.exists(p) else None

out, skipped, missing_names, missing_ing = [], [], 0, set()
for slug, r in raw.items():
    n = r['nutrition']
    if not n.get('calories'): skipped.append((slug, 'no nutrition')); continue
    p = prepared.get(slug)
    t = model_translation(slug)
    if not p and not t: skipped.append((slug, 'not prepared')); continue
    nm = NAMES.get(slug, {})
    if t:
        ings = [i for i in t['ingredients'] if i.get('unit') in UNITS and isinstance(i.get('qty'), (int, float))]
        name_en, name_fr, name_ar, name_latin = t['name_en'], t['name_fr'], t['name_ar'], t['name_latin']
        desc_en, desc_fr = t.get('desc_en') or r['description'], t.get('desc_fr', '')
        rec_ar, rec_fr = t['recipe_ar'], t.get('recipe_fr', {'steps': [], 'tips': []})
        tags, cats = t.get('tags', []), [c for c in t.get('categories', []) if c in CATS]
        servings, prep, cook = int(t.get('servings') or 4), int(t.get('prep_min') or 0), int(t.get('cook_min') or 0)
        directions = r['directions']
    else:
        ings = []
        for i in p['ingredients']:
            d = DICT.get(i['key'])
            if not d: missing_ing.add(i['key'])
            ings.append({'en': i['en'], 'fr': (d or {}).get('fr') or i['en'], 'ar': (d or {}).get('ar') or i['en'],
                         'qty': i['qty'], 'unit': i['unit'], 'group': i['group']})
        if not nm: missing_names += 1
        name_en = p['name_en']
        name_fr, name_ar, name_latin = nm.get('fr') or name_en, nm.get('ar') or name_en, nm.get('latin') or ''
        desc_en, desc_fr = p['desc_en'], nm.get('desc_fr', '')
        rec_ar, rec_fr = recipe_ar(slug), {'steps': [], 'tips': []}
        tags = p['tags']; cats = [c for c in (nm.get('cats') or p['categories_guess']) if c in CATS]
        servings, prep, cook = p['servings'], p['prep_min'], p['cook_min']
        directions = p['directions']
    if not ings: skipped.append((slug, 'no ingredients')); continue
    out.append({
        'slug': slug, 'on_menu': False,
        'source_url': r['source_url'], 'source_text': 'USDA MyPlate Kitchen' + (f" ({r['source']})" if r.get('source') else ''),
        'name_en': name_en, 'name_fr': name_fr, 'name_ar': name_ar, 'name_latin': name_latin,
        'desc_en': desc_en, 'desc_fr': desc_fr, 'cuisine': 'International',
        'servings': servings or 4, 'prep_min': prep, 'cook_min': cook,
        'macros': {'kcal': round(n.get('calories', 0)), 'protein_g': round(n.get('protein_g', 0)), 'carbs_g': round(n.get('carbs_g', 0)),
                   'fat_g': round(n.get('fat_g', 0)), 'fiber_g': round(n.get('fiber_g', 0))},
        'nutrition': n, 'ingredients': ings,
        'recipe_en': {'steps': directions, 'tips': [x for x in [r.get('directions_extra', '')] if x]},
        'recipe_fr': rec_fr, 'recipe_ar': rec_ar,
        'tags': tags, 'categories': cats or ['main'], 'food_groups': r.get('food_groups', []),
        'rating': r.get('rating'), 'rating_count': r.get('rating_count', 0),
        'photo': photos.get(slug),
    })
dest = os.path.join(ROOT, 'data/dishes/myplate.json')
json.dump(out, open(dest, 'w'), ensure_ascii=False, indent=1)
with_ar = sum(1 for d in out if d['recipe_ar']['steps'])
print(f'{len(out)} dishes -> {dest}; skipped {len(skipped)}; photos {sum(1 for d in out if d["photo"])}; Darija recipes {with_ar}; '
      f'dishes without names {missing_names}; ingredient keys without translation {len(missing_ing)}')
for s in skipped[:10]: print('  ', s)
if missing_ing: json.dump(sorted(missing_ing), open(os.path.join(D, 'ingredient-missing.json'), 'w'), indent=0)

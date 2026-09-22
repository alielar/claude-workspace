"""Combine raw.json, translated/*.json, photos.json and categories.json into data/dishes/myplate.json for the seed."""
import json, os, glob, re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
D = os.path.join(ROOT, 'data/myplate')
raw = {r['slug']: r for r in json.load(open(os.path.join(D, 'raw.json')))}
photos = json.load(open(os.path.join(D, 'photos.json'))) if os.path.exists(os.path.join(D, 'photos.json')) else {}
cats = json.load(open(os.path.join(D, 'categories.json'))) if os.path.exists(os.path.join(D, 'categories.json')) else {}
CATS = ['main', 'side', 'salad', 'soup', 'sandwich', 'appetizer', 'sauce', 'dessert', 'breakfast', 'bread', 'snack', 'beverage']
UNITS = {'g', 'ml', 'piece', 'bunch', 'tbsp', 'tsp', 'pinch'}

out, skipped = [], []
for f in sorted(glob.glob(os.path.join(D, 'translated', '*.json'))):
    t = json.load(open(f)); slug = t['slug']; r = raw.get(slug)
    if not r: skipped.append((slug, 'no raw')); continue
    n = r['nutrition']
    if not n.get('calories'): skipped.append((slug, 'no nutrition')); continue
    ings = [i for i in t['ingredients'] if i.get('unit') in UNITS and isinstance(i.get('qty'), (int, float))]
    if not ings: skipped.append((slug, 'no ingredients')); continue
    # USDA course tags win over the model's guess; the model fills in when the listing was not archived.
    categories = [c for c in cats.get(slug, []) if c in CATS] or [c for c in t.get('categories', []) if c in CATS] or ['main']
    out.append({
        'slug': slug, 'on_menu': False,
        'source_url': r['source_url'], 'source_text': 'USDA MyPlate Kitchen' + (f" ({r['source']})" if r.get('source') else ''),
        'name_en': t['name_en'], 'name_fr': t['name_fr'], 'name_ar': t['name_ar'], 'name_latin': t['name_latin'],
        'desc_en': t.get('desc_en') or r['description'], 'desc_fr': t.get('desc_fr', ''),
        'cuisine': 'International',
        'servings': int(t.get('servings') or 4), 'prep_min': int(t.get('prep_min') or 0), 'cook_min': int(t.get('cook_min') or 0),
        'macros': {'kcal': round(n.get('calories', 0)), 'protein_g': round(n.get('protein_g', 0)), 'carbs_g': round(n.get('carbs_g', 0)),
                   'fat_g': round(n.get('fat_g', 0)), 'fiber_g': round(n.get('fiber_g', 0))},
        'nutrition': n,
        'ingredients': ings,
        'recipe_en': {'steps': r['directions'], 'tips': [x for x in [r.get('directions_extra', '')] if x]},
        'recipe_fr': t['recipe_fr'], 'recipe_ar': t['recipe_ar'],
        'tags': t.get('tags', []), 'categories': categories, 'food_groups': r.get('food_groups', []),
        'rating': r.get('rating'), 'rating_count': r.get('rating_count', 0),
        'photo': photos.get(slug),
    })
dest = os.path.join(ROOT, 'data/dishes/myplate.json')
json.dump(out, open(dest, 'w'), ensure_ascii=False, indent=1)
print(f'{len(out)} dishes -> {dest}; skipped {len(skipped)}; with photo {sum(1 for d in out if d["photo"])}')
for s in skipped[:15]: print('  ', s)

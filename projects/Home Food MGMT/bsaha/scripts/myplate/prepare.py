"""Deterministic pass over data/myplate/raw.json: quantities to metric, fresh/dry groups, dislike tags,
halal swaps, servings and times, a first guess at categories, plus the two lists that still need a
human or model: unique ingredient names and dish names.
Writes data/myplate/prepared.json, data/myplate/ingredient-names.json, data/myplate/dish-names.json."""
import json, os, re, collections

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
D = os.path.join(ROOT, 'data/myplate')
raw = json.load(open(os.path.join(D, 'raw.json')))

FRAC = {'¼': .25, '½': .5, '¾': .75, '⅓': 1/3, '⅔': 2/3, '⅛': .125, '⅜': .375, '⅝': .625, '⅞': .875}
def number(s):
    s = s.strip()
    if not s: return None
    s = s.replace('-', ' ').replace('to', ' ')
    tot, seen = 0.0, False
    for tok in s.split():
        tok = tok.strip()
        if tok in FRAC: tot += FRAC[tok]; seen = True
        elif re.fullmatch(r'\d+/\d+', tok):
            a, b = tok.split('/'); tot += int(a) / int(b); seen = True
        elif re.fullmatch(r'\d+(\.\d+)?', tok): tot += float(tok); seen = True
        elif seen: break
        else: return None
        if ' to ' in s or '-' in s: break  # a range: keep the first number
    return tot if seen else None

# halal and no alcohol, applied to names, ingredients and directions
SWAPS = [
    (r'\bpork sausage\b', 'beef sausage'), (r'\bturkey bacon\b', 'turkey bacon'), (r'\bbacon\b', 'turkey bacon'),
    (r'\bpork chops?\b', 'beef steaks'), (r'\bpork loin\b', 'beef fillet'), (r'\bpork tenderloin\b', 'beef tenderloin'),
    (r'\bground pork\b', 'ground beef'), (r'\bpork\b', 'beef'), (r'\bham\b', 'turkey ham'), (r'\bprosciutto\b', 'turkey ham'),
    (r'\bpepperoni\b', 'beef pepperoni'), (r'\bsalami\b', 'beef salami'), (r'\bchorizo\b', 'beef merguez'), (r'\bsausages?\b', 'beef sausage'),
    (r'\bhot dogs?\b', 'beef sausage'), (r'\blard\b', 'butter'), (r'\bgelatin\b', 'agar-agar'),
    (r'\b(red |white |rice )?wine vinegar\b', 'vinegar'), (r'\b(dry |red |white )?wine\b', 'stock'), (r'\bbeer\b', 'stock'), (r'\brum\b', 'vanilla extract'), (r'\bbourbon\b', 'apple juice'),
]
def halal(text):
    for pat, rep in SWAPS: text = re.sub(pat, rep, text, flags=re.I)
    return text.replace('beef sausage sausage', 'beef sausage')

LIQUID = re.compile(r'\b(water|milk|broth|stock|juice|oil|vinegar|cream|buttermilk|sauce|salsa|dressing|syrup|honey|vanilla|extract|soda|coffee|tea|wine|lemonade|puree|yogurt|kefir|evaporated|coconut milk|almond milk|soy milk)\b')
DENSITY = [  # grams per US cup
    (r'\b(all-purpose |whole wheat |wheat )?flour\b', 125), (r'\bbrown sugar\b', 220), (r'\bpowdered sugar\b', 120), (r'\bsugar\b', 200),
    (r'\b(uncooked |white |brown |wild )?rice\b', 185), (r'\bquinoa\b', 170), (r'\boats|oatmeal\b', 90), (r'\bcornmeal|polenta\b', 140),
    (r'\bbread ?crumbs?\b', 110), (r'\bpasta|macaroni|noodles|spaghetti|penne|rotini\b', 100), (r'\bcouscous\b', 175), (r'\bbulgur|barley\b', 180),
    (r'\blentils?\b', 200), (r'\b(black |kidney |pinto |white |garbanzo |navy |cannellini )?beans?|chickpeas?\b', 170),
    (r'\bcheese\b', 110), (r'\bcottage cheese|ricotta\b', 225), (r'\bpeanut butter\b', 250), (r'\bhoney|syrup|molasses\b', 340),
    (r'\bnuts?|almonds?|walnuts?|pecans?|peanuts?|cashews?|seeds?\b', 130), (r'\braisins?|dates?|dried\b', 150), (r'\bcoconut\b', 80),
    (r'\bcereal|granola\b', 100), (r'\bmayonnaise|sour cream|yogurt\b', 240), (r'\bketchup|tomato paste|tomato sauce|salsa|applesauce\b', 250),
    (r'\bspinach|lettuce|greens|kale|arugula|cabbage\b', 60), (r'\bberries|strawberr|blueberr|raspberr|grapes|cherries\b', 150),
    (r'\bmeat|chicken|turkey|beef|tuna|salmon|shrimp|fish\b', 140), (r'\bcorn|peas|carrot|onion|celery|pepper|tomato|potato|zucchini|squash|broccoli|cauliflower|mushroom|cucumber|apple|banana|mango|pineapple|melon|peach|pear|fruit|vegetable', 150),
    (r'\bbutter|margarine|shortening\b', 225), (r'\bchocolate chips|cocoa\b', 170), (r'\bcrackers|chips|pretzels|croutons\b', 60),
]
CUP_ML = 240
def cup_to_metric(name):
    for pat, g in DENSITY:
        if re.search(pat, name): return g, 'g'
    if LIQUID.search(name): return CUP_ML, 'ml'
    return 150, 'g'

FRESH = re.compile(r'\b(chicken|turkey|beef|lamb|meat|steak|fish|salmon|tuna|cod|tilapia|shrimp|sardine|egg|milk|yogurt|cheese|butter|cream|bread|tortilla|pita|bun|roll|bagel|lettuce|spinach|kale|cabbage|carrot|onion|garlic|celery|pepper|tomato|potato|zucchini|squash|broccoli|cauliflower|mushroom|cucumber|avocado|apple|banana|mango|pineapple|melon|peach|pear|berr|grape|orange|lemon|lime|cilantro|parsley|basil|mint|dill|ginger|herb|greens|corn on|leek|scallion|green bean|asparagus|eggplant|beet|radish|sweet potato|pumpkin|cherry|plum|kiwi|strawberr|fruit|vegetable|tofu|hummus|salsa|jben)\b', re.I)
DRY_OVERRIDE = re.compile(r'\b(canned|can |frozen|dried|powder|cayenne|paprika|cumin|turmeric|curry|chili powder|black pepper|white pepper|red pepper flakes|pepper flakes|nutmeg|cloves? ground|allspice|coriander seed|flakes|ground (cumin|cinnamon|ginger|pepper|turmeric)|garlic powder|onion powder|tomato paste|tomato sauce|broth|stock|oil|vinegar|rice|pasta|flour|sugar|honey|salt|spice|seasoning|extract|baking|oats|cereal|beans?|lentil|chickpea|peanut butter|jam|jelly|raisin|nuts?|almond|walnut|seed|crackers|chips|juice|soda)\b', re.I)
def group_of(name):
    if DRY_OVERRIDE.search(name) and not re.search(r'\bfresh\b', name, re.I): return 'dry'
    return 'fresh' if FRESH.search(name) else 'dry'

SIZE = r'(?:large|medium|small|extra[- ]large|jumbo|mini|ripe|whole|fresh|frozen|boneless|skinless|lean|cooked|raw|thin|thick|baby|big|little|firm)'
UNIT_RE = re.compile(r'^(?P<qty>[\d\s/.¼½¾⅓⅔⅛⅜⅝⅞-]*(?:\s*(?:to|-)\s*[\d/.¼½¾⅓⅔⅛]+)?)\s*'
                     r'(?P<unit>cups?|c\.|teaspoons?|tsps?\.?|tablespoons?|tbsps?\.?|tbs\.?|pounds?|lbs?\.?|ounces?|oz\.?|fl\.? ?oz\.?|fluid ounces?|cans?|packages?|pkgs?\.?|containers?|jars?|bottles?|boxes?|bags?|slices?|cloves?|heads?|sprays?|dash(?:es)?|pinch(?:es)?|quarts?|pints?|gallons?|sticks?|bunch(?:es)?|stalks?|ribs?|pieces?|sprigs?|leaves|leaf|ears?|links?|fillets?|scoops?|drops?|handfuls?|envelopes?|squares?|wedges?|halves|strips?|cubes?|loa(?:f|ves)|sheets?|packets?|sachets?)?\.?\s*'
                     r'(?P<paren>\([^)]*\))?\s*(?P<rest>.*)$', re.I)

def parse_line(text, note):
    t = halal(text.strip())
    m = UNIT_RE.match(t)
    qty = number(m.group('qty') or '') if m else None
    unit = (m.group('unit') or '').lower().rstrip('.') if m else ''
    paren = (m.group('paren') or '') if m else ''
    rest = (m.group('rest') or t) if m else t
    name = re.sub(r'\s+', ' ', re.sub(r'\([^)]*\)', '', rest)).strip(' ,.;')
    # "(14.5 ounces)" inside a can/package line
    size = None
    pm = re.search(r'([\d.]+)\s*(?:-\s*)?(oz|ounces?|fl\.? ?oz|pounds?|lbs?|g|ml)', paren + ' ' + note, re.I)
    if pm: size = (float(pm.group(1)), pm.group(2).lower())
    liquid = bool(LIQUID.search(name.lower()))
    q = qty if qty is not None else 1
    u, out_q = 'piece', q
    if unit in ('cup', 'cups', 'c'):
        per, u = cup_to_metric(name.lower()); out_q = q * per
    elif unit.startswith('teaspoon') or unit.startswith('tsp'): u, out_q = 'tsp', q
    elif unit.startswith('tablespoon') or unit.startswith('tbs'): u, out_q = 'tbsp', q
    elif unit.startswith('pound') or unit.startswith('lb'): u, out_q = 'g', q * 454
    elif unit.startswith('fl') or unit.startswith('fluid'): u, out_q = 'ml', q * 30
    elif unit.startswith('ounce') or unit == 'oz': u, out_q = ('ml' if liquid else 'g'), q * 28
    elif unit in ('can', 'cans', 'package', 'packages', 'pkg', 'pkgs', 'container', 'containers', 'jar', 'jars', 'bottle', 'bottles', 'box', 'boxes', 'bag', 'bags', 'packet', 'packets', 'envelope', 'envelopes'):
        if size:
            n, su = size
            grams = n * 454 if su.startswith('lb') or su.startswith('pound') else n if su in ('g', 'ml') else n * 28
            u = 'ml' if (liquid or su.startswith('fl')) else 'g'; out_q = q * grams
        else:
            u, out_q = ('ml' if liquid else 'g'), q * 400
    elif unit.startswith('quart'): u, out_q = 'ml', q * 950
    elif unit.startswith('pint'): u, out_q = 'ml', q * 475
    elif unit.startswith('gallon'): u, out_q = 'ml', q * 3800
    elif unit.startswith('stick'): u, out_q = 'g', q * 115
    elif unit.startswith('dash') or unit.startswith('pinch') or unit.startswith('drop'): u, out_q = 'pinch', max(1, q)
    elif unit.startswith('spray'): u, out_q, name = 'tsp', 1, 'oil (cooking spray)'
    elif unit.startswith('bunch'): u, out_q = 'bunch', q
    elif unit.startswith('handful'): u, out_q = 'g', q * 30
    elif unit.startswith('scoop'): u, out_q = 'tbsp', q * 2
    elif unit.startswith('sprig'): u, out_q = 'piece', q
    elif unit:  # slices, cloves, heads, stalks, pieces, ears, fillets...
        u, out_q = 'piece', q
        name = f"{name} ({unit})" if unit not in ('piece', 'pieces') and not re.search(r'\b' + re.escape(unit.rstrip('s')), name, re.I) else name
    else:
        if qty is None:
            # "salt", "pepper to taste", "cooking spray"
            if re.search(r'\bsalt|pepper|spray|seasoning|cinnamon|nutmeg\b', name, re.I): u, out_q = 'pinch', 1
            else: u, out_q = 'piece', 1
        else:
            u, out_q = 'piece', q
    name = re.sub(r'^(?:' + SIZE + r'\s+)+', '', name, flags=re.I).strip() or name
    name = re.sub(r'\bto taste\b|\bas needed\b|\boptional\b|\bdivided\b', '', name, flags=re.I).strip(' ,')
    if not name: name = text
    # round to something a cook can measure
    if u in ('g', 'ml'): out_q = round(out_q / 5) * 5 if out_q < 100 else round(out_q / 10) * 10
    elif u in ('tsp', 'tbsp'): out_q = round(out_q * 4) / 4
    else: out_q = round(out_q * 2) / 2
    out_q = max(out_q, 0.25 if u in ('tsp', 'tbsp') else 1 if u in ('g', 'ml', 'pinch') else 0.5)
    return {'en_raw': text, 'en': name[0].upper() + name[1:], 'key': key_of(name), 'qty': out_q, 'unit': u, 'group': group_of(name), 'note': note}

def singular(w):
    if w.endswith('ies') and len(w) > 4: return w[:-3] + 'y'
    if w.endswith('oes') and len(w) > 4: return w[:-2]
    if w.endswith(('ss', 'us', 'is')) or len(w) < 4: return w
    return w[:-1] if w.endswith('s') else w

def key_of(name):
    k = _key(name.lower().split(',')[0])
    if not k: k = _key(name.lower().replace(',', ' '))
    return ' '.join(singular(w) for w in k.split())

def _key(k):
    k = re.sub(r'\([^)]*\)', '', k)
    k = re.sub(r'\b(fresh|frozen|canned|chopped|diced|sliced|minced|grated|shredded|crushed|large|small|medium|ripe|boneless|skinless|lean|low[- ]fat|non[- ]fat|reduced[- ]fat|fat[- ]free|reduced[- ]sodium|low[- ]sodium|no[- ]salt[- ]added|unsalted|salted|whole|cooked|raw|plain|light|peeled|cubed|thinly|finely|coarsely|cut|into|pieces|about|inch|or|and|of|the|a|with|without|drained|rinsed|undrained|in juice|in water|packed|uncooked|dry|prepared)\b', ' ', k)
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z ]', ' ', k)).strip()

TAG_RULES = [
    ('peppers', r'\b(bell peppers?|green peppers?|red peppers?|yellow peppers?|orange peppers?|sweet peppers?|jalape\w*|chil[ei]e?s?(?! powder| sauce| flakes| paste)|poblano|serrano|habanero|anaheim|banana peppers?|peppers?, (?:chopped|diced|sliced)|mini peppers?)\b'),
    ('spicy', r'\b(jalape|chil[ei] powder|chil[ei]es?|cayenne|hot sauce|red pepper flakes|sriracha|harissa|tabasco|curry paste)\b'),
    ('fish', r'\b(fish|salmon|tuna|cod|tilapia|shrimp|sardine|anchov|trout|haddock|pollock|crab|clam|seafood|mackerel|halibut)\b'),
    ('chicken', r'\b(chicken|turkey|poultry)\b'),
    ('red_meat', r'\b(beef|lamb|steak|ground meat|veal|goat|merguez|pepperoni|salami)\b'),
    ('eggs', r'\b(eggs?|egg whites?)\b'),
    ('dairy', r'\b(milk|cheese|yogurt|butter|cream|jben|ricotta|mozzarella|cheddar|parmesan|feta|kefir)\b(?!.*(almond|soy|coconut|oat) milk)'),
    ('nuts', r'\b(almond|peanut|walnut|pecan|cashew|pistachio|hazelnut|nuts?)\b'),
    ('gluten', r'\b(flour|bread|pasta|tortilla|pita|noodle|spaghetti|macaroni|couscous|bulgur|barley|crackers|croutons|bun|roll|bagel|wheat|cracker|oats)\b'),
    ('legumes', r'\b(beans?|lentils?|chickpeas?|garbanzo|peas|hummus|edamame|tofu)\b'),
]
COOK_VERBS = re.compile(r'\b(saut|cook|bake|simmer|heat|fry|roast|boil|grill|brown|stir[- ]fry|broil|microwave|steam)', re.I)

def tags_of(ings, directions):
    text = ' '.join(i['en'] for i in ings).lower()
    tags = [t for t, pat in TAG_RULES if re.search(pat, text)]
    if re.search(r'\b(onion|onions|scallion|shallot)\b', text) and 'green onion' not in text:
        tags.append('cooked_onion' if COOK_VERBS.search(' '.join(directions)) else 'raw_onion')
    elif re.search(r'\b(green onion|scallion)\b', text):
        tags.append('raw_onion')
    if not any(t in tags for t in ('fish', 'chicken', 'red_meat')): tags.append('vegetarian')
    return tags

CAT_RULES = [
    ('breakfast', r'\b(breakfast|pancake|waffle|oatmeal|granola|omelet|frittata|french toast|muffin|smoothie|scrambled)\b'),
    ('beverage', r'\b(smoothie|drink|beverage|lemonade|tea|punch|shake|lassi|juice|cocoa|latte|agua fresca)\b'),
    ('soup', r'\b(soup|stew|chili|chowder|gumbo|bisque|gazpacho|broth|minestrone|posole|ramen)\b'),
    ('salad', r'\b(salad|slaw|coleslaw)\b'),
    ('sandwich', r'\b(sandwich|wrap|burger|taco|quesadilla|burrito|pita pocket|sub|panini|sloppy joe|hot dog|roll-up|rollup|pizza)\b'),
    ('sauce', r'\b(sauce|dressing|salsa|dip|hummus|spread|relish|vinaigrette|gravy|pesto|guacamole|marinade|chutney|jam|glaze|topping)\b'),
    ('dessert', r'\b(cake|cookie|pie|crisp|cobbler|pudding|brownie|dessert|parfait|sorbet|ice cream|fudge|tart|sweet|mousse|bars?|crumble|compote|frozen pops?|popsicle|treat)\b'),
    ('bread', r'\b(bread|biscuit|muffin|cornbread|tortilla|roll|scone|flatbread|bagel|pita|dough|crust)\b'),
    ('snack', r'\b(snack|trail mix|popcorn|chips|bites|bars?|crackers|nachos|energy balls|kabob|skewer|frozen pops?|roll-ups)\b'),
    ('appetizer', r'\b(appetizer|dip|bites|skewer|kabob|stuffed|deviled|bruschetta|nachos|spring roll|lettuce cup|wonton)\b'),
    ('side', r'\b(side|roasted vegetables|mashed|glazed carrots|green beans|coleslaw|rice pilaf|potatoes|succotash|greens|sauteed|steamed|fries|grits|stuffing|baked beans|corn on the cob)\b'),
    ('main', r'\b(main dish|main course|casserole|stir[- ]fry|skillet|bake|chicken|beef|fish|salmon|tuna|shrimp|turkey|pasta|lasagna|meatloaf|meatballs|curry|enchilada|fajita|stuffed peppers|pot pie|chili|stew|risotto|paella|jambalaya|kebab|tofu|lentils|beans and rice|rice bowl|bowl|quiche|frittata|dinner|entree)\b'),
]
def categories_of(name, desc):
    text = f'{name} {desc}'.lower()
    cats = [c for c, pat in CAT_RULES if re.search(pat, text)]
    if re.search(r'\bmain dish|main course|entree|dinner\b', text) and 'main' in cats: cats = ['main'] + [c for c in cats if c != 'main']
    if re.search(r'\bside dish\b', text): cats = ['side'] + [c for c in cats if c != 'side']
    if re.search(r'\bbreakfast\b', text): cats = ['breakfast'] + [c for c in cats if c != 'breakfast']
    if re.search(r'\bdessert\b', text): cats = ['dessert'] + [c for c in cats if c != 'dessert']
    if re.search(r'\bsnack\b', text): cats = ['snack'] + [c for c in cats if c != 'snack']
    return cats[:3] or ['main']

def minutes(s):
    if not s: return 0
    h = re.search(r'(\d+)\s*(?:hour|hr)', s, re.I); m = re.search(r'(\d+)\s*min', s, re.I)
    return (int(h.group(1)) * 60 if h else 0) + (int(m.group(1)) if m else 0)

def servings_of(y):
    m = re.search(r'(\d+)', y or '')
    return int(m.group(1)) if m else 4

out, names, dishes = [], collections.Counter(), []
for r in raw:
    ings = [parse_line(i['text'], i['note']) for i in r['ingredients'] if i['text'].strip()]
    directions = [halal(s) for s in r['directions']]
    name_en = halal(r['name']); desc_en = halal(r['description'])
    for i in ings: names[i['key']] += 1
    out.append({
        'slug': r['slug'], 'name_en': name_en, 'desc_en': desc_en, 'servings': servings_of(r['yield']),
        'prep_min': minutes(r['prep_time']), 'cook_min': minutes(r['cook_time']),
        'ingredients': ings, 'directions': directions, 'directions_extra': halal(r.get('directions_extra', '')),
        'tags': tags_of(ings, directions), 'categories_guess': categories_of(name_en, desc_en),
        'swapped': halal(r['name'] + ' ' + ' '.join(i['text'] for i in r['ingredients'])) != r['name'] + ' ' + ' '.join(i['text'] for i in r['ingredients']),
    })
    dishes.append({'slug': r['slug'], 'name': name_en, 'cats': categories_of(name_en, desc_en), 'desc': desc_en[:90]})
json.dump(out, open(os.path.join(D, 'prepared.json'), 'w'), ensure_ascii=False, indent=1)
json.dump([{'key': k, 'n': n} for k, n in names.most_common()], open(os.path.join(D, 'ingredient-names.json'), 'w'), ensure_ascii=False, indent=0)
json.dump(dishes, open(os.path.join(D, 'dish-names.json'), 'w'), ensure_ascii=False, indent=0)
print(f'{len(out)} recipes, {len(names)} unique ingredient keys, {sum(1 for d in out if d["swapped"])} with halal swaps')
print('units:', collections.Counter(i['unit'] for d in out for i in d['ingredients']))
print('categories:', collections.Counter(c for d in dishes for c in d['cats'][:1]))

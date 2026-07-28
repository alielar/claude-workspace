import glob
import json
from collections import defaultdict

corr = json.load(open('vocabulary_corrected.json'))
by_id = {e['id']: e for e in corr}

patches = []
for fn in sorted(glob.glob('patch_*.json')):
    patches.extend(json.load(open(fn)))

# sanity: no duplicate ids across patch files
seen = set()
for p in patches:
    if p['id'] in seen:
        raise SystemExit('duplicate patch id: %s' % p['id'])
    seen.add(p['id'])
    if p['id'] not in by_id:
        raise SystemExit('unknown id: %s' % p['id'])

# group corrected entries by headword to find duplicates
by_word = defaultdict(list)
for e in corr:
    by_word[e['word'].lower()].append(e)


def state(e):
    return (e['definition'].strip(), tuple(sorted(e['translations'].items())))


final = []
propagated = 0

for p in patches:
    base = by_id[p['id']]
    targets = [base]
    # propagate to identical twins of the same headword
    for other in by_word[base['word'].lower()]:
        if other['id'] == base['id'] or other['id'] in seen:
            continue
        if state(other) == state(base):
            targets.append(other)
            propagated += 1
    for t in targets:
        final.append({
            'id': t['id'],
            'word': t['word'],
            'definition': p['definition'],
            'example': p['example'],
            'level': t.get('level', ''),
            'translations': dict(p['translations']),
            '_before': {
                'definition': t['definition'],
                'example': t['example'],
                'translations': dict(t['translations']),
            },
            '_note': p['note'],
        })

final.sort(key=lambda e: int(e['id']))

out = [{k: v for k, v in e.items() if not k.startswith('_')} for e in final]
json.dump(out, open('vocabulary_adjusted.json', 'w'), ensure_ascii=False, indent=2)
json.dump(final, open('vocabulary_adjusted_with_notes.json', 'w'),
          ensure_ascii=False, indent=2)

print('patch entries: %d' % len(patches))
print('propagated to duplicates: %d' % propagated)
print('total adjusted entries: %d' % len(final))

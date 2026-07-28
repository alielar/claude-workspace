import glob
import json
from collections import defaultdict

corr = json.load(open('vocabulary_corrected.json'))
by_id = {e['id']: e for e in corr}
by_word = defaultdict(list)
for e in corr:
    by_word[e['word'].lower()].append(e)

patched = set()
for fn in sorted(glob.glob('patch_*.json')):
    for p in json.load(open(fn)):
        patched.add(p['id'])

for pid in sorted(patched, key=int):
    base = by_id[pid]
    twins = [o for o in by_word[base['word'].lower()]
             if o['id'] != pid and o['id'] not in patched]
    for t in twins:
        print('%-16s patched=%-6s twin=%-6s' % (base['word'], pid, t['id']))
        print('   base def: %s' % base['definition'])
        print('   twin def: %s' % t['definition'])
        print('   twin ex : %s' % t['example'])
        print('   twin tr : %s' % t['translations'])
        print()

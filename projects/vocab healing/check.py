import json
from collections import Counter
corr = json.load(open('vocabulary_corrected.json'))
for w in ['left', 'right', 'flat', 'second', 'text', 'way', 'bar', 'bear', 'post', 'light']:
    hits = [e for e in corr if e['word'].lower() == w]
    for h in hits:
        print('%-8s id=%-6s %s | %s' % (h['word'], h['id'], h['definition'][:60], h['translations']))
    print('---')
dups = [w for w, n in Counter(e['word'].lower() for e in corr).items() if n > 1]
print('duplicate headwords:', len(dups))

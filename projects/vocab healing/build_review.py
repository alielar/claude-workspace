import json
from collections import defaultdict

orig = json.load(open('/Users/alielaraki/Downloads/Word Bank 3000.json'))
corr = json.load(open('vocabulary_corrected.json'))
log = json.load(open('vocabulary_changes_log.json'))

o = {e['id']: e for e in orig}
c = {e['id']: e for e in corr}

tr = [x for x in log if x['field'] != 'definition']
by_word = defaultdict(list)
for x in tr:
    by_word[x['word_id']].append(x)

ids = sorted(by_word, key=lambda k: int(k))
print('distinct changed words:', len(ids))

conf_rank = {'low': 0, 'medium': 1, 'high': 2}
with open('review_all.txt', 'w') as f:
    for i, wid in enumerate(ids, 1):
        e_o, e_c = o[wid], c[wid]
        worst = min(conf_rank[ch['confidence']] for ch in by_word[wid])
        tag = ['LOW', 'MED', 'HIGH'][worst]
        f.write('%d) [%s] %s  <%s>\n' % (i, wid, e_o['word'], tag))
        f.write('   EX : %s\n' % e_o['example'])
        f.write('   DEF: %s\n' % e_c['definition'])
        t = e_c['translations']
        f.write('   ES %s | DE %s | FR %s | IT %s\n' % (
            t.get('es', ''), t.get('de', ''), t.get('fr', ''), t.get('it', '')))
        for ch in by_word[wid]:
            f.write('   ~%s %s: %s -> %s\n' % (
                ch['confidence'][0].upper(), ch['language_code'],
                ch['old_value'], ch['new_value']))
        f.write('\n')
print('written review_all.txt')

import json
from collections import Counter

ORIG = '/Users/alielaraki/Downloads/Word Bank 3000.json'
orig = json.load(open(ORIG))
defs = json.load(open('acc_definitions.json'))
corr = json.load(open('acc_corrections.json'))

# index corrections by word_id -> list
corr_by_id = {}
for c in corr:
    corr_by_id.setdefault(str(c['word_id']), []).append(c)

log = []
missing_defs = []
applied_tr = 0
skipped_tr = []

out = []
for e in orig:
    wid = str(e['id'])
    # deep-ish copy preserving key order
    ne = {
        'id': e['id'],
        'word': e['word'],
        'definition': e.get('definition', ''),
        'example': e['example'],
        'level': e['level'],
        'translations': dict(e['translations']),
    }
    # definition
    if wid in defs:
        old_def = ne['definition']
        ne['definition'] = defs[wid]
        log.append({
            'word_id': wid, 'language_code': None, 'word': e['word'],
            'field': 'definition', 'old_value': old_def,
            'new_value': defs[wid],
            'issue': 'definition field was empty and has been filled',
            'confidence': 'high',
        })
    else:
        missing_defs.append(wid)
    # translation corrections
    for c in corr_by_id.get(wid, []):
        lang = c['language_code']
        if lang in ne['translations']:
            ne['translations'][lang] = c['new_value']
            applied_tr += 1
            log.append(c)
        else:
            skipped_tr.append((wid, lang))
    out.append(ne)

# structural checks
assert len(out) == len(orig), 'count mismatch'
for a, b in zip(out, orig):
    assert a['id'] == b['id'], 'order mismatch at %s' % b['id']
    assert set(a['translations'].keys()) == set(b['translations'].keys()), 'lang keys changed at %s' % b['id']
    assert list(a.keys()) == list(b.keys()) or list(a.keys()) == ['id','word','definition','example','level','translations']

json.dump(out, open('vocabulary_corrected.json', 'w'), ensure_ascii=False, indent=1)
json.dump(log, open('vocabulary_changes_log.json', 'w'), ensure_ascii=False, indent=1)

# stats
tr_entries = [c for c in log if c['field'] != 'definition']
def_entries = [c for c in log if c['field'] == 'definition']
by_lang = Counter(c['language_code'] for c in tr_entries)
by_conf_tr = Counter(c['confidence'] for c in tr_entries)
empty_defs_remaining = sum(1 for e in out if e['definition'] == '')

print('=== FINAL ASSEMBLY ===')
print('total entries:', len(out))
print('definitions filled:', len(def_entries))
print('empty definitions remaining:', empty_defs_remaining)
print('translation corrections:', len(tr_entries))
print('total log entries:', len(log))
print('missing defs (ids):', len(missing_defs), missing_defs[:10])
print('skipped translation corrections:', len(skipped_tr), skipped_tr[:10])
print('--- translation corrections by language ---')
for k in ['es','de','fr','it']:
    print(' ', k, by_lang.get(k,0))
print('--- translation corrections by confidence ---')
for k in ['high','medium','low']:
    print(' ', k, by_conf_tr.get(k,0))
print('confidence values seen:', sorted(set(c['confidence'] for c in log)))

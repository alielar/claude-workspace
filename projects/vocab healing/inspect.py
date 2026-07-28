import json
from collections import Counter

log = json.load(open('vocabulary_changes_log.json'))
tr = [c for c in log if c['field'] != 'definition']
print('translation changes', len(tr))
print(Counter(c['confidence'] for c in tr))
print(Counter(c['field'] for c in log))
lowmed = [c for c in tr if c['confidence'] in ('low', 'medium')]
print('lowmed', len(lowmed))
print('distinct words in lowmed', len(set(c['word_id'] for c in lowmed)))
for c in lowmed[:20]:
    print(c['word'], '|', c['language_code'], '|', c['old_value'], '->', c['new_value'], '|', c['confidence'], '|', c['issue'][:90])

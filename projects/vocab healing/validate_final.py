import json

adj = json.load(open('vocabulary_adjusted.json'))
orig = {e['id']: e for e in json.load(open('/Users/alielaraki/Downloads/Word Bank 3000.json'))}

problems = []
ids = set()
for e in adj:
    if e['id'] in ids:
        problems.append('duplicate id %s' % e['id'])
    ids.add(e['id'])
    if set(e) != {'id', 'word', 'definition', 'example', 'level', 'translations'}:
        problems.append('key mismatch %s: %s' % (e['id'], sorted(e)))
    if e['id'] not in orig:
        problems.append('id not in original: %s' % e['id'])
    elif orig[e['id']]['word'] != e['word']:
        problems.append('headword changed %s' % e['id'])
    for f in ('definition', 'example'):
        v = e[f]
        if not v or not v.strip():
            problems.append('empty %s on %s' % (f, e['id']))
        elif not v.strip().endswith(('.', '?', '!')):
            problems.append('no end punctuation in %s on %s: %r' % (f, e['id'], v))
    if sorted(e['translations']) != ['de', 'es', 'fr', 'it']:
        problems.append('translation langs %s' % e['id'])
    for lg, v in e['translations'].items():
        if not v or not v.strip():
            problems.append('empty %s translation on %s' % (lg, e['id']))
        if '/' in v:
            problems.append('slash in %s %s: %r' % (lg, e['id'], v))
    if e['word'].lower() not in e['example'].lower() and not e['word'][0].isupper():
        problems.append('headword missing from example %s (%s): %r'
                        % (e['id'], e['word'], e['example']))

print('entries: %d' % len(adj))
if problems:
    print('PROBLEMS (%d):' % len(problems))
    for p in problems:
        print(' -', p)
else:
    print('all checks passed')

"""Download every archived USDA MyPlate recipe page from the Internet Archive into <workdir>/pages/."""
import json,os,sys,time,urllib.request,urllib.error,concurrent.futures as cf,re,collections
WORK=sys.argv[1] if len(sys.argv)>1 else '.'
WORKERS=int(sys.argv[2]) if len(sys.argv)>2 else 3
os.chdir(WORK)
if not os.path.exists('cdx.json'):
    urllib.request.urlretrieve('http://web.archive.org/cdx/search/cdx?url=myplate.gov/recipes/*&output=json&fl=original,timestamp,statuscode&filter=statuscode:200&collapse=urlkey&from=2023','cdx.json')
rows=json.load(open('cdx.json'))[1:]
ts={}
for o,t,st in rows:
    m=re.match(r'https?://(www\.)?myplate\.gov/recipes/([a-z0-9-]+)/?$',o)
    if m and (m.group(2) not in ts or t>ts[m.group(2)]): ts[m.group(2)]=t
slugs=sorted(ts)
os.makedirs('pages',exist_ok=True)
def fetch(slug):
    out=f'pages/{slug}.html'
    if os.path.exists(out) and os.path.getsize(out)>20000: return slug,'have'
    url=f'https://web.archive.org/web/{ts[slug]}id_/https://www.myplate.gov/recipes/{slug}'
    for attempt in range(6):
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (bsaha recipe import; contact ali)'})
            with urllib.request.urlopen(req,timeout=90) as r: data=r.read()
            if b'mp-recipe-full' not in data: return slug,'norecipe'
            open(out,'wb').write(data); time.sleep(0.5); return slug,'ok'
        except urllib.error.HTTPError as e:
            if e.code==404: return slug,'404'
            time.sleep(10*(attempt+1))
        except Exception as e:
            time.sleep(15*(attempt+1))
    return slug,'fail'
res={}
with cf.ThreadPoolExecutor(WORKERS) as ex:
    for i,(slug,st) in enumerate(ex.map(fetch,slugs)):
        res[slug]=st
        if i%25==0 or st not in ('ok','have'): print(time.strftime('%H:%M:%S'),i,slug,st,flush=True)
json.dump(res,open('crawl-status.json','w'),indent=1)
print(collections.Counter(res.values()))

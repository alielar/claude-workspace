"""Merge data/videos/{breakfast,lunch,dinner,...}.json into data/videos/all.json keyed by name_en, keeping only YouTube watch links."""
import json, glob, re
out = {}
for f in sorted(glob.glob("data/videos/*.json")):
    if f.endswith("all.json"): continue
    for name, v in json.load(open(f)).items():
        url = (v or {}).get("url", "")
        if re.match(r"^https?://(www\.|m\.)?(youtube\.com/watch\?v=|youtu\.be/)", url) and "shorts" not in url:
            out[name] = {"url": url, "title": v.get("title", ""), "lang": v.get("lang", "")}
json.dump(out, open("data/videos/all.json", "w"), indent=1, ensure_ascii=False)
print("videos merged:", len(out))

"""Rewrite name_latin chat digits (3=ع, 7=ح, 9=ق, 8=غ, 5=خ) into plain letters. Idempotent."""
import json, re, glob
def fix(s):
    s = re.sub(r"\b3", "a", s)          # 3sel -> asel, 3la -> ala
    s = re.sub(r"l3", "la", s)           # l3oud -> laoud
    s = s.replace("3", "a")              # za3tar -> zaatar, m3a -> maa
    s = s.replace("7", "h").replace("9", "q").replace("8", "gh").replace("5", "kh")
    s = re.sub(r"\baa", "a", s)
    return s
for f in glob.glob("data/dishes/*.json"):
    d = json.load(open(f)); n = 0
    for x in d:
        y = fix(x["name_latin"])
        if y != x["name_latin"]: x["name_latin"] = y; n += 1
    json.dump(d, open(f, "w"), ensure_ascii=False, indent=2)
    print(f, "fixed", n)
    print("  ", [x["name_latin"] for x in d][:8])

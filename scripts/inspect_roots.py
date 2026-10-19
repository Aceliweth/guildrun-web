import json

d = json.load(open("re_data/balancing_data.json", encoding="utf-8"))

def count_desc(n):
    return 1 + sum(count_desc(c) for c in n.get("children", []))

for s in d["scenes"]:
    if s["levelFile"] in ("level2", "level3", "level4"):
        print("==============================", s["levelFile"], s["scenePath"])
        for r in s["rootNodes"]:
            tot = count_desc(r)
            if tot > 1:
                print(f"  ROOT: {r['name']} (direct={len(r.get('children',[]))}, total={tot})")
                for c in r.get("children", []):
                    ctot = count_desc(c)
                    if ctot > 1:
                        print(f"    - {c['name']} (direct={len(c.get('children',[]))}, total={ctot})")
                        for gc in c.get("children", [])[:15]:
                            print(f"        * {gc['name']} (direct={len(gc.get('children',[]))}, total={count_desc(gc)})")

import json

d = json.load(open("re_data/balancing_data.json", encoding="utf-8"))
for s in d["scenes"]:
    if s["levelFile"] in ("level2", "level3", "level4", "level5"):
        print("===", s["levelFile"], s["scenePath"], "GOs:", s["gameObjectCount"])
        for r in s["rootNodes"]:
            if r.get("scripts") or r.get("children"):
                print(f"  Root '{r['name']}' active={r.get('active')} children={len(r.get('children',[]))} scripts={r.get('scripts',[])}")

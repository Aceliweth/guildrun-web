import json

d = json.load(open("re_data/balancing_data.json", encoding="utf-8"))

def dump_tree(nodes, depth=0, max_depth=3):
    for n in nodes:
        ch = n.get("children", [])
        comps = n.get("components", [])
        print("  " * depth + f"{n['name']} (children={len(ch)}) {comps if comps else ''}")
        if depth < max_depth and ch:
            dump_tree(ch[:35], depth + 1, max_depth)

for s in d["scenes"]:
    if s["levelFile"] in ("level2", "level3", "level4"):
        print("==============================", s["levelFile"], s["scenePath"])
        dump_tree(s["rootNodes"], 0, 3)

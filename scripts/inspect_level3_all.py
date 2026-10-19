import json

d = json.load(open("re_data/balancing_data.json", encoding="utf-8"))

def dump_node(n, depth=0, max_depth=4):
    print("  " * depth + f"- {n['name']} ({len(n.get('children',[]))})")
    if depth < max_depth:
        for c in n.get("children", [])[:40]:
            dump_node(c, depth + 1, max_depth)

for s in d["scenes"]:
    if s["levelFile"] == "level3":
        for r in s["rootNodes"]:
            if r["name"] in ("Canvas", "EndScreenController"):
                dump_node(r, 0, 5)

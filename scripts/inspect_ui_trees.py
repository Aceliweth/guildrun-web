import json

d = json.load(open("re_data/balancing_data.json", encoding="utf-8"))

def dump_tree(nodes, depth=0, max_depth=5):
    for n in nodes:
        ch = n.get("children", [])
        print("  " * depth + f"{n['name']} ({len(ch)})")
        if depth < max_depth and ch:
            dump_tree(ch, depth + 1, max_depth)

for s in d["scenes"]:
    if s["levelFile"] == "level2":
        print("============================== level2 MainMenu.unity")
        dump_tree(s["rootNodes"], 0, 4)
    elif s["levelFile"] == "level3":
        print("============================== level3 Battle.unity (key roots)")
        for r in s["rootNodes"]:
            if r["name"] in ("BoardController", "BattleFlowUIController", "BattleUIController", "Canvas", "BattleGrid", "CatwalkController"):
                dump_tree([r], 0, 5)

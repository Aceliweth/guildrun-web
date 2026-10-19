import json

d = json.load(open("re_data/balancing_data.json", encoding="utf-8"))
for k, v in list(d.get("uiConfigs", {}).items())[:12]:
    print("===", k, "===")
    print(json.dumps(v, indent=2, ensure_ascii=False))

import json

d = json.load(open("re_data/balancing_data.json", encoding="utf-8"))
cvc = d.get("characterVisualConfigs", {})
print("characterVisualConfigs count:", len(cvc))
for k, v in list(cvc.items())[:5]:
    print("===", k, "===")
    print(json.dumps(v, indent=2, ensure_ascii=False))

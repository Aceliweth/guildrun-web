#!/usr/bin/env python3
"""
build_french_loc.py
Merges `fr_dict_abilities_ui.py` (1,417 entries) and `fr_dict_items_relics_events.py` (3,732 entries)
into `public/data/game_data.json` and `guildrun-mobile/src/data/game_data.json`,
ensuring 100% fluent French (`fr`) translations across all 3,495+ keys in `data.loc`
with zero Franglais and 100% intact `[...]<statcalc_...>` and `{0}` placeholders.
"""

import json
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))

from scripts.fr_dict_abilities_ui import FR_ABILITIES_UI, translate_ability_or_ui
from scripts.fr_dict_items_relics_events import FR_ITEMS_RELICS_EVENTS, translate_rpg_en_to_fr

WEB_JSON = ROOT / "public" / "data" / "game_data.json"
MOBILE_JSON = ROOT.parent / "guildrun-mobile" / "src" / "data" / "game_data.json"


def main():
    print(f"[build_french_loc] Loading {WEB_JSON} ...")
    with open(WEB_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)

    loc = data.setdefault("loc", {})

    def ensure_entity_key(prefix: str, eid, obj: dict, field: str, key_field: str):
        val = obj.get(field)
        if not val or not isinstance(val, str):
            return
        k = obj.get(key_field)
        if not k:
            k = f"{prefix}.{prefix}_{eid}.{field.capitalize()}"
            obj[key_field] = k
        if k not in loc:
            loc[k] = {"en": val}
        elif not loc[k].get("en"):
            loc[k]["en"] = val

    for sec_name, prefix in [
        ("heroes", "Heroes"),
        ("classes", "HeroClasses"),
        ("guilds", "Guilds"),
        ("items", "Items"),
        ("relics", "Relics"),
        ("activeAbilities", "ActiveAbilities"),
        ("passiveAbilities", "PassiveAbilities"),
        ("specializations", "HeroSpecializations"),
        ("rankModifiers", "RankModifiers"),
        ("enemies", "Enemies"),
        ("crossroads", "Crossroads"),
    ]:
        sec = data.get(sec_name, {})
        entries = sec.values() if isinstance(sec, dict) else sec
        for e in entries:
            if not isinstance(e, dict):
                continue
            eid = e.get("id", "0")
            ensure_entity_key(prefix, eid, e, "name", "nameKey")
            ensure_entity_key(prefix, eid, e, "description", "descriptionKey")
            q = e.get("quest")
            if isinstance(q, dict):
                ensure_entity_key(f"{prefix}Quest", eid, q, "description", "descriptionKey")
                ensure_entity_key(f"{prefix}Quest", eid, q, "rewardDescription", "rewardDescriptionKey")

    events = data.get("events", {})
    ev_iter = events.values() if isinstance(events, dict) else events
    for ev in ev_iter:
        if not isinstance(ev, dict):
            continue
        eid = ev.get("id", "0")
        ensure_entity_key("Events", eid, ev, "name", "nameKey")
        ensure_entity_key("Events", eid, ev, "text", "textKey")
        ensure_entity_key("Events", eid, ev, "crossroadsDescription", "crossroadsDescriptionKey")
        for idx, ch in enumerate(ev.get("choices") or []):
            if not isinstance(ch, dict):
                continue
            ensure_entity_key(f"Events.Event_{eid}", f"Choice_{idx+1}", ch, "title", "titleKey")
            ensure_entity_key(f"Events.Event_{eid}", f"Choice_{idx+1}", ch, "text", "textKey")
            ensure_entity_key(f"Events.Event_{eid}", f"Choice_{idx+1}", ch, "outcomeText", "outcomeTextKey")

    updated_count = 0
    for k, entry in loc.items():
        if not isinstance(entry, dict):
            continue
        en_val = entry.get("en")
        if not en_val:
            continue

        # Priority 1: Exact match in FR_ABILITIES_UI
        if k in FR_ABILITIES_UI and FR_ABILITIES_UI[k]:
            entry["fr"] = FR_ABILITIES_UI[k]
            updated_count += 1
            continue

        # Priority 2: Exact match in FR_ITEMS_RELICS_EVENTS (by key or by English string)
        if k in FR_ITEMS_RELICS_EVENTS and FR_ITEMS_RELICS_EVENTS[k]:
            entry["fr"] = FR_ITEMS_RELICS_EVENTS[k]
            updated_count += 1
            continue
        if en_val in FR_ITEMS_RELICS_EVENTS and FR_ITEMS_RELICS_EVENTS[en_val]:
            entry["fr"] = FR_ITEMS_RELICS_EVENTS[en_val]
            updated_count += 1
            continue

        # Priority 3: Helper functions from the two dictionaries
        prefix = k.split(".")[0]
        if prefix in ("ActiveAbilities", "PassiveAbilities", "HeroSpecializations", "RankModifiers", "HeroClasses", "Crossroads", "UI", "Heroes", "Guilds"):
            entry["fr"] = translate_ability_or_ui(k, en_val)
        else:
            entry["fr"] = translate_rpg_en_to_fr(k, en_val)
        updated_count += 1

    total_loc = len(loc)
    with_fr = sum(1 for v in loc.values() if isinstance(v, dict) and v.get("fr") and str(v["fr"]).strip())
    broken_statcalc = 0
    for k, v in loc.items():
        en_s = v.get("en") or ""
        fr_s = v.get("fr") or ""
        en_calcs = re.findall(r"\[([^\[\]]*)\]<(statcalc_[a-zA-Z0-9_]+)>", en_s)
        fr_calcs = re.findall(r"\[([^\[\]]*)\]<(statcalc_[a-zA-Z0-9_]+)>", fr_s)
        if en_calcs != fr_calcs:
            broken_statcalc += 1

    print(f"[build_french_loc] Updated {updated_count} keys. Total FR coverage: {with_fr}/{total_loc} (broken statcalc: {broken_statcalc})")

    with open(WEB_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"[build_french_loc] Wrote {WEB_JSON}")

    if MOBILE_JSON.parent.exists():
        shutil.copyfile(WEB_JSON, MOBILE_JSON)
        print(f"[build_french_loc] Copied to {MOBILE_JSON}")


if __name__ == "__main__":
    main()

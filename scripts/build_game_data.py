#!/usr/bin/env python3
"""
build_game_data.py — compile the reverse-engineered Guildrun data into the single
runtime file `public/data/game_data.json` (schema: CONTRACT.md) and write
`public/data/data_report.md` (counts, gaps, APPROX decisions).

Sources (all under guildrun-web/re_data):
  * balancing_data.json     — raw serialized Unity values (source of truth for numbers)
  * localization.json       — en/fr strings (`keys` map; fr is partial -> fallback en)
  * sprites_manifest.json   — sprite name / pathID -> PNG URL under public/assets/sprites
  * il2cpp_ember_types.json — enum names/values

Usage:  python scripts/build_game_data.py
"""
import collections
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RE = os.path.join(ROOT, "re_data")
PUBLIC = os.path.join(ROOT, "public")
OUT_DIR = os.path.join(PUBLIC, "data")
OUT_JSON = os.path.join(OUT_DIR, "game_data.json")
OUT_REPORT = os.path.join(OUT_DIR, "data_report.md")


def load(name):
    with open(os.path.join(RE, name), encoding="utf-8") as f:
        return json.load(f)


print("[build] loading sources ...")
BAL = load("balancing_data.json")
LOC = load("localization.json")
SPR = load("sprites_manifest.json")
TYPES = load("il2cpp_ember_types.json")
SHEETS = BAL["sheets"]

# --------------------------------------------------------------------------------------
# Report bookkeeping
# --------------------------------------------------------------------------------------
REPORT = {
    "excluded": collections.defaultdict(list),   # category -> [(id, name, reason)]
    "missing_sprites": collections.defaultdict(list),  # category -> [(id, spriteName)]
    "missing_loc": collections.defaultdict(list),  # category -> [(id, field)]
    "approx": [],
    "notes": [],
    "unresolved_refs": collections.defaultdict(list),
}
REFERENCED_KEYS = set()

# --------------------------------------------------------------------------------------
# Localization
# --------------------------------------------------------------------------------------
LOC_KEYS = LOC["keys"]
LOC_ID_TO_KEY = {v.get("id"): k for k, v in LOC_KEYS.items() if v.get("id") is not None}


def loc_en(key):
    e = LOC_KEYS.get(key)
    if not e:
        return None
    return e.get("en") or None


def loc_fr(key):
    e = LOC_KEYS.get(key)
    if not e:
        return None
    return e.get("fr") or None


def ref_key(key):
    """Mark a localization key as referenced (only if it exists)."""
    if key and key in LOC_KEYS:
        REFERENCED_KEYS.add(key)
        return key
    return None


def locakey(obj):
    """gg.leyline LocaKey {table,key,text,rawText?,variables?} -> (key, enText, vars)."""
    if not isinstance(obj, dict):
        return None, None, None
    key = obj.get("key") or None
    text = obj.get("text") or None
    vars_ = obj.get("variables") or None
    if key:
        ref_key(key)
        if not text:
            text = loc_en(key)
    return key, text, vars_


def localized_string(obj):
    """Unity LocalizedString {m_TableEntryReference:{m_KeyId}} -> key (via shared id)."""
    if not isinstance(obj, dict):
        return None
    ter = obj.get("m_TableEntryReference") or {}
    key = ter.get("m_Key") or LOC_ID_TO_KEY.get(ter.get("m_KeyId"))
    return ref_key(key)


# --------------------------------------------------------------------------------------
# Sprites
# --------------------------------------------------------------------------------------
BY_PATH = SPR.get("by_path_id", {})
BY_NAME = SPR.get("by_name", {})
_exists_cache = {}


def url_exists(url):
    if not url:
        return False
    if url not in _exists_cache:
        p = os.path.join(PUBLIC, url.lstrip("/").replace("/", os.sep))
        _exists_cache[url] = os.path.isfile(p)
    return _exists_cache[url]


def sprite_by_name(name):
    url = BY_NAME.get(name)
    return url if url_exists(url) else None


def sprite(ref, category=None, owner=None):
    """Resolve a Unity Sprite PPtr {fileID,pathID,name,type,file} to an existing PNG URL."""
    if not isinstance(ref, dict) or not ref.get("pathID"):
        return None
    url = None
    f, pid, name = ref.get("file"), ref.get("pathID"), ref.get("name")
    if f:
        url = BY_PATH.get(f"{f}:{pid}")
    if not url_exists(url) and name:
        url = BY_NAME.get(name)
    if not url_exists(url):
        url = None
        if category:
            REPORT["missing_sprites"][category].append((owner, name))
    return url


# --------------------------------------------------------------------------------------
# Generic normalisation of raw serialized objects
# --------------------------------------------------------------------------------------
_DROP = object()
TYPE_COUNTS = collections.Counter()


def short_type(full):
    return re.split(r"[.+/]", full)[-1]


def is_pptr(o):
    return isinstance(o, dict) and "fileID" in o and "pathID" in o and len(o) <= 6 and \
        set(o.keys()) <= {"fileID", "pathID", "name", "type", "file"}


def norm(o, ctx="effect"):
    """Normalise a raw serialized value:
      * `$type` objects get an extra `type` = short C# class name;
      * Sprite PPtrs -> URL string (or null), GameObject/Material/... PPtrs dropped (editor/VFX only),
        MonoBehaviour PPtrs -> {assetRef, pathID} (e.g. AoeEntry references);
      * LocalizedString -> {locKey}; LocaKey -> {key, text, variables?};
      * FMOD Guid blobs dropped.
    """
    if isinstance(o, list):
        out = []
        for v in o:
            nv = norm(v, ctx)
            if nv is not _DROP:
                out.append(nv)
        return out
    if not isinstance(o, dict):
        return o
    if is_pptr(o):
        if not o.get("pathID"):
            return None
        t = o.get("type")
        if t == "Sprite":
            return sprite(o, "sprite_ref:" + ctx, o.get("name"))
        if t == "MonoBehaviour":
            return {"assetRef": o.get("name"), "pathID": o.get("pathID")}
        return _DROP  # GameObject prefabs, materials, textures, audio clips: editor-only
    if "m_TableEntryReference" in o and "m_TableReference" in o:
        k = localized_string(o)
        return {"locKey": k} if k else None
    if set(o.keys()) >= {"table", "key", "text"} and len(o) <= 5:
        k, text, vars_ = locakey(o)
        r = {"key": k, "text": text}
        if vars_:
            r["variables"] = vars_
        return r
    if set(o.keys()) == {"Data1", "Data2", "Data3", "Data4"}:
        return _DROP
    out = {}
    for k, v in o.items():
        if k in ("_pathID", "Guid"):
            continue
        nv = norm(v, ctx)
        if nv is _DROP:
            continue
        out[k] = nv
    if "$type" in o:
        out["type"] = short_type(o["$type"])
        TYPE_COUNTS[out["type"]] += 1
    return out


def entries(sheet):
    return SHEETS[sheet]["Entries"]


def eid(e):
    return e["Id"]["id"]


TEST_RE = re.compile(r"\b(test|dummy)", re.I)


def excluded(category, e, name):
    """Return True (and log) if entry must be skipped: DisabledInGame or test/dummy entry."""
    if e.get("DisabledInGame"):
        REPORT["excluded"][category].append((eid(e), name, "DisabledInGame"))
        return True
    if name and TEST_RE.search(name):
        REPORT["excluded"][category].append((eid(e), name, "test/dummy entry"))
        return True
    return False


def need_loc(category, oid, field, value):
    if not value:
        REPORT["missing_loc"][category].append((oid, field))


# --------------------------------------------------------------------------------------
# Enums
# --------------------------------------------------------------------------------------
def build_enums():
    enums = {}
    seen_short = collections.Counter()
    all_enums = []
    for asm in TYPES["assemblies"].values():
        for t in asm["types"]:
            if t.get("kind") == "enum":
                all_enums.append(t)
                seen_short[t["name"]] += 1
    for t in all_enums:
        vals = {}
        for f in t.get("fields", []):
            if f.get("isConst") and "defaultValue" in f:
                vals[f["name"]] = f["defaultValue"]
        if not vals:
            continue
        key = t["name"] if seen_short[t["name"]] == 1 else t["fullName"]
        enums[key] = vals
    return enums


# --------------------------------------------------------------------------------------
# Character visuals
# --------------------------------------------------------------------------------------
CVC = BAL["characterVisualConfigs"]


def visual_config(ref):
    if not isinstance(ref, dict) or not ref.get("pathID"):
        return None
    return CVC.get(str(ref["pathID"]))


def sprites_list(lst, cat, owner):
    return [sprite(r, cat, owner) for r in (lst or [])]


STAT_KEYS = ["MaxHealth", "MaxMana", "StartingMana", "ManaRegen", "MoveSpeed", "Defense",
             "BaseAttackDamage", "Attack", "Magic", "AttackRange", "BaseAttackSpeed",
             "AttackSpeed", "Crit", "ManaLockTime"]


def stats_of(e):
    return {k: e.get(k) for k in STAT_KEYS}


# --------------------------------------------------------------------------------------
# Builders
# --------------------------------------------------------------------------------------
def build_guilds():
    out = {}
    for e in entries("GuildSheetHolder"):
        k, name, _ = locakey(e.get("NameLocaKey"))
        name = name or e.get("title")
        if excluded("guilds", e, name):
            continue
        tag_key = localized_string(e.get("Tagline"))
        desc_key = localized_string(e.get("Description"))
        g = {
            "id": eid(e), "name": name, "nameKey": k, "tag": e.get("TagName"),
            "title": e.get("title"),
            "tagline": loc_en(tag_key), "taglineKey": tag_key,
            "description": loc_en(desc_key), "descriptionKey": desc_key,
            "icon": sprite(e.get("Icon"), "guilds", eid(e)),
        }
        need_loc("guilds", g["id"], "name", name)
        out[str(g["id"])] = g
    return out


CLASS_VIS = {}
for _k, _v in BAL["uiConfigs"].items():
    if "HeroClassVisuals" in _k:
        for _cv in _v.get("heroClassVisuals", []):
            CLASS_VIS[_cv["Id"]] = _cv


def build_classes():
    out = {}
    for e in entries("HeroClassSheetHolder"):
        k, name, _ = locakey(e.get("NameLocaKey"))
        name = name or e.get("title")
        if excluded("classes", e, name):
            continue
        dk, desc, dvars = locakey(e.get("DescriptionLocaKey"))
        vis = CLASS_VIS.get(eid(e), {})
        c = {
            "id": eid(e), "name": name, "nameKey": k, "tag": e.get("TagName"),
            "description": desc, "descriptionKey": dk, "descriptionVars": dvars,
            "icon": sprite(vis.get("Icon"), "classes", eid(e)),
            "portrait": sprite(vis.get("Portrait"), "classes", eid(e)),
            "iconText": e.get("IconText"),
            "primaryStat": e.get("PrimaryStat"),
            "secondaryStats": e.get("SecondaryStats") or [],
        }
        need_loc("classes", c["id"], "name", name)
        need_loc("classes", c["id"], "description", desc)
        out[str(c["id"])] = c
    return out


def build_abilities():
    act, pas = {}, {}
    for e in entries("ActiveAbilitySheetHolder"):
        k, name, _ = locakey(e.get("NameLocaKey"))
        if excluded("activeAbilities", e, name):
            continue
        dk, desc, dvars = locakey(e.get("DescriptionLocaKey"))
        tk, ttext, tvars = locakey(e.get("DataTrackingDescriptionLocaKey"))
        a = {
            "id": eid(e), "name": name, "nameKey": k,
            "description": desc, "descriptionKey": dk, "descriptionVars": dvars,
            "trackingKey": tk, "trackingVars": tvars,
            "icon": sprite(e.get("Icon"), "activeAbilities", eid(e)),
            "targetHero": e.get("targetHero"),
            "rushDuration": e.get("RushDuration"), "stallDuration": e.get("StallDuration"),
            "actions": norm(e.get("AbilityActions") or [], "activeAbility"),
            "effects": [],
        }
        # Hoist ModularEffects nested in EffectAbilityAction-like actions for convenience
        for act_ in a["actions"]:
            if isinstance(act_, dict):
                for kk in ("effects", "Effects"):
                    if isinstance(act_.get(kk), list):
                        a["effects"].extend(x for x in act_[kk] if isinstance(x, dict))
        need_loc("activeAbilities", a["id"], "name", name)
        need_loc("activeAbilities", a["id"], "description", desc)
        act[str(a["id"])] = a
    for e in entries("PassiveAbilitySheetHolder"):
        k, name, _ = locakey(e.get("NameLocaKey"))
        if excluded("passiveAbilities", e, name):
            continue
        dk, desc, dvars = locakey(e.get("DescriptionLocaKey"))
        tk, ttext, tvars = locakey(e.get("DataTrackingDescriptionLocaKey"))
        p = {
            "id": eid(e), "name": name, "nameKey": k,
            "description": desc, "descriptionKey": dk, "descriptionVars": dvars,
            "trackingKey": tk, "trackingVars": tvars,
            "icon": sprite(e.get("Icon"), "passiveAbilities", eid(e)),
            "targetHero": e.get("targetHero"),
            # Passive effects are NOT serialized: generated C# provider (PassiveAbilityEffectsProvider).
            "effects": norm(e.get("effects") or [], "passiveAbility"),
        }
        need_loc("passiveAbilities", p["id"], "name", name)
        need_loc("passiveAbilities", p["id"], "description", desc)
        pas[str(p["id"])] = p
    return act, pas


def build_specializations():
    hero_of = {}
    for c in entries("HeroSpecializationChoiceSheetHolder"):
        if c.get("DisabledInGame"):
            continue
        for sid in c.get("specializationIds") or []:
            hero_of[sid] = c["heroId"]
    out = {}
    for e in entries("HeroSpecializationSheetHolder"):
        k, name, _ = locakey(e.get("NameLocaKey"))
        if excluded("specializations", e, name):
            continue
        ck, ctext, cvars = locakey(e.get("ClassDescriptionBonusLocaKey"))
        s = {
            "id": eid(e), "heroId": hero_of.get(eid(e)), "name": name, "nameKey": k,
            "description": ctext, "descriptionKey": ck, "descriptionVars": cvars,
            "classId": e.get("classId") if e.get("classId", -1) != -1 else None,
            "activeAbilityId": e.get("activeAbilityId") if e.get("activeAbilityId", -1) != -1 else None,
            "passiveAbilityId": e.get("passiveAbilityId") if e.get("passiveAbilityId", -1) != -1 else None,
            "tags": e.get("tags") or [],
        }
        need_loc("specializations", s["id"], "name", name)
        out[str(s["id"])] = s
    return out, hero_of


def build_heroes(specs):
    spec_ids_by_hero = collections.defaultdict(list)
    for c in entries("HeroSpecializationChoiceSheetHolder"):
        if not c.get("DisabledInGame"):
            spec_ids_by_hero[c["heroId"]] = [s for s in c.get("specializationIds") or [] if str(s) in specs]
    out = {}
    for e in entries("HeroSheetHolder"):
        k, name, _ = locakey(e.get("NameLocaKey"))
        if excluded("heroes", e, name):
            continue
        hid = eid(e)
        vc = visual_config(e.get("VisualConfig")) or {}
        cat = "heroes"
        full = sprites_list(vc.get("FullPortraitSpritesPerRank"), cat, hid)
        cropped = sprites_list(vc.get("PortraitSpritesPerRank"), cat, hid)
        cropped_med = sprites_list(vc.get("MediumPortraitSpritesPerRank"), cat, hid)
        half = sprites_list(vc.get("HalfBodyPortraitPerRank"), cat, hid)
        breakout = sprites_list(vc.get("BreakoutPortraitSpritesPerRank"), cat, hid)
        ak, alias, _ = locakey(e.get("Alias"))
        sk, subtitle, _ = locakey(e.get("Subtitle"))
        gk, lore_guild, _ = locakey(e.get("CurrentGuild"))
        mk, motivation, _ = locakey(e.get("Motivation"))
        atk = e.get("AttackSettings") or {}
        pr = e.get("PriceRange") or {}
        h = {
            "id": hid, "name": name, "nameKey": k,
            "guildId": e.get("guildID"),
            "classIds": [c for c in (e.get("class1ID"), e.get("class2ID")) if c is not None and c != -1],
            "price": pr.get("x"), "priceRange": [pr.get("x"), pr.get("y")],
            "gender": e.get("Gender"),
            "tags": e.get("tags") or [],
            "stats": stats_of(e),
            "attackType": atk.get("Type"), "projectileSpeed": atk.get("ProjectileSpeed"),
            "radius": e.get("CircleCollisorRadius"),
            "activeAbilityId": e.get("activeAbilityID") if e.get("activeAbilityID", -1) != -1 else None,
            "passiveAbilityId": e.get("passiveAbilityID") if e.get("passiveAbilityID", -1) != -1 else None,
            "startWithActiveAbility": bool(e.get("StartWithActiveAbility")),
            "specializationIds": spec_ids_by_hero.get(hid, []),
            "portrait": sprite(vc.get("PortraitSprite"), cat, hid) or (cropped[0] if cropped else None),
            "portraitRound": sprite(vc.get("SmallPortraitSprite"), cat, hid),
            "portraitSquare": sprite(vc.get("SquarePortraitSprite"), cat, hid),
            "fullBody": full[0] if full else None,
            # per-rank variants: index 0 = rank C(1), 1 = B(2), 2 = A(3), 3 = S(4)
            "fullBodyByRank": full, "croppedByRank": cropped, "croppedMedByRank": cropped_med,
            "halfBodyByRank": half, "breakoutByRank": breakout,
            "visual": (vc.get("_assetName") or "").replace("_VisualConfig", "") or None,
            "lore": {"alias": alias, "aliasKey": ak, "subtitle": subtitle, "subtitleKey": sk,
                     "currentGuild": lore_guild, "currentGuildKey": gk,
                     "motivation": motivation, "motivationKey": mk},
        }
        for f in ("portrait", "portraitRound", "fullBody"):
            if not h[f]:
                REPORT["missing_sprites"]["heroes"].append((hid, f))
        need_loc("heroes", hid, "name", name)
        out[str(hid)] = h
    return out


SHOP = BAL["singletons"]["ShopSingleton"]
ITEM_COST = {c["Element"]: c["Value"] for c in SHOP.get("itemRarityCosts", [])}
RELIC_COST = {c["Element"]: c["Value"] for c in SHOP.get("relicRarityCosts", [])}
HERO_RANK_COST = {c["Element"]: c["Value"] for c in SHOP.get("heroRankCosts", [])}


def quest_block(e, cat):
    q = e.get("QuestEffect")
    if not q:
        return None
    qk, qtext, qvars = locakey(e.get("QuestDescriptionLocaKey"))
    rk, rtext, rvars = locakey(e.get("QuestRewardDescriptionLocaKey"))
    return {
        "effect": norm(q, cat),
        "description": qtext, "descriptionKey": qk, "descriptionVars": qvars,
        "rewardDescription": rtext, "rewardDescriptionKey": rk, "rewardDescriptionVars": rvars,
    }


def build_items():
    out = {}
    for e in entries("ItemSheetHolder"):
        k, name, _ = locakey(e.get("NameLocaKey"))
        iid = eid(e)
        if not k:  # Id prefix is broken ("tem_") in data; rebuild conventional key
            k = ref_key(f"Items.Item_{iid}.Name")
            name = name or loc_en(k)
        if excluded("items", e, name):
            continue
        dk, desc, dvars = locakey(e.get("DescriptionLocaKey"))
        tk, _, tvars = locakey(e.get("DataTrackingDescriptionLocaKey"))
        quest = quest_block(e, "item")
        if not desc and quest:
            desc = quest["rewardDescription"]
        it = {
            "id": iid, "name": name, "nameKey": k,
            "description": desc, "descriptionKey": dk, "descriptionVars": dvars,
            "trackingKey": tk, "trackingVars": tvars,
            "rarity": e.get("Rarity"),
            "icon": sprite(e.get("Icon"), "items", iid),
            "price": ITEM_COST.get(e.get("Rarity")),
            "statMods": [{"stat": m.get("TargetStat"), "value": m.get("Value"), "percent": False}
                         for m in (e.get("StatModifications") or [])],
            "effects": norm(e.get("effects") or [], "item"),
            "specialEffects": norm(e.get("specialEffects") or [], "item"),
            "quest": quest,
        }
        need_loc("items", iid, "name", name)
        if not desc and not it["statMods"]:
            need_loc("items", iid, "description", desc)
        out[str(iid)] = it
    return out


def build_relics():
    out = {}
    for e in entries("RelicSheetHolder"):
        k, name, _ = locakey(e.get("NameLocaKey"))
        rid = eid(e)
        if excluded("relics", e, name):
            continue
        dk, desc, dvars = locakey(e.get("DescriptionLocaKey"))
        tk, _, tvars = locakey(e.get("DataTrackingDescriptionLocaKey"))
        quest = quest_block(e, "relic")
        if not desc and quest:
            desc = quest["rewardDescription"]
        r = {
            "id": rid, "name": name, "nameKey": k,
            "description": desc, "descriptionKey": dk, "descriptionVars": dvars,
            "trackingKey": tk, "trackingVars": tvars,
            "rarity": e.get("Rarity"),
            "icon": sprite(e.get("Icon"), "relics", rid),
            "price": RELIC_COST.get(e.get("Rarity")),
            # Non-quest relic effects are NOT serialized (generated C# RelicEffectsProvider).
            "effects": norm(e.get("effects") or [], "relic"),
            "quest": quest,
        }
        need_loc("relics", rid, "name", name)
        need_loc("relics", rid, "description", desc)
        out[str(rid)] = r
    return out


def build_rank_modifiers():
    out = {}
    for e in entries("RankModifierSheetHolder"):
        k, name, _ = locakey(e.get("NameLocaKey"))
        if excluded("rankModifiers", e, name):
            continue
        dk, desc, dvars = locakey(e.get("DescriptionLocaKey"))
        tk, _, tvars = locakey(e.get("DataTrackingDescriptionLocaKey"))
        r = {
            "id": eid(e), "name": name, "nameKey": k,
            "description": desc, "descriptionKey": dk, "descriptionVars": dvars,
            "trackingKey": tk, "trackingVars": tvars,
            "icon": sprite(e.get("Icon"), "rankModifiers", eid(e)),
            "tags": e.get("tags") or [],
            "effects": norm(e.get("effects") or [], "rankModifier"),
            "specialEffects": norm(e.get("specialEffects") or [], "rankModifier"),
        }
        need_loc("rankModifiers", r["id"], "name", name)
        need_loc("rankModifiers", r["id"], "description", desc)
        out[str(r["id"])] = r
    return out


def build_enemy_scaling():
    out, by_target = {}, {}
    for e in entries("EnemyScalingSheetHolder"):
        if e.get("DisabledInGame"):
            REPORT["excluded"]["enemyScaling"].append((eid(e), None, "DisabledInGame"))
            continue
        out[str(eid(e))] = norm(e.get("StatScalingList") or [], "scaling")
        by_target[e.get("targetEnemyId")] = eid(e)
    return out, by_target


def build_enemies(scaling_by_target):
    ens = entries("EnemySheetHolder")
    # Fallback names: most common localized name per visual config
    vc_names = collections.defaultdict(collections.Counter)
    for e in ens:
        k, name, _ = locakey(e.get("NameLocaKey"))
        vcn = (e.get("VisualConfig") or {}).get("name")
        if name and vcn and not TEST_RE.search(name):
            vc_names[vcn][(k, name)] += 1
    out = {}
    fallback_count = 0
    for e in ens:
        k, name, _ = locakey(e.get("NameLocaKey"))
        en_id = eid(e)
        vcref = e.get("VisualConfig") or {}
        vcn = vcref.get("name")
        name_fallback = False
        if not name:
            if vc_names.get(vcn):
                (k, name), _c = vc_names[vcn].most_common(1)[0]
                name_fallback = True
                fallback_count += 1
            else:
                name = (vcn or f"Enemy {en_id}").replace("_VisualConfig", "")
                name_fallback = True
                fallback_count += 1
        if excluded("enemies", e, name):
            continue
        vc = visual_config(vcref) or {}
        atk = e.get("AttackSettings") or {}
        en = {
            "id": en_id, "name": name, "nameKey": k, "nameFallback": name_fallback,
            "stats": stats_of(e),
            "attackType": atk.get("Type"), "projectileSpeed": atk.get("ProjectileSpeed"),
            "radius": e.get("CircleCollisorRadius"),
            "activeAbilityId": e.get("activeAbilityID") if e.get("activeAbilityID", -1) != -1 else None,
            "passiveAbilityId": e.get("passiveAbilityID") if e.get("passiveAbilityID", -1) != -1 else None,
            "startWithActiveAbility": bool(e.get("StartWithActiveAbility")),
            "scalingId": scaling_by_target.get(en_id),
            "visual": (vcn or "").replace("_VisualConfig", "") or None,
            "icon": sprite(vc.get("SmallPortraitSprite"), "enemies", en_id),
        }
        out[str(en_id)] = en
    REPORT["notes"].append(
        f"{fallback_count} enemies have no NameLocaKey; their name/nameKey was borrowed from the most common "
        f"named enemy sharing the same VisualConfig (flag `nameFallback: true`).")
    return out


ENV_TOD_RE = re.compile(r"_(Morning|Evening|Dusk)$")


def stage_background(env, stage_type):
    """// APPROX: environment scenes are 3D; map to the extracted 2D RuinsForest layers."""
    tod = None
    m = ENV_TOD_RE.search(env or "")
    if m:
        tod = m.group(1)
    layers = []
    if stage_type in ("Boss",):
        for n in ("RuinsForest_Sky_Boss", "RuinsForest_BossStage_Background_3",
                  "RuinsForest_BossStage_Background_2", "RuinsForest_BossStage_Background_1"):
            u = sprite_by_name(n)
            if u:
                layers.append(u)
    if not layers and tod:
        for n in (f"RuinsForest_Sky_{tod}", f"RuinsForest_Background_02_{tod}",
                  f"RuinsForest_Background_01_{tod}"):
            u = sprite_by_name(n)
            if u:
                layers.append(u)
    bg = None
    if tod:
        bg = sprite_by_name(f"RuinsForest_Background_01_{tod}")
    if stage_type == "Boss" and layers:
        bg = layers[-1]
    return bg, layers


def rewards_norm(r):
    if not r:
        return None
    g = r.get("GoldRewardRange") or {}
    return {"heroPoolId": r.get("HeroPool"), "itemPoolId": r.get("EquipmentPool"),
            "relicPoolId": r.get("RelicPool"),
            "shards": [g.get("FromInclusive"), g.get("ToInclusive")]}


def build_stages(enemies):
    out = {}
    sizes = collections.Counter()
    ys = collections.Counter()
    bad_refs = []

    def placements(e, sid):
        res = []
        for p in e.get("EnemyPlacements") or []:
            en_id = p["enemyId"]["id"]
            if str(en_id) not in enemies:
                bad_refs.append((sid, en_id))
            pos = p.get("Position") or {}
            ys[pos.get("y")] += 1
            res.append({"enemyId": en_id, "x": pos.get("x"), "y": pos.get("y"),
                        "direction": p.get("Direction")})
        return res

    for e in entries("StageSheetHolder"):
        sid = eid(e)
        if excluded("stages", e, e.get("GroupName")):
            continue
        sizes[(e["Width"], e["Height"])] += 1
        bg, layers = stage_background(e.get("EnvironmentSceneName"), e.get("StageType"))
        s = {
            "id": sid, "act": e.get("ActNumber"), "floor": e.get("FloorNumber"),
            "stageType": e.get("StageType"), "fightMode": None,
            "group": e.get("GroupName"), "difficultyIndex": e.get("DifficultyIndex"),
            "width": e.get("Width"), "height": e.get("Height"),
            "environment": e.get("EnvironmentSceneName"),
            "bgm": e.get("BiomeBgmName"), "bgmVariation": e.get("BiomeBgmVariation"),
            "effectiveHP": e.get("EffectiveHP"), "effectiveOffense": e.get("EffectiveOffense"),
            "enemies": placements(e, sid),
            "rewards": rewards_norm(e.get("StageRewards")),
            "defeatRewards": rewards_norm(e.get("DefeatStageRewards")),
            "background": bg, "backgroundLayers": layers,
        }
        out[str(sid)] = s
    stages_out = out
    fight_modes_out = {}
    collisions = []
    for e in entries("FightModeSheetHolder"):
        sid = eid(e)
        if excluded("fightModes", e, e.get("GroupName")):
            continue
        if str(sid) in stages_out:
            collisions.append(sid)
        sizes[(e["Width"], e["Height"])] += 1
        bg, layers = stage_background(e.get("EnvironmentSceneName"), "FightMode")
        s = {
            "id": sid, "act": e.get("ActNumber"), "floor": None,
            "stageType": "FightMode", "fightMode": e.get("FightModeType"),
            "group": e.get("GroupName"), "difficultyIndex": None,
            "width": e.get("Width"), "height": e.get("Height"),
            "environment": e.get("EnvironmentSceneName"),
            "bgm": e.get("BiomeBgmName"), "bgmVariation": e.get("BiomeBgmVariation"),
            "enemies": placements(e, sid),
            "thresholds": e.get("Thresholds") or [],
            "victoryRewards": [rewards_norm(r) for r in e.get("VictoryRewards") or []],
            "defeatRewards": [rewards_norm(r) for r in e.get("DefeatRewards") or []],
            "background": bg, "backgroundLayers": layers,
        }
        fight_modes_out[str(sid)] = s
    if collisions:
        REPORT["notes"].append(f"FightMode ids colliding with Stage ids (stored in fightModes): {collisions}")
    if bad_refs:
        REPORT["unresolved_refs"]["stage->enemy"] = bad_refs
    return stages_out, fight_modes_out, sizes, ys


def build_events():
    out = {}
    for e in entries("EventSheetHolder"):
        evid = eid(e)
        name_key = ref_key(f"Events.Event_{evid}.EventName")
        name = loc_en(name_key) or e.get("title")
        if excluded("events", e, e.get("title")):
            continue
        text_key = ref_key(f"Events.Event_{evid}.EventDescription")
        cross_key = ref_key(f"Events.Event_{evid}.CrossroadsDescription")
        choices = []
        for i, c in enumerate(e.get("EventChoices") or [], start=1):
            tk, ttext, tvars = locakey(c.get("ChoiceTextLocaKey"))
            ok, otext, ovars = locakey(c.get("ChoiceOutcomeTextLocaKey"))
            title_key = ref_key(f"Events.Event_{evid}.Choice_{i}.ChoiceTitle")
            choices.append({
                "title": loc_en(title_key), "titleKey": title_key,
                "text": ttext, "textKey": tk, "textVars": tvars,
                "outcome": otext, "outcomeKey": ok, "outcomeVars": ovars,
                "rewards": norm(c.get("Rewards") or [], "eventReward"),
            })
            need_loc("events", evid, f"choice{i}.text", ttext)
        ev = {
            "id": evid, "name": name, "nameKey": name_key, "title": e.get("title"),
            "text": loc_en(text_key), "textKey": text_key,
            "crossroadsDescription": loc_en(cross_key), "crossroadsDescriptionKey": cross_key,
            "image": sprite(e.get("EventArtwork"), "events", evid),
            "icon": sprite(e.get("EventIcon"), "events", evid),
            "choices": choices,
        }
        need_loc("events", evid, "name", loc_en(name_key))
        need_loc("events", evid, "text", ev["text"])
        if not ev["image"]:
            REPORT["missing_sprites"]["events"].append((evid, "EventArtwork"))
        out[str(evid)] = ev
    return out


def build_crossroads():
    out = {}
    for e in entries("CrossroadsSheetHolder"):
        k, name, _ = locakey(e.get("NameLocaKey"))
        if excluded("crossroads", e, name):
            continue
        out[str(eid(e))] = {
            "id": eid(e), "name": name, "nameKey": k, "poolType": e.get("PoolType"),
            "paths": [{"pathType": p.get("PathType"),
                       "eventId": p.get("eventId") if p.get("eventId", -1) != -1 else None,
                       "eventPoolId": p.get("eventPoolId") if p.get("eventPoolId", -1) != -1 else None}
                      for p in e.get("Paths") or []],
        }
    return out


def build_pool(sheet, list_key, id_key, valid=None, category=None, extra=None):
    out = {}
    for e in entries(sheet):
        if e.get("DisabledInGame"):
            REPORT["excluded"][category or sheet].append((eid(e), e.get("title"), "DisabledInGame"))
            continue
        ents, dropped = [], []
        for w in e.get(list_key) or []:
            xid = w.get(id_key)
            if valid is not None and str(xid) not in valid:
                dropped.append(xid)
                continue
            ents.append({"id": xid, "weight": w.get("Weight")})
        p = {"id": eid(e), "title": e.get("title"), "entries": ents}
        if extra:
            for src, dst in extra.items():
                p[dst] = e.get(src)
        if dropped:
            REPORT["unresolved_refs"][f"{category or sheet} dropped ids"].append((eid(e), dropped))
        out[str(eid(e))] = p
    return out


def build_stat_mods():
    out = {}
    for e in entries("StatModSheetHolder"):
        if excluded("statMods", e, e.get("title")):
            continue
        out[str(eid(e))] = {"id": eid(e), "title": e.get("title"),
                            "stat": e.get("TargetStat"), "value": e.get("Value")}
    return out


def build_singletons():
    out = {}
    for k, v in BAL["singletons"].items():
        if k == "AudioSingleton":
            # keep only event paths (FMOD GUIDs are editor/runtime-only)
            out[k] = norm(v, "singleton")
            continue
        out[k] = norm(v, "singleton")
    return out


def build_visuals():
    vis = {"itemFrames": [], "itemFramesSmall": [], "relicFrames": {}, "tags": {}, "classes": {}}
    for k, v in BAL["uiConfigs"].items():
        if k.endswith("ItemVisuals_2004"):
            vis["itemFrames"] = [sprite(r, "ui", "ItemVisuals") for r in v.get("rarityFrameSprites", [])]
        elif "ItemVisuals_Small" in k:
            vis["itemFramesSmall"] = [sprite(r, "ui", "ItemVisualsSmall") for r in v.get("rarityFrameSprites", [])]
        elif "RelicVisuals" in k:
            for rf in v.get("rarityFrames", []):
                vis["relicFrames"][rf["Rarity"]] = sprite(rf.get("BackgroundSprite"), "ui", "RelicVisuals")
            vis["relicFrames"]["_fallback"] = sprite(v.get("fallbackFrameSprite"), "ui", "RelicVisuals")
        elif "HeroCardTagVisualConfig" in k:
            for t in v.get("tagVisuals", []):
                nk = localized_string(t.get("Name"))
                vis["tags"][t["Tag"]] = {"keyword": t.get("Keyword"), "nameKey": nk, "name": loc_en(nk),
                                         "icon": sprite(t.get("Icon"), "ui", t["Tag"]),
                                         "iconText": t.get("IconText")}
    vis["itemFramesNote"] = "rarityFrameSprites order as serialized (C, A, S, Z frames)"
    for cid, cv in CLASS_VIS.items():
        vis["classes"][str(cid)] = {"icon": sprite(cv.get("Icon"), "classes", cid),
                                    "portrait": sprite(cv.get("Portrait"), "classes", cid)}
    for n in ("Enemy_round", "EnemyCardBG", "Banner_Enemy", "Boss", "ActBoss", "Tile_Open", "Tile_Filled",
              "CampFire", "Campfire", "Event", "FightEvent", "FightRoom", "Mining", "GateIcon",
              "EventImage_Placeholder", "EventImage_FirstCampfire", "RiftReborn_KeyArt",
              "LoadingScreen_Background", "Guildrun_Logo_Long"):
        u = sprite_by_name(n)
        if u:
            vis.setdefault("misc", {})[n] = u
    return vis


def build_aoe():
    out = {}
    for a in BAL.get("aoeEntries", []):
        n = norm(a, "aoe")
        out[a.get("_assetName") or a.get("Title")] = n
    return out


# --------------------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------------------
def main():
    enums = build_enums()
    guilds = build_guilds()
    classes = build_classes()
    active, passive = build_abilities()
    specs, _ = build_specializations()
    heroes = build_heroes(specs)
    items = build_items()
    relics = build_relics()
    rank_mods = build_rank_modifiers()
    scaling, scaling_by_target = build_enemy_scaling()
    enemies = build_enemies(scaling_by_target)
    stages, fight_modes, sizes, ys = build_stages(enemies)
    events = build_events()
    crossroads = build_crossroads()
    stat_mods = build_stat_mods()

    pools = {
        "heroPools": build_pool("HeroPoolSheetHolder", "WeightedRewards", "elementId", heroes, "heroPools"),
        "itemPools": build_pool("ItemPoolSheetHolder", "WeightedRewards", "elementId", items, "itemPools"),
        "relicPools": build_pool("RelicPoolSheetHolder", "WeightedRelics", "relicId", relics, "relicPools"),
        "eventPools": build_pool("EventPoolSheetHolder", "WeightedEvents", "eventID", events, "eventPools"),
        "rankModifierPools": build_pool("RankModifierPoolSheetHolder", "WeightedRankModifiers", "elementId",
                                        rank_mods, "rankModifierPools",
                                        extra={"targetClassID": "targetClassId", "TargetRank": "targetRank"}),
        "crossroadsPools": build_pool("CrossroadsPoolSheetHolder", "WeightedCrossroads", "elementId",
                                      crossroads, "crossroadsPools"),
        "fightEventPools": build_pool("FightEventPoolSheetHolder", "WeightedFights", "elementId",
                                      {**stages, **fight_modes}, "fightEventPools"),
        "statModPools": build_pool("StatModPoolSheetHolder", "WeightedStatMods", "elementId",
                                   stat_mods, "statModPools"),
    }

    # ---- Board -------------------------------------------------------------------
    (bw, bh), _n = sizes.most_common(1)[0]
    enemy_rows = sorted(y for y in ys if y is not None)
    min_enemy_row = min(enemy_rows) if enemy_rows else bh // 2
    player_rows = list(range(0, min_enemy_row))
    board = {
        "width": bw, "height": bh, "playerRows": player_rows,
        "enemyRows": list(range(min_enemy_row, bh)),
        "source": f"StageSheet/FightModeSheet Width x Height = {dict((f'{k[0]}x{k[1]}', v) for k, v in sizes.items())}; "
                  f"enemy placement rows observed = {sorted(ys.items())}",
        "approx": ["playerRows inferred: enemies are only ever placed on rows "
                   f"{min_enemy_row}..{bh - 1}, so heroes deploy on rows 0..{min_enemy_row - 1}",
                   "hex layout/offset parity not present in balancing data"],
    }
    if len(sizes) > 1:
        REPORT["notes"].append(f"Multiple board sizes found: {dict(sizes)}; using the most common.")
    REPORT["approx"].append(
        f"board.playerRows = {player_rows}: inferred from enemy placements (all enemies on rows "
        f"{min_enemy_row}..{bh - 1} across {sum(sizes.values())} stages/fight-modes). Width/height {bw}x{bh} are real data.")
    REPORT["approx"].append(
        "Hex grid orientation/offset parity (odd/even rows) is not serialized in balancing data; renderer must choose.")

    # ---- Shop prices ------------------------------------------------------------
    shop_prices = {
        "heroRank": {str(k): v for k, v in HERO_RANK_COST.items()},
        "heroPriceRange": sorted({tuple(h["priceRange"]) for h in heroes.values()}),
        "itemRarity": ITEM_COST, "relicRarity": RELIC_COST,
        "teamSize": {"base": SHOP.get("BaseTeamSizeCost"), "increment": SHOP.get("TeamSizeIncrementCost")},
        "reroll": {"base": SHOP.get("BaseRerollCost"), "increment": SHOP.get("RerollCostIncrement"),
                   "superShopBase": SHOP.get("SuperShopBaseRerollCost")},
        "sellMultiplier": SHOP.get("FallbackSellMultiplier"),
    }
    REPORT["approx"].append(
        f"hero.price = HeroSheet PriceRange.x (all heroes: {shop_prices['heroPriceRange']}). ShopSingleton.heroRankCosts "
        f"{shop_prices['heroRank']} is exported in shopPrices.heroRank — the shop very likely charges by rolled rank "
        f"(rank-1 cost 15 == StartingShards 15); RUN agent should prefer heroRankCosts for shop slots.")
    REPORT["approx"].append(
        "item.price / relic.price = ShopSingleton.itemRarityCosts / relicRarityCosts by Rarity; rarities without a "
        "cost entry (relic Unique/SingleBattleBoost/Enemy/ActBoss) get price null (not sold in shop).")
    REPORT["approx"].append(
        "stage.background/backgroundLayers: 3D environment scenes mapped to extracted 2D RuinsForest layers by "
        "time-of-day suffix (Morning/Evening/Dusk); Boss stages use RuinsForest_BossStage_* layers.")

    # ---- Effects gaps -----------------------------------------------------------
    relic_no_fx = [r["id"] for r in relics.values() if not r["effects"] and not r["quest"]]
    passive_no_fx = [p["id"] for p in passive.values() if not p["effects"]]
    item_no_fx = [i["id"] for i in items.values() if not i["effects"] and not i["specialEffects"] and not i["quest"]]
    REPORT["notes"].append(
        f"{len(relic_no_fx)}/{len(relics)} relics have no serialized effect (no `effects` field in RelicSheet; only "
        f"QuestEffect is serialized). Their logic lives in generated C# `RelicEffectsProvider` — SIM must "
        f"approximate from description.")
    REPORT["notes"].append(
        f"{len(passive_no_fx)}/{len(passive)} passive abilities have no serialized effects (PassiveAbilitySheet has "
        f"no effects field; generated `PassiveAbilityEffectsProvider`).")
    REPORT["notes"].append(f"{len(item_no_fx)} items with neither effects/specialEffects/quest: {item_no_fx[:30]}")

    # ---- Cross refs -------------------------------------------------------------
    for h in heroes.values():
        for f, coll in (("activeAbilityId", active), ("passiveAbilityId", passive)):
            if h[f] is not None and str(h[f]) not in coll:
                REPORT["unresolved_refs"]["hero->" + f].append((h["id"], h[f]))
        for c in h["classIds"]:
            if str(c) not in classes:
                REPORT["unresolved_refs"]["hero->class"].append((h["id"], c))
    for s in specs.values():
        for f, coll in (("activeAbilityId", active), ("passiveAbilityId", passive)):
            if s[f] is not None and str(s[f]) not in coll:
                REPORT["unresolved_refs"]["spec->" + f].append((s["id"], s[f]))
    en_abil_missing = collections.Counter()
    for en in enemies.values():
        for f, coll in (("activeAbilityId", active), ("passiveAbilityId", passive)):
            if en[f] is not None and str(en[f]) not in coll:
                en_abil_missing[(f, en[f])] += 1
    if en_abil_missing:
        REPORT["unresolved_refs"]["enemy->ability (id: count)"] = [
            f"{f}={i} x{n}" for (f, i), n in sorted(en_abil_missing.items(), key=lambda x: (x[0][0], x[0][1]))]

    # ---- Localization subset ------------------------------------------------------
    for k in LOC_KEYS:
        if k.startswith("UI."):
            REFERENCED_KEYS.add(k)
    loc = {}
    fr_missing = 0
    for k in sorted(REFERENCED_KEYS):
        en_t = loc_en(k)
        fr_t = loc_fr(k)
        v = {"en": en_t}
        if fr_t:
            v["fr"] = fr_t
        else:
            fr_missing += 1
        loc[k] = v

    singletons = build_singletons()
    acts = [norm(BAL["singletons"]["ActEntry"], "act")]

    data = {
        "version": 1,
        "meta": {
            "gameVersion": BAL["metadata"].get("gameVersion"),
            "unityVersion": BAL["metadata"].get("unityVersion"),
            "generator": "scripts/build_game_data.py",
            "textFormat": "Descriptions keep Unity markup `[text]<tag>` and `{n}` placeholders (loc). "
                          "Entity `description` is EN with variables already substituted; use "
                          "`descriptionKey` + `descriptionVars` with loc for FR.",
            "rankIndex": "per-rank sprite arrays: 0=C(rank1) 1=B(rank2) 2=A(rank3) 3=S(rank4)",
        },
        "singletons": singletons,
        "board": board,
        "shopPrices": shop_prices,
        "guilds": guilds,
        "classes": classes,
        "heroes": heroes,
        "specializations": specs,
        "activeAbilities": active,
        "passiveAbilities": passive,
        "items": items,
        "relics": relics,
        "rankModifiers": rank_mods,
        "statMods": stat_mods,
        "enemies": enemies,
        "enemyScaling": scaling,
        "stages": stages,
        "fightModes": fight_modes,
        "acts": acts,
        "events": events,
        "crossroads": crossroads,
        "pools": pools,
        "difficultyModifiers": norm(BAL.get("difficultyModifiers", []), "difficulty"),
        "aoe": build_aoe(),
        "visuals": build_visuals(),
        "enums": enums,
        "loc": loc,
    }

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    size = os.path.getsize(OUT_JSON)
    print(f"[build] wrote {OUT_JSON} ({size / 1e6:.2f} MB)")

    write_report(data, size, fr_missing, sizes, ys)
    print(f"[build] wrote {OUT_REPORT}")
    return data


def write_report(data, size, fr_missing, sizes, ys):
    L = []
    w = L.append
    w("# game_data.json — build report\n")
    w(f"Generated by `scripts/build_game_data.py` from `re_data/` (game {data['meta']['gameVersion']}).  ")
    w(f"Output size: **{size / 1e6:.2f} MB**.\n")
    w("## Top-level keys\n")
    w("`" + "`, `".join(data.keys()) + "`\n")
    w("## Counts\n")
    w("| Category | Count |\n|---|---:|")
    for k in ("guilds", "classes", "heroes", "specializations", "activeAbilities", "passiveAbilities", "items",
              "relics", "rankModifiers", "statMods", "enemies", "enemyScaling", "stages", "events", "crossroads",
              "aoe", "enums", "loc"):
        w(f"| {k} | {len(data[k])} |")
    for k, v in data["pools"].items():
        w(f"| pools.{k} | {len(v)} |")
    w("")
    st = collections.Counter(s["stageType"] for s in data["stages"].values())
    w(f"Stage types: {dict(st)}  ")
    rar = collections.Counter(i["rarity"] for i in data["items"].values())
    w(f"Item rarities: {dict(rar)}  ")
    rr = collections.Counter(r["rarity"] for r in data["relics"].values())
    w(f"Relic rarities: {dict(rr)}\n")

    w("## Board\n")
    b = data["board"]
    w(f"- width × height = **{b['width']} × {b['height']}** (real data: {dict((f'{k[0]}x{k[1]}', v) for k, v in sizes.items())})")
    w(f"- enemy placement rows observed: {sorted(ys.items())}")
    w(f"- playerRows = {b['playerRows']} (APPROX/inferred), enemyRows = {b['enemyRows']}\n")

    w("## Shop prices (ShopSingleton)\n")
    w("```json\n" + json.dumps(data["shopPrices"], indent=1) + "\n```\n")

    w("## APPROX decisions\n")
    for a in REPORT["approx"]:
        w(f"- {a}")
    w("")
    w("## Notes / known gaps\n")
    for n in REPORT["notes"]:
        w(f"- {n}")
    w(f"- Localization: {len(data['loc'])} keys exported (referenced + all UI.*); "
      f"{fr_missing} have no FR translation (fr omitted → fallback en).")
    w("- Effect objects: every `$type` object also has `type` = short C# class name. Sprite refs inside effects "
      "are resolved to URLs, GameObject/VFX prefab refs are stripped, MonoBehaviour refs become "
      "`{assetRef, pathID}` (resolve AoE refs via `aoe[assetRef]`).")
    w("")
    w("### Effect/condition/action type histogram (top 60)\n")
    for t, n in TYPE_COUNTS.most_common(60):
        w(f"- `{t}` × {n}")
    w("")
    w("## Excluded entries\n")
    for cat, lst in REPORT["excluded"].items():
        w(f"- **{cat}** ({len(lst)}): " + ", ".join(f"{i} `{n}` ({r})" for i, n, r in lst))
    w("")
    w("## Missing sprites\n")
    if not REPORT["missing_sprites"]:
        w("- none")
    for cat, lst in REPORT["missing_sprites"].items():
        w(f"- **{cat}** ({len(lst)}): " + ", ".join(f"{i}:{n}" for i, n in lst[:60]) + (" …" if len(lst) > 60 else ""))
    w("")
    w("## Missing localization\n")
    if not REPORT["missing_loc"]:
        w("- none")
    for cat, lst in REPORT["missing_loc"].items():
        w(f"- **{cat}** ({len(lst)}): " + ", ".join(f"{i}.{f}" for i, f in lst[:80]) + (" …" if len(lst) > 80 else ""))
    w("")
    w("## Unresolved references\n")
    if not REPORT["unresolved_refs"]:
        w("- none")
    for cat, lst in REPORT["unresolved_refs"].items():
        s = ", ".join(str(x) for x in lst[:60])
        w(f"- **{cat}** ({len(lst)}): {s}" + (" …" if len(lst) > 60 else ""))
    w("")
    with open(OUT_REPORT, "w", encoding="utf-8") as f:
        f.write("\n".join(L))


if __name__ == "__main__":
    main()

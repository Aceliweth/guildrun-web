import os, sys, json, struct
sys.path.insert(0, "scripts")
from agent4_extract_balancing import (
    DATA_DIR, META_PATH, GA_PATH, extract_localization, Il2CppMetadataResolver,
    parse_serialized_file, read_aligned_str, NAMED_CLASS_IDS
)
from collections import defaultdict

# Convert gamerun_ui_controllers.txt to utf8 if needed
ctrl_p = "re_data/gamerun_ui_controllers.txt"
if os.path.exists(ctrl_p):
    raw = open(ctrl_p, "rb").read()
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        txt = raw.decode("utf-16")
    else:
        txt = raw.decode("utf-8", errors="replace")
    open("re_data/gamerun_ui_controllers_utf8.txt", "w", encoding="utf-8").write(txt)

loca_data = extract_localization()
resolver = Il2CppMetadataResolver(META_PATH, GA_PATH, loca_data)

# Discover all level* and sharedassets* files
all_files = ["globalgamemanagers", "globalgamemanagers.assets", "resources.assets"]
for i in range(25):
    if os.path.exists(os.path.join(DATA_DIR, f"sharedassets{i}.assets")):
        all_files.append(f"sharedassets{i}.assets")
    if os.path.exists(os.path.join(DATA_DIR, f"level{i}")):
        all_files.append(f"level{i}")

parsed_files = {}
monoscripts = defaultdict(dict)
asset_names = defaultdict(dict)

for fn in all_files:
    p = os.path.join(DATA_DIR, fn)
    if not os.path.exists(p): continue
    try:
        data, d_off, types, objs, exts = parse_serialized_file(p)
    except Exception as e:
        continue
    parsed_files[fn.lower()] = (data, d_off, types, objs, exts)
    for pid, bstart, bsize, tid in objs:
        cid = types[tid][0]
        off = d_off + bstart
        if cid == 115:
            name, s_off = read_aligned_str(data, off)
            s_off += 20
            cn, s_off = read_aligned_str(data, s_off)
            ns, s_off = read_aligned_str(data, s_off)
            asm, s_off = read_aligned_str(data, s_off)
            full_cname = f"{ns}.{cn}" if ns else cn
            monoscripts[fn.lower()][pid] = {"fullClassName": full_cname, "name": name}
            asset_names[fn.lower()][pid] = {"name": full_cname, "type": "MonoScript"}
        elif cid == 1:
            nc = struct.unpack_from("<i", data, off)[0]
            name, _ = read_aligned_str(data, off + 4 + nc * 12 + 4)
            asset_names[fn.lower()][pid] = {"name": name, "type": "GameObject"}
        elif cid in NAMED_CLASS_IDS or cid in (28, 213, 43, 21, 48):
            try:
                name, _ = read_aligned_str(data, off)
                asset_names[fn.lower()][pid] = {"name": name, "type": NAMED_CLASS_IDS.get(cid, f"CID_{cid}")}
            except Exception:
                pass

def inspect_scene_or_asset(fn, target_roots=None, max_depth=9):
    fn = fn.lower()
    if fn not in parsed_files: return []
    data, d_off, types, objs, exts = parsed_files[fn]
    def resolve_pptr(fid, p_id, cur_fn=fn, cur_exts=exts):
        target_fn = cur_fn if fid == 0 else (cur_exts[fid - 1].lower() if 0 < fid <= len(cur_exts) else "?")
        info = asset_names.get(target_fn, {}).get(p_id)
        return {"name": info["name"], "type": info["type"], "file": target_fn, "pathID": p_id} if info else {"file": target_fn, "pathID": p_id}
    resolver.pptr_resolver = resolve_pptr

    gos = {}
    transforms = {}
    go_mbs = defaultdict(list)

    for pid, bstart, bsize, tid in objs:
        cid = types[tid][0]
        off = d_off + bstart
        if cid == 1: # GameObject
            nc = struct.unpack_from("<i", data, off)[0]
            comps = []
            pos = off + 4
            for _ in range(nc):
                cfid, cpid = struct.unpack_from("<iq", data, pos)
                comps.append((cfid, cpid))
                pos += 12
            layer = struct.unpack_from("<I", data, pos)[0]
            name, pos = read_aligned_str(data, pos + 4)
            tag, act = struct.unpack_from("<HB", data, pos)
            gos[pid] = {"name": name, "active": bool(act), "comps": comps}
        elif cid in (4, 224): # Transform / RectTransform
            _, go_pid = struct.unpack_from("<iq", data, off)
            rot = struct.unpack_from("<4f", data, off + 12)
            lpos = struct.unpack_from("<3f", data, off + 28)
            scale = struct.unpack_from("<3f", data, off + 40)
            nc = struct.unpack_from("<i", data, off + 52)[0]
            children = []
            pos = off + 56
            for _ in range(nc):
                cfid, cpid = struct.unpack_from("<iq", data, pos)
                children.append(cpid)
                pos += 12
            _, father = struct.unpack_from("<iq", data, pos)
            pos += 12
            rt_info = None
            if cid == 224 and pos + 40 <= off + bsize:
                amin = struct.unpack_from("<2f", data, pos)
                amax = struct.unpack_from("<2f", data, pos + 8)
                apos = struct.unpack_from("<2f", data, pos + 16)
                sdelta = struct.unpack_from("<2f", data, pos + 24)
                pivot = struct.unpack_from("<2f", data, pos + 32)
                rt_info = {"amin": amin, "amax": amax, "apos": apos, "sdelta": sdelta, "pivot": pivot}
            transforms[pid] = {
                "go": go_pid, "father": father, "children": children,
                "lpos": lpos, "scale": scale, "rt": rt_info
            }
        elif cid == 114: # MonoBehaviour
            _, go_pid = struct.unpack_from("<iq", data, off)
            enabled = struct.unpack_from("<B", data, off + 12)[0]
            sc_fid, sc_pid = struct.unpack_from("<iq", data, off + 16)
            target_fn = fn if sc_fid == 0 else (exts[sc_fid - 1].lower() if 0 < sc_fid <= len(exts) else "?")
            cname = monoscripts.get(target_fn, {}).get(sc_pid, {}).get("fullClassName", f"Script_{sc_fid}_{sc_pid}")
            _, p_off = read_aligned_str(data, off + 28)
            mb_summary = cname.split(".")[-1]
            if cname == "UnityEngine.UI.Image":
                try:
                    des = resolver.deserialize_monobehaviour(data, p_off, off + bsize, cname)
                    sp = des.get("m_Sprite", {})
                    sp_name = sp.get("name", "") if isinstance(sp, dict) else ""
                    col = des.get("m_Color", {})
                    if isinstance(col, dict) and "r" in col:
                        c_str = f"rgba({int(col['r']*255)},{int(col['g']*255)},{int(col['b']*255)},{col['a']:.2f})"
                    else:
                        c_str = ""
                    mb_summary = f"Image(sp='{sp_name}', col={c_str})"
                except Exception:
                    pass
            elif cname == "TMPro.TextMeshProUGUI":
                try:
                    des = resolver.deserialize_monobehaviour(data, p_off, off + bsize, cname)
                    txt = (des.get("m_text", "") or "").replace("\n", "\\n")[:40]
                    fs = des.get("m_fontSize", "")
                    col = des.get("m_fontColor", {})
                    c_str = f"#{int(col.get('r',1)*255):02x}{int(col.get('g',1)*255):02x}{int(col.get('b',1)*255):02x}" if isinstance(col, dict) else ""
                    mb_summary = f"TMP(txt='{txt}', sz={fs}, col={c_str})"
                except Exception:
                    pass
            elif "Localizer" in cname or "Controller" in cname or "View" in cname or "Button" in cname:
                mb_summary = f"{cname.split('.')[-1]}(pid={pid})"
            go_mbs[go_pid].append(mb_summary)

    lines = [f"================ {fn} ================"]
    def walk(t_pid, depth=0):
        if depth > max_depth: return
        t = transforms.get(t_pid)
        if not t: return
        go = gos.get(t["go"], {"name": "?", "active": False})
        rt = t["rt"]
        if rt:
            pos_str = f"a=[{rt['amin'][0]:.2f},{rt['amin'][1]:.2f}]..[{rt['amax'][0]:.2f},{rt['amax'][1]:.2f}] pos=[{rt['apos'][0]:.1f},{rt['apos'][1]:.1f}] sz=[{rt['sdelta'][0]:.1f},{rt['sdelta'][1]:.1f}]"
        else:
            pos_str = f"lpos=[{t['lpos'][0]:.2f},{t['lpos'][1]:.2f},{t['lpos'][2]:.2f}]"
        mbs = ", ".join(go_mbs.get(t["go"], []))
        mb_str = f" {{{mbs}}}" if mbs else ""
        lines.append(f"{'  '*depth}- {go['name']} (act={go['active']}, ch={len(t['children'])}) [{pos_str}]{mb_str}")
        for ch_pid in t["children"]:
            walk(ch_pid, depth + 1)

    for t_pid, t in transforms.items():
        go_name = gos.get(t["go"], {}).get("name", "")
        if target_roots:
            if go_name in target_roots:
                walk(t_pid, 0)
        elif t["father"] == 0:
            walk(t_pid, 0)
    return lines

out = []
out.extend(inspect_scene_or_asset("level2", target_roots=["Canvas"], max_depth=8))
out.extend(inspect_scene_or_asset("sharedassets3.assets", target_roots=["CoreGameUI", "CompendiumPanel", "SettingsDetailsPanel", "ComplexTooltip_01", "BasicTooltip"], max_depth=7))
out.extend(inspect_scene_or_asset("level3", target_roots=["Canvas", "EndScreenController", "BattleGrid", "BattleCameraController"], max_depth=8))
for i in range(4, 15):
    if f"level{i}" in parsed_files:
        out.extend(inspect_scene_or_asset(f"level{i}", target_roots=None, max_depth=6))

open("re_data/exact_ui_dump.txt", "w", encoding="utf-8").write("\n".join(out))
print(f"Wrote {len(out)} lines to re_data/exact_ui_dump.txt")

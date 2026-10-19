import os, sys, json, struct
sys.path.insert(0, "scripts")
from agent4_extract_balancing import (
    DATA_DIR, META_PATH, GA_PATH, extract_localization, Il2CppMetadataResolver,
    parse_serialized_file, read_aligned_str, NAMED_CLASS_IDS
)
from collections import defaultdict

loca_data = extract_localization()
resolver = Il2CppMetadataResolver(META_PATH, GA_PATH, loca_data)

asset_files = (
    ["globalgamemanagers", "globalgamemanagers.assets", "resources.assets"]
    + [f"sharedassets{i}.assets" for i in range(22)]
    + [f"level{i}" for i in range(6)]
)
parsed_files = {}
monoscripts = defaultdict(dict)
asset_names = defaultdict(dict)

for fn in asset_files:
    p = os.path.join(DATA_DIR, fn)
    if not os.path.exists(p): continue
    data, d_off, types, objs, exts = parse_serialized_file(p)
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
        elif cid in NAMED_CLASS_IDS:
            try:
                name, _ = read_aligned_str(data, off)
                asset_names[fn.lower()][pid] = {"name": name, "type": NAMED_CLASS_IDS[cid]}
            except Exception:
                pass

for fn in ["level2", "level3", "level4"]:
    data, d_off, types, objs, exts = parsed_files[fn]
    def resolve_pptr(fid, pid, cur_fn=fn, cur_exts=exts):
        target_fn = cur_fn if fid == 0 else (cur_exts[fid - 1] if 0 < fid <= len(cur_exts) else "?")
        info = asset_names.get(target_fn, {}).get(pid)
        return {"name": info["name"], "type": info["type"], "file": target_fn, "pathID": pid} if info else {"file": target_fn, "pathID": pid}
    resolver.pptr_resolver = resolve_pptr
    print(f"================ {fn} ================")
    for pid, bstart, bsize, tid in objs:
        if types[tid][0] != 114: continue
        off = d_off + bstart
        _, go_pid = struct.unpack_from("<iq", data, off)
        sc_fid, sc_pid = struct.unpack_from("<iq", data, off + 16)
        target_fn = fn if sc_fid == 0 else (exts[sc_fid - 1] if 0 < sc_fid <= len(exts) else "?")
        cname = monoscripts.get(target_fn, {}).get(sc_pid, {}).get("fullClassName", "")
        if any(k in cname for k in ("Controller", "Scope", "Installer", "View")):
            go_name = asset_names[fn].get(go_pid, {}).get("name", "?")
            try:
                _, p_off = read_aligned_str(data, off + 28)
                des = resolver.deserialize_monobehaviour(data, p_off, off + bsize, cname)
                print(f"  [{go_name}] {cname}: {json.dumps(des, ensure_ascii=False)[:600]}")
            except Exception as e:
                print(f"  [{go_name}] {cname} (err: {e})")

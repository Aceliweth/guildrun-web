import os, sys, json, struct
sys.path.insert(0, "scripts")
from agent4_extract_balancing import (
    DATA_DIR, META_PATH, GA_PATH, extract_localization, Il2CppMetadataResolver,
    parse_serialized_file, read_aligned_str, NAMED_CLASS_IDS
)
from collections import defaultdict

loca_data = extract_localization()
resolver = Il2CppMetadataResolver(META_PATH, GA_PATH, loca_data)

asset_files = ["globalgamemanagers", "globalgamemanagers.assets", "resources.assets", "sharedassets1.assets", "sharedassets2.assets", "sharedassets3.assets", "level2", "level3"]
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

def dump_mb(fn, pid):
    data, d_off, types, objs, exts = parsed_files[fn]
    def resolve_pptr(fid, p_id, cur_fn=fn, cur_exts=exts):
        target_fn = cur_fn if fid == 0 else (cur_exts[fid - 1] if 0 < fid <= len(cur_exts) else "?")
        info = asset_names.get(target_fn, {}).get(p_id)
        return {"name": info["name"], "type": info["type"], "file": target_fn, "pathID": p_id} if info else {"file": target_fn, "pathID": p_id}
    resolver.pptr_resolver = resolve_pptr
    for p_id, bstart, bsize, tid in objs:
        if p_id == pid and types[tid][0] == 114:
            off = d_off + bstart
            _, go_pid = struct.unpack_from("<iq", data, off)
            sc_fid, sc_pid = struct.unpack_from("<iq", data, off + 16)
            target_fn = fn if sc_fid == 0 else (exts[sc_fid - 1] if 0 < sc_fid <= len(exts) else "?")
            cname = monoscripts.get(target_fn, {}).get(sc_pid, {}).get("fullClassName", "")
            go_name = asset_names[fn].get(go_pid, {}).get("name", "?")
            _, p_off = read_aligned_str(data, off + 28)
            des = resolver.deserialize_monobehaviour(data, p_off, off + bsize, cname)
            print(f"=== {fn}:{pid} [{go_name}] {cname} ===")
            print(json.dumps(des, indent=2, ensure_ascii=False))

# Dump GameRunReferenceHolder (67765) and monoBehaviourControllers in sharedassets3.assets
dump_mb("sharedassets3.assets", 67765)
for mb_pid in [68959, 76945, 77708, 75212, 76467, 65426, 77608, 70425, 70037, 76382, 66923, 77013, 73427, 65481, 74696, 67185, 71605, 69006, 76247, 66772]:
    dump_mb("sharedassets3.assets", mb_pid)

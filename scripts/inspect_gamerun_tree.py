import os, sys, json, struct
sys.path.insert(0, "scripts")
from agent4_extract_balancing import DATA_DIR, parse_serialized_file, read_aligned_str

def dump_file_ui_roots(fn, max_depth=4):
    data, d_off, types, objs, exts = parse_serialized_file(os.path.join(DATA_DIR, fn))
    gos = {}
    trs = {}
    for pid, bstart, bsize, tid in objs:
        cid = types[tid][0]
        off = d_off + bstart
        if cid == 1:
            nc = struct.unpack_from("<i", data, off)[0]
            comps = [struct.unpack_from("<iq", data, off + 4 + k * 12)[1] for k in range(nc)]
            name, s_off = read_aligned_str(data, off + 4 + nc * 12 + 4)
            _, active = struct.unpack_from("<HB", data, s_off)
            gos[pid] = {"name": name, "active": bool(active), "components": comps}
        elif cid in (4, 224):
            _, go_pid = struct.unpack_from("<iq", data, off)
            nch = struct.unpack_from("<i", data, off + 52)[0]
            children = [struct.unpack_from("<iq", data, off + 56 + k * 12)[1] for k in range(nch)]
            _, father_pid = struct.unpack_from("<iq", data, off + 56 + nch * 12)
            rect = None
            if cid == 224:
                r_off = off + 56 + nch * 12 + 12
                amin_x, amin_y, amax_x, amax_y, apos_x, apos_y, sd_x, sd_y, piv_x, piv_y = [
                    round(x, 1) for x in struct.unpack_from("<10f", data, r_off)
                ]
                rect = {
                    "aMin": [amin_x, amin_y],
                    "aMax": [amax_x, amax_y],
                    "pos": [apos_x, apos_y],
                    "size": [sd_x, sd_y],
                }
            trs[pid] = {"goPid": go_pid, "fatherPid": father_pid, "children": children, "rect": rect}

    def count_desc(t_pid):
        tr = trs.get(t_pid)
        if not tr: return 0
        return 1 + sum(count_desc(c) for c in tr["children"])

    def dump_tr(t_pid, depth=0):
        tr = trs.get(t_pid)
        if not tr: return
        go = gos.get(tr["goPid"], {"name": "?"})
        r = tr["rect"]
        r_str = f" [a={r['aMin']}..{r['aMax']} pos={r['pos']} sz={r['size']}]" if r else ""
        print("  " * depth + f"- {go['name']} (act={go.get('active')}, ch={len(tr['children'])}){r_str}")
        if depth < max_depth:
            for c in tr["children"]:
                dump_tr(c, depth + 1)

    print(f"================ {fn} UI ROOTS ================")
    for t_pid, tr in trs.items():
        if tr["fatherPid"] == 0 and count_desc(t_pid) > 15:
            dump_tr(t_pid, 0)

dump_file_ui_roots("level2", 3)
dump_file_ui_roots("sharedassets3.assets", 3)
dump_file_ui_roots("level3", 3)

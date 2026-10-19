import os, sys, struct
sys.path.insert(0, "scripts")
from agent4_extract_balancing import DATA_DIR, parse_serialized_file, read_aligned_str

p = os.path.join(DATA_DIR, "sharedassets1.assets")
data, d_off, types, objs, exts = parse_serialized_file(p)

obj_map = {}
gos = {}
trs = {}
meshes = {}
mats = {}
texs = {}
for pid, bstart, bsize, tid in objs:
    cid = types[tid][0]
    off = d_off + bstart
    obj_map[pid] = (cid, off, bsize)
    if cid == 1:
        nc = struct.unpack_from("<i", data, off)[0]
        comps = [struct.unpack_from("<iq", data, off + 4 + i*12) for i in range(nc)]
        name, _ = read_aligned_str(data, off + 4 + nc*12 + 4)
        tac = struct.unpack_from("<HB", data, off + 4 + nc*12 + 4 + 4 + ((len(name)+3)&~3))
        gos[pid] = (name, comps, bool(tac[1]))
    elif cid == 4:
        go_fid, go_pid = struct.unpack_from("<iq", data, off)
        rot = struct.unpack_from("<4f", data, off+12)
        pos = struct.unpack_from("<3f", data, off+28)
        scl = struct.unpack_from("<3f", data, off+40)
        nc = struct.unpack_from("<i", data, off+52)[0]
        ch = [struct.unpack_from("<iq", data, off+56+i*12)[1] for i in range(nc)]
        f_fid, f_pid = struct.unpack_from("<iq", data, off+56+nc*12)
        trs[pid] = {"go": go_pid, "father": f_pid, "children": ch, "pos": pos, "rot": rot, "scl": scl}
    elif cid == 43:
        n, _ = read_aligned_str(data, off)
        meshes[pid] = n
    elif cid == 21:
        n, _ = read_aligned_str(data, off)
        mats[pid] = n
    elif cid == 28:
        n, _ = read_aligned_str(data, off)
        texs[pid] = n

HERO_PREFABS = {
    1: "Irini", 2: "HoYoung", 3: "Reyna", 4: "Ayaka", 5: "Selkhera",
    6: "Seraphael", 7: "Nyxa", 8: "Floeria", 9: "Niklas", 10: "Fiona",
    11: "Rook", 12: "Skorn", 13: "Logan", 14: "Funke", 15: "Tilly",
    16: "Gustav", 17: "Ratna", 18: "Cenk", 20: "Javryn", 21: "Ming",
    22: "Pimenta", 23: "Sal", 24: "Dragomir", 26: "Joey", 27: "Josephina"
}
ENEMY_PREFABS = {
    "Demon": "DemonBoss", "Fire Dragon": "Dragon_Fire", "Forest Golem": "ForestGolem",
    "Frost Dragon": "Dragon_Frost", "Hydra": "Hydra", "Lizard": "Lizard",
    "Mushroom Archer": "MushroomArcher", "Mushroom Fire Mage": "MushroomMage_Fire",
    "Mushroom Frost Mage": "MushroomMage_Ice", "Mushroom Knight": "MushroomTank",
    "Mushroom Tank": "MushroomTank", "Plant Monster": "PlantMonster",
    "Poison Dragon": "Dragon_Poison", "Slime": "Slime", "Snake": "Snake",
    "Spider": "Spider", "Turtle": "Turtle", "Crab": "Crab"
}
all_prefab_names = sorted(set(list(HERO_PREFABS.values()) + list(ENEMY_PREFABS.values())))
root_by_name = {}
for tp, t in trs.items():
    if t["father"] == 0 and len(t["children"]) >= 3:
        gn = gos.get(t["go"], ("?",))[0]
        if gn in all_prefab_names:
            root_by_name[gn] = tp

def parse_material_info(mat_pid):
    if mat_pid not in obj_map: return None
    _, off, bsize = obj_map[mat_pid]
    mname, _ = read_aligned_str(data, off)
    tex_props = {}
    for k in range(0, bsize - 28, 4):
        fid, rpid = struct.unpack_from("<iq", data, off + k)
        if fid == 0 and rpid in texs and rpid != 0:
            prop_name = "?"
            for back in range(4, min(64, k), 4):
                slen = struct.unpack_from("<I", data, off + k - back)[0]
                if 1 <= slen <= 48 and ((slen + 3) & ~3) + 4 == back:
                    sbytes = data[off + k - back + 4 : off + k - back + 4 + slen]
                    if all(32 <= b < 127 for b in sbytes):
                        prop_name = sbytes.decode("ascii")
                        break
            tex_props[prop_name] = (rpid, texs[rpid])
    return mname, tex_props

seen_mats = set()
for name in all_prefab_names:
    tp = root_by_name[name]
    def w(p_id):
        tr = trs[p_id]
        gn, cmps, act = gos.get(tr["go"], ("?", [], True))
        if not act: return
        for cfid, cpid in cmps:
            if cfid != 0: continue
            cid, off, bsize = obj_map.get(cpid, (0,0,0))
            if cid == 137:
                mc = struct.unpack_from("<I", data, off + 72)[0]
                mpos = off + 76 + mc * 12 + 56
                mfid, mpid = struct.unpack_from("<iq", data, mpos)
                if mpid in obj_map:
                    _, m_off, _ = obj_map[mpid]
                    _, mp = read_aligned_str(data, m_off)
                    num_sub = struct.unpack_from("<I", data, mp)[0]
                else:
                    num_sub = 1
                for s in range(min(mc, num_sub)):
                    mat_pid = struct.unpack_from("<iq", data, off + 76 + s * 12)[1]
                    if mat_pid not in seen_mats:
                        seen_mats.add(mat_pid)
                        print(f"  [{name}] sub={s}/{num_sub} Mat {mat_pid}: {parse_material_info(mat_pid)}")
        for c in tr["children"]: w(c)
    w(tp)

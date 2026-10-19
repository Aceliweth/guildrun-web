#!/usr/bin/env python3
"""
Extract all 42 3D Hero & Monster models (SkinnedMeshRenderers, static MeshFilters,
512x512 Albedo Textures, Skeletons, BindPoses, and 5 Skeletal AnimationClips:
idle, move, attack, skill, death) from sharedassets1.assets + sharedassets1.assets.resS
into public/assets/models/ for real-time WebGL2 3D rendering in the browser.
"""

import os
import sys
import json
import math
import zlib
import struct
import time
import numpy as np
from PIL import Image

sys.path.insert(0, "scripts")
from agent4_extract_balancing import DATA_DIR, parse_serialized_file, read_aligned_str

OUT_DIR = r"c:\Users\Aceliweth\Downloads\rea\guildrun-web\public\assets\models"
TEX_DIR = os.path.join(OUT_DIR, "textures")
os.makedirs(TEX_DIR, exist_ok=True)

HERO_PREFABS = {
    1: "Irini", 2: "HoYoung", 3: "Reyna", 4: "Ayaka", 5: "Selkhera",
    6: "Seraphael", 7: "Nyxa", 8: "Floeria", 9: "Niklas", 10: "Fiona",
    11: "Rook", 12: "Skorn", 13: "Logan", 14: "Funke", 15: "Tilly",
    16: "Gustav", 17: "Ratna", 18: "Cenk", 20: "Javryn", 21: "Ming",
    22: "Pimenta", 23: "Sal", 24: "Dragomir", 26: "Joey", 27: "Josephina"
}

ENEMY_PREFABS = {
    "Demon": "DemonBoss",
    "Fire Dragon": "Dragon_Fire",
    "Forest Golem": "ForestGolem",
    "Frost Dragon": "Dragon_Frost",
    "Hydra": "Hydra",
    "Lizard": "Lizard",
    "Mushroom Archer": "MushroomArcher",
    "Mushroom Fire Mage": "MushroomMage_Fire",
    "Mushroom Frost Mage": "MushroomMage_Ice",
    "Mushroom Knight": "MushroomTank",
    "Mushroom Tank": "MushroomTank",
    "Plant Monster": "PlantMonster",
    "Poison Dragon": "Dragon_Poison",
    "Slime": "Slime",
    "Snake": "Snake",
    "Spider": "Spider",
    "Turtle": "Turtle",
    "Crab": "Crab"
}

t0_all = time.time()
p = os.path.join(DATA_DIR, "sharedassets1.assets")
ress_path = os.path.join(DATA_DIR, "sharedassets1.assets.resS")
data, d_off, types, objs, exts = parse_serialized_file(p)
ress_fp = open(ress_path, "rb")

obj_map = {}
gos = {}
trs = {}
meshes = {}
mats = {}
texs = {}
clips = {}

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
    elif cid == 74:
        n, _ = read_aligned_str(data, off)
        clips[pid] = n

def trs_matrix(pos, rot, scl):
    x, y, z, w = rot
    n = math.sqrt(x*x + y*y + z*z + w*w)
    if n > 0:
        x, y, z, w = x/n, y/n, z/n, w/n
    xx, yy, zz = x*x, y*y, z*z
    xy, xz, yz = x*y, x*z, y*z
    wx, wy, wz = w*x, w*y, w*z
    sx, sy, sz = scl
    return np.array([
        [(1.0 - 2.0*(yy + zz))*sx, (2.0*(xy - wz))*sy,       (2.0*(xz + wy))*sz,       pos[0]],
        [(2.0*(xy + wz))*sx,       (1.0 - 2.0*(xx + zz))*sy, (2.0*(yz - wx))*sz,       pos[1]],
        [(2.0*(xz - wy))*sx,       (2.0*(yz + wx))*sy,       (1.0 - 2.0*(xx + yy))*sz, pos[2]],
        [0.0,                      0.0,                      0.0,                      1.0]
    ], dtype=np.float32)

mesh_cache = {}
def parse_mesh(pid):
    if pid in mesh_cache:
        return mesh_cache[pid]
    if pid not in obj_map:
        return None
    _, off, bsize = obj_map[pid]
    name, pos = read_aligned_str(data, off)
    num_sub = struct.unpack_from("<I", data, pos)[0]
    pos += 4
    submeshes = []
    for _ in range(num_sub):
        fb, ic, topo, bv, fv, vc = struct.unpack_from("<6I", data, pos)
        submeshes.append({"firstByte": fb, "indexCount": ic, "topology": topo, "baseVertex": bv, "firstVertex": fv, "vertexCount": vc})
        pos += 48
    for _ in range(4):
        sz = struct.unpack_from("<I", data, pos)[0]
        pos += 4
        if sz != 0:
            return None
    num_bp = struct.unpack_from("<I", data, pos)[0]
    pos += 4
    bindposes = np.frombuffer(data, dtype=np.float32, count=num_bp*16, offset=pos).reshape((num_bp, 4, 4)).copy()
    pos += num_bp * 64
    num_bnh = struct.unpack_from("<I", data, pos)[0]
    pos += 4 + num_bnh * 4 + 4
    num_bones_aabb = struct.unpack_from("<I", data, pos)[0]
    pos += 4 + num_bones_aabb * 24
    var_bone_cnt = struct.unpack_from("<I", data, pos)[0]
    pos += 4 + var_bone_cnt * 4
    comp, is_read, keep_v, keep_i, idx_fmt, idx_bytes = struct.unpack_from("<BBBBiI", data, pos)
    pos += 12
    idx_dtype = np.uint16 if idx_fmt == 0 else np.uint32
    sub_indices = []
    for sm in submeshes:
        arr = np.frombuffer(data, dtype=idx_dtype, count=sm["indexCount"], offset=pos + sm["firstByte"]).astype(np.uint16)
        if sm["baseVertex"] != 0:
            arr = (arr.astype(np.int32) + sm["baseVertex"]).astype(np.uint16)
        sub_indices.append(arr.copy())
    pos += idx_bytes
    if pos % 4:
        pos += 4 - (pos % 4)
    v_cnt, ch_cnt = struct.unpack_from("<II", data, pos)
    pos += 8
    channels = []
    for _ in range(ch_cnt):
        st, off_c, fmt_c, dim_c = struct.unpack_from("<BBBB", data, pos)
        channels.append((st, off_c, fmt_c, dim_c & 0xf))
        pos += 4
    v_data_sz = struct.unpack_from("<I", data, pos)[0]
    pos += 4
    v_buf = data[pos : pos + v_data_sz]
    fmt_sizes = {0: 4, 1: 2, 2: 1, 3: 1, 4: 2, 5: 2, 6: 1, 7: 1, 8: 2, 9: 2, 10: 4, 11: 4}
    stream_strides = [0, 0, 0, 0]
    for st, off_c, fmt_c, dim_c in channels:
        if dim_c > 0:
            end_c = off_c + dim_c * fmt_sizes.get(fmt_c, 4)
            if end_c > stream_strides[st]:
                stream_strides[st] = end_c
    stream_offsets = [0, 0, 0, 0]
    cur = 0
    for s in range(4):
        stream_offsets[s] = cur
        if stream_strides[s] > 0:
            sz = v_cnt * stream_strides[s]
            if sz % 16:
                sz += 16 - (sz % 16)
            cur += sz
    def read_ch(ch_idx, target_dtype=np.float32):
        if ch_idx >= len(channels):
            return None
        st, off_c, fmt_c, dim_c = channels[ch_idx]
        if dim_c == 0:
            return None
        raw_dtype = np.float16 if fmt_c == 1 else (np.uint8 if fmt_c in (2, 3, 6, 7) else (np.uint16 if fmt_c in (4, 5, 8, 9) else target_dtype))
        stride = stream_strides[st]
        base = stream_offsets[st] + off_c
        if base + (v_cnt - 1) * stride + dim_c * np.dtype(raw_dtype).itemsize > len(v_buf):
            return None
        arr = np.ndarray((v_cnt, dim_c), dtype=raw_dtype, buffer=v_buf, offset=base, strides=(stride, np.dtype(raw_dtype).itemsize)).copy()
        return arr.astype(target_dtype)

    positions = read_ch(0, np.float32)
    if positions is None:
        return None
    normals = read_ch(1, np.float32)
    if normals is None:
        normals = np.zeros_like(positions)
        normals[:, 1] = 1.0
    uvs = read_ch(4, np.float32)
    if uvs is None:
        uvs = np.zeros((v_cnt, 2), dtype=np.float32)
    weights = read_ch(12, np.float32)
    bone_idx = read_ch(13, np.int32)

    # Normalize weights/bone_idx to 4 columns
    w4 = np.zeros((v_cnt, 4), dtype=np.float32)
    b4 = np.zeros((v_cnt, 4), dtype=np.uint16)
    if weights is not None and bone_idx is not None:
        cols = min(4, weights.shape[1], bone_idx.shape[1])
        w4[:, :cols] = weights[:, :cols]
        b4[:, :cols] = np.clip(bone_idx[:, :cols], 0, max(0, num_bp - 1)).astype(np.uint16)
        wsum = w4.sum(axis=1, keepdims=True)
        wsum[wsum == 0] = 1.0
        w4 /= wsum
    else:
        w4[:, 0] = 1.0

    res = {
        "name": name, "v_cnt": v_cnt, "sub_indices": sub_indices,
        "positions": positions, "normals": normals, "uvs": uvs,
        "weights": w4, "bone_idx": b4, "bindposes": bindposes
    }
    mesh_cache[pid] = res
    return res

extracted_textures = {}
def extract_material_texture(mat_pid):
    if mat_pid not in obj_map:
        return None
    _, off, bsize = obj_map[mat_pid]
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
            tex_props[prop_name] = rpid
    tex_pid = tex_props.get("_BaseMap") or tex_props.get("_BaseColorMap") or tex_props.get("_MainTex")
    if not tex_pid:
        return None
    if tex_pid in extracted_textures:
        return extracted_textures[tex_pid]
    _, toff, tbsize = obj_map[tex_pid]
    tname, pos = read_aligned_str(data, toff)
    safe_name = "".join(c if c.isalnum() or c in "_-" else "_" for c in tname) + ".png"
    out_url = f"/assets/models/textures/{safe_name}"
    out_path = os.path.join(TEX_DIR, safe_name)
    if not os.path.exists(out_path):
        w, h, complete_sz, mips_stripped, tex_fmt, mip_cnt = struct.unpack_from("<6I", data, pos + 4)
        idx = data.rfind(b"sharedassets1.assets.resS", toff, toff + tbsize)
        if idx != -1 and tex_fmt in (10, 12, 25):
            s_off, s_sz = struct.unpack_from("<QI", data, idx - 16)
            bcn_mode = {10: 1, 12: 3, 25: 7}[tex_fmt]
            bpp_num = 1 if tex_fmt == 10 else 2
            mip_off = 0
            mw, mh = w, h
            while mw > 512 and mh > 512 and mip_cnt > 1:
                mip_off += (mw * mh * bpp_num) // 2
                mw //= 2
                mh //= 2
            mip_bytes = (mw * mh * bpp_num) // 2
            ress_fp.seek(s_off + mip_off)
            raw = ress_fp.read(mip_bytes)
            img = Image.frombytes("RGBA", (mw, mh), raw, "bcn", (bcn_mode,)).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
            img.save(out_path, "PNG", optimize=False)
    extracted_textures[tex_pid] = out_url
    return out_url

clip_cache = {}
def parse_clip(pid):
    if pid in clip_cache:
        return clip_cache[pid]
    if pid not in obj_map:
        return None
    _, off, bsize = obj_map[pid]
    end = off + bsize
    n, pos = read_aligned_str(data, off)
    sample_rate = struct.unpack_from("<f", data, pos + 32)[0]
    m_size = struct.unpack_from("<I", data, pos + 64)[0]
    mc_start = pos + 68
    sc_pos = mc_start + 1260
    sc_words = struct.unpack_from("<I", data, sc_pos)[0]
    sc_buf = data[sc_pos + 4 : sc_pos + 4 + sc_words * 4]
    sc_end = sc_pos + 4 + sc_words * 4
    sc_curve_cnt = struct.unpack_from("<I", data, sc_end)[0]
    dc_pos = sc_end + 4
    dc_frames, dc_curves, dc_rate, dc_begin, dc_samples_cnt = struct.unpack_from("<iIffI", data, dc_pos)
    dc_samples = np.frombuffer(data, dtype=np.float32, count=dc_samples_cnt, offset=dc_pos + 20)
    cc_pos = dc_pos + 20 + dc_samples_cnt * 4
    cc_cnt = struct.unpack_from("<I", data, cc_pos)[0]
    cc_data = np.frombuffer(data, dtype=np.float32, count=cc_cnt, offset=cc_pos + 4)
    after_cc = cc_pos + 4 + cc_cnt * 4
    vac_cnt = struct.unpack_from("<I", data, after_cc)[0]
    p2 = after_cc + 4 + vac_cnt * 16
    stop_time = struct.unpack_from("<f", data, p2)[0]
    bindings = []
    total_curves = sc_curve_cnt + dc_curves + cc_cnt

    def read_table(k, cnt):
        out, c_idx = [], 0
        for b in range(cnt):
            b_path, b_attr, s_fid, s_pid, b_tid, b_ct = struct.unpack_from("<IIiqiI", data, k + 4 + b * 28)
            if not (0 < b_tid < 2000) or not (0 <= s_fid < 64):
                return None, -1
            is_pptr = (b_ct >> 8) & 0xFF
            if b_tid == 4:
                dims = 4 if b_attr == 2 else (3 if b_attr in (1, 3, 4) else 1)
            else:
                dims = 0 if is_pptr else 1
            # Only Transform curves drive bones; other bindings (blend shapes, scripts...) just consume curves.
            out.append((b_path if b_tid == 4 else 0xFFFFFFFF, b_attr if b_tid == 4 else 0, c_idx, dims))
            c_idx += dims
        return out, c_idx

    fallback = None
    for k in range(p2, end - 28, 4):
        cnt = struct.unpack_from("<I", data, k)[0]
        if 1 <= cnt <= 1200 and k + 4 + cnt * 28 <= end:
            tbl, n_curves = read_table(k, cnt)
            if tbl is None:
                continue
            if n_curves == total_curves and total_curves > 0:
                bindings = tbl
                break
            tid0 = struct.unpack_from("<I", data, k + 4 + 20)[0]
            if fallback is None and tid0 == 4:
                fallback = tbl
    if not bindings and fallback:
        bindings = fallback
    sc_frames = []
    sp = 0
    slen = len(sc_buf)
    max_sc_t = 0.0
    while sp + 8 <= slen:
        t_val, n_keys = struct.unpack_from("<fI", sc_buf, sp)
        sp += 8
        if sp + n_keys * 20 > slen:
            break
        if 0.0 < t_val < 100.0 and t_val > max_sc_t:
            max_sc_t = t_val
        keys = []
        for _ in range(n_keys):
            c_i, c0, c1, c2, v0 = struct.unpack_from("<I4f", sc_buf, sp)
            keys.append((c_i, c0, c1, c2, v0))
            sp += 20
        sc_frames.append((t_val, keys))
    dur = stop_time if 0.05 < stop_time < 30.0 else (max_sc_t if max_sc_t > 0.05 else 1.0)
    res = {
        "name": n, "duration": float(dur), "sample_rate": float(sample_rate),
        "sc_curve_cnt": sc_curve_cnt, "sc_frames": sc_frames,
        "dc_frames": dc_frames, "dc_curves": dc_curves, "dc_rate": dc_rate, "dc_begin": dc_begin, "dc_samples": dc_samples,
        "cc_cnt": cc_cnt, "cc_data": cc_data,
        "bindings": bindings
    }
    clip_cache[pid] = res
    return res

def evaluate_clip(clip, t):
    total_curves = clip["sc_curve_cnt"] + clip["dc_curves"] + clip["cc_cnt"]
    vals = np.zeros(total_curves, dtype=np.float32)
    last_t = {}
    last_k = {}
    for ft, keys in clip["sc_frames"]:
        if ft <= t + 1e-5 or ft < -1e20:
            real_t = 0.0 if ft < -1e20 else ft
            for c_i, c0, c1, c2, v0 in keys:
                if c_i < total_curves:
                    last_t[c_i] = real_t
                    last_k[c_i] = (c0, c1, c2, v0)
        else:
            break
    for c_i, (c0, c1, c2, v0) in last_k.items():
        dt = max(0.0, t - last_t[c_i])
        vals[c_i] = v0 + dt * (c2 + dt * (c1 + dt * c0))
    if clip["dc_curves"] > 0 and clip["dc_frames"] > 0:
        f_float = max(0.0, (t - clip["dc_begin"]) * clip["dc_rate"])
        f0 = min(int(f_float), clip["dc_frames"] - 1)
        f1 = min(f0 + 1, clip["dc_frames"] - 1)
        alpha = f_float - f0
        nc = clip["dc_curves"]
        base = clip["sc_curve_cnt"]
        s0 = clip["dc_samples"][f0 * nc : (f0 + 1) * nc]
        s1 = clip["dc_samples"][f1 * nc : (f1 + 1) * nc]
        vals[base : base + nc] = s0 * (1.0 - alpha) + s1 * alpha
    if clip["cc_cnt"] > 0:
        base = clip["sc_curve_cnt"] + clip["dc_curves"]
        vals[base : base + clip["cc_cnt"]] = clip["cc_data"]
    return vals

def resolve_controller_clips(ctrl_pid):
    """Return dict {'idle': pid, 'move': pid, 'attack': pid, 'skill': pid, 'death': pid}."""
    if ctrl_pid not in obj_map:
        return {}
    cid, off, bsize = obj_map[ctrl_pid]
    out = {}
    if cid == 221: # AnimatorOverrideController
        _, pos = read_aligned_str(data, off)
        pos += 12
        cnt = struct.unpack_from("<I", data, pos)[0]
        pos += 4
        for _ in range(cnt):
            ofid, opid, vfid, vpid = struct.unpack_from("<iqiq", data, pos)
            pos += 24
            oname = clips.get(opid, "")
            if DBG_MODEL[0]:
                print("   override:", oname, "->", clips.get(vpid, vpid))
            if vpid == 0:
                vpid = opid
            if "Idle" in oname:
                out["idle"] = vpid
            elif "Move" in oname:
                out["move"] = vpid
            elif "BasicAttack" in oname:
                out["attack"] = vpid
            elif "SkillAttack" in oname:
                out["skill"] = vpid
            elif "Die" in oname:
                out["death"] = vpid
    elif cid == 91: # AnimatorController (Hydra 3252, Irini 3254, Nyxa 3256, Seraphael 3257)
        c_refs = []
        for k in range(0, bsize - 12, 4):
            fid, rpid = struct.unpack_from("<iq", data, off + k)
            if fid == 0 and rpid in clips:
                c_refs.append((rpid, clips[rpid]))
        for rpid, cname in c_refs:
            cl = cname.lower()
            if "idle" in cl:
                out["idle"] = rpid
            elif "moveloop" in cl or "forward" in cl:
                out["move"] = rpid
            elif "basicattack" in cl or "attack02" in cl:
                out["attack"] = rpid
            elif "activeability" in cl or "comboattack" in cl or "attack03" in cl:
                out["skill"] = rpid
            elif "die" in cl or "death" in cl:
                out["death"] = rpid
        if DBG_MODEL[0]:
            print("   controller91 clips:", [n for _, n in c_refs])
    if DBG_MODEL[0]:
        print("   resolved:", {k: clips.get(v, v) for k, v in out.items()}, "cid", cid)
    return out

all_prefab_names = sorted(set(list(HERO_PREFABS.values()) + list(ENEMY_PREFABS.values())))
root_by_name = {}
for tp, t in trs.items():
    if t["father"] == 0 and len(t["children"]) >= 3:
        gn = gos.get(t["go"], ("?",))[0]
        if gn in all_prefab_names:
            root_by_name[gn] = tp

manifest_models = {}
DBG_MODEL = [False]

for name in all_prefab_names:
    root_tp = root_by_name[name]
    DBG_MODEL[0] = name in os.environ.get("DEBUG_CLIPS", "").split(",")
    if DBG_MODEL[0]:
        print("== DEBUG", name)
    st = {"anim_tr": root_tp, "anim_ctrl": None, "smrs": [], "mfs": []}
    def walk_prefab(p_id):
        tr = trs[p_id]
        gn, cmps, act = gos.get(tr["go"], ("?", [], True))
        if not act:
            return
        # Skip VFX, substitution dummy props, and collider/cloth children
        if any(skip in gn for skip in ("VFX", "Collider", "Cloth", "LogDummy", "GrapplingHook")):
            return
        for cfid, cpid in cmps:
            if cfid != 0:
                continue
            cid, off, bsize = obj_map.get(cpid, (0, 0, 0))
            if cid == 95:
                st["anim_tr"] = p_id
                _, ctrl_pid = struct.unpack_from("<iq", data, off + 28)
                st["anim_ctrl"] = ctrl_pid
            elif cid == 137:
                mc = struct.unpack_from("<I", data, off + 72)[0]
                mat_pids = [struct.unpack_from("<iq", data, off + 76 + s * 12)[1] for s in range(mc)]
                mpos = off + 76 + mc * 12 + 56
                _, mpid = struct.unpack_from("<iq", data, mpos)
                nb = struct.unpack_from("<I", data, mpos + 12)[0]
                bpids = [struct.unpack_from("<iq", data, mpos + 16 + i * 12)[1] for i in range(nb)]
                st["smrs"].append((p_id, cpid, mpid, mat_pids, bpids))
            elif cid == 33:
                _, mpid = struct.unpack_from("<iq", data, off + 12)
                # Find MeshRenderer on same GameObject
                mat_pid = 0
                for cf2, cp2 in cmps:
                    if cf2 == 0 and obj_map.get(cp2, (0,0,0))[0] == 23:
                        _, mroff, _ = obj_map[cp2]
                        mc2 = struct.unpack_from("<I", data, mroff + 72)[0]
                        if mc2 > 0:
                            mat_pid = struct.unpack_from("<iq", data, mroff + 76)[1]
                st["mfs"].append((p_id, mpid, mat_pid))
        for c in tr["children"]:
            walk_prefab(c)
    walk_prefab(root_tp)

    anim_tr = st["anim_tr"]

    def build_crc_map(root):
        cmap = {0: root}
        order = [root]
        def rec(tp, pref=""):
            for c in trs[tp]["children"]:
                order.append(c)
                gn = gos.get(trs[c]["go"], ("",))[0]
                rel = f"{pref}/{gn}" if pref else gn
                cmap[zlib.crc32(rel.encode("utf-8")) & 0xffffffff] = c
                rec(c, rel)
        rec(root)
        return cmap, order

    crc_to_tr, all_trs = build_crc_map(anim_tr)

    # Build unified bone palette across all SMRs and MFs of this prefab
    # Each entry in bone_palette is (transform_pid, bindpose_4x4)
    bone_palette = []
    submesh_records = []
    bin_chunks = []
    bin_state = {"offset": 0}

    def add_bin(arr_bytes):
        pad = (4 - (len(arr_bytes) % 4)) % 4
        chunk = arr_bytes + (b"\x00" * pad)
        off = bin_state["offset"]
        bin_chunks.append(chunk)
        bin_state["offset"] += len(chunk)
        return off, len(arr_bytes)

    min_bbox = np.array([1e9, 1e9, 1e9], dtype=np.float32)
    max_bbox = np.array([-1e9, -1e9, -1e9], dtype=np.float32)

    for tr_pid, cpid, mpid, mat_pids, bpids in st["smrs"]:
        m = parse_mesh(mpid)
        if not m:
            continue
        nb = len(bpids)
        # Find which bones in 0..nb-1 are used by this mesh
        used_local = np.unique(m["bone_idx"][m["weights"] > 0.0005]) if nb > 0 else np.array([0], dtype=np.uint16)
        local_to_global = np.zeros(max(1, nb), dtype=np.uint16)
        for lb in used_local:
            lb_i = int(lb)
            if lb_i < nb and lb_i < len(m["bindposes"]):
                g_idx = len(bone_palette)
                bone_palette.append((bpids[lb_i], m["bindposes"][lb_i]))
                local_to_global[lb_i] = g_idx
        if len(bone_palette) == 0:
            bone_palette.append((tr_pid, np.eye(4, dtype=np.float32)))

        remapped_b4 = local_to_global[np.clip(m["bone_idx"], 0, max(0, nb - 1))].astype(np.uint16)

        # Interleave vertex float attributes: pos(3) + norm(3) + uv(2) + weights(4) = 12 floats (48 bytes) per vertex
        v_floats = np.hstack([m["positions"], m["normals"], m["uvs"], m["weights"]]).astype(np.float32)
        v_off, _ = add_bin(v_floats.tobytes())
        b_off, _ = add_bin(remapped_b4.tobytes())

        for s_idx, idx_arr in enumerate(m["sub_indices"]):
            if len(idx_arr) == 0:
                continue
            mat_pid = mat_pids[s_idx] if s_idx < len(mat_pids) else (mat_pids[0] if mat_pids else 0)
            tex_url = extract_material_texture(mat_pid)
            i_off, _ = add_bin(idx_arr.tobytes())
            submesh_records.append({
                "vCount": int(m["v_cnt"]),
                "vOffset": v_off,
                "bOffset": b_off,
                "iCount": int(len(idx_arr)),
                "iOffset": i_off,
                "texture": tex_url
            })

    # Also include static MeshFilter attachments (like MushroomMage's Staff)
    for tr_pid, mpid, mat_pid in st["mfs"]:
        m = parse_mesh(mpid)
        if not m:
            continue
        g_idx = len(bone_palette)
        bone_palette.append((tr_pid, np.eye(4, dtype=np.float32)))
        w4 = np.zeros((m["v_cnt"], 4), dtype=np.float32)
        w4[:, 0] = 1.0
        b4 = np.full((m["v_cnt"], 4), g_idx, dtype=np.uint16)
        v_floats = np.hstack([m["positions"], m["normals"], m["uvs"], w4]).astype(np.float32)
        v_off, _ = add_bin(v_floats.tobytes())
        b_off, _ = add_bin(b4.tobytes())
        tex_url = extract_material_texture(mat_pid)
        for idx_arr in m["sub_indices"]:
            if len(idx_arr) == 0:
                continue
            i_off, _ = add_bin(idx_arr.tobytes())
            submesh_records.append({
                "vCount": int(m["v_cnt"]),
                "vOffset": v_off,
                "bOffset": b_off,
                "iCount": int(len(idx_arr)),
                "iOffset": i_off,
                "texture": tex_url
            })

    num_bones = len(bone_palette)

    # Helper to compute [num_bones, 3, 4] float32 skinning matrices at a given pose
    def compute_pose_matrices(clip_obj=None, t=0.0):
        local_pos = {tp: list(trs[tp]["pos"]) for tp in all_trs}
        local_rot = {tp: list(trs[tp]["rot"]) for tp in all_trs}
        local_scl = {tp: list(trs[tp]["scl"]) for tp in all_trs}
        matched_bindings = 0
        if clip_obj:
            vals = evaluate_clip(clip_obj, t)
            for b_path, b_attr, c_idx, dims in clip_obj["bindings"]:
                tp = crc_to_tr.get(b_path)
                if tp is None or c_idx + dims > len(vals):
                    continue
                matched_bindings += 1
                v = vals[c_idx : c_idx + dims]
                if b_attr == 1:
                    local_pos[tp] = [float(v[0]), float(v[1]), float(v[2])]
                elif b_attr == 2:
                    local_rot[tp] = [float(v[0]), float(v[1]), float(v[2]), float(v[3])]
                elif b_attr == 3:
                    local_scl[tp] = [float(v[0]), float(v[1]), float(v[2])]
        world_mat = {anim_tr: np.eye(4, dtype=np.float32)}
        for tp in all_trs[1:]:
            p_tp = trs[tp]["father"]
            world_mat[tp] = world_mat.get(p_tp, np.eye(4, dtype=np.float32)) @ trs_matrix(local_pos[tp], local_rot[tp], local_scl[tp])
        out_mats = np.zeros((num_bones, 3, 4), dtype=np.float32)
        for bi, (b_tp, bp_mat) in enumerate(bone_palette):
            w_m = world_mat.get(b_tp, np.eye(4, dtype=np.float32))
            full_m = w_m @ bp_mat
            out_mats[bi] = full_m[:3, :4]
        return out_mats, matched_bindings

    # Resolve clips for idle, move, attack, skill, death
    ctrl_clips = resolve_controller_clips(st["anim_ctrl"])

    # Re-pick the animation root if the clip paths do not match the Animator's transform.
    probe = None
    for sk in ("idle", "attack", "move", "skill"):
        pc = parse_clip(ctrl_clips[sk]) if sk in ctrl_clips else None
        if pc and pc["bindings"]:
            probe = pc
            break
    if probe:
        probe_paths = [b[0] for b in probe["bindings"] if b[0] != 0xFFFFFFFF]
        def path_score(cmap):
            return sum(1 for pth in probe_paths if pth in cmap)
        best_score, best_root = path_score(crc_to_tr), anim_tr
        if probe_paths and best_score < 0.6 * len(probe_paths):
            _, every_tr = build_crc_map(root_tp)
            for cand in every_tr:
                cm, _ = build_crc_map(cand)
                s = path_score(cm)
                if s > best_score:
                    best_score, best_root = s, cand
            if best_root != anim_tr:
                new_map, sub_trs = build_crc_map(best_root)
                crc_to_tr = new_map
                if best_root not in all_trs:
                    anim_tr, all_trs = best_root, sub_trs
        if DBG_MODEL[0]:
            print("   root match", best_score, "/", len(probe_paths))
    anim_records = {}
    FRAMES_PER_CLIP = 16

    idle_clip = parse_clip(ctrl_clips["idle"]) if "idle" in ctrl_clips else None
    idle_frame0, _ = compute_pose_matrices(idle_clip, 0.0)

    # Compute true skinned bounding box in idle_frame0 using the main body SMR (largest vertex count)
    smr_samples = []
    cur_bone_offset = 0
    for tr_pid, cpid, mpid, mat_pids, bpids in st["smrs"]:
        m = parse_mesh(mpid)
        if not m:
            continue
        nb = len(bpids)
        used_local = np.unique(m["bone_idx"][m["weights"] > 0.0005]) if nb > 0 else np.array([0], dtype=np.uint16)
        l2g = np.zeros(max(1, nb), dtype=np.uint16)
        for lb in used_local:
            lb_i = int(lb)
            if lb_i < nb and lb_i < len(m["bindposes"]):
                l2g[lb_i] = cur_bone_offset
                cur_bone_offset += 1
        step_v = max(1, m["v_cnt"] // 400)
        pos_s = m["positions"][::step_v]
        p4_s = np.hstack([pos_s, np.ones((len(pos_s), 1), dtype=np.float32)])
        w_s = m["weights"][::step_v]
        g_b = l2g[np.clip(m["bone_idx"][::step_v], 0, max(0, nb - 1))]
        smr_samples.append((m["v_cnt"], p4_s, w_s, g_b))

    body_samples = [max(smr_samples, key=lambda x: x[0])[1:]] if smr_samples else []

    def eval_skinned_pts(mats):
        pts_list = []
        for p4_s, w_s, g_b in body_samples:
            sk = np.zeros((len(p4_s), 3), dtype=np.float32)
            for k in range(4):
                m_k = mats[np.clip(g_b[:, k], 0, num_bones - 1)]
                sk += np.einsum("vij,vj->vi", m_k, p4_s) * w_s[:, k : k + 1]
            pts_list.append(sk)
        return np.vstack(pts_list) if pts_list else np.zeros((1, 3), dtype=np.float32)

    idle_pts = eval_skinned_pts(idle_frame0)
    min_bbox = idle_pts.min(axis=0)
    max_bbox = idle_pts.max(axis=0)
    height = float(max(0.45, np.percentile(idle_pts[:, 1], 99) - np.percentile(idle_pts[:, 1], 1)))
    idle_min_y = float(np.percentile(idle_pts[:, 1], 2))
    idle_cx = float(np.median(idle_pts[:, 0]))
    idle_cz = float(np.median(idle_pts[:, 2]))

    for state_key in ("idle", "move", "attack", "skill", "death"):
        c_pid = ctrl_clips.get(state_key)
        c_obj = parse_clip(c_pid) if c_pid else None
        dur = c_obj["duration"] if c_obj else 1.0
        FRAMES_PER_CLIP = int(max(16, min(96, math.ceil(max(dur, 1.5) * 30.0) + 1)))
        frames_arr = np.zeros((FRAMES_PER_CLIP, num_bones, 3, 4), dtype=np.float32)
        matched = 0
        if c_obj and len(c_obj["bindings"]) > 0:
            for f_i in range(FRAMES_PER_CLIP):
                t_sample = (f_i / max(1, FRAMES_PER_CLIP - 1)) * dur
                fm, matched = compute_pose_matrices(c_obj, t_sample)
                if state_key == "skill" and len(smr_samples) > 0:
                    pts_f = eval_skinned_pts(fm)
                    cur_min_y = float(np.percentile(pts_f[:, 1], 2))
                    dy = cur_min_y - idle_min_y
                    max_jump = 0.75 * height
                    if dy > max_jump:
                        fm[:, 1, 3] -= (dy - max_jump) * 0.82
                    elif dy < -0.25 * height:
                        fm[:, 1, 3] -= (dy + 0.25 * height) * 0.85
                    cur_cx = float(np.median(pts_f[:, 0])) - idle_cx
                    cur_cz = float(np.median(pts_f[:, 2])) - idle_cz
                    horiz = math.hypot(cur_cx, cur_cz)
                    max_horiz = 0.55 * height
                    if horiz > max_horiz and horiz > 1e-4:
                        pull = (horiz - max_horiz) * 0.75 / horiz
                        fm[:, 0, 3] -= cur_cx * pull
                        fm[:, 2, 3] -= cur_cz * pull
                frames_arr[f_i] = fm
        if DBG_MODEL[0]:
            print("   state", state_key, "clip", c_obj and c_obj["name"], "bindings", c_obj and len(c_obj["bindings"]), "matched", matched, "dur", dur)
        # If death clip didn't match this skeleton (e.g. Fly_Death on humanoid or empty Archer_Die),
        # try shared humanoid Death (3217) or build a smooth backward fall from idle_frame0!
        if state_key == "death" and matched < 5:
            alt_death = parse_clip(3217)
            if alt_death:
                _, m_alt = compute_pose_matrices(alt_death, 0.0)
                if m_alt >= 10:
                    dur = alt_death["duration"]
                    for f_i in range(FRAMES_PER_CLIP):
                        t_sample = (f_i / max(1, FRAMES_PER_CLIP - 1)) * dur
                        frames_arr[f_i], _ = compute_pose_matrices(alt_death, t_sample)
                    matched = m_alt
            if matched < 5:
                dur = 0.8
                for f_i in range(FRAMES_PER_CLIP):
                    p_fall = min(1.0, f_i / max(1, FRAMES_PER_CLIP - 1))
                    # Smooth ease-in fall backwards around X axis (-82 deg)
                    ang = -math.radians(82.0) * (p_fall * p_fall)
                    ca, sa = math.cos(ang), math.sin(ang)
                    R_fall = np.array([
                        [1.0, 0.0, 0.0, 0.0],
                        [0.0,  ca, -sa, 0.05 * math.sin(p_fall * math.pi)],
                        [0.0,  sa,  ca, 0.0],
                    ], dtype=np.float32)
                    for bi in range(num_bones):
                        m4 = np.eye(4, dtype=np.float32)
                        m4[:3, :4] = idle_frame0[bi]
                        frames_arr[f_i, bi] = R_fall @ m4
        elif matched == 0:
            for f_i in range(FRAMES_PER_CLIP):
                frames_arr[f_i] = idle_frame0

        f16_bytes = frames_arr.astype(np.float16).tobytes()
        a_off, _ = add_bin(f16_bytes)
        anim_records[state_key] = {
            "frames": FRAMES_PER_CLIP,
            "duration": round(float(dur), 3),
            "loop": state_key in ("idle", "move"),
            "offset": a_off
        }

    bin_path = os.path.join(OUT_DIR, f"{name}.bin")
    with open(bin_path, "wb") as bf:
        for ch in bin_chunks:
            bf.write(ch)

    model_meta = {
        "name": name,
        "bin": f"/assets/models/{name}.bin",
        "numBones": num_bones,
        "height": round(height, 3),
        "submeshes": submesh_records,
        "animations": anim_records
    }
    json_path = os.path.join(OUT_DIR, f"{name}.json")
    with open(json_path, "w", encoding="utf-8") as jf:
        json.dump(model_meta, jf, separators=(",", ":"))

    manifest_models[name] = f"/assets/models/{name}.json"
    print(f"Exported {name:18s}: submeshes={len(submesh_records):2d}, bones={num_bones:3d}, bin={bin_state['offset']/1024:6.1f} KB")

# Map every heroId and enemyId in game_data.json to its prefab name
gd = json.load(open(r"c:\Users\Aceliweth\Downloads\rea\guildrun-web\public\data\game_data.json", encoding="utf-8"))
hero_map = {}
for hid, p_name in HERO_PREFABS.items():
    hero_map[str(hid)] = p_name

enemy_map = {}
for eid, e in gd["enemies"].items():
    ename = e.get("name", "")
    p_name = ENEMY_PREFABS.get(ename)
    if not p_name:
        for k, v in ENEMY_PREFABS.items():
            if k.lower() in ename.lower():
                p_name = v
                break
    enemy_map[str(eid)] = p_name or "Turtle"

manifest = {
    "models": manifest_models,
    "heroes": hero_map,
    "enemies": enemy_map,
    "enemyByName": ENEMY_PREFABS
}
with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as mf:
    json.dump(manifest, mf, indent=2)

print(f"Done in {time.time() - t0_all:.1f}s! Exported {len(manifest_models)} 3D animated models and {len(extracted_textures)} textures.")

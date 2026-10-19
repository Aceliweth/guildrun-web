import os, sys, struct, zlib, math
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, "scripts")
from agent4_extract_balancing import DATA_DIR, parse_serialized_file, read_aligned_str

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
    if n > 0: x, y, z, w = x/n, y/n, z/n, w/n
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

def parse_mesh(pid):
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
        if sz != 0: return None
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
    sm0 = submeshes[0]
    indices = np.frombuffer(data, dtype=idx_dtype, count=sm0["indexCount"], offset=pos + sm0["firstByte"]).astype(np.int32) + sm0["baseVertex"]
    pos += idx_bytes
    if pos % 4: pos += 4 - (pos % 4)
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
            if end_c > stream_strides[st]: stream_strides[st] = end_c
    stream_offsets = [0, 0, 0, 0]
    cur = 0
    for s in range(4):
        stream_offsets[s] = cur
        if stream_strides[s] > 0:
            sz = v_cnt * stream_strides[s]
            if sz % 16: sz += 16 - (sz % 16)
            cur += sz
    def read_ch(ch_idx, dtype=np.float32):
        if ch_idx >= len(channels): return None
        st, off_c, fmt_c, dim_c = channels[ch_idx]
        if dim_c == 0: return None
        stride = stream_strides[st]
        base = stream_offsets[st] + off_c
        return np.ndarray((v_cnt, dim_c), dtype=dtype, buffer=v_buf, offset=base, strides=(stride, np.dtype(dtype).itemsize)).copy()
    return {
        "name": name, "v_cnt": v_cnt, "indices": indices,
        "positions": read_ch(0, np.float32), "normals": read_ch(1, np.float32), "uvs": read_ch(4, np.float32),
        "weights": read_ch(12, np.float32), "bone_idx": read_ch(13, np.int32), "bindposes": bindposes
    }

def extract_tex_512(pid):
    _, off, bsize = obj_map[pid]
    n, pos = read_aligned_str(data, off)
    w, h, complete_sz, mips_stripped, tex_fmt, mip_cnt = struct.unpack_from("<6I", data, pos + 4)
    idx = data.rfind(b"sharedassets1.assets.resS", off, off + bsize)
    if idx == -1: return None
    s_off, s_sz = struct.unpack_from("<QI", data, idx - 16)
    if tex_fmt not in (10, 12, 25): return None
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
    return img

def parse_clip(pid):
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
    start_time, stop_time = struct.unpack_from("<2f", data, p2)
    bindings = []
    for k in range(p2, end - 28, 4):
        cnt = struct.unpack_from("<I", data, k)[0]
        if 1 <= cnt <= 400 and k + 4 + cnt * 28 <= end:
            tid0 = struct.unpack_from("<I", data, k + 4 + 20)[0]
            if tid0 == 4:
                c_idx = 0
                for b in range(cnt):
                    b_path, b_attr, s_fid, s_pid, b_tid, b_ct = struct.unpack_from("<IIiqiI", data, k + 4 + b * 28)
                    dims = 4 if b_attr == 2 else (3 if b_attr in (1, 3, 4) else 1)
                    bindings.append((b_path, b_attr, c_idx, dims))
                    c_idx += dims
                break
    sc_frames = []
    sp = 0
    slen = len(sc_buf)
    while sp + 8 <= slen:
        t_val, n_keys = struct.unpack_from("<fI", sc_buf, sp)
        sp += 8
        if sp + n_keys * 20 > slen: break
        keys = []
        for _ in range(n_keys):
            c_i, c0, c1, c2, v0 = struct.unpack_from("<I4f", sc_buf, sp)
            keys.append((c_i, c0, c1, c2, v0))
            sp += 20
        sc_frames.append((t_val, keys))
    return {
        "name": n, "duration": max(0.1, stop_time - start_time), "sample_rate": sample_rate,
        "sc_curve_cnt": sc_curve_cnt, "sc_frames": sc_frames,
        "dc_frames": dc_frames, "dc_curves": dc_curves, "dc_rate": dc_rate, "dc_begin": dc_begin, "dc_samples": dc_samples,
        "cc_cnt": cc_cnt, "cc_data": cc_data,
        "bindings": bindings
    }

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

def render_unit_pose(model_tr_pid, smr_pids, clip_pid=None, t=0.0, yaw_deg=155.0, pitch_deg=18.0):
    # Map CRC32 -> transform_pid under model_tr_pid
    crc_to_tr = {0: model_tr_pid}
    all_trs = [model_tr_pid]
    def collect(tp, pref=""):
        for c in trs[tp]["children"]:
            all_trs.append(c)
            gn = gos.get(trs[c]["go"], ("",))[0]
            rel = f"{pref}/{gn}" if pref else gn
            crc_to_tr[zlib.crc32(rel.encode("utf-8")) & 0xffffffff] = c
            collect(c, rel)
    collect(model_tr_pid)

    local_pos = {tp: list(trs[tp]["pos"]) for tp in all_trs}
    local_rot = {tp: list(trs[tp]["rot"]) for tp in all_trs}
    local_scl = {tp: list(trs[tp]["scl"]) for tp in all_trs}

    if clip_pid:
        clip = parse_clip(clip_pid)
        vals = evaluate_clip(clip, t)
        for b_path, b_attr, c_idx, dims in clip["bindings"]:
            tp = crc_to_tr.get(b_path)
            if tp is None or c_idx + dims > len(vals): continue
            v = vals[c_idx : c_idx + dims]
            if b_attr == 1:
                local_pos[tp] = [float(v[0]), float(v[1]), float(v[2])]
            elif b_attr == 2:
                local_rot[tp] = [float(v[0]), float(v[1]), float(v[2]), float(v[3])]
            elif b_attr == 3:
                local_scl[tp] = [float(v[0]), float(v[1]), float(v[2])]

    world_mat = {model_tr_pid: np.eye(4, dtype=np.float32)}
    for tp in all_trs[1:]:
        p_tp = trs[tp]["father"]
        world_mat[tp] = world_mat[p_tp] @ trs_matrix(local_pos[tp], local_rot[tp], local_scl[tp])

    # Render all SMRs into a 320x320 PIL image using simple Z-sorted triangle rasterizer
    img = Image.new("RGBA", (320, 320), (24, 32, 38, 255))
    draw = ImageDraw.Draw(img)

    yaw = math.radians(yaw_deg)
    pitch = math.radians(pitch_deg)
    cy, sy = math.cos(yaw), math.sin(yaw)
    cp, sp = math.cos(pitch), math.sin(pitch)
    R_cam = np.array([
        [ cy,      0.0,  sy],
        [ sy*sp,   cp,  -cy*sp],
        [-sy*cp,   sp,   cy*cp]
    ], dtype=np.float32)

    tris_to_draw = []
    for smr_pid, mesh_pid, tex_pid in smr_pids:
        _, soff, ssz = obj_map[smr_pid]
        nbones = struct.unpack_from("<I", data, soff + 156)[0]
        bone_pids = [struct.unpack_from("<iq", data, soff + 160 + i*12)[1] for i in range(nbones)]
        mesh = parse_mesh(mesh_pid)
        tex = extract_tex_512(tex_pid)
        tex_arr = np.array(tex) if tex else None

        skin_mats = np.zeros((nbones, 4, 4), dtype=np.float32)
        for i, bpid in enumerate(bone_pids):
            w_m = world_mat.get(bpid, np.eye(4, dtype=np.float32))
            skin_mats[i] = w_m @ mesh["bindposes"][i]

        # Skin vertices: v_world = sum_k w_k * (skin_mats[b_k] @ [vx, vy, vz, 1])
        pos4 = np.hstack([mesh["positions"], np.ones((mesh["v_cnt"], 1), dtype=np.float32)])
        b_idx = np.clip(mesh["bone_idx"], 0, nbones - 1)
        w = mesh["weights"]
        M = np.zeros((mesh["v_cnt"], 4, 4), dtype=np.float32)
        if w is not None and b_idx is not None:
            for k in range(w.shape[1]):
                M += skin_mats[b_idx[:, k]] * w[:, k, None, None]
        else:
            M[:] = skin_mats[0]
        v_world = np.einsum("vij,vj->vi", M[:, :3, :4], pos4)
        n_world = np.einsum("vij,vj->vi", M[:, :3, :3], mesh["normals"])
        v_cam = v_world @ R_cam.T
        n_cam = n_world @ R_cam.T

        idx = mesh["indices"].reshape((-1, 3))
        uvs = mesh["uvs"]
        for t_i in idx:
            p0, p1, p2 = v_cam[t_i[0]], v_cam[t_i[1]], v_cam[t_i[2]]
            z_avg = (p0[2] + p1[2] + p2[2]) / 3.0
            # Sample texture color at triangle centroid UV
            if tex_arr is not None:
                uv_c = (uvs[t_i[0]] + uvs[t_i[1]] + uvs[t_i[2]]) / 3.0
                tx = int((uv_c[0] % 1.0) * (tex_arr.shape[1] - 1))
                ty = int(((1.0 - (uv_c[1] % 1.0))) * (tex_arr.shape[0] - 1))
                col = tex_arr[ty, tx, :3].astype(np.float32)
            else:
                col = np.array([180, 180, 180], dtype=np.float32)
            n_avg = (n_cam[t_i[0]] + n_cam[t_i[1]] + n_cam[t_i[2]])
            nl = np.linalg.norm(n_avg)
            if nl > 0: n_avg /= nl
            lit = 0.72 + 0.35 * max(0.0, float(n_avg[1]*0.5 - n_avg[2]*0.85))
            c_rgb = tuple(np.clip(col * lit, 0, 255).astype(int))
            tris_to_draw.append((z_avg, p0, p1, p2, c_rgb))

    # Painter's sort back-to-front (largest z to smallest z in left-handed cam)
    tris_to_draw.sort(key=lambda x: -x[0])
    scale = 115.0
    cx, cy_px = 160.0, 265.0
    for _, p0, p1, p2, c_rgb in tris_to_draw:
        pts = [
            (cx + p0[0]*scale, cy_px - p0[1]*scale),
            (cx + p1[0]*scale, cy_px - p1[1]*scale),
            (cx + p2[0]*scale, cy_px - p2[1]*scale),
        ]
        draw.polygon(pts, fill=c_rgb)
    return img

sheet = Image.new("RGBA", (320*4, 320*2), (18, 24, 30, 255))
# Row 0: Tilly (model=44975, body+weapons SMRs, clips: rest, attack 3174 t=0.2, attack 3174 t=0.5, skill 3178 t=0.4)
tilly_smrs = [(50613, 2701, 2359), (50305, 2790, 2461), (50606, 2819, 2461)]
sheet.paste(render_unit_pose(44975, tilly_smrs, None, 0.0), (0, 0))
sheet.paste(render_unit_pose(44975, tilly_smrs, 3130, 0.25), (320, 0))
sheet.paste(render_unit_pose(44975, tilly_smrs, 3174, 0.35), (640, 0))
sheet.paste(render_unit_pose(44975, tilly_smrs, 3178, 0.45), (960, 0))

# Row 1: Turtle (model=36357, body+shell SMRs, clips: idle 3060 t=0.0, move 3193 t=0.3, attack 3201 t=0.4, death 3209 t=0.6)
turtle_smrs = [(50457, 2913, 1304), (50658, 2793, 1681)]
sheet.paste(render_unit_pose(36357, turtle_smrs, 3060, 0.0, yaw_deg=-35.0), (0, 320))
sheet.paste(render_unit_pose(36357, turtle_smrs, 3193, 0.3, yaw_deg=-35.0), (320, 320))
sheet.paste(render_unit_pose(36357, turtle_smrs, 3201, 0.4, yaw_deg=-35.0), (640, 320))
sheet.paste(render_unit_pose(36357, turtle_smrs, 3209, 0.6, yaw_deg=-35.0), (960, 320))

sheet.save("scripts/test_3d_render.png")
print("Saved scripts/test_3d_render.png!")

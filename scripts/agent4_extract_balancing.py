#!/usr/bin/env python3
"""
Guildrun Demo (Unity 6000.0.64f1) — Complete Balancing, ScriptableObject,
MonoBehaviour, TextAsset, Localization & Scene Hierarchy Extractor.

Parses:
- StreamingAssets/aa/StandaloneWindows64/*.bundle (UnityFS LZ4 archives + Localization tables)
- il2cpp_data/Metadata/global-metadata.dat (v31) + GameAssembly.dll (Il2CppType table)
- globalgamemanagers, globalgamemanagers.assets, resources.assets
- sharedassets0.assets .. sharedassets21.assets
- level0 .. level21

Outputs:
- c:/Users/Aceliweth/Downloads/rea/guildrun-web/re_data/balancing_data.json
- c:/Users/Aceliweth/Downloads/rea/guildrun-web/re_data/balancing_summary.md
"""

import json
import os
import struct
from collections import Counter, defaultdict

GAME_DIR = r"C:\Program Files (x86)\Steam\steamapps\common\Guildrun Demo"
DATA_DIR = os.path.join(GAME_DIR, "Guildrun_Data")
BUNDLE_DIR = os.path.join(DATA_DIR, "StreamingAssets", "aa", "StandaloneWindows64")
META_PATH = os.path.join(DATA_DIR, "il2cpp_data", "Metadata", "global-metadata.dat")
GA_PATH = os.path.join(GAME_DIR, "GameAssembly.dll")

OUT_DIR = r"c:\Users\Aceliweth\Downloads\rea\guildrun-web\re_data"
OUT_JSON = os.path.join(OUT_DIR, "balancing_data.json")
OUT_MD = os.path.join(OUT_DIR, "balancing_summary.md")


# ============================================================================
# 1. Pure-Python LZ4 Block Decompressor & UnityFS Bundle Parser
# ============================================================================

def lz4_decompress(src: bytes, uncompressed_size: int) -> bytes:
    out = bytearray()
    pos = 0
    n = len(src)
    while pos < n and len(out) < uncompressed_size:
        token = src[pos]
        pos += 1
        lit_len = token >> 4
        if lit_len == 15:
            while True:
                b = src[pos]
                pos += 1
                lit_len += b
                if b != 255:
                    break
        out.extend(src[pos : pos + lit_len])
        pos += lit_len
        if pos >= n or len(out) >= uncompressed_size:
            break
        offset = src[pos] | (src[pos + 1] << 8)
        pos += 2
        match_len = (token & 0x0F) + 4
        if match_len == 19:
            while True:
                b = src[pos]
                pos += 1
                match_len += b
                if b != 255:
                    break
        start = len(out) - offset
        for i in range(match_len):
            out.append(out[start + i])
    return bytes(out)


def parse_unityfs_bundle(path: str):
    with open(path, "rb") as f:
        data = f.read()
    pos = data.index(b"\x00") + 1
    ver = struct.unpack_from(">I", data, pos)[0]
    pos += 4
    pos = data.index(b"\x00", pos) + 1
    pos = data.index(b"\x00", pos) + 1
    fsize, csize, usize, flags = struct.unpack_from(">QIII", data, pos)
    pos += 20
    if ver >= 7:
        pos = (pos + 15) & ~15
    cinfo = data[pos : pos + csize]
    pos += csize
    if flags & 0x200:
        pos = (pos + 15) & ~15
    binfo = lz4_decompress(cinfo, usize) if (flags & 0x3F) in (2, 3) else cinfo
    bpos = 16
    num_blocks = struct.unpack_from(">I", binfo, bpos)[0]
    bpos += 4
    blocks = [struct.unpack_from(">IIH", binfo, bpos + i * 10) for i in range(num_blocks)]
    bpos += num_blocks * 10
    num_nodes = struct.unpack_from(">I", binfo, bpos)[0]
    bpos += 4
    nodes = []
    for _ in range(num_nodes):
        noff, nsize, nflags = struct.unpack_from(">QQI", binfo, bpos)
        bpos += 20
        end = binfo.index(b"\x00", bpos)
        nname = binfo[bpos:end].decode("utf-8", errors="replace")
        bpos = end + 1
        nodes.append((noff, nsize, nflags, nname))
    stream = bytearray()
    for bu, bc, bf in blocks:
        chunk = data[pos : pos + bc]
        pos += bc
        stream.extend(lz4_decompress(chunk, bu) if (bf & 0x3F) in (2, 3) else chunk)
    return bytes(stream), nodes


def read_aligned_str(buf: bytes, off: int):
    l = struct.unpack_from("<i", buf, off)[0]
    if l < 0 or off + 4 + l > len(buf):
        raise ValueError(f"Invalid string length {l} at offset {off}")
    off += 4
    s = buf[off : off + l].decode("utf-8", errors="replace")
    return s, (off + l + 3) & ~3


def read_cstr(buf: bytes, off: int):
    end = buf.index(b"\x00", off)
    return buf[off:end].decode("utf-8", errors="replace"), end + 1


# ============================================================================
# 2. Extract Localization Tables from Addressables Bundles
# ============================================================================

def extract_localization():
    def get_bundle_mbs(bname):
        stream, nodes = parse_unityfs_bundle(os.path.join(BUNDLE_DIR, bname))
        data = stream[nodes[0][0] : nodes[0][0] + nodes[0][1]]
        _, _, d_off, _ = struct.unpack(">IQQQ", data[20:48])
        pos = data.index(b"\x00", 48) + 5
        enable_tt = data[pos]
        pos += 1
        num_types = struct.unpack_from("<i", data, pos)[0]
        pos += 4
        types = []
        for _ in range(num_types):
            cid, stripped, st_idx = struct.unpack_from("<i?h", data, pos)
            pos += 7 + (16 if (cid == 114 or st_idx >= 0) else 0) + 16
            if enable_tt:
                n_nodes, s_size = struct.unpack_from("<ii", data, pos)
                pos += 8 + n_nodes * 32 + s_size
                n_deps = struct.unpack_from("<i", data, pos)[0]
                pos += 4 + n_deps * 4
            types.append(cid)
        num_objs = struct.unpack_from("<i", data, pos)[0]
        pos = (pos + 4 + 3) & ~3
        objs = [struct.unpack_from("<qQIi", data, pos + i * 24) for i in range(num_objs)]
        res = {}
        for pid, bstart, bsize, tid in objs:
            if types[tid] == 114:
                res[pid] = data[d_off + bstart : d_off + bstart + bsize]
        return res

    shared_mbs = get_bundle_mbs("localization-assets-shared_assets_all.bundle")
    en_mbs = get_bundle_mbs("localization-string-tables-english(en)_assets_all.bundle")

    guid_to_table = {}
    key_id_to_name = {}
    tables_summary = {}

    for pid, raw in shared_mbs.items():
        name, off = read_aligned_str(raw, 28)
        tname, off = read_aligned_str(raw, off)
        tguid, off = read_aligned_str(raw, off)
        guid_to_table[tguid] = tname
        cnt = struct.unpack_from("<i", raw, off)[0]
        off += 4
        for _ in range(cnt):
            kid = struct.unpack_from("<q", raw, off)[0]
            off += 8
            kname, off = read_aligned_str(raw, off)
            mcnt = struct.unpack_from("<i", raw, off)[0]
            off += 4 + mcnt * 8
            key_id_to_name[(tname, kid)] = kname
            key_id_to_name[(None, kid)] = (tname, kname)

    en_by_key = {}
    en_by_id = {}
    full_tables = defaultdict(dict)

    for pid, raw in en_mbs.items():
        name, off = read_aligned_str(raw, 28)
        locale, off = read_aligned_str(raw, off)
        off += 12  # PPtr<SharedTableData>
        mcnt = struct.unpack_from("<i", raw, off)[0]
        off += 4 + mcnt * 8
        cnt = struct.unpack_from("<i", raw, off)[0]
        off += 4
        tname = name.replace("_en", "")
        tables_summary[tname] = cnt
        for _ in range(cnt):
            kid = struct.unpack_from("<q", raw, off)[0]
            off += 8
            val, off = read_aligned_str(raw, off)
            mcnt2 = struct.unpack_from("<i", raw, off)[0]
            off += 4 + mcnt2 * 8
            kname = key_id_to_name.get((tname, kid), str(kid))
            en_by_key[(tname, kname)] = val
            en_by_key[(None, kname)] = val
            en_by_id[(tname, kid)] = val
            en_by_id[(None, kid)] = val
            full_tables[tname][kname] = val

    return {
        "guid_to_table": guid_to_table,
        "key_id_to_name": key_id_to_name,
        "en_by_key": en_by_key,
        "en_by_id": en_by_id,
        "full_tables": dict(full_tables),
        "tables_summary": tables_summary,
    }


# ============================================================================
# 3. IL2CPP Metadata + GameAssembly Type & Enum Resolver
# ============================================================================

class Il2CppMetadataResolver:
    def __init__(self, meta_path: str, ga_path: str, loca_data: dict):
        self.loca = loca_data
        with open(meta_path, "rb") as f:
            self.meta = f.read()
        with open(ga_path, "rb") as f:
            self.ga = f.read()

        ints = struct.unpack_from("<62I", self.meta, 8)
        self.str_off = ints[4]
        self.mth_off = ints[10]
        self.fdv_off = ints[14]
        self.fdv_size = ints[15]
        self.fdata_off = ints[16]
        self.fld_off = ints[22]
        self.gp_off = ints[24]
        self.td_off = ints[38]
        self.td_size = ints[39]
        self.img_off = ints[40]
        self.img_size = ints[41]
        self.attr_data_off = ints[48]
        self.attr_rng_off = ints[50]

        pe_off = struct.unpack_from("<I", self.ga, 0x3C)[0]
        num_sec = struct.unpack_from("<H", self.ga, pe_off + 6)[0]
        opt_size = struct.unpack_from("<H", self.ga, pe_off + 20)[0]
        self.img_base = struct.unpack_from("<Q", self.ga, pe_off + 48)[0]
        self.secs = [
            struct.unpack_from("<8sIIII", self.ga, pe_off + 24 + opt_size + i * 40)
            for i in range(num_sec)
        ]
        self.types_table_foff = 0x7455350

        self.tds = []
        self.name_to_td = {}
        for i in range(self.td_size // 88):
            v = struct.unpack_from("<22i", self.meta, self.td_off + i * 88)
            ns, name = self.get_str(v[1]), self.get_str(v[0])
            full = f"{ns}.{name}" if ns else name
            self.tds.append((full, ns, name, v))
            self.name_to_td[(ns, name)] = i
            self.name_to_td[full] = i

        self.td_to_img = {}
        self.img_tok_attrs = {}
        for img_idx in range(self.img_size // 40):
            iv = struct.unpack_from("<10i", self.meta, self.img_off + img_idx * 40)
            for ti in range(iv[2], iv[2] + iv[3]):
                self.td_to_img[ti] = img_idx
            for ci in range(iv[8], iv[8] + iv[9]):
                tok, start = struct.unpack_from("<II", self.meta, self.attr_rng_off + ci * 8)
                cnt, pos = self._read_cu32(self.meta, self.attr_data_off + start)
                self.img_tok_attrs[(img_idx, tok)] = [
                    self._get_method_decl_type(struct.unpack_from("<I", self.meta, pos + k * 4)[0])
                    for k in range(cnt)
                ]

        self.fdv_map = {}
        for i in range(self.fdv_size // 12):
            fi, ti, di = struct.unpack_from("<iii", self.meta, self.fdv_off + i * 12)
            self.fdv_map[fi] = (ti, di)

        self.enum_cache = {}
        self.fields_cache = {}
        self.pptr_resolver = None

    def get_str(self, idx: int) -> str:
        end = self.meta.index(b"\x00", self.str_off + idx)
        return self.meta[self.str_off + idx : end].decode("utf-8", errors="replace")

    @staticmethod
    def _read_cu32(buf: bytes, pos: int):
        b0 = buf[pos]
        if (b0 & 0x80) == 0:
            return b0, pos + 1
        if (b0 & 0xC0) == 0x80:
            return ((b0 & 0x3F) << 8) | buf[pos + 1], pos + 2
        return (
            ((b0 & 0x1F) << 24) | (buf[pos + 1] << 16) | (buf[pos + 2] << 8) | buf[pos + 3],
            pos + 4,
        )

    @classmethod
    def _read_ci32(cls, buf: bytes, pos: int):
        u, pos = cls._read_cu32(buf, pos)
        if u == 0xFFFFFFFF:
            return -2147483648, pos
        return (-(u >> 1) - 1 if (u & 1) else (u >> 1)), pos

    def _get_method_decl_type(self, m_idx: int) -> str:
        return self.tds[struct.unpack_from("<9i", self.meta, self.mth_off + m_idx * 36)[1]][0]

    def va_to_foff(self, va: int) -> int:
        rva = va - self.img_base
        for _, vsize, srva, rsize, roff in self.secs:
            if srva <= rva < srva + vsize:
                return roff + (rva - srva)
        return -1

    PRIM = {
        1: "void", 2: "bool", 3: "char", 4: "sbyte", 5: "byte",
        6: "short", 7: "ushort", 8: "int", 9: "uint", 10: "long",
        11: "ulong", 12: "float", 13: "double", 14: "string", 28: "object",
    }

    def resolve_type_va(self, va: int):
        foff = self.va_to_foff(va)
        data, attrs, t_enum, bf = struct.unpack_from("<QHBB", self.ga, foff)
        if t_enum in self.PRIM:
            return ("prim", self.PRIM[t_enum], None), attrs
        if t_enum in (0x11, 0x12):
            return ("td", data, None), attrs
        if t_enum == 0x13:
            gp_num = struct.unpack_from("<iiiHH", self.meta, self.gp_off + data * 16)[3]
            return ("var", gp_num, None), attrs
        if t_enum == 0x1D:
            return ("array", self.resolve_type_va(data)[0], None), attrs
        if t_enum == 0x15:
            g_foff = self.va_to_foff(data)
            base_va, inst_va = struct.unpack_from("<QQ", self.ga, g_foff)
            base_td = self.resolve_type_va(base_va)[0][1] if base_va > self.img_base else base_va
            i_foff = self.va_to_foff(inst_va)
            argc, argv_va = struct.unpack_from("<QQ", self.ga, i_foff)
            a_foff = self.va_to_foff(argv_va)
            args = [
                self.resolve_type_va(struct.unpack_from("<Q", self.ga, a_foff + k * 8)[0])[0]
                for k in range(argc)
            ]
            return ("generic", base_td, args), attrs
        return ("unk", t_enum, data), attrs

    def resolve_type_idx(self, t_idx: int):
        va = struct.unpack_from("<Q", self.ga, self.types_table_foff + t_idx * 8)[0]
        return self.resolve_type_va(va)

    def subst_type(self, tspec, targs):
        kind, a, b = tspec
        if kind == "var":
            return targs[a]
        if kind == "array":
            return ("array", self.subst_type(a, targs), None)
        if kind == "generic":
            return ("generic", a, [self.subst_type(x, targs) for x in b])
        return tspec

    def is_unity_object(self, td_idx: int) -> bool:
        cur = td_idx
        while cur >= 0:
            full, ns, name, v = self.tds[cur]
            if full == "UnityEngine.Object":
                return True
            if v[4] < 0:
                break
            pspec, _ = self.resolve_type_idx(v[4])
            cur = pspec[1] if pspec[0] in ("td", "generic") else -1
        return False

    def is_enum(self, td_idx: int) -> bool:
        return bool(self.tds[td_idx][3][20] & 2)

    def get_enum_map(self, td_idx: int) -> dict:
        if td_idx in self.enum_cache:
            return self.enum_cache[td_idx]
        v = self.tds[td_idx][3]
        ut, _ = self.resolve_type_idx(v[5])
        ut_name = ut[1]
        emap = {}
        f_first, f_count = v[8], v[17] & 0xFFFF
        for fi in range(f_first + 1, f_first + f_count):
            fn_idx, ft_idx, f_tok = struct.unpack_from("<IiI", self.meta, self.fld_off + fi * 12)
            ti, di = self.fdv_map.get(fi, (-1, -1))
            if di < 0:
                continue
            pos = self.fdata_off + di
            if ut_name == "byte":
                val = self.meta[pos]
            elif ut_name == "sbyte":
                val = struct.unpack_from("<b", self.meta, pos)[0]
            elif ut_name in ("short", "char"):
                val = struct.unpack_from("<h", self.meta, pos)[0]
            elif ut_name == "ushort":
                val = struct.unpack_from("<H", self.meta, pos)[0]
            elif ut_name == "uint":
                val, _ = self._read_cu32(self.meta, pos)
            else:
                val, _ = self._read_ci32(self.meta, pos)
            emap[val] = self.get_str(fn_idx)
        self.enum_cache[td_idx] = emap
        return emap

    STOP_BASES = {
        "UnityEngine.Object",
        "UnityEngine.ScriptableObject",
        "UnityEngine.MonoBehaviour",
        "System.Object",
        "System.ValueType",
    }

    def get_serializable_fields(self, td_idx: int, targs=None):
        full, ns, name, v = self.tds[td_idx]
        if full in self.STOP_BASES:
            return []
        res = []
        if v[4] >= 0:
            p_spec, _ = self.resolve_type_idx(v[4])
            p_spec = self.subst_type(p_spec, targs or [])
            if p_spec[0] == "td":
                res.extend(self.get_serializable_fields(p_spec[1], None))
            elif p_spec[0] == "generic":
                res.extend(self.get_serializable_fields(p_spec[1], p_spec[2]))
        img_idx = self.td_to_img[td_idx]
        f_first, f_count = v[8], v[17] & 0xFFFF
        for fi in range(f_first, f_first + f_count):
            fn_idx, ft_idx, f_tok = struct.unpack_from("<IiI", self.meta, self.fld_off + fi * 12)
            fname = self.get_str(fn_idx)
            fspec, fattrs = self.resolve_type_idx(ft_idx)
            if fattrs & 0x00D0:
                continue
            cattrs = self.img_tok_attrs.get((img_idx, f_tok), [])
            is_pub = (fattrs & 0x0007) == 6 and not (fattrs & 0x0020)
            is_sf = "UnityEngine.SerializeField" in cattrs
            is_sr = "UnityEngine.SerializeReference" in cattrs
            if is_pub or is_sf or is_sr:
                res.append((fname, self.subst_type(fspec, targs or []), is_sr))
        return res

    def read_val(self, buf: bytes, pos: int, spec, is_sr=False):
        if is_sr:
            if spec[0] == "array" or (
                spec[0] == "generic"
                and self.tds[spec[1]][0].startswith("System.Collections.Generic.List")
            ):
                cnt = struct.unpack_from("<i", buf, pos)[0]
                pos += 4
                rids = [struct.unpack_from("<q", buf, pos + k * 8)[0] for k in range(cnt)]
                return {"$rids": rids}, pos + cnt * 8
            else:
                rid = struct.unpack_from("<q", buf, pos)[0]
                return {"$rid": rid}, pos + 8
        kind, a, b = spec
        if kind == "prim":
            if a == "bool":
                return bool(buf[pos]), (pos + 4) & ~3
            if a == "byte":
                return buf[pos], (pos + 4) & ~3
            if a == "sbyte":
                return struct.unpack_from("<b", buf, pos)[0], (pos + 4) & ~3
            if a in ("short", "char"):
                return struct.unpack_from("<h", buf, pos)[0], (pos + 2 + 3) & ~3
            if a == "ushort":
                return struct.unpack_from("<H", buf, pos)[0], (pos + 2 + 3) & ~3
            if a == "int":
                return struct.unpack_from("<i", buf, pos)[0], pos + 4
            if a == "uint":
                return struct.unpack_from("<I", buf, pos)[0], pos + 4
            if a == "long":
                return struct.unpack_from("<q", buf, pos)[0], pos + 8
            if a == "ulong":
                return struct.unpack_from("<Q", buf, pos)[0], pos + 8
            if a == "float":
                return round(struct.unpack_from("<f", buf, pos)[0], 6), pos + 4
            if a == "double":
                return round(struct.unpack_from("<d", buf, pos)[0], 6), pos + 8
            if a == "string":
                return read_aligned_str(buf, pos)
        if kind == "array":
            cnt = struct.unpack_from("<i", buf, pos)[0]
            pos += 4
            if a == ("prim", "byte", None):
                return buf[pos : pos + cnt].hex(), (pos + cnt + 3) & ~3
            arr = []
            for _ in range(cnt):
                v, pos = self.read_val(buf, pos, a, False)
                arr.append(v)
            return arr, pos
        if kind == "generic":
            gname = self.tds[a][0]
            if gname.startswith("System.Collections.Generic.List"):
                return self.read_val(buf, pos, ("array", b[0], None), False)
            obj, pos = self.read_struct(buf, pos, a, b)
            if gname.startswith("gg.leyline.balancing.Data.BalancingRef"):
                return obj.get("Id"), pos
            return obj, pos
        if kind == "td":
            tname = self.tds[a][0]
            if tname == "UnityEngine.AnimationCurve":
                nk = struct.unpack_from("<i", buf, pos)[0]
                pos += 4
                keys = [
                    [round(x, 5) if isinstance(x, float) else x for x in struct.unpack_from("<ffffiff", buf, pos + k * 28)]
                    for k in range(nk)
                ]
                pos += nk * 28
                pre, post, rot = struct.unpack_from("<iii", buf, pos)
                pos += 12
                return {"keys": keys, "preInfinity": pre, "postInfinity": post, "rotationOrder": rot}, pos
            if tname == "UnityEngine.Vector2Int":
                x, y = struct.unpack_from("<ii", buf, pos)
                return {"x": x, "y": y}, pos + 8
            if tname == "UnityEngine.Vector3Int":
                x, y, z = struct.unpack_from("<iii", buf, pos)
                return {"x": x, "y": y, "z": z}, pos + 12
            if tname == "UnityEngine.Vector2":
                x, y = struct.unpack_from("<ff", buf, pos)
                return {"x": round(x, 5), "y": round(y, 5)}, pos + 8
            if tname == "UnityEngine.Vector3":
                x, y, z = struct.unpack_from("<fff", buf, pos)
                return {"x": round(x, 5), "y": round(y, 5), "z": round(z, 5)}, pos + 12
            if tname in ("UnityEngine.Color", "UnityEngine.Vector4", "UnityEngine.Quaternion", "UnityEngine.Rect"):
                vals = [round(x, 5) for x in struct.unpack_from("<ffff", buf, pos)]
                return vals, pos + 16
            if self.is_unity_object(a):
                fid, pid = struct.unpack_from("<iq", buf, pos)
                pptr = {"fileID": fid, "pathID": pid}
                if self.pptr_resolver and pid != 0:
                    resolved = self.pptr_resolver(fid, pid)
                    if resolved:
                        pptr.update(resolved)
                return pptr, pos + 12
            if self.is_enum(a):
                ut, _ = self.resolve_type_idx(self.tds[a][3][5])
                raw_val, pos = self.read_val(buf, pos, ut, False)
                emap = self.get_enum_map(a)
                return emap.get(raw_val, raw_val), pos
            if tname == "Photon.Deterministic.FP":
                return round(struct.unpack_from("<q", buf, pos)[0] / 65536.0, 6), pos + 8
            obj, pos = self.read_struct(buf, pos, a, None)
            if tname == "gg.leyline.balancing.Data.BalancingEntryId":
                seq_id = obj.get("sequentialId", 0)
                prefix = obj.get("prefix", "")
                return {"id": seq_id, "prefix": prefix, "fullId": f"{prefix}_{seq_id}" if prefix else str(seq_id)}, pos
            if tname == "gg.leyline.unitylocalization.LocaKey":
                obj["__locakey__"] = True
                return obj, pos
            if tname in (
                "gg.leyline.balancing.Unity.LocalizedTextField",
                "gg.leyline.balancing.Unity.LocalizedTextArea",
                "gg.leyline.balancing.Unity.LocalizedText",
            ):
                return obj.get("EnglishText") or obj.get("StringKey") or "", pos
            if tname == "gg.leyline.balancing.Utils.SerializableDateTime":
                return obj.get("ticks", 0), pos
            return obj, pos
        raise ValueError(f"Unknown spec {spec}")

    def _simplify_locakey(self, obj: dict):
        ls = obj.get("localizedString") or {}
        tref = (ls.get("m_TableReference") or {}).get("m_TableCollectionName", "")
        teref = ls.get("m_TableEntryReference") or {}
        kid = teref.get("m_KeyId", 0)
        mkey = teref.get("m_Key", "")
        ckey = obj.get("key", "")
        ctab = obj.get("cachedTable", "")

        table = ctab
        if tref.startswith("GUID:"):
            table = self.loca["guid_to_table"].get(tref[5:], table)
        elif tref:
            table = tref

        key = ckey or mkey
        if not key and kid != 0:
            key = self.loca["key_id_to_name"].get((table, kid), "")
            if not key:
                found = self.loca["key_id_to_name"].get((None, kid))
                if found:
                    table, key = found

        text = ""
        if key:
            text = self.loca["en_by_key"].get((table, key), self.loca["en_by_key"].get((None, key), ""))
        if not text and kid != 0:
            text = self.loca["en_by_id"].get((table, kid), self.loca["en_by_id"].get((None, kid), ""))

        local_vars = {}
        for vp in ls.get("m_LocalVariables") or []:
            if isinstance(vp, dict) and vp.get("name") is not None:
                vobj = vp.get("variable")
                if isinstance(vobj, dict) and "m_Value" in vobj:
                    local_vars[vp["name"]] = vobj["m_Value"]

        raw_text = text
        if text and local_vars:
            for vk, vv in local_vars.items():
                text = text.replace("{" + str(vk) + "}", str(vv))

        if not key and not text and kid == 0:
            return None
        res = {"table": table, "key": key, "text": text}
        if local_vars:
            res["rawText"] = raw_text
            res["variables"] = local_vars
        return res

    def read_struct(self, buf: bytes, pos: int, td_idx: int, targs):
        obj = {}
        for fname, fspec, fsr in self.get_serializable_fields(td_idx, targs):
            clean_name = fname.replace("<", "").replace(">k__BackingField", "")
            if clean_name.startswith("_") and len(clean_name) > 1:
                clean_name = clean_name[1:]
            obj[clean_name], pos = self.read_val(buf, pos, fspec, fsr)
        return obj, pos

    def read_managed_references(self, buf: bytes, pos: int, end_off: int):
        if pos >= end_off:
            return {}, pos
        ver, cnt = struct.unpack_from("<ii", buf, pos)
        pos += 8
        refs = {}
        for _ in range(cnt):
            rid = struct.unpack_from("<q", buf, pos)[0]
            pos += 8
            cname, pos = read_aligned_str(buf, pos)
            ns, pos = read_aligned_str(buf, pos)
            asm, pos = read_aligned_str(buf, pos)
            if rid == -2 or not cname:
                refs[rid] = None
            else:
                lookup_name = cname.split("/")[-1] if "/" in cname else cname
                full_key = f"{ns}.{lookup_name}" if ns else lookup_name
                td_i = self.name_to_td.get((ns, lookup_name), self.name_to_td.get(full_key))
                val, pos = self.read_struct(buf, pos, td_i, None)
                res_val = {"$type": f"{ns}.{cname}" if ns else cname}
                res_val.update(val)
                refs[rid] = res_val
        return refs, pos

    def inline_refs(self, node, refs: dict):
        if isinstance(node, dict):
            if "$rid" in node and len(node) == 1:
                rid = node["$rid"]
                return self.inline_refs(refs.get(rid), refs) if rid in refs else None
            if "$rids" in node and len(node) == 1:
                return [
                    self.inline_refs(refs.get(r), refs)
                    for r in node["$rids"]
                    if refs.get(r) is not None
                ]
            resolved = {k: self.inline_refs(v, refs) for k, v in node.items()}
            if resolved.get("__locakey__"):
                return self._simplify_locakey(resolved)
            return resolved
        if isinstance(node, list):
            return [self.inline_refs(x, refs) for x in node]
        return node

    def deserialize_monobehaviour(self, buf: bytes, p_off: int, end_off: int, cname: str):
        td_idx = self.name_to_td[cname]
        obj, after_pos = self.read_struct(buf, p_off, td_idx, None)
        refs, final_pos = self.read_managed_references(buf, after_pos, end_off)
        if final_pos != end_off:
            raise ValueError(f"Size mismatch for {cname}: read {final_pos - p_off}, expected {end_off - p_off}")
        return self.inline_refs(obj, refs)


# ============================================================================
# 4. SerializedFile v22 Header & Object Scanner
# ============================================================================

def parse_serialized_file(path: str):
    with open(path, "rb") as f:
        data = f.read()
    m_size, f_size, ver, d_off_old, endian = struct.unpack(">IIIIB3x", data[:20])
    m_size, f_size, d_off, unk = struct.unpack(">IQQQ", data[20:48])
    pos = 48
    unity_ver, pos = read_cstr(data, pos)
    platform, enable_tt = struct.unpack_from("<i?", data, pos)
    pos += 5
    num_types = struct.unpack_from("<i", data, pos)[0]
    pos += 4
    types = []
    for _ in range(num_types):
        cid, stripped, st_idx = struct.unpack_from("<i?h", data, pos)
        pos += 7 + (16 if (cid == 114 or st_idx >= 0) else 0) + 16
        if enable_tt:
            n_nodes, s_size = struct.unpack_from("<ii", data, pos)
            pos += 8 + n_nodes * 32 + s_size
            n_deps = struct.unpack_from("<i", data, pos)[0]
            pos += 4 + n_deps * 4
        types.append((cid, stripped, st_idx))
    num_objs = struct.unpack_from("<i", data, pos)[0]
    pos = (pos + 4 + 3) & ~3
    objs = [struct.unpack_from("<qQIi", data, pos + i * 24) for i in range(num_objs)]
    pos += num_objs * 24
    num_st = struct.unpack_from("<i", data, pos)[0]
    pos += 4 + num_st * 12
    num_ext = struct.unpack_from("<i", data, pos)[0]
    pos += 4
    exts = []
    for _ in range(num_ext):
        _, pos = read_cstr(data, pos)
        pos += 20
        pname, pos = read_cstr(data, pos)
        exts.append(os.path.basename(pname).lower())
    return data, d_off, types, objs, exts


NAMED_CLASS_IDS = {
    21: "Material",
    28: "Texture2D",
    43: "Mesh",
    48: "Shader",
    49: "TextAsset",
    74: "AnimationClip",
    83: "AudioClip",
    89: "Cubemap",
    91: "AnimatorController",
    115: "MonoScript",
    128: "Font",
    150: "PreloadData",
    213: "Sprite",
}


def parse_ember_tests_databases(data: bytes, d_off: int, types: list, objs: list):
    """Parses the 3 ember.tests ScriptableObjects in resources.assets (EnemyDatabase, EnemyResultDatabase, StageDatabase)."""
    out = {}
    for pid, bstart, bsize, tid in objs:
        if types[tid][0] != 114:
            continue
        off = d_off + bstart
        sc_fid, sc_pid = struct.unpack_from("<iq", data, off + 16)
        if sc_fid != 0 or sc_pid not in (830, 831, 832):
            continue
        name, pos = read_aligned_str(data, off + 28)
        end_off = off + bsize
        if sc_pid == 831:  # EnemyDatabase
            cnt = struct.unpack_from("<i", data, pos)[0]
            pos += 4
            entries = []
            for _ in range(cnt):
                eid, pos = read_aligned_str(data, pos)
                ename, pos = read_aligned_str(data, pos)
                floats = [round(x, 4) for x in struct.unpack_from("<26f", data, pos)]
                pos += 104
                entries.append({
                    "id": eid,
                    "name": ename,
                    "stats": {
                        "maxHealth": floats[8],
                        "maxMana": floats[9],
                        "startingMana": floats[10],
                        "manaRegen": floats[11],
                        "attackDamage": floats[12],
                        "attackRange": floats[13],
                        "baseAttackSpeed": floats[14],
                        "defense": floats[15],
                        "attack": floats[16],
                        "magic": floats[17],
                        "crit": floats[18],
                        "rawFloats": floats,
                    },
                })
            out["EnemyDatabase_Tests"] = entries
        elif sc_pid == 830:  # EnemyResultDatabase
            cnt = struct.unpack_from("<i", data, pos)[0]
            pos += 4
            entries = []
            for _ in range(cnt):
                # Some entries start with empty/header or strings
                if pos >= end_off:
                    break
                s1, pos = read_aligned_str(data, pos)
                s2, pos = read_aligned_str(data, pos)
                s3, pos = read_aligned_str(data, pos)
                floats = [round(x, 4) for x in struct.unpack_from("<11f", data, pos)]
                pos += 44
                entries.append({
                    "enemyId": s1,
                    "displayName": s2,
                    "internalName": s3,
                    "maxHealth": floats[0],
                    "maxMana": floats[1],
                    "manaRegen": floats[2],
                    "startingMana": floats[3],
                    "baseAttackSpeed": floats[4],
                    "attackDamage": floats[5],
                    "defense": floats[6],
                    "attack": floats[7],
                    "magic": floats[8],
                    "crit": floats[9],
                    "effectivePower": floats[10],
                })
            out["EnemyResultDatabase_Tests"] = entries
        elif sc_pid == 832:  # StageDatabase
            cnt = struct.unpack_from("<i", data, pos)[0]
            pos += 4
            entries = []
            for _ in range(cnt):
                if pos >= end_off:
                    break
                sid, pos = read_aligned_str(data, pos)
                group, pos = read_aligned_str(data, pos)
                i1, i2, f1, f2, n_enemies = struct.unpack_from("<iiffi", data, pos)
                pos += 20
                enemies = []
                for _ in range(n_enemies):
                    en, pos = read_aligned_str(data, pos)
                    enemies.append(en)
                n_ids = struct.unpack_from("<i", data, pos)[0]
                pos += 4
                enemy_ids = []
                for _ in range(n_ids):
                    eid_s, pos = read_aligned_str(data, pos)
                    enemy_ids.append(eid_s)
                entries.append({
                    "stageId": sid,
                    "group": group,
                    "floor": i1,
                    "difficulty": i2,
                    "ehp": round(f1, 4),
                    "eoff": round(f2, 4),
                    "enemies": enemies,
                    "enemyIds": enemy_ids,
                })
            out["StageDatabase_Tests"] = entries
    return out


# ============================================================================
# 5. Main Extraction Pipeline
# ============================================================================

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print("[1/6] Extracting Addressables Localization bundles...")
    loca_data = extract_localization()
    print(f"      Extracted {len(loca_data['full_tables'])} tables ({sum(loca_data['tables_summary'].values())} English entries).")

    print("[2/6] Initializing IL2CPP Metadata + GameAssembly Type Resolver...")
    resolver = Il2CppMetadataResolver(META_PATH, GA_PATH, loca_data)
    print(f"      Loaded {len(resolver.tds)} Il2CppTypeDefinitions.")

    print("[3/6] Scanning SerializedFile v22 assets for MonoScripts, Asset Names & TextAssets...")
    asset_files = (
        ["globalgamemanagers", "globalgamemanagers.assets", "resources.assets"]
        + [f"sharedassets{i}.assets" for i in range(22)]
        + [f"level{i}" for i in range(22)]
    )

    parsed_files = {}
    monoscripts = defaultdict(dict)
    asset_names = defaultdict(dict)
    text_assets = []
    build_scenes = []

    for fn in asset_files:
        p = os.path.join(DATA_DIR, fn)
        if not os.path.exists(p):
            continue
        data, d_off, types, objs, exts = parse_serialized_file(p)
        parsed_files[fn.lower()] = (data, d_off, types, objs, exts)

        for pid, bstart, bsize, tid in objs:
            cid = types[tid][0]
            off = d_off + bstart
            if cid == 141 and fn == "globalgamemanagers":
                cnt = struct.unpack_from("<i", data, off)[0]
                s_off = off + 4
                for s_i in range(cnt):
                    sname, s_off = read_aligned_str(data, s_off)
                    build_scenes.append({"index": s_i, "levelFile": f"level{s_i}", "scenePath": sname})
            elif cid == 115:
                name, s_off = read_aligned_str(data, off)
                s_off += 20
                cn, s_off = read_aligned_str(data, s_off)
                ns, s_off = read_aligned_str(data, s_off)
                asm, s_off = read_aligned_str(data, s_off)
                full_cname = f"{ns}.{cn}" if ns else cn
                monoscripts[fn.lower()][pid] = {
                    "assembly": asm,
                    "namespace": ns,
                    "className": cn,
                    "fullClassName": full_cname,
                    "name": name,
                }
                asset_names[fn.lower()][pid] = {"name": full_cname, "type": "MonoScript"}
            elif cid == 1:
                nc = struct.unpack_from("<i", data, off)[0]
                name, _ = read_aligned_str(data, off + 4 + nc * 12 + 4)
                asset_names[fn.lower()][pid] = {"name": name, "type": "GameObject"}
            elif cid == 114:
                name, _ = read_aligned_str(data, off + 28)
                asset_names[fn.lower()][pid] = {"name": name, "type": "MonoBehaviour"}
            elif cid in NAMED_CLASS_IDS:
                try:
                    name, p_off = read_aligned_str(data, off)
                    asset_names[fn.lower()][pid] = {"name": name, "type": NAMED_CLASS_IDS[cid]}
                    if cid == 49:
                        byte_len = struct.unpack_from("<i", data, p_off)[0]
                        raw_bytes = data[p_off + 4 : p_off + 4 + byte_len]
                        is_text = not any(b == 0 for b in raw_bytes[:256])
                        preview = (
                            raw_bytes.decode("utf-8", errors="replace")
                            if is_text and byte_len <= 100000
                            else raw_bytes[:128].hex()
                        )
                        text_assets.append({
                            "file": fn,
                            "pathID": pid,
                            "name": name,
                            "byteLength": byte_len,
                            "isText": is_text,
                            "content": preview,
                        })
                except Exception:
                    pass

    print("[4/6] Deserializing all Balancing SheetHolders, Singletons & VisualConfigs...")
    sheets = {}
    singletons = {}
    difficulty_modifiers = []
    aoe_entries = []
    placement_feedbacks = []
    character_visual_configs = {}
    tutorial_entries = []
    ui_configs = {}

    for fn in ["sharedassets1.assets", "sharedassets2.assets", "sharedassets3.assets", "resources.assets"]:
        data, d_off, types, objs, exts = parsed_files[fn]

        def resolve_pptr(fid, pid, cur_fn=fn, cur_exts=exts):
            target_fn = cur_fn if fid == 0 else (cur_exts[fid - 1] if 0 < fid <= len(cur_exts) else "?")
            info = asset_names.get(target_fn, {}).get(pid)
            if info:
                return {"name": info["name"], "type": info["type"], "file": target_fn}
            return {"file": target_fn}

        resolver.pptr_resolver = resolve_pptr

        for pid, bstart, bsize, tid in objs:
            if types[tid][0] != 114:
                continue
            off = d_off + bstart
            go_fid, go_pid = struct.unpack_from("<iq", data, off)
            sc_fid, sc_pid = struct.unpack_from("<iq", data, off + 16)
            target_fn = fn if sc_fid == 0 else (exts[sc_fid - 1] if 0 < sc_fid <= len(exts) else "?")
            sc_info = monoscripts.get(target_fn, {}).get(sc_pid)
            if not sc_info:
                continue
            cname = sc_info["fullClassName"]
            if go_pid != 0:
                continue
            if not (cname.startswith("Ember.") or cname.startswith("gg.leyline.")):
                continue
            if cname not in resolver.name_to_td:
                continue

            name, p_off = read_aligned_str(data, off + 28)
            end_off = off + bsize
            deserialized = resolver.deserialize_monobehaviour(data, p_off, end_off, cname)
            deserialized["_assetName"] = name
            deserialized["_pathID"] = pid
            deserialized["_className"] = cname

            short_class = cname.split(".")[-1]
            if "SheetHolder" in short_class:
                sheets[short_class] = deserialized
            elif "Singleton" in short_class or short_class == "ActEntry":
                singletons[short_class] = deserialized
            elif "Difficulty.Modifiers" in cname:
                difficulty_modifiers.append(deserialized)
            elif short_class == "AoeEntry":
                aoe_entries.append(deserialized)
            elif short_class == "PlacementFeedbackEntry":
                placement_feedbacks.append(deserialized)
            elif short_class == "CharacterVisualConfig":
                character_visual_configs[pid] = deserialized
            elif "Tutorial" in short_class:
                tutorial_entries.append(deserialized)
            else:
                ui_configs[f"{fn}:{name or short_class}_{pid}"] = deserialized

    res_data, res_doff, res_types, res_objs, _ = parsed_files["resources.assets"]
    test_dbs = parse_ember_tests_databases(res_data, res_doff, res_types, res_objs)

    print("[5/6] Extracting Scene Hierarchies from level0..level21...")
    scene_Map = {s["levelFile"]: s["scenePath"] for s in build_scenes}
    scenes_extracted = []
    for i in range(22):
        fn = f"level{i}"
        if fn not in parsed_files:
            continue
        data, d_off, types, objs, exts = parsed_files[fn]
        gos = {}
        trs = {}
        scene_mbs = []
        for pid, bstart, bsize, tid in objs:
            cid = types[tid][0]
            off = d_off + bstart
            if cid == 1:
                nc = struct.unpack_from("<i", data, off)[0]
                comps = [struct.unpack_from("<iq", data, off + 4 + k * 12)[1] for k in range(nc)]
                layer = struct.unpack_from("<i", data, off + 4 + nc * 12)[0]
                name, s_off = read_aligned_str(data, off + 4 + nc * 12 + 4)
                tag, active = struct.unpack_from("<HB", data, s_off)
                gos[pid] = {"name": name, "layer": layer, "active": bool(active), "components": comps}
            elif cid in (4, 224):
                _, go_pid = struct.unpack_from("<iq", data, off)
                rot = [round(x, 4) for x in struct.unpack_from("<ffff", data, off + 12)]
                lpos = [round(x, 4) for x in struct.unpack_from("<fff", data, off + 28)]
                lscale = [round(x, 4) for x in struct.unpack_from("<fff", data, off + 40)]
                nch = struct.unpack_from("<i", data, off + 52)[0]
                children = [struct.unpack_from("<iq", data, off + 56 + k * 12)[1] for k in range(nch)]
                _, father_pid = struct.unpack_from("<iq", data, off + 56 + nch * 12)
                trs[pid] = {
                    "goPid": go_pid,
                    "fatherPid": father_pid,
                    "children": children,
                    "localPosition": lpos,
                    "localRotation": rot,
                    "localScale": lscale,
                }
            elif cid == 114:
                _, go_pid = struct.unpack_from("<iq", data, off)
                sc_fid, sc_pid = struct.unpack_from("<iq", data, off + 16)
                target_fn = fn if sc_fid == 0 else (exts[sc_fid - 1] if 0 < sc_fid <= len(exts) else "?")
                sc_info = monoscripts.get(target_fn, {}).get(sc_pid, {})
                scene_mbs.append({
                    "pathID": pid,
                    "gameObjectPathID": go_pid,
                    "script": sc_info.get("fullClassName", f"{target_fn}:{sc_pid}"),
                    "byteSize": bsize,
                })

        go_mb_map = defaultdict(list)
        for mb in scene_mbs:
            go_mb_map[mb["gameObjectPathID"]].append(mb["script"])

        def build_tree(tr_pid, depth=0):
            if tr_pid not in trs or depth > 12:
                return None
            tr = trs[tr_pid]
            go = gos.get(tr["goPid"], {"name": "?"})
            node = {
                "name": go["name"],
                "active": go.get("active", True),
                "pos": tr["localPosition"],
            }
            scripts = go_mb_map.get(tr["goPid"], [])
            if scripts:
                node["scripts"] = scripts
            if tr["children"]:
                ch_nodes = [build_tree(c, depth + 1) for c in tr["children"]]
                node["children"] = [c for c in ch_nodes if c is not None]
            return node

        root_trees = [
            build_tree(tid)
            for tid, tr in trs.items()
            if tr["fatherPid"] == 0 and tr["goPid"] in gos
        ]
        scenes_extracted.append({
            "levelFile": fn,
            "scenePath": scene_Map.get(fn, ""),
            "gameObjectCount": len(gos),
            "monoBehaviourCount": len(scene_mbs),
            "rootNodes": root_trees,
        })

    print("[6/6] Building cross-referenced summary and writing JSON + Markdown...")
    # Build lookup maps for cross-referencing
    guilds_by_id = {g["Id"]["id"]: g for g in sheets["GuildSheetHolder"]["Entries"]}
    classes_by_id = {c["Id"]["id"]: c for c in sheets["HeroClassSheetHolder"]["Entries"]}
    active_by_id = {a["Id"]["id"]: a for a in sheets["ActiveAbilitySheetHolder"]["Entries"]}
    passive_by_id = {p["Id"]["id"]: p for p in sheets["PassiveAbilitySheetHolder"]["Entries"]}
    specs_by_id = {s["Id"]["id"]: s for s in sheets["HeroSpecializationSheetHolder"]["Entries"]}
    spec_choices_by_hero = {
        sc["heroId"]: sc["specializationIds"]
        for sc in sheets["HeroSpecializationChoiceSheetHolder"]["Entries"]
    }
    enemies_by_id = {e["Id"]["id"]: e for e in sheets["EnemySheetHolder"]["Entries"]}
    items_by_id = {it["Id"]["id"]: it for it in sheets["ItemSheetHolder"]["Entries"]}
    relics_by_id = {r["Id"]["id"]: r for r in sheets["RelicSheetHolder"]["Entries"]}
    rank_mods_by_id = {rm["Id"]["id"]: rm for rm in sheets["RankModifierSheetHolder"]["Entries"]}
    stat_mods_by_id = {sm["Id"]["id"]: sm for sm in sheets["StatModSheetHolder"]["Entries"]}

    # Enrich Heroes
    enriched_heroes = []
    for h in sheets["HeroSheetHolder"]["Entries"]:
        hid = h["Id"]["id"]
        guild = guilds_by_id.get(h["guildID"])
        cls1 = classes_by_id.get(h["class1ID"])
        cls2 = classes_by_id.get(h["class2ID"])
        act_ab = active_by_id.get(h["activeAbilityID"])
        pas_ab = passive_by_id.get(h["passiveAbilityID"])
        spec_ids = spec_choices_by_hero.get(hid, [])
        hero_specs = []
        for sid in spec_ids:
            sp = specs_by_id.get(sid)
            if sp:
                sp_cls = classes_by_id.get(sp["classId"])
                sp_act = active_by_id.get(sp["activeAbilityId"])
                sp_pas = passive_by_id.get(sp["passiveAbilityId"])
                hero_specs.append({
                    "id": sid,
                    "name": (sp.get("NameLocaKey") or {}).get("text") or sp.get("NameText") or f"Spec_{sid}",
                    "bonusClass": (sp_cls.get("NameLocaKey") or {}).get("text") if sp_cls else None,
                    "activeAbility": {
                        "id": sp["activeAbilityId"],
                        "name": (sp_act.get("NameLocaKey") or {}).get("text") if sp_act else None,
                        "description": (sp_act.get("DescriptionLocaKey") or {}).get("text") if sp_act else None,
                    } if sp_act else None,
                    "passiveAbility": {
                        "id": sp["passiveAbilityId"],
                        "name": (sp_pas.get("NameLocaKey") or {}).get("text") if sp_pas else None,
                        "description": (sp_pas.get("DescriptionLocaKey") or {}).get("text") if sp_pas else None,
                    } if sp_pas else None,
                    "tags": sp.get("tags", []),
                })
        enriched_heroes.append({
            "id": hid,
            "fullId": h["Id"]["fullId"],
            "name": (h.get("NameLocaKey") or {}).get("text") or f"Hero_{hid}",
            "disabledInGame": h["DisabledInGame"],
            "gender": h["Gender"],
            "guild": (guild.get("NameLocaKey") or {}).get("text") or guild.get("title") if guild else None,
            "guildId": h["guildID"],
            "class1": (cls1.get("NameLocaKey") or {}).get("text") or cls1.get("title") if cls1 else None,
            "class1Id": h["class1ID"],
            "class2": (cls2.get("NameLocaKey") or {}).get("text") or cls2.get("title") if cls2 else None,
            "class2Id": h["class2ID"],
            "priceRange": h["PriceRange"],
            "tags": h["tags"],
            "stats": {
                "maxHealth": h["MaxHealth"],
                "maxMana": h["MaxMana"],
                "startingMana": h["StartingMana"],
                "manaRegen": h["ManaRegen"],
                "manaLockTime": h["ManaLockTime"],
                "defense": h["Defense"],
                "baseAttackDamage": h["BaseAttackDamage"],
                "attack": h["Attack"],
                "magic": h["Magic"],
                "attackRange": h["AttackRange"],
                "baseAttackSpeed": h["BaseAttackSpeed"],
                "attackSpeed": h["AttackSpeed"],
                "crit": h["Crit"],
                "moveSpeed": h["MoveSpeed"],
                "circleCollisorRadius": h["CircleCollisorRadius"],
                "attackSettings": h["AttackSettings"],
            },
            "startWithActiveAbility": h["StartWithActiveAbility"],
            "startingPassiveAbility": {
                "id": h["passiveAbilityID"],
                "name": (pas_ab.get("NameLocaKey") or {}).get("text") if pas_ab else None,
                "description": (pas_ab.get("DescriptionLocaKey") or {}).get("text") if pas_ab else None,
            } if pas_ab else None,
            "startingActiveAbility": {
                "id": h["activeAbilityID"],
                "name": (act_ab.get("NameLocaKey") or {}).get("text") if act_ab else None,
                "description": (act_ab.get("DescriptionLocaKey") or {}).get("text") if act_ab else None,
            } if act_ab else None,
            "specializations": hero_specs,
            "lore": {
                "alias": (h.get("Alias") or {}).get("text"),
                "subtitle": (h.get("Subtitle") or {}).get("text"),
                "currentGuild": (h.get("CurrentGuild") or {}).get("text"),
                "motivation": (h.get("Motivation") or {}).get("text"),
                "gameplay": (h.get("Gameplay") or {}).get("text"),
            },
            "visualConfig": character_visual_configs.get(h["VisualConfig"]["pathID"]),
        })

    output_payload = {
        "metadata": {
            "unityVersion": "6000.0.64f1",
            "serializedFileVersion": 22,
            "gameVersion": "0.5.13 (build 944, commit 7c7d4099)",
            "counts": {
                "heroes": len(enriched_heroes),
                "guilds": len(guilds_by_id),
                "heroClasses": len(classes_by_id),
                "heroSpecializations": len(specs_by_id),
                "activeAbilities": len(active_by_id),
                "passiveAbilities": len(passive_by_id),
                "items": len(items_by_id),
                "relics": len(relics_by_id),
                "rankModifiers": len(rank_mods_by_id),
                "enemies": len(enemies_by_id),
                "stages": len(sheets["StageSheetHolder"]["Entries"]),
                "events": len(sheets["EventSheetHolder"]["Entries"]),
                "crossroads": len(sheets["CrossroadsSheetHolder"]["Entries"]),
                "statMods": len(stat_mods_by_id),
                "singletons": len(singletons),
                "difficultyModifiers": len(difficulty_modifiers),
                "aoePatterns": len(aoe_entries),
                "characterVisualConfigs": len(character_visual_configs),
                "scenes": len(scenes_extracted),
                "localizationStrings": sum(loca_data["tables_summary"].values()),
            },
        },
        "enrichedHeroes": enriched_heroes,
        "sheets": sheets,
        "singletons": singletons,
        "difficultyModifiers": difficulty_modifiers,
        "aoeEntries": aoe_entries,
        "placementFeedbacks": placement_feedbacks,
        "characterVisualConfigs": character_visual_configs,
        "tutorialEntries": tutorial_entries,
        "uiConfigs": ui_configs,
        "testDatabases": test_dbs,
        "localizationTables": loca_data["full_tables"],
        "textAssets": text_assets,
        "scenes": scenes_extracted,
    }

    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(output_payload, f, indent=2, ensure_ascii=False)
    print(f"      Saved {OUT_JSON} ({os.path.getsize(OUT_JSON):,} bytes).")

    generate_markdown_summary(output_payload)
    print(f"      Saved {OUT_MD} ({os.path.getsize(OUT_MD):,} bytes).")


def generate_markdown_summary(data: dict):
    lines = []
    w = lines.append
    meta = data["metadata"]
    counts = meta["counts"]

    w("# Guildrun Demo — Complete Balancing & Asset Extraction Summary")
    w("")
    w(f"- **Engine**: Unity `{meta['unityVersion']}` (SerializedFile v{meta['serializedFileVersion']})")
    w(f"- **Game Version**: `{meta['gameVersion']}`")
    w("")
    w("## 1. Dataset Overview")
    w("")
    w("| Category | Count | Source Asset |")
    w("|---|---:|---|")
    for k, v in counts.items():
        w(f"| **{k}** | {v:,} | `sharedassets1.assets` / `StreamingAssets` / `level0..21` |")
    w("")

    # 2. Guilds (Origins) & Hero Classes (Synergies/Traits)
    w("## 2. Guilds (Origins) & Hero Classes (Traits)")
    w("")
    w("### 2.1 Guilds (`GuildSheetHolder` — 6 Guilds)")
    w("| ID | Name | TagName | Tagline | Description |")
    w("|---:|---|---|---|---|")
    for g in data["sheets"]["GuildSheetHolder"]["Entries"]:
        gid = g["Id"]["id"]
        name = (g.get("NameLocaKey") or {}).get("text") or g.get("title", "")
        tag = g.get("TagName", "")
        tagline = (g.get("Tagline") or {}).get("text") or ""
        desc = ((g.get("Description") or {}).get("text") or "").replace("\n", " ")
        w(f"| {gid} | **{name}** | `{tag}` | {tagline} | {desc} |")
    w("")

    w("### 2.2 Hero Classes (`HeroClassSheetHolder` — 7 Classes)")
    w("| ID | Class Name | TagName | Primary Stat | Secondary Stats | Description |")
    w("|---:|---|---|---|---|---|")
    for c in data["sheets"]["HeroClassSheetHolder"]["Entries"]:
        cid = c["Id"]["id"]
        name = (c.get("NameLocaKey") or {}).get("text") or c.get("title", "")
        tag = c.get("TagName", "")
        pstat = str(c.get("PrimaryStat", ""))
        sstats = ", ".join(str(s) for s in c.get("SecondaryStats", []))
        desc = ((c.get("DescriptionLocaKey") or {}).get("text") or "").replace("\n", " ")
        w(f"| {cid} | **{name}** | `{tag}` | {pstat} | {sstats} | {desc} |")
    w("")

    # 3. Playable Heroes
    w("## 3. Playable Heroes (`HeroSheetHolder` — 25 Heroes)")
    w("")
    w("| ID | Name | Active? | Guild | Class 1 | Class 2 | Price | HP | Mana (Start/Max/Regen) | DEF | DMG | ATK | MAG | RNG | ASPD (Base/Bonus) | CRIT | Move | Starting Ability | Specializations |")
    w("|---:|---|---|---|---|---|---|---:|---|---:|---:|---:|---:|---:|---|---:|---:|---|---|")
    for h in data["enrichedHeroes"]:
        st = h["stats"]
        pr = f"{h['priceRange']['x']}-{h['priceRange']['y']}"
        ab = h["startingActiveAbility"] or h["startingPassiveAbility"] or {}
        ab_str = f"{ab.get('name', 'None')} (#{ab.get('id', -1)})"
        sp_str = ", ".join(f"{s['name']} ({s['bonusClass']})" for s in h["specializations"])
        w(
            f"| {h['id']} | **{h['name']}** | {'No' if h['disabledInGame'] else 'Yes'} | "
            f"{h['guild'] or '-'} | {h['class1'] or '-'} | {h['class2'] or '-'} | {pr} | "
            f"{st['maxHealth']} | {st['startingMana']}/{st['maxMana']} (+{st['manaRegen']}) | "
            f"{st['defense']} | {st['baseAttackDamage']} | {st['attack']} | {st['magic']} | "
            f"{st['attackRange']} | {st['baseAttackSpeed']} (+{st['attackSpeed']}%) | "
            f"{st['crit']}% | {st['moveSpeed']} | {ab_str} | {sp_str} |"
        )
    w("")

    # 4. Hero Specializations
    w("## 4. Hero Specializations (`HeroSpecializationSheetHolder` — 75 Specializations)")
    w("")
    w("| Spec ID | Hero | Spec Name | Bonus Class | Passive Ability | Active Ability | Tags |")
    w("|---:|---|---|---|---|---|---|")
    for h in data["enrichedHeroes"]:
        for s in h["specializations"]:
            pa = s["passiveAbility"]
            aa = s["activeAbility"]
            pa_s = f"**{pa['name']}** (#{pa['id']}): {(pa['description'] or '').replace(chr(10), ' ')}" if pa else "-"
            aa_s = f"**{aa['name']}** (#{aa['id']}): {(aa['description'] or '').replace(chr(10), ' ')}" if aa else "-"
            w(f"| {s['id']} | {h['name']} | **{s['name']}** | {s['bonusClass'] or '-'} | {pa_s} | {aa_s} | {', '.join(s['tags'])} |")
    w("")

    # 5. Active & Passive Abilities
    w("## 5. Active Abilities (`ActiveAbilitySheetHolder` — 50 Abilities)")
    w("")
    w("| ID | Name | Target Hero | Rush / Stall (s) | Actions Count | Description |")
    w("|---:|---|---|---|---:|---|")
    for a in data["sheets"]["ActiveAbilitySheetHolder"]["Entries"]:
        aid = a["Id"]["id"]
        name = (a.get("NameLocaKey") or {}).get("text") or a.get("NameText") or f"Active_{aid}"
        desc = ((a.get("DescriptionLocaKey") or {}).get("text") or a.get("DescriptionText") or "").replace("\n", " ")
        th = a.get("targetHero", "")
        rush = a.get("RushDuration", 0)
        stall = a.get("StallDuration", 0)
        acts = len(a.get("AbilityActions") or [])
        w(f"| {aid} | **{name}** | {th} | {rush}s / {stall}s | {acts} | {desc} |")
    w("")

    w("## 6. Passive Abilities (`PassiveAbilitySheetHolder` — 88 Abilities)")
    w("")
    w("| ID | Name | Target Hero | Variables | Description |")
    w("|---:|---|---|---|---|")
    for p in data["sheets"]["PassiveAbilitySheetHolder"]["Entries"]:
        pid = p["Id"]["id"]
        name = (p.get("NameLocaKey") or {}).get("text") or p.get("NameText") or f"Passive_{pid}"
        desc_obj = p.get("DescriptionLocaKey") or {}
        desc = (desc_obj.get("text") or p.get("DescriptionText") or "").replace("\n", " ")
        th = p.get("targetHero", "")
        vars_str = ", ".join(f"`{{{k}}}={v}`" for k, v in (desc_obj.get("variables") or {}).items()) or "-"
        w(f"| {pid} | **{name}** | {th} | {vars_str} | {desc} |")
    w("")

    # 7. Items
    w("## 7. Items / Equipment (`ItemSheetHolder` — 174 Items)")
    w("")
    w("| ID | Name | Rarity | Stat Modifications | Description | Quest Description | Quest Reward |")
    w("|---:|---|---|---|---|---|---|")
    for it in data["sheets"]["ItemSheetHolder"]["Entries"]:
        iid = it["Id"]["id"]
        name = (it.get("NameLocaKey") or {}).get("text") or it.get("NameText") or f"Item_{iid}"
        rar = str(it.get("Rarity", ""))
        smods = ", ".join(f"{m.get('TargetStat')}: +{m.get('Value')}" for m in (it.get("StatModifications") or []))
        desc = ((it.get("DescriptionLocaKey") or {}).get("text") or it.get("DescriptionText") or "").replace("\n", " ")
        qdesc = ((it.get("QuestDescriptionLocaKey") or {}).get("text") or "").replace("\n", " ")
        qrdesc = ((it.get("QuestRewardDescriptionLocaKey") or {}).get("text") or "").replace("\n", " ")
        w(f"| {iid} | **{name}** | `{rar}` | {smods or '-'} | {desc} | {qdesc or '-'} | {qrdesc or '-'} |")
    w("")

    # 8. Relics
    w("## 8. Relics (`RelicSheetHolder` — 408 Relics)")
    w("")
    w("| ID | Name | Rarity | Disabled? | Description | Quest Description | Quest Reward |")
    w("|---:|---|---|---|---|---|---|")
    for r in data["sheets"]["RelicSheetHolder"]["Entries"]:
        rid = r["Id"]["id"]
        name = (r.get("NameLocaKey") or {}).get("text") or r.get("NameText") or f"Relic_{rid}"
        rar = str(r.get("Rarity", ""))
        dis = "Yes" if r.get("DisabledInGame") else "No"
        desc = ((r.get("DescriptionLocaKey") or {}).get("text") or r.get("DescriptionText") or "").replace("\n", " ")
        qdesc = ((r.get("QuestDescriptionLocaKey") or {}).get("text") or "").replace("\n", " ")
        qrdesc = ((r.get("QuestRewardDescriptionLocaKey") or {}).get("text") or "").replace("\n", " ")
        w(f"| {rid} | **{name}** | `{rar}` | {dis} | {desc} | {qdesc or '-'} | {qrdesc or '-'} |")
    w("")

    # 9. Rank Modifiers
    w("## 9. Rank Modifiers (`RankModifierSheetHolder` — 105 Modifiers)")
    w("")
    w("| ID | Name | Tags | Description |")
    w("|---:|---|---|---|")
    for rm in data["sheets"]["RankModifierSheetHolder"]["Entries"]:
        rmid = rm["Id"]["id"]
        name = (rm.get("NameLocaKey") or {}).get("text") or rm.get("NameText") or f"RankMod_{rmid}"
        tags = ", ".join(rm.get("tags") or [])
        desc = ((rm.get("DescriptionLocaKey") or {}).get("text") or rm.get("DescriptionText") or "").replace("\n", " ")
        w(f"| {rmid} | **{name}** | {tags} | {desc} |")
    w("")

    # 10. Global Singletons (Shop, Battle, Campfire, Statuses, Heroes, Player, Rewards)
    w("## 10. Core Balancing Singletons (Shop, Campfire, Statuses, Board, Battle)")
    w("")
    for sname in sorted(data["singletons"].keys()):
        s_obj = {k: v for k, v in data["singletons"][sname].items() if not k.startswith("_")}
        w(f"### 10.{sname}")
        w("```json")
        w(json.dumps(s_obj, indent=2, ensure_ascii=False))
        w("```")
        w("")

    # 11. Events & Crossroads
    w("## 11. Events (`EventSheetHolder` — 93 Events) & Crossroads (`CrossroadsSheetHolder` — 15 Crossroads)")
    w("")
    w("### 11.1 Crossroads (`CrossroadsSheetHolder`)")
    w("| ID | Name | Pool Type | Paths Count |")
    w("|---:|---|---|---:|")
    for cr in data["sheets"]["CrossroadsSheetHolder"]["Entries"]:
        crid = cr["Id"]["id"]
        name = (cr.get("NameLocaKey") or {}).get("text") or cr.get("NameText") or f"Crossroads_{crid}"
        pt = str(cr.get("PoolType", ""))
        paths = len(cr.get("Paths") or [])
        w(f"| {crid} | **{name}** | `{pt}` | {paths} |")
    w("")

    w("### 11.2 Events (`EventSheetHolder`)")
    w("| ID | Internal Title | Choices Count | First Choice Preview |")
    w("|---:|---|---:|---|")
    for ev in data["sheets"]["EventSheetHolder"]["Entries"]:
        evid = ev["Id"]["id"]
        name = ev.get("title") or f"Event_{evid}"
        ch_list = ev.get("EventChoices") or []
        choices = len(ch_list)
        first_ch = ((ch_list[0].get("ChoiceTextLocaKey") or {}).get("text") or "") if ch_list else ""
        first_ch = first_ch.replace("\n", " ")
        w(f"| {evid} | **{name}** | {choices} | {first_ch[:120]} |")
    w("")

    # 12. Enemies & Encounter Stages
    w("## 12. Enemies (`EnemySheetHolder` — 644 Entries) & Encounter Stages (`StageSheetHolder` — 247 Stages)")
    w("")
    w("### 12.1 Sample Enemy Definitions (`EnemySheetHolder` — First 80 Active Entries)")
    w("| ID | Name | VisualConfig | HP | Mana (Start/Max/Regen) | DEF | DMG | ATK | MAG | RNG | ASPD | CRIT | Move | Passive / Active ID |")
    w("|---:|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|")
    shown_enemies = 0
    for en in data["sheets"]["EnemySheetHolder"]["Entries"]:
        if en.get("DisabledInGame") and shown_enemies >= 20:
            continue
        eid = en["Id"]["id"]
        ename = (en.get("NameLocaKey") or {}).get("text") or (en.get("VisualConfig") or {}).get("name") or f"Enemy_{eid}"
        vc = (en.get("VisualConfig") or {}).get("name", "-")
        w(
            f"| {eid} | **{ename}** | `{vc}` | {en['MaxHealth']} | "
            f"{en['StartingMana']}/{en['MaxMana']} (+{en['ManaRegen']}) | {en['Defense']} | "
            f"{en['BaseAttackDamage']} | {en['Attack']} | {en['Magic']} | {en['AttackRange']} | "
            f"{en['BaseAttackSpeed']} (+{en['AttackSpeed']}%) | {en['Crit']}% | {en['MoveSpeed']} | "
            f"P:{en['passiveAbilityID']} / A:{en['activeAbilityID']} |"
        )
        shown_enemies += 1
        if shown_enemies >= 80:
            break
    w("")

    w("### 12.2 Sample Encounter Stages (`StageSheetHolder` — First 60 Stages)")
    w("| Stage ID | Group | Act | Floor | Type | Diff | EHP / EOFF | Scene | Enemies (ID & Pos) |")
    w("|---:|---|---:|---:|---|---:|---|---|---|")
    for stg in data["sheets"]["StageSheetHolder"]["Entries"][:60]:
        sid = stg["Id"]["id"]
        ep_str = ", ".join(
            f"{(ep['enemyId'].get('fullId') if isinstance(ep.get('enemyId'), dict) else ep.get('enemyId'))}@({ep['Position']['x']},{ep['Position']['y']})"
            for ep in (stg.get("EnemyPlacements") or [])
        )
        w(
            f"| {sid} | {stg.get('GroupName')} | {stg.get('ActNumber')} | {stg.get('FloorNumber')} | "
            f"`{stg.get('StageType')}` | {stg.get('DifficultyIndex')} | {stg.get('EffectiveHP')}/{stg.get('EffectiveOffense')} | "
            f"`{stg.get('EnvironmentSceneName')}` | {ep_str} |"
        )
    w("")

    # 13. Scenes
    w("## 13. Unity Scenes (`level0`..`level21`)")
    w("")
    w("| Level | Scene Path | GameObjects | MonoBehaviours | Root GameObjects |")
    w("|---|---|---:|---:|---|")
    for sc in data["scenes"]:
        roots = ", ".join(f"`{r['name']}`" for r in sc["rootNodes"][:8])
        w(f"| `{sc['levelFile']}` | `{sc['scenePath']}` | {sc['gameObjectCount']} | {sc['monoBehaviourCount']} | {roots} |")
    w("")

    with open(OUT_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


if __name__ == "__main__":
    main()

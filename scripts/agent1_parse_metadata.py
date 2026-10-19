#!/usr/bin/env python3
"""
Unity 6000.0.64f1 IL2CPP Global Metadata (v31) & GameAssembly.dll Parser for Guildrun Demo.
Extracts:
- Il2CppGlobalMetadataHeader (v31, magic 0xFAB11BAF)
- Strings table & String literals table
- Images & Assemblies
- TypeDefinitions (with full generic/array type resolution via GameAssembly.dll Il2CppMetadataRegistration)
- Fields, FieldOffsets, and FieldDefaultValues (enums + const values with IL2CPP v29+ compressed int decoding)
- Methods, Parameters, ParameterDefaultValues, and Method RVAs (via GameAssembly.dll Il2CppCodeGenModules)
- Properties

Outputs:
- c:/Users/Aceliweth/Downloads/rea/guildrun-web/re_data/il2cpp_ember_types.json
- c:/Users/Aceliweth/Downloads/rea/guildrun-web/re_data/il2cpp_ember_schema.md
"""

import json
import os
import re
import struct
from collections import defaultdict

METADATA_PATH = r"C:\Program Files (x86)\Steam\steamapps\common\Guildrun Demo\Guildrun_Data\il2cpp_data\Metadata\global-metadata.dat"
GAME_ASSEMBLY_PATH = r"C:\Program Files (x86)\Steam\steamapps\common\Guildrun Demo\GameAssembly.dll"
OUT_JSON_PATH = r"c:\Users\Aceliweth\Downloads\rea\guildrun-web\re_data\il2cpp_ember_types.json"
OUT_MD_PATH = r"c:\Users\Aceliweth\Downloads\rea\guildrun-web\re_data\il2cpp_ember_schema.md"

TARGET_ASSEMBLIES = [
    "ember.balancing.dll",
    "ember.rendering.dll",
    "ember.sandbox.dll",
    "ember.scopes.application.dll",
    "ember.scopes.battle.dll",
    "ember.scopes.battleSandbox.dll",
    "ember.scopes.campfire.dll",
    "ember.scopes.event.dll",
    "ember.scopes.gameRun.dll",
    "ember.scopes.gameRun.netcode.dll",
    "ember.scopes.mainMenu.dll",
    "ember.scopes.shop.dll",
    "ember.simulation.core.dll",
    "ember.simulation.unityRuntime.dll",
    "ember.synergySimulator.dll",
    "ember.system.dll",
    "ember.utilities.dll",
    "gg.leyline.balancing.dll",
    "gg.leyline.core.dll",
    "gg.leyline.tutorialsystem.dll",
    "gg.leyline.utilities.dll",
    "gg.leyline.netcode.dll",
    "gg.leyline.netcode.r3.dll",
    "gg.leyline.netcode.abstract.dll",
    "gg.leyline.netcode.utilities.dll",
    "gg.leyline.input.dll",
    "gg.leyline.input.abstract.dll",
    "gg.leyline.unitylocalization.dll",
    "gg.leyline.unitylocalization.data.dll",
    "gg.leyline.logging.dll",
    "gg.leyline.editorutils.dll",
    "Assembly-CSharp.dll",
]

HEADER_FIELDS_V31 = [
    "sanity",
    "version",
    "stringLiteralOffset",
    "stringLiteralSize",
    "stringLiteralDataOffset",
    "stringLiteralDataSize",
    "stringOffset",
    "stringSize",
    "eventsOffset",
    "eventsSize",
    "propertiesOffset",
    "propertiesSize",
    "methodsOffset",
    "methodsSize",
    "parameterDefaultValuesOffset",
    "parameterDefaultValuesSize",
    "fieldDefaultValuesOffset",
    "fieldDefaultValuesSize",
    "fieldAndParameterDefaultValueDataOffset",
    "fieldAndParameterDefaultValueDataSize",
    "fieldMarshaledSizesOffset",
    "fieldMarshaledSizesSize",
    "parametersOffset",
    "parametersSize",
    "fieldsOffset",
    "fieldsSize",
    "genericParametersOffset",
    "genericParametersSize",
    "genericParameterConstraintsOffset",
    "genericParameterConstraintsSize",
    "genericContainersOffset",
    "genericContainersSize",
    "nestedTypesOffset",
    "nestedTypesSize",
    "interfacesOffset",
    "interfacesSize",
    "vtableMethodsOffset",
    "vtableMethodsSize",
    "interfaceOffsetsOffset",
    "interfaceOffsetsSize",
    "typeDefinitionsOffset",
    "typeDefinitionsSize",
    "imagesOffset",
    "imagesSize",
    "assembliesOffset",
    "assembliesSize",
    "fieldRefsOffset",
    "fieldRefsSize",
    "referencedAssembliesOffset",
    "referencedAssembliesSize",
    "attributeDataOffset",
    "attributeDataSize",
    "attributeDataRangeOffset",
    "attributeDataRangeSize",
    "unresolvedVirtualCallParameterTypesOffset",
    "unresolvedVirtualCallParameterTypesSize",
    "unresolvedVirtualCallParameterRangesOffset",
    "unresolvedVirtualCallParameterRangesSize",
    "windowsRuntimeTypeNamesOffset",
    "windowsRuntimeTypeNamesSize",
    "windowsRuntimeStringsOffset",
    "windowsRuntimeStringsSize",
    "exportedTypeDefinitionsOffset",
    "exportedTypeDefinitionsSize",
]

PRIMITIVE_TYPE_NAMES = {
    1: "void",
    2: "bool",
    3: "char",
    4: "sbyte",
    5: "byte",
    6: "short",
    7: "ushort",
    8: "int",
    9: "uint",
    10: "long",
    11: "ulong",
    12: "float",
    13: "double",
    14: "string",
    22: "TypedReference",
    24: "IntPtr",
    25: "UIntPtr",
    28: "object",
}


def read_compressed_uint32(buf: bytes, off: int):
    b0 = buf[off]
    if (b0 & 0x80) == 0:
        return b0, off + 1
    elif (b0 & 0xC0) == 0x80:
        return ((b0 & 0x3F) << 8) | buf[off + 1], off + 2
    elif (b0 & 0xE0) == 0xC0:
        return (
            ((b0 & 0x1F) << 24)
            | (buf[off + 1] << 16)
            | (buf[off + 2] << 8)
            | buf[off + 3],
            off + 4,
        )
    elif b0 == 0xF0:
        return struct.unpack_from("<I", buf, off + 1)[0], off + 5
    elif b0 == 0xFE:
        return 0xFFFFFFFE, off + 1
    elif b0 == 0xFF:
        return 0xFFFFFFFF, off + 1
    else:
        return None, off + 1


def read_compressed_int32(buf: bytes, off: int):
    u, off = read_compressed_uint32(buf, off)
    if u is None:
        return None, off
    if u == 0xFFFFFFFF:
        return -2147483648, off
    is_neg = u & 1
    u >>= 1
    return (-(u + 1) if is_neg else u), off


class Il2CppParser:
    def __init__(self, meta_path: str, ga_path: str):
        with open(meta_path, "rb") as f:
            self.meta = f.read()
        with open(ga_path, "rb") as f:
            self.ga = f.read()

        self.header = self._parse_header()
        self._str_cache = {}
        self._init_pe_sections()
        self._init_type_short_names()
        self._init_ga_tables()
        self._init_default_values()

    def _parse_header(self) -> dict:
        vals = struct.unpack_from("<64i", self.meta, 0)
        hdr = dict(zip(HEADER_FIELDS_V31, vals))
        hdr["sanity_hex"] = f"0x{hdr['sanity'] & 0xFFFFFFFF:08X}"
        assert (hdr["sanity"] & 0xFFFFFFFF) == 0xFAB11BAF, "Invalid sanity magic"
        assert hdr["version"] == 31, f"Expected v31, got {hdr['version']}"
        return hdr

    def get_string(self, idx: int) -> str:
        if idx < 0:
            return ""
        res = self._str_cache.get(idx)
        if res is not None:
            return res
        s = self.header["stringOffset"] + idx
        e = self.meta.find(b"\x00", s)
        res = self.meta[s:e].decode("utf-8", "replace")
        self._str_cache[idx] = res
        return res

    def extract_string_literals(self) -> list:
        lit_off = self.header["stringLiteralOffset"]
        lit_cnt = self.header["stringLiteralSize"] // 8
        data_off = self.header["stringLiteralDataOffset"]
        literals = []
        for i in range(lit_cnt):
            length, d_idx = struct.unpack_from("<II", self.meta, lit_off + i * 8)
            s = data_off + d_idx
            val = self.meta[s : s + length].decode("utf-8", "replace")
            literals.append({"index": i, "length": length, "value": val})
        return literals

    def _init_pe_sections(self):
        pe_off = struct.unpack_from("<I", self.ga, 0x3C)[0]
        num_sec = struct.unpack_from("<H", self.ga, pe_off + 6)[0]
        opt_size = struct.unpack_from("<H", self.ga, pe_off + 20)[0]
        self.image_base = struct.unpack_from("<Q", self.ga, pe_off + 24 + 24)[0]
        self.sections = []
        for i in range(num_sec):
            s_off = pe_off + 24 + opt_size + i * 40
            _, vsize, va, rsize, roff = struct.unpack_from("<8sIIII", self.ga, s_off)
            self.sections.append((va, max(vsize, rsize), roff))

    def va2off(self, va: int):
        rva = va - self.image_base
        for sva, ssize, sroff in self.sections:
            if sva <= rva < sva + ssize:
                return sroff + (rva - sva)
        return None

    def _init_type_short_names(self):
        td_off = self.header["typeDefinitionsOffset"]
        self.td_count = self.header["typeDefinitionsSize"] // 88
        self.td_raw = []
        self.byval_to_td = {}
        for i in range(self.td_count):
            vals = struct.unpack_from("<16i8H2I", self.meta, td_off + i * 88)
            self.td_raw.append(vals)
            self.byval_to_td[vals[2]] = i

        gp_off = self.header["genericParametersOffset"]
        gp_cnt = self.header["genericParametersSize"] // 16
        self.gp_names = []
        for i in range(gp_cnt):
            _, name_idx, _, _, _, _ = struct.unpack_from("<2i2h2H", self.meta, gp_off + i * 16)
            self.gp_names.append(self.get_string(name_idx))

    def get_td_full_name(self, td_idx: int) -> str:
        if td_idx < 0 or td_idx >= self.td_count:
            return f"TypeDef#{td_idx}"
        vals = self.td_raw[td_idx]
        name = self.get_string(vals[0])
        ns = self.get_string(vals[1])
        decl_type_idx = vals[3]
        if decl_type_idx != -1 and decl_type_idx in self.byval_to_td:
            parent_td = self.byval_to_td[decl_type_idx]
            if parent_td != td_idx:
                return f"{self.get_td_full_name(parent_td)}.{name}"
        return f"{ns}.{name}" if ns else name

    def _init_ga_tables(self):
        # MetadataRegistration located at 0x73009f0:
        #   typesCount = 140505, types = 0x187457350
        #   fieldOffsetsCount = 32502, fieldOffsets = 0x187bec000
        # CodeRegistration codeGenModulesCount = 248, codeGenModules = 0x187c6af60
        self.types_count = 140505
        self.types_table_off = self.va2off(0x187457350)
        self.field_offsets_table_off = self.va2off(0x187BEC000)
        self._type_str_cache = {}
        self._type_va_cache = {}

        # Load CodeGenModules map: module_name -> list of method VAs
        cgm_table_off = self.va2off(0x187C6AF60)
        self.codegen_modules = {}
        for i in range(248):
            cgm_va = struct.unpack_from("<Q", self.ga, cgm_table_off + i * 8)[0]
            cgm_off = self.va2off(cgm_va)
            mname_va, mp_count, mp_va = struct.unpack_from("<QQQ", self.ga, cgm_off)
            mname_off = self.va2off(mname_va)
            e = self.ga.find(b"\x00", mname_off)
            mname = self.ga[mname_off:e].decode("utf-8", "replace")
            if mp_count > 0 and mp_va != 0:
                mp_off = self.va2off(mp_va)
                mps = struct.unpack_from(f"<{mp_count}Q", self.ga, mp_off)
            else:
                mps = ()
            self.codegen_modules[mname] = mps

    def resolve_type_va(self, type_va: int, depth: int = 0) -> str:
        if depth > 8:
            return "..."
        cached = self._type_va_cache.get(type_va)
        if cached is not None:
            return cached
        off = self.va2off(type_va)
        if off is None:
            return f"TypeVA_0x{type_va:x}"
        d, attrs, t, bf = struct.unpack_from("<QHBB", self.ga, off)
        byref = (bf >> 5) & 1
        prefix = "ref " if byref else ""

        if t in PRIMITIVE_TYPE_NAMES:
            base = PRIMITIVE_TYPE_NAMES[t]
        elif t in (17, 18):  # VALUETYPE, CLASS
            base = self.get_td_full_name(d)
        elif t == 29:  # SZARRAY
            elem = self.resolve_type_va(d, depth + 1)
            base = f"{elem}[]"
        elif t == 15:  # PTR
            elem = self.resolve_type_va(d, depth + 1)
            base = f"{elem}*"
        elif t == 20:  # ARRAY
            arr_off = self.va2off(d)
            etype_va, rank = struct.unpack_from("<QB", self.ga, arr_off)
            elem = self.resolve_type_va(etype_va, depth + 1)
            commas = "," * max(0, rank - 1)
            base = f"{elem}[{commas}]"
        elif t in (19, 30):  # VAR, MVAR
            base = self.gp_names[d] if 0 <= d < len(self.gp_names) else f"T{d}"
        elif t == 21:  # GENERICINST
            gc_off = self.va2off(d)
            gc_type_va, gc_inst_va = struct.unpack_from("<QQ", self.ga, gc_off)
            base_name = self.resolve_type_va(gc_type_va, depth + 1)
            base_name = re.sub(r"`\d+$", "", base_name)
            gi_off = self.va2off(gc_inst_va)
            argc, argv_va = struct.unpack_from("<QQ", self.ga, gi_off)
            argv_off = self.va2off(argv_va)
            arg_vas = struct.unpack_from(f"<{argc}Q", self.ga, argv_off)
            arg_names = [self.resolve_type_va(ava, depth + 1) for ava in arg_vas]
            base = f"{base_name}<{', '.join(arg_names)}>"
        else:
            base = f"Il2CppType({t}, 0x{d:x})"

        res = f"{prefix}{base}"
        self._type_va_cache[type_va] = res
        return res

    def resolve_type_index(self, type_idx: int) -> str:
        if type_idx < 0:
            return None
        cached = self._type_str_cache.get(type_idx)
        if cached is not None:
            return cached
        if type_idx >= self.types_count:
            return f"TypeIndex#{type_idx}"
        type_va = struct.unpack_from("<Q", self.ga, self.types_table_off + type_idx * 8)[0]
        res = self.resolve_type_va(type_va)
        self._type_str_cache[type_idx] = res
        return res

    def get_field_offset(self, td_idx: int, field_rel_idx: int):
        ptr_va = struct.unpack_from("<Q", self.ga, self.field_offsets_table_off + td_idx * 8)[0]
        if ptr_va == 0:
            return None
        off = self.va2off(ptr_va)
        if off is None:
            return None
        return struct.unpack_from("<i", self.ga, off + field_rel_idx * 4)[0]

    def _decode_default_value(self, val_type_idx: int, data_idx: int):
        if data_idx < 0:
            return None
        off = self.header["fieldAndParameterDefaultValueDataOffset"] + data_idx
        buf = self.meta
        if off >= len(buf):
            return None
        # Resolve underlying primitive type from Il2CppType table
        type_va = struct.unpack_from("<Q", self.ga, self.types_table_off + val_type_idx * 8)[0]
        t_off = self.va2off(type_va)
        d, _, t, _ = struct.unpack_from("<QHBB", self.ga, t_off)
        # If enum/valuetype, look up elementTypeIndex
        if t in (17, 18) and 0 <= d < self.td_count:
            elem_t_idx = self.td_raw[d][5]
            if elem_t_idx != -1 and elem_t_idx != val_type_idx:
                e_va = struct.unpack_from("<Q", self.ga, self.types_table_off + elem_t_idx * 8)[0]
                _, _, t, _ = struct.unpack_from("<QHBB", self.ga, self.va2off(e_va))

        if t == 2:  # BOOLEAN
            return bool(buf[off])
        elif t == 3:  # CHAR
            return chr(struct.unpack_from("<H", buf, off)[0])
        elif t == 4:  # I1 (sbyte)
            return struct.unpack_from("<b", buf, off)[0]
        elif t == 5:  # U1 (byte)
            return buf[off]
        elif t == 6:  # I2 (short)
            return struct.unpack_from("<h", buf, off)[0]
        elif t == 7:  # U2 (ushort)
            return struct.unpack_from("<H", buf, off)[0]
        elif t == 8:  # I4 (int, compressed)
            val, _ = read_compressed_int32(buf, off)
            return val
        elif t == 9:  # U4 (uint, compressed)
            val, _ = read_compressed_uint32(buf, off)
            return val
        elif t == 10:  # I8 (long)
            return struct.unpack_from("<q", buf, off)[0]
        elif t == 11:  # U8 (ulong)
            return struct.unpack_from("<Q", buf, off)[0]
        elif t == 12:  # R4 (float)
            return round(struct.unpack_from("<f", buf, off)[0], 7)
        elif t == 13:  # R8 (double)
            return struct.unpack_from("<d", buf, off)[0]
        elif t == 14:  # STRING (compressed int32 length + utf8 bytes)
            slen, s_off = read_compressed_int32(buf, off)
            if slen is None or slen < 0 or s_off + slen > len(buf):
                return None
            return buf[s_off : s_off + slen].decode("utf-8", "replace")
        return None

    def _init_default_values(self):
        self.field_defaults = {}
        fdv_off = self.header["fieldDefaultValuesOffset"]
        fdv_cnt = self.header["fieldDefaultValuesSize"] // 12
        for i in range(fdv_cnt):
            f_idx, vt_idx, d_idx = struct.unpack_from("<3i", self.meta, fdv_off + i * 12)
            self.field_defaults[f_idx] = self._decode_default_value(vt_idx, d_idx)

        self.param_defaults = {}
        pdv_off = self.header["parameterDefaultValuesOffset"]
        pdv_cnt = self.header["parameterDefaultValuesSize"] // 12
        for i in range(pdv_cnt):
            p_idx, vt_idx, d_idx = struct.unpack_from("<3i", self.meta, pdv_off + i * 12)
            self.param_defaults[p_idx] = self._decode_default_value(vt_idx, d_idx)

    def parse_images_and_assemblies(self):
        img_off = self.header["imagesOffset"]
        img_cnt = self.header["imagesSize"] // 40
        asm_off = self.header["assembliesOffset"]
        asm_cnt = self.header["assembliesSize"] // 64

        images = []
        for i in range(img_cnt):
            vals = struct.unpack_from("<10i", self.meta, img_off + i * 40)
            images.append({
                "index": i,
                "name": self.get_string(vals[0]),
                "assemblyIndex": vals[1],
                "typeStart": vals[2],
                "typeCount": vals[3],
                "exportedTypeStart": vals[4],
                "exportedTypeCount": vals[5],
                "entryPointIndex": vals[6],
                "token": f"0x{vals[7] & 0xFFFFFFFF:08X}",
            })

        assemblies = []
        for i in range(asm_cnt):
            vals = struct.unpack_from("<16i", self.meta, asm_off + i * 64)
            assemblies.append({
                "index": i,
                "imageIndex": vals[0],
                "token": f"0x{vals[1] & 0xFFFFFFFF:08X}",
                "referencedAssemblyStart": vals[2],
                "referencedAssemblyCount": vals[3],
                "name": self.get_string(vals[4]),
                "culture": self.get_string(vals[5]),
                "version": f"{vals[8]}.{vals[9]}.{vals[10]}.{vals[11]}",
            })
        return images, assemblies

    def parse_type_definition(self, td_idx: int, image_name: str) -> dict:
        vals = self.td_raw[td_idx]
        name = self.get_string(vals[0])
        ns = self.get_string(vals[1])
        full_name = self.get_td_full_name(td_idx)
        byval_idx = vals[2]
        decl_idx = vals[3]
        parent_idx = vals[4]
        elem_idx = vals[5]
        flags = vals[7]
        f_start, m_start, _, prop_start, nested_start, iface_start = vals[8:14]
        m_cnt, prop_cnt, f_cnt, _, nested_cnt, _, iface_cnt, _ = vals[16:24]
        bitfield = vals[24]
        token = vals[25]

        is_valuetype = bool(bitfield & 1)
        is_enum = bool(bitfield & 2)
        is_interface = bool(flags & 0x20)
        is_abstract = bool(flags & 0x80)
        is_sealed = bool(flags & 0x100)

        if is_enum:
            kind = "enum"
        elif is_valuetype:
            kind = "struct"
        elif is_interface:
            kind = "interface"
        else:
            kind = "class"

        parent_name = self.resolve_type_index(parent_idx) if parent_idx != -1 else None

        # Interfaces
        interfaces = []
        if iface_start != -1 and iface_cnt > 0:
            if_off = self.header["interfacesOffset"] + iface_start * 4
            if_indices = struct.unpack_from(f"<{iface_cnt}i", self.meta, if_off)
            interfaces = [self.resolve_type_index(ix) for ix in if_indices]

        # Nested types
        nested_types = []
        if nested_start != -1 and nested_cnt > 0:
            nt_off = self.header["nestedTypesOffset"] + nested_start * 4
            nt_indices = struct.unpack_from(f"<{nested_cnt}i", self.meta, nt_off)
            nested_types = [self.get_td_full_name(ix) for ix in nt_indices]

        # Fields
        fields = []
        f_table_off = self.header["fieldsOffset"]
        if f_start != -1 and f_cnt > 0:
            for rel_i in range(f_cnt):
                fi = f_start + rel_i
                fname_idx, ftype_idx, ftoken = struct.unpack_from(
                    "<3i", self.meta, f_table_off + fi * 12
                )
                fname = self.get_string(fname_idx)
                ftype_str = self.resolve_type_index(ftype_idx)
                # Get field attrs from Il2CppType
                f_va = struct.unpack_from("<Q", self.ga, self.types_table_off + ftype_idx * 8)[0]
                _, f_attrs, _, _ = struct.unpack_from("<QHBB", self.ga, self.va2off(f_va))
                is_static = bool(f_attrs & 0x10)
                is_literal = bool(f_attrs & 0x40)
                f_offset = self.get_field_offset(td_idx, rel_i)
                f_entry = {
                    "name": fname,
                    "type": ftype_str,
                    "offset": f"0x{f_offset:X}" if f_offset is not None and not is_literal else None,
                    "isStatic": is_static,
                    "isConst": is_literal,
                    "token": f"0x{ftoken & 0xFFFFFFFF:08X}",
                }
                if fi in self.field_defaults:
                    f_entry["defaultValue"] = self.field_defaults[fi]
                fields.append(f_entry)

        # Methods
        methods = []
        m_table_off = self.header["methodsOffset"]
        p_table_off = self.header["parametersOffset"]
        cgm_mps = self.codegen_modules.get(image_name, ())
        if m_start != -1 and m_cnt > 0:
            for rel_m in range(m_cnt):
                mi = m_start + rel_m
                (
                    mname_idx,
                    _,
                    ret_type_idx,
                    _,
                    p_start,
                    _,
                    mtoken,
                    mflags,
                    miflags,
                    mslot,
                    p_cnt,
                ) = struct.unpack_from("<7i4H", self.meta, m_table_off + mi * 36)
                mname = self.get_string(mname_idx)
                ret_str = self.resolve_type_index(ret_type_idx)
                rid = (mtoken & 0x00FFFFFF) - 1
                m_va = cgm_mps[rid] if 0 <= rid < len(cgm_mps) else 0
                m_rva = f"0x{m_va - self.image_base:X}" if m_va > self.image_base else None

                params = []
                if p_start != -1 and p_cnt > 0:
                    for rel_p in range(p_cnt):
                        pi = p_start + rel_p
                        pname_idx, ptoken, ptype_idx = struct.unpack_from(
                            "<3i", self.meta, p_table_off + pi * 12
                        )
                        p_entry = {
                            "name": self.get_string(pname_idx),
                            "type": self.resolve_type_index(ptype_idx),
                        }
                        if pi in self.param_defaults:
                            p_entry["defaultValue"] = self.param_defaults[pi]
                        params.append(p_entry)

                methods.append({
                    "name": mname,
                    "returnType": ret_str,
                    "parameters": params,
                    "isStatic": bool(mflags & 0x10),
                    "isVirtual": bool(mflags & 0x40),
                    "isAbstract": bool(mflags & 0x400),
                    "rva": m_rva,
                    "token": f"0x{mtoken & 0xFFFFFFFF:08X}",
                })

        # Properties
        properties = []
        prop_table_off = self.header["propertiesOffset"]
        if prop_start != -1 and prop_cnt > 0:
            for rel_pr in range(prop_cnt):
                pri = prop_start + rel_pr
                prname_idx, get_rel, set_rel, pr_attrs, pr_token = struct.unpack_from(
                    "<5i", self.meta, prop_table_off + pri * 20
                )
                prname = self.get_string(prname_idx)
                prop_type = None
                if get_rel >= 0 and get_rel < len(methods):
                    prop_type = methods[get_rel]["returnType"]
                elif set_rel >= 0 and set_rel < len(methods) and methods[set_rel]["parameters"]:
                    prop_type = methods[set_rel]["parameters"][-1]["type"]
                properties.append({
                    "name": prname,
                    "type": prop_type,
                    "hasGetter": get_rel >= 0,
                    "hasSetter": set_rel >= 0,
                    "token": f"0x{pr_token & 0xFFFFFFFF:08X}",
                })

        return {
            "typeDefIndex": td_idx,
            "name": name,
            "namespace": ns,
            "fullName": full_name,
            "kind": kind,
            "isAbstract": is_abstract,
            "isSealed": is_sealed,
            "baseType": parent_name,
            "underlyingType": self.resolve_type_index(elem_idx) if is_enum else None,
            "interfaces": interfaces,
            "nestedTypes": nested_types,
            "fields": fields,
            "properties": properties,
            "methods": methods,
            "token": f"0x{token & 0xFFFFFFFF:08X}",
        }


def is_compiler_generated(t: dict) -> bool:
    name = t["name"]
    full = t["fullName"]
    if name in ("<Module>", "EmbeddedAttribute", "NullableAttribute", "NullableContextAttribute", "IsUnmanagedAttribute"):
        return True
    if name.startswith("<>") or "<" in name or "__StaticArrayInitTypeSize" in name or "PrivateImplementationDetails" in full:
        return True
    if name.startswith("UnitySourceGeneratedAssemblyMonoScriptTypes"):
        return True
    return False


def filter_interesting_literals(literals: list) -> dict:
    categories = {
        "csv_and_balancing_keys": [],
        "addressables_and_assets": [],
        "simulation_and_combat": [],
        "shop_relics_items_quests": [],
        "netcode_and_backend": [],
        "ui_and_scopes": [],
    }
    seen = set()
    for entry in literals:
        s = entry["value"].strip()
        if len(s) < 3 or len(s) > 220 or s in seen:
            continue
        sl = s.lower()
        # Skip noisy system/unity/shader/stacktrace strings
        if any(x in sl for x in ["system.", "microsoft.", "unityengine.", "sirenix.", "http://www.w3.org", "shader", "hlsl"]):
            continue

        if any(k in sl for k in ["csv", "balancing", "sheet", "tier", "rarity", "statmodifier", "rankmodifier", "synergy", "guild", "archetype"]):
            seen.add(s)
            categories["csv_and_balancing_keys"].append(s)
        elif any(k in sl for k in ["addressable", "prefab", "sprite", "atlas", "vfx", "sfx", "fmod", "event:/"]):
            seen.add(s)
            categories["addressables_and_assets"].append(s)
        elif any(k in sl for k in ["damage", "mana", "health", "shield", "burn", "frost", "poison", "stun", "crit", "attack", "ability", "aoe", "rush", "stall", "storm", "hex", "combat", "battle"]):
            seen.add(s)
            categories["simulation_and_combat"].append(s)
        elif any(k in sl for k in ["shop", "reroll", "gold", "shard", "relic", "item", "quest", "campfire", "reward", "goblindeal", "investment"]):
            seen.add(s)
            categories["shop_relics_items_quests"].append(s)
        elif any(k in sl for k in ["supabase", "fusion", "photon", "lobby", "matchmaking", "session", "steam", "player", "rpc", "sync"]):
            seen.add(s)
            categories["netcode_and_backend"].append(s)
        elif any(k in sl for k in ["ember.", "guildrun", "sandbox", "tutorial", "tooltip", "mainmenu", "gamerun"]):
            seen.add(s)
            categories["ui_and_scopes"].append(s)

    for k in categories:
        categories[k] = categories[k][:150]
    return categories


def generate_markdown(data: dict, out_path: str):
    lines = []
    lines.append("# Guildrun Demo — IL2CPP v31 Metadata & Ember Architecture Reference")
    lines.append("")
    lines.append("- **Engine Version**: Unity `6000.0.64f1`")
    lines.append("- **IL2CPP Metadata Version**: `31` (Magic `0xFAB11BAF`)")
    lines.append(f"- **Total Images**: `{data['summary']['totalImages']}`")
    lines.append(f"- **Total TypeDefinitions**: `{data['summary']['totalTypeDefinitions']}`")
    lines.append(f"- **Total Methods**: `{data['summary']['totalMethods']}`")
    lines.append(f"- **Total Fields**: `{data['summary']['totalFields']}`")
    lines.append(f"- **Total String Literals**: `{data['summary']['totalStringLiterals']}`")
    lines.append(f"- **Target Game Assemblies Analyzed**: `{len(data['assemblies'])}`")
    lines.append("")

    # Table of Assemblies
    lines.append("## 1. Target Game Assemblies Overview")
    lines.append("")
    lines.append("| Assembly | Total Types | User Types | Enums | Structs | Classes | Interfaces |")
    lines.append("|----------|------------:|-----------:|------:|--------:|--------:|-----------:|")
    for asm_name, asm_info in data["assemblies"].items():
        ut = [t for t in asm_info["types"] if not is_compiler_generated(t)]
        enums = sum(1 for t in ut if t["kind"] == "enum")
        structs = sum(1 for t in ut if t["kind"] == "struct")
        classes = sum(1 for t in ut if t["kind"] == "class")
        ifaces = sum(1 for t in ut if t["kind"] == "interface")
        lines.append(
            f"| `{asm_name}` | {asm_info['typeCount']} | {len(ut)} | {enums} | {structs} | {classes} | {ifaces} |"
        )
    lines.append("")

    # Section 2: All Enums with Integer Constants
    lines.append("## 2. Complete Enum Reference (with Constant Values)")
    lines.append("")
    for asm_name, asm_info in data["assemblies"].items():
        enums = [t for t in asm_info["types"] if t["kind"] == "enum" and not is_compiler_generated(t)]
        if not enums:
            continue
        lines.append(f"### `{asm_name}` Enums ({len(enums)})")
        lines.append("")
        for e in enums:
            utype = e.get("underlyingType") or "int"
            lines.append(f"#### `{e['fullName']}` : `{utype}`")
            consts = [f for f in e["fields"] if f.get("isConst")]
            if consts:
                kv = ", ".join(f"`{c['name']} = {c.get('defaultValue')}`" for c in consts)
                lines.append(f"- {kv}")
            lines.append("")

    # Section 3: Detailed Classes, Structs & Interfaces per Assembly
    lines.append("## 3. Assembly-by-Assembly Classes, Structs & Interfaces")
    lines.append("")
    for asm_name, asm_info in data["assemblies"].items():
        user_types = [
            t for t in asm_info["types"]
            if t["kind"] != "enum" and not is_compiler_generated(t)
        ]
        if not user_types:
            continue
        lines.append(f"### `{asm_name}` ({len(user_types)} types)")
        lines.append("")
        for t in user_types:
            mods = []
            if t["isAbstract"] and t["kind"] != "interface":
                mods.append("abstract")
            if t["isSealed"] and t["kind"] == "class":
                mods.append("sealed")
            mod_str = (" ".join(mods) + " ") if mods else ""
            inh = []
            if t["baseType"] and t["baseType"] not in ("object", "System.Object", "System.ValueType"):
                inh.append(t["baseType"])
            inh.extend(t["interfaces"])
            inh_str = f" : {', '.join(inh)}" if inh else ""
            lines.append(f"#### {mod_str}{t['kind']} `{t['fullName']}`{inh_str}")

            if t["fields"]:
                lines.append("- **Fields**:")
                for f in t["fields"]:
                    st = "static " if f["isStatic"] else ""
                    cn = "const " if f["isConst"] else ""
                    off = f" `[{f['offset']}]`" if f.get("offset") else ""
                    dv = f" = `{repr(f['defaultValue'])}`" if "defaultValue" in f else ""
                    lines.append(f"  - `{cn}{st}{f['type']} {f['name']}`{dv}{off}")

            if t["properties"]:
                lines.append("- **Properties**:")
                for p in t["properties"]:
                    gs = []
                    if p["hasGetter"]:
                        gs.append("get;")
                    if p["hasSetter"]:
                        gs.append("set;")
                    lines.append(f"  - `{p['type']} {p['name']} {{ {' '.join(gs)} }}`")

            # Filter out property getter/setter and noisy boilerplate methods if desired, or keep user methods
            user_methods = [
                m for m in t["methods"]
                if not m["name"].startswith(("get_", "set_", "add_", "remove_"))
            ]
            if user_methods:
                lines.append("- **Methods**:")
                for m in user_methods:
                    st = "static " if m["isStatic"] else ""
                    rva = f" `RVA: {m['rva']}`" if m.get("rva") else ""
                    p_str = ", ".join(
                        f"{p['type']} {p['name']}" + (f" = {repr(p['defaultValue'])}" if "defaultValue" in p else "")
                        for p in m["parameters"]
                    )
                    lines.append(f"  - `{st}{m['returnType']} {m['name']}({p_str})`{rva}")
            lines.append("")

    # Section 4: Interesting String Literals
    lines.append("## 4. Notable String Literals by Category")
    lines.append("")
    for cat, items in data["interestingStringLiterals"].items():
        lines.append(f"### `{cat}` ({len(items)} samples)")
        lines.append("")
        for s in items[:80]:
            clean_s = s.replace("\r", "\\r").replace("\n", "\\n")
            lines.append(f"- `{clean_s}`")
        lines.append("")

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def main():
    os.makedirs(os.path.dirname(OUT_JSON_PATH), exist_ok=True)
    print("Loading global-metadata.dat and GameAssembly.dll...")
    parser = Il2CppParser(METADATA_PATH, GAME_ASSEMBLY_PATH)

    images, assemblies = parser.parse_images_and_assemblies()
    literals = parser.extract_string_literals()
    print(f"Parsed {len(images)} images, {parser.td_count} type definitions, {len(literals)} string literals.")

    img_by_name = {img["name"]: img for img in images}
    assemblies_dump = {}

    for target_name in TARGET_ASSEMBLIES:
        img = img_by_name.get(target_name)
        if not img:
            print(f"Warning: {target_name} not found in images!")
            continue
        t_start = img["typeStart"]
        t_count = img["typeCount"]
        types_list = []
        for td_idx in range(t_start, t_start + t_count):
            t_info = parser.parse_type_definition(td_idx, target_name)
            types_list.append(t_info)

        assemblies_dump[target_name] = {
            "imageIndex": img["index"],
            "assemblyIndex": img["assemblyIndex"],
            "typeStart": t_start,
            "typeCount": t_count,
            "types": types_list,
        }
        print(f"  Extracted {target_name}: {t_count} types")

    interesting_lits = filter_interesting_literals(literals)

    output_data = {
        "header": parser.header,
        "summary": {
            "unityVersion": "6000.0.64f1",
            "metadataVersion": parser.header["version"],
            "sanity": parser.header["sanity_hex"],
            "totalImages": len(images),
            "totalAssemblies": len(assemblies),
            "totalTypeDefinitions": parser.td_count,
            "totalMethods": parser.header["methodsSize"] // 36,
            "totalFields": parser.header["fieldsSize"] // 12,
            "totalParameters": parser.header["parametersSize"] // 12,
            "totalProperties": parser.header["propertiesSize"] // 20,
            "totalFieldDefaultValues": parser.header["fieldDefaultValuesSize"] // 12,
            "totalStringLiterals": len(literals),
        },
        "allImages": images,
        "assemblies": assemblies_dump,
        "interestingStringLiterals": interesting_lits,
    }

    print(f"Writing JSON to {OUT_JSON_PATH}...")
    with open(OUT_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)

    print(f"Writing Markdown schema to {OUT_MD_PATH}...")
    generate_markdown(output_data, OUT_MD_PATH)
    print("Done!")


if __name__ == "__main__":
    main()

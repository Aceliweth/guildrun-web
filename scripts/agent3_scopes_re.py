import struct
import os
import sys
import json
import capstone
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')

GAME_DIR = r"C:\Program Files (x86)\Steam\steamapps\common\Guildrun Demo"
METADATA_PATH = os.path.join(GAME_DIR, "Guildrun_Data", "il2cpp_data", "Metadata", "global-metadata.dat")
GA_PATH = os.path.join(GAME_DIR, "GameAssembly.dll")
OUT_JSON_PATH = r"c:\Users\Aceliweth\Downloads\rea\guildrun-web\re_data\scopes_data.json"

with open(METADATA_PATH, "rb") as f:
    meta = f.read()
with open(GA_PATH, "rb") as f:
    ga = f.read()

hdr = struct.unpack_from("<64I", meta, 0)
stringLiteralOffset, stringLiteralSize = hdr[2], hdr[3]
stringLiteralDataOffset, stringLiteralDataSize = hdr[4], hdr[5]
stringOffset, stringSize = hdr[6], hdr[7]
methodsOffset, methodsSize = hdr[12], hdr[13]
parametersOffset, parametersSize = hdr[22], hdr[23]
fieldsOffset, fieldsSize = hdr[24], hdr[25]
fieldDefaultValuesOffset, fieldDefaultValuesSize = hdr[16], hdr[17]
fieldDefaultValueDataOffset, fieldDefaultValueDataSize = hdr[18], hdr[19]
typeDefinitionsOffset, typeDefinitionsSize = hdr[40], hdr[41]
imagesOffset, imagesSize = hdr[42], hdr[43]

e_lfanew = struct.unpack_from("<I", ga, 0x3C)[0]
num_sections = struct.unpack_from("<H", ga, e_lfanew + 6)[0]
opt_hdr_size = struct.unpack_from("<H", ga, e_lfanew + 20)[0]
image_base = struct.unpack_from("<Q", ga, e_lfanew + 24 + 24)[0]

sections = []
sec_off = e_lfanew + 24 + opt_hdr_size
pdata_sec = None
for i in range(num_sections):
    s = ga[sec_off + i*40 : sec_off + (i+1)*40]
    name = s[:8].rstrip(b'\x00').decode('ascii', errors='replace')
    vsize, rva, raw_size, raw_ptr = struct.unpack_from("<IIII", s, 8)
    sections.append((name, rva, vsize, raw_ptr, raw_size))
    if name == ".pdata":
        pdata_sec = (rva, vsize, raw_ptr, raw_size)

func_bounds = {}
if pdata_sec:
    _, vsize, raw_ptr, raw_size = pdata_sec
    count = min(vsize, raw_size) // 12
    for i in range(count):
        b_rva, e_rva, uw_rva = struct.unpack_from("<III", ga, raw_ptr + i * 12)
        if b_rva > 0 and e_rva > b_rva:
            func_bounds[image_base + b_rva] = image_base + e_rva

def va_to_offset(va):
    rva = va - image_base
    for name, sec_rva, vsize, raw_ptr, raw_size in sections:
        if sec_rva <= rva < sec_rva + max(vsize, raw_size):
            if rva - sec_rva < raw_size:
                return raw_ptr + (rva - sec_rva)
    return None

def get_sec_name(va):
    rva = va - image_base
    for name, sec_rva, vsize, raw_ptr, raw_size in sections:
        if sec_rva <= rva < sec_rva + max(vsize, raw_size):
            return name
    return None

def get_str(idx):
    if idx < 0 or idx >= stringSize:
        return ""
    pos = stringOffset + idx
    end = meta.find(b'\x00', pos)
    return meta[pos:end].decode('utf-8', errors='replace')

def get_lit(idx):
    if idx < 0 or idx * 8 >= stringLiteralSize:
        return ""
    length, data_idx = struct.unpack_from("<Ii", meta, stringLiteralOffset + idx * 8)
    pos = stringLiteralDataOffset + data_idx
    return meta[pos:pos+length].decode('utf-8', errors='replace')

def get_cstr_ga(va):
    off = va_to_offset(va)
    if off is None:
        return ""
    end = ga.find(b'\x00', off)
    return ga[off:end].decode('utf-8', errors='replace')

mr = struct.unpack_from("<16Q", ga, 0x73009F0)
genericClasses_off = va_to_offset(mr[1])
genericInsts_off = va_to_offset(mr[3])
types_off = va_to_offset(mr[7])
methodSpecs_off = va_to_offset(mr[9])
fieldOffsets_off = va_to_offset(mr[11])

PRIMITIVES = {
    0x01: "void", 0x02: "bool", 0x03: "char", 0x04: "sbyte", 0x05: "byte",
    0x06: "short", 0x07: "ushort", 0x08: "int", 0x09: "uint", 0x0a: "long",
    0x0b: "ulong", 0x0c: "float", 0x0d: "double", 0x0e: "string",
    0x18: "IntPtr", 0x19: "UIntPtr", 0x1c: "object",
}

typedef_name_cache = {}
def get_typedef_name(td_idx, short=False):
    key = (td_idx, short)
    if key in typedef_name_cache:
        return typedef_name_cache[key]
    if td_idx < 0 or td_idx * 88 >= typeDefinitionsSize:
        return f"TD_{td_idx}"
    td = struct.unpack_from("<16i8H2I", meta, typeDefinitionsOffset + td_idx * 88)
    name = get_str(td[0])
    ns = get_str(td[1])
    decl = td[3]
    if decl >= 0:
        res = f"{get_type_name(decl, short)}+{name}"
    elif short:
        res = name
    else:
        res = f"{ns}.{name}" if ns else name
    typedef_name_cache[key] = res
    return res

def get_type_from_va(t_va, depth=0, short=True):
    if depth > 4:
        return "..."
    t_off = va_to_offset(t_va)
    if not t_off:
        return "unk"
    data_val, attrs, t_type = struct.unpack_from("<QHB", ga, t_off)
    if t_type in PRIMITIVES:
        return PRIMITIVES[t_type]
    if t_type in (0x11, 0x12):
        return get_typedef_name(data_val, short)
    if t_type == 0x1d:
        return f"{get_type_from_va(data_val, depth+1, short)}[]"
    if t_type == 0x14:
        arr_off = va_to_offset(data_val)
        elem_va, rank = struct.unpack_from("<QB", ga, arr_off)
        return f"{get_type_from_va(elem_va, depth+1, short)}[{','*(rank-1)}]"
    if t_type == 0x15:
        gc_off = va_to_offset(data_val)
        q0, q1 = struct.unpack_from("<QQ", ga, gc_off)
        base_name = get_typedef_name(q0, short) if q0 < 100000 else get_type_from_va(q0, depth+1, short)
        inst_off = va_to_offset(q1)
        if inst_off:
            argc, argv_va = struct.unpack_from("<QQ", ga, inst_off)
            argv_off = va_to_offset(argv_va)
            if argv_off and 0 < argc <= 16:
                arg_vas = struct.unpack_from(f"<{argc}Q", ga, argv_off)
                args = [get_type_from_va(ava, depth+1, short) for ava in arg_vas]
                return f"{base_name}<{', '.join(args)}>"
        return f"{base_name}<...>"
    if t_type in (0x13, 0x1e):
        return f"T{data_val}"
    return f"Type(0x{t_type:x})"

type_name_cache = {}
def get_type_name(type_idx, short=True):
    key = (type_idx, short)
    if key in type_name_cache:
        return type_name_cache[key]
    if type_idx < 0 or type_idx >= mr[6]:
        return f"Type_{type_idx}"
    t_va = struct.unpack_from("<Q", ga, types_off + type_idx * 8)[0]
    res = get_type_from_va(t_va, 0, short)
    type_name_cache[key] = res
    return res

def get_type_raw_code(type_idx):
    if type_idx < 0 or type_idx >= mr[6]:
        return 0
    t_va = struct.unpack_from("<Q", ga, types_off + type_idx * 8)[0]
    t_off = va_to_offset(t_va)
    if not t_off:
        return 0
    _, _, t_type = struct.unpack_from("<QHB", ga, t_off)
    return t_type

def read_compressed_uint(data, pos):
    b0 = data[pos]
    if (b0 & 0x80) == 0:
        return b0, pos + 1
    elif (b0 & 0xC0) == 0x80:
        return ((b0 & 0x3F) << 8) | data[pos + 1], pos + 2
    elif (b0 & 0xE0) == 0xC0:
        return ((b0 & 0x1F) << 24) | (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3], pos + 4
    elif b0 == 0xF0:
        return struct.unpack_from("<I", data, pos + 1)[0], pos + 5
    elif b0 == 0xFE:
        return 0xFFFFFFFE, pos + 1
    elif b0 == 0xFF:
        return 0xFFFFFFFF, pos + 1
    return 0, pos + 1

def read_compressed_int(data, pos):
    uval, next_pos = read_compressed_uint(data, pos)
    if uval == 0xFFFFFFFF:
        return -2147483648, next_pos
    is_neg = uval & 1
    uval >>= 1
    return (-uval - 1) if is_neg else uval, next_pos

field_defaults = {}
num_fdv = fieldDefaultValuesSize // 12
for i in range(num_fdv):
    f_idx, t_idx, d_idx = struct.unpack_from("<iii", meta, fieldDefaultValuesOffset + i * 12)
    if d_idx < 0:
        continue
    pos = fieldDefaultValueDataOffset + d_idx
    t_code = get_type_raw_code(t_idx)
    if t_code == 0x11:
        t_va = struct.unpack_from("<Q", ga, types_off + t_idx * 8)[0]
        t_off = va_to_offset(t_va)
        td_i = struct.unpack_from("<Q", ga, t_off)[0]
        if 0 <= td_i * 88 < typeDefinitionsSize:
            td = struct.unpack_from("<16i8H2I", meta, typeDefinitionsOffset + td_i * 88)
            elem_t_idx = td[5]
            t_code = get_type_raw_code(elem_t_idx)
    try:
        if t_code == 0x02:
            val = bool(meta[pos])
        elif t_code in (0x04, 0x05):
            val = meta[pos]
        elif t_code in (0x06, 0x07):
            val, _ = read_compressed_int(meta, pos)
        elif t_code == 0x08:
            val, _ = read_compressed_int(meta, pos)
        elif t_code == 0x09:
            val, _ = read_compressed_uint(meta, pos)
        elif t_code in (0x0a, 0x0b):
            val = struct.unpack_from("<q", meta, pos)[0]
        elif t_code == 0x0c:
            val = round(struct.unpack_from("<f", meta, pos)[0], 6)
        elif t_code == 0x0d:
            val = round(struct.unpack_from("<d", meta, pos)[0], 6)
        elif t_code == 0x0e:
            slen, npos = read_compressed_uint(meta, pos)
            if slen != 0xFFFFFFFF and npos + slen <= len(meta):
                val = meta[npos:npos+slen].decode('utf-8', errors='replace')
            else:
                val = None
        else:
            val, _ = read_compressed_int(meta, pos)
        field_defaults[f_idx] = val
    except Exception:
        pass

def get_method_full_name(m_idx, short_type=True):
    if m_idx < 0 or m_idx * 36 >= methodsSize:
        return f"M_{m_idx}"
    m = struct.unpack_from("<6iI4H", meta, methodsOffset + m_idx * 36)
    m_name = get_str(m[0])
    decl_td = m[1]
    return f"{get_typedef_name(decl_td, short_type)}.{m_name}"

def decode_metadata_usage(val):
    if (val & 1) == 0 or val > 0xFFFFFFFF:
        return None
    kind = (val >> 29) & 7
    idx = (val & 0x1FFFFFFE) >> 1
    if kind in (1, 2):
        return f"TypeInfo({get_type_name(idx, short=True)})"
    elif kind == 3:
        return f"MethodDef({get_method_full_name(idx, short_type=True)})"
    elif kind == 4:
        return f"FieldInfo({idx})"
    elif kind == 5:
        return f"String({repr(get_lit(idx))})"
    elif kind == 6:
        if idx * 12 >= mr[8] * 12:
            return f"MethodSpec({idx})"
        m_idx, c_inst, m_inst = struct.unpack_from("<iii", ga, methodSpecs_off + idx * 12)
        m_str = get_method_full_name(m_idx, short_type=True)
        args = []
        for inst_idx in (c_inst, m_inst):
            if inst_idx >= 0 and inst_idx < mr[2]:
                inst_va = struct.unpack_from("<Q", ga, genericInsts_off + inst_idx * 8)[0]
                inst_off = va_to_offset(inst_va)
                if inst_off:
                    argc, argv_va = struct.unpack_from("<QQ", ga, inst_off)
                    argv_off = va_to_offset(argv_va)
                    if argv_off and 0 < argc <= 16:
                        arg_vas = struct.unpack_from(f"<{argc}Q", ga, argv_off)
                        args.extend(get_type_from_va(ava, 0, short=True) for ava in arg_vas)
        return f"MethodSpec({m_str}<{', '.join(args)}>)"
    return f"Usage(kind={kind}, idx={idx})"

def get_field_offset(td_idx, field_local_idx):
    if td_idx < 0 or td_idx >= mr[10]:
        return None
    arr_va = struct.unpack_from("<Q", ga, fieldOffsets_off + td_idx * 8)[0]
    if arr_va == 0:
        return None
    arr_off = va_to_offset(arr_va)
    if arr_off is None:
        return None
    return struct.unpack_from("<i", ga, arr_off + field_local_idx * 4)[0]

cgm_table_off = va_to_offset(0x187C6AF60)
cgm_ptrs = struct.unpack_from("<248Q", ga, cgm_table_off)
cgm_by_name = {}
for ptr in cgm_ptrs:
    off = va_to_offset(ptr)
    name_va, mp_count, mp_va = struct.unpack_from("<QqQ", ga, off)
    mod_name = get_cstr_ga(name_va)
    mp_off = va_to_offset(mp_va)
    mps = struct.unpack_from(f"<{mp_count}Q", ga, mp_off) if (mp_off and mp_count > 0) else ()
    cgm_by_name[mod_name] = mps

va_to_methods = defaultdict(list)
num_images = imagesSize // 40
img_map = {}
for img_i in range(num_images):
    img = struct.unpack_from("<iiiIIiIIII", meta, imagesOffset + img_i * 40)
    img_name = get_str(img[0])
    img_map[img_name] = img
    mps = cgm_by_name.get(img_name, ())
    if not mps:
        continue
    for td_idx in range(img[2], img[2] + img[3]):
        td = struct.unpack_from("<16i8H2I", meta, typeDefinitionsOffset + td_idx * 88)
        methodStart, method_count = td[9], td[16]
        if methodStart < 0 or method_count == 0:
            continue
        td_name = get_typedef_name(td_idx, short=True)
        for m_i in range(methodStart, methodStart + method_count):
            m = struct.unpack_from("<6iI4H", meta, methodsOffset + m_i * 36)
            m_name = get_str(m[0])
            m_token = m[6]
            rid = (m_token & 0x00FFFFFF)
            if 1 <= rid <= len(mps):
                va = mps[rid - 1]
                if va > image_base:
                    if len(va_to_methods[va]) < 5:
                        va_to_methods[va].append(f"{td_name}.{m_name}")

md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_64)
md.detail = True

def extract_method_references(va, max_insns=200):
    if va <= image_base:
        return {"calls": [], "strings": [], "method_specs": []}
    off = va_to_offset(va)
    if off is None:
        return {"calls": [], "strings": [], "method_specs": []}
    end_va = func_bounds.get(va, va + 2048)
    size = min(end_va - va, 8192)
    calls = []
    strings = []
    method_specs = []
    count = 0
    for insn in md.disasm(ga[off:off+size], va):
        count += 1
        if count > max_insns or insn.mnemonic == "int3":
            break
        if insn.mnemonic in ("call", "jmp") and len(insn.operands) == 1 and insn.operands[0].type == capstone.x86.X86_OP_IMM:
            t_va = insn.operands[0].imm
            if t_va != 0x186033020 and t_va in va_to_methods:
                m_target = va_to_methods[t_va][0]
                if m_target not in calls:
                    calls.append(m_target)
        for op in insn.operands:
            if op.type == capstone.x86.X86_OP_MEM and op.mem.base == capstone.x86.X86_REG_RIP:
                t_va = insn.address + insn.size + op.mem.disp
                t_off = va_to_offset(t_va)
                sec = get_sec_name(t_va)
                if t_off is not None and sec == ".data":
                    val = struct.unpack_from("<Q", ga, t_off)[0]
                    dec = decode_metadata_usage(val)
                    if dec:
                        if dec.startswith("String("):
                            s_lit = dec[7:-1]
                            if s_lit not in strings:
                                strings.append(s_lit)
                        elif dec.startswith("MethodSpec("):
                            ms = dec[11:-1]
                            if ms not in method_specs:
                                method_specs.append(ms)
    return {"calls": calls, "strings": strings, "method_specs": method_specs}

TARGET_ASSEMBLIES = [
    "ember.scopes.mainMenu.dll",
    "ember.scopes.gameRun.dll",
    "ember.scopes.battle.dll",
    "ember.scopes.shop.dll",
    "ember.scopes.campfire.dll",
    "ember.scopes.event.dll",
    "ember.balancing.dll",
    "ember.system.dll",
]

enums_by_assembly = defaultdict(dict)
constants_by_assembly = defaultdict(dict)
classes_by_assembly = defaultdict(list)
event_catalog = []

for img_name in TARGET_ASSEMBLIES:
    if img_name not in img_map:
        continue
    img = img_map[img_name]
    mps = cgm_by_name.get(img_name, ())
    for td_idx in range(img[2], img[2] + img[3]):
        full_name = get_typedef_name(td_idx, short=False)
        if "MonoScript" in full_name or "<Module>" in full_name or "PrivateImplementationDetails" in full_name:
            continue
        td = struct.unpack_from("<16i8H2I", meta, typeDefinitionsOffset + td_idx * 88)
        parent_idx = td[4]
        fieldStart, methodStart = td[8], td[9]
        method_count, property_count, field_count = td[16], td[17], td[18]
        parent_name = get_type_name(parent_idx, short=False) if parent_idx >= 0 else None
        is_enum = (parent_name == "System.Enum")

        if is_enum:
            enum_vals = {}
            for f_local in range(field_count):
                f_i = fieldStart + f_local
                f_name_idx, f_type_idx, _ = struct.unpack_from("<iiI", meta, fieldsOffset + f_i * 12)
                f_name = get_str(f_name_idx)
                if f_name != "value__" and f_i in field_defaults:
                    enum_vals[f_name] = field_defaults[f_i]
            enums_by_assembly[img_name][full_name] = enum_vals
            continue

        # Check for compiler-generated closures unless part of EventLogic analysis
        if "<>" in full_name or "d__" in full_name:
            continue
        fields_list = []
        class_consts = {}
        for f_local in range(field_count):
            f_i = fieldStart + f_local
            f_name_idx, f_type_idx, _ = struct.unpack_from("<iiI", meta, fieldsOffset + f_i * 12)
            f_name = get_str(f_name_idx)
            f_type = get_type_name(f_type_idx, short=True)
            f_off = get_field_offset(td_idx, f_local)
            f_entry = {
                "name": f_name,
                "type": f_type,
                "offset": f"0x{f_off:02X}" if (f_off is not None and f_off >= 0) else None
            }
            if f_i in field_defaults:
                f_entry["default"] = field_defaults[f_i]
                class_consts[f_name] = field_defaults[f_i]
            fields_list.append(f_entry)

        if class_consts:
            constants_by_assembly[img_name][full_name] = class_consts

        methods_list = []
        event_refs = {"calls": [], "strings": [], "method_specs": []}
        is_event_logic = full_name.startswith("Ember.Scopes.GameRun.Events.Logic.Implementations.") and "+" not in full_name

        for m_i in range(methodStart, methodStart + method_count):
            m = struct.unpack_from("<6iI4H", meta, methodsOffset + m_i * 36)
            m_name = get_str(m[0])
            ret_type = get_type_name(m[2], short=True)
            param_start, param_count = m[4], m[10]
            m_token = m[6]
            rid = m_token & 0x00FFFFFF
            va = mps[rid - 1] if (1 <= rid <= len(mps)) else 0
            params = []
            for p_i in range(param_start, param_start + param_count):
                p_name_idx, _, p_type_idx = struct.unpack_from("<iIi", meta, parametersOffset + p_i * 12)
                params.append({"name": get_str(p_name_idx), "type": get_type_name(p_type_idx, short=True)})
            m_entry = {
                "name": m_name,
                "return_type": ret_type,
                "parameters": params,
                "va": f"0x{va:X}" if va > image_base else None,
                "rva": f"0x{va - image_base:X}" if va > image_base else None,
            }
            methods_list.append(m_entry)
            if is_event_logic and va > image_base:
                refs = extract_method_references(va, max_insns=220)
                for k in ("calls", "strings", "method_specs"):
                    for item in refs[k]:
                        if item not in event_refs[k]:
                            event_refs[k].append(item)

        cls_obj = {
            "typedef_index": td_idx,
            "full_name": full_name,
            "base_type": parent_name,
            "fields": fields_list,
            "methods": methods_list,
        }
        classes_by_assembly[img_name].append(cls_obj)

        if is_event_logic:
            event_catalog.append({
                "class_name": full_name.split(".")[-1],
                "full_name": full_name,
                "typedef_index": td_idx,
                "base_type": parent_name,
                "fields": fields_list,
                "methods": [m["name"] for m in methods_list],
                "referenced_strings": event_refs["strings"],
                "referenced_calls": event_refs["calls"],
                "referenced_method_specs": event_refs["method_specs"],
            })

BALANCING_DEFAULTS = {
    "PlayerSingleton": {
        "ctor_va": "0x180297F10",
        "StartingShards": 60,
        "StartingAccumulatedShards": 15,
        "AccumulatedShardsPerFightWon": 5
    },
    "RewardSelectionSingleton": {
        "ctor_va": "0x18029BA10",
        "InitialSelectionSize": 3,
        "_initialSelectionHeroPoolID": 1,
        "_basicInitialSelectionRelicPoolID": 1,
        "_specialInitialSelectionRelicPoolID": 1,
        "ShardRewardPerSurvivingHero": 1,
        "StartingBonusTokens": 0,
        "MaxBonusTokens": 4
    },
    "ShopSingleton": {
        "ctor_va": "0x18029D6E0",
        "ShardInterestInterval": 5,
        "MaxShardInterest": 20,
        "HeroChoicesPerShop": 5,
        "HeroChoicesPerSuperShop": 5,
        "ItemChoicesPerShop": 10,
        "ItemChoicesPerSuperShop": 10,
        "RelicChoicesPerShop": 1,
        "RelicChoicesPerSuperShop": 1,
        "BaseTeamSizeCost": 25,
        "TeamSizeIncrementCost": 50,
        "BaseRerollCost": 5,
        "RerollCostIncrement": 2,
        "SuperShopBaseRerollCost": 10,
        "FallbackSellMultiplier": 0.5,
        "FallbackSellMultiplier_FP_Raw": 32768,
        "_guaranteedTeamSizeIncreaseRelicId": 4500
    },
    "CampfireSingleton": {
        "ctor_va": "0x1802A32D0",
        "DefaultStartingActions": 2,
        "LifeRecoveredByRest": 15,
        "OriginChoiceCount": 6
    },
    "HeroesSingleton": {
        "ctor_va": "0x1802A5860",
        "StartingMaxHeroesOnBoard": 5,
        "MaxTotalHeroes": 6,
        "MaxItemSlots": 6,
        "ManaGeneratedPerAttack": 5,
        "MaxHeroRank": 3
    },
    "DifficultiesSingleton": {
        "ctor_va": "0x18028F480",
        "ChallengeWinsPerClass": 3,
        "_anchorItemId": 501
    },
    "ProgressionUnlocksSingleton": {
        "ctor_va": "0x180297FD0",
        "StageCompletionXpReward": 50,
        "VictoryXpReward": 100,
        "RegularEncounterWonXpReward": 15,
        "EndlessCycleXpReward": 10
    },
    "BattleSingleton": {
        "ctor_va": "0x1802A3130",
        "EndOfCombatDelay": 0.2,
        "EndOfCombatDelay_FP_Raw": 13107,
        "PostCombatVictoryResurrectDelay": 0.5,
        "RagdollMinImpactForce": 20.0,
        "RagdollMinDamage": 50,
        "RagdollMaxImpactForce": 60.0,
        "RagdollMaxDamage": 300
    },
    "EventsSingleton": {
        "ctor_va": "0x180292480",
        "RelicsToShowOnClassEvent": 4
    },
    "StatusSingleton": {
        "ctor_va": "0x1802521B0",
        "GlobalManaRegenInterval": 10.0,
        "PoisonDamageInterval": 1.0,
        "BurnDamageInterval": 1.0,
        "FrostDissipationInterval": 1.0,
        "BurnDamagePerStack": 1,
        "FrostAttackSpeedReductionPerStack": 1.0,
        "FrostDefenseReductionPerStack": 1.0,
        "PoisonDamagePerStack": 1,
        "StunDuration": 1.5,
        "StunResistanceBonusAmount": 0.25,
        "StunResistanceBonusDuration": 15.0,
        "SelkherasStoningCritBonus": 50,
        "BleedDamagePerStack": 1,
        "HealOverTimeDuration": 6.0
    }
}

FORMULAS = {
    "RunSessionService.CalculateCurrentSeed": {
        "va": "0x1804AC520",
        "expression": "((((initialSelectRerolls * 31 + shopRefreshCount) * 31 + (int)battleFlow) * 31 + (endlessFloorIndex >= 0 ? endlessFloorIndex : currentFloor)) * 31) + (currentRunSeed + 0x1D02628F)",
        "prime_offset_hex": "0x1D02628F",
        "prime_offset_dec": 486695567,
        "multiplier": 31
    },
    "ShopService.IsSuperShop": {
        "va": "0x1804954C0",
        "expression": "(lastSimulationReport.Result == BattleResultType.Victory) && (isBossFloor || isMiniBossFloor)"
    },
    "ShopService.ChallengeShopTax": {
        "va": "0x180494FC0",
        "expression": "baseTax + (shopVisitsInCurrentChunk - 1) * taxIncrement"
    },
    "ShopService.EffectiveRerollCost": {
        "va": "0x180495290",
        "expression": "(isSuperShop ? SuperShopBaseRerollCost(10) : BaseRerollCost(5)) + rerollCostDelta + rerollsInCurrentShop * RerollCostIncrement(2)"
    },
    "ShopData.TeamSizeUpgradeCost": {
        "va": "0x1804B1230",
        "expression": "BaseTeamSizeCost(25) + teamSizeUpgradesPurchased * TeamSizeIncrementCost(50)"
    },
    "ShopData.GetHeroSellPrice": {
        "va": "0x1804B1070",
        "expression": "(int)(((long)baseHeroCost * sellMultiplier.RawValue) >> 16)",
        "fallback_multiplier": 0.5
    },
    "ShopData.GetItemSellPrice": {
        "va": "0x1804B1150",
        "expression": "(int)(((long)baseItemCost * sellMultiplier.RawValue) >> 16)",
        "fallback_multiplier": 0.5
    },
    "PlayerService.SurvivingHeroesShardBonus": {
        "va": "0x1804A7530",
        "expression": "(ShardRewardPerSurvivingHero(1) + playerSurvivingHeroShardBonus + difficultySurvivingHeroShardDelta) * survivingHeroCount"
    },
    "PlayerService.CheckShardInterest": {
        "va": "0x1804A2630",
        "required_relic_id": 3037,
        "expression": "Math.Min((currentShards + combatShardsDelta) / ShardInterestInterval(5), MaxShardInterest(20))"
    },
    "ShopService.OddSmoothing": {
        "va": "0x180AD0470",
        "expression": "effectiveWeight[r] = Math.Max(0, baseWeight[r] + oddSmoothing[r]); on roll: oddSmoothing[r] = 0; after normal shop: for each unrolled r with baseWeight[r] > 0: oddSmoothing[r] += smoothingIncrement[r]"
    }
}

STATE_MACHINES = {
    "BattleFlowState": {
        "InitialSelection": 0,
        "Intro": 1,
        "Placement": 2,
        "Resolution": 3,
        "Result": 4,
        "Shop": 5,
        "Crossroads": 6,
        "Outro": 7,
        "Complete": 8,
        "transitions": [
            {"from": "InitialSelection", "to": "Intro", "trigger": "FinishInitialSelection()"},
            {"from": "Intro", "to": "Placement", "trigger": "StartPlacement()"},
            {"from": "Placement", "to": "Resolution", "trigger": "StartResolution() / StartCombat()"},
            {"from": "Resolution", "to": "Result", "trigger": "CompleteResolution() / OnBattleFinished()"},
            {"from": "Result", "to": "Intro", "trigger": "ProceedToNextFloor() [Defeat & Normal FightMode -> Retry Floor]"},
            {"from": "Result", "to": "Shop", "trigger": "OpenShop() [FloorNodeData.HasShop == true]"},
            {"from": "Shop", "to": "Crossroads", "trigger": "OpenCrossroads() [FloorNodeData.HasCrossroads == true]"},
            {"from": "Result", "to": "Crossroads", "trigger": "OpenCrossroads() [When Shop Skipped]"},
            {"from": "Crossroads", "to": "Intro", "trigger": "ProceedToNextFloor() [Normal/Elite/Boss Stage]"},
            {"from": "Crossroads", "to": "Placement", "trigger": "ProceedToNextFloor() [Endless Mode Skips Intro]"},
            {"from": "Result", "to": "Outro", "trigger": "StartOutro() [Run Victory or IsOutOfLives]"},
            {"from": "Outro", "to": "Complete", "trigger": "CompleteRun()"}
        ]
    }
}

output_data = {
    "metadata_info": {
        "unity_version": "6000.0.64f1",
        "il2cpp_metadata_version": 31,
        "image_base": f"0x{image_base:X}",
        "code_gen_modules_va": "0x187C6AF60",
        "metadata_registration_offset": "0x73009F0",
        "target_assemblies": TARGET_ASSEMBLIES,
    },
    "balancing_defaults": BALANCING_DEFAULTS,
    "formulas": FORMULAS,
    "state_machines": STATE_MACHINES,
    "event_catalog": event_catalog,
    "enums": dict(enums_by_assembly),
    "constants": dict(constants_by_assembly),
    "classes": dict(classes_by_assembly),
}

with open(OUT_JSON_PATH, "w", encoding="utf-8") as f:
    json.dump(output_data, f, indent=2)

print(f"Successfully generated {OUT_JSON_PATH}")
print(f"Total assemblies: {len(classes_by_assembly)}")
print(f"Total classes: {sum(len(v) for v in classes_by_assembly.values())}")
print(f"Total enums: {sum(len(v) for v in enums_by_assembly.values())}")
print(f"Total EventLogic implementations cataloged: {len(event_catalog)}")

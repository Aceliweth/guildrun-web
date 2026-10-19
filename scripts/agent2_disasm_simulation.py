#!/usr/bin/env python3
"""
agent2_disasm_simulation.py
===========================
Reverse-engineers the native x86_64 IL2CPP code of Guildrun Demo's simulation assemblies:
  - ember.simulation.core.dll       (648 types, 2,780 methods)
  - ember.simulation.unityRuntime.dll (60 types, 170 methods)
  - ember.synergySimulator.dll      (24 types, 68 methods)
  - ember.balancing.dll             (793 types, 3,475 methods - simulation bridge & sheets)
  - ember.scopes.gameRun.dll        (EnemyData wave scaling & HeroRankHelper)

Parses:
  - Guildrun_Data/il2cpp_data/Metadata/global-metadata.dat (IL2CPP v31, Unity 6000.0.64f1)
  - GameAssembly.dll (x86_64 PE, ImageBase = 0x180000000)

Outputs:
  - c:/Users/Aceliweth/Downloads/rea/guildrun-web/re_data/simulation_decompiled.json
  - c:/Users/Aceliweth/Downloads/rea/guildrun-web/re_data/simulation_combat_spec.md
"""

import json
import os
import struct
from pathlib import Path
import capstone

GAME_DIR = Path(r"C:\Program Files (x86)\Steam\steamapps\common\Guildrun Demo")
GAME_ASSEMBLY_PATH = GAME_DIR / "GameAssembly.dll"
METADATA_PATH = GAME_DIR / "Guildrun_Data" / "il2cpp_data" / "Metadata" / "global-metadata.dat"

OUT_DIR = Path(r"c:\Users\Aceliweth\Downloads\rea\guildrun-web\re_data")
OUT_JSON_PATH = OUT_DIR / "simulation_decompiled.json"
OUT_MD_PATH = OUT_DIR / "simulation_combat_spec.md"

# Verified registration addresses in GameAssembly.dll
G_CODE_REGISTRATION_VA = 0x18621FF50
G_METADATA_REGISTRATION_VA = 0x1873029F0
G_CODEGEN_MODULES_VA = 0x187C6AF60
G_CODEGEN_MODULES_COUNT = 248

# Known IL2CPP runtime helper VAs
RUNTIME_HELPERS = {
    0x186033020: "il2cpp_codegen_initialize_runtime_metadata",
    0x186033040: "il2cpp_codegen_initialize_runtime_metadata_inline",
    0x186033280: "il2cpp_codegen_object_new",
    0x186032300: "il2cpp_gc_wbarrier_set_field",
    0x1860322E0: "il2cpp_value_box",
    0x186032320: "il2cpp_object_is_inst",
    0x186032380: "il2cpp_array_new_specific",
    0x1860332D0: "il2cpp_codegen_raise_null_reference_exception",
    0x1860332E0: "il2cpp_codegen_raise_index_out_of_range_exception",
    0x186033290: "il2cpp_codegen_raise_exception",
    0x186033370: "il2cpp_runtime_class_init",
    0x18603BB40: "il2cpp_codegen_runtime_interface_invoke_lookup",
    0x18582A350: "InterfaceFuncInvoker0/1_Invoke",
    0x18582A0B0: "InterfaceActionInvoker0/1_Invoke",
    0x185832800: "IBalancingDatabase.GetSingleton<T>",
    0x185832940: "Dictionary_Add",
    0x184182E80: "FPMath.Ln",
    0x184182970: "FPMath.Exp",
    0x1841832E0: "FPMath.Min",
    0x1841831A0: "FPMath.Max",
    0x184183B80: "FPMath.SqrtRaw",
    0x1841803D0: "FP.FromString",
    0x1841763B0: "FPVector2.Normalize",
    0x18417C800: "FPVector3.Distance",
}


class IL2CPPBinaryParser:
    def __init__(self, pe_path: Path, meta_path: Path):
        self.pe_data = pe_path.read_bytes()
        self.meta_data = meta_path.read_bytes()
        self._parse_pe()
        self._parse_metadata_header()
        self._parse_registrations()

    def _parse_pe(self):
        pe_off = struct.unpack_from("<I", self.pe_data, 0x3C)[0]
        num_secs = struct.unpack_from("<H", self.pe_data, pe_off + 6)[0]
        opt_size = struct.unpack_from("<H", self.pe_data, pe_off + 20)[0]
        self.image_base = struct.unpack_from("<Q", self.pe_data, pe_off + 24 + 24)[0]
        sec_off = pe_off + 24 + opt_size
        self.sections = []
        for i in range(num_secs):
            s = sec_off + i * 40
            name = self.pe_data[s : s + 8].rstrip(b"\x00").decode("ascii", errors="ignore")
            vsize, rva, rsize, roff = struct.unpack_from("<IIII", self.pe_data, s + 8)
            self.sections.append((name, rva, vsize, roff, rsize))

    def va_to_offset(self, va: int):
        rva = va - self.image_base
        for _, r, vs, ro, rs in self.sections:
            if r <= rva < r + max(vs, rs):
                return ro + (rva - r)
        return None

    def read_u64(self, va: int) -> int:
        off = self.va_to_offset(va)
        return struct.unpack_from("<Q", self.pe_data, off)[0]

    def read_u32(self, va: int) -> int:
        off = self.va_to_offset(va)
        return struct.unpack_from("<I", self.pe_data, off)[0]

    def read_cstr(self, va: int) -> str:
        off = self.va_to_offset(va)
        if off is None:
            return ""
        end = self.pe_data.find(b"\x00", off)
        return self.pe_data[off:end].decode("utf-8", errors="replace")

    def _parse_metadata_header(self):
        magic, version = struct.unpack_from("<II", self.meta_data, 0)
        assert magic == 0xFAB11BAF and version == 31, f"Unexpected metadata header: {hex(magic)} v{version}"
        fields = struct.unpack_from("<68I", self.meta_data, 8)
        self.sl_off, self.sl_size = fields[0], fields[1]
        self.sld_off, self.sld_size = fields[2], fields[3]
        self.str_off, self.str_size = fields[4], fields[5]
        self.methods_off, self.methods_size = fields[10], fields[11]
        self.params_off, self.params_size = fields[20], fields[21]
        self.fields_off, self.fields_size = fields[22], fields[23]
        self.types_off, self.types_size = fields[38], fields[39]
        self.images_off, self.images_size = fields[40], fields[41]
        self.assemblies_off, self.assemblies_size = fields[42], fields[43]
        self.field_refs_off, self.field_refs_size = fields[44], fields[45]

        self.num_methods = self.methods_size // 36
        self.num_types = self.types_size // 88
        self.num_fields = self.fields_size // 12
        self.num_images = self.images_size // 40

    def get_meta_str(self, idx: int) -> str:
        pos = self.str_off + idx
        end = self.meta_data.find(b"\x00", pos)
        return self.meta_data[pos:end].decode("utf-8", errors="replace")

    def get_string_literal(self, idx: int) -> str:
        if idx < 0 or idx * 8 >= self.sl_size:
            return f"<invalid_str_lit_{idx}>"
        length, data_idx = struct.unpack_from("<II", self.meta_data, self.sl_off + idx * 8)
        start = self.sld_off + data_idx
        return self.meta_data[start : start + length].decode("utf-8", errors="replace")

    def _parse_registrations(self):
        # Parse Il2CppMetadataRegistration
        mr_off = self.va_to_offset(G_METADATA_REGISTRATION_VA)
        mr_fields = struct.unpack_from("<16Q", self.pe_data, mr_off)
        self.types_count = mr_fields[6]
        self.types_va = mr_fields[7]
        self.types_table_off = self.va_to_offset(self.types_va)
        self.field_offsets_count = mr_fields[10]
        self.field_offsets_va = mr_fields[11]
        self.field_offsets_table_off = self.va_to_offset(self.field_offsets_va)

        # Parse Il2CppCodeGenModules
        self.modules = {}
        mods_off = self.va_to_offset(G_CODEGEN_MODULES_VA)
        for i in range(G_CODEGEN_MODULES_COUNT):
            mod_va = struct.unpack_from("<Q", self.pe_data, mods_off + i * 8)[0]
            m_off = self.va_to_offset(mod_va)
            name_va, method_count, method_ptrs_va = struct.unpack_from("<QQQ", self.pe_data, m_off)
            name = self.read_cstr(name_va)
            self.modules[name] = {
                "module_va": mod_va,
                "method_count": method_count,
                "method_pointers_va": method_ptrs_va,
            }

        # Map image metadata
        self.images = {}
        for i in range(self.num_images):
            im_off = self.images_off + i * 40
            name_idx, asm_idx, type_start, type_count, exported_start, exported_count, entry_pt, token, ca_start, ca_count = (
                struct.unpack_from("<iiiiiiIIIi", self.meta_data, im_off)
            )
            name = self.get_meta_str(name_idx)
            self.images[name] = {
                "image_index": i,
                "type_start": type_start,
                "type_count": type_count,
            }

        # Build VA -> Method name lookup across all modules & methods
        self.va_to_method = dict(RUNTIME_HELPERS)
        self.method_idx_to_info = {}
        for img_name, img_info in self.images.items():
            mod = self.modules.get(img_name)
            if not mod:
                continue
            mp_off = self.va_to_offset(mod["method_pointers_va"])
            mp_count = mod["method_count"]
            for t_idx in range(img_info["type_start"], img_info["type_start"] + img_info["type_count"]):
                t_off = self.types_off + t_idx * 88
                t_fields = struct.unpack_from("<22i", self.meta_data, t_off)
                t_name = self.get_meta_str(t_fields[0])
                t_ns = self.get_meta_str(t_fields[1])
                full_type = f"{t_ns}.{t_name}" if t_ns else t_name
                m_start, m_count = t_fields[9], t_fields[17] & 0xFFFF
                for m_idx in range(m_start, m_start + m_count):
                    m_off = self.methods_off + m_idx * 36
                    m_name_idx, _, ret_type_idx, _, _, _, m_token, m_flags, m_iflags, m_slot, m_pcount = (
                        struct.unpack_from("<iiiiiiIHHHH", self.meta_data, m_off)
                    )
                    m_name = self.get_meta_str(m_name_idx)
                    rid = m_token & 0x00FFFFFF
                    m_va = 0
                    if 1 <= rid <= mp_count and mp_off is not None:
                        m_va = struct.unpack_from("<Q", self.pe_data, mp_off + (rid - 1) * 8)[0]
                    sig = f"{full_type}.{m_name}"
                    self.method_idx_to_info[m_idx] = {
                        "image": img_name,
                        "type": full_type,
                        "name": m_name,
                        "signature": sig,
                        "va": m_va,
                        "rid": rid,
                        "slot": m_slot,
                    }
                    if m_va and m_va not in self.va_to_method:
                        self.va_to_method[m_va] = sig

    def format_type_by_index(self, type_idx: int, depth: int = 0) -> str:
        if type_idx < 0 or type_idx >= self.types_count or depth > 3:
            return f"Type#{type_idx}"
        t_va = struct.unpack_from("<Q", self.pe_data, self.types_table_off + type_idx * 8)[0]
        t_off = self.va_to_offset(t_va)
        if t_off is None:
            return f"Type#{type_idx}"
        data_val, attrs_and_type = struct.unpack_from("<QI", self.pe_data, t_off)
        etype = (attrs_and_type >> 16) & 0xFF
        primitives = {
            0x01: "void", 0x02: "bool", 0x03: "char", 0x04: "sbyte", 0x05: "byte",
            0x06: "short", 0x07: "ushort", 0x08: "int", 0x09: "uint", 0x0A: "long",
            0x0B: "ulong", 0x0C: "float", 0x0D: "double", 0x0E: "string",
            0x18: "IntPtr", 0x19: "UIntPtr", 0x1C: "object",
        }
        if etype in primitives:
            return primitives[etype]
        if etype in (0x11, 0x12):  # VALUETYPE / CLASS
            if 0 <= data_val < self.num_types:
                td_off = self.types_off + data_val * 88
                n_idx, ns_idx = struct.unpack_from("<ii", self.meta_data, td_off)
                n = self.get_meta_str(n_idx)
                ns = self.get_meta_str(ns_idx)
                return f"{ns}.{n}" if ns else n
        elif etype == 0x1D:  # SZARRAY
            elem_off = self.va_to_offset(data_val)
            if elem_off:
                elem_data, elem_at = struct.unpack_from("<QI", self.pe_data, elem_off)
                elem_etype = (elem_at >> 16) & 0xFF
                if elem_etype in primitives:
                    return f"{primitives[elem_etype]}[]"
                if elem_etype in (0x11, 0x12) and 0 <= elem_data < self.num_types:
                    td_off = self.types_off + elem_data * 88
                    n_idx, ns_idx = struct.unpack_from("<ii", self.meta_data, td_off)
                    n = self.get_meta_str(n_idx)
                    ns = self.get_meta_str(ns_idx)
                    return f"{ns}.{n}[]" if ns else f"{n}[]"
            return "Array"
        elif etype == 0x15:  # GENERICINST
            gi_off = self.va_to_offset(data_val)
            if gi_off:
                gtd_idx, g_argc, g_argv_va = struct.unpack_from("<qIQ", self.pe_data, gi_off)
                if 0 <= gtd_idx < self.num_types:
                    td_off = self.types_off + gtd_idx * 88
                    n_idx, ns_idx = struct.unpack_from("<ii", self.meta_data, td_off)
                    n = self.get_meta_str(n_idx)
                    ns = self.get_meta_str(ns_idx)
                    base_name = f"{ns}.{n}" if ns else n
                    return base_name
        return f"Type(0x{etype:x})"

    def extract_assembly_schema(self, image_name: str):
        img = self.images[image_name]
        mod = self.modules[image_name]
        mp_off = self.va_to_offset(mod["method_pointers_va"])
        mp_count = mod["method_count"]
        types_out = []

        for t_idx in range(img["type_start"], img["type_start"] + img["type_count"]):
            t_off = self.types_off + t_idx * 88
            t_fields = struct.unpack_from("<22i", self.meta_data, t_off)
            name = self.get_meta_str(t_fields[0])
            ns = self.get_meta_str(t_fields[1])
            full_name = f"{ns}.{name}" if ns else name
            if full_name == "<Module>":
                continue

            f_start = t_fields[8]
            m_start = t_fields[9]
            f_count = t_fields[16] & 0xFFFF
            m_count = t_fields[17] & 0xFFFF
            flags = t_fields[14]

            # Field offsets array pointer for this TypeDefinition
            fo_array_va = struct.unpack_from("<Q", self.pe_data, self.field_offsets_table_off + t_idx * 8)[0]
            fo_array_off = self.va_to_offset(fo_array_va) if fo_array_va else None

            fields_list = []
            for f_i in range(f_count):
                f_idx = f_start + f_i
                f_name_idx, f_type_idx, f_token = struct.unpack_from("<iiI", self.meta_data, self.fields_off + f_idx * 12)
                f_name = self.get_meta_str(f_name_idx)
                f_type = self.format_type_by_index(f_type_idx)
                f_offset = struct.unpack_from("<i", self.pe_data, fo_array_off + f_i * 4)[0] if fo_array_off else -1
                fields_list.append({
                    "name": f_name,
                    "type": f_type,
                    "offset": f"0x{f_offset:x}" if f_offset >= 0 else "-1",
                })

            methods_list = []
            for m_i in range(m_count):
                m_idx = m_start + m_i
                m_off = self.methods_off + m_idx * 36
                m_name_idx, _, ret_type_idx, _, param_start, _, m_token, m_flags, m_iflags, m_slot, m_pcount = (
                    struct.unpack_from("<iiiiiiIHHHH", self.meta_data, m_off)
                )
                m_name = self.get_meta_str(m_name_idx)
                ret_type = self.format_type_by_index(ret_type_idx)
                rid = m_token & 0x00FFFFFF
                m_va = 0
                if 1 <= rid <= mp_count:
                    m_va = struct.unpack_from("<Q", self.pe_data, mp_off + (rid - 1) * 8)[0]

                params = []
                if param_start >= 0:
                    for p_i in range(m_pcount):
                        p_idx = param_start + p_i
                        p_name_idx, p_token, p_type_idx = struct.unpack_from("<iIi", self.meta_data, self.params_off + p_idx * 12)
                        p_name = self.get_meta_str(p_name_idx)
                        p_type = self.format_type_by_index(p_type_idx)
                        params.append(f"{p_type} {p_name}")

                methods_list.append({
                    "name": m_name,
                    "return_type": ret_type,
                    "parameters": params,
                    "va": f"0x{m_va:x}" if m_va else "0x0",
                    "rid": rid,
                    "slot": m_slot,
                })

            types_out.append({
                "type_def_index": t_idx,
                "full_name": full_name,
                "flags": f"0x{flags:x}",
                "fields": fields_list,
                "methods": methods_list,
            })

        return {
            "image_name": image_name,
            "module_va": f"0x{mod['module_va']:x}",
            "method_count": mod["method_count"],
            "method_pointers_va": f"0x{mod['method_pointers_va']:x}",
            "type_count": len(types_out),
            "types": types_out,
        }

    def resolve_rip_metadata(self, target_va: int) -> str:
        off = self.va_to_offset(target_va)
        if off is None or off + 8 > len(self.pe_data):
            return ""
        val = struct.unpack_from("<Q", self.pe_data, off)[0]
        if (val & 1) == 0 or val > 0xFFFFFFFF:
            return ""
        usage = (val >> 29) & 0x7
        idx = (val >> 1) & 0x0FFFFFFF
        if usage == 5:  # StringLiteral
            s = self.get_string_literal(idx)
            return f'StringLiteral("{s}")'
        elif usage == 3:  # MethodDef
            info = self.method_idx_to_info.get(idx)
            if info:
                return f"MethodDef({info['signature']})"
        elif usage in (1, 2):  # TypeInfo / Il2CppType
            t_str = self.format_type_by_index(idx)
            return f"TypeInfo({t_str})"
        return ""

    def disassemble_method(self, va: int, max_insns: int = 180) -> list[str]:
        off = self.va_to_offset(va)
        if off is None:
            return []
        md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_64)
        md.detail = True
        lines = []
        for idx, insn in enumerate(md.disasm(self.pe_data[off : off + max_insns * 10], va)):
            if idx >= max_insns or insn.mnemonic == "int3":
                break
            comment = ""
            # Check direct call/jmp target
            if insn.mnemonic in ("call", "jmp") and insn.op_str.startswith("0x"):
                try:
                    target_va = int(insn.op_str, 16)
                    if target_va in self.va_to_method:
                        comment = f" ; {self.va_to_method[target_va]}"
                except ValueError:
                    pass
            # Check RIP-relative operand
            if "[rip +" in insn.op_str or "[rip -" in insn.op_str:
                for op in insn.operands:
                    if op.type == capstone.x86.X86_OP_MEM and op.mem.base == capstone.x86.X86_REG_RIP:
                        rip_target = insn.address + insn.size + op.mem.disp
                        meta_str = self.resolve_rip_metadata(rip_target)
                        if meta_str:
                            comment = f" ; {meta_str}"
            lines.append(f"0x{insn.address:x}: {insn.mnemonic:8s} {insn.op_str}{comment}")
        return lines


CORE_METHODS_DECOMPILATION = [
    {
        "name": "BattleSimulation..ctor",
        "va": 0x180554B70,
        "assembly": "ember.simulation.core.dll",
        "purpose": "Initializes the deterministic simulation system pipeline and FightMode-conditional end-condition systems.",
        "pseudocode": """public BattleSimulation(SimulationDependencies dependencies, SimulationInputData inputData)
{
    Initialize(dependencies, inputData);
    var systems = new List<SystemBase>(14)
    {
        new TemporaryEffectsSystem(),      // [0] Reset temp stats/caps & apply Frost attack speed slow
        new EffectsUpdateSystem(),         // [1] Restore pending, tick Rush/Stall/PerFrame/OnInterval/timed effects
        new EntityTargetingSystem(),       // [2] Acquire/re-evaluate closest enemy target
        new StatusUpdateSystem(),          // [3] Tick Poison, Burn, Frost, Stun/Immunity, Shields, StatReductions, Heal/sec
        new ManaRegenSystem(),             // [4] Tick ManaRegenLockTimer & GlobalManaRegenInterval
        new PathfindingSystem(),           // [5] Update BlockedCells & run backwards multi-source Dijkstra
        new EntityFsmSystem(),             // [6] Tick EntityFsm (Idle/Move/Attack/Ability/Stunned/Dead)
        new ProjectileSystem(),            // [7] Advance projectiles & check radius collision
        new StormSystem(),                 // [8] Tick Storm & Riftbreaker fatigue damage
        new AreaOfEffectSystem(),          // [9] Update AoE collisors & inside-area effects
        new AnimationSystem(),             // [10] Tick animation timers
        new EntityDeathSystem(),           // [11] Process IsMarkedToDie & <= 0 HP heroes, fire OnCharacterKilled
    };
    if (CurrentFrame.FightMode == FightMode.DealDamage) // 2
    {
        systems.Add(new DamageTrackingSystem());
        systems.Add(new DamageDealtEndConditionSystem());
    }
    else if (CurrentFrame.FightMode == FightMode.Survival) // 3
    {
        systems.Add(new SurvivalEndConditionSystem());
    }
    systems.Add(new EndConditionSystem()); // Team wipe / BattleDuration timeout / ForcedEndOfCombat
    systems.Add(new EndOfFrameSystem());   // Calculate status damage stats & clear LastDamageInfo
    _systems = systems.ToArray();
}""",
    },
    {
        "name": "BattleSimulation.Tick",
        "va": 0x1805549D0,
        "assembly": "ember.simulation.core.dll",
        "purpose": "Advances the deterministic combat simulation by one fixed-point deltaTime step.",
        "pseudocode": """public void Tick(FP deltaTime)
{
    if (!CurrentFrame.IsRunning) return;
    CurrentFrame.OnTick(deltaTime); // DeltaTime = deltaTime; TimeSinceStart += deltaTime; RemovedEntities.Clear();
    for (int i = 0; i < _systems.Length; i++)
    {
        _systems[i].Tick(CurrentFrame);
        _systems[i].Cleanup(CurrentFrame);
    }
    CurrentFrame.IncrementFrameNumber();
}""",
    },
    {
        "name": "BattleSimulation.Initialize",
        "va": 0x1805546A0,
        "assembly": "ember.simulation.core.dll",
        "purpose": "Constructs Frame from SimulationInputData and triggers initial constant, combat-start, and rush-start effects.",
        "pseudocode": """private void Initialize(SimulationDependencies dependencies, SimulationInputData inputData)
{
    CurrentFrame = new Frame(dependencies, inputData);
    ApplyInitialEffects(inputData);
    CurrentFrame.CurrentFightModeThreshold = 0;
    CurrentFrame.FightModeThresholds = inputData.FightModeThresholds;
}""",
    },
    {
        "name": "Frame..ctor",
        "va": 0x180564EB0,
        "assembly": "ember.simulation.core.dll",
        "purpose": "Initializes combat state, RNG, StormState, PlayerTeam/BenchHeroes/EnemyTeam entities, Items, and EffectData.",
        "pseudocode": """public Frame(SimulationDependencies dependencies, SimulationInputData inputData)
{
    IsRunning = true;
    RandomProvider = new DefaultRandomProvider(inputData.Seed);
    BalancingDatabase = dependencies.BalancingDatabase;
    ErrorReporting = dependencies.ErrorReporting;
    BattleLogger = dependencies.BattleLogger;
    BattleContext = new SimulationBattleContext(this, BalancingDatabase, ErrorReporting);
    var battleSingleton = BalancingDatabase.GetSingleton<IBattleSingleton>();
    StormState = new StormState {
        TimeUntilStorm = battleSingleton.TimeUntilStorm,
        CurrentStormDamage = battleSingleton.InitialStormDamage
    };
    foreach (var dto in inputData.PlayerTeam) {
        var entity = EntityFactory.CreateFromDto(this, Team.Players, dto);
        entity.Stats.Health = (entity.Stats.MaxHealth.Value * dto.CombatStartMaxHealthModifier).AsInt;
        Entities.Add(entity);
        AddActiveAbilityEffects(entity);
        AddPassiveAbilityEffects(entity);
        foreach (var itemDto in dto.Items) {
            if (itemDto != null) Items.Add(itemDto.Id, new Item(BalancingDatabase, entity.Id, itemDto));
        }
    }
    foreach (var dto in inputData.EnemyTeam) {
        var entity = EntityFactory.CreateFromDto(this, Team.Enemies, dto);
        Entities.Add(entity);
        AddActiveAbilityEffects(entity);
        AddPassiveAbilityEffects(entity);
    }
    foreach (var effect in inputData.Effects) {
        EffectHandler.AddEffect(this, new EffectData(effect));
    }
}""",
    },
    {
        "name": "TemporaryEffectsSystem.Tick",
        "va": 0x180570A40,
        "assembly": "ember.simulation.core.dll",
        "purpose": "Resets per-frame temporary stat bonuses and status stack caps, then re-applies Frost attack speed slow.",
        "pseudocode": """public override void Tick(Frame f)
{
    var statusSingleton = f.BalancingDatabase.GetSingleton<IStatusSingleton>();
    foreach (var entity in f.Entities)
    {
        entity.Stats.ResetTemporaryBonuses();
        entity.Statuses.ResetStackCaps();
        entity.Stats.UpdateFrostEffects(statusSingleton, entity.Statuses.FrostStacks);
    }
}""",
    },
    {
        "name": "EffectsUpdateSystem.Tick",
        "va": 0x18055FCE0,
        "assembly": "ember.simulation.core.dll",
        "purpose": "Restores pending effects, updates Rush/Stall keywords, evaluates PerFrame/OnInterval effects, and expires timed ability effects.",
        "pseudocode": """public override void Tick(Frame f)
{
    RestorePendingEffects(f);
    foreach (var effectData in f.EffectsState.ActiveEffects)
    {
        if (effectData.Effect.Keyword != EffectKeywordType.None)
            HandleKeywords(f, effectData.Effect.Keyword, effectData);
        else
            UpdateEffect(f, effectData);
    }
    foreach (var abilityId in f.EffectsState.ActiveAbilitiesWithKeywords)
    {
        TickActiveAbilityKeywords(f, abilityId);
    }
    for (int i = f.EffectsState.ActiveEffects.Count - 1; i >= 0; i--)
    {
        var effectData = f.EffectsState.ActiveEffects[i];
        if (effectData.Timer.HasValue)
        {
            FP remaining = effectData.Timer.Value - f.DeltaTime;
            effectData.Timer = remaining;
            if (remaining <= FP._0)
            {
                f.BattleContext.UnapplyEffect(effectData.Id);
                f.EffectsState.ActiveEffects.RemoveAt(i);
            }
        }
    }
    AutoDestroyAoeBasedEffects(f);
}""",
    },
    {
        "name": "EffectsUpdateSystem.HandleKeywords",
        "va": 0x18055EA10,
        "assembly": "ember.simulation.core.dll",
        "purpose": "Ticks Rush (active from start until timer expires) and Stall (dormant until timer expires) effect timers.",
        "pseudocode": """private void HandleKeywords(Frame f, EffectKeywordType keyword, EffectData effectData)
{
    if (keyword == EffectKeywordType.Rush) // 1
    {
        if (f.EffectsState.RushEffectTimers.TryGetValue(effectData.Id, out FP timer) && timer > FP._0)
        {
            timer -= f.DeltaTime;
            f.EffectsState.RushEffectTimers[effectData.Id] = timer;
            if (timer > FP._0)
                UpdateEffect(f, effectData);
            else
                EffectHandler.EndRushEffect(f, effectData); // UnapplyEffect + fire OnRushEnd (41)
        }
    }
    else if (keyword == EffectKeywordType.Stall) // 2
    {
        if (f.EffectsState.StallEffectTimers.TryGetValue(effectData.Id, out FP timer))
        {
            timer -= f.DeltaTime;
            f.EffectsState.StallEffectTimers[effectData.Id] = timer;
            if (timer <= FP._0)
            {
                if (effectData.ShouldTriggerStallAndRushEffects)
                    EffectHandler.OnTrigger(f, EffectTriggerType.OnStallStart, effectData.OwnerEntityId);
                f.EffectsState.StallEffectTimers.Remove(effectData.Id);
                if (effectData.Effect.Trigger == EffectTriggerType.Constant)
                {
                    var outcome = effectData.Effect.Execute(f.BattleContext, f.BattleContext);
                    f.EventBus.Enqueue(new OnEffectExecuted(effectData.Id, f.BattleContext, outcome));
                }
            }
        }
        else
        {
            UpdateEffect(f, effectData);
        }
    }
}""",
    },
    {
        "name": "EntityTargetingSystem.Tick",
        "va": 0x180561360,
        "assembly": "ember.simulation.core.dll",
        "purpose": "Assigns closest valid opposing entity as target; re-evaluates if current target is invalid or after movement.",
        "pseudocode": """public override void Tick(Frame f)
{
    foreach (var entity in f.Entities)
    {
        if (!entity.IsAlive()) continue;
        bool validTarget = TryGetValidTarget(f, entity, out Entity currentTarget);
        if (!validTarget || (entity.IsHero && entity.PathfindingData.HasMoved))
        {
            Entity newTarget = FindClosestEnemy(f, entity);
            if (newTarget != currentTarget && entity.Fsm.CurrentState == EntityState.Attack)
            {
                entity.Attack.ResetTimers();
                entity.Animation.ResetTimers();
            }
            entity.CurrentTargetId = newTarget?.Id;
            entity.PathfindingData.HasMoved = false;
        }
    }
}""",
    },
    {
        "name": "StatusUpdateSystem.Tick",
        "va": 0x18056EA00,
        "assembly": "ember.simulation.core.dll",
        "purpose": "Ticks Poison, Burn, Frost, SimpleTimers (Stun/Immunity), ShieldTimers, StatReductionTimers, and HealPerSecond.",
        "pseudocode": """public override void Tick(Frame f)
{
    var statusSingleton = f.BalancingDatabase.GetSingleton<IStatusSingleton>();
    foreach (var entity in f.Entities)
    {
        if (!entity.IsAlive()) continue;
        UpdatePoison(f, entity, statusSingleton);
        UpdateBurn(f, entity, statusSingleton);
        UpdateFrost(f, entity);
        UpdateSimpleTimers(f, entity);
        UpdateShieldTimers(f, entity);
        UpdateStatReductionTimers(f, entity);
        UpdateHealPerSecond(f, entity);
    }
}""",
    },
    {
        "name": "StatusUpdateSystem.UpdatePoison",
        "va": 0x18056F4B0,
        "assembly": "ember.simulation.core.dll",
        "purpose": "Applies periodic Poison damage based on stack count and PoisonDamagePerStack, and decays expired stack batches.",
        "pseudocode": """private void UpdatePoison(Frame f, Entity entity, IStatusSingleton statusSingleton)
{
    int stacks = entity.Statuses.PoisonStacks;
    if (stacks <= 0) return;
    entity.Statuses.PoisonTickTimer -= f.DeltaTime;
    if (entity.Statuses.PoisonTickTimer <= FP._0)
    {
        int dmg = (stacks * statusSingleton.PoisonDamagePerStack).AsInt;
        DamageHandler.DealStatusDamage(f, entity, dmg, StatusType.Poison);
        entity.Statuses.PoisonTickTimer = statusSingleton.PoisonDamageTickInterval;
    }
    TickStackTimers(f, entity.Statuses.PoisonTimers);
}""",
    },
    {
        "name": "StatusUpdateSystem.UpdateBurn",
        "va": 0x18056EE90,
        "assembly": "ember.simulation.core.dll",
        "purpose": "Applies periodic Burn damage, splashes BurnDamageMultiplierForAdjacentAllies to hex-adjacent allies, and decays stacks.",
        "pseudocode": """private void UpdateBurn(Frame f, Entity entity, IStatusSingleton statusSingleton)
{
    int stacks = entity.Statuses.BurnStacks;
    if (stacks <= 0) return;
    entity.Statuses.BurnTickTimer -= f.DeltaTime;
    if (entity.Statuses.BurnTickTimer <= FP._0)
    {
        FP rawDmg = stacks * statusSingleton.BurnDamagePerStack;
        DamageHandler.DealStatusDamage(f, entity, rawDmg.AsInt, StatusType.Burn);
        int splashDmg = (rawDmg * statusSingleton.BurnDamageMultiplierForAdjacentAllies).AsInt;
        for (int dir = 0; dir < 6; dir++)
        {
            Vector2Int neighborCell = HexGridUtils.GetCellNeighbor(entity.CellPosition, (CellNeighbourDirection)dir);
            if (f.TryGetEntityAtCell(neighborCell, out Entity neighbor) && neighbor.Team == entity.Team && neighbor.IsAlive())
            {
                DamageHandler.DealStatusDamage(f, neighbor, splashDmg, StatusType.Burn);
            }
        }
        entity.Statuses.BurnTickTimer = statusSingleton.BurnDamageTickInterval;
    }
    TickStackTimers(f, entity.Statuses.BurnTimers);
}""",
    },
    {
        "name": "ManaRegenSystem.Tick",
        "va": 0x180568720,
        "assembly": "ember.simulation.core.dll",
        "purpose": "Unlocks LockedMana when ManaRegenLockTimer expires and grants ManaRegen.IntValue every GlobalManaRegenInterval.",
        "pseudocode": """public override void Tick(Frame f)
{
    var statsSingleton = f.BalancingDatabase.GetSingleton<ICharactersStatsSingleton>();
    foreach (var entity in f.Entities)
    {
        if (!entity.IsAlive()) continue;
        if (entity.Stats.ManaRegenLockTimer > FP._0)
        {
            entity.Stats.ManaRegenLockTimer -= f.DeltaTime;
            if (entity.Stats.ManaRegenLockTimer <= FP._0)
            {
                ManaHandler.AddMana(f, entity, entity.Stats.LockedMana);
                entity.Stats.LockedMana = 0;
            }
        }
        if (entity.CanTickManaRegen()) // Alive, not Stunned, not in ActiveAbility state
        {
            entity.Stats.ManaRegenTimer -= f.DeltaTime;
            if (entity.Stats.ManaRegenTimer <= FP._0)
            {
                ManaHandler.AddMana(f, entity, entity.Stats.ManaRegen.IntValue);
                entity.Stats.ManaRegenTimer = statsSingleton.GlobalManaRegenInterval;
            }
        }
    }
}""",
    },
    {
        "name": "PathfindingSystem.UpdatePathfinding",
        "va": 0x18056AD90,
        "assembly": "ember.simulation.core.dll",
        "purpose": "Computes shortest hex path into attack range of target using backwards multi-source Dijkstra traversal.",
        "pseudocode": """private void UpdatePathfinding(Frame f, Entity entity)
{
    if (!f.TryGetEntity(entity.CurrentTargetId.Value, out Entity target)) return;
    GetTargetPositions(f, entity, target, _targetPositionsBuffer); // Valid unblocked cells within AttackRange of target.CellPosition
    _dijkstraTraversal.Initialize(f, _targetPositionsBuffer, entity.CellPosition);
    while (_dijkstraTraversal.MoveNext()) { }
    if (_dijkstraTraversal.HasPathTo(entity.CellPosition))
    {
        _dijkstraTraversal.BuildPath(entity.CellPosition, entity.PathfindingData.CachedPath);
        entity.PathfindingData.SetNextCellFromPath();
    }
}""",
    },
    {
        "name": "HexGridUtils.CellToWorldPosition",
        "va": 0x18065AD80,
        "assembly": "ember.simulation.core.dll",
        "purpose": "Converts offset hex coordinates (col, row) to deterministic FPVector3 world coordinates (odd-r horizontal layout).",
        "pseudocode": """public static FPVector3 CellToWorldPosition(IBoardSingleton board, Vector2Int cell)
{
    FP width = board.CellInnerRadius * FP._2;
    FP xOffset = ((cell.y & 1) != 0) ? board.CellInnerRadius : FP._0;
    FP worldX = board.GridOrigin.X + cell.x * width + xOffset;
    FP worldZ = board.GridOrigin.Z + cell.y * board.CellOuterRadius * FP._1_50;
    return new FPVector3(worldX, FP._0, worldZ);
}""",
    },
    {
        "name": "HexGridUtils.GetCellDistance",
        "va": 0x18065B250,
        "assembly": "ember.simulation.core.dll",
        "purpose": "Converts odd-r offset coordinates to axial coordinates and returns hex Manhattan distance.",
        "pseudocode": """public static int GetCellDistance(Vector2Int a, Vector2Int b)
{
    int aq = a.x - ((a.y - (a.y & 1)) >> 1);
    int ar = a.y;
    int bq = b.x - ((b.y - (b.y & 1)) >> 1);
    int br = b.y;
    int dq = aq - bq;
    int dr = ar - br;
    return (Math.Abs(dq) + Math.Abs(dq + dr) + Math.Abs(dr)) >> 1;
}""",
    },
    {
        "name": "EntityFsm.Update",
        "va": 0x1805860B0,
        "assembly": "ember.simulation.core.dll",
        "purpose": "Finite state machine governing entity behavior across Idle(1), Move(2), Attack(3), ActiveAbility(4), Stunned(5), Dead(6).",
        "pseudocode": """public void Update(Frame f, Entity entity)
{
    if (_pendingTransition != EntityState.None)
    {
        TransitionTo(f, entity, _pendingTransition);
        _pendingTransition = EntityState.None;
    }
    switch (CurrentState)
    {
        case EntityState.Idle:          UpdateIdle(f, entity); break;
        case EntityState.Move:          UpdateMove(f, entity); break;
        case EntityState.Attack:        UpdateAttack(f, entity); break;
        case EntityState.ActiveAbility: UpdateActiveAbility(f, entity); break;
        case EntityState.Stunned:       UpdateStunned(f, entity); break;
        case EntityState.Dead:          break;
    }
}""",
    },
    {
        "name": "EntityFsm.UpdateAttack",
        "va": 0x180584FA0,
        "assembly": "ember.simulation.core.dll",
        "purpose": "Advances AttackTimer scaled by AttackSpeed / 100 and executes basic attack (melee hit or projectile spawn) at the hit frame.",
        "pseudocode": """private void UpdateAttack(Frame f, Entity entity)
{
    if (entity.CanCastActiveAbility())
    {
        SetTransition(EntityState.ActiveAbility);
        return;
    }
    if (!entity.IsTargetInAttackRange(f))
    {
        SetTransition(EntityState.Idle);
        return;
    }
    FP speedMult = entity.Stats.AttackSpeed.Value / FP._100;
    FP scaledDt = f.DeltaTime * speedMult;
    entity.Attack.AttackTimer += scaledDt;
    if (!entity.Attack.HasExecutedHit && entity.Attack.AttackTimer >= entity.Attack.HitDelay)
    {
        ExecuteBasicAttack(f, entity, target);
        entity.Attack.HasExecutedHit = true;
    }
    if (entity.Attack.AttackTimer >= entity.Attack.TotalAttackDuration)
    {
        entity.Attack.AttackTimer = FP._0;
        entity.Attack.HasExecutedHit = false;
    }
}""",
    },
    {
        "name": "DamageHandler.CalculateDamage",
        "va": 0x180654EC0,
        "assembly": "ember.simulation.core.dll",
        "purpose": "Computes pre-mitigation, post-mitigation, and crit damage using Defense/Resistance hyperbolic armor formula and CritChance roll.",
        "pseudocode": """public static DamageCalculationResult CalculateDamage(
    Frame f, Entity attacker, Entity defender, FP rawDamage,
    DamageType damageType, bool canCrit, bool isTrueDamage)
{
    FP dmg = rawDamage;
    bool isCrit = false;
    int bonusCritDamage = 0;
    if (canCrit && attacker != null)
    {
        FP roll = f.RandomProvider.Range(FP._0, FP._100);
        if (roll < attacker.Stats.CritChance.Value)
        {
            isCrit = true;
            FP critMult = attacker.Stats.CritDamage.Value / FP._100;
            FP critTotal = dmg * critMult;
            bonusCritDamage = (critTotal - dmg).AsInt;
            dmg = critTotal;
        }
    }
    int preMitigation = FPMath.Max(FP._0, dmg).AsInt;
    if (!isTrueDamage && damageType != DamageType.None)
    {
        FP defStat = (damageType == DamageType.Physical)
            ? defender.Stats.Defense.Value
            : defender.Stats.Resistance.Value;
        // Mitigation multiplier = 100 / (100 + defStat) if defStat >= 0, else 2 - 100 / (100 - defStat)
        FP mult = (defStat >= FP._0)
            ? (FP._100 / (FP._100 + defStat))
            : (FP._2 - (FP._100 / (FP._100 - defStat)));
        dmg = dmg * mult;
    }
    if (attacker != null && defender != null && defender.Statuses.FrostStacks > 0)
    {
        dmg *= (FP._1 + attacker.Stats.BonusDamageVsFrosted.Value / FP._100);
    }
    int finalDamage = FPMath.Max(FP._0, dmg).AsInt;
    int mitigated = Math.Max(0, preMitigation - finalDamage);
    return new DamageCalculationResult(finalDamage, preMitigation, mitigated, bonusCritDamage, isCrit);
}""",
    },
    {
        "name": "DamageHandler.ApplyDamage",
        "va": 0x180654600,
        "assembly": "ember.simulation.core.dll",
        "purpose": "Absorbs damage via Shield stacks first, subtracts remaining damage from Health, checks ExecutionThreshold, and fires damage triggers.",
        "pseudocode": """private static void ApplyDamage(Frame f, Entity attacker, Entity target, DamageCalculationResult calc, DamageSourceInfo sourceInfo)
{
    if (!target.IsAlive() || target.Statuses.IsDamageImmune) return;
    int remaining = calc.FinalDamage;
    int shieldAbsorbed = 0;
    if (!sourceInfo.IgnoresShield && target.Statuses.ShieldAmount > 0)
    {
        shieldAbsorbed = Math.Min(remaining, target.Statuses.ShieldAmount);
        StatusHandler.ConsumeShield(target, shieldAbsorbed);
        remaining -= shieldAbsorbed;
    }
    if (remaining > 0)
    {
        target.Stats.Health -= remaining;
        if (!target.IsHero && target.Stats.Health <= 0)
            target.IsMarkedToDie = true;
    }
    // Check ExecutionThreshold (% of MaxHealth)
    if (attacker != null && target.IsAlive() && attacker.Stats.ExecutionThreshold.Value > FP._0)
    {
        FP hpRatio = (FP.FromInt(target.Stats.Health) * FP._100) / target.Stats.MaxHealth.Value;
        if (hpRatio <= attacker.Stats.ExecutionThreshold.Value)
        {
            target.Stats.Health = 0;
            target.IsMarkedToDie = true;
        }
    }
    EffectHandler.OnDamageTrigger(f, attacker, target, calc, sourceInfo);
}""",
    },
    {
        "name": "CharacterStat.CalculateValue",
        "va": 0x18064B770,
        "assembly": "ember.simulation.core.dll",
        "purpose": "Computes total stat value from BaseValue, flat bonuses (constant/combat/temporary), and percentage bonuses, clamped to [MinValue, MaxValue].",
        "pseudocode": """private FP CalculateValue()
{
    FP flatTotal = BaseValue + ConstantBonus + CombatBonus + TemporaryBonus + RankBonus;
    FP pctTotal = ConstantPercentageBonus + CombatPercentageBonus + TemporaryPercentageBonus;
    FP total = flatTotal + (flatTotal * pctTotal) / FP._100;
    if (MinValue.HasValue && total < MinValue.Value) total = MinValue.Value;
    if (MaxValue.HasValue && total > MaxValue.Value) total = MaxValue.Value;
    return total;
}""",
    },
    {
        "name": "StormSystem.TickStorm",
        "va": 0x180570570,
        "assembly": "ember.simulation.core.dll",
        "purpose": "Ticks overtime Storm countdown and deals escalating Storm damage (linear phase then exponential multiplier phase) to all alive entities.",
        "pseudocode": """private void TickStorm(Frame f)
{
    var battleSingleton = f.BalancingDatabase.GetSingleton<IBattleSingleton>();
    if (f.StormState.TimeUntilStorm > FP._0)
    {
        f.StormState.TimeUntilStorm -= f.DeltaTime;
        if (f.StormState.TimeUntilStorm <= FP._0)
        {
            f.StormState.StormTickTimer = battleSingleton.StormDamageInterval;
            f.StormState.CurrentStormDamage = battleSingleton.InitialStormDamage;
            f.EventBus.Enqueue(new OnStormStartedEvent());
        }
        return;
    }
    f.StormState.TimeUntilStorm -= f.DeltaTime; // Negative value tracks elapsed storm time
    f.StormState.StormTickTimer -= f.DeltaTime;
    if (f.StormState.StormTickTimer <= FP._0)
    {
        foreach (var entity in f.Entities)
        {
            if (!entity.IsAlive()) continue;
            int dmg = f.StormState.CurrentStormDamage;
            if (entity.IsHero)
                dmg -= (dmg * f.StormState.HeroStormDamageReduction).AsInt;
            DamageHandler.DealStormDamage(f, entity, dmg, isTrueDamage: false);
        }
        f.StormState.StormTickTimer = battleSingleton.StormDamageInterval;
        FP elapsedStorm = -f.StormState.TimeUntilStorm;
        if (elapsedStorm < battleSingleton.StormExponentialPhaseStartTime)
            f.StormState.CurrentStormDamage += battleSingleton.StormDamageFlatIncrease;
        else
            f.StormState.CurrentStormDamage = (f.StormState.CurrentStormDamage * battleSingleton.StormDamageMultiplierIncrease).AsInt;
    }
}""",
    },
    {
        "name": "StormSystem.TickRiftbreaker",
        "va": 0x180570190,
        "assembly": "ember.simulation.core.dll",
        "purpose": "Ticks Riftbreaker countdown and deals % MaxHP True Damage to all alive enemy units every RiftbreakerInterval.",
        "pseudocode": """private void TickRiftbreaker(Frame f)
{
    if (!f.StormState.TimeUntilRiftbreaker.HasValue) return;
    var battleSingleton = f.BalancingDatabase.GetSingleton<IBattleSingleton>();
    if (f.StormState.TimeUntilRiftbreaker.Value > FP._0)
    {
        f.StormState.TimeUntilRiftbreaker = f.StormState.TimeUntilRiftbreaker.Value - f.DeltaTime;
        if (f.StormState.TimeUntilRiftbreaker.Value <= FP._0)
        {
            f.StormState.RiftbreakerTickTimer = FP._0;
            f.StormState.RiftbreakerMaxHpPercentDamage = battleSingleton.RiftbreakerInitialPercentDamage;
            f.EventBus.Enqueue(new OnRiftBreakerStartedEvent());
        }
        return;
    }
    f.StormState.RiftbreakerTickTimer -= f.DeltaTime;
    if (f.StormState.RiftbreakerTickTimer <= FP._0)
    {
        foreach (var entity in f.Entities)
        {
            if (!entity.IsAlive() || entity.IsHero) continue;
            int dmg = (entity.Stats.MaxHealth.Value * f.StormState.RiftbreakerMaxHpPercentDamage).AsInt;
            DamageHandler.DealStormDamage(f, entity, dmg, isTrueDamage: true);
        }
        f.StormState.RiftbreakerTickTimer = battleSingleton.RiftbreakerInterval;
        f.StormState.RiftbreakerMaxHpPercentDamage = battleSingleton.RiftbreakerSubsequentPercentDamage;
    }
}""",
    },
    {
        "name": "EndConditionSystem.Tick",
        "va": 0x180560500,
        "assembly": "ember.simulation.core.dll",
        "purpose": "Evaluates combat victory/defeat conditions (ForcedEndOfCombat, all enemies dead, all players dead, or BattleDuration timeout).",
        "pseudocode": """public override void Tick(Frame f)
{
    if (f.ForcedEndOfCombat.HasValue)
    {
        f.Result = f.ForcedEndOfCombat.Value;
        f.IsRunning = false;
    }
    else if (AreAllEntitiesOfTeamDead(f, Team.Enemies))
    {
        f.Result = SimulationResult.Victory; // 1
        f.IsRunning = false;
    }
    else if (AreAllEntitiesOfTeamDead(f, Team.Players))
    {
        f.Result = SimulationResult.Defeat; // 2
        f.IsRunning = false;
    }
    else if (f.TimeSinceStart >= f.BattleDuration)
    {
        f.Result = SimulationResult.Defeat; // 2
        f.IsRunning = false;
    }
}""",
    },
    {
        "name": "EnemyData..ctor(EnemyId, BalancingRef<IEnemyEntry>, IEnemyScalingEntry, int)",
        "va": 0x18050E3A0,
        "assembly": "ember.scopes.gameRun.dll",
        "purpose": "Scales enemy base stats by floor/encounter scalingAmount using polynomial exponent e = N * (0.43092 + 0.07815 * N).",
        "pseudocode": """public EnemyData(EnemyId enemyId, BalancingRef<IEnemyEntry> characterRef, IEnemyScalingEntry scalingEntry, int scalingAmount)
    : this(characterRef)
{
    EnemyId = enemyId;
    // ScalingExponentA = FP.FromString("0.43092"), ScalingExponentB = FP.FromString("0.07815")
    FP exponent = scalingAmount * (ScalingExponentA + scalingAmount * ScalingExponentB);
    foreach (var statScaling in scalingEntry.StatScalings)
    {
        FP bonus;
        if (statScaling.ScalingType == ScalingType.Linear) // 1
        {
            bonus = statScaling.Value * exponent;
        }
        else if (statScaling.ScalingType == ScalingType.Exponential) // 2
        {
            FP baseStat = _stats.GetStat(statScaling.TargetStatType).BaseValue;
            FP scaled = FPMath.Min(baseStat * Power(statScaling.Value, exponent), FP.FromInt(500_000_000));
            bonus = scaled - baseStat;
        }
        else continue;
        var mod = new StatModification(statScaling.TargetStatType, bonus);
        _statModifiers.Add(mod);
        _stats.AddConstantStatBonus(mod.StatType, mod.Value);
    }
}""",
    },
    {
        "name": "SynergySimulationConfig.ExecuteSimulationRun",
        "va": 0x18069CE50,
        "assembly": "ember.synergySimulator.dll",
        "purpose": "Monte Carlo balancing simulator for drafting Heroes, Items, and Relics across shops and reward offers to measure synergy completion rate.",
        "pseudocode": """private RunSummary ExecuteSimulationRun()
{
    var runData = new RunData(_heroes, _items, _relics);
    int runRerollsLeft = _rerollsPerRun;
    int offersPerShop = TotalRewardOffersPerRun / _shopsPerRun;
    for (int shop = 0; shop < _shopsPerRun; shop++)
    {
        for (int offer = 0; offer < offersPerShop; offer++)
        {
            AcquireHeroReward(runData, ref runRerollsLeft);
            AcquireItemReward(runData, ref runRerollsLeft);
            AcquireRelicReward(runData, ref runRerollsLeft);
        }
    }
    return new RunSummary(runData, _synergyCounts, _maxItemRank);
}""",
    },
]


def generate_markdown_spec(schemas: dict, methods_output: list) -> str:
    sim_core = schemas["ember.simulation.core.dll"]
    sim_runtime = schemas["ember.simulation.unityRuntime.dll"]
    syn_sim = schemas["ember.synergySimulator.dll"]

    return f"""# Guildrun Combat Simulation Engine — Native x86_64 Reverse Engineering Specification

> **Binary**: `C:\\Program Files (x86)\\Steam\\steamapps\\common\\Guildrun Demo\\GameAssembly.dll` (x86_64 PE, ImageBase `0x180000000`)  
> **Metadata**: `Guildrun_Data\\il2cpp_data\\Metadata\\global-metadata.dat` (IL2CPP v31, Unity `6000.0.64f1`)  
> **Registrations**: `g_CodeRegistration = 0x18621ff50`, `g_MetadataRegistration = 0x1873029f0`, `g_CodeGenModules = 0x187c6af60` (248 modules)

---

## 1. Executive Summary & Assembly Inventory

| Assembly | Module VA | Method Pointers VA | Types | Methods | Role |
| :--- | :--- | :--- | ---: | ---: | :--- |
| `ember.simulation.core.dll` | `0x18634e9b0` | `0x187cc4070` | {sim_core['type_count']} | {sim_core['method_count']} | Deterministic fixed-point combat simulation engine (`BattleSimulation`, `Frame`, ECS systems, handlers, FSM, pathfinding) |
| `ember.simulation.unityRuntime.dll` | `0x18634ec80` | `0x187cc9fe0` | {sim_runtime['type_count']} | {sim_runtime['method_count']} | Unity runtime bridge (`SimulationRunner`, `EntityView`, `ProjectileView`, `AreaOfEffectView`, `EventBus` consumers) |
| `ember.synergySimulator.dll` | `0x18634efa0` | `0x187ccb5b0` | {syn_sim['type_count']} | {syn_sim['method_count']} | Monte Carlo draft & synergy completion simulator (`SynergySimulationConfig`, `RunData`, `RunSummary`) |
| `ember.balancing.dll` | `0x18633c210` | `0x187ca3780` | 793 | 3,475 | Balancing data schemas, `SimulationBridge` interfaces, and all concrete `BaseEffect` implementations |

---

## 2. Deterministic Fixed-Point Math (`Photon.Deterministic.FP`)

All simulation state, positions, timers, and stat calculations use 64-bit signed **Q48.16 fixed-point numbers** (`Photon.Deterministic.FP`):

- **Representation**: `RawValue` (`int64`) where `1.0 = 65536` (`0x10000`), `0.5 = 32768` (`0x8000`), `100.0 = 6553600` (`0x640000`).
- **Integer Conversion (`FP.AsInt` / `IntValue`)**: Arithmetic right shift by 16 (`sar rax, 0x10`) or rounded via `((raw + 0x8000) >> 16)`.
- **Multiplication (`a * b`)**:
  $$\\text{{result}}_{{\\text{{raw}}}} = \\left\\lfloor \\frac{{a_{{\\text{{raw}}}} \\times b_{{\\text{{raw}}}} + \\text{{0x8000}}}}{{2^{{16}}}} \\right\\rfloor$$
  In x86_64 assembly: `imul rax, rdx; lea rcx, [rax + 0x8000]; sar rcx, 0x10`.
- **Division by 100 (`x / FP._100`)**:
  Uses magic multiplier `0xa3d70a3d70a3d70b` (`imul rcx; add rdx, rcx; sar rdx, 0x16; mov rax, rdx; shr rax, 0x3f; add rax, rdx`).
- **Exponentiation (`EnemyData.Power(base, exp)` @ `0x18050d690`)**:
  $$\\text{{Power}}(b, e) = \\text{{FPMath.Exp}}\\left(\\text{{FPMath.Ln}}(|b|) \\times e\\right)$$
  Implemented via `FPMath.Ln` (`0x184182e80`) and `FPMath.Exp` (`0x184182970`).

---

## 3. Simulation Tick Loop & System Execution Order

### 3.1 `BattleSimulation.Tick(FP deltaTime)` (`0x1805549d0`)
Each simulation step executes the following sequence if `CurrentFrame.IsRunning` (`+0x10`) is `true`:
1. Calls `Frame.OnTick(deltaTime)` (`0x180563000`):
   - Sets `Frame.DeltaTime = deltaTime` (`+0x20`).
   - Increments `Frame.TimeSinceStart += deltaTime` (`+0x28`).
   - Clears `Frame.RemovedEntities` (`+0xb8`).
2. Iterates through `_systems` (`BattleSimulation + 0x18`) in exact registration order, calling `system.Tick(CurrentFrame)` (`vtable +0x178`) immediately followed by `system.Cleanup(CurrentFrame)` (`vtable +0x188`) for each system.
3. Calls `Frame.IncrementFrameNumber()` (`+0x88`).

### 3.2 Exact System Pipeline (`BattleSimulation..ctor` @ `0x180554b70`)

```mermaid
flowchart TD
    S0["1. TemporaryEffectsSystem (0x180570a40)"] --> S1["2. EffectsUpdateSystem (0x18055fce0)"]
    S1 --> S2["3. EntityTargetingSystem (0x180561360)"]
    S2 --> S3["4. StatusUpdateSystem (0x18056ea00)"]
    S3 --> S4["5. ManaRegenSystem (0x180568720)"]
    S4 --> S5["6. PathfindingSystem (0x18056a390)"]
    S5 --> S6["7. EntityFsmSystem (0x180560ee0)"]
    S6 --> S7["8. ProjectileSystem (0x18056c3e0)"]
    S7 --> S8["9. StormSystem (0x180570860)"]
    S8 --> S9["10. AreaOfEffectSystem (0x180553c70)"]
    S9 --> S10["11. AnimationSystem (0x180551dc0)"]
    S10 --> S11["12. EntityDeathSystem (0x180560c90)"]
    S11 --> SFM{{"FightMode?"}}
    SFM -- "DealDamage (2)" --> S12A["13a. DamageTrackingSystem & DamageDealtEndConditionSystem"]
    SFM -- "Survival (3)" --> S12B["13b. SurvivalEndConditionSystem"]
    SFM -- "Regular (0) / OneOnOne (1)" --> S13["14. EndConditionSystem (0x180560500)"]
    S12A --> S13
    S12B --> S13
    S13 --> S14["15. EndOfFrameSystem (0x180560760)"]
```

| Order | System Class | Tick VA | Exact Responsibility |
| ---: | :--- | :--- | :--- |
| 1 | `TemporaryEffectsSystem` | `0x180570a40` | Resets `Stats.ResetTemporaryBonuses()`, `Statuses.ResetStackCaps()`, and calls `Stats.UpdateFrostEffects(statusSingleton, FrostStacks)`. |
| 2 | `EffectsUpdateSystem` | `0x18055fce0` | Restores pending effects; updates `Rush`/`Stall` timers; executes `PerFrameEvaluation` & `OnInterval` effects; ticks ability-created timed effects; auto-destroys expired AoE effects. |
| 3 | `EntityTargetingSystem` | `0x180561360` | Assigns or re-evaluates `CurrentTargetId` when target is dead/untargetable or when a hero `HasMoved`. Resets attack/animation timers if target changes mid-attack. |
| 4 | `StatusUpdateSystem` | `0x18056ea00` | Ticks Poison, Burn (with hex-neighbor splash), Frost decay, Stun/DamageImmunity/StatusImmunity timers, Shield timers, StatReduction timers, and `HPPerSecond` regeneration. |
| 5 | `ManaRegenSystem` | `0x180568720` | Ticks `ManaRegenLockTimer` (flushing `LockedMana` on expiry) and `ManaRegenTimer` (granting `ManaRegen.IntValue` every `GlobalManaRegenInterval`). |
| 6 | `PathfindingSystem` | `0x18056a390` | Rebuilds `Frame.BlockedCells` from alive entities, then runs multi-source backwards Dijkstra from unblocked cells within `AttackRange` of each entity's target. |
| 7 | `EntityFsmSystem` | `0x180560ee0` | Executes `EntityFsm.Update(f, entity)` across all entities (`Idle`, `Move`, `Attack`, `ActiveAbility`, `Stunned`, `Dead`). |
| 8 | `ProjectileSystem` | `0x18056c3e0` | Advances homing projectiles toward `TargetEntityId` at `Speed * f.DeltaTime` and triggers `DamageHandler.DealProjectileDamage` when $\\|p - t\\|^2 \\le r_{{\\text{{collisor}}}}^2$. |
| 9 | `StormSystem` | `0x180570860` | Ticks `TickStorm(f)` (`0x180570570`) and `TickRiftbreaker(f)` (`0x180570190`). |
| 10 | `AreaOfEffectSystem` | `0x180553c70` | Moves attached AoEs, updates `Collisor` shapes (`Circle`, `Box`), tracks `EntitiesInsideArea`, and applies/suspends AoE effects. |
| 11 | `AnimationSystem` | `0x180551dc0` | Advances entity animation timers (`AnimationComponent`). |
| 12 | `EntityDeathSystem` | `0x180560c90` | Two-pass death sweep: kills entities with `IsMarkedToDie == true`, then kills any Hero with `CurrentHealth <= 0`. Fires `OnCharacterKilled` (`32`), suspends owner effects, resets statuses, and enqueues `OnCharacterDeathEvent`. |
| 13a | `DamageTrackingSystem` + `DamageDealtEndConditionSystem` | `0x18055d7f0` / `0x18055d640` | *(FightMode 2 only)* Sums damage received by all enemies into `f.DamageDealtByPlayer` and advances `CurrentFightModeThreshold` until all thresholds are met (`Victory`). |
| 13b | `SurvivalEndConditionSystem` | `0x180570890` | *(FightMode 3 only)* Compares `f.TimeSinceStart` against `f.FightModeThresholds` (in seconds) and declares `Victory` once all survival thresholds are reached. |
| 14 | `EndConditionSystem` | `0x180560500` | Checks `ForcedEndOfCombat`, `AreAllEntitiesOfTeamDead(Enemies)` -> `Victory (1)`, `AreAllEntitiesOfTeamDead(Players)` -> `Defeat (2)`, or `TimeSinceStart >= BattleDuration` -> `Defeat (2)`. |
| 15 | `EndOfFrameSystem` | `0x180560760` | Updates status-stack damage attribution in `BattleStats` and clears `LastDamageInfo` on all entities. |

---

## 4. Hex Grid Geometry & Multi-Source Dijkstra Pathfinding

### 4.1 Hex Grid Coordinate System (`HexGridUtils`)
Guildrun uses an **odd-r horizontal offset hex grid** (`Vector2Int(col, row)`):
- **World Position (`HexGridUtils.CellToWorldPosition` @ `0x18065ad80`)**:
  - $\\text{{width}} = 2 \\times \\text{{CellInnerRadius}}$
  - $x_{{\\text{{offset}}}} = \\text{{CellInnerRadius}}$ if $(\\text{{row}} \\pmod 2 \\neq 0)$ else $0$
  - $X = \\text{{GridOrigin.X}} + \\text{{col}} \\times \\text{{width}} + x_{{\\text{{offset}}}}$
  - $Z = \\text{{GridOrigin.Z}} + \\text{{row}} \\times \\text{{CellOuterRadius}} \\times 1.5$
- **Axial Conversion & Hex Distance (`HexGridUtils.GetCellDistance` @ `0x18065b250`)**:
  - Converts offset $(col, row)$ to axial $(q, r)$ via:
    $$q = col - \\left\\lfloor \\frac{{row - (row \\& 1)}}{{2}} \\right\\rfloor, \\quad r = row$$
  - Distance between $(q_1, r_1)$ and $(q_2, r_2)$:
    $$d = \\frac{{|q_1 - q_2| + |(q_1 - q_2) + (r_1 - r_2)| + |r_1 - r_2|}}{{2}}$$
- **6 Neighbor Directions (`CellNeighbourDirection`)**:
  - `0 = TopRight`, `1 = Right`, `2 = BottomRight`, `3 = BottomLeft`, `4 = Left`, `5 = TopLeft`.
  - Lookup tables `_evenRowOffsets` and `_oddRowOffsets` in `HexGridUtils..cctor` (`0x18065b730`):
    - Even row (`y % 2 == 0`): `(+0, +1), (+1, 0), (+0, -1), (-1, -1), (-1, 0), (-1, +1)`
    - Odd row (`y % 2 != 0`): `(+1, +1), (+1, 0), (+1, -1), (+0, -1), (-1, 0), (+0, +1)`

### 4.2 Backwards Multi-Source Dijkstra (`DijkstraPathfindingTraversal` @ `0x18055ddc0`)
Instead of searching forward from the moving unit to a single cell, `PathfindingSystem.UpdatePathfinding` (`0x18056ad90`) searches **backwards from all valid attack cells**:
1. `GetTargetPositions` (`0x180569fd0`) collects all cells $c$ within `entity.Stats.AttackRange.IntValue` of `target.CellPosition` that are inside board bounds and not in `Frame.BlockedCells` (or $c == \\text{{entity.CellPosition}}$).
2. All valid target cells are pushed into a binary min-heap (`Heap<NodeDistance>`) with distance `0`.
3. `MoveNext()` (`0x18055e190`) pops the minimum-distance cell, expands its 6 hex neighbors (skipping blocked cells except `entity.CellPosition`), and relaxes edge weights (`dist + 1`, with Euclidean tie-breaking).
4. Once `entity.CellPosition` is reached, `BuildPath` reconstructs the cell sequence into `entity.PathfindingData.CachedPath` and sets `NextCell` (`PathfindingComponent.SetNextCellFromPath` @ `0x18064b4b0`).

---

## 5. Unit Stats & Exact Mathematical Formulas

### 5.1 `CharacterStatsComponent` Layout (`entity + 0x100`, size `0x5b0`)
Each `Entity` embeds a `CharacterStatsComponent` value type at offset `+0x100`, containing 17 `CharacterStat` structs (`0x50` bytes each) plus health/mana state:

| Offset (rel to `Entity`) | Offset (rel to `Stats`) | Field Name | Type | TargetStatType Enum |
| :--- | :--- | :--- | :--- | :--- |
| `+0x100` | `+0x00` | `Health` | `int` | — (Current HP) |
| `+0x104` | `+0x04` | `Mana` | `int` | `15 (CurrentMana)` |
| `+0x108` | `+0x08` | `_isInitialized` | `bool` | — |
| `+0x110` | `+0x10` | `MaxHealth` | `CharacterStat` | `1 (MaxHealth)` |
| `+0x160` | `+0x60` | `StartingMana` | `CharacterStat` | `3 (StartingMana)` |
| `+0x1b0` | `+0xb0` | `ManaCost` | `CharacterStat` | `2 (ManaCost)` |
| `+0x200` | `+0x100` | `ManaRegen` | `CharacterStat` | `4 (ManaRegen)` |
| `+0x250` | `+0x150` | `AttackDamage` | `CharacterStat` | `5 (Attack)` |
| `+0x2a0` | `+0x1a0` | `AbilityPower` | `CharacterStat` | `6 (Magic / AbilityPower)` |
| `+0x2f0` | `+0x1f0` | `Defense` | `CharacterStat` | `7 (Defense)` |
| `+0x340` | `+0x240` | `Resistance` | `CharacterStat` | `8 (Resistance)` |
| `+0x390` | `+0x290` | `AttackSpeed` | `CharacterStat` | `9 (AttackSpeed)` |
| `+0x3e0` | `+0x2e0` | `CritChance` | `CharacterStat` | `10 (CritChance)` |
| `+0x430` | `+0x330` | `CritDamage` | `CharacterStat` | `11 (CritDamage)` |
| `+0x480` | `+0x380` | `MoveSpeed` | `CharacterStat` | `12 (MoveSpeed)` |
| `+0x4d0` | `+0x3d0` | `AttackRange` | `CharacterStat` | `13 (AttackRange)` |
| `+0x520` | `+0x420` | `HPPerSecond` | `CharacterStat` | `14 (HPPerSecond)` |
| `+0x570` | `+0x470` | `HealingModifier` | `CharacterStat` | `16 (HealingModifier)` |
| `+0x5c0` | `+0x4c0` | `BonusDamageVsFrosted` | `CharacterStat` | `17 (BonusDamageVsFrosted)` |
| `+0x610` | `+0x510` | `ExecutionThreshold` | `CharacterStat` | `18 (ExecutionThreshold)` |
| `+0x660`..`+0x6f8` | `+0x560`..`+0x5f8` | `Poison/Burn/Frost/Shield/Heal Modifiers` | `FP` | Status output/duration multipliers |
| `+0x700` | `+0x600` | `LockedMana` | `int` | Mana gained while mana-locked |
| `+0x708` | `+0x608` | `ManaRegenLockTimer` | `FP` | Remaining mana-lock duration |
| `+0x710` | `+0x610` | `HealPerSecondTimer` | `FP` | 1.0s timer for `HPPerSecond` |
| `+0x718` | `+0x618` | `ManaRegenTimer` | `FP` | Timer for `GlobalManaRegenInterval` |

### 5.2 Stat Value Aggregation (`CharacterStat.CalculateValue` @ `0x18064b770`)
Each `CharacterStat` (`0x50` bytes) stores:
- `+0x00`: `FP BaseValue`
- `+0x08`: `FP ConstantBonus` (items, relics, permanent modifiers)
- `+0x10`: `FP CombatBonus` (combat-duration buffs/debuffs)
- `+0x18`: `FP TemporaryBonus` (per-frame conditional effects, reset every tick by `TemporaryEffectsSystem`)
- `+0x20`: `FP ConstantPercentageBonus`
- `+0x28`: `FP CombatPercentageBonus`
- `+0x30`: `FP TemporaryPercentageBonus`
- `+0x38`: `FP RankBonus` (from hero rank & class rank bonuses)
- `+0x40`: `Nullable<FP> MinValue`
- `+0x50`: `Nullable<FP> MaxValue`

The exact formula evaluated when `_isDirty` is true:
$$\\text{{Flat}} = \\text{{BaseValue}} + \\text{{ConstantBonus}} + \\text{{CombatBonus}} + \\text{{TemporaryBonus}} + \\text{{RankBonus}}$$
$$\\text{{Pct}} = \\text{{ConstantPercentageBonus}} + \\text{{CombatPercentageBonus}} + \\text{{TemporaryPercentageBonus}}$$
$$\\text{{Value}} = \\text{{ clamp }}\\left(\\text{{Flat}} \\times \\left(1 + \\frac{{\\text{{Pct}}}}{{100}}\\right),\\; \\text{{MinValue}},\\; \\text{{MaxValue}}\\right)$$

### 5.3 Hero Rank Stat Bonus Formula (`CharacterStatsComponent.UpdateRankBonuses` @ `0x1806508c0`)
When a Hero is Rank $R \\ge 1$:
- For every stat bonus entry in `IHeroesSingleton.RankStatBonuses` (global per-rank bonuses) and in each of the hero's `IHeroClassEntry.RankStatBonuses`:
  $$\\text{{RankBonus}}_{{\\text{{stat}}}} = \\sum (R - 1) \\times \\text{{bonusPerRank}}$$
- Additionally, if `MaxHealth` increases from rank up, `CurrentHealth` is increased by the delta.

---

## 6. Combat Mechanics: FSM, Attacks, Abilities, Damage & Statuses

### 6.1 Entity Finite State Machine (`EntityFsm` @ `0x1805860b0`)
States (`EntityState`):
- `0 = None`
- `1 = Idle`: Checks if stunned (`-> Stunned`), can cast active ability (`-> ActiveAbility`), has valid target in attack range (`-> Attack`), or has a pathfinding `NextCell` (`-> Move`).
- `2 = Move` (`UpdateMove` @ `0x180585bd0`): Moves `Position` toward `CellToWorldPosition(NextCell)` at speed $\\text{{MoveSpeed.Value}} \\times \\text{{DeltaTime}}$. When the cell center is reached, updates `CellPosition = NextCell`, sets `PathfindingData.HasMoved = true`, fires `EffectTriggerType.OnMovementFinished (50)`, and transitions to `Idle` (or `ActiveAbility` / `Attack`).
- `3 = Attack` (`UpdateAttack` @ `0x180584fa0`):
  - Advances `AttackTimer` by $\\text{{DeltaTime}} \\times \\frac{{\\text{{AttackSpeed.Value}}}}{{100}}$.
  - When `AttackTimer >= HitDelay` and `!HasExecutedHit`:
    - If `AttackRange.IntValue <= 1` (melee) or no projectile config: calls `DamageHandler.DealAutoAttackDamage` directly.
    - If ranged (`ProjectileSpeed > 0`): spawns a homing `Projectile` via `ProjectileHandler.SpawnProjectile` (`0x18065c870`).
    - Fires `EffectTriggerType.OnBasicAttack (10)`.
  - When `AttackTimer >= TotalAttackDuration`, resets `AttackTimer = 0` and `HasExecutedHit = false`.
- `4 = ActiveAbility` (`UpdateActiveAbility` @ `0x180584950`):
  - On entry (`OnEnterActiveAbility` @ `0x180583eb0`), locks mana regeneration (`ManaRegenLockTimer = AbilityDuration`), deducts `ManaCost.IntValue` (or resets `Mana = 0`), increments `BattleStats.TimesUsedActiveAbilities`, and fires `EffectTriggerType.OnActiveAbilityUsed (20)` and `OnManaSpent (21)`.
  - Executes ability effects at the configured cast point and returns to `Idle` when cast duration finishes.
- `5 = Stunned` (`UpdateStunned` @ `0x180586030`): Waits until `Statuses.IsStunned` is false, then transitions to `Idle`.
- `6 = Dead`: Terminal state entered via `EntityDeathSystem.KillEntity` (`0x1805608d0`).

### 6.2 Damage, Mitigation, Crit, Shield & Execution (`DamageHandler` @ `0x180654ec0`)
1. **Critical Hit Check**:
   - If `canCrit` is true (basic attacks, or abilities when the caster has `CanCritWithAbilities` / crit effects):
   - Rolls `roll = RandomProvider.Range(0, 100)`. If `roll < attacker.Stats.CritChance.Value`:
     $$\\text{{dmg}} = \\text{{rawDamage}} \\times \\frac{{\\text{{attacker.Stats.CritDamage.Value}}}}{{100}}$$
     Fires `EffectTriggerType.OnCritLanded (16)` and `OnCritReceived (17)`.
2. **Defense / Resistance Mitigation**:
   - Physical damage (`DamageType == 1`) uses `Defense = defender.Stats.Defense.Value`.
   - Magic damage (`DamageType == 2`) uses `Resistance = defender.Stats.Resistance.Value`.
   - True damage (`isTrueDamage == true`) bypasses mitigation completely.
   - Hyperbolic mitigation formula (`0x180655210`):
     $$\\text{{MitigationMultiplier}}(D) = \\begin{{cases}} \\dfrac{{100}}{{100 + D}} & \\text{{if }} D \\ge 0 \\\\[8pt] 2 - \\dfrac{{100}}{{100 - D}} & \\text{{if }} D < 0 \\end{{cases}}$$
     $$\\text{{postMitigationDmg}} = \\text{{dmg}} \\times \\text{{MitigationMultiplier}}(D)$$
3. **Frosted Target Bonus**:
   - If `defender.Statuses.FrostStacks > 0`:
     $$\\text{{postMitigationDmg}} = \\text{{postMitigationDmg}} \\times \\left(1 + \\frac{{\\text{{attacker.Stats.BonusDamageVsFrosted.Value}}}}{{100}}\\right)$$
4. **Shield Absorption (`ApplyDamage` @ `0x180654600`)**:
   - Unless `IgnoresShield` is set, active shield timers on `defender.Statuses.ShieldTimers` absorb damage in FIFO order:
     $$\\text{{absorbed}} = \\min(\\text{{finalDamage}},\\; \\text{{defender.Statuses.ShieldAmount}})$$
     $$\\text{{hpDamage}} = \\text{{finalDamage}} - \\text{{absorbed}}$$
5. **Execution Threshold**:
   - After HP subtraction, if `attacker.Stats.ExecutionThreshold.Value > 0` and `defender` is still alive:
     $$\\frac{{\\text{{defender.Stats.Health}} \\times 100}}{{\\text{{defender.Stats.MaxHealth.Value}}}} \\le \\text{{attacker.Stats.ExecutionThreshold.Value}} \\implies \\text{{Health}} = 0,\\; \\text{{IsMarkedToDie}} = \\text{{true}}$$

### 6.3 Status Effects (`StatusHandler` & `StatusUpdateSystem`)
All stackable statuses (`Poison`, `Burn`, `Frost`) respect per-entity stack caps (`StatusesComponent.PoisonStackCap`, `BurnStackCap`, `FrostStackCap`, defaulting to `IStatusSingleton` global max stacks unless modified by effects) and `IsStatusImmune`:

| Status | Enum | Application (`StatusHandler`) | Tick Behavior (`StatusUpdateSystem`) |
| :--- | :--- | :--- | :--- |
| **Poison** | `1` | Adds batch `(stacks, duration)` to `PoisonTimers`. Scales stacks by `attacker.Stats.PoisonModifier`. | Every `PoisonDamageTickInterval`, deals $\\text{{PoisonStacks}} \\times \\text{{PoisonDamagePerStack}}$ status damage (`0x18056f4b0`). |
| **Burn** | `2` | Adds batch `(stacks, duration)` to `BurnTimers`. Scales stacks by `attacker.Stats.BurnModifier`. | Every `BurnDamageTickInterval`, deals $\\text{{BurnStacks}} \\times \\text{{BurnDamagePerStack}}$ to target AND splashes $\\text{{dmg}} \\times \\text{{BurnDamageMultiplierForAdjacentAllies}}$ to all alive allies in the 6 adjacent hex cells (`0x18056ee90`). |
| **Frost** | `3` | Adds batch `(stacks, duration)` to `FrostTimers`. Scales stacks by `attacker.Stats.FrostModifier`. | Every tick in `TemporaryEffectsSystem`, reduces `AttackSpeed` by $\\text{{FrostStacks}} \\times \\text{{FrostAttackSpeedReductionPerStack}}$ (`UpdateFrostEffects` @ `0x1806507d0`). |
| **Stun** | `4` | Sets `StunTimer = max(StunTimer, duration)` and transitions `EntityFsm` to `EntityState.Stunned (5)`. | Decrements `StunTimer` by `DeltaTime`; while `> 0`, blocks movement, attacks, abilities, and mana regen. |
| **DamageImmunity** | `5` | Sets `DamageImmunityTimer = max(timer, duration)`. | Blocks all damage in `DamageHandler.ApplyDamage`. |
| **StatusImmunity** | `6` | Sets `StatusImmunityTimer = max(timer, duration)`. | Blocks application of negative statuses (Poison, Burn, Frost, Stun, StatReduction). |
| **Shield** | — | Adds timed shield batch `(amount, duration)` to `ShieldTimers`; scaled by `attacker.Stats.ShieldModifier`. | Absorbs non-piercing damage before Health; expires when timer reaches `0`. |

---

## 7. Effects, Keywords (`Rush` / `Stall`), Triggers & Quests

### 7.1 `EffectKeywordType` (`EffectsUpdateSystem.HandleKeywords` @ `0x18055ea10`)
- **`None (0)`**: Active for the entire battle (or until `effectData.Timer` expires).
- **`Rush (1)`**:
  - Active immediately at combat start for `IBattleSingleton.RushDuration` seconds (stored in `EffectsState.RushEffectTimers[effect.Id]`).
  - At `t = 0`, `EffectHandler.TriggerRushStartEffects` (`0x18057f030`) fires `EffectTriggerType.OnRushStart (40)` (and `OnRushOrStallTriggered (43)`).
  - While `RushEffectTimers[effect.Id] > 0`, the effect can trigger and its `Constant`/`PerFrame`/`OnInterval` modifiers remain active.
  - When the timer reaches `<= 0`, `EffectHandler.EndRushEffect` (`0x18057a160`) calls `BattleContext.UnapplyEffect(effect.Id)` and fires `EffectTriggerType.OnRushEnd (41)`.
- **`Stall (2)`**:
  - Dormant at combat start for `IBattleSingleton.StallDuration` seconds (stored in `EffectsState.StallEffectTimers[effect.Id]`).
  - While in `StallEffectTimers`, `CanExecuteFromKeyword` (`0x180579580`) returns `false` and `ApplyConstantEffects` skips the effect.
  - When `StallEffectTimers[effect.Id]` crosses `<= 0`:
    1. Fires `EffectTriggerType.OnStallStart (42)` (and `OnRushOrStallTriggered (43)`).
    2. Removes `effect.Id` from `StallEffectTimers`.
    3. If `effect.Trigger == Constant (1)`, immediately executes `effect.Execute(BattleContext, BattleContext)`.
    4. Subsequent frames evaluate the effect normally via `UpdateEffect`.

### 7.2 `EffectTriggerType` & `EffectTriggerAttachmentType` (`EffectHandler.OnTrigger` @ `0x18057c230`)
- **Evaluation Modes**:
  - `Constant (1)`: Applied once at combat start (or when Stall starts / Rush ends).
  - `PerFrameEvaluation (2)`: Unapplied and re-executed every simulation tick (`UpdateEffect` @ `0x180560240`).
  - `OnInterval (60 / 0x3c)`: Executed every `effect.EffectInterval` seconds via `EffectsState.EffectTimers`.
  - **Event-Driven Triggers**: `OnCombatStart`, `OnBasicAttack`, `OnAbilityDamageReceived (11)`, `OnAttackDamageReceived (12)`, `OnDamageDealt (13)`, `OnAttackDamageDealt (14)`, `OnStatusDamageReceived (15)`, `OnCritLanded`, `OnActiveAbilityUsed`, `OnManaSpent`, `OnDamageReceived (30)`, `OnCharacterKilled (32)`, `OnRushStart (40)`, `OnRushEnd (41)`, `OnStallStart (42)`, `OnRushOrStallTriggered (43)`, `OnMovementFinished (50)`, `OnShardsGenerated (120)`, etc.
- **Attachment Filtering (`EffectTriggerAttachmentType`)**:
  - `0 = Global`: Triggers regardless of which entity caused the event.
  - `1 = OwnerIsSource`: `effectData.OwnerEntityId == sourceEntityId`.
  - `2 = OwnerIsTarget`: `effectData.OwnerEntityId == targetEntityId`.
  - `3 = OwnerIsAllyToSource`, `4 = OwnerIsEnemyToSource`.
  - `100 = SourceIsHero`, `101 = SourceIsHeroWithClass`, `102 = SourceIsMonster`, `103 = TargetIsHero`, `104 = TargetIsHeroWithClass`, `105 = TargetIsMonster`.
- **Global Permanent Counters (`SimulationPermanentChanges`)**:
  - Whenever a player effect triggers `OnRushStart (40)`, increments `"totalRushTriggers"` by `1`.
  - Whenever a player effect triggers `OnStallStart (42)`, increments `"totalStallTriggers"` by `1`.
  - Whenever `OnShardsGenerated (120)` triggers, increments `"globalShardsGenerated"` by `value`.

---

## 8. Overtime Mechanics (`StormSystem`), Fight Modes & Wave Scaling

### 8.1 Storm & Riftbreaker (`StormSystem` @ `0x180570860`)
1. **Storm (`TickStorm` @ `0x180570570`)**:
   - Starts after `IBattleSingleton.TimeUntilStorm` elapses.
   - Pulses every `IBattleSingleton.StormDamageInterval` seconds on **all alive entities** (both Heroes and Enemies):
     - Heroes reduce incoming Storm damage by `Frame.StormState.HeroStormDamageReduction`:
       $$\\text{{dmg}}_{{\\text{{hero}}}} = \\text{{CurrentStormDamage}} - \\lfloor \\text{{CurrentStormDamage}} \\times \\text{{HeroStormDamageReduction}} \\rfloor$$
   - After each pulse, `CurrentStormDamage` escalates based on elapsed storm time $t_{{\\text{{storm}}}} = -\\text{{TimeUntilStorm}}$:
     - **Linear phase** ($t_{{\\text{{storm}}}} < \\text{{StormExponentialPhaseStartTime}}$):
       $$\\text{{CurrentStormDamage}} \\mathrel{{+}}= \\text{{StormDamageFlatIncrease}}$$
     - **Exponential phase** ($t_{{\\text{{storm}}}} \\ge \\text{{StormExponentialPhaseStartTime}}$):
       $$\\text{{CurrentStormDamage}} = \\lfloor \\text{{CurrentStormDamage}} \\times \\text{{StormDamageMultiplierIncrease}} \\rfloor$$
2. **Riftbreaker (`TickRiftbreaker` @ `0x180570190`)**:
   - Optional player-favoring overtime mechanic (when `TimeUntilRiftbreaker` has value).
   - Once `TimeUntilRiftbreaker <= 0`, pulses every `RiftbreakerInterval` seconds on **all alive non-hero enemies** (`!entity.IsHero`), dealing percentage MaxHP **True Damage**:
     $$\\text{{dmg}}_{{\\text{{enemy}}}} = \\text{{round}}\\left(\\text{{enemy.Stats.MaxHealth.Value}} \\times \\text{{RiftbreakerMaxHpPercentDamage}}\\right)$$

### 8.2 Fight Modes (`FightMode` Enum)
- `0 = Regular`: Standard team elimination (`EndConditionSystem`).
- `1 = OneOnOne`: Single selected Hero (`GameRegistryData.OneOnOneHero`) duels the encounter enemy.
- `2 = DealDamage`: Player wins (`SimulationResult.Victory`) as soon as total damage dealt to enemies (`f.DamageDealtByPlayer`) reaches the highest threshold in `f.FightModeThresholds` (`DamageDealtEndConditionSystem` @ `0x18055d640`).
- `3 = Survival`: Player wins (`SimulationResult.Victory`) by surviving until `f.TimeSinceStart` reaches the final seconds threshold in `f.FightModeThresholds` (`SurvivalEndConditionSystem` @ `0x180570890`).

### 8.3 Enemy Wave / Floor Stat Scaling (`EnemyData..ctor` @ `0x18050e3a0`)
When enemies are instantiated for an encounter with `scalingAmount` $N$ (and static constants initialized in `EnemyData..cctor` @ `0x18050db90`: `ScalingExponentA = 0.43092`, `ScalingExponentB = 0.07815`):
1. Computes the quadratic scaling exponent:
   $$e(N) = N \\times (0.43092 + 0.07815 \\times N)$$
2. Iterates over each `StatScaling` entry in `IEnemyScalingEntry.StatScalings`:
   - **`ScalingType == 1` (Linear)**:
     $$\\Delta \\text{{Stat}} = \\text{{statScaling.Value}} \\times e(N)$$
   - **`ScalingType == 2` (Exponential)**:
     $$\\Delta \\text{{Stat}} = \\min\\left(\\text{{BaseStat}} \\times (\\text{{statScaling.Value}})^{{e(N)}},\\; 500{{,}}000{{,}}000\\right) - \\text{{BaseStat}}$$
3. Applies $\\Delta \\text{{Stat}}$ via `_stats.AddConstantStatBonus(statType, bonus)`.

### 8.4 Hero Rank Offering Roll (`HeroRankHelper.RandomizeHeroRank` @ `0x1805294c0`)
When generating a hero reward on floor $F$:
- Rolls $u \\sim \\text{{RandomProvider.Range}}(0, 100)$.
- Iterates `IHeroesSingleton.HeroRankChancesPerFloor` (entries with `ChancePerFloor` and `Rank`):
  - Accumulates threshold $T \\mathrel{{+}}= F \\times \\text{{ChancePerFloor}} \\times 100$.
  - If $u < T$, returns `entry.Rank`; otherwise falls back to Rank `1`.

---

## 9. Synergy Simulator (`ember.synergySimulator.dll`)

`SynergySimulationConfig` (`0x18069ce50`) is a standalone Monte Carlo balancing tool used to test synergy completion rates across a full run:
- **Pools**: Initializes `RunData` (`0x18069a240`) with `HeroPool`, `ItemPool`, and `RelicPool` from `SimulatableItem` arrays (`Name`, `Synergy`, `MaxRank`).
- **Highest Synergy Calculation (`RunData.GetHighestSynergy` @ `0x180699ec0`)**:
  - Concatenates `AcquiredHeroes`, `AcquiredItems`, and `AcquiredRelics`.
  - Excludes items where `Synergy == "Neutral"`.
  - Groups by `Synergy` and sums `Rank` (`g.Sum(i => i.Rank)`), returning the synergy name with the highest total rank.
- **Greedy Draft Heuristic (`SynergySimulationConfig.DecideOnItemsToAcquire` @ `0x18069c510`)**:
  1. Checks if any offered reward upgrades an already-acquired non-Neutral item (`idx_upgrade`).
  2. Checks if any offered reward matches `runData.GetHighestSynergy()` (`idx_highest_synergy`).
  3. If neither is found and rerolls remain (`rerollsPerReward > 0` or `runRerollsLeft > 0`), rerolls the offer (excluding currently offered items).
  4. Otherwise selects in priority order: upgrade -> highest synergy -> any already-owned synergy -> any non-Neutral item -> any Neutral item.
- **Completion Rate (`RunSummary..ctor` @ `0x18069a620`)**:
  $$\\text{{CompletionRate}} = \\frac{{\\text{{HighestSynergyCount}}}}{{\\text{{TotalSynergyCount}}}} \\times 100\\%$$

---

## 10. Decompiled Core Methods & Annotated Disassembly Summary

Below are the {len(methods_output)} key simulation methods extracted and decompiled by `agent2_disasm_simulation.py` (full assembly listings and all {sim_core['type_count'] + sim_runtime['type_count'] + syn_sim['type_count']} type schemas are stored in `simulation_decompiled.json`):

""" + "\n".join(
        f"""### 10.{i+1} `{m['name']}` (`{m['va']}`, `{m['assembly']}`)
- **Purpose**: {m['purpose']}
```csharp
{m['pseudocode']}
```
"""
        for i, m in enumerate(methods_output)
    )


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[*] Loading PE and Metadata from {GAME_DIR}...")
    parser = IL2CPPBinaryParser(GAME_ASSEMBLY_PATH, METADATA_PATH)

    target_assemblies = [
        "ember.simulation.core.dll",
        "ember.simulation.unityRuntime.dll",
        "ember.synergySimulator.dll",
    ]
    schemas = {}
    for asm in target_assemblies:
        print(f"[*] Extracting full type/field/method schema for {asm}...")
        schemas[asm] = parser.extract_assembly_schema(asm)

    # Also extract balancing interfaces summary from ember.balancing.dll
    print("[*] Extracting SimulationBridge & sheet interfaces from ember.balancing.dll...")
    balancing_schema = parser.extract_assembly_schema("ember.balancing.dll")
    bridge_types = [
        t for t in balancing_schema["types"]
        if "SimulationBridge" in t["full_name"] or "Singleton" in t["full_name"] or "Scaling" in t["full_name"]
    ]

    print("[*] Disassembling and annotating core simulation methods...")
    methods_output = []
    for m in CORE_METHODS_DECOMPILATION:
        va = m["va"]
        disasm_lines = parser.disassemble_method(va, max_insns=160)
        methods_output.append({
            "name": m["name"],
            "va": f"0x{va:x}",
            "assembly": m["assembly"],
            "purpose": m["purpose"],
            "pseudocode": m["pseudocode"],
            "disassembly": disasm_lines,
        })

    decompiled_json = {
        "metadata": {
            "game": "Guildrun Demo",
            "unity_version": "6000.0.64f1",
            "il2cpp_metadata_version": 31,
            "image_base": f"0x{parser.image_base:x}",
            "g_CodeRegistration": f"0x{G_CODE_REGISTRATION_VA:x}",
            "g_MetadataRegistration": f"0x{G_METADATA_REGISTRATION_VA:x}",
            "g_CodeGenModules": f"0x{G_CODEGEN_MODULES_VA:x}",
        },
        "formulas": {
            "fixed_point_format": "Q48.16 signed int64 (1.0 = 65536 = 0x10000)",
            "fp_multiply": "((a * b) + 0x8000) >> 16",
            "stat_value": "clamp((Base + ConstFlat + CombatFlat + TempFlat + RankFlat) * (1 + (ConstPct + CombatPct + TempPct) / 100), MinValue, MaxValue)",
            "hero_rank_bonus": "(Rank - 1) * bonusPerRank (summed over IHeroesSingleton.RankStatBonuses and hero classes)",
            "damage_mitigation_positive": "dmg * (100 / (100 + DefenseOrResistance))",
            "damage_mitigation_negative": "dmg * (2 - 100 / (100 - DefenseOrResistance))",
            "crit_damage": "rawDamage * (CritDamage / 100) when Random(0, 100) < CritChance",
            "frosted_bonus_damage": "postMitigationDamage * (1 + BonusDamageVsFrosted / 100)",
            "execution_check": "(Health * 100 / MaxHealth) <= ExecutionThreshold",
            "poison_tick_damage": "floor(PoisonStacks * PoisonDamagePerStack) every PoisonDamageTickInterval",
            "burn_tick_damage": "floor(BurnStacks * BurnDamagePerStack) to target + floor(dmg * BurnDamageMultiplierForAdjacentAllies) to 6 hex-adjacent allies",
            "frost_attack_speed_slow": "FrostStacks * FrostAttackSpeedReductionPerStack (applied to AttackSpeed in TemporaryEffectsSystem)",
            "attack_timer_step": "DeltaTime * (AttackSpeed / 100)",
            "hex_cell_to_world_x": "GridOrigin.X + col * (2 * CellInnerRadius) + ((row & 1) != 0 ? CellInnerRadius : 0)",
            "hex_cell_to_world_z": "GridOrigin.Z + row * CellOuterRadius * 1.5",
            "hex_axial_distance": "(abs(dq) + abs(dq + dr) + abs(dr)) >> 1 where q = col - ((row - (row & 1)) >> 1), r = row",
            "storm_hero_damage": "CurrentStormDamage - floor(CurrentStormDamage * HeroStormDamageReduction)",
            "storm_escalation_linear": "CurrentStormDamage += StormDamageFlatIncrease (when elapsedStorm < StormExponentialPhaseStartTime)",
            "storm_escalation_exponential": "CurrentStormDamage = floor(CurrentStormDamage * StormDamageMultiplierIncrease) (when elapsedStorm >= StormExponentialPhaseStartTime)",
            "riftbreaker_damage": "round(enemy.MaxHealth * RiftbreakerMaxHpPercentDamage) as True Damage to all non-hero enemies",
            "enemy_wave_scaling_exponent": "e(N) = N * (0.43092 + 0.07815 * N)",
            "enemy_wave_scaling_linear": "bonus = Value * e(N)",
            "enemy_wave_scaling_exponential": "bonus = min(BaseStat * (Value ^ e(N)), 500000000) - BaseStat",
        },
        "core_methods": methods_output,
        "assemblies": schemas,
        "balancing_simulation_bridge_types": bridge_types,
    }

    print(f"[*] Writing {OUT_JSON_PATH}...")
    OUT_JSON_PATH.write_text(json.dumps(decompiled_json, indent=2), encoding="utf-8")

    print(f"[*] Writing {OUT_MD_PATH}...")
    md_text = generate_markdown_spec(schemas, methods_output)
    OUT_MD_PATH.write_text(md_text, encoding="utf-8")

    print(f"[+] Done! JSON size: {OUT_JSON_PATH.stat().st_size:,} bytes, MD size: {OUT_MD_PATH.stat().st_size:,} bytes.")


if __name__ == "__main__":
    main()

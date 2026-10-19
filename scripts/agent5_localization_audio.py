#!/usr/bin/env python3
"""
Agent 5: Localization String Tables & FMOD Audio Bank Extractor
Target: Guildrun Demo (Unity 6000.0.64f1 / UnityFS v8 / SerializedFile v22 / FMOD Studio FEV + FSB5)

Extracts:
1. All 16 SharedTableData tables and 3,923 localization keys from Addressables bundles:
   - localization-assets-shared_assets_all.bundle
   - localization-locales_assets_all.bundle
   - localization-string-tables-english(en)_assets_all.bundle
   - localization-string-tables-french(fr)_assets_all.bundle
   - Plus all 7 additional locale bundles (de, es, pt-br, ru, ja, zh-hans, zh-hant)
2. All 395 FMOD Studio paths & GUIDs from MASTER.strings.bank (StringTable_RadixTreePacked STDT chunk)
   and all event-to-bank mappings + 610 FSB5 audio sample headers/names from MASTER.bank, MUSIC.bank, SFX.bank, VO.bank.

Outputs:
- c:/Users/Aceliweth/Downloads/rea/guildrun-web/re_data/localization.json
- c:/Users/Aceliweth/Downloads/rea/guildrun-web/re_data/audio_events.json
"""

import json
import os
import struct
from pathlib import Path

STREAMING_ASSETS_DIR = Path(
    r"C:\Program Files (x86)\Steam\steamapps\common\Guildrun Demo\Guildrun_Data\StreamingAssets"
)
AA_BUNDLES_DIR = STREAMING_ASSETS_DIR / "aa" / "StandaloneWindows64"
OUTPUT_DIR = Path(r"c:\Users\Aceliweth\Downloads\rea\guildrun-web\re_data")


# ============================================================================
# 1. Pure-Python LZ4 Raw Block Decompressor & UnityFS / SerializedFile v22
# ============================================================================

def lz4_decompress_block(src: bytes, uncompressed_size: int) -> bytes:
    """Pure-Python LZ4 raw block decompressor."""
    out = bytearray()
    pos = 0
    n = len(src)
    while pos < n and len(out) < uncompressed_size:
        token = src[pos]
        pos += 1
        lit_len = token >> 4
        if lit_len == 15:
            while pos < n:
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
        if (token & 0x0F) == 15:
            while pos < n:
                b = src[pos]
                pos += 1
                match_len += b
                if b != 255:
                    break
        match_pos = len(out) - offset
        if match_len <= offset:
            out.extend(out[match_pos : match_pos + match_len])
        else:
            for i in range(match_len):
                out.append(out[match_pos + i])
    return bytes(out)


def read_aligned_string(buf: bytes, pos: int) -> tuple[str, int]:
    """Read a 4-byte length-prefixed UTF-8 string and align position to 4 bytes."""
    length = struct.unpack_from("<i", buf, pos)[0]
    pos += 4
    if length < 0 or pos + length > len(buf):
        raise ValueError(f"Invalid string length {length} at offset {pos - 4}")
    s = buf[pos : pos + length].decode("utf-8", errors="replace")
    pos = (pos + length + 3) & ~3
    return s, pos


def parse_unityfs_bundle(bundle_path: Path) -> list[tuple[int, int, bytes]]:
    """
    Decompress a UnityFS v8 bundle and parse its primary CAB SerializedFile v22.
    Returns list of (path_id, class_id, raw_object_bytes).
    """
    data = bundle_path.read_bytes()
    pos = 0

    def read_cstr() -> str:
        nonlocal pos
        end = data.index(b"\x00", pos)
        s = data[pos:end].decode("utf-8", errors="replace")
        pos = end + 1
        return s

    signature = read_cstr()
    if signature != "UnityFS":
        raise ValueError(f"Unexpected bundle signature: {signature}")
    version = struct.unpack_from(">I", data, pos)[0]
    pos += 4
    _unity_version = read_cstr()
    _unity_revision = read_cstr()
    _file_size, compressed_info_size, uncompressed_info_size, flags = struct.unpack_from(
        ">QIII", data, pos
    )
    pos += 20

    if version >= 7:
        pos = (pos + 15) & ~15

    if flags & 0x80:
        info_raw = data[-compressed_info_size:]
    else:
        info_raw = data[pos : pos + compressed_info_size]
        pos += compressed_info_size

    if flags & 0x200:
        pos = (pos + 15) & ~15

    comp_type = flags & 0x3F
    if comp_type in (2, 3):
        info = lz4_decompress_block(info_raw, uncompressed_info_size)
    elif comp_type == 0:
        info = info_raw
    else:
        raise ValueError(f"Unsupported compression type {comp_type} in {bundle_path.name}")

    ipos = 16  # skip 16-byte uncompressedDataHash
    block_count = struct.unpack_from(">I", info, ipos)[0]
    ipos += 4
    blocks = []
    for _ in range(block_count):
        u_size, c_size, b_flags = struct.unpack_from(">IIH", info, ipos)
        ipos += 10
        blocks.append((u_size, c_size, b_flags))

    node_count = struct.unpack_from(">I", info, ipos)[0]
    ipos += 4
    nodes = []
    for _ in range(node_count):
        n_off, n_size, n_flags = struct.unpack_from(">QQI", info, ipos)
        ipos += 20
        end = info.index(b"\x00", ipos)
        n_path = info[ipos:end].decode("utf-8", errors="replace")
        ipos = end + 1
        nodes.append((n_off, n_size, n_flags, n_path))

    stream = bytearray()
    for u_size, c_size, b_flags in blocks:
        b_comp = b_flags & 0x3F
        chunk = data[pos : pos + c_size]
        pos += c_size
        if b_comp in (2, 3):
            stream.extend(lz4_decompress_block(chunk, u_size))
        elif b_comp == 0:
            stream.extend(chunk)
        else:
            raise ValueError(f"Unsupported block compression {b_comp}")

    cab = bytes(stream[nodes[0][0] : nodes[0][0] + nodes[0][1]])

    # Parse SerializedFile v22 header
    data_offset = struct.unpack_from(">Q", cab, 32)[0]
    cpos = 48
    end = cab.index(b"\x00", cpos)
    cpos = end + 1
    _target_platform, enable_type_tree, type_count = struct.unpack_from("<iBi", cab, cpos)
    cpos += 9

    types = []
    for _ in range(type_count):
        class_id, _is_stripped, script_idx = struct.unpack_from("<iBh", cab, cpos)
        cpos += 7
        if class_id == 114 or script_idx >= 0:
            cpos += 16  # scriptID Hash128
        cpos += 16  # oldTypeHash Hash128
        if enable_type_tree:
            num_nodes, str_len = struct.unpack_from("<ii", cab, cpos)
            cpos += 8 + num_nodes * 32 + str_len
            dep_count = struct.unpack_from("<i", cab, cpos)[0]
            cpos += 4 + dep_count * 4
        types.append(class_id)

    obj_count = struct.unpack_from("<i", cab, cpos)[0]
    cpos += 4
    objects = []
    for _ in range(obj_count):
        cpos = (cpos + 3) & ~3
        path_id, byte_start, byte_size, type_id = struct.unpack_from("<qQII", cab, cpos)
        cpos += 24
        obj_bytes = cab[data_offset + byte_start : data_offset + byte_start + byte_size]
        objects.append((path_id, types[type_id], obj_bytes))

    return objects


# ============================================================================
# 2. Extract Localization SharedTableData, Locales, and StringTables
# ============================================================================

def extract_localization() -> dict:
    # 2a. Parse Locales bundle
    locales_bundle = AA_BUNDLES_DIR / "localization-locales_assets_all.bundle"
    locales = []
    if locales_bundle.exists():
        for path_id, class_id, raw in parse_unityfs_bundle(locales_bundle):
            if class_id != 114:
                continue
            pos = 28
            locale_name, pos = read_aligned_string(raw, pos)
            locale_code, pos = read_aligned_string(raw, pos)
            sort_order = struct.unpack_from("<H", raw, pos)[0]
            locales.append({
                "path_id": path_id,
                "name": locale_name,
                "code": locale_code,
                "sort_order": sort_order,
            })
    locales.sort(key=lambda x: x["sort_order"])

    # 2b. Parse SharedTableData bundle
    shared_bundle = AA_BUNDLES_DIR / "localization-assets-shared_assets_all.bundle"
    shared_tables_by_pid = {}
    key_id_to_info = {}

    for path_id, class_id, raw in parse_unityfs_bundle(shared_bundle):
        if class_id != 114:
            continue
        pos = 28
        asset_name, pos = read_aligned_string(raw, pos)
        collection_name, pos = read_aligned_string(raw, pos)
        collection_guid, pos = read_aligned_string(raw, pos)
        entry_count = struct.unpack_from("<i", raw, pos)[0]
        pos += 4
        entries = []
        for _ in range(entry_count):
            entry_id = struct.unpack_from("<q", raw, pos)[0]
            pos += 8
            entry_key, pos = read_aligned_string(raw, pos)
            meta_count = struct.unpack_from("<i", raw, pos)[0]
            pos += 4 + meta_count * 8
            entries.append({"id": entry_id, "key": entry_key})
            key_id_to_info[entry_id] = {
                "table": collection_name,
                "key": entry_key,
                "shared_path_id": path_id,
            }

        shared_tables_by_pid[path_id] = {
            "path_id": path_id,
            "asset_name": asset_name,
            "table_collection_name": collection_name,
            "table_collection_guid": collection_guid,
            "entry_count": len(entries),
            "entries": entries,
        }

    # 2c. Parse all StringTable bundles (en, fr, and all other available locales)
    string_table_bundles = sorted(
        AA_BUNDLES_DIR.glob("localization-string-tables-*_assets_all.bundle")
    )
    translations_by_locale: dict[str, dict[int, str]] = {}
    table_assets_by_locale: dict[str, list[dict]] = {}

    for bpath in string_table_bundles:
        for path_id, class_id, raw in parse_unityfs_bundle(bpath):
            if class_id != 114:
                continue
            pos = 28
            table_asset_name, pos = read_aligned_string(raw, pos)
            locale_code, pos = read_aligned_string(raw, pos)
            shared_file_id, shared_path_id = struct.unpack_from("<iq", raw, pos)
            pos += 12
            meta_count = struct.unpack_from("<i", raw, pos)[0]
            pos += 4 + meta_count * 8
            data_count = struct.unpack_from("<i", raw, pos)[0]
            pos += 4

            locale_map = translations_by_locale.setdefault(locale_code, {})
            for _ in range(data_count):
                entry_id = struct.unpack_from("<q", raw, pos)[0]
                pos += 8
                localized_str, pos = read_aligned_string(raw, pos)
                entry_meta_count = struct.unpack_from("<i", raw, pos)[0]
                pos += 4 + entry_meta_count * 8
                locale_map[entry_id] = localized_str

            table_assets_by_locale.setdefault(locale_code, []).append({
                "path_id": path_id,
                "name": table_asset_name,
                "locale": locale_code,
                "shared_data_path_id": shared_path_id,
                "entry_count": data_count,
            })

    # 2d. Join SharedTableData with English, French, and all other locales
    tables_output = {}
    flat_keys_output = {}
    en_fr_Only_output = {}

    for shared_pid, st in sorted(
        shared_tables_by_pid.items(), key=lambda item: item[1]["table_collection_name"]
    ):
        col_name = st["table_collection_name"]
        joined_entries = {}
        for entry in st["entries"]:
            eid = entry["id"]
            ekey = entry["key"]
            en_val = translations_by_locale.get("en", {}).get(eid)
            fr_val = translations_by_locale.get("fr", {}).get(eid)
            all_locs = {
                loc: translations_by_locale[loc][eid]
                for loc in sorted(translations_by_locale.keys())
                if eid in translations_by_locale[loc]
            }
            joined_entries[ekey] = {
                "id": eid,
                "en": en_val,
                "fr": fr_val,
                "locales": all_locs,
            }
            flat_keys_output[ekey] = {
                "table": col_name,
                "id": eid,
                "en": en_val,
                "fr": fr_val,
                "locales": all_locs,
            }
            en_fr_Only_output[ekey] = {
                "en": en_val,
                "fr": fr_val,
            }

        tables_output[col_name] = {
            "shared_path_id": shared_pid,
            "asset_name": st["asset_name"],
            "guid": st["table_collection_guid"],
            "entry_count": st["entry_count"],
            "entries": joined_entries,
        }

    return {
        "metadata": {
            "unity_version": "6000.0.64f1",
            "total_tables": len(tables_output),
            "total_shared_keys": len(flat_keys_output),
            "locale_entry_counts": {
                loc: len(entries) for loc, entries in sorted(translations_by_locale.items())
            },
            "locales": locales,
        },
        "tables": tables_output,
        "keys": flat_keys_output,
        "en_fr": en_fr_Only_output,
    }


# ============================================================================
# 3. Extract FMOD Studio String Table (MASTER.strings.bank) & Audio Banks
# ============================================================================

FSB5_FREQ_MAP = {
    1: 8000,
    2: 11000,
    3: 11025,
    4: 16000,
    5: 22050,
    6: 24000,
    7: 32000,
    8: 44100,
    9: 48000,
}

FSB5_CODEC_MAP = {
    0: "NONE",
    1: "PCM8",
    2: "PCM16",
    3: "PCM24",
    4: "PCM32",
    5: "PCMFLOAT",
    6: "GCADPCM",
    7: "IMAADPCM",
    8: "VAG",
    9: "HEVAG",
    10: "XMA",
    11: "MPEG",
    12: "CELT",
    13: "AT9",
    14: "XWMA",
    15: "VORBIS",
    16: "FADPCM",
    17: "OPUS",
}


def format_fmod_guid(raw16: bytes) -> str:
    d1, d2, d3 = struct.unpack_from("<IHH", raw16, 0)
    return f"{{{d1:08x}-{d2:04x}-{d3:04x}-{raw16[8:10].hex()}-{raw16[10:16].hex()}}}"


def parse_fmod_strings_bank(bank_path: Path) -> list[dict]:
    """
    Parse FMOD Studio MASTER.strings.bank STDT (StringTable_RadixTreePacked) chunk
    to reconstruct all 395 full paths and their 16-byte GUIDs.
    """
    data = bank_path.read_bytes()
    stdt_idx = data.find(b"STDT")
    if stdt_idx == -1:
        raise ValueError(f"STDT chunk not found in {bank_path.name}")
    stdt_size = struct.unpack_from("<I", data, stdt_idx + 4)[0]
    stdt = data[stdt_idx + 8 : stdt_idx + 8 + stdt_size]

    table_type = struct.unpack_from("<I", stdt, 0)[0]
    if table_type != 1:
        raise ValueError(f"Unsupported STDT table type: {table_type}")

    # Packed array 1: Radix tree nodes (8 bytes each)
    raw_node_count, node_stride = struct.unpack_from("<HH", stdt, 4)
    node_count = raw_node_count >> 1
    nodes_offset = 8
    nodes_end = nodes_offset + node_count * node_stride

    # Packed array 2: GUID table (16 bytes each)
    raw_guid_count, guid_stride = struct.unpack_from("<HH", stdt, nodes_end)
    guid_count = raw_guid_count >> 1
    guids_offset = nodes_end + 4
    guids_end = guids_offset + guid_count * guid_stride

    # Packed array 3: String character blob
    raw_str_size = struct.unpack_from("<H", stdt, guids_end)[0]
    str_blob_size = raw_str_size if (raw_str_size & 1) == 0 else (raw_str_size >> 1)
    str_offset = guids_end + 2

    def get_cstr(off: int) -> str:
        if off == 0xFFFFFF:
            return ""
        start = str_offset + off
        end = stdt.index(b"\x00", start)
        return stdt[start:end].decode("utf-8", errors="replace")

    entries = []

    def dfs(node_idx: int, prefix: str) -> None:
        npos = nodes_offset + node_idx * 8
        b = stdt[npos : npos + 8]
        soff = b[0] | (b[1] << 8) | (b[2] << 16)
        cidx = b[4] | (b[5] << 8) | (b[6] << 16)
        ccnt = b[7]
        cur = prefix + get_cstr(soff)
        if ccnt == 0:
            g_bytes = stdt[guids_offset + cidx * 16 : guids_offset + (cidx + 1) * 16]
            entries.append({
                "guid_index": cidx,
                "guid": format_fmod_guid(g_bytes),
                "path": cur,
            })
        else:
            for i in range(ccnt):
                dfs(cidx + i, cur)

    dfs(0, "")
    entries.sort(key=lambda x: x["path"])
    return entries


def parse_fsb5_from_bank(data: bytes, fsb_pos: int) -> dict:
    """Parse FSB5 header, sample metadata headers, and sample name table."""
    ver, num_samples, shdr_size, name_size, data_size, mode = struct.unpack_from(
        "<IIIIII", data, fsb_pos + 4
    )
    pos = fsb_pos + 60
    samples = []
    for i in range(num_samples):
        val = struct.unpack_from("<Q", data, pos)[0]
        pos += 8
        next_chunk = val & 1
        freq_id = (val >> 1) & 0xF
        ch_bits = (val >> 5) & 0x3
        channels = {0: 1, 1: 2, 2: 6, 3: 8}.get(ch_bits, 1)
        data_off = ((val >> 7) & 0x7FFFFFF) * 32
        num_pcm_samples = (val >> 34) & 0x3FFFFFFF

        extra_chunks = []
        while next_chunk:
            cval = struct.unpack_from("<I", data, pos)[0]
            pos += 4
            next_chunk = cval & 1
            csz = (cval >> 1) & 0xFFFFFF
            ctype = (cval >> 25) & 0x7F
            extra_chunks.append({"type": ctype, "size": csz})
            pos += csz

        sr = FSB5_FREQ_MAP.get(freq_id, 48000)
        samples.append({
            "index": i,
            "name": f"sample_{i}",
            "sample_rate": sr,
            "channels": channels,
            "pcm_samples": num_pcm_samples,
            "duration_sec": round(num_pcm_samples / sr, 3) if sr else 0.0,
            "data_offset": data_off,
        })

    # Compute compressed size per sample from adjacent data_offsets
    for i in range(num_samples):
        next_off = samples[i + 1]["data_offset"] if i + 1 < num_samples else data_size
        samples[i]["compressed_size"] = next_off - samples[i]["data_offset"]

    if name_size > 0:
        name_base = fsb_pos + 60 + shdr_size
        for i in range(num_samples):
            noff = struct.unpack_from("<I", data, name_base + i * 4)[0]
            end = data.index(b"\x00", name_base + noff)
            samples[i]["name"] = data[name_base + noff : end].decode("utf-8", errors="replace")

    return {
        "version": ver,
        "codec": FSB5_CODEC_MAP.get(mode, f"UNKNOWN_{mode}"),
        "codec_id": mode,
        "sample_count": num_samples,
        "sample_header_size": shdr_size,
        "name_table_size": name_size,
        "audio_data_size": data_size,
        "samples": samples,
    }


def extract_fmod_audio() -> dict:
    strings_entries = parse_fmod_strings_bank(STREAMING_ASSETS_DIR / "MASTER.strings.bank")
    guid_to_path = {e["guid"]: e["path"] for e in strings_entries}

    # Categorize paths by prefix (event:/, bus:/, vca:/, parameter:/, snapshot:/, bank:/)
    categorized = {
        "events": [],
        "buses": [],
        "vcas": [],
        "parameters": [],
        "snapshots": [],
        "banks": [],
    }
    for entry in strings_entries:
        p = entry["path"]
        if p.startswith("event:/"):
            categorized["events"].append(entry)
        elif p.startswith("bus:/"):
            categorized["buses"].append(entry)
        elif p.startswith("vca:/"):
            categorized["vcas"].append(entry)
        elif p.startswith("parameter:/"):
            categorized["parameters"].append(entry)
        elif p.startswith("snapshot:/"):
            categorized["snapshots"].append(entry)
        elif p.startswith("bank:/"):
            categorized["banks"].append(entry)

    # Parse all .bank files for BNKI, EVTB (event GUIDs), and FSB5 samples
    bank_files = sorted(STREAMING_ASSETS_DIR.glob("*.bank"))
    banks_info = {}
    event_guid_to_bank = {}

    for bpath in bank_files:
        bdata = bpath.read_bytes()
        fev_ver = struct.unpack_from("<HH", bdata, 20) if len(bdata) >= 24 else (0, 0)

        bnki_pos = bdata.find(b"BNKI")
        bank_guid = (
            format_fmod_guid(bdata[bnki_pos + 8 : bnki_pos + 24])
            if bnki_pos != -1
            else None
        )

        # Find all EVTB chunks inside the bank
        bank_events = []
        search_pos = 0
        while True:
            evtb_pos = bdata.find(b"EVTB", search_pos)
            if evtb_pos == -1:
                break
            evtb_sz = struct.unpack_from("<I", bdata, evtb_pos + 4)[0]
            if 16 <= evtb_sz <= 256 and evtb_pos + 24 <= len(bdata):
                eguid = format_fmod_guid(bdata[evtb_pos + 8 : evtb_pos + 24])
                if eguid in guid_to_path and guid_to_path[eguid].startswith("event:/"):
                    epath = guid_to_path[eguid]
                    bank_events.append({"guid": eguid, "path": epath})
                    event_guid_to_bank[eguid] = bpath.name
            search_pos = evtb_pos + 4

        bank_events.sort(key=lambda x: x["path"])

        fsb_pos = bdata.find(b"FSB5")
        fsb_info = parse_fsb5_from_bank(bdata, fsb_pos) if fsb_pos != -1 else None

        banks_info[bpath.name] = {
            "file_name": bpath.name,
            "file_size": len(bdata),
            "bank_guid": bank_guid,
            "bank_path": guid_to_path.get(bank_guid),
            "fmod_version": f"0x{fev_ver[0]:04x}",
            "event_count": len(bank_events),
            "events": bank_events,
            "fsb5": fsb_info,
        }

    # Annotate categorized events with their bank name and category breakdown
    events_by_category: dict[str, list[dict]] = {}
    for ev in categorized["events"]:
        ev["bank"] = event_guid_to_bank.get(ev["guid"])
        parts = ev["path"][len("event:/") :].split("/")
        top_cat = "/".join(parts[:2]) if len(parts) >= 2 else parts[0]
        events_by_category.setdefault(top_cat, []).append(ev)

    total_samples = sum(
        b["fsb5"]["sample_count"] for b in banks_info.values() if b["fsb5"] is not None
    )

    return {
        "metadata": {
            "total_string_table_entries": len(strings_entries),
            "total_events": len(categorized["events"]),
            "total_buses": len(categorized["buses"]),
            "total_vcas": len(categorized["vcas"]),
            "total_parameters": len(categorized["parameters"]),
            "total_snapshots": len(categorized["snapshots"]),
            "total_banks": len(categorized["banks"]),
            "total_fsb5_audio_samples": total_samples,
        },
        "categorized_paths": categorized,
        "events_by_category": events_by_category,
        "banks": banks_info,
    }


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print("[1/2] Extracting Localization String Tables from UnityFS Addressables bundles...")
    loc_data = extract_localization()
    loc_out_path = OUTPUT_DIR / "localization.json"
    loc_out_path.write_text(json.dumps(loc_data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(
        f"  -> Saved {loc_out_path} ({loc_data['metadata']['total_tables']} tables, "
        f"{loc_data['metadata']['total_shared_keys']} keys, "
        f"{len(loc_data['metadata']['locales'])} locales)"
    )

    print("[2/2] Extracting FMOD Studio String Tables & FSB5 Sound Banks...")
    audio_data = extract_fmod_audio()
    audio_out_path = OUTPUT_DIR / "audio_events.json"
    audio_out_path.write_text(
        json.dumps(audio_data, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(
        f"  -> Saved {audio_out_path} ({audio_data['metadata']['total_events']} events, "
        f"{audio_data['metadata']['total_fsb5_audio_samples']} FSB5 audio samples)"
    )


if __name__ == "__main__":
    main()

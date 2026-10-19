#!/usr/bin/env python3
"""
Agent 6: Unity 6 (6000.0.64f1) SerializedFile v22 Texture2D & Sprite Extractor
Extracts all Sprite (ClassID 213) and key Texture2D (ClassID 28) assets from
Guildrun_Data (resources.assets, sharedassets0..21.assets + .resS files) into
browser-ready PNGs under public/assets/sprites/ and writes re_data/sprites_manifest.json.
"""

import json
import os
import re
import struct
import time
from collections import Counter, defaultdict
from PIL import Image

DATA_DIR = r"C:\Program Files (x86)\Steam\steamapps\common\Guildrun Demo\Guildrun_Data"
OUT_SPRITES_DIR = r"c:\Users\Aceliweth\Downloads\rea\guildrun-web\public\assets\sprites"
MANIFEST_PATH = r"c:\Users\Aceliweth\Downloads\rea\guildrun-web\re_data\sprites_manifest.json"

ASSETS_FILES = (
    ["resources.assets", "globalgamemanagers.assets"]
    + [f"sharedassets{i}.assets" for i in range(22)]
)

TEXTURE_FORMAT_NAMES = {
    1: "Alpha8",
    3: "RGB24",
    4: "RGBA32",
    5: "ARGB32",
    10: "DXT1/BC1",
    12: "DXT5/BC3",
    14: "BGRA32",
    25: "BC7",
    28: "DXT1Crunched",
    29: "DXT5Crunched",
}


def sanitize_filename(name: str) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name.strip())
    cleaned = re.sub(r"\s+", "_", cleaned)
    return cleaned or "unnamed"


def categorize_sprite(sprite_name: str, tex_name: str) -> str:
    n = sprite_name
    nl = n.lower()
    tl = tex_name.lower()

    if (
        any(
            k in nl
            for k in [
                "_portrait_",
                "square_portrait_",
                "halfbodyportrait_",
                "fullbody_",
                "_framebreak_",
                "_cropped_",
                "_round",
            ]
        )
        and nl != "enemy_round"
    ):
        return "portraits"
    if "enemy" in nl or "boss" in nl or nl in ["actboss"]:
        return "enemies"
    if (
        "activeability" in nl
        or "passiveability" in nl
        or "passive-" in nl
        or "ability" in tl
    ):
        return "skills"
    if nl.startswith("item_") or tl == "items" or nl.endswith(" item") or nl.endswith(" items"):
        return "items"
    if nl.startswith("relic_") or tl in ["relics", "relics-01"] or nl == "relic":
        return "relics"
    if tl in ["statsiconatlas", "iconatlas_tmp"] or any(
        k in nl
        for k in [
            "damageamp",
            "omnivamp",
            "gainstats_",
            "gainstat_",
            "everysecond_",
            "positioning_",
            "survive_",
            "stall_",
            "rush_",
            "cast_",
            "hit_",
            "attack_",
            "burn_",
            "frost_",
            "magic_",
            "poison_",
            "crit_",
            "defense_",
            "mana_",
            "shield_",
            "hp_shield",
            "hp_damageamp",
            "statuseffecticon_",
            "healthbar_statusicon_",
            "manaicon_",
            "healthicon_",
            "critdamageicon_",
        ]
    ):
        return "traits_stats"
    if tl == "chunkelements" or any(
        k in nl
        for k in [
            "eventimage_",
            "campfire",
            "fightroom",
            "fightevent",
            "cyclone",
            "mining",
            "chunkmap",
            "event",
        ]
    ):
        return "map_events"
    if "comic" in nl or "comic" in tl:
        return "comics"
    if any(
        k in nl
        for k in [
            "ruinsforest",
            "bluecavern",
            "purplecave",
            "reddesert",
            "environmenttest",
            "background",
            "keyart",
        ]
    ):
        return "backgrounds"
    return "ui"


def parse_serialized_file_v22(filepath: str):
    """Parse Unity SerializedFile v22 header, types, objects, and externals."""
    fname = os.path.basename(filepath)
    textures = {}
    sprites = []
    externals = []

    with open(filepath, "rb") as f:
        header = f.read(48)
        if len(header) < 48:
            return textures, sprites, externals
        _, _, version, _, endian = struct.unpack(">IIIIB3x", header[:20])
        if version < 22:
            return textures, sprites, externals
        meta_size, file_size, data_offset, _ = struct.unpack(">Iqqq", header[20:48])
        meta = f.read(meta_size)

        pos = meta.index(b"\x00", 0) + 1
        platform, enable_tt, type_count = struct.unpack_from("<iBi", meta, pos)
        pos += 9
        types = []
        for _ in range(type_count):
            class_id, is_stripped, script_idx = struct.unpack_from("<iBh", meta, pos)
            pos += 7 + (16 if class_id == 114 else 0) + 16
            types.append(class_id)

        (obj_count,) = struct.unpack_from("<i", meta, pos)
        pos += 4
        objs = []
        for _ in range(obj_count):
            if pos % 4 != 0:
                pos += 4 - (pos % 4)
            path_id, offset, size, type_id = struct.unpack_from("<qQII", meta, pos)
            pos += 24
            objs.append((path_id, offset, size, types[type_id]))

        (script_count,) = struct.unpack_from("<i", meta, pos)
        pos += 4
        for _ in range(script_count):
            pos += 4
            if pos % 4 != 0:
                pos += 4 - (pos % 4)
            pos += 8

        (ext_count,) = struct.unpack_from("<i", meta, pos)
        pos += 4
        for _ in range(ext_count):
            end_s = meta.index(b"\x00", pos)
            pos = end_s + 1 + 16 + 4
            end_p = meta.index(b"\x00", pos)
            ext_path = meta[pos:end_p].decode("utf-8", errors="replace")
            externals.append(os.path.basename(ext_path))
            pos = end_p + 1

        for path_id, offset, size, cid in objs:
            if cid == 28:  # Texture2D
                f.seek(data_offset + offset)
                raw = f.read(size)
                (nlen,) = struct.unpack_from("<I", raw, 0)
                name = raw[4 : 4 + nlen].decode("utf-8", errors="replace")
                p = 4 + nlen
                if p % 4 != 0:
                    p += 4 - (p % 4)
                (
                    forced_fmt,
                    width,
                    height,
                    complete_sz,
                    mips_stripped,
                    tex_fmt,
                    mip_cnt,
                ) = struct.unpack_from("<iiiiiii", raw, p)
                p += 32  # 7 ints + 4 bools
                (grp_len,) = struct.unpack_from("<I", raw, p)
                p += 4 + grp_len
                if p % 4 != 0:
                    p += 4 - (p % 4)
                p += 48  # streamingMipmaps .. colorSpace
                (blob_len,) = struct.unpack_from("<I", raw, p)
                p += 4 + blob_len
                if p % 4 != 0:
                    p += 4 - (p % 4)
                (img_len,) = struct.unpack_from("<I", raw, p)
                inline_bytes = raw[p + 4 : p + 4 + img_len] if img_len > 0 else b""
                p += 4 + img_len
                if p % 4 != 0:
                    p += 4 - (p % 4)
                s_off, s_sz, s_plen = struct.unpack_from("<QII", raw, p)
                s_path = raw[p + 16 : p + 16 + s_plen].decode("utf-8", errors="replace")

                textures[(fname, path_id)] = {
                    "fname": fname,
                    "path_id": path_id,
                    "name": name,
                    "w": width,
                    "h": height,
                    "fmt": tex_fmt,
                    "mip": mip_cnt,
                    "complete_sz": complete_sz,
                    "inline_bytes": inline_bytes,
                    "s_off": s_off,
                    "s_sz": s_sz,
                    "s_path": os.path.basename(s_path) if s_path else "",
                }

            elif cid == 213:  # Sprite
                f.seek(data_offset + offset)
                raw = f.read(size)
                (nlen,) = struct.unpack_from("<I", raw, 0)
                name = raw[4 : 4 + nlen].decode("utf-8", errors="replace")
                p = 4 + nlen
                if p % 4 != 0:
                    p += 4 - (p % 4)
                rx, ry, rw, rh = struct.unpack_from("<ffff", raw, p)
                px, py = struct.unpack_from("<ff", raw, p + 44)
                p += 84
                (ntags,) = struct.unpack_from("<I", raw, p)
                p += 4
                for _ in range(ntags):
                    (slen,) = struct.unpack_from("<I", raw, p)
                    p += 4 + slen
                    if p % 4 != 0:
                        p += 4 - (p % 4)
                atlas_fid, atlas_pid = struct.unpack_from("<iq", raw, p)
                p += 12
                tex_fid, tex_pid, atex_fid, atex_pid = struct.unpack_from("<iqiq", raw, p)
                t_file = fname if tex_fid == 0 else externals[tex_fid - 1]
                sprites.append(
                    {
                        "fname": fname,
                        "path_id": path_id,
                        "name": name,
                        "rect": (rx, ry, rw, rh),
                        "pivot": (px, py),
                        "tex_key": (t_file, tex_pid),
                    }
                )

    return textures, sprites, externals


def decode_texture2d(tex: dict, ress_handles: dict):
    """Decode a Unity Texture2D object into a top-left-origin RGBA/RGB PIL Image."""
    w, h, fmt = tex["w"], tex["h"], tex["fmt"]
    if w <= 0 or h <= 0:
        return None

    # Calculate top-level mip0 byte size
    if fmt == 1:  # Alpha8
        mip0_size = w * h
    elif fmt == 3:  # RGB24
        mip0_size = w * h * 3
    elif fmt in (4, 5, 14):  # RGBA32, ARGB32, BGRA32
        mip0_size = w * h * 4
    elif fmt == 10:  # DXT1 / BC1 (8 bytes per 4x4 block)
        bw = (w + 3) // 4
        bh = (h + 3) // 4
        mip0_size = bw * bh * 8
    elif fmt in (12, 25):  # DXT5 / BC3 or BC7 (16 bytes per 4x4 block)
        bw = (w + 3) // 4
        bh = (h + 3) // 4
        mip0_size = bw * bh * 16
    else:
        return None

    if tex["inline_bytes"]:
        bdata = tex["inline_bytes"][:mip0_size]
    elif tex["s_path"] and tex["s_sz"] > 0:
        ress_path = os.path.join(DATA_DIR, tex["s_path"])
        if ress_path not in ress_handles:
            if not os.path.exists(ress_path):
                return None
            ress_handles[ress_path] = open(ress_path, "rb")
        rf = ress_handles[ress_path]
        rf.seek(tex["s_off"])
        bdata = rf.read(min(mip0_size, tex["s_sz"]))
    else:
        return None

    if len(bdata) < mip0_size:
        return None

    if fmt == 1:  # Alpha8
        img = Image.frombytes("L", (w, h), bdata)
    elif fmt == 3:  # RGB24
        img = Image.frombytes("RGB", (w, h), bdata)
    elif fmt == 4:  # RGBA32
        img = Image.frombytes("RGBA", (w, h), bdata)
    elif fmt == 5:  # ARGB32
        img = Image.frombytes("RGBA", (w, h), bdata, "raw", "ARGB")
    elif fmt == 14:  # BGRA32
        img = Image.frombytes("RGBA", (w, h), bdata, "raw", "BGRA")
    elif fmt in (10, 12, 25):
        bcn_mode = {10: 1, 12: 3, 25: 7}[fmt]
        pad_w = ((w + 3) // 4) * 4
        pad_h = ((h + 3) // 4) * 4
        img = Image.frombytes("RGBA", (pad_w, pad_h), bdata, "bcn", (bcn_mode,))
        if pad_w != w or pad_h != h:
            img = img.crop((0, 0, w, h))
    else:
        return None

    # Unity texture origin is bottom-left; flip vertically to standard top-left origin
    return img.transpose(Image.Transpose.FLIP_TOP_BOTTOM)


def resize_for_browser(img: Image.Image, category: str, sprite_name: str) -> Image.Image:
    """Ensure browser-ready dimensions while keeping icons crisp at native size."""
    w, h = img.size
    if category in ("items", "relics", "skills", "traits_stats", "enemies"):
        max_dim = 512
    elif category == "portraits":
        # Keep _round and Square_Portrait at native resolution (<=512), cap huge 2048px portraits at 512px
        max_dim = 512
    elif category == "backgrounds":
        max_dim = 1024
    else:
        max_dim = 512

    if max(w, h) > max_dim:
        scale = max_dim / float(max(w, h))
        new_w = max(1, int(round(w * scale)))
        new_h = max(1, int(round(h * scale)))
        return img.resize((new_w, new_h), Image.Resampling.BILINEAR)
    return img


def main():
    t0 = time.time()
    os.makedirs(OUT_SPRITES_DIR, exist_ok=True)
    os.makedirs(os.path.dirname(MANIFEST_PATH), exist_ok=True)

    all_textures = {}
    all_sprites = []

    print("[1/4] Parsing SerializedFile v22 assets...")
    for fname in ASSETS_FILES:
        fpath = os.path.join(DATA_DIR, fname)
        if not os.path.exists(fpath):
            continue
        textures, sprites, _ = parse_serialized_file_v22(fpath)
        all_textures.update(textures)
        all_sprites.extend(sprites)
        if textures or sprites:
            print(f"  {fname:26s}: {len(textures):4d} Texture2D, {len(sprites):4d} Sprite")

    fmt_counts = Counter(
        TEXTURE_FORMAT_NAMES.get(t["fmt"], f"Unknown({t['fmt']})")
        for t in all_textures.values()
    )
    print(f"Total parsed: {len(all_textures)} Texture2D, {len(all_sprites)} Sprite")
    print(f"Texture formats: {dict(fmt_counts)}")

    # Group sprites by texture key so each Texture2D / SpriteAtlas is decoded only once
    sprites_by_tex = defaultdict(list)
    for s in all_sprites:
        sprites_by_tex[s["tex_key"]].append(s)

    # Sort texture keys by .resS file and stream offset for sequential disk I/O
    sorted_tex_keys = sorted(
        sprites_by_tex.keys(),
        key=lambda k: (
            all_textures[k]["s_path"] if k in all_textures else "",
            all_textures[k]["s_off"] if k in all_textures else 0,
        ),
    )

    ress_handles = {}
    manifest_by_name = {}
    manifest_by_path_id = {}
    manifest_by_category = defaultdict(dict)
    manifest_sprites = []
    category_counts = Counter()
    used_rel_paths = set()

    decoded_tex_count = 0
    skipped_tex_count = 0
    extracted_sprite_count = 0

    print("[2/4] Decoding textures and cropping sprites...")
    for idx, tkey in enumerate(sorted_tex_keys):
        tex = all_textures.get(tkey)
        if not tex:
            skipped_tex_count += 1
            continue

        img = decode_texture2d(tex, ress_handles)
        if img is None:
            skipped_tex_count += 1
            continue

        decoded_tex_count += 1
        tw, th = img.size
        s_list = sprites_by_tex[tkey]

        for s in s_list:
            sname = s["name"]
            cat = categorize_sprite(sname, tex["name"])
            rx, ry, rw, rh = s["rect"]

            # Convert Unity bottom-left rect to top-left PIL crop box
            x0 = max(0, int(round(rx)))
            y0 = max(0, int(round(th - (ry + rh))))
            x1 = min(tw, int(round(rx + rw)))
            y1 = min(th, int(round(th - ry)))

            if x1 <= x0 or y1 <= y0:
                crop_img = img
            elif x0 == 0 and y0 == 0 and x1 == tw and y1 == th:
                crop_img = img
            else:
                crop_img = img.crop((x0, y0, x1, y1))

            out_img = resize_for_browser(crop_img, cat, sname)
            safe_name = sanitize_filename(sname)
            cat_dir = os.path.join(OUT_SPRITES_DIR, cat)
            os.makedirs(cat_dir, exist_ok=True)

            rel_key = f"{cat}/{safe_name}.png"
            if rel_key in used_rel_paths:
                rel_key = f"{cat}/{safe_name}_{s['path_id']}.png"
            used_rel_paths.add(rel_key)

            out_path = os.path.join(OUT_SPRITES_DIR, *rel_key.split("/"))
            out_img.save(out_path, format="PNG", compress_level=1)

            url = f"/assets/sprites/{rel_key}"
            if sname not in manifest_by_name:
                manifest_by_name[sname] = url
            manifest_by_path_id[f"{s['fname']}:{s['path_id']}"] = url
            manifest_by_path_id[str(s["path_id"])] = url
            if sname not in manifest_by_category[cat]:
                manifest_by_category[cat][sname] = url
            else:
                manifest_by_category[cat][f"{sname}_{s['path_id']}"] = url

            category_counts[cat] += 1
            extracted_sprite_count += 1
            manifest_sprites.append(
                {
                    "name": sname,
                    "path_id": s["path_id"],
                    "assets_file": s["fname"],
                    "category": cat,
                    "url": url,
                    "width": out_img.width,
                    "height": out_img.height,
                    "orig_rect": [round(rx, 2), round(ry, 2), round(rw, 2), round(rh, 2)],
                    "pivot": [round(s["pivot"][0], 4), round(s["pivot"][1], 4)],
                    "texture_name": tex["name"],
                    "texture_path_id": tex["path_id"],
                    "texture_assets_file": tex["fname"],
                    "texture_format": TEXTURE_FORMAT_NAMES.get(tex["fmt"], str(tex["fmt"])),
                }
            )

        if (idx + 1) % 100 == 0 or (idx + 1) == len(sorted_tex_keys):
            print(
                f"  Processed {idx + 1}/{len(sorted_tex_keys)} sprite textures "
                f"({extracted_sprite_count} sprites saved, {time.time() - t0:.1f}s)"
            )

    # [3/4] Also extract key standalone Texture2Ds not referenced by any Sprite
    standalone_targets = {
        "GateIcon": "map_events",
        "Burn_b": "traits_stats",
        "AttackSpeed_b": "traits_stats",
        "UpArrow": "ui",
        "Arrow_L": "ui",
        "Cursor_mac": "ui",
        "EmojiOne": "ui",
        "info": "ui",
        "question": "ui",
        "home": "ui",
        "user": "ui",
    }
    standalone_extracted = 0
    print("[3/4] Extracting key standalone Texture2Ds...")
    for tkey, tex in all_textures.items():
        if tkey in sprites_by_tex:
            continue
        tname = tex["name"]
        if tname in standalone_targets:
            img = decode_texture2d(tex, ress_handles)
            if img is None:
                continue
            cat = standalone_targets[tname]
            out_img = resize_for_browser(img, cat, tname)
            safe_name = sanitize_filename(tname)
            cat_dir = os.path.join(OUT_SPRITES_DIR, cat)
            os.makedirs(cat_dir, exist_ok=True)
            rel_key = f"{cat}/{safe_name}.png"
            if rel_key in used_rel_paths:
                rel_key = f"{cat}/{safe_name}_{tex['path_id']}.png"
            used_rel_paths.add(rel_key)
            out_path = os.path.join(OUT_SPRITES_DIR, *rel_key.split("/"))
            out_img.save(out_path, format="PNG", compress_level=1)
            url = f"/assets/sprites/{rel_key}"
            if tname not in manifest_by_name:
                manifest_by_name[tname] = url
            manifest_by_path_id[f"{tex['fname']}:{tex['path_id']}"] = url
            manifest_by_path_id[str(tex["path_id"])] = url
            manifest_by_category[cat][tname] = url
            category_counts[cat] += 1
            standalone_extracted += 1

    for rf in ress_handles.values():
        rf.close()

    # [4/4] Write manifest JSON
    print("[4/4] Writing manifest JSON...")
    manifest = {
        "summary": {
            "unity_version": "6000.0.64f1",
            "serialized_file_version": 22,
            "total_textures_parsed": len(all_textures),
            "total_sprites_parsed": len(all_sprites),
            "sprite_textures_decoded": decoded_tex_count,
            "sprite_textures_skipped_crunched": skipped_tex_count,
            "sprites_extracted": extracted_sprite_count,
            "standalone_textures_extracted": standalone_extracted,
            "total_pngs_written": extracted_sprite_count + standalone_extracted,
            "texture_format_counts": dict(fmt_counts),
            "category_counts": dict(category_counts),
        },
        "by_name": manifest_by_name,
        "by_path_id": manifest_by_path_id,
        "by_category": dict(manifest_by_category),
        "sprites": manifest_sprites,
    }

    with open(MANIFEST_PATH, "w", encoding="utf-8") as mf:
        json.dump(manifest, mf, indent=2)

    elapsed = time.time() - t0
    print(
        f"Done in {elapsed:.1f}s! Extracted {extracted_sprite_count} sprites + "
        f"{standalone_extracted} standalone textures ({extracted_sprite_count + standalone_extracted} PNGs)."
    )
    print("Category breakdown:", dict(category_counts))


if __name__ == "__main__":
    main()

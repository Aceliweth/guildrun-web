#!/usr/bin/env python3
"""
agent_audio_convert.py — Guildrun FMOD .bank (FSB5 Vorbis) -> browser .ogg converter.

Route:
  1. vgmstream-cli decodes every FSB5 subsong in each FMOD .bank (FSB5 "custom Vorbis":
     raw packets + setup header referenced by CRC32 — vgmstream ships the setup-header
     codebook table and rebuilds the stream) to 16-bit WAV.
  2. ffmpeg (libvorbis) re-encodes WAV -> Ogg Vorbis.
  3. A manifest (public/assets/audio/manifest.json) maps logical names
     (music.menu, ui.click, sfx.hit, hero.<id>.attack, vo.<id>.death, ...) to files.

vgmstream-cli is looked up on PATH, then in %LOCALAPPDATA%/guildrun_tools/vgmstream,
and otherwise downloaded from the official GitHub release (win64 zip).

Usage:  python scripts/agent_audio_convert.py [--banks DIR] [--jobs N] [--force]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]           # guildrun-web
OUT = ROOT / "public" / "assets" / "audio"
DEFAULT_BANKS = Path(r"C:\Program Files (x86)\Steam\steamapps\common\Guildrun Demo\Guildrun_Data\StreamingAssets")
VGM_URL = "https://github.com/vgmstream/vgmstream/releases/latest/download/vgmstream-win64.zip"
VGM_CACHE = Path(os.environ.get("LOCALAPPDATA", tempfile.gettempdir())) / "guildrun_tools" / "vgmstream"

# bank -> (output subdir, vorbis quality)
BANKS = {
    "MUSIC.bank": ("music", 4),
    "SFX.bank": ("sfx", 3),
    "VO.bank": ("vo", 3),
    "MASTER.bank": ("vo", 3),   # MASTER embeds Dragomir's VO lines
}

# Internal sample-name prefixes -> game hero/enemy ids (folder names of FMOD events)
ALIASES = {
    "rowan": "rook", "zuri": "selkhera", "pollen": "floeria", "rip": "cenk", "nyx": "nyxa",
    "dragonice": "frostdragon", "dragonfire": "firedragon", "dragonpoison": "poisondragon",
    "musharcher": "mushroomarcher", "mushmage": "mushroomfiremage",
    "seraphim": "seraphael",
    "grace": "josephina",   # display name "Grace"; FMOD event josephina_OP_atStart <-> grace_op_atstart
    "zaya": "javryn",       # APPROX: only hero folder without VO; "Zaya" not in localization
}


# --------------------------------------------------------------------------- tools
def find_vgmstream() -> Path:
    exe = shutil.which("vgmstream-cli")
    if exe:
        return Path(exe)
    cached = VGM_CACHE / "vgmstream-cli.exe"
    if cached.exists():
        return cached
    print(f"[audio] downloading vgmstream -> {VGM_CACHE}")
    VGM_CACHE.mkdir(parents=True, exist_ok=True)
    zpath = VGM_CACHE.parent / "vgmstream-win64.zip"
    urllib.request.urlretrieve(VGM_URL, zpath)
    with zipfile.ZipFile(zpath) as z:
        z.extractall(VGM_CACHE)
    zpath.unlink(missing_ok=True)
    if not cached.exists():
        sys.exit("vgmstream-cli.exe not found after download")
    return cached


def find_ffmpeg() -> str:
    exe = shutil.which("ffmpeg")
    if not exe:
        sys.exit("ffmpeg not found on PATH (winget install Gyan.FFmpeg)")
    return exe


def slug(name: str) -> str:
    s = re.sub(r"[^A-Za-z0-9_\-]+", "_", name.strip()).strip("_")
    return s.lower() or "unnamed"


# --------------------------------------------------------------------------- convert
def decode_bank(vgm: Path, bank: Path, tmp: Path) -> list[tuple[int, str, Path]]:
    """Decode all subsongs of a bank to WAV. Returns [(subsong, name, wav)]."""
    tmp.mkdir(parents=True, exist_ok=True)
    # ?s = subsong index, ?n = stream name;  -i = ignore loop points (no double play)
    pattern = str(tmp / "?s@@?n.wav")
    subprocess.run([str(vgm), "-i", "-S", "0", "-o", pattern, str(bank)],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    out = []
    for wav in tmp.glob("*.wav"):
        idx, _, name = wav.stem.partition("@@")
        try:
            out.append((int(idx), name, wav))
        except ValueError:
            pass
    return sorted(out)


def encode(ffmpeg: str, wav: Path, ogg: Path, q: int) -> int:
    ogg.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", str(wav),
                    "-c:a", "libvorbis", "-q:a", str(q), str(ogg)], check=True)
    return ogg.stat().st_size


# --------------------------------------------------------------------------- manifest
def build_logical(files: dict[str, dict]) -> dict[str, list[str]]:
    """files: key 'sub/slug' -> info. Returns logical name -> [relative paths]."""
    by_slug: dict[str, str] = {}
    for key, info in files.items():
        by_slug.setdefault(key.split("/", 1)[1], info["file"])

    def pick(*slugs: str) -> list[str]:
        return [by_slug[s] for s in slugs if s in by_slug]

    def match(rx: str, sub: str | None = None) -> list[str]:
        r = re.compile(rx)
        return sorted(info["file"] for key, info in files.items()
                      if r.search(key.split("/", 1)[1]) and (sub is None or key.startswith(sub + "/")))

    L: dict[str, list[str]] = {
        # music
        "music.menu": pick("mus_mainmenu_86bpm_premaster"),
        "music.combat": pick("mus_forest_comb_80bpm"),
        "music.calm": pick("mus_forest_calm_80bpm"),
        "music.boss": pick("260608_forest_rift_boss"),
        "music.boss_pre": pick("mus_forest_boss_pre_165bpm"),
        "music.shop": pick("mus_auction_house_80bpm"),
        "music.win": pick("mus_forest_finalboss_win_165bpm"),
        "music.lose": pick("mus_forest_finalboss_lose_165bpm"),
        "music.sting.howl": pick("mus_forest_comb_sting_howl01_80bpm"),
        "music.sting.fill": pick("mus_forest_comb_sting_fill01_80bpm"),
        "music.sting.woosh": pick("mus_forest_comb_sting_woosh01_80bpm"),
        # ambience
        "amb.menu": pick("amb_main_menu_loop"),
        "amb.forest": match(r"^amb_biom1_forest_loop\d$"),
        "amb.portal": pick("amb_portal"),
        # ui
        "ui.click": pick("ui_ingamebutton_click"),
        "ui.menu_click": pick("ui_main_menu_click"),
        "ui.hover": pick("ui_main_menu_hover"),
        "ui.start": pick("ui_main_menu_startgame_click"),
        "ui.submenu_open": pick("ui_main_menu_submenu_open"),
        "ui.submenu_close": pick("ui_main_menu_submenu_clickclose"),
        "ui.reroll": pick("ui_shop_reroll_click"),
        "ui.equip": pick("ui_bf_item_equip"),
        "ui.unequip": pick("ui_bf_item_unequip"),
        "ui.buy": pick("ui_shop_item_click"),
        "ui.buy_relic": pick("ui_shop_relic_click"),
        "ui.sell": pick("ui_shop_sell_drop"),
        "ui.freeze": pick("ui_shop_freeze_click"),
        "ui.unfreeze": pick("ui_shop_unfreeze_click"),
        "ui.duplicate": pick("ui_shop_duplicatehero_appear"),
        "ui.fight": pick("ui_ingame_button_fight"),
        "ui.hero_pick": pick("ui_hero_move_onclick"),
        "ui.hero_drop": pick("ui_hero_move_offclick"),
        "ui.hero_select": pick("ui_hero_selection_click"),
        "ui.rankup": pick("ui_hero_selectionrankup_click"),
        "ui.rankup_menu": pick("ui_hero_rankupmenu_click"),
        "ui.shards_click": pick("ui_shardsmenu_button_click"),
        "ui.shards_hover": pick("ui_shardsmenu_button_hover"),
        "ui.shard_select": pick("ui_shards_selection_click"),
        # comics
        "comic.01": pick("260713_comic_01_intro"),
        "comic.02": pick("260713_comic_02_guild"),
        "comic.03": pick("260713_comic_03_death_loop"),
        # generic combat
        "sfx.hit": match(r"^(comb_)?(gustav|irini|ratna|sal|josephina)_attack_hit_\d+$", "sfx"),
        "sfx.attack": match(r"^(comb_)?(gustav|kai|logan|cenk|skorn|dragomir)_attack_cast_\d+$", "sfx"),
        "sfx.ranged": match(r"^(comb_)?(fiona|musharcher)_attack_cast_\d+$", "sfx"),
        "sfx.cast": pick("comb_fiona_act_skill_01", "irini_skill_cast_01", "reyna_skill_cast_01",
                         "comb_ayaka_act_skill_cast_01"),
        "sfx.death": match(r"^dragon_roar_\d+$"),
        "sfx.boss_roar": match(r"^demonboss_attack_vo_\d+$"),
    }

    # Per-hero/enemy SFX (attack/hit/skill) from SFX.bank + VO.bank attack samples.
    rx = re.compile(r"^(?:comb_)?([a-z]+?)_(attack_cast|attack_hit|act_skill\d?(?:_cast)?|skill\d?_cast|skill_cast|skill_hit|skill)(?:_layer)?(?:_\d+)?$")
    kinds = {"attack_cast": "attack", "attack_hit": "hit", "skill_hit": "skill_hit"}
    for key, info in files.items():
        sub, s = key.split("/", 1)
        m = rx.match(s)
        if not m:
            continue
        who = ALIASES.get(m.group(1), m.group(1))
        kind = kinds.get(m.group(2), "skill")
        L.setdefault(f"hero.{who}.{kind}", []).append(info["file"])
    for key, info in files.items():   # Dragomir AA grunts
        s = key.split("/", 1)[1]
        if re.match(r"^dragomir_aa_\d+$", s):
            L.setdefault("vo.dragomir.attack", []).append(info["file"])

    # VO lines: <HERO>_<CODE>...   OP=on purchase/start, OD=on death, OR=rank-up, AA=attack grunt,
    # OSR=? (special), DISC=situational line.  Stored as vo.<hero>.<code>.
    vo_codes = {"op": "buy", "od": "death", "or": "rankup", "aa": "attack", "osr": "special", "disc": "line"}
    vrx = re.compile(r"^(?:rr_vo_)?([a-z]+)_(op|od|or|aa|osr|disc)(?=$|_|\d)")
    for key, info in files.items():
        sub, s = key.split("/", 1)
        if sub != "vo":
            continue
        m = vrx.match(s)
        if not m:
            continue
        who = ALIASES.get(m.group(1), m.group(1))
        L.setdefault(f"vo.{who}.{vo_codes[m.group(2)]}", []).append(info["file"])

    return {k: sorted(set(v)) for k, v in sorted(L.items()) if v}


# --------------------------------------------------------------------------- main
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--banks", type=Path, default=DEFAULT_BANKS)
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 4)
    ap.add_argument("--force", action="store_true", help="re-encode existing .ogg files")
    args = ap.parse_args()

    vgm, ffmpeg = find_vgmstream(), find_ffmpeg()
    OUT.mkdir(parents=True, exist_ok=True)
    files: dict[str, dict] = {}
    total = 0

    with tempfile.TemporaryDirectory(prefix="guildrun_audio_") as td:
        for bank_name, (sub, q) in BANKS.items():
            bank = args.banks / bank_name
            if not bank.exists():
                print(f"[audio] missing {bank}")
                continue
            print(f"[audio] decoding {bank_name} ...")
            decoded = decode_bank(vgm, bank, Path(td) / bank_name)
            jobs = []
            for idx, name, wav in decoded:
                s = slug(name)
                key = f"{sub}/{s}"
                if key in files:                       # name collision -> suffix
                    s = f"{s}_{slug(bank_name.split('.')[0])}{idx}"
                    key = f"{sub}/{s}"
                ogg = OUT / sub / f"{s}.ogg"
                files[key] = {"file": f"{sub}/{s}.ogg", "name": name, "bank": bank_name, "subsong": idx}
                jobs.append((wav, ogg))

            def work(j):
                wav, ogg = j
                if ogg.exists() and not args.force:
                    return ogg.stat().st_size
                return encode(ffmpeg, wav, ogg, q)

            with ThreadPoolExecutor(args.jobs) as ex:
                sizes = list(ex.map(work, jobs))
            total += sum(sizes)
            print(f"[audio]   {len(jobs)} samples, {sum(sizes)/1e6:.1f} MB")

    logical = build_logical(files)
    manifest = {
        "version": 1,
        "base": "/assets/audio/",
        "logical": logical,          # logical name -> [variant files]; pick one at random
        "files": {k: v for k, v in sorted(files.items())},
        "totalBytes": total,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    print(f"[audio] {len(files)} files, {total/1e6:.1f} MB, {len(logical)} logical names -> {OUT/'manifest.json'}")


if __name__ == "__main__":
    main()

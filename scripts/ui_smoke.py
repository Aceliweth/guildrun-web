#!/usr/bin/env python3
"""Smoke check for Guildrun Web UI files, ES module imports, and key assets."""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"

REQUIRED_FILES = [
    PUBLIC / "index.html",
    PUBLIC / "css" / "style.css",
    PUBLIC / "data" / "game_data.json",
    PUBLIC / "js" / "main.js",
    PUBLIC / "js" / "data.js",
    PUBLIC / "js" / "audio.js",
    PUBLIC / "js" / "ui" / "assets.js",
    PUBLIC / "js" / "ui" / "battle_renderer.js",
    PUBLIC / "js" / "ui" / "components.js",
    PUBLIC / "js" / "ui" / "dom.js",
    PUBLIC / "js" / "ui" / "hex.js",
    PUBLIC / "js" / "ui" / "richtext.js",
    PUBLIC / "js" / "ui" / "state.js",
    PUBLIC / "js" / "ui" / "tooltip.js",
    PUBLIC / "js" / "ui" / "screens_menu.js",
    PUBLIC / "js" / "ui" / "screens_board.js",
    PUBLIC / "js" / "ui" / "screens_battle.js",
    PUBLIC / "js" / "ui" / "screens_nodes.js",
    PUBLIC / "js" / "ui" / "screens_extra.js",
    ROOT / "serve.ps1",
    ROOT / "README.md",
]


def main() -> int:
    missing = [str(p.relative_to(ROOT)) for p in REQUIRED_FILES if not p.exists() or p.stat().st_size == 0]
    if missing:
        print(f"[FAIL] Missing or empty files: {missing}")
        return 1

    # Verify game_data.json structure
    data = json.loads((PUBLIC / "data" / "game_data.json").read_text(encoding="utf-8"))
    for key in ("heroes", "items", "relics", "stages", "events", "classes", "guilds", "loc"):
        assert key in data and len(data[key]) > 0, f"Missing/empty key in game_data.json: {key}"

    # Verify static relative imports in public/js/data.js, public/js/main.js, and public/js/ui/*.js
    js_files = [PUBLIC / "js" / "main.js", PUBLIC / "js" / "data.js"] + list((PUBLIC / "js" / "ui").glob("*.js"))
    import_re = re.compile(r"""from\s+['"](\.[^'"]+)['"]""")
    for jf in js_files:
        src = jf.read_text(encoding="utf-8")
        for m in import_re.finditer(src):
            rel = m.group(1)
            target = (jf.parent / rel).resolve()
            if not target.exists():
                print(f"[FAIL] Broken relative import in {jf.relative_to(ROOT)} -> {rel}")
                return 1

    print(f"[OK] UI smoke check passed ({len(REQUIRED_FILES)} files verified, {len(js_files)} UI JS modules checked).")
    return 0


if __name__ == "__main__":
    sys.exit(main())

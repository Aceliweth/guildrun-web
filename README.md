# Guildrun Web — Personal Local Browser Port

A standalone, zero-dependency ES-module browser port of **Guildrun Demo** (`0.5.13`), powered by reverse-engineered balancing data, IL2CPP metadata/decompilation, extracted 2D sprites, and decoded FMOD audio banks.

## Quick Start

From `guildrun-web/`:

```powershell
./serve.ps1
```

Or directly with Python:

```bash
python -m http.server 8080 -d public
```

Then open **http://localhost:8080/** in your browser.

---

## Architecture & Modules

- **`public/data/game_data.json`**: Compiled game database (`2.15 MB`) containing 25 Heroes, 75 Specializations, 50 Active Abilities, 88 Passive Abilities, 163 Items, 406 Relics, 105 Rank Modifiers, 643 Enemies, 248 Stages, 93 Narrative Events, 13 Crossroads, and 3,372 localized strings (FR/EN).
- **`public/js/data.js`**: Data loader (`loadGameData`) and localization helper (`t(key, vars)`, `txt()`, FR/EN reactive switching).
- **`public/js/sim/`**: Deterministic lockstep combat simulation (`createBattle`, 31.25 Hz / `dt = 0.032s` tick loop) with hex movement, targeting, abilities, projectiles, shields, statuses, and item/relic triggers.
- **`public/js/run/`**: Full run state machine (`createRun`) covering `InitialSelection → Intro → Placement → Resolution → Result → Shop / SuperShop → Crossroads → Event / Campfire → Outro / Complete`, economy, Shard Stabilizer (Emergency Rewind), hero rank-up merging, and `localStorage` persistence.
- **`public/js/ui/`**:
  - `assets.js`, `hex.js`, `richtext.js`, `dom.js`, `state.js`, `tooltip.js`, `components.js`: Shared UI toolkit, Unity rich-text parser, hover tooltips, drag-and-drop system, and pointy-top odd-r hex math.
  - `battle_renderer.js`: 60 FPS HTML5 Canvas 2D battle renderer with parallax stage layers, unit tokens, HP/Shield/Mana bars, status icons, projectile trails, and floating combat text.
  - `screens_menu.js`: Main Menu, interactive layered Intro/Signup/Defeat Comic viewer, and Settings modal (FR/EN + Master/Music/SFX volume sliders).
  - `screens_board.js`: Initial Breaker draft, Stage Intro preview, 7×8 Hex Placement Board with drag-and-drop deployment, Bench, Inventory, Class Synergies panel, Hero Inspector, and Rank-Up / Specialization modal.
  - `screens_battle.js`: Battle Playback screen with live DPS/Damage meter & `1×`/`2×`/`4×`/Pause/Skip controls, Post-Battle Result screen with MVP accolades, and End-of-Run Summary screen.
  - `screens_nodes.js`: Shop & SuperShop (with Freeze, Reroll, Team Size upgrade, Merge indicators, and Drop-to-Sell), Crossroads path selector, Narrative Events with artwork & choices, and Campfire screen.
  - `screens_extra.js`: Full Compendium / Codex browser (Heroes, Lore, Ranks C–S, Specializations, Items, Relics, Classes, Guilds, Enemies) and Sandbox Battle Builder.
- **`public/js/audio.js`**: WebAudio / HTMLAudio sound engine backed by `public/assets/audio/manifest.json` (610 Ogg Vorbis tracks across Music, SFX, and VO).

## Verification Commands

```bash
node public/js/sim/test_sim.mjs
node public/js/run/test_run.mjs
python scripts/ui_smoke.py
```

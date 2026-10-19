# Guildrun Web — Build Contract (shared by all build agents)

Local-only personal port. Static site served from `guildrun-web/public` (`python -m http.server 8080 -d public`).
Plain ES modules, no bundler, no npm dependency at runtime.

## SOURCE-OF-TRUTH RULES (critical)
1. Numbers come from `re_data/balancing_data.json` (raw serialized Unity values): `singletons`, `sheets`, `enrichedHeroes`,
   `difficultyModifiers`, `aoeEntries`. **Do NOT trust numeric values quoted in the `*_summary.md` / `*_spec.md` reports** —
   several were verified wrong (e.g. real PlayerSingleton = StartingShards 15, StartingAccumulatedShards 10,
   AccumulatedShardsPerFightWon 10; ShopSingleton = 3 heroes / 2 items / 1 relic, reroll 1 (+1); HeroesSingleton
   StartingMaxHeroesOnBoard 3, MaxHeroRank 4; StatusSingleton PoisonDamageInterval 2.0, etc.).
2. Enum values come from `re_data/il2cpp_ember_types.json` (e.g. TargetStatType: MaxHealth=1, MaxMana=2, MoveSpeed=3,
   Defense=4, BaseAttackDamage=5, Attack=6, Magic=7, BaseAttackSpeed=8, AttackSpeed=9, AttackRange=10, Crit=11,
   ManaRegen=12, OmniVamp=13, DamageAmp=14, HPPerSecond=15, BaseTrueDamage=16, BonusTrueDamage=17, StartingMana=18,
   FrostResistance=19, StunResistance=20).
3. `re_data/simulation_combat_spec.md` is **unverified** (it mentions Armor/MagicResist/Evasion which don't exist in
   TargetStatType). Where it conflicts with the enums/balancing data, the enums/data win. Use
   `re_data/simulation_decompiled.json` to check when possible. When something can't be confirmed, pick a sane
   approximation and mark it `// APPROX:` in code.
4. Text: `re_data/localization.json` (`en_fr` map, `keys`). UI language default `fr`, fallback `en`.
   Strip/convert Unity rich-text tags (`[text]<tag>`, `<b>` …) to simple HTML spans.

## Generated data file: `public/data/game_data.json` (owned by the DATA agent)
```jsonc
{
  "version": 1,
  "singletons": { "PlayerSingleton": {...}, "ShopSingleton": {...}, ... },   // copied raw
  "board": { "width": 7, "height": 8, "playerRows": [0,1,2,3] },           // verify from data/scenes; APPROX if not found
  "guilds":   { "<id>": { "id", "name", "tag", "icon" } },
  "classes":  { "<id>": { "id", "name", "tag", "description", "icon", "primaryStat", "secondaryStats": [] } },
  "heroes":   { "<id>": { "id", "name", "guildId", "classIds": [], "price", "gender",
                          "stats": { "MaxHealth","MaxMana","StartingMana","ManaRegen","MoveSpeed","Defense",
                                     "BaseAttackDamage","Attack","Magic","AttackRange","BaseAttackSpeed",
                                     "AttackSpeed","Crit","ManaLockTime" },
                          "attackType": "Melee|Ranged", "activeAbilityId", "passiveAbilityId",
                          "startWithActiveAbility", "specializationIds": [],
                          "portrait": "/assets/sprites/...", "portraitRound": "...", "fullBody": "..." } },
  "specializations": { "<id>": { "id", "heroId", "name", "description", "classId", "activeAbilityId", "passiveAbilityId" } },
  "activeAbilities":  { "<id>": { "id", "name", "description", "icon", "actions": [...raw], "effects": [...raw] } },
  "passiveAbilities": { "<id>": { "id", "name", "description", "icon", "effects": [...raw] } },
  "items":    { "<id>": { "id", "name", "description", "rarity", "icon", "price", "statMods": [{ "stat", "value", "percent" }], "effects": [...raw] } },
  "relics":   { "<id>": { "id", "name", "description", "rarity", "icon", "price", "effects": [...raw] } },
  "rankModifiers": { "<id>": { "id", "name", "description", "icon", "effects": [...raw] } },
  "enemies":  { "<id>": { "id", "name", "stats": {...same keys}, "attackType", "activeAbilityId", "passiveAbilityId", "scalingId", "icon" } },
  "enemyScaling": { "<id>": [...raw StatScaling] },
  "stages":   { "<id>": { "id", "act", "floor", "stageType", "fightMode", "width", "height", "environment",
                          "enemies": [{ "enemyId", "x", "y" }], "background": "/assets/sprites/backgrounds/..." } },
  "acts":     [ ...raw ActEntry / chunk structure... ],
  "events":   { "<id>": { "id", "name", "text", "image", "choices": [{ "text", "rewards": [...raw] }] } },
  "crossroads": { "<id>": {...} },
  "pools": { "heroPools": {...}, "itemPools": {...}, "relicPools": {...}, "eventPools": {...}, "rankModifierPools": {...} },
  "loc": { "<key>": { "fr": "...", "en": "..." } }   // only keys actually referenced + all UI.* keys
}
```
Effects are kept **raw** (polymorphic `[SerializeReference]` objects with `$type`/class names) — the SIM agent interprets them.

## JS module layout (each owned by exactly one agent)
- `public/js/data.js` (UI agent): `export async function loadGameData()` → returns parsed game_data.json; `t(key, vars)` localization helper.
- `public/js/sim/` (SIM agent): `export function createBattle({ data, heroes:[{heroId, rank, items:[itemId], x, y, specializationId, rankModifierIds}], enemies:[{enemyId, x, y, floor}], relics:[relicId], seed })`
  returns `battle` with `battle.tick()` (fixed dt 0.032 s), `battle.state` (`{ time, units:[{ uid, team:1|2, defId, x, y (float world hex coords), hp, maxHp, mana, maxMana, shield, statuses:{}, state, targetUid, facing }], projectiles:[], events:[] }`), `battle.isOver()`, `battle.result()` → `{ winner:'players'|'enemies'|'draw', survivors:[uid], stats }`.
  `battle.state.events` is a per-tick list of `{type:'damage'|'heal'|'cast'|'death'|'attack'|'status'|'shield', ...}` for the renderer (cleared each tick). Must run headless in Node (`node public/js/sim/test_sim.mjs`).
- `public/js/run/` (RUN agent): `export function createRun({ data, seed, difficulty })` → run state machine following
  BattleFlowState: InitialSelection → Intro → Placement → Resolution → Result → Shop → Crossroads → Outro → Complete;
  plus Campfire/Event nodes. Exposes pure methods (`getState()`, `chooseInitial(i)`, `buyHero(slot)`, `buyItem(slot)`,
  `buyRelic(slot)`, `reroll()`, `freeze(slot)`, `sellHero(uid)`, `equipItem(itemUid, heroUid)`, `placeHero(heroUid,x,y)`,
  `benchHero(heroUid)`, `startBattle()` → returns createBattle args, `finishBattle(result)`, `chooseCrossroads(i)`,
  `chooseEventOption(i)`, `campfireAction(...)`, `buyTeamSize()`, `rankUpChoice(i)`), save/load to localStorage.
  Must also run headless in Node (`node public/js/run/test_run.mjs`, simulating a full run with random choices using the SIM).
- `public/index.html`, `public/css/*.css`, `public/js/main.js`, `public/js/ui/*.js` (UI agent): screens (main menu,
  initial selection, map/crossroads, placement board with drag&drop on hex grid, battle Canvas 2D renderer using
  portraits/sprites, shop, event, campfire, result, end screen), tooltips, FR/EN toggle, speed x1/x2/x4.
- `public/js/audio.js` + `public/assets/audio/` (AUDIO agent): `export const audio = { init(), playMusic(name), playSfx(name), setVolume(v) }` — must no-op gracefully if files missing.

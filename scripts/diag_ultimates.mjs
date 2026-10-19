// Diagnose ultimates: every hero vs harmless high-HP training dummies for 30 s of sim time.
// Reports mana progress, casts, and what each cast actually produced (damage/heal/shield/status/teleport).
import fs from 'node:fs';
import { createBattle } from '../public/js/sim/index.js';

const data = JSON.parse(fs.readFileSync(new URL('../public/data/game_data.json', import.meta.url), 'utf-8'));
const base = data.enemies['104'] || Object.values(data.enemies)[0];
data.enemies['99999'] = {
  ...base, id: 99999, name: 'Dummy', activeAbilityId: null, passiveAbilityId: null,
  stats: { ...base.stats, MaxHealth: 200000, BaseAttackDamage: 0, Attack: 0, Magic: 0, Defense: 0, MaxMana: 0, StartingMana: 0, ManaRegen: 0, BaseAttackSpeed: 0.0001, AttackSpeed: -99, AttackRange: 0 },
};
const only = process.argv[2];
const rows = [];
const warns = new Map();
const origWarn = console.warn;
console.warn = (...a) => { const k = a.join(' ').slice(0, 140); warns.set(k, (warns.get(k) || 0) + 1); };

for (const [hid, h] of Object.entries(data.heroes)) {
  if (only && only !== hid) continue;
  const b = createBattle({
    data, seed: 7,
    heroes: [{ uid: 'h1', heroId: Number(hid), rank: 1, items: [], x: 3, y: 2 }],
    enemies: [
      { enemyId: 99999, x: 2, y: 4, floor: 1 },
      { enemyId: 99999, x: 3, y: 5, floor: 1 },
      { enemyId: 99999, x: 4, y: 4, floor: 1 },
    ],
    relics: [],
  });
  const hero = b.state.units.find((u) => u.team === 1);
  let casts = 0, firstCast = null, manaPeak = 0;
  const after = { damage: 0, abilityDamage: 0, heal: 0, shield: 0, status: 0, projectile: 0, aoe: 0, other: 0 };
  let castWindowEnd = -1;
  for (let i = 0; b.state.time < 40 && i < 20000 && !b.isOver(); i++) {
    b.tick();
    manaPeak = Math.max(manaPeak, hero.mana || 0);
    for (const e of b.state.events) {
      if (e.type === 'cast' && e.sourceUid === hero.uid) {
        casts++; if (firstCast == null) firstCast = b.state.time; castWindowEnd = b.state.time + 2.5;
        continue;
      }
      if (e.type === 'damage' && e.sourceUid === hero.uid && (e.origin === 'ability' || e.isAbility)) after.abilityDamage += e.amount || 0;
      if (b.state.time <= castWindowEnd && (e.sourceUid === hero.uid || e.targetUid === hero.uid)) {
        const k = after[e.type] != null ? e.type : 'other';
        after[k] += e.type === 'damage' || e.type === 'heal' || e.type === 'shield' ? (e.amount || 0) : 1;
      }
    }
  }
  const ab = data.activeAbilities?.[h.activeAbilityId];
  rows.push({
    id: hid, hero: h.name?.en || h.name, abId: h.activeAbilityId, mana: `${Math.round(manaPeak)}/${hero.maxMana}`,
    casts, first: firstCast?.toFixed(1) ?? '-', abilDmg: Math.round(after.abilityDamage),
    heal: Math.round(after.heal), shield: Math.round(after.shield), status: after.status, proj: after.projectile, aoe: after.aoe,
    actions: (ab?.actions || []).map((a) => (a.type || a.$type || '').replace(/AbilityAction|Action/g, '')).join(','),
  });
}
console.warn = origWarn;
console.table(rows);
console.log('warnings:', [...warns.entries()].slice(0, 40));

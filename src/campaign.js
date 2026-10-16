import { ZONES, VICTORIES_FOR_BOSS } from "./content.js";

// Les niveaux dépendent de la région, jamais du niveau du héros qui revient chasser.
export function campaignEnemy(zone, index = 0, { boss = false, elite = false } = {}) {
  const level = zone.level + (boss ? 2 : elite ? 1 : 0);
  const scale = boss ? 2.2 : elite ? 1.5 : 1;
  const hp = Math.round((82 + level * 28) * scale);
  return {
    name: boss ? zone.boss : `${elite ? "Élite · " : ""}${zone.enemies[index]}`,
    level, boss, elite, hp, maxHp: hp,
    attack: Math.round((11 + level * 3) * (boss ? 1.25 : elite ? 1.12 : 1)),
    defense: 3 + level * 1.5,
  };
}

export const guardianReady = (p) =>
  (p.zoneWins[p.zone] ?? 0) >= VICTORIES_FOR_BOSS;

// La carte sociale ne transporte aucun coffre, PV, sac ou personnalisation privée.
export function campaignMarker(p) {
  const stage = Math.max(0, Math.min(ZONES.length - 1, p.unlockedZone ?? 0));
  return {
    id: p.id,
    name: p.name,
    level: p.level,
    stage,
    completed: p.bosses.includes(ZONES.length - 1),
    location: p.location === "base" ? "Au refuge" : ZONES[p.zone].name,
    inBattle: Boolean(p.battle),
  };
}

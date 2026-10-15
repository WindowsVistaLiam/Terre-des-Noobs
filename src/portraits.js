import { ZONES, RAIDS } from "./content.js";

const enemies = ZONES.flatMap((z) => [...z.enemies, z.boss]);
export const ENEMY_PORTRAITS = Object.fromEntries(
  enemies.map((name, index) => [
    name,
    { atlas: Math.floor(index / 16), index: index % 16, columns: 4 },
  ]),
);
for (const raid of RAIDS)
  ENEMY_PORTRAITS[raid.name] = { atlas: 3, index: raid.id, columns: 2 };
export const DEFAULT_PORTRAIT = { atlas: 3, index: 3, columns: 2 };
export function enemyPortrait(name) {
  return (
    ENEMY_PORTRAITS[String(name ?? "").replace(/^Élite · /, "")] ??
    DEFAULT_PORTRAIT
  );
}

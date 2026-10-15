export const DRAIN_RATES = { drain: 0.35, drain_magic: 0.45 };

export function drainHealing(kind, damage, healingBonus = 0) {
  return Math.ceil(damage * (DRAIN_RATES[kind] ?? 0) * (1 + healingBonus));
}

export function hpChangeText(before, after, max) {
  const delta = after - before;
  return `PV : ${before} → ${after} / ${max} (${delta > 0 ? "+" : ""}${delta} sur le tour).`;
}

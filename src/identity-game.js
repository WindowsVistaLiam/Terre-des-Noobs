import { ensure, statsOf } from "./game.js";
import { RACES, CLASSES } from "./content.js";
import { SPECIALIZATIONS, SPECIALIZATION_LEVEL, SPECIALIZATION_COST } from "./specializations.js";
import { HONORS, unlockedHonors } from "./honors.js";

export const IDENTITY_TOKENS = { race: "sceau_race", class: "sceau_classe" };
function adjustVitals(p, before) {
  const after = statsOf(p);
  p.hp = Math.max(1, Math.floor(Math.min(1, p.hp / before.hp) * after.hp));
  p.mana = Math.floor(Math.min(1, p.mana / before.mana) * after.mana);
}
export const identityMethods = {
  async identityInfo(tx, id, _, now) {
    return { p: await this.player(tx, id, now), type: "identity" };
  },
  async identityPreview(tx, id, { kind, target }, now) {
    const p = await this.player(tx, id, now);
    ensure(Object.hasOwn(IDENTITY_TOKENS, kind) && Object.hasOwn(kind === "race" ? RACES : CLASSES, target), "Transformation inconnue.");
    return { p, type: "identityPreview", kind, target };
  },
  async changeIdentity(tx, id, { kind, target }, now) {
    const p = await this.player(tx, id, now);
    this.home(p);
    ensure(Object.hasOwn(IDENTITY_TOKENS, kind) && Object.hasOwn(kind === "race" ? RACES : CLASSES, target), "Transformation inconnue.");
    const key = kind === "race" ? "raceId" : "classId", token = IDENTITY_TOKENS[kind];
    ensure(p[key] !== target, "Tu possèdes déjà cette identité.");
    ensure((p.resources[token] ?? 0) >= 1, "Achète d’abord le sceau correspondant chez le marchand.");
    const before = statsOf(p);
    this.accrue(p, now);
    p.resources[token]--;
    p[key] = target;
    if (kind === "class") {
      p.specialization = null;
      p.talentPoints += Object.values(p.talents).reduce((n, v) => n + v, 0);
      p.talents = { attack: 0, defense: 0, power: 0, vitality: 0 };
    }
    adjustVitals(p, before);
    return { p, type: "identity", message: kind === "race"
      ? `Tu es maintenant ${RACES[target].name}. Les bâtiments d’un autre peuple sont conservés mais inactifs.`
      : `Tu es maintenant ${CLASSES[target].name}. Tes talents sont remboursés et tu peux choisir une nouvelle spécialisation.` };
  },
  async specializationsInfo(tx, id, _, now) {
    return { p: await this.player(tx, id, now), type: "specializations" };
  },
  async specializationPreview(tx, id, { specId }, now) {
    const p = await this.player(tx, id, now);
    const spec = SPECIALIZATIONS[p.classId].find((s) => s.id === specId);
    ensure(spec, "Cette spécialisation appartient à une autre classe.");
    return { p, type: "specializationPreview", specId };
  },
  async chooseSpecialization(tx, id, { specId }, now) {
    const p = await this.player(tx, id, now);
    this.home(p);
    ensure(p.level >= SPECIALIZATION_LEVEL, `Niveau ${SPECIALIZATION_LEVEL} requis.`);
    ensure(SPECIALIZATIONS[p.classId].some((s) => s.id === specId), "Cette spécialisation appartient à une autre classe.");
    ensure(p.specialization !== specId, "Cette spécialisation est déjà active.");
    const before = statsOf(p);
    if (p.specialization) this.spend(p, SPECIALIZATION_COST);
    p.specialization = specId;
    adjustVitals(p, before);
    return { p, type: "specializations", message: "Ta spécialisation et ta compétence sont maintenant actives en campagne, en raid et en duel." };
  },
  async honorsInfo(tx, id, _, now) {
    return { p: await this.player(tx, id, now), type: "honors" };
  },
  async equipHonor(tx, id, { slot, honorId }, now) {
    const p = await this.player(tx, id, now);
    ensure(["title", "frame", "decoration"].includes(slot), "Décoration inconnue.");
    ensure(honorId === "none" || (HONORS.some((h) => h.id === honorId) && unlockedHonors(p).some((h) => h.id === honorId)), "Cet exploit n’est pas encore débloqué.");
    p.honors[slot] = honorId === "none" ? null : honorId;
    return { p, type: "honors", message: "Ta récompense est maintenant visible sur tes profils et tes menus." };
  },
};

import { CLASSES } from "./content.js";

const names = {
  guerrier: ["Maître d’armes", "Bastion", "Seigneur de guerre"],
  archer: ["Œil de faucon", "Sentinelle", "Traqueur venimeux"],
  assassin: ["Lame de l’ombre", "Danseur de brume", "Empoisonneur"],
  mage: ["Pyromancien", "Gardien des arcanes", "Conjurateur"],
  paladin: ["Justicier", "Protecteur du serment", "Templier"],
  necromancien: ["Maître des légions", "Buveur d’âmes", "Tisseur de malédictions"],
  druide: ["Griffe sauvage", "Gardien du bosquet", "Maître des ronces"],
  barde: ["Virtuose des lames", "Chantre de l’aube", "Murmure funeste"],
  berserker: ["Ravageur", "Peau de fer", "Sanguinaire"],
  moine: ["Poing du tonnerre", "Voie du rempart", "Paume spectrale"],
  rodeur: ["Chasseur de monstres", "Gardien des pistes", "Maître des bêtes"],
  sorcier: ["Pacte des braises", "Pacte du rempart", "Pacte du familier"],
  pretre: ["Inquisiteur", "Hiérophante", "Exorciste"],
  chaman: ["Appel de la foudre", "Esprit de la terre", "Appel des ancêtres"],
  ingenieur: ["Artilleur", "Cuirassier", "Automancien"],
  chevalier_noir: ["Briseur de serments", "Garde funèbre", "Seigneur des maléfices"],
  duelliste: ["Fine lame", "Maître de parade", "Lame hémorragique"],
  alchimiste: ["Bombardier", "Apothicaire", "Toxicologue"],
};
const summoned = new Set(["mage", "rodeur", "sorcier", "chaman", "ingenieur"]);
export const SPECIALIZATION_LEVEL = 5;
export const SPECIALIZATION_COST = 300;
export const SPECIALIZATIONS = Object.fromEntries(Object.entries(names).map(([classId, list]) => {
  const base = CLASSES[classId].skill;
  const magical = CLASSES[classId].stats.power > CLASSES[classId].stats.attack;
  const specs = list.map((name, index) => ({
    id: `${classId}_${index}`, classId, name,
    bonuses: index === 0 ? { [magical ? "power" : "attack"]: 5, crit: 0.02 }
      : index === 1 ? { defense: 3, hp: 18, healing: 0.08 } : { mana: 12, [magical ? "power" : "attack"]: 3 },
    skill: {
      ...base, name: `${name} · ${base.name}`,
      multiplier: base.multiplier + (index === 0 ? 0.2 : index === 2 ? 0.05 : 0),
      effect: index === 1 ? "ward" : index === 2 ? (summoned.has(classId) ? "summon" : magical ? "curse" : "bleed") : null,
      text: index === 0 ? `${base.text} Puissance accrue.` : index === 1
        ? `${base.text} Réduit ensuite les dégâts reçus de 20 % pendant 3 tours.`
        : `${base.text} ${summoned.has(classId) ? "Un allié invoqué frappe" : magical ? "Une malédiction affaiblit l’ennemi et le blesse" : "Une blessure inflige des dégâts"} pendant 3 tours.`,
    },
  }));
  if (classId === "necromancien") {
    specs[0].skill = { ...base, name: "Légion des oubliés", kind: "magic", multiplier: 1.75, effect: "summon", text: "Frappe magique et serviteur invoqué : dégâts supplémentaires pendant 3 tours." };
    specs[1].skill = { ...base, name: "Siphon des âmes", multiplier: 1.9, drainBonus: 0.3, text: "Drain magique. Les soins du vol de vie sont augmentés de 30 %." };
    specs[2].skill = { ...base, name: "Malédiction du tombeau", kind: "magic", multiplier: 1.7, effect: "curse", text: "Frappe magique, dégâts de malédiction et -20 % de dégâts ennemis pendant 3 tours." };
  }
  return [classId, specs];
}));
export const specializationOf = (p) => SPECIALIZATIONS[p.classId]?.find((s) => s.id === p.specialization) ?? null;
export const skillOf = (p) => specializationOf(p)?.skill ?? CLASSES[p.classId].skill;
export function activateTechnique(skill, state, turn) {
  if (skill.effect) state[skill.effect] = turn + 2;
}
export function techniqueDamage(state = {}, stats, turn) {
  return [
    ["summon", "Invocation", stats.power * 0.22 + stats.attack * 0.08],
    ["bleed", "Blessure persistante", stats.attack * 0.2],
    ["curse", "Malédiction", stats.power * 0.12],
  ].filter(([key]) => (state[key] ?? 0) >= turn)
    .map(([, name, amount]) => ({ name, amount: Math.max(1, Math.round(amount)) }));
}
export const techniqueProtection = (state = {}, turn) =>
  ((state.ward ?? 0) >= turn || (state.curse ?? 0) >= turn) ? 0.8 : 1;

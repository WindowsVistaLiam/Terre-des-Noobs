import { ZONES } from "./content.js";

export const TRAITS = {
  swarm: { name: "Vermine", text: "Peu de PV et de défense. Une cible accessible pour récolter.", hp: 0.85, attack: 0.9, defense: 0.8 },
  thief: { name: "Pilleur", text: "Tous les 3 tours, vole de l’or du sac si tu ne te défends pas. Vaincs-le pour récupérer cet or.", hp: 1, attack: 0.95, defense: 1 },
  swift: { name: "Rapide", text: "Tous les 3 tours, sa ruée frappe plus fort. La garde réduit fortement ses dégâts.", hp: 0.9, attack: 1.08, defense: 0.85 },
  venom: { name: "Venimeux", text: "Tous les 3 tours, empoisonne si tu ne te défends pas. Une potion dissipe le poison.", hp: 0.95, attack: 0.9, defense: 0.95 },
  regenerating: { name: "Régénérant", text: "Récupère 8 % de ses PV tous les 3 tours. Maintiens la pression.", hp: 1.12, attack: 0.9, defense: 1 },
  armored: { name: "Cuirassé", text: "Beaucoup de défense, mais peu de vitesse. La magie et les attaques perforantes sont efficaces.", hp: 1.15, attack: 0.9, defense: 1.8 },
  arcane: { name: "Occulte", text: "Ses attaques ignorent 35 % de ta défense. La garde reste efficace.", hp: 0.9, attack: 1, defense: 0.8 },
  furious: { name: "Furieux", text: "Inflige 20 % de dégâts supplémentaires sous 50 % de ses PV.", hp: 1.15, attack: 1, defense: 0.9 },
  brute: { name: "Brutal", text: "Sa frappe lourde tous les 3 tours est particulièrement dangereuse.", hp: 1.2, attack: 1.08, defense: 0.8 },
  siphon: { name: "Dévoreur de mana", text: "Tous les 3 tours, absorbe du mana si tu ne te défends pas.", hp: 0.95, attack: 0.95, defense: 1.1 },
  sentinel: { name: "Sentinelle", text: "Réduit de 30 % les dégâts de ta première frappe. Prépare une offensive durable.", hp: 1.05, attack: 1, defense: 1.35 },
};
const patterns = [
  ["swarm", "thief", "swift"], ["venom", "regenerating", "thief"],
  ["thief", "armored", "swift"], ["regenerating", "venom", "arcane"],
  ["sentinel", "siphon", "furious"], ["regenerating", "swift", "sentinel"],
  ["swift", "venom", "arcane"], ["armored", "furious", "arcane"],
  ["thief", "siphon", "armored"], ["sentinel", "venom", "arcane"],
  ["furious", "siphon", "arcane"], ["arcane", "brute", "sentinel"],
];
export const ENEMY_TRAITS = Object.fromEntries(ZONES.flatMap((z) =>
  z.enemies.map((name, index) => [name, patterns[z.id][index]])));
export const traitOf = (enemy) => TRAITS[enemy.trait] ?? null;

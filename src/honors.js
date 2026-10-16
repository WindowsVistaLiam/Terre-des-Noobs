import { ZONES } from "./content.js";

export const HONORS = [
  { id: "serment", name: "Premier serment", title: "Porte-serment", frame: "bronze", decoration: "runes", color: "#be9867", goal: 1, progress: (p) => p.kills },
  { id: "chasseur", name: "Vingt-cinq victoires", title: "Pisteur de Brume", frame: "forest", decoration: "leaves", color: "#8fc69d", goal: 25, progress: (p) => p.kills },
  { id: "naturaliste", name: "Les 36 créatures découvertes", title: "Maître du bestiaire", frame: "emerald", decoration: "leaves", color: "#52d9b0", goal: 36, progress: (p) => ZONES.flatMap((z) => z.enemies).filter((name) => (p.bestiary?.[name] ?? 0) > 0).length },
  { id: "defenseur", name: "Première défense de cité récompensée", title: "Veilleur de la cité", frame: "steel", decoration: "runes", color: "#8abed5", goal: 1, progress: (p) => p.social?.defenses ?? 0 },
  { id: "raid", name: "Premier raid remporté", title: "Fléau des géants", frame: "silver", decoration: "stars", color: "#d0dbe7", goal: 1, progress: (p) => p.raids },
  { id: "soleil", name: "Azhur vaincu", title: "Éclipse du Soleil noir", frame: "gold", decoration: "stars", color: "#ebc36e", goal: 1, progress: (p) => p.raidWins?.[2] ?? 0 },
  { id: "secours", name: "Un compagnon sauvé en raid", title: "Gardien des âmes", frame: "dawn", decoration: "stars", color: "#efcfb9", goal: 1, progress: (p) => p.social?.rescues ?? 0 },
  { id: "lice", name: "Cinq victoires en duel", title: "Champion de la lice", frame: "crimson", decoration: "runes", color: "#d48491", goal: 5, progress: (p) => p.social?.wins ?? 0 },
  { id: "brume", name: "Douze gardiens vaincus", title: "Briseur de Brume", frame: "astral", decoration: "stars", color: "#bba4ed", goal: 12, progress: (p) => p.bosses.length },
];
export const unlockedHonors = (p) => HONORS.filter((h) => h.progress(p) >= h.goal);
export function honorAppearance(p) {
  const unlocked = unlockedHonors(p);
  const title = unlocked.find((h) => h.id === p.honors?.title);
  const frame = unlocked.find((h) => h.id === p.honors?.frame);
  const decoration = unlocked.find((h) => h.id === p.honors?.decoration);
  return {
    earnedTitle: title?.title ?? "",
    frame: frame ? { id: frame.frame, color: frame.color } : null,
    decoration: decoration ? { id: decoration.decoration, color: decoration.color } : null,
  };
}
export function normalizeAdventures(p) {
  p.specialization ??= null;
  p.bestiary ??= {};
  p.raidWins ??= {};
  p.honors ??= { title: null, frame: null, decoration: null };
  p.customization ??= { title: "", bio: "", portrait: null, banner: null };
  p.customization.avatar ??= null;
  return p;
}

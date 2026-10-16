import { RACES, CLASSES, RESOURCES } from "./content.js";
import { IDENTITY_TOKENS } from "./identity-game.js";
import { SPECIALIZATIONS, SPECIALIZATION_LEVEL, SPECIALIZATION_COST } from "./specializations.js";
import { HONORS, unlockedHonors } from "./honors.js";

export function buildAdventureView(result, owner, ui) {
  const { screen, card, row, push, nav, btn, select, choice, statText } = ui;
  const { p } = result;
  switch (result.type) {
    case "identity": {
      screen.title = "Le sanctuaire du renouveau";
      screen.subtitle = `${RACES[p.raceId].name} · ${CLASSES[p.classId].name} · niveau ${p.level} conservé`;
      screen.cards = [card("Changer de classe", `Cristaux de vocation : ${p.resources.sceau_classe ?? 0}\nDisponible chez le marchand : 750 or. Tes points de talent sont remboursés et ta spécialisation remise à zéro.`),
        card("Changer de race", `Sceaux du renouveau : ${p.resources.sceau_race ?? 0}\nDisponible chez le marchand : 1000 or. Les bâtiments de ton ancienne race restent construits mais inactifs.`),
        card("Ta progression reste intacte", "Niveau, XP, coffre, objets, guildes, campagne et personnalisations sont conservés. Transformation au refuge uniquement. Les jauges conservent leur proportion, sans soin gratuit.")];
      push(select("identityChoice", "Choisir une nouvelle classe", Object.entries(CLASSES).filter(([id]) => id !== p.classId).map(([id, c]) => choice(id, c.name)), "class"));
      push(select("identityChoice", "Choisir une nouvelle race", Object.entries(RACES).filter(([id]) => id !== p.raceId).map(([id, r]) => choice(id, r.name)), "race"));
      push(row(nav("Acheter un sceau au marchand", "store"), nav("← Mon profil", "profile")));
      return true;
    }
    case "identityPreview": {
      const collection = result.kind === "race" ? RACES : CLASSES, token = IDENTITY_TOKENS[result.kind];
      screen.title = `Devenir ${collection[result.target].name}`;
      screen.subtitle = "Vérifie ton choix avant de consommer ton sceau";
      screen.cards = [card("Le coût", `1 ${RESOURCES[token]}\nEn réserve : ${p.resources[token] ?? 0}`),
        card("Le changement", result.kind === "race" ? "Les bonus raciaux changent. Les bâtiments raciaux incompatibles restent construits mais inactifs. L’avatar de race changera si tu n’utilises pas d’image personnelle."
          : "La compétence de classe change. Les points de talent dépensés sont remboursés. La spécialisation est remise à zéro. Tu gardes tes objets et ta progression.")];
      push(row(btn("Confirmer", "do", ["changeIdentity", result.kind, result.target], { style: 3, disabled: p.location !== "base" || !(p.resources[token] > 0) || p[result.kind === "race" ? "raceId" : "classId"] === result.target }), nav("Annuler", "identity")));
      return true;
    }
    case "specializations": {
      const list = SPECIALIZATIONS[p.classId];
      screen.title = "Les voies de ta vocation";
      screen.subtitle = `${CLASSES[p.classId].name} · niveau ${SPECIALIZATION_LEVEL} requis · premier choix gratuit`;
      screen.cards = list.map((s) => card(`${p.specialization === s.id ? "Active · " : ""}${s.name}`, `${statText(s.bonuses)}\n${s.skill.name} · ${s.skill.cost} mana\n${s.skill.text}`));
      screen.cards.push(card("Choisir sa voie", `Au refuge, à partir du niveau ${SPECIALIZATION_LEVEL}. Premier choix gratuit ; changer ensuite coûte ${SPECIALIZATION_COST} or. Les effets d’invocation, de blessure ou de malédiction durent trois tours et sont renouvelés par la compétence.`));
      if (p.level >= SPECIALIZATION_LEVEL) push(select("specializationChoice", "Examiner une spécialisation", list.filter((s) => s.id !== p.specialization).map((s) => choice(s.id, s.name))));
      push(row(nav("← Mon profil", "profile")));
      return true;
    }
    case "specializationPreview": {
      const spec = SPECIALIZATIONS[p.classId].find((s) => s.id === result.specId);
      screen.title = spec.name;
      screen.subtitle = `Choisir cette voie · ${p.specialization ? SPECIALIZATION_COST : 0} or`;
      screen.cards = [card("Tes bonus", statText(spec.bonuses)), card(spec.skill.name, `${spec.skill.cost} mana · un tour sur deux\n${spec.skill.text}`)];
      push(row(btn("Confirmer", "do", ["chooseSpecialization", spec.id], { style: 3, disabled: p.location !== "base" || p.level < SPECIALIZATION_LEVEL || p.specialization === spec.id || (p.specialization && p.gold < SPECIALIZATION_COST) }), nav("Annuler", "specializations")));
      return true;
    }
    case "honors": {
      const unlocked = unlockedHonors(p);
      screen.title = "La salle des exploits";
      screen.subtitle = `${unlocked.length} / ${HONORS.length} exploits · récompenses purement visuelles`;
      screen.cards = HONORS.map((h) => card(`${unlocked.includes(h) ? "Acquis · " : "À gagner · "}${h.name}`, `${Math.min(h.goal, h.progress(p))} / ${h.goal}\nTitre : ${h.title}\nCadre et décoration assortis`, { accent: unlocked.includes(h) ? "gold" : "blue" }));
      for (const [slot, label] of [["title", "Titre d’exploit"], ["frame", "Cadre du portrait"], ["decoration", "Décoration du profil"]])
        push(select("honorChoice", label, [choice("none", "Aucun"), ...unlocked.map((h) => choice(h.id, slot === "title" ? h.title : h.name))], slot));
      push(row(nav("← Personnalisation", "customize")));
      return true;
    }
    case "adminResetPreview":
      screen.title = `Réinitialiser ${result.target.name} ?`;
      screen.subtitle = `Administration · personnage niveau ${result.target.level} · confirmation valable 5 minutes`;
      screen.tone = "red";
      screen.cards = [card("Effacement définitif", `Compte Discord : ${result.target.id}\nLe personnage, son niveau, sa campagne, son coffre, ses ${result.target.gear} équipements et ses personnalisations seront effacés. Le joueur pourra recommencer depuis /profil.`),
        card("Relations et échanges", "Ses annonces seront retirées, ses demandes en attente annulées, ses amitiés et appartenances aux groupes supprimées. La direction sera transmise ; les groupes vides seront dissous. Les autres personnages et leurs biens sont conservés.")];
      push(row(btn("Confirmer", "adminConfirm", [result.token], { style: 4 }), nav("Annuler", "profile")));
      return true;
    case "adminResetDone":
      screen.title = "Personnage réinitialisé";
      screen.cards = [card("Compte rendu d’administration", result.message)];
      return true;
    default: return false;
  }
}

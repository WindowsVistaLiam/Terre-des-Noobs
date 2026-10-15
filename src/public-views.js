import { publicId } from "./commands.js";
import { RACES, CLASSES } from "./content.js";
import { plainText } from "./canvas.js";

export function buildPublicView(result, ui) {
  const { screen, card, row, push } = ui;
  const button = (label, action, ...args) => ({
    type: 2,
    style: 2,
    label,
    custom_id: publicId(action, ...args),
  });
  const footer = () =>
    push(
      row(
        button("Mon carnet privé", "profile"),
        button("Social", "social"),
        button("Mon marché", "market"),
        button("Info", "info"),
      ),
    );
  switch (result.type) {
    case "publicWelcome":
      screen.title = "Une aventure à écrire";
      screen.subtitle = "Ce joueur n’a pas encore de personnage.";
      screen.cards = [
        card(
          "La Brume vous attend",
          "Crée ton héros, bâtis ton refuge et rejoins les aventures de tes amis. Ouvre ton carnet pour commencer.",
        ),
      ];
      footer();
      return true;
    case "publicProfile": {
      const t = result.target;
      screen.title = t.name;
      screen.subtitle = `${RACES[t.raceId].name} · ${CLASSES[t.classId].name} · niveau ${t.level}`;
      if (t.title) screen.subtitle += ` · ${t.title}`;
      screen.metrics = [
        { label: "Attaque", value: String(t.stats.attack) },
        { label: "Défense", value: String(t.stats.defense) },
        { label: "Puissance", value: String(t.stats.power) },
      ];
      screen.cards = [
        card(
          "Son aventure",
          `${t.location}${t.inBattle ? " · En combat" : ""}\n${t.bosses} / 12 gardiens vaincus · ${t.kills} victoires\n${t.guildName ?? "Sans guilde"}`,
        ),
        card(
          "Son équipement porté",
          t.equipment
            .map(
              (e) =>
                `${{ weapon: "Arme", armor: "Armure", charm: "Talisman" }[e.slot]} : ${plainText(e.label)}${e.level ? ` · niv. ${e.level}` : ""}`,
            )
            .join("\n"),
        ),
        card(
          "Ses capacités",
          `${t.stats.hp} PV maximum · ${t.stats.mana} mana maximum\n${Math.round(t.stats.crit * 100)} % de critiques\n${CLASSES[t.classId].skill.name} : ${CLASSES[t.classId].skill.text}`,
        ),
        card(
          "Son renom",
          `${t.wins} victoire(s), ${t.losses} défaite(s) en duel\n${t.honor} honneur · ${t.defenses} défense(s) de cité`,
        ),
      ];
      push(
        row(
          button("Rencontrer ce héros", "playerCard", t.id),
          button("Voir les autres profils", "directory"),
          button("Actualiser ce profil", "publicProfile", t.id),
        ),
      );
      if (t.bio) screen.cards.push(card("Son histoire", t.bio));
      footer();
      return true;
    }
    case "publicMarket":
      screen.background = "market";
      screen.title = "La Halle des routes";
      screen.subtitle = `Les offres de la communauté · page ${result.page} / ${result.pages}`;
      screen.cards = result.listings.map((l) =>
        card(
          plainText(l.label),
          `${l.price} or le lot\nVendeur : ${l.sellerName}`,
        ),
      );
      if (!screen.cards.length)
        screen.cards = [
          card(
            "Le marché ouvre ses portes",
            "Mets tes trouvailles en vente depuis ton marché personnel. Les offres seront visibles ici pour tous les aventuriers.",
          ),
        ];
      if (result.listings.length)
        push(
          row({
            type: 3,
            custom_id: publicId("listing"),
            placeholder: "Consulter un lot dans mon menu privé",
            min_values: 1,
            max_values: 1,
            options: result.listings.map((l) => ({
              label: plainText(`${l.label} · ${l.price} or`).slice(0, 100),
              value: l.id,
            })),
          }),
        );
      push(
        row(
          button(
            "← Page précédente",
            "marketPage",
            Math.max(1, result.page - 1),
            "prev",
          ),
          button("Actualiser les offres", "marketPage", result.page, "refresh"),
          button(
            "Page suivante →",
            "marketPage",
            Math.min(result.pages, result.page + 1),
            "next",
          ),
        ),
      );
      footer();
      return true;
    case "publicActivity":
      screen.compact = true;
      screen.background = result.background;
      screen.title = result.title;
      screen.subtitle = `${result.actorName} · niveau ${result.level} · Chronique du salon`;
      screen.cards = [card("Les nouvelles de Brumeterre", result.text)];
      push(
        row(
          button("Voir son profil", "publicProfile", result.actorId),
          button("Rejoindre l’aventure", "profile"),
        ),
      );
      return true;
    default:
      return false;
  }
}

import {
  RACES,
  CLASSES,
  ZONES,
  RESOURCES,
  BUILDINGS,
  RECIPES,
  RAIDS,
  RARITIES,
  DAILY_QUESTS,
  SHOP,
  xpRequired,
  buildingCost,
  worldEvent,
  VICTORIES_FOR_BOSS,
} from "./content.js";
import { statsOf, gearLabel, activeBuilding } from "./game.js";
import { drawPanel, plainText } from "./canvas.js";
import { uiId, publicId } from "./commands.js";
import { RACE_COLORS, SOCIAL_TYPES } from "./social-content.js";
import { buildSocialView } from "./social-views.js";
import { buildPublicView } from "./public-views.js";
import { DEFAULT_PORTRAIT, enemyPortrait } from "./portraits.js";
import { campaignEnemy, campaignMarker, guardianReady } from "./campaign.js";
import { compactMenus } from "./menus.js";
import { buildAdventureView } from "./adventure-views.js";
import { skillOf, specializationOf, SPECIALIZATIONS } from "./specializations.js";
import { traitOf, ENEMY_TRAITS, TRAITS } from "./bestiary.js";
import { raceBody } from "./equipment-art.js";

const slotName = { weapon: "Arme", armor: "Armure", charm: "Talisman" };
const chapterNames = {
  races: "Les peuples",
  classes: "Les classes",
  metiers: "Les métiers d’artisanat",
  items: "Objets et ressources",
  batiments: "Les bâtiments",
  recettes: "Les recettes",
  raids: "Les grands périls",
  regles: "Le guide du voyageur",
  specialisations: "Les spécialisations", bestiaire: "Le bestiaire",
};
const resourceText = (resources) =>
  Object.entries(resources)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => `${plainText(RESOURCES[id] ?? id)} : ${Math.floor(n)}`)
    .join("\n") || "Aucune ressource pour le moment.";
export const statText = (stats) =>
  Object.entries(stats)
    .map(
      ([key, value]) =>
        `${{ hp: "Vie", mana: "Mana", attack: "Attaque", defense: "Défense", power: "Puissance", crit: "Critiques", luck: "Butin", xp: "Expérience", gold: "Or gagné", healing: "Soins" }[key] ?? key} +${["crit", "luck", "xp", "gold", "healing"].includes(key) ? `${Math.round(value * 100)} %` : Math.round(value)}`,
    )
    .join(" · ");
const costText = (gold, resources = {}) =>
  `${gold} or\n${resourceText(resources)}`;
const card = (title, text, extra = {}) => ({ title, text, ...extra });
const row = (...components) => ({
  type: 1,
  components: components.filter(Boolean),
});
const choice = (value, label, description) => ({
  value: String(value),
  label: String(label).slice(0, 100),
  ...(description ? { description: plainText(description).slice(0, 100) } : {}),
});
const pageOf = (entries, requested = 1, size = 4) => {
  const pages = Math.max(1, Math.ceil(entries.length / size));
  const page = Math.max(
    1,
    Math.min(pages, Number.isSafeInteger(requested) ? requested : 1),
  );
  return {
    entries: entries.slice((page - 1) * size, page * size),
    page,
    pages,
  };
};
const gearCard = (item, equipped = false) =>
  card(
    `${equipped ? "Porté · " : ""}${plainText(gearLabel(item))}`,
    `Niveau ${item.level} · ${slotName[item.slot]}\n${statText(item.stats)}`,
    {
      tag: RARITIES[item.rarity].name,
      icon: item,
      accent: ["gold", "green", "blue", "purple", "gold"][item.rarity],
    },
  );

export function codexEntries(category, p) {
  switch (category) {
    case "specialisations":
      return Object.entries(SPECIALIZATIONS).flatMap(([classId, specs]) => specs.map((s) =>
        card(`${CLASSES[classId].name} · ${s.name}`, `${statText(s.bonuses)}\n${s.skill.name} · ${s.skill.cost} mana\n${s.skill.text}`, { tag: "Profil → Spécialisations · niveau 5 · au refuge" })));
    case "bestiaire":
      return ZONES.flatMap((z) => z.enemies.map((name) => {
        const t = TRAITS[ENEMY_TRAITS[name]];
        return card(name, `${z.name} · ${t.name}\n${t.text}\nVictoires recensées : ${p?.bestiary?.[name] ?? 0}`, { portrait: enemyPortrait(name) });
      }));
    case "races":
      return Object.entries(RACES).map(([key, r]) =>
        card(
          r.name,
          `${r.lore}\n${statText(r.bonuses)}\nHéritage : ${BUILDINGS[r.building].name}`,
          {
            textColor: RACE_COLORS[key],
            titleColor: RACE_COLORS[key],
            accent: RACE_COLORS[key],
          },
        ),
      );
    case "classes":
      return Object.values(CLASSES).map((c) =>
        card(
          c.name,
          `${c.role}\n${statText(c.stats)}\n${c.skill.name} · ${c.skill.cost} mana\n${c.skill.text}`,
          { tag: "Compétence disponible un tour sur deux" },
        ),
      );
    case "batiments":
      return Object.values(BUILDINGS)
        .sort(
          (a, b) =>
            Number(Boolean(a.races.length && !a.races.includes(p?.raceId))) -
            Number(Boolean(b.races.length && !b.races.includes(p?.raceId))),
        )
        .map((b) =>
          card(
            b.name,
            `${b.description}\n${b.races.length ? `Peuple : ${b.races.map((r) => RACES[r].name).join(", ")}` : "Accessible à tous les peuples"}\nConstruction : 60 or, 12 bois, 8 pierres`,
            { tag: "3 emplacements par refuge · niveau maximal 5" },
          ),
        );
    case "recettes":
      return Object.values(RECIPES).map((r) =>
        card(
          r.name,
          `${costText(r.gold, r.cost)}${r.slot ? "\nÉquipement créé à ton niveau actuel." : ""}`,
          { tag: "Disponible dans Marché → Atelier" },
        ),
      );
    case "items":
      return Object.entries(RESOURCES)
        .map(([id, name]) =>
          card(
            plainText(name),
            `${SHOP[id]?.description ?? { essence: "Énergie magique pour recettes et enchantements.", cristal: "Matériau rare des régions avancées.", perle: "Trésor de l’Archipel des ombres.", ecaille: "Matériau antique du Trône de la Brume.", insigne: "Récompense de raid, liée à ton personnage." }[id] ?? "Matériau trouvé au cours de tes aventures."}\n${id === "insigne" ? "Non échangeable." : "Échangeable entre joueurs."}`,
            {
              tag: SHOP[id]
                ? `Marchand : ${SHOP[id].price} or par unité`
                : "Exploration et raids",
            },
          ),
        )
        .concat([
          card(
            "Équipements",
            "Armes : attaque et puissance.\nArmures : défense et vie.\nTalismans : puissance, vie et critiques.\nChaque objet nécessite son niveau pour être équipé.",
          ),
          card(
            "Raretés & enchantements",
            "Commun · Inhabituel · Rare · Épique · Légendaire\nLes enchantements améliorent les statistiques jusqu’à +5, avec réussite garantie. Une forge est nécessaire.",
          ),
        ]);
    case "metiers":
      return [
        card(
          "Alchimie",
          "Transforme les herbes en potions, prépare des éthers avec de l’essence et transmue les matériaux. Les consommables servent à toutes les classes.",
          { tag: "Marché → Atelier → Recettes" },
        ),
        card(
          "Forge",
          "Fabrique armes, armures et talismans rares. Les recettes avancées produisent des reliques épiques et des armes légendaires.",
          {
            tag: "Le métier décrit une activité, pas une classe supplémentaire.",
          },
        ),
        card(
          "Enchantement",
          "Construis une forge, puis améliore tes objets avec du fer, de l’essence et de l’or. Jusqu’à +5 ; aucune chance d’échec.",
          { tag: "Marché → Coffre → Choisir un objet" },
        ),
        card(
          "Récolte & recyclage",
          "Scierie, carrière, mine et jardin produisent hors ligne. Les objets inutilisés se recyclent en fer et en essence. La production s’accumule pendant 12 heures.",
          { tag: "Profil → Refuge ou Marché → Coffre" },
        ),
      ];
    case "raids":
      return RAIDS.map((r) =>
        card(
          r.name,
          `Niveau ${r.level} · ${r.hp} PV\n${r.story}\nVictoire : ${r.reward} or, ${r.reward * 2} XP, matériaux, insignes et équipement pour chacun.`,
          { tag: "2–4 joueurs · 20 énergie · délai de 24 h" },
        ),
      );
    default:
      return [
        card(
          "Tes quatre portes d’entrée",
          "Profil : héros, aventure, refuge et talents.\nSocial : amis, duels, guildes et cité.\nMarché : équipement, échanges et artisanat.\nInfo : l’encyclopédie et ce guide.\nTout le reste se joue avec les menus.",
        ),
        card(
          "La vie du salon",
          "Profil, Marché et Info sont visibles par tous. Profil → joueur permet de consulter un autre héros. Les boutons ouvrent ton propre carnet privé. Social, coffres, formulaires et tours de combat restent personnels ; les grands résultats sont annoncés dans le salon.",
        ),
        card(
          "Prendre la route",
          "Aventure → Choisir un ennemi : avance en campagne ou chasse pour les ressources. Deux victoires de progression débloquent le gardien ; tu décides quand le défier. La chasse conserve ce compteur et donne XP, or et butin, sans ouvrir de route. Les ennemis des anciennes régions gardent leur faible niveau. Le gardien ouvre la route suivante, sous réserve du niveau requis.",
        ),
        card(
          "Combattre",
          "Attaque : récupère 3 mana.\nDéfense : bloque 70 % des dégâts et rend 10 mana.\nCompétence : disponible un tour sur deux.\nPotion ou éther : consomme ton tour.\nUne frappe lourde arrive tous les trois tours.\nLes soins arrivent avant la riposte et sont limités aux PV manquants ; le journal détaille le bilan du tour.",
        ),
        card(
          "Sauver ton butin",
          "Rentrer sécurise tout le sac. Une défaite perd la moitié de l’or et des matériaux du sac, et tous ses équipements. Le coffre est protégé. Fuir coûte 25 % de l’or du sac. En progression, fuite et défaite remettent le compteur du gardien à zéro ; en chasse, ce compteur est conservé.",
        ),
        card(
          "Ton refuge",
          "3 bâtiments différents, jusqu’au niveau 5. Un bâtiment exclusif par peuple.\nÀ la base : récupération de vie et mana chaque minute. Repos payant immédiat.\nÉnergie : +1 toutes les 5 minutes, même hors ligne.",
        ),
        card(
          "Le marché",
          "Le lot quitte ton coffre pendant la vente. Le prix porte sur le lot entier. Commission vendeur : 5 %, arrondie au supérieur. Expiration : 7 jours ; le lot revient au prochain accès au marché. 10 annonces actives par personne.",
        ),
        card(
          "Compagnons & raids",
          "Guildes ouvertes de 30 membres, trésor partagé et +2 % XP par niveau. Les groupes réunissent 2 à 4 aventuriers. En rejoignant, tu autorises le chef à lancer le raid pour 20 énergie. Reste à la base avec 50 % de tes PV.",
        ),
        card(
          "Amitiés & duels",
          "Social → Réception rassemble demandes d’amis, invitations et défis. Les duels demandent votre accord et simulent un combat à pleine vie sans consommer vos ressources. Un duel par minute ; les défis expirent après 15 minutes. Le blocage empêche les échanges directs.",
        ),
        card(
          "Votre cité & les invasions",
          "Donnez or et matériaux, puis améliorez quatre constructions communes. À partir de deux membres, participez à l’invasion du jour : trois sorties chacun, espacées de cinq minutes, pour 10 énergie et 10 % des PV maximaux. Après la victoire, chaque participant réclame une récompense quotidienne.",
        ),
        card(
          "Gardes & sièges entre guildes",
          "Une garde protège la cité pendant 24 h pour 10 énergie. Les deux guildes doivent activer les sièges et avoir au plus deux niveaux d’écart. Attaquer coûte 120 or commun et 15 énergie. Récupération et protection : six heures. Les bâtiments et les coffres sont protégés ; l’intégrité se répare avec le temps.",
        ),
        card(
          "Le passage du temps",
          "Provisions, contrats et événements mondiaux changent à minuit UTC. Les raids ont un délai glissant de 24 heures entre deux tentatives. Les combats et groupes persistent dans les sauvegardes PostgreSQL.",
        ),
      ];
  }
}

export function buildView(result, owner) {
  const { p, now = Date.now(), message } = result;
  const s = p ? statsOf(p) : null;
  const screen = {
    title: "Les Chroniques de Brumeterre",
    subtitle: "Les routes se souviennent de vos pas.",
    tone: "gold",
    cards: [],
    portrait: result.appearance?.portrait ?? DEFAULT_PORTRAIT,
    banner: result.appearance?.banner,
    frame: result.appearance?.frame,
    decoration: result.appearance?.decoration,
    background:
      SOCIAL_TYPES.has(result.type) ||
      [
        "request",
        "blocked",
        "guildRoster",
        "cityDefensePlan",
        "confirmSocial",
      ].includes(result.type) ||
      (result.type === "confirm" &&
        [
          "friendRemove",
          "blockPlayer",
          "guildKick",
          "cityWarToggle",
          "citySiege",
          "guildLeave",
          "partyLeave",
          "raid",
        ].includes(result.kind))
        ? "social"
        : [
              "market",
              "listing",
              "inventory",
              "resources",
              "item",
              "crafting",
              "recipe",
              "store",
              "shopDetail",
            ].includes(result.type)
          ? "market"
          : ["info", "codex"].includes(result.type)
            ? "info"
            : "profile",
    ...(message ? { notice: message } : {}),
  };
  const components = [];
  const panel = () => {
    if (result.appearance?.earnedTitle && ["profile", "publicProfile", "playerCard"].includes(result.type))
      screen.cards.push(card("Distinction", result.appearance.earnedTitle, { accent: "gold" }));
    return { screen, components: compactMenus(components, owner, Boolean(result.public)) };
  };
  const id = (...args) =>
    result.public ? publicId(...args) : uiId(owner, ...args);
  const btn = (
    label,
    action,
    args = [],
    { style = 2, disabled = false } = {},
  ) => ({ type: 2, custom_id: id(action, ...args), label, style, disabled });
  let navSequence = 0;
  // Un même onglet peut aussi servir de bouton retour : Discord exige des
  // identifiants distincts dans un message, tout en gardant une route autonome.
  const nav = (label, view, ...args) =>
    btn(label, "nav", [view, args[0] ?? 1, args[1] ?? "", `n${navSequence++}`]);
  const act = (label, action, ...args) =>
    btn(label, "do", [action, ...args], { style: 1 });
  const select = (action, placeholder, options, ...args) =>
    options.length
      ? row({
          type: 3,
          custom_id: id(action, ...args),
          placeholder,
          min_values: 1,
          max_values: 1,
          options,
        })
      : null;
  const push = (component) => {
    if (component) components.push(component);
  };
  const footer = () =>
    push(
      row(
        nav("◈ Profil", "profile"),
        nav("♜ Social", "social"),
        nav("⚖ Marché", "market"),
        nav("✧ Info", "info"),
      ),
    );
  const back = (view, label = "← Retour") => push(row(nav(label, view)));
  const pages = (page, count, view, flag = "") => {
    if (count > 1)
      push(
        row(
          btn("← Précédent", "nav", [view, page - 1, flag], {
            disabled: page <= 1,
          }),
          btn(`${page} / ${count}`, "nav", [view, page, flag], {
            disabled: true,
          }),
          btn("Suivant →", "nav", [view, page + 1, flag], {
            disabled: page >= count,
          }),
        ),
      );
  };
  const vitals = () => {
    screen.metrics = [
      {
        label: "Vie",
        value: `${p.hp} / ${s.hp}`,
        current: p.hp,
        max: s.hp,
        color: "red",
      },
      {
        label: "Mana",
        value: `${p.mana} / ${s.mana}`,
        current: p.mana,
        max: s.mana,
        color: "blue",
      },
      {
        label: "Énergie",
        value: `${p.energy} / 100`,
        current: p.energy,
        max: 100,
        color: "green",
      },
    ];
  };
  const wallet = () => {
    screen.metrics = [
      { label: "Or au coffre", value: `${p.gold} pièces` },
      { label: "Équipements", value: `${p.gear.length} / 100` },
      { label: "Or exposé", value: `${p.bag.gold} pièces`, color: "red" },
    ];
  };

  if (p && ["inventory", "item"].includes(result.type)) screen.equipment = {
    avatar: result.appearance?.avatar ?? raceBody(p.raceId), name: p.name, race: RACES[p.raceId].name,
    slots: Object.entries(slotName).map(([slot, label]) => ({ slot, label,
      item: p.gear.find((i) => i.id === p.equipment[slot]) ?? null })),
  };
  if (buildAdventureView(result, owner, { screen, card, row, push, nav, btn, select, choice, statText })) {
    footer(); return panel();
  }

  if (buildPublicView(result, { screen, card, row, push }))
    return panel();
  if (
    buildSocialView(result, owner, {
      screen,
      card,
      row,
      choice,
      btn,
      nav,
      act,
      push,
      select,
      pages,
      back,
      id,
    })
  ) {
    footer();
    return panel();
  }
  switch (result.type) {
    case "customize": {
      const c = p.customization;
      screen.title = "Personnalise ton personnage";
      screen.subtitle = `${p.name} · portrait, bannière et histoire`;
      screen.cards = [
        card(
          c.title || "Ton titre ou ta devise",
          c.bio ||
            "Raconte l’histoire de ton héros. Ton titre et ta description seront visibles sur ton profil public.",
        ),
        card(
          "Ton portrait",
          `${c.portrait ? "Portrait personnel enregistré." : "Portrait d’aventurier par défaut."}\nIl apparaît en haut à droite des réponses. Choisis une image carrée ; le recadrage est centré.`,
        ),
        card(
          "Ta bannière",
          `${c.banner ? "Bannière personnelle enregistrée." : "Décor de Brumeterre par défaut."}\nChoisis une image large, idéalement au format 4:1. Elle habille l’en-tête de ton profil.`,
        ),
        card("Ton avatar d’équipement", `${c.avatar ? "Image personnelle enregistrée." : `Silhouette de ta race : ${RACES[p.raceId].name}.`}\nCette image apparaît au centre du coffre. L’arme, l’armure et le talisman restent autour, avec leurs noms et leurs icônes.`),
        card(
          "Importer tes images",
          "Envoie un fichier directement dans le formulaire Discord : PNG, JPG ou WebP fixe, 5 Mo maximum, 4096 pixels par côté au maximum. Les images restent sauvegardées après redémarrage.",
        ),
      ];
      push(
        row(
          btn("Changer mon portrait", "form", ["portraitUpload"]),
          btn("Changer ma bannière", "form", ["bannerUpload"]),
          btn("Changer mon avatar d’équipement", "form", ["avatarUpload"]),
          btn("Titre et description…", "form", ["profileText"]),
        ),
      );
      push(
        row(
          btn("Retirer le portrait", "do", ["customizeReset", "portrait"], {
            disabled: !c.portrait,
          }),
          btn("Retirer la bannière", "do", ["customizeReset", "banner"], {
            disabled: !c.banner,
          }),
          btn("Effacer les textes", "do", ["customizeReset", "text"], {
            disabled: !c.title && !c.bio,
          }),
          btn("Avatar de ma race", "do", ["customizeReset", "avatar"], { disabled: !c.avatar }),
        ),
      );
      push(
        row(
          btn("Voir mon profil public", "viewProfile", [owner]),
          nav("Retour au carnet", "profile"),
          nav("Titres, cadres et exploits", "honors"),
        ),
      );
      break;
    }
    case "welcome":
      screen.title = "La Brume t’attend";
      screen.subtitle =
        "Un nouveau nom s’apprête à entrer dans les chroniques.";
      screen.cards = [
        card(
          "Écris ton premier serment",
          "Choisis ton peuple et ta classe, puis donne un nom à ton aventurier. Tes provisions et ton premier équipement t’attendent au refuge.",
        ),
        card(
          "Un monde à partager",
          "12 régions à explorer. Un refuge à bâtir. Un marché entre amis. Des guildes et des raids à plusieurs.\nCommence ton voyage avec le bouton ci-dessous.",
        ),
      ];
      push(
        row(
          nav("Créer mon aventurier", "creationRace"),
          nav("Découvrir le monde", "info"),
        ),
      );
      break;
    case "creationRace":
      screen.title = "Choisis ton peuple";
      screen.subtitle = "Création du personnage · étape 1 sur 3";
      screen.cards = [
        card(
          "Ton héritage",
          "Chaque peuple possède ses bonus et un bâtiment exclusif. Toutes les classes restent accessibles, quel que soit ton choix.",
        ),
        card(
          "Une origine, ton histoire",
          "Des elfes des forêts aux demi-dragons, des nains aux revenants : seize origines pour écrire ton propre récit. Consulte Info → Peuples pour les détails.",
        ),
      ];
      push(
        select(
          "race",
          "Choisir mon peuple",
          Object.entries(RACES).map(([key, r]) =>
            choice(key, `${r.emoji} ${r.name}`, statText(r.bonuses)),
          ),
        ),
      );
      back("welcome");
      break;
    case "creationClass": {
      const race = RACES[result.raceId];
      screen.title = `${race.name} · ta vocation`;
      screen.subtitle = "Création du personnage · étape 2 sur 3";
      screen.cards = [
        card(race.name, `${race.lore}\n${statText(race.bonuses)}`),
        card(
          BUILDINGS[race.building].name,
          BUILDINGS[race.building].description,
        ),
        card(
          "Choisis ta classe",
          "Chaque classe a ses statistiques et une compétence active. Tu peux consulter leurs détails dans l’encyclopédie avant de choisir.",
        ),
      ];
      push(
        select(
          "class",
          "Choisir ma classe",
          Object.entries(CLASSES).map(([key, c]) =>
            choice(key, `${c.emoji} ${c.name}`, `${c.role} · ${c.skill.name}`),
          ),
          result.raceId,
        ),
      );
      back("creationRace", "← Changer de peuple");
      break;
    }
    case "creationReview": {
      const race = RACES[result.raceId],
        cls = CLASSES[result.classId];
      screen.title = "Ton premier serment";
      screen.subtitle = `${race.name} · ${cls.name} · étape 3 sur 3`;
      screen.cards = [
        card(race.name, `${race.lore}\n${statText(race.bonuses)}`),
        card(
          cls.name,
          `${cls.role}\n${statText(cls.stats)}\n${cls.skill.name} : ${cls.skill.text}`,
        ),
        card(
          "Il ne manque que ton nom",
          "Nomme ton aventurier pour commencer. Tu pourras changer de race ou de classe plus tard avec les sceaux du marchand.",
        ),
        card(
          "Le sac du départ",
          "150 pièces d’or, des matériaux de construction, des potions, de l’éther et une arme équipée. Le refuge est prêt à t’accueillir.",
        ),
      ];
      push(
        row(
          btn(
            "Nommer et créer mon héros",
            "form",
            ["create", result.raceId, result.classId],
            { style: 3 },
          ),
          btn("← Changer de classe", "classes", [result.raceId]),
        ),
      );
      break;
    }
    case "profile": {
      screen.title = p.name;
      screen.subtitle = `${RACES[p.raceId].name} · ${specializationOf(p)?.name ?? CLASSES[p.classId].name} · niveau ${p.level}${p.bosses.includes(11) ? " · Briseur de Brume" : ""}`;
      if (p.customization?.title)
        screen.subtitle += ` · ${p.customization.title}`;
      vitals();
      screen.cards = [
        card(
          "Ton aventure",
          `${p.location === "base" ? "Au refuge" : ZONES[p.zone].name}\n${p.bosses.length} / 12 gardiens vaincus · ${p.kills} victoires\nExpérience : ${p.xp} / ${xpRequired(p.level)}\nPoints de talent disponibles : ${p.talentPoints}`,
        ),
        card(
          "Ton armement",
          `${s.attack} attaque · ${s.defense} défense\n${s.power} puissance · ${Math.round(s.crit * 100)} % critiques\nCoffre : ${p.gold} or\nSac d’expédition : ${p.bag.gold} or`,
        ),
        card(
          skillOf(p).name,
          `${skillOf(p).text}\n${skillOf(p).cost} mana · un tour sur deux`,
        ),
        card(worldEvent(now).name, worldEvent(now).description, {
          accent: "green",
        }),
      ];
      push(
        row(
          nav(
            p.battle ? "⚔ Reprendre le combat" : "⚔ Partir à l’aventure",
            "campaign",
          ),
          nav("⌂ Mon refuge", "base"),
          nav("Talents", "talents"),
          nav("Spécialisations", "specializations"),
        ),
      );
      push(
        row(
          nav("Contrats du jour", "quests"),
          act("Récupérer les provisions", "daily"),
          nav("Compagnons", "social"),
          nav("Voir les profils", "directory"),
          nav("Mes exploits", "honors"),
        ),
      );
      push(
        row(
          nav("Personnalisation du profil", "customize"),
          btn("Voir mon profil public", "viewProfile", [owner]),
          nav("Changer de classe ou de race", "identity"),
        ),
      );
      if (p.customization?.bio)
        screen.cards.push(card("Ton histoire", p.customization.bio));
      break;
    }
    case "map": {
      screen.title = "Les routes de Brumeterre";
      screen.subtitle = `Progression de la communauté · page ${result.page ?? 1} / ${result.pages ?? 1}`;
      const travelers = result.travelers ?? [campaignMarker(p)];
      screen.campaignMap = {
        stages: ZONES.map((z) => ({
          id: z.id, name: z.name, level: z.level,
          unlocked: z.id <= p.unlockedZone, cleared: p.bosses.includes(z.id),
          current: p.location === "campaign" && z.id === p.zone,
        })),
        travelers: travelers.map((v) => ({ ...v,
          portrait: result.appearance?.travelers?.[v.id] ?? DEFAULT_PORTRAIT,
        })),
      };
      screen.cards = travelers.map((v, index) => card(
        `${v.name}${v.id === p.id ? " · Toi" : ""}`,
        `${v.completed ? "Campagne terminée" : `Étape ${v.stage + 1} · ${ZONES[v.stage].name}`}\nNiveau ${v.level} · ${v.location}${v.inBattle ? " · En combat" : ""}`,
        { accent: index === 0 ? "gold" : "blue" },
      ));
      if (!p.battle) push(
        select(
          "zone",
          "Voyager vers une région accessible",
          ZONES.filter((z) => z.id <= p.unlockedZone && z.level <= p.level).map(
            (z) => choice(z.id, z.name, `Niveau ${z.level} · ${z.biome}`),
          ),
        ),
      );
      pages(result.page ?? 1, result.pages ?? 1, "map");
      back("campaign", "← Mon expédition");
      screen.footer = "Portraits et noms = progression maximale. Revenir chasser ou rentrer conserve cette progression.";
      break;
    }
    case "encounters": {
      const z = ZONES[p.zone];
      screen.title = `Choisis ton adversaire`;
      screen.subtitle = `${z.name} · 5 énergie par combat · aucun combat automatique`;
      vitals();
      screen.cards = z.enemies.map((_, index) => {
        const e = campaignEnemy(z, index), elite = campaignEnemy(z, index, { elite: true });
        return card(e.name,
          `Niv. ${e.level} · ${e.hp} PV · ${e.attack} attaque · ${e.defense} défense\n${traitOf(e)?.name} : ${traitOf(e)?.text}\nÉlite : niv. ${elite.level} · ${elite.hp} PV\nButin : ${plainText(RESOURCES[z.resource])}, pierre et or.`,
          { portrait: enemyPortrait(e.name) });
      });
      const ready = guardianReady(p), boss = campaignEnemy(z, 0, { boss: true });
      screen.cards.push(card(boss.name,
        `${ready ? "Disponible quand tu veux" : `${p.zoneWins[p.zone] ?? 0} / ${VICTORIES_FOR_BOSS} victoires de progression`}\nNiv. ${boss.level} · ${boss.hp} PV · ${boss.attack} attaque\nLa chasse ne fait pas avancer le gardien. XP et butin restent acquis ; le sac reste exposé.`,
        { portrait: enemyPortrait(boss.name), accent: ready ? "gold" : "red" }));
      const options = z.enemies.flatMap((name, index) => [
        choice(`normal|${index}`, name, `Niv. ${z.level} · ${campaignEnemy(z, index).hp} PV`),
        choice(`elite|${index}`, `Élite · ${name}`, `Niv. ${z.level + 1} · plus difficile, récompenses ×1,6`),
      ]);
      if (p.energy >= 5) {
        push(select("encounter", "Avancer en campagne · choisir · 5 énergie",
          [...options, ...(ready ? [choice("boss|0", `Gardien · ${z.boss}`, "Vaincs-le pour ouvrir la prochaine route")] : [])],
          "progress", p.zone));
        push(select("encounter", "Chasser sans avancer · choisir · 5 énergie", options, "farm", p.zone));
      } else screen.notice = "Il faut 5 énergie pour lancer un combat. Tu récupères 1 énergie toutes les 5 minutes.";
      push(row(nav("← Mon expédition", "campaign"), nav("Changer de région", "map")));
      break;
    }
    case "campaign": {
      const z = ZONES[p.zone],
        b = p.battle;
      vitals();
      screen.tone = b ? "red" : "green";
      if (b) {
        const e = b.enemy;
        if (!message && b.log?.length) screen.notice = b.log.join("\n");
        screen.title = e.name;
        screen.subtitle = `Tour ${b.turn} · niveau ${e.level}${e.boss ? " · Gardien de région" : e.elite ? " · Élite" : ""}${b.mode === "farm" ? " · Chasse aux ressources" : " · Progression"}`;
        screen.cards = [
          card(
            "Face à toi",
            `Vie : ${e.hp} / ${e.maxHp}\n${e.attack} attaque · ${Math.round(e.defense)} défense${traitOf(e) ? `\n${traitOf(e).name} : ${traitOf(e).text}` : ""}${e.boss && e.hp < e.maxHp * 0.4 ? "\nLe gardien est enragé !" : ""}`,
            { accent: "red", portrait: enemyPortrait(e.name) },
          ),
          card(
            "Son prochain mouvement",
            b.turn % 3 === 0
              ? "Frappe lourde imminente !\nTe défendre bloque 70 % des dégâts et rend 10 mana."
              : "L’ennemi prépare son attaque.\nAttaque pour regagner du mana, ou utilise ta compétence.",
          ),
          card(
            skillOf(p).name,
            `${skillOf(p).cost} mana · ${b.turn >= b.skillReady ? "disponible" : "en récupération"}\n${skillOf(p).text}`,
          ),
          card(
            "Ton sac reste exposé",
            `${p.bag.gold} or · ${p.bag.gear.length} équipement(s)\nFuir coûte 25 % de l’or du sac. ${b.mode === "farm" ? "La chasse conserve le compteur du gardien, même en cas de fuite ou de défaite." : "Fuir ou perdre remet le compteur du gardien à zéro."}`,
          ),
        ];
        const fight = (move, label, disabled = false, style = 1) =>
          btn(label, "fight", [move, b.id, b.turn], { disabled, style });
        push(
          row(
            fight("attack", "⚔ Attaquer"),
            fight(
              "skill",
              "✧ Compétence",
              b.turn < b.skillReady || p.mana < skillOf(p).cost,
            ),
            fight("guard", "◈ Défendre", false, 2),
          ),
        );
        push(
          row(
            fight(
              "potion",
              `Soin (${p.resources.potion ?? 0})`,
              !p.resources.potion,
              2,
            ),
            fight(
              "ether",
              `Éther (${p.resources.ether ?? 0})`,
              !p.resources.ether,
              2,
            ),
            fight("flee", "Fuir", false, 4),
          ),
        );
      } else if (p.location === "base") {
        screen.title = "L’appel de l’aventure";
        screen.subtitle = "Tu es au refuge. Prépare-toi, puis prends la route.";
        screen.cards = [
          card(
            "La prochaine route",
            ZONES[Math.min(p.unlockedZone, ZONES.length - 1)].story,
          ),
          card(
            "Les provisions avant le départ",
            `Potions : ${p.resources.potion ?? 0} · Éthers : ${p.resources.ether ?? 0}\nUn pas dans la Brume coûte 5 énergie. Reviens au refuge pour sécuriser le butin.`,
          ),
        ];
        push(
          row(
            nav("Ouvrir la carte", "map"),
            nav("Préparer mon coffre", "inventory"),
            nav("Me ressourcer", "base"),
          ),
        );
      } else {
        screen.title = z.name;
        screen.subtitle = `Expédition en cours · ${Math.min(VICTORIES_FOR_BOSS, p.zoneWins[p.zone] ?? 0)} / ${VICTORIES_FOR_BOSS} victoires vers le gardien`;
        screen.cards = [
          card("La chronique", z.story),
          card(
            "Ton sac d’expédition",
            `${p.bag.gold} or · ${p.bag.gear.length} équipement(s)\n${resourceText(p.bag.resources)}`,
            { accent: "gold" },
          ),
          card(
            guardianReady(p) ? "Le gardien t’attend" : "Avancer ou chasser ?",
            "Choisis ton ennemi et son niveau de difficulté. Avancer débloque le gardien après deux victoires ; Chasser donne du butin sans faire avancer ce compteur. Tu peux répéter un ennemi aussi longtemps que tu veux, dans la limite de ton énergie et de tes PV.",
          ),
          card(
            "Le risque de la Brume",
            "En cas de défaite, la moitié de l’or et des matériaux du sac est sauvée. Les équipements du sac sont perdus. Ton coffre et tes objets portés restent protégés.",
          ),
        ];
        push(
          row(
            nav("Choisir un ennemi", "encounters"),
            btn("Rentrer et sécuriser", "do", ["returnHome"], { style: 3 }),
            nav("Carte", "map"),
          ),
        );
        if (p.hunt?.zoneId === p.zone) push(row(btn(
          "Chasser le même ennemi · 5 énergie", "huntAgain",
          [p.zone, p.hunt.enemyIndex, p.hunt.elite ? "elite" : "normal"],
          { style: 1, disabled: p.energy < 5 },
        )));
      }
      break;
    }
    case "base":
      screen.title = `Le refuge de ${p.name}`;
      screen.subtitle = `${p.gold} or au coffre · trois emplacements pour façonner ton domaine`;
      vitals();
      screen.tone = "green";
      screen.cards = p.buildings.map((b, i) =>
        card(
          `Emplacement ${i + 1} · ${b ? BUILDINGS[b.type].name : "Terrain libre"}`,
          b
            ? `Niveau ${b.level} / 5\n${activeBuilding(p, b) ? BUILDINGS[b.type].description : "INACTIF : réservé à ton ancien peuple. Aucun bonus ni production."}`
            : "Choisis cet emplacement pour consulter les plans et construire ton premier bâtiment.",
        ),
      );
      screen.cards.push(
        card(
          "Ton héritage",
          `${BUILDINGS[RACES[p.raceId].building].name}\n${BUILDINGS[RACES[p.raceId].building].description}`,
        ),
      );
      push(
        select(
          "slot",
          "Gérer un emplacement de bâtiment",
          p.buildings.map((b, i) =>
            choice(
              i + 1,
              `Emplacement ${i + 1} · ${b ? BUILDINGS[b.type].name : "libre"}`,
            ),
          ),
        ),
      );
      push(
        row(
          act("Récolter la production", "collect"),
          act(
            `Repos · ${Math.ceil((8 + p.level * 3) * (p.buildings.some((b) => b?.type === "infirmerie") ? 0.5 : 1))} or`,
            "rest",
          ),
        ),
      );
      break;
    case "slot": {
      const b = p.buildings[result.slot - 1];
      screen.title = `Refuge · emplacement ${result.slot}`;
      if (b) {
        const next = buildingCost(b.level + 1);
        screen.subtitle = `${BUILDINGS[b.type].name} · niveau ${b.level} / 5`;
        screen.cards = [
          card(BUILDINGS[b.type].name, activeBuilding(p, b) ? BUILDINGS[b.type].description : "Bâtiment conservé mais inactif pour ta race actuelle. Aucun bonus ni production."),
          card(
            b.level < 5 ? "Prochain niveau" : "Œuvre achevée",
            b.level < 5
              ? costText(next.gold, next.resources)
              : "Ce bâtiment a atteint son niveau maximal.",
          ),
          card(
            "Libérer le terrain",
            "Démolir rembourse 50 % de l’or investi. Les matériaux ne sont pas remboursés. La production accumulée reste récupérable.",
          ),
        ];
        push(
          row(
            btn(
              "Améliorer le bâtiment",
              "do",
              ["upgradeBuilding", result.slot],
              { style: 1, disabled: b.level >= 5 },
            ),
            btn("Démolir…", "confirm", ["demolish", result.slot], { style: 4 }),
          ),
        );
      } else {
        screen.subtitle = "Un terrain libre pour ton prochain bâtiment.";
        screen.cards = [
          card(
            "Une construction utile",
            "Les bonus des bâtiments restent actifs pendant tes aventures. Les bâtiments de production travaillent même lorsque tu es absent.",
          ),
          card(
            "Les plans disponibles",
            "Les bâtiments communs sont accessibles à tous. Ton peuple possède aussi un bâtiment exclusif. Un seul exemplaire de chaque bâtiment par refuge.",
          ),
        ];
        push(
          select(
            "building",
            "Choisir un bâtiment à construire",
            Object.entries(BUILDINGS)
              .filter(
                ([key, v]) =>
                  (!v.races.length || v.races.includes(p.raceId)) &&
                  !p.buildings.some((b) => b?.type === key),
              )
              .map(([key, v]) => choice(key, v.name, v.description)),
            result.slot,
          ),
        );
      }
      back("base", "← Au refuge");
      break;
    }
    case "building": {
      const b = BUILDINGS[result.buildingId],
        cost = buildingCost(1);
      screen.title = b.name;
      screen.subtitle = `Construction · emplacement ${result.slot}`;
      screen.cards = [
        card("Les avantages", b.description),
        card("Coût de construction", costText(cost.gold, cost.resources)),
        card(
          "Un domaine à ton image",
          "Ce bâtiment occupera l’un de tes trois emplacements. Tu pourras ensuite l’améliorer jusqu’au niveau 5 ou le démolir.",
        ),
      ];
      push(
        row(
          btn("Construire", "do", ["build", result.slot, result.buildingId], {
            style: 3,
          }),
          btn("← Autres plans", "slot", [result.slot]),
        ),
      );
      break;
    }
    case "talents":
      screen.title = "La voie du héros";
      screen.subtitle = `${p.talentPoints} point(s) à investir · un point par niveau gagné`;
      screen.cards = [
        card(
          "Force",
          `+2 attaque par point\nPoints investis : ${p.talents.attack}`,
        ),
        card(
          "Robustesse",
          `+2 défense par point\nPoints investis : ${p.talents.defense}`,
        ),
        card(
          "Arcanes",
          `+2 puissance par point\nPoints investis : ${p.talents.power}`,
        ),
        card(
          "Vitalité",
          `+10 PV par point\nPoints investis : ${p.talents.vitality}`,
        ),
      ];
      push(
        row(
          ...[
            ["attack", "Force +2"],
            ["defense", "Défense +2"],
            ["power", "Puissance +2"],
            ["vitality", "Vie +10"],
          ].map(([key, label]) =>
            btn(label, "do", ["talent", key], {
              style: 1,
              disabled: !p.talentPoints || p.location !== "base",
            }),
          ),
        ),
      );
      break;
    case "quests":
      screen.title = "Les contrats du jour";
      screen.subtitle = `${p.quests.day} · renouvellement à minuit UTC`;
      screen.cards = DAILY_QUESTS.map((q) =>
        card(
          `${p.quests.claimed.includes(q.id) ? "Accompli · " : ""}${q.name}`,
          `${Math.min(q.target, p.quests[q.id])} / ${q.target}\nRécompense : ${q.gold} or et ${q.xp} XP`,
          { accent: p.quests[q.id] >= q.target ? "green" : "gold" },
        ),
      );
      screen.cards.push(
        card(
          "Les provisions du refuge",
          "Un cadeau par jour : or, potions, matériaux et énergie. Maintiens ta série pour augmenter la récompense, jusqu’à sept jours.",
        ),
      );
      push(
        row(
          ...DAILY_QUESTS.map((q) =>
            btn(q.name, "do", ["claimQuest", q.id], {
              style: 3,
              disabled:
                p.quests[q.id] < q.target || p.quests.claimed.includes(q.id),
            }),
          ),
        ),
      );
      push(row(act("Recevoir mes provisions", "daily")));
      break;
    case "market": {
      screen.title = result.mine
        ? "Tes étals à la Halle"
        : "La Halle des routes";
      screen.subtitle = `Marché entre joueurs · page ${result.page} / ${result.pages} · prix du lot entier`;
      wallet();
      screen.cards = result.listings.map((l) =>
        card(
          l.item
            ? plainText(gearLabel(l.item))
            : `${l.quantity} ${plainText(RESOURCES[l.resource])}`,
          `${l.price} or le lot\nVendeur : ${l.sellerName}${l.item ? `\nNiv. ${l.item.level} · ${statText(l.item.stats)}` : ""}\nExpire dans ${Math.max(1, Math.ceil((l.expiresAt - now) / 86400000))} jour(s)`,
          {
            tag:
              l.sellerId === owner
                ? "Ton annonce · retrait possible"
                : "Sélectionne pour consulter et acheter",
          },
        ),
      );
      if (!screen.cards.length)
        screen.cards = [
          card(
            "Les étals attendent vos trouvailles",
            "Publie des matériaux depuis Ressources, ou un équipement depuis Coffre. Les autres joueurs pourront acheter tes lots ici.",
          ),
          card(
            "Le marchand du refuge",
            "Besoin de provisions tout de suite ? Le marchand vend potions, éthers et matériaux courants. Les équipements et trésors rares viennent des aventuriers.",
          ),
        ];
      push(
        row(
          nav("Coffre", "inventory"),
          nav("Ressources / vendre", "resources"),
          nav("Atelier", "crafting"),
          nav("Marchand", "store"),
        ),
      );
      push(
        select(
          "listing",
          "Consulter un lot et son prix",
          result.listings.map((l) =>
            choice(
              l.id,
              `${l.item ? plainText(gearLabel(l.item)) : `${l.quantity} ${plainText(RESOURCES[l.resource])}`} · ${l.price} or`,
              l.sellerId === owner
                ? "Ton annonce"
                : `Vendeur : ${l.sellerName}`,
            ),
          ),
        ),
      );
      push(
        row(
          btn(
            "←",
            "nav",
            ["market", result.page - 1, result.mine ? "mine" : ""],
            { disabled: result.page <= 1 },
          ),
          nav(
            result.mine ? "Tout le marché" : "Mes annonces",
            "market",
            1,
            result.mine ? "" : "mine",
          ),
          btn(
            "→",
            "nav",
            ["market", result.page + 1, result.mine ? "mine" : ""],
            { disabled: result.page >= result.pages },
          ),
        ),
      );
      break;
    }
    case "listing": {
      const l = result.listing;
      screen.title = "Un lot à la Halle";
      screen.subtitle = `${l.price} or pour le lot entier · vendeur : ${l.sellerName}`;
      wallet();
      screen.cards = [
        l.item
          ? gearCard(l.item)
          : card(
              "Contenu du lot",
              `${l.quantity} ${plainText(RESOURCES[l.resource])}`,
            ),
        card(
          "Les termes de l’échange",
          `Prix total : ${l.price} or\nLe lot sera transféré dans ton coffre.\nLe vendeur reçoit ${l.price - Math.ceil(l.price * 0.05)} or après commission.`,
        ),
      ];
      push(
        row(
          btn(
            l.sellerId === owner
              ? "Retirer mon annonce"
              : `Acheter · ${l.price} or`,
            "do",
            [l.sellerId === owner ? "cancelListing" : "buy", l.id],
            { style: 3 },
          ),
          nav("← Autres annonces", "market"),
        ),
      );
      break;
    }
    case "inventory": {
      const page = pageOf(p.gear, result.page, 6);
      screen.title = "Le coffre du refuge";
      screen.subtitle = `Équipement · page ${page.page} / ${page.pages} · tes objets portés entourent ton avatar`;
      wallet();
      screen.cards = page.entries.map((item) =>
        gearCard(item, Object.values(p.equipment).includes(item.id)),
      );
      if (!screen.cards.length)
        screen.cards = [
          card(
            "Un coffre à remplir",
            "Explore la campagne, visite le marché ou fabrique des équipements à l’atelier.",
          ),
        ];
      push(
        select(
          "item",
          "Choisir un objet : équiper, vendre, enchanter…",
          page.entries.map((i) =>
            choice(
              i.id,
              `${Object.values(p.equipment).includes(i.id) ? "◆ " : ""}${plainText(gearLabel(i))}`,
              `Niv. ${i.level} · ${slotName[i.slot]}`,
            ),
          ),
        ),
      );
      pages(page.page, page.pages, "inventory");
      push(
        row(
          nav("Ressources / vendre", "resources"),
          nav("Atelier", "crafting"),
          nav("Marchand", "store"),
        ),
      );
      break;
    }
    case "item": {
      const item = result.item,
        equipped = Object.values(p.equipment).includes(item.id);
      screen.title = plainText(gearLabel(item));
      screen.subtitle = `${slotName[item.slot]} · niveau ${item.level} requis · ${equipped ? "actuellement porté" : "dans le coffre"}`;
      wallet();
      screen.cards = [
        gearCard(item, equipped),
        card(
          "À ta mesure",
          `Ton niveau : ${p.level}\n${p.level >= item.level ? "Tu peux porter cet équipement." : `Atteins le niveau ${item.level} pour l’équiper.`}\nLes changements d’équipement se font au refuge.`,
        ),
        card(
          "Enchantement",
          `Amélioration actuelle : +${item.upgrade} / +5\n${item.upgrade < 5 ? `Prochain enchantement : ${80 * (item.upgrade + 1) ** 2} or, ${5 * (item.upgrade + 1)} fer, ${2 * (item.upgrade + 1)} essence.` : "Cet objet a atteint sa pleine puissance."}\nForge nécessaire, réussite garantie.`,
        ),
        card(
          "Une seconde vie",
          "Vends l’objet aux autres joueurs ou recycle-le en fer et en essence. Retire un objet porté avant de le vendre ou de le recycler.",
        ),
      ];
      push(
        row(
          btn(
            equipped ? "Déséquiper" : "Équiper",
            "do",
            [equipped ? "unequip" : "equip", equipped ? item.slot : item.id],
            {
              style: 1,
              disabled:
                p.location !== "base" || (!equipped && p.level < item.level),
            },
          ),
          btn("Enchanter", "do", ["enchant", item.id], {
            disabled:
              item.upgrade >= 5 ||
              p.location !== "base" ||
              !p.buildings.some((b) =>
                activeBuilding(p, b) && ["forge", "forge_ancestrale"].includes(b.type),
              ),
          }),
          btn("Vendre…", "form", ["sellItem", item.id], {
            disabled: equipped || p.location !== "base",
          }),
          btn("Recycler…", "confirm", ["salvage", item.id], {
            style: 4,
            disabled: equipped || p.location !== "base",
          }),
        ),
      );
      back("inventory", "← Au coffre");
      break;
    }
    case "resources": {
      screen.title = "La réserve du refuge";
      screen.subtitle = "Matériaux, consommables et lots à vendre";
      wallet();
      const entries = Object.entries(RESOURCES);
      screen.cards = [
        card(
          "Matériaux courants",
          resourceText(
            Object.fromEntries(
              entries.slice(0, 5).map(([key]) => [key, p.resources[key] ?? 0]),
            ),
          ),
        ),
        card(
          "Trésors & arcanes",
          resourceText(
            Object.fromEntries(
              entries.slice(5, 9).map(([key]) => [key, p.resources[key] ?? 0]),
            ),
          ),
        ),
        card(
          "Provisions",
          `Potions de soin : ${p.resources.potion ?? 0}\nÉthers : ${p.resources.ether ?? 0}\nInsignes de raid : ${p.resources.insigne ?? 0}`,
        ),
        card(
          "Publier une vente",
          "Choisis une ressource ci-dessous, puis sa quantité et le prix du lot entier. Commission de 5 % à la vente. L’annonce reste active 7 jours. Les insignes ne sont pas échangeables.",
        ),
      ];
      push(
        select(
          "sellResource",
          "Vendre une ressource ou un consommable…",
          entries
            .filter(([key]) => key !== "insigne" && p.resources[key] > 0)
            .map(([key, name]) =>
              choice(
                key,
                `${plainText(name)} · ${p.resources[key]} disponible(s)`,
              ),
            ),
        ),
      );
      push(
        row(
          btn("Boire une potion", "do", ["consume", "potion"], {
            disabled: p.hp >= s.hp || !p.resources.potion || Boolean(p.battle),
          }),
          btn("Boire un éther", "do", ["consume", "ether"], {
            disabled:
              p.mana >= s.mana || !p.resources.ether || Boolean(p.battle),
          }),
          nav("Au coffre", "inventory"),
        ),
      );
      break;
    }
    case "crafting":
      screen.title = "Le feu de l’atelier";
      screen.subtitle = "Alchimie, forge, talismans et reliques";
      wallet();
      screen.cards = [
        card(
          "Préparer ses provisions",
          "Fabrique des potions et de l’éther pour prolonger tes expéditions. Les ingrédients sont prélevés dans ton coffre.",
        ),
        card(
          "Façonner son équipement",
          "Les armes, armures et talismans sont fabriqués à ton niveau. Les recettes avancées demandent des matériaux de campagne et des insignes de raid.",
        ),
        card(
          "Améliorer ou recycler",
          "Choisis un équipement dans le coffre pour l’enchanter ou le recycler. Une forge construite au refuge permet les enchantements jusqu’à +5.",
        ),
      ];
      push(
        select(
          "recipe",
          "Choisir une recette à fabriquer",
          Object.entries(RECIPES).map(([key, r]) =>
            choice(
              key,
              r.name,
              `${r.gold} or · ${Object.entries(r.cost)
                .map(([k, n]) => `${n} ${plainText(RESOURCES[k])}`)
                .join(", ")}`,
            ),
          ),
        ),
      );
      back("inventory", "← Mon équipement");
      break;
    case "recipe": {
      const r = RECIPES[result.recipeId];
      screen.title = r.name;
      screen.subtitle = "Recette de l’atelier · coût pour un lot";
      wallet();
      screen.cards = [
        card("Les ingrédients", costText(r.gold, r.cost)),
        card(
          "Le résultat",
          r.slot
            ? `Un équipement ${RARITIES[r.rarity ?? 2].name.toLowerCase()} de niveau ${p.level}.\nSes statistiques sont générées selon sa rareté et son niveau.`
            : resourceText(r.output),
        ),
        card(
          "Tes réserves",
          Object.entries(r.cost)
            .map(
              ([key, n]) =>
                `${plainText(RESOURCES[key])} : ${p.resources[key] ?? 0} / ${n} requis`,
            )
            .join("\n"),
        ),
        card(
          "Préparer plusieurs lots",
          "Le formulaire te permet de choisir de 1 à 20 lots. Les coûts sont multipliés par le nombre de lots. La fabrication se fait au refuge.",
        ),
      ];
      push(
        row(
          btn("Fabriquer…", "form", ["craft", result.recipeId], {
            style: 3,
            disabled: p.location !== "base",
          }),
          nav("← Autres recettes", "crafting"),
        ),
      );
      break;
    }
    case "store": {
      const page = pageOf(Object.entries(SHOP), result.page);
      screen.title = "Le marchand du refuge";
      screen.subtitle = `Provisions courantes · page ${page.page} / ${page.pages}`;
      wallet();
      screen.cards = page.entries.map(([key, item]) =>
        card(
          plainText(RESOURCES[key]),
          `${item.price} or par unité\n${item.description}\nEn réserve : ${p.resources[key] ?? 0}`,
        ),
      );
      push(
        select(
          "shop",
          "Choisir une provision à acheter",
          page.entries.map(([key, item]) =>
            choice(
              key,
              `${plainText(RESOURCES[key])} · ${item.price} or / unité`,
            ),
          ),
        ),
      );
      pages(page.page, page.pages, "store");
      push(row(nav("Utiliser un sceau : classe ou race", "identity")));
      break;
    }
    case "shopDetail": {
      const product = SHOP[result.resource];
      screen.title = plainText(RESOURCES[result.resource]);
      screen.subtitle = "Le marchand du refuge";
      wallet();
      screen.cards = [
        card(
          "La provision",
          `${product.description}\nPrix : ${product.price} or par unité`,
        ),
        card(
          "Ton achat",
          `Tu en possèdes ${p.resources[result.resource] ?? 0}.\nChoisis une quantité de 1 à 100 dans le formulaire. Le coût total sera débité de ton coffre.`,
        ),
      ];
      push(
        row(
          btn("Acheter des provisions…", "form", ["shopBuy", result.resource], {
            style: 3,
            disabled: p.location !== "base",
          }),
          nav("← À l’étal", "store"),
        ),
      );
      break;
    }
    case "social":
      screen.title = "La table des compagnons";
      screen.subtitle = "Une bannière commune, des aventures à partager.";
      screen.cards = [
        card(
          "Les guildes",
          "Rassemble jusqu’à 30 amis. Contribuez au trésor et améliorez votre guilde pour renforcer les gains d’expérience de chacun.",
        ),
        card(
          "Les groupes de raid",
          "Réunissez 2 à 4 aventuriers pour affronter les grands périls. Le chef lance le combat, et chaque participant reçoit ses propres récompenses.",
        ),
        card(
          "Les cadeaux",
          "Offre de l’or, des matériaux ou des provisions à un autre aventurier. Il doit déjà posséder un personnage.",
        ),
        card(
          "Les chroniques des héros",
          "Comparez vos niveaux, vos victoires, les gardiens vaincus et les raids accomplis dans le classement du monde.",
        ),
      ];
      push(
        row(
          nav("Ma guilde", "guildInfo"),
          nav("Mon groupe", "partyInfo"),
          nav("Les héros", "leaderboard"),
        ),
      );
      push(row(btn("Offrir un cadeau", "giftTargetMenu")));
      break;
    case "giftOptions":
      screen.title = result.target
        ? `Un cadeau pour ${result.target.name}`
        : "Choisis un compagnon";
      screen.subtitle =
        "Un geste pour partager les richesses de tes aventures.";
      if (!result.target) {
        screen.cards = [
          card(
            "À qui souhaites-tu offrir un cadeau ?",
            "Sélectionne un membre du serveur. Son personnage doit déjà exister. Les cadeaux partent de ton coffre, depuis le refuge.",
          ),
        ];
        push(
          row({
            type: 5,
            custom_id: id("giftTarget"),
            placeholder: "Choisir un ami",
            min_values: 1,
            max_values: 1,
          }),
        );
      } else {
        screen.cards = [
          card(
            "Un don sans contrepartie",
            "Le cadeau sera ajouté immédiatement au coffre de ton ami. Vérifie le destinataire et la quantité avant de valider le formulaire.",
          ),
          card("Ton coffre", `${p.gold} or\n${resourceText(p.resources)}`),
        ];
        push(
          row(btn("Offrir de l’or…", "form", ["giftGold", result.target.id])),
        );
        push(
          select(
            "giftResource",
            "Offrir une ressource…",
            Object.entries(RESOURCES)
              .filter(([key]) => key !== "insigne" && p.resources[key] > 0)
              .map(([key, name]) =>
                choice(
                  key,
                  `${plainText(name)} · ${p.resources[key]} disponible(s)`,
                ),
              ),
            result.target.id,
          ),
        );
      }
      back("social", "← Aux compagnons");
      break;
    case "guild":
    case "guildPreview": {
      const g = result.guild;
      screen.tone = "purple";
      if (!g) {
        screen.title = "Une bannière à partager";
        screen.subtitle = "Tu n’appartiens pas encore à une guilde.";
        screen.cards = [
          card(
            "Fonder sa guilde",
            "La fondation coûte 200 or. Choisis un nom et invite tes amis à rejoindre ta bannière.",
          ),
          card(
            "Rejoindre des compagnons",
            "Parcours les guildes ouvertes ou saisis le code partagé par tes amis. Une guilde peut accueillir 30 membres.",
          ),
        ];
        push(
          row(
            btn("Fonder une guilde…", "form", ["guildCreate"]),
            nav("Guildes ouvertes", "guilds"),
            btn("Rejoindre par code…", "form", ["guildJoin"]),
          ),
        );
      } else {
        screen.title = g.name;
        screen.subtitle = `Guilde · niveau ${g.level} / 10 · ${g.members.length} / 30 membres · code ${g.id}`;
        screen.cards = [
          card(
            "Le trésor commun",
            `${g.gold} or\nBonus de campagne : +${g.level * 2} % XP\n${g.level < 10 ? `Prochaine amélioration : ${g.level * 500} or` : "Niveau maximal atteint."}`,
          ),
          card(
            "La bannière",
            `${g.leaderId === owner ? "Tu es le chef de cette guilde." : `Chef : ${result.members?.find((m) => m.id === g.leaderId)?.name ?? "un compagnon"}`}\nLes dons financent les améliorations. Il n’y a pas de retrait individuel.`,
          ),
        ];
        if (result.members?.length)
          screen.cards.push(
            card(
              "Les compagnons",
              result.members
                .slice(0, 6)
                .map((m) => `${m.name} · niveau ${m.level}`)
                .join("\n"),
            ),
          );
        screen.cards.push(
          card(
            "Le message de guilde",
            g.bulletin ?? "Bienvenue sous notre bannière.",
          ),
        );
        if (p.guildId === g.id)
          push(
            row(
              btn("Contribuer…", "form", ["guildDonate"]),
              btn("Améliorer la guilde", "do", ["guildUpgrade"], {
                style: 1,
                disabled: g.leaderId !== owner || g.level >= 10,
              }),
              btn("Quitter…", "confirm", ["guildLeave"], { style: 4 }),
              nav("Notre cité", "city"),
              btn("Message…", "form", ["guildBulletin"], {
                disabled: g.leaderId !== owner && !g.officers?.includes(owner),
              }),
            ),
          );
        else
          push(
            row(
              btn("Rejoindre cette guilde", "do", ["guildJoin", g.id], {
                style: 3,
                disabled: Boolean(p.guildId) || g.members.length >= 30,
              }),
            ),
          );
        push(
          row(
            nav("Autres guildes", "guilds"),
            ...(p.guildId === g.id
              ? [nav("Membres & officiers", "guildRoster")]
              : []),
          ),
        );
      }
      back("social", "← Aux compagnons");
      break;
    }
    case "guilds":
    case "parties": {
      const guilds = result.type === "guilds";
      screen.title = guilds
        ? "Les bannières de Brumeterre"
        : "Les groupes en recrutement";
      screen.subtitle = `Page ${result.page} / ${result.pages}`;
      screen.cards = result.entries.map((e) =>
        card(
          guilds ? e.name : RAIDS[e.raidId].name,
          guilds
            ? `Guilde niveau ${e.level}\n${e.members.length} / 30 membres\nBonus de campagne : +${e.level * 2} % XP`
            : `Niveau ${RAIDS[e.raidId].level} requis\n${e.members.length} / 4 aventuriers\nRejoindre autorise le chef à engager 20 de ton énergie.`,
        ),
      );
      if (!screen.cards.length)
        screen.cards = [
          card(
            "La table est encore libre",
            guilds
              ? "Aucune guilde ne recrute pour le moment. Tu peux fonder ta propre bannière."
              : "Aucun groupe adapté à ton niveau ne recrute. Crée ton groupe et invite tes amis.",
          ),
        ];
      push(
        select(
          guilds ? "guild" : "party",
          guilds ? "Consulter une guilde" : "Consulter un groupe",
          result.entries.map((e) =>
            choice(
              e.id,
              guilds
                ? e.name
                : `${RAIDS[e.raidId].name} · ${e.members.length}/4`,
            ),
          ),
        ),
      );
      pages(result.page, result.pages, result.type);
      back(guilds ? "guildInfo" : "partyInfo");
      break;
    }
    case "party":
    case "partyPreview": {
      const party = result.party;
      screen.title = "Le cercle des aventuriers";
      if (!party) {
        screen.subtitle = "Prépare un raid avec 2 à 4 amis.";
        screen.cards = RAIDS.map((r) =>
          card(
            r.name,
            `Niveau ${r.level} requis\n${r.story}\n20 énergie par tentative, délai de 24 h entre deux raids.`,
          ),
        );
        push(
          select(
            "raid",
            "Créer un groupe pour un raid",
            RAIDS.filter((r) => r.level <= p.level).map((r) =>
              choice(r.id, r.name, `Niveau ${r.level} · 2 à 4 aventuriers`),
            ),
          ),
        );
        push(
          row(
            nav("Groupes ouverts", "parties"),
            btn("Rejoindre par code…", "form", ["partyJoin"]),
          ),
        );
      } else {
        const r = RAIDS[party.raidId];
        screen.subtitle = `${r.name} · code du groupe ${party.id}`;
        screen.cards = [
          card("Votre cible", `Niveau ${r.level} · ${r.hp} PV\n${r.story}`),
          card(
            "La préparation",
            `${party.members.length} / 4 joueurs\n${party.leaderId === owner ? "Tu es le chef du groupe." : "Le chef pourra lancer le raid."}\nChacun doit être à la base avec 20 énergie et au moins 50 % de ses PV.\nDélai personnel de 24 h entre tentatives.`,
          ),
        ];
        if (result.members?.length)
          screen.cards.push(
            card(
              "Tes compagnons",
              result.members
                .map((m) => `${m.name} · niveau ${m.level}`)
                .join("\n"),
            ),
          );
        if (p.partyId === party.id)
          push(
            row(
              btn("Lancer le raid…", "confirm", ["raid"], {
                style: 1,
                disabled: party.leaderId !== owner || party.members.length < 2,
              }),
              btn("Quitter le groupe…", "confirm", ["partyLeave"], {
                style: 4,
              }),
            ),
          );
        else {
          screen.cards.push(
            card(
              "Ton engagement",
              "En rejoignant, tu autorises le chef à lancer le raid au nom du groupe. Le lancement engage 20 de ton énergie et déclenche ton délai de 24 heures, même en cas de défaite.",
            ),
          );
          push(
            row(
              btn("Accepter et rejoindre", "do", ["partyJoin", party.id], {
                style: 3,
                disabled: Boolean(p.partyId) || party.members.length >= 4,
              }),
            ),
          );
        }
        push(row(nav("Groupes ouverts", "parties")));
      }
      back("social", "← Aux compagnons");
      break;
    }
    case "raidPreview": {
      const r = RAIDS[result.raidId];
      screen.title = r.name;
      screen.subtitle = `Créer un groupe · niveau ${r.level} requis`;
      screen.cards = [
        card(
          "Le grand péril",
          `${r.story}\n${r.hp} PV · ${r.attack} attaque · ${r.defense} défense`,
        ),
        card(
          "Les récompenses",
          `${r.reward} or et ${r.reward * 2} XP par personne\nMatériaux, insignes et équipement rare ou épique.`,
        ),
        card(
          "Former le cercle",
          "Crée le groupe, puis invite tes amis à le retrouver dans les groupes ouverts. Un raid exige 2 à 4 joueurs, à la base, avec 20 énergie et au moins 50 % des PV.",
        ),
      ];
      push(
        row(
          btn("Créer ce groupe", "do", ["partyCreate", r.id], {
            style: 3,
            disabled: p.level < r.level || Boolean(p.partyId),
          }),
          nav("← Aux raids", "partyInfo"),
        ),
      );
      break;
    }
    case "raid":
      screen.title = result.boss.name;
      screen.subtitle = `${result.won ? "Victoire du groupe" : "Le groupe bat en retraite"} · ${result.turns} tours`;
      screen.tone = result.won ? "green" : "red";
      screen.cards = result.fighters.map((f) =>
        card(
          f.name,
          `${f.damage} dégâts infligés\n${f.healing} points de vie rendus\n${f.hp > 0 ? `${f.hp} PV au dernier tour` : "À terre à la fin du combat"}`,
        ),
      );
      back("partyInfo", "← Mon groupe");
      break;
    case "leaderboard":
      screen.title = "Les héros de Brumeterre";
      screen.subtitle = "Les dix aventuriers les plus avancés du monde.";
      screen.cards = result.leaders.map((v, i) =>
        card(
          `${i + 1}. ${v.name}`,
          `${CLASSES[v.classId].name} · niveau ${v.level}\n${v.bosses.length} / 12 gardiens · ${v.kills} victoires · ${v.raids} raids`,
        ),
      );
      back("social", "← Aux compagnons");
      break;
    case "info":
      screen.title = "Le Codex de Brumeterre";
      screen.subtitle = "Peuples, vocations et savoirs de l’ancien monde.";
      screen.cards = [
        card(
          "Les peuples & les classes",
          "16 peuples, 18 classes et toutes leurs combinaisons. Découvre les bonus, les compétences et les héritages raciaux avant de choisir ton héros.",
        ),
        card(
          "Les savoirs de l’atelier",
          "Alchimie, forge, enchantement et récolte : apprends à transformer les ressources de tes expéditions en équipement et en provisions.",
        ),
        card(
          "Les objets & le domaine",
          "Matériaux, consommables, raretés, bâtiments communs et constructions exclusives : les outils pour développer ton refuge.",
        ),
        card(
          "Les périls & les règles",
          "Comprends les combats, le risque des expéditions, l’économie, les guildes et les grands raids avant de prendre la route.",
        ),
      ];
      push(
        select(
          "chapter",
          "Ouvrir un chapitre du codex",
          Object.entries(chapterNames).map(([key, name]) => choice(key, name)),
        ),
      );
      break;
    case "codex": {
      const page = pageOf(codexEntries(result.category, p), result.page);
      screen.title = chapterNames[result.category] ?? chapterNames.regles;
      screen.subtitle = `Le Codex de Brumeterre · page ${page.page} / ${page.pages}`;
      screen.cards = page.entries;
      push(
        select(
          "chapter",
          "Changer de chapitre",
          Object.entries(chapterNames).map(([key, name]) => choice(key, name)),
        ),
      );
      if (page.pages > 1)
        push(
          row(
            btn("← Précédent", "codex", [result.category, page.page - 1], {
              disabled: page.page <= 1,
            }),
            btn(
              `${page.page} / ${page.pages}`,
              "codex",
              [result.category, page.page],
              { disabled: true },
            ),
            btn("Suivant →", "codex", [result.category, page.page + 1], {
              disabled: page.page >= page.pages,
            }),
          ),
        );
      break;
    }
    case "confirm": {
      const descriptions = {
        demolish: [
          "Libérer cet emplacement ?",
          "Le bâtiment sera démoli. Tu récupéreras 50 % de l’or investi, sans remboursement des matériaux. La production déjà accumulée reste récupérable.",
        ],
        salvage: [
          "Recycler cet équipement ?",
          `L’objet ${result.item ? plainText(gearLabel(result.item)) : ""} sera détruit et transformé en fer et en essence. Cette action est définitive.`,
        ],
        guildLeave: [
          "Quitter ta guilde ?",
          "Tes dons restent dans le trésor commun. Si tu es chef, le membre le plus ancien te succède. Une guilde vide est dissoute et son trésor disparaît.",
        ],
        partyLeave: [
          "Quitter le groupe ?",
          "Tu te retires du prochain raid. Si tu es chef, le membre le plus ancien prend la direction du groupe.",
        ],
        raid: [
          "Engager le raid ?",
          "Le groupe partira immédiatement. Chaque participant engagera 20 énergie et son délai personnel de 24 heures. Le combat se résout collectivement, avec récompenses individuelles en cas de victoire.",
        ],
        friendRemove: [
          "Retirer cet ami ?",
          "L’amitié sera retirée de vos deux listes. Tu pourras proposer une nouvelle demande plus tard.",
        ],
        blockPlayer: [
          "Fermer ces portes ?",
          "L’amitié et les demandes entre vous seront retirées. Les défis, invitations et cadeaux directs seront bloqués. Tu pourras débloquer ce joueur dans Social → Amis → Personnes bloquées.",
        ],
        guildKick: [
          "Exclure ce compagnon ?",
          "Le membre quittera la guilde et sa garde sera retirée. Ses dons restent au trésor commun.",
        ],
        cityWarToggle: [
          "Changer l’engagement de votre cité ?",
          "Activer les sièges permet aux autres cités volontaires de niveau proche de vous attaquer. Aucun coffre ne peut être pillé et aucun bâtiment n’est détruit. Après avoir attaqué, attendez six heures pour désactiver les sièges.",
        ],
        citySiege: [
          "Engager votre armée ?",
          "Le siège coûte 120 or du trésor et 15 énergie au commandant. Votre armée récupérera pendant six heures. La cité adverse aura six heures de protection ; les coffres et bâtiments restent protégés.",
        ],
      };
      const [title, description] = descriptions[result.kind];
      screen.title = title;
      screen.subtitle = "Prends un instant avant de confirmer.";
      screen.tone = "red";
      screen.cards = [
        card("Ce qui va se passer", description),
        card(
          "Ton choix",
          "Confirme uniquement si tu souhaites effectuer cette action. Tu peux revenir au menu sans rien modifier.",
        ),
      ];
      const backView = {
        demolish: "base",
        salvage: "inventory",
        guildLeave: "guildInfo",
        partyLeave: "partyInfo",
        raid: "partyInfo",
        friendRemove: "friends",
        blockPlayer: "friends",
        guildKick: "guildRoster",
        cityWarToggle: "city",
        citySiege: "cityTargets",
      }[result.kind];
      push(
        row(
          btn("Confirmer", "do", [result.kind, result.value ?? ""], {
            style: 4,
          }),
          nav("Annuler", backView),
        ),
      );
      break;
    }
    case "error":
      screen.title = "Une halte dans la Brume";
      screen.subtitle = "Ton histoire peut continuer.";
      screen.tone = "red";
      screen.notice = undefined;
      screen.cards = [
        card(
          "Le messager du refuge",
          message || "Rouvre ton profil pour retrouver ton carnet.",
        ),
        card(
          "Retrouver ton chemin",
          "Reviens à ton profil, au marché ou aux informations avec les boutons ci-dessous. Ton ancien panneau reste utilisable.",
        ),
      ];
      break;
    default:
      screen.title = "Le messager du refuge";
      screen.cards = [
        card(
          "Des nouvelles de ton aventure",
          message ?? "Ton carnet est à jour.",
        ),
      ];
  }
  if (["raid", "raidPreview"].includes(result.type) && screen.cards.length) {
    const boss = result.boss ?? RAIDS[result.raidId];
    if (boss) screen.cards[0].portrait = enemyPortrait(boss.name);
  }
  footer();
  return panel();
}

export async function render(result, owner) {
  const { screen, components } = buildView(result, owner);
  const panel = await drawPanel(screen);
  const description = plainText(
    `${screen.title}. ${screen.subtitle}. ${screen.notice ?? ""} ${screen.cards.map((c) => `${c.title} : ${c.text}`).join(" ")}`,
  ).slice(0, 1024);
  return {
    content: /^\d{17,20}$/.test(owner) ? `<@${owner}>` : "",
    embeds: [],
    attachments: [],
    files: [{ attachment: panel.buffer, name: "brumeterre.png", description }],
    components,
    allowedMentions: /^\d{17,20}$/.test(owner)
      ? { parse: [], users: [owner], repliedUser: false }
      : { parse: [] },
  };
}

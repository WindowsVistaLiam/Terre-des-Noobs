import { RACES, CLASSES, RESOURCES, ZONES, RAIDS } from "./content.js";

const choices = (entries) =>
  Object.entries(entries).map(([value, item]) => ({
    name: typeof item === "string" ? item : item.name,
    value,
  }));
const str = (name, description, required = false, values) => ({
  type: 3,
  name,
  description,
  required,
  ...(values ? { choices: values } : {}),
});
const int = (
  name,
  description,
  required = false,
  min = 1,
  max = 1_000_000,
) => ({ type: 4, name, description, required, min_value: min, max_value: max });
const user = (name, description, required = false) => ({
  type: 6,
  name,
  description,
  required,
});
const sub = (name, description, options = []) => ({
  type: 1,
  name,
  description,
  options,
});
const cmd = (name, description, options = []) => ({
  name,
  description,
  type: 1,
  dm_permission: false,
  options,
});
const resource = (required = true) =>
  str("ressource", "Ressource", required, choices(RESOURCES));
const item = (required = true) => ({
  ...str("objet", "Identifiant de l’équipement (voir /inventaire)", required),
  autocomplete: true,
});
const code = (name) => str("code", `Code de ${name}`, true);
const slot = () =>
  int("emplacement", "Emplacement de bâtiment, de 1 à 3", true, 1, 3);
export const commands = [
  cmd("jouer", "Ouvre ton carnet d’aventure"),
  cmd("creer", "Crée ton aventurier de Brumeterre", [
    str("nom", "Nom du personnage (2 à 24 caractères)", true),
    str("race", "Ton peuple et son héritage", true, choices(RACES)),
    str("classe", "Ta vocation et ta compétence", true, choices(CLASSES)),
  ]),
  cmd("profil", "Affiche un personnage", [
    user("joueur", "Un ami à découvrir"),
  ]),
  cmd("aide", "Premiers pas et commandes du jeu"),
  cmd("codex", "Feuillette les peuples, classes et secrets de Brumeterre", [
    str(
      "categorie",
      "Chapitre du codex",
      false,
      choices({
        races: "Peuples",
        classes: "Classes",
        batiments: "Bâtiments",
        recettes: "Recettes",
        raids: "Raids",
        regles: "Règles",
      }),
    ),
  ]),
  cmd("carte", "Découvre les douze régions et ta progression"),
  cmd("voyager", "Pars vers une région débloquée", [
    {
      type: 4,
      name: "zone",
      description: "Ta destination",
      required: true,
      choices: ZONES.map((z) => ({
        name: `${z.emoji} ${z.name} · niv. ${z.level}`,
        value: z.id,
      })),
    },
  ]),
  cmd("campagne", "Ouvre ton expédition et tes actions de combat"),
  cmd("combat", "Joue un tour de ton combat en cours", [
    str(
      "action",
      "Action à jouer",
      true,
      choices({
        attack: "Attaquer",
        skill: "Compétence",
        guard: "Défendre (+10 mana)",
        potion: "Potion de soin",
        ether: "Éther",
        flee: "Fuir (perte de 25 % de l’or du sac)",
      }),
    ),
  ]),
  cmd("rentrer", "Rentre au refuge et sécurise ton butin"),
  cmd("base", "Gère tes trois emplacements et repose-toi", [
    sub("voir", "Affiche ton refuge"),
    sub("construire", "Construis un bâtiment", [
      {
        ...str("batiment", "Bâtiment commun ou exclusif à ton peuple", true),
        autocomplete: true,
      },
      slot(),
    ]),
    sub("ameliorer", "Améliore un bâtiment jusqu’au niveau 5", [slot()]),
    sub("demolir", "Démolis un bâtiment, rembourse 50 % de l’or investi", [
      slot(),
    ]),
    sub("recolter", "Récupère la production de tes bâtiments"),
    sub("repos", "Restaure PV et mana contre de l’or"),
  ]),
  cmd("inventaire", "Ton coffre, tes ressources et tes équipements"),
  cmd("equiper", "Équipe un objet depuis ton coffre, à la base", [item()]),
  cmd("retirer", "Retire un équipement, à la base", [
    str(
      "emplacement",
      "Emplacement à libérer",
      true,
      choices({ weapon: "Arme", armor: "Armure", charm: "Talisman" }),
    ),
  ]),
  cmd("utiliser", "Utilise une potion ou un éther hors combat", [
    str(
      "objet",
      "Consommable",
      true,
      choices({ potion: "Potion de soin", ether: "Éther" }),
    ),
  ]),
  cmd("talent", "Dépense un point gagné en montant de niveau", [
    str(
      "statistique",
      "Entraînement permanent",
      true,
      choices({
        attack: "Force : +2 attaque",
        defense: "Robustesse : +2 défense",
        power: "Arcanes : +2 puissance",
        vitality: "Vitalité : +10 PV",
      }),
    ),
  ]),
  cmd(
    "quotidien",
    "Récupère tes provisions quotidiennes et entretiens ta série",
  ),
  cmd("quetes", "Consulte ou réclame tes contrats du jour", [
    str(
      "reclamer",
      "Récompense à récupérer",
      false,
      choices({
        kills: "Chasse aux ombres",
        gather: "Les mains pleines",
        craft: "Le feu de l’atelier",
      }),
    ),
  ]),
  cmd("atelier", "Fabrique, enchante ou recycle ton équipement", [
    sub("recettes", "Consulte le livre de recettes"),
    sub("fabriquer", "Fabrique un ou plusieurs lots", [
      {
        ...str(
          "recette",
          "Identifiant de la recette (/atelier recettes)",
          true,
        ),
        autocomplete: true,
      },
      int("quantite", "Nombre de lots", false, 1, 20),
    ]),
    sub("enchanter", "Améliore un équipement (+5 maximum, forge requise)", [
      item(),
    ]),
    sub("recycler", "Détruis un équipement pour récupérer fer et essence", [
      item(),
    ]),
  ]),
  cmd("marche", "Le marché global des aventuriers", [
    sub("voir", "Parcours les annonces de tous les serveurs", [
      int("page", "Page des annonces", false, 1, 10000),
      resource(false),
    ]),
    sub("mes-annonces", "Consulte tes ventes actives"),
    sub("vendre-ressource", "Mets un lot en vente pendant 7 jours", [
      resource(),
      int("quantite", "Quantité du lot", true, 1, 10000),
      int("prix", "Prix TOTAL du lot (commission de 5 % à la vente)", true),
    ]),
    sub("vendre-objet", "Vends un équipement non porté", [
      item(),
      int("prix", "Prix total en or", true),
    ]),
    sub("acheter", "Achète un lot entier", [code("l’annonce")]),
    sub("annuler", "Récupère ton lot invendu", [code("l’annonce")]),
  ]),
  cmd("donner", "Envoie de l’or ou une ressource à un ami", [
    user("joueur", "Le destinataire", true),
    int("or", "Or à donner"),
    resource(false),
    int("quantite", "Quantité de ressource", false, 1, 10000),
  ]),
  cmd("guilde", "Fonde une guilde et partage un trésor commun", [
    sub("voir", "Ta guilde, ou les guildes qui recrutent", [
      str("code", "Code d’une guilde"),
    ]),
    sub("creer", "Fonde une guilde pour 200 or", [
      str("nom", "Nom de la guilde", true),
    ]),
    sub("rejoindre", "Rejoins une guilde ouverte", [code("la guilde")]),
    sub("donner", "Verse de l’or au trésor commun", [
      int("or", "Montant du don", true),
    ]),
    sub("ameliorer", "Chef : dépense 500 × niveau or pour renforcer la guilde"),
    sub("quitter", "Quitte la guilde ; le chef transmet sa place"),
  ]),
  cmd("groupe", "Prépare un raid avec 2 à 4 amis", [
    sub("voir", "Affiche ton groupe et son code de recrutement"),
    sub("creer", "Crée un groupe de raid", [
      {
        type: 4,
        name: "raid",
        description: "Boss de raid",
        required: true,
        choices: RAIDS.map((r) => ({
          name: `${r.name} · niv. ${r.level}`,
          value: r.id,
        })),
      },
    ]),
    sub(
      "rejoindre",
      "Accepte le raid : le chef pourra engager 20 de ton énergie",
      [code("groupe")],
    ),
    sub("quitter", "Quitte le groupe avant le lancement"),
  ]),
  cmd("raid", "Chef : lance le raid pour ton groupe (20 énergie, délai 24 h)"),
  cmd("classement", "Les dix héros les plus avancés de Brumeterre"),
];

export function routeCommand(interaction) {
  const o = interaction.options;
  const s = (name) => o.getString(name);
  const n = (name, fallback) => o.getInteger(name) ?? fallback;
  const subcommand = () => o.getSubcommand();
  const result = (action, args = {}, extra = {}) => ({
    action,
    args,
    ...extra,
  });
  switch (interaction.commandName) {
    case "creer":
      return result("create", {
        name: s("nom"),
        raceId: s("race"),
        classId: s("classe"),
      });
    case "jouer":
      return result("profile");
    case "profil":
      return result("profile", {}, { targetId: o.getUser("joueur")?.id });
    case "aide":
      return result("help");
    case "codex":
      return result("codex", { category: s("categorie") ?? "races", page: 1 });
    case "carte":
      return result("map");
    case "voyager":
      return result("travel", { zoneId: n("zone", 0) });
    case "campagne":
      return result("campaign");
    case "combat":
      return result("combat", { move: s("action") });
    case "rentrer":
      return result("returnHome");
    case "base": {
      const actions = {
        voir: "base",
        construire: "build",
        ameliorer: "upgradeBuilding",
        demolir: "demolish",
        recolter: "collect",
        repos: "rest",
      };
      return result(actions[subcommand()], {
        buildingId: s("batiment"),
        slot: n("emplacement"),
      });
    }
    case "inventaire":
      return result("inventory");
    case "equiper":
      return result("equip", { itemId: s("objet") });
    case "retirer":
      return result("unequip", { slot: s("emplacement") });
    case "utiliser":
      return result("consume", { resource: s("objet") });
    case "talent":
      return result("talent", { stat: s("statistique") });
    case "quotidien":
      return result("daily");
    case "quetes":
      return s("reclamer")
        ? result("claimQuest", { questId: s("reclamer") })
        : result("quests");
    case "atelier": {
      const actions = {
        recettes: "codex",
        fabriquer: "craft",
        enchanter: "enchant",
        recycler: "salvage",
      };
      return result(actions[subcommand()], {
        category: "recettes",
        recipeId: s("recette"),
        quantity: n("quantite", 1),
        itemId: s("objet"),
      });
    }
    case "marche": {
      const actions = {
        voir: "market",
        "mes-annonces": "market",
        "vendre-ressource": "sell",
        "vendre-objet": "sell",
        acheter: "buy",
        annuler: "cancelListing",
      };
      return result(actions[subcommand()], {
        mine: subcommand() === "mes-annonces",
        page: n("page", 1),
        resource: s("ressource"),
        itemId: s("objet"),
        quantity: n("quantite", 1),
        price: n("prix"),
        listingId: s("code"),
      });
    }
    case "donner":
      return result("gift", {
        targetId: o.getUser("joueur").id,
        gold: n("or", 0),
        resource: s("ressource"),
        quantity: n("quantite", 1),
      });
    case "guilde":
      return result(
        {
          voir: "guildInfo",
          creer: "guildCreate",
          rejoindre: "guildJoin",
          donner: "guildDonate",
          ameliorer: "guildUpgrade",
          quitter: "guildLeave",
        }[subcommand()],
        { guildId: s("code"), name: s("nom"), gold: n("or") },
        { public: subcommand() === "voir" },
      );
    case "groupe":
      return result(
        {
          voir: "partyInfo",
          creer: "partyCreate",
          rejoindre: "partyJoin",
          quitter: "partyLeave",
        }[subcommand()],
        { partyId: s("code"), raidId: n("raid", 0) },
        { public: ["voir", "creer", "rejoindre"].includes(subcommand()) },
      );
    case "raid":
      return result("raid", {}, { public: true });
    case "classement":
      return result("leaderboard", {}, { public: true });
    default:
      return result("help");
  }
}

export function routeButton(customId, viewerId) {
  const [prefix, owner, action, a, b, c] = customId.split(":");
  if (prefix !== "rpg" || owner !== viewerId) return null;
  if (action === "combat")
    return { action, args: { move: a, battleId: b, turn: Number(c) } };
  if (action === "codex")
    return { action, args: { category: a, page: Number(b) } };
  if (action === "inventory") return { action, args: { page: Number(a) } };
  if (action === "market")
    return {
      action,
      args: { page: Number(a), mine: b === "1", resource: c || undefined },
    };
  if (action === "travel") return { action, args: { zoneId: Number(a) } };
  if (action === "claimQuest") return { action, args: { questId: a } };
  if (action === "buy" || action === "cancelListing")
    return { action, args: { listingId: a } };
  if (
    [
      "profile",
      "campaign",
      "map",
      "base",
      "explore",
      "returnHome",
      "rest",
      "collect",
      "daily",
      "quests",
      "help",
    ].includes(action)
  )
    return { action, args: {} };
  return null;
}

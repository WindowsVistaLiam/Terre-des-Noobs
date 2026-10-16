import { SlashCommandBuilder } from "discord.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("profil")
    .setDescription("Présenter ton héros ou consulter celui d’un autre joueur")
    .addUserOption((option) =>
      option
        .setName("joueur")
        .setDescription("Le joueur dont tu veux voir le héros"),
    ),
  new SlashCommandBuilder()
    .setName("marché")
    .setDescription("Marché, coffre, ressources, équipement et artisanat"),
  new SlashCommandBuilder()
    .setName("info")
    .setDescription("Encyclopédie : races, classes, métiers, objets et règles"),
  new SlashCommandBuilder()
    .setName("social")
    .setDescription("Amis, duels, guildes, cité et défense entre compagnons"),
].map((command) => ({ ...command.toJSON(), dm_permission: false }));

export const NAVIGABLE = new Set([
  "profile",
  "welcome",
  "creationRace",
  "map",
  "campaign",
  "encounters",
  "base",
  "talents",
  "quests",
  "social",
  "guildInfo",
  "partyInfo",
  "leaderboard",
  "inventory",
  "resources",
  "market",
  "crafting",
  "store",
  "guilds",
  "parties",
  "info",
  "friends",
  "inbox",
  "directory",
  "blocked",
  "duels",
  "pvpLeaderboard",
  "city",
  "cityDefensePlan",
  "cityTargets",
  "guildRoster",
  "customize",
]);
export const CATEGORIES = new Set([
  "races",
  "classes",
  "metiers",
  "items",
  "batiments",
  "recettes",
  "raids",
  "regles",
]);
export const FORM_KINDS = new Set([
  "create",
  "sellResource",
  "sellItem",
  "craft",
  "guildCreate",
  "guildJoin",
  "guildDonate",
  "partyJoin",
  "giftGold",
  "giftResource",
  "shopBuy",
  "cityDonate",
  "guildBulletin",
  "profileText",
  "portraitUpload",
  "bannerUpload",
]);

export const uiId = (owner, action, ...args) =>
  ["tdn", owner, action, ...args].join(":");
export const publicId = (action, ...args) =>
  ["tdnp", action, ...args].join(":");
// Les panneaux publics ne proposent que des lectures et des entrées privées.
// Aucune mutation ne peut être encodée dans un bouton partagé.
export function routePublicComponent(customId, values = []) {
  if (typeof customId !== "string" || customId.length > 100) return null;
  const [prefix, action, a, b] = customId.split(":");
  if (prefix !== "tdnp") return null;
  if (action === "menu") {
    const selected = values[0];
    if (typeof selected !== "string" || !selected.startsWith("tdnp:") ||
      selected.split(":")[1] === "menu") return null;
    return routePublicComponent(selected);
  }
  if (["publicProfile", "playerCard", "listing"].includes(action))
    return {
      action,
      args: {
        [action === "listing" ? "listingId" : "targetId"]: values[0] ?? a,
      },
    };
  if (["profile", "market", "info", "social", "directory", "map"].includes(action))
    return { action, args: {} };
  if (action === "nav" && ["profile", "market", "info", "social"].includes(a))
    return { action: a, args: {} };
  if (action === "chapter" && CATEGORIES.has(values[0]))
    return { action: "codex", args: { category: values[0], page: 1 } };
  if (action === "codex" && CATEGORIES.has(a))
    return { action: "codex", args: { category: a, page: Number(b ?? 1) } };
  if (action === "marketPage")
    return { action: "publicMarket", args: { page: Number(a ?? 1) } };
  return null;
}
export function parseId(customId, owner) {
  if (typeof customId !== "string" || customId.length > 100) return null;
  const [prefix, target, action, ...params] = customId.split(":");
  return prefix === "tdn" && target === owner ? { action, params } : null;
}
export function routeCommand(interaction) {
  const targetId =
    interaction.commandName === "profil"
      ? (interaction.options?.getUser?.("joueur")?.id ?? interaction.user?.id)
      : undefined;
  return {
    action:
      {
        profil: "publicProfile",
        marché: "publicMarket",
        info: "info",
        social: "social",
      }[interaction.commandName] ?? "info",
    args: targetId ? { targetId } : {},
    public: interaction.commandName !== "social",
  };
}
const doActions = {
  returnHome: () => ({}),
  rest: () => ({}),
  daily: () => ({}),
  collect: () => ({}),
  claimQuest: (a) => ({ questId: a }),
  talent: (a) => ({ stat: a }),
  consume: (a) => ({ resource: a }),
  equip: (a) => ({ itemId: a }),
  unequip: (a) => ({ slot: a }),
  enchant: (a) => ({ itemId: a }),
  salvage: (a) => ({ itemId: a }),
  upgradeBuilding: (a) => ({ slot: Number(a) }),
  demolish: (a) => ({ slot: Number(a) }),
  build: (a, b) => ({ slot: Number(a), buildingId: b }),
  buy: (a) => ({ listingId: a }),
  cancelListing: (a) => ({ listingId: a }),
  guildJoin: (a) => ({ guildId: a }),
  guildUpgrade: () => ({}),
  guildLeave: () => ({}),
  partyCreate: (a) => ({ raidId: Number(a) }),
  partyJoin: (a) => ({ partyId: a }),
  partyLeave: () => ({}),
  raid: () => ({}),
  friendRequest: (a) => ({ targetId: a }),
  friendRespond: (a, b) => ({ requestId: a, response: b }),
  friendRemove: (a) => ({ targetId: a }),
  blockPlayer: (a) => ({ targetId: a }),
  unblockPlayer: (a) => ({ targetId: a }),
  duelChallenge: (a) => ({ targetId: a }),
  duelRespond: (a, b) => ({ duelId: a, response: b }),
  guildInvite: (a) => ({ targetId: a }),
  guildInviteRespond: (a, b) => ({ invitationId: a, response: b }),
  guildManage: (a, b) => ({ targetId: a, operation: b }),
  cityUpgrade: (a) => ({ buildingId: a }),
  cityGuard: () => ({}),
  cityDefense: (a) => ({ role: a }),
  cityClaim: () => ({}),
  cityWarToggle: () => ({}),
  citySiege: (a) => ({ guildId: a }),
  customizeReset: (a) => ({ slot: a }),
};
export function routeComponent(customId, owner, values = []) {
  if (customId?.startsWith("tdnp:"))
    return routePublicComponent(customId, values);
  const parsed = parseId(customId, owner);
  if (!parsed) return null;
  const {
    action,
    params: [a, b, c],
  } = parsed;
  const selected = values[0];
  switch (action) {
    case "menu": {
      const nested = parseId(selected, owner);
      if (!nested || nested.action === "menu") return null;
      return routeComponent(selected, owner);
    }
    case "nav":
      return NAVIGABLE.has(a)
        ? { action: a, args: { page: Number(b ?? 1), mine: c === "mine" } }
        : null;
    case "chapter":
      return CATEGORIES.has(selected)
        ? { action: "codex", args: { category: selected, page: 1 } }
        : null;
    case "codex":
      return CATEGORIES.has(a)
        ? { action: "codex", args: { category: a, page: Number(b ?? 1) } }
        : null;
    case "race":
      return { action: "creationClass", args: { raceId: selected } };
    case "class":
      return {
        action: "creationReview",
        args: { raceId: a, classId: selected },
      };
    case "classes":
      return { action: "creationClass", args: { raceId: a } };
    case "zone":
      return { action: "travel", args: { zoneId: Number(selected) } };
    case "encounter": {
      if (!["progress", "farm"].includes(a) || typeof selected !== "string") return null;
      const match = /^(normal|elite|boss)\|([0-2])$/.exec(selected);
      if (!match) return null;
      return { action: "explore", args: {
        mode: a, zoneId: Number(b), enemyIndex: Number(match[2]),
        elite: match[1] === "elite", boss: match[1] === "boss",
      } };
    }
    case "huntAgain":
      return { action: "explore", args: {
        mode: "farm", zoneId: Number(a), enemyIndex: Number(b), elite: c === "elite", boss: false,
      } };
    case "fight":
      return {
        action: "combat",
        args: { move: a, battleId: b, turn: Number(c) },
      };
    case "do":
      // Les anciens panneaux « Continuer » ouvrent aussi le nouveau choix.
      if (a === "explore") return { action: "encounters", args: {} };
      if (a === "guildKick")
        return {
          action: "guildManage",
          args: { targetId: b, operation: "kick" },
        };
      return Object.hasOwn(doActions, a)
        ? { action: a, args: doActions[a](b, c) }
        : null;
    case "item":
      return { action: "item", args: { itemId: selected ?? a } };
    case "slot":
      return { action: "slot", args: { slot: Number(selected ?? a) } };
    case "building":
      return {
        action: "building",
        args: { slot: Number(a), buildingId: selected },
      };
    case "recipe":
      return { action: "recipe", args: { recipeId: selected ?? a } };
    case "listing":
      return { action: "listing", args: { listingId: selected ?? a } };
    case "sellResource":
      return { action: "form", kind: "sellResource", params: [selected] };
    case "giftTarget":
      return { action: "giftOptions", args: { targetId: selected } };
    case "giftTargetMenu":
      return { action: "giftOptions", args: {} };
    case "giftFor":
      return { action: "giftOptions", args: { targetId: a } };
    case "player":
      return { action: "playerCard", args: { targetId: selected ?? a } };
    case "viewProfile":
      return { action: "publicProfile", args: { targetId: a } };
    case "guildMember":
      return { action: "guildMember", args: { targetId: selected ?? a } };
    case "duelEntry":
      return { action: "duel", args: { duelId: selected ?? a } };
    case "cityPlan":
      return { action: "cityPlan", args: { buildingId: selected ?? a } };
    case "cityDonate":
      return { action: "form", kind: "cityDonate", params: [selected] };
    case "siegeTarget":
      return { action: "siegePreview", args: { guildId: selected ?? a } };
    case "notification": {
      const [kind, key] = (selected ?? "").split("|");
      if (kind === "duel") return { action: "duel", args: { duelId: key } };
      if (["friend", "guild"].includes(kind))
        return { action: "requestPreview", args: { kind, key } };
      return null;
    }
    case "giftResource":
      return { action: "form", kind: "giftResource", params: [a, selected] };
    case "guild":
      return { action: "guildPreview", args: { guildId: selected ?? a } };
    case "party":
      return { action: "partyPreview", args: { partyId: selected ?? a } };
    case "raid":
      return { action: "raidPreview", args: { raidId: Number(selected ?? a) } };
    case "shop":
      return { action: "shopDetail", args: { resource: selected ?? a } };
    case "confirm":
      return [
        "demolish",
        "salvage",
        "guildLeave",
        "partyLeave",
        "raid",
        "friendRemove",
        "blockPlayer",
        "guildKick",
        "cityWarToggle",
        "citySiege",
      ].includes(a)
        ? { action: "confirm", args: { kind: a, value: b } }
        : null;
    case "form":
      return FORM_KINDS.has(a)
        ? {
            action: "form",
            kind: a,
            params: [b, c].filter((v) => v !== undefined),
          }
        : null;
    default:
      return null;
  }
}
export const routeButton = routeComponent;

const input = (
  custom_id,
  label,
  { min = 1, max = 50, placeholder, value } = {},
) => ({
  type: 1,
  components: [
    {
      type: 4,
      custom_id,
      label,
      style: 1,
      required: true,
      min_length: min,
      max_length: max,
      ...(placeholder ? { placeholder } : {}),
      ...(value ? { value } : {}),
    },
  ],
});
export function buildModal(owner, kind, params = []) {
  if (!FORM_KINDS.has(kind)) return null;
  if (["portraitUpload", "bannerUpload"].includes(kind))
    return {
      custom_id: uiId(owner, "submit", kind),
      title:
        kind === "portraitUpload"
          ? "Le portrait de ton personnage"
          : "La bannière de ton personnage",
      components: [
        {
          type: 18,
          label: "Choisis une image PNG, JPG ou WebP",
          description:
            "Image fixe, 5 Mo maximum. Recadrage centré automatique.",
          component: {
            type: 19,
            custom_id: "image",
            min_values: 1,
            max_values: 1,
            required: true,
            file_types: [".png", ".jpg", ".jpeg", ".webp"],
          },
        },
      ],
    };
  const forms = {
    profileText: [
      "Présente ton personnage",
      [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "title",
              label: "Titre ou devise (facultatif)",
              style: 1,
              required: false,
              max_length: 40,
            },
          ],
        },
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "bio",
              label: "Description et histoire (facultatif)",
              style: 2,
              required: false,
              max_length: 600,
            },
          ],
        },
      ],
    ],
    create: [
      "Nomme ton aventurier",
      [
        input("name", "Nom du personnage", {
          min: 2,
          max: 24,
          placeholder: "Ex. Aelys",
        }),
      ],
    ],
    sellResource: [
      "Mettre un lot en vente",
      [
        input("quantity", "Quantité du lot", { max: 5, value: "1" }),
        input("price", "Prix TOTAL du lot en or", {
          max: 7,
          placeholder: "Commission vendeur : 5 %",
        }),
      ],
    ],
    sellItem: [
      "Vendre cet équipement",
      [
        input("price", "Prix de vente en or", {
          max: 7,
          placeholder: "Commission vendeur : 5 %",
        }),
      ],
    ],
    craft: [
      "Préparer la fabrication",
      [input("quantity", "Nombre de lots (1 à 20)", { max: 2, value: "1" })],
    ],
    guildCreate: [
      "Fonder une guilde · 200 or",
      [input("name", "Nom de la guilde", { min: 3, max: 32 })],
    ],
    guildJoin: [
      "Rejoindre une guilde",
      [input("code", "Code de la guilde", { max: 12 })],
    ],
    guildDonate: [
      "Contribuer au trésor",
      [input("gold", "Montant du don en or", { max: 7 })],
    ],
    partyJoin: [
      "Rejoindre un groupe",
      [input("code", "Code du groupe (autorise le lancement)", { max: 12 })],
    ],
    giftGold: [
      "Offrir de l’or",
      [input("gold", "Montant du don en or", { max: 7 })],
    ],
    giftResource: [
      "Offrir des ressources",
      [input("quantity", "Quantité à offrir", { max: 5, value: "1" })],
    ],
    shopBuy: [
      "Acheter des provisions",
      [
        input("quantity", "Quantité à acheter (1 à 100)", {
          max: 3,
          value: "1",
        }),
      ],
    ],
    cityDonate: [
      "Matériaux pour la cité",
      [
        input("quantity", "Quantité à donner (1 à 10 000)", {
          max: 5,
          value: "1",
        }),
      ],
    ],
    guildBulletin: [
      "Le message de votre guilde",
      [
        input("text", "Message de guilde (3 à 180 caractères)", {
          min: 3,
          max: 180,
        }),
      ],
    ],
  };
  const [title, components] = forms[kind];
  return {
    custom_id: uiId(owner, "submit", kind, ...params),
    title,
    components,
  };
}
export function routeModal(customId, owner, fields) {
  const parsed = parseId(customId, owner);
  if (!parsed || parsed.action !== "submit") return null;
  const [kind, a, b] = parsed.params;
  const text = (key) => fields.getTextInputValue(key).trim();
  const number = (key) => (/^\d+$/.test(text(key)) ? Number(text(key)) : NaN);
  switch (kind) {
    case "profileText":
      return {
        action: "customizeText",
        args: { title: text("title"), bio: text("bio") },
      };
    case "portraitUpload":
    case "bannerUpload": {
      const files = fields.getUploadedFiles("image", true);
      return {
        action: "profileUpload",
        args: {
          slot: kind === "portraitUpload" ? "portrait" : "banner",
          attachment: files?.values().next().value,
        },
      };
    }
    case "create":
      return {
        action: "create",
        args: { raceId: a, classId: b, name: text("name") },
      };
    case "sellResource":
      return {
        action: "sell",
        args: {
          resource: a,
          quantity: number("quantity"),
          price: number("price"),
        },
      };
    case "sellItem":
      return {
        action: "sell",
        args: { itemId: a, quantity: 1, price: number("price") },
      };
    case "craft":
      return {
        action: "craft",
        args: { recipeId: a, quantity: number("quantity") },
      };
    case "guildCreate":
      return { action: "guildCreate", args: { name: text("name") } };
    case "guildJoin":
      return { action: "guildJoin", args: { guildId: text("code") } };
    case "guildDonate":
      return { action: "guildDonate", args: { gold: number("gold") } };
    case "partyJoin":
      return { action: "partyJoin", args: { partyId: text("code") } };
    case "giftGold":
      return { action: "gift", args: { targetId: a, gold: number("gold") } };
    case "giftResource":
      return {
        action: "gift",
        args: { targetId: a, resource: b, quantity: number("quantity") },
      };
    case "shopBuy":
      return {
        action: "shopBuy",
        args: { resource: a, quantity: number("quantity") },
      };
    case "cityDonate":
      return {
        action: "cityDonate",
        args: { resource: a, quantity: number("quantity") },
      };
    case "guildBulletin":
      return { action: "guildBulletin", args: { text: text("text") } };
    default:
      return null;
  }
}

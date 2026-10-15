import { RACES, CLASSES, BUILDINGS, RECIPES, RAIDS, SHOP } from "./content.js";
import { GameError, ensure } from "./game.js";
import {
  routeComponent,
  routeCommand,
  routeModal,
  buildModal,
} from "./commands.js";
import { render } from "./views.js";

const uiOnly = new Set([
  "info",
  "codex",
  "map",
  "base",
  "campaign",
  "talents",
  "social",
  "resources",
  "crafting",
  "store",
  "slot",
  "building",
  "item",
  "recipe",
  "listing",
  "giftOptions",
  "guilds",
  "parties",
  "guildPreview",
  "partyPreview",
  "raidPreview",
  "confirm",
]);
export async function resolveRoute(game, route, userId, requestId) {
  const action = route.action,
    args = route.args ?? {};
  const now = game.now();
  const saved = await game.store.transaction((tx) => tx.get("player", userId));
  if (action === "info" || action === "codex") {
    return { type: action, ...args, p: saved, now };
  }
  if (
    ["welcome", "creationRace", "creationClass", "creationReview"].includes(
      action,
    )
  ) {
    if (saved) return game.execute("profile", userId);
    if (action === "creationClass" || action === "creationReview")
      ensure(RACES[args.raceId], "Choisis un peuple dans la liste.");
    if (action === "creationReview")
      ensure(CLASSES[args.classId], "Choisis une classe dans la liste.");
    return { type: action, ...args, now };
  }
  if (!saved && action !== "create") return { type: "welcome", now };
  if (args.page !== undefined)
    ensure(
      Number.isSafeInteger(args.page) && args.page >= 1 && args.page <= 10000,
      "Page invalide.",
    );

  if (uiOnly.has(action)) {
    const { p } = await game.execute("profile", userId);
    const data = { p, type: action, ...args, now };
    switch (action) {
      case "slot":
      case "building":
        ensure(
          Number.isInteger(args.slot) && args.slot >= 1 && args.slot <= 3,
          "Emplacement de bâtiment invalide.",
        );
        if (action === "building") {
          const building = BUILDINGS[args.buildingId];
          ensure(building, "Bâtiment inconnu.");
          ensure(
            !building.races.length || building.races.includes(p.raceId),
            "Ce bâtiment est réservé à un autre peuple.",
          );
          ensure(
            !p.buildings[args.slot - 1],
            "Cet emplacement est déjà occupé.",
          );
        }
        break;
      case "item":
        data.item = p.gear.find((item) => item.id === args.itemId);
        ensure(data.item, "Cet objet n’est plus dans ton coffre.");
        break;
      case "recipe":
        ensure(RECIPES[args.recipeId], "Recette inconnue.");
        break;
      case "listing": {
        const market = await game.execute("market", userId);
        data.p = market.p;
        data.listing = await game.store.transaction((tx) =>
          tx.get("listing", args.listingId),
        );
        ensure(
          data.listing,
          "Cette annonce a été vendue, retirée ou a expiré.",
        );
        break;
      }
      case "giftOptions": {
        if (args.targetId) {
          ensure(args.targetId !== userId, "Choisis un autre aventurier.");
          const target = await game.store.transaction((tx) =>
            tx.get("player", args.targetId),
          );
          ensure(
            target,
            "Cet ami doit d’abord créer un personnage depuis /profil.",
          );
          data.target = { id: target.id, name: target.name };
        }
        break;
      }
      case "guilds":
      case "parties": {
        const all = await game.store.transaction((tx) =>
          tx.list(action === "guilds" ? "guild" : "party"),
        );
        const available = all.filter((v) =>
          action === "guilds"
            ? v.members.length < 30
            : v.members.length < 4 && RAIDS[v.raidId].level <= p.level,
        );
        data.pages = Math.max(1, Math.ceil(available.length / 6));
        data.page = Math.min(args.page ?? 1, data.pages);
        data.entries = available.slice((data.page - 1) * 6, data.page * 6);
        break;
      }
      case "guildPreview":
        return {
          ...(await game.execute("guildInfo", userId, {
            guildId: args.guildId,
          })),
          type: "guildPreview",
        };
      case "partyPreview": {
        data.party = await game.store.transaction((tx) =>
          tx.get("party", args.partyId),
        );
        ensure(data.party, "Ce groupe n’existe plus.");
        break;
      }
      case "raidPreview":
        ensure(RAIDS[args.raidId], "Raid inconnu.");
        break;
      case "shopDetail":
        ensure(SHOP[args.resource], "Provision inconnue.");
        break;
      case "confirm":
        ensure(
          ["demolish", "salvage", "guildLeave", "partyLeave", "raid"].includes(
            args.kind,
          ),
          "Confirmation inconnue.",
        );
        if (args.kind === "salvage") {
          data.item = p.gear.find((i) => i.id === args.value);
          ensure(data.item, "Objet introuvable.");
        }
        if (args.kind === "demolish")
          ensure(p.buildings[Number(args.value) - 1], "Bâtiment introuvable.");
        break;
    }
    return data;
  }
  if (action === "shopDetail") {
    ensure(SHOP[args.resource], "Provision inconnue.");
    return {
      ...(await game.execute("profile", userId)),
      type: action,
      ...args,
    };
  }
  const result = await game.execute(action, userId, args, { requestId });
  if (result.duplicate) return result;
  if (action === "inventory") result.page = args.page ?? 1;
  if (action === "talent") result.type = "talents";
  if (["equip", "enchant", "unequip"].includes(action)) {
    const item = result.p.gear.find((i) => i.id === args.itemId);
    if (item) return { ...result, type: "item", item };
  }
  if (action === "consume" && result.p.location === "base")
    result.type = "resources";
  if (action === "gift") result.type = "social";
  if (["sell", "buy", "cancelListing"].includes(action))
    return {
      ...(await game.execute("market", userId, { mine: action !== "buy" })),
      message: result.message,
    };
  return result;
}

export function createInteractionHandler(
  game,
  { renderer = render, cooldownMs = 200 } = {},
) {
  const cooldowns = new Map();
  const renders = new Map();
  return async (interaction) => {
    if (!interaction.inGuild()) return;
    const isCommand = interaction.isChatInputCommand();
    const isModal = Boolean(interaction.isModalSubmit?.());
    if (
      !isCommand &&
      !isModal &&
      !interaction.isButton() &&
      !interaction.isStringSelectMenu() &&
      !interaction.isUserSelectMenu?.()
    )
      return;
    try {
      const route = isCommand
        ? routeCommand(interaction)
        : isModal
          ? routeModal(
              interaction.customId,
              interaction.user.id,
              interaction.fields,
            )
          : routeComponent(
              interaction.customId,
              interaction.user.id,
              interaction.values ?? [],
            );
      if (!route) {
        await interaction.deferReply({ flags: 64 });
        await interaction.editReply(
          await renderer(
            {
              type: "error",
              message:
                "Ce panneau est ancien ou appartient à un autre aventurier. Ouvre ton carnet avec /profil.",
            },
            interaction.user.id,
          ),
        );
        return;
      }
      if (route.action === "form") {
        const modal = buildModal(interaction.user.id, route.kind, route.params);
        ensure(modal, "Ce formulaire n’est plus disponible.");
        await interaction.showModal(modal);
        return;
      }
      const now = Date.now();
      if ((cooldowns.get(interaction.user.id) ?? 0) > now - cooldownMs) {
        if (!isCommand && !isModal) await interaction.deferUpdate();
        else {
          await interaction.deferReply({ flags: 64 });
          await interaction.editReply(
            await renderer(
              {
                type: "error",
                message:
                  "Un instant, ton action précédente se termine. Réessaie dans une seconde.",
              },
              interaction.user.id,
            ),
          );
        }
        return;
      }
      cooldowns.set(interaction.user.id, now);
      if (cooldowns.size > 1000)
        for (const [uid, time] of cooldowns)
          if (time < now - 60000) cooldowns.delete(uid);
      // Un formulaire ouvert depuis un panneau met ce même panneau à jour.
      const update = !isCommand && (!isModal || interaction.isFromMessage?.());
      if (update) await interaction.deferUpdate();
      else await interaction.deferReply({ flags: 64 });
      const panelKey = update ? interaction.message?.id : undefined;
      const revision = panelKey
        ? (renders.get(panelKey)?.revision ?? 0) + 1
        : 0;
      if (panelKey) renders.set(panelKey, { revision, at: now });
      if (renders.size > 1000)
        for (const [key, value] of renders)
          if (value.at < now - 600000) renders.delete(key);
      const result = await resolveRoute(
        game,
        route,
        interaction.user.id,
        interaction.id,
      );
      if (!result.duplicate) {
        const payload = await renderer(result, interaction.user.id);
        // Un PNG lent ne doit pas remplacer une destination choisie plus tard.
        if (!panelKey || renders.get(panelKey)?.revision === revision)
          await interaction.editReply(payload);
      }
    } catch (error) {
      const expected = error instanceof GameError;
      if (!expected)
        console.error("Interaction:", {
          code: error.code,
          name: error.name,
          message: error.message,
        });
      const message = expected
        ? error.message
        : "La Brume a perturbé cette action. Réessaie dans un instant ou préviens l’administrateur.";
      try {
        const payload = await renderer(
          { type: "error", message },
          interaction.user.id,
        );
        if (interaction.deferred || interaction.replied) {
          if (isCommand || !interaction.message)
            await interaction.editReply(payload);
          else await interaction.followUp({ ...payload, flags: 64 });
        } else {
          await interaction.deferReply({ flags: 64 });
          await interaction.editReply(payload);
        }
      } catch {
        console.error("Impossible de transmettre le panneau d’erreur.");
      }
    }
  };
}

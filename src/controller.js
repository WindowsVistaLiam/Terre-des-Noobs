import { RACES, CLASSES, BUILDINGS, RECIPES, RAIDS, SHOP } from "./content.js";
import { GameError, ensure } from "./game.js";
import {
  routeComponent,
  routeCommand,
  routeModal,
  buildModal,
} from "./commands.js";
import { render } from "./views.js";
import { normalizeCity, cityStats } from "./social-game.js";
import { CITY_UPGRADES } from "./social-content.js";
import { publicProfile, publicMarket, activityFor } from "./public.js";
import { decorateAppearance, importAttachment } from "./profile-media.js";

const socialRoutes = {
  social: "socialInfo",
  friends: "friendsInfo",
  inbox: "inboxInfo",
  directory: "directoryInfo",
  playerCard: "playerCard",
  duels: "duelsInfo",
  duel: "duelInfo",
  pvpLeaderboard: "pvpLeaderboard",
  city: "cityInfo",
  cityDefensePlan: "cityInfo",
  cityTargets: "cityTargets",
  customize: "customizeInfo",
};

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
  "requestPreview",
  "cityPlan",
  "siegePreview",
  "guildRoster",
  "guildMember",
  "blocked",
]);
export async function resolveRoute(game, route, userId, requestId) {
  return decorateAppearance(
    game,
    await resolveRouteData(game, route, userId, requestId),
    userId,
  );
}
async function resolveRouteData(game, route, userId, requestId) {
  const action = route.action,
    args = route.args ?? {};
  const now = game.now();
  if (action === "publicProfile")
    return publicProfile(game, args.targetId ?? userId);
  if (action === "publicMarket") return publicMarket(game, args.page ?? 1);
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
  if (action === "profileUpload") {
    ensure(
      ["portrait", "banner"].includes(args.slot),
      "Emplacement d’image inconnu.",
    );
    const media = await importAttachment(args.attachment, args.slot);
    return game.execute(
      "customizeImage",
      userId,
      { slot: args.slot, media },
      { requestId },
    );
  }
  if (args.page !== undefined)
    ensure(
      Number.isSafeInteger(args.page) && args.page >= 1 && args.page <= 10000,
      "Page invalide.",
    );
  if (socialRoutes[action]) {
    const result = await game.execute(socialRoutes[action], userId, args);
    if (action === "cityDefensePlan") result.type = action;
    return result;
  }

  if (uiOnly.has(action)) {
    const { p } = await game.execute("profile", userId);
    const data = { p, type: action, ...args, now };
    switch (action) {
      case "blocked": {
        const result = await game.execute("friendsInfo", userId);
        const pages = Math.max(1, Math.ceil(result.blocked.length / 6)),
          page = Math.min(args.page ?? 1, pages);
        return {
          ...result,
          type: "blocked",
          entries: result.blocked.slice((page - 1) * 6, page * 6),
          page,
          pages,
        };
      }
      case "requestPreview": {
        ensure(["friend", "guild"].includes(args.kind), "Demande inconnue.");
        const record = await game.store.transaction((tx) =>
          tx.get(
            args.kind === "friend" ? "friend_request" : "guild_invite",
            args.key,
          ),
        );
        ensure(
          record && (record.to === userId || record.from === userId),
          "Cette demande ne t’appartient pas.",
        );
        return { p, type: "request", kind: args.kind, record, now };
      }
      case "cityPlan": {
        ensure(
          CITY_UPGRADES[args.buildingId],
          "Construction de cité inconnue.",
        );
        return {
          ...(await game.execute("cityInfo", userId)),
          type: "cityUpgrade",
          buildingId: args.buildingId,
        };
      }
      case "siegePreview": {
        const own = await game.execute("cityInfo", userId);
        const target = await game.store.transaction((tx) =>
          tx.get("guild", args.guildId),
        );
        ensure(
          target && target.id !== own.guild.id,
          "Cité adverse introuvable.",
        );
        normalizeCity(target, now);
        return {
          ...own,
          type: "siegePreview",
          target: {
            id: target.id,
            name: target.name,
            level: target.level,
            city: target.city,
            cityStats: cityStats(target),
          },
        };
      }
      case "guildRoster":
      case "guildMember": {
        const { guild, members } = await game.execute("guildInfo", userId);
        ensure(guild, "Tu dois appartenir à une guilde.");
        if (action === "guildMember") {
          const member = members.find((m) => m.id === args.targetId);
          ensure(member, "Ce membre a quitté la guilde.");
          return { p, guild, member, type: action, now };
        }
        const pages = Math.max(1, Math.ceil(members.length / 6)),
          page = Math.min(args.page ?? 1, pages);
        return {
          p,
          guild,
          entries: members.slice((page - 1) * 6, page * 6),
          page,
          pages,
          type: action,
          now,
        };
      }
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
          [
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
          ].includes(args.kind),
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
  const activity = activityFor(action, args, result, saved);
  if (activity) result.activity = activity;
  if (action === "inventory") result.page = args.page ?? 1;
  if (action === "talent") result.type = "talents";
  if (["equip", "enchant", "unequip"].includes(action)) {
    const item = result.p.gear.find((i) => i.id === args.itemId);
    if (item) return { ...result, type: "item", item };
  }
  if (action === "consume" && result.p.location === "base")
    result.type = "resources";
  if (action === "gift") result.type = "social";
  if (result.type === "social")
    return {
      ...(await game.execute("socialInfo", userId)),
      message: result.message,
      activity,
    };
  if (["sell", "buy", "cancelListing"].includes(action))
    return {
      ...(await game.execute("market", userId, { mine: action !== "buy" })),
      message: result.message,
      activity,
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
    const paint = async (result) =>
      renderer(
        result.appearance
          ? result
          : await decorateAppearance(game, result, interaction.user.id).catch(
              () => result,
            ),
        interaction.user.id,
      );
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
          await paint({
            type: "error",
            message:
              "Ce panneau est ancien ou appartient à un autre aventurier. Ouvre ton carnet avec /profil.",
          }),
        );
        return;
      }
      if (route.action === "form") {
        const modal = buildModal(interaction.user.id, route.kind, route.params);
        ensure(modal, "Ce formulaire n’est plus disponible.");
        if (route.kind === "profileText") {
          const { p } = await game.execute(
            "customizeInfo",
            interaction.user.id,
          );
          for (const row of modal.components)
            for (const input of row.components) {
              const value = p.customization[input.custom_id];
              if (value) input.value = value;
            }
        }
        await interaction.showModal(modal);
        return;
      }
      const now = Date.now();
      if ((cooldowns.get(interaction.user.id) ?? 0) > now - cooldownMs) {
        if (!isCommand && !isModal) await interaction.deferUpdate();
        else {
          await interaction.deferReply({ flags: 64 });
          await interaction.editReply(
            await paint({
              type: "error",
              message:
                "Un instant, ton action précédente se termine. Réessaie dans une seconde.",
            }),
          );
        }
        return;
      }
      cooldowns.set(interaction.user.id, now);
      if (cooldowns.size > 1000)
        for (const [uid, time] of cooldowns)
          if (time < now - 60000) cooldowns.delete(uid);
      // Un formulaire ouvert depuis un panneau met ce même panneau à jour.
      const publicSource =
        interaction.customId?.startsWith("tdnp:") ||
        interaction.message?.flags?.has(64) === false;
      const update =
        !isCommand &&
        !publicSource &&
        (!isModal || interaction.isFromMessage?.());
      if (update) await interaction.deferUpdate();
      else
        await interaction.deferReply({
          flags: isCommand && route.public ? 0 : 64,
        });
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
        if (isCommand && route.public) result.public = true;
        const payload = await paint(result);
        // Un PNG lent ne doit pas remplacer une destination choisie plus tard.
        if (!panelKey || renders.get(panelKey)?.revision === revision)
          await interaction.editReply(payload);
        if (result.activity) {
          try {
            await interaction.followUp({
              ...(await paint(result.activity)),
              flags: 0,
            });
          } catch (error) {
            console.error("Annonce publique indisponible:", {
              code: error.code,
              name: error.name,
            });
          }
        }
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
        const payload = await paint({ type: "error", message });
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

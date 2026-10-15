import { BUILDINGS, RECIPES, RACES } from "./content.js";
import { GameError, gearLabel } from "./game.js";
import { routeButton, routeCommand } from "./commands.js";
import { render } from "./views.js";

export async function resolveRoute(game, route, userId, requestId) {
  if (route.action === "help") return { type: "help", now: game.now() };
  const targetId = route.targetId ?? userId;
  if (route.action === "codex")
    return { type: "codex", ...route.args, now: game.now() };
  const readActions = { map: "map", base: "base", campaign: "campaign" };
  if (readActions[route.action]) {
    const result = await game.execute("profile", targetId, {}, { requestId });
    return { ...result, type: readActions[route.action] };
  }
  const result = await game.execute(route.action, targetId, route.args, {
    requestId,
  });
  if (route.action === "inventory") result.page = route.args?.page ?? 1;
  return result;
}

export function createInteractionHandler(game) {
  const cooldowns = new Map();
  return async (interaction) => {
    if (!interaction.inGuild()) return;
    if (interaction.isAutocomplete()) {
      try {
        const focused = interaction.options.getFocused(true);
        const value = focused.value.toLocaleLowerCase("fr");
        let options = [];
        if (focused.name === "recette")
          options = Object.entries(RECIPES).map(([id, r]) => ({
            name: r.name,
            value: id,
          }));
        else {
          const { p } = await game.execute("profile", interaction.user.id);
          if (focused.name === "batiment")
            options = Object.entries(BUILDINGS)
              .filter(([, b]) => !b.races.length || b.races.includes(p.raceId))
              .map(([id, b]) => ({
                name: `${b.races.length ? RACES[p.raceId].emoji : "🏗️"} ${b.name}`,
                value: id,
              }));
          if (focused.name === "objet")
            options = p.gear.map((g) => ({
              name: `${gearLabel(g)} · niv. ${g.level} · ${g.id}`,
              value: g.id,
            }));
        }
        await interaction.respond(
          options
            .filter((v) =>
              `${v.name} ${v.value}`.toLocaleLowerCase("fr").includes(value),
            )
            .slice(0, 25),
        );
      } catch {
        await interaction.respond([]).catch(() => {});
      }
      return;
    }
    if (
      !interaction.isChatInputCommand() &&
      !interaction.isButton() &&
      !interaction.isStringSelectMenu()
    )
      return;
    try {
      let route;
      if (interaction.isChatInputCommand()) route = routeCommand(interaction);
      else if (interaction.isButton())
        route = routeButton(interaction.customId, interaction.user.id);
      else {
        const [prefix, owner, action] = interaction.customId.split(":");
        if (
          prefix === "rpg" &&
          owner === interaction.user.id &&
          action === "destination"
        )
          route = {
            action: "travel",
            args: { zoneId: Number(interaction.values[0]) },
          };
      }
      if (!route) {
        await interaction.reply({
          content:
            "Ce carnet appartient à un autre aventurier. Ouvre le tien avec /jouer.",
          flags: 64,
        });
        return;
      }
      const now = Date.now();
      if ((cooldowns.get(interaction.user.id) ?? 0) > now - 700) {
        await interaction.reply({
          content: "Laisse une petite seconde à la Brume…",
          flags: 64,
        });
        return;
      }
      cooldowns.set(interaction.user.id, now);
      if (cooldowns.size > 1000)
        for (const [uid, time] of cooldowns)
          if (time < now - 60000) cooldowns.delete(uid);
      // Les panneaux personnels sont privés ; les comptes rendus sociaux sont publics.
      const component = !interaction.isChatInputCommand();
      if (component) await interaction.deferUpdate();
      else await interaction.deferReply(route.public ? {} : { flags: 64 });
      const result = await resolveRoute(
        game,
        route,
        interaction.user.id,
        interaction.id,
      );
      if (result.duplicate) return;
      const payload = render(result, interaction.user.id, {
        readOnly: Boolean(
          route.targetId && route.targetId !== interaction.user.id,
        ),
      });
      await interaction.editReply(payload);
    } catch (error) {
      const expected = error instanceof GameError;
      if (!expected)
        console.error("Interaction:", {
          code: error.code,
          name: error.name,
          message: error.message,
        });
      const content = expected
        ? error.message
        : "La Brume a perturbé cette action. Réessaie dans un instant. Si cela persiste, préviens l’administrateur.";
      if (interaction.deferred || interaction.replied) {
        if (interaction.isChatInputCommand())
          await interaction
            .editReply({
              content,
              embeds: [],
              components: [],
              allowedMentions: { parse: [] },
            })
            .catch(() => {});
        else
          await interaction
            .followUp({ content, flags: 64, allowedMentions: { parse: [] } })
            .catch(() => {});
      } else
        await interaction
          .reply({ content, flags: 64, allowedMentions: { parse: [] } })
          .catch(() => {});
    }
  };
}

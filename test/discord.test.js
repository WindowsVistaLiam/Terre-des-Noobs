import test from "node:test";
import assert from "node:assert/strict";
import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { commands, routeButton, routeCommand } from "../src/commands.js";
import { render } from "../src/views.js";
import { Game, statsOf } from "../src/game.js";
import { MemoryStore } from "../src/store.js";
import { resolveRoute, createInteractionHandler } from "../src/controller.js";
import { loadConfig } from "../src/config.js";
import { createHealthServer } from "../src/health.js";

function validatePayload(payload) {
  assert.ok(payload.components.length <= 5);
  for (const embed of payload.embeds) {
    new EmbedBuilder(embed).toJSON();
    const length =
      (embed.title?.length ?? 0) +
      (embed.description?.length ?? 0) +
      (embed.footer?.text.length ?? 0) +
      embed.fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
    assert.ok(length <= 6000, `Embed too long: ${length}`);
    assert.ok(embed.fields.length <= 25);
  }
  for (const row of payload.components) {
    assert.ok(row.components.length <= 5);
    for (const component of row.components) {
      assert.ok(component.custom_id.length <= 100);
      if (component.options) assert.ok(component.options.length <= 25);
    }
  }
  assert.deepEqual(payload.allowedMentions, { parse: [] });
}

test("les 25 commandes respectent les limites Discord et l’ordre des paramètres requis", () => {
  assert.equal(commands.length, 25);
  const names = new Set();
  function checkOptions(options = []) {
    assert.ok(options.length <= 25);
    let optional = false;
    for (const option of options) {
      assert.ok(option.name.length <= 32);
      assert.ok(option.description.length <= 100);
      if (option.type !== 1) {
        if (!option.required) optional = true;
        else
          assert.equal(
            optional,
            false,
            `${option.name} après un argument optionnel`,
          );
      }
      if (option.choices) assert.ok(option.choices.length <= 25);
      if (option.options) checkOptions(option.options);
    }
  }
  for (const command of commands) {
    assert.ok(!names.has(command.name));
    names.add(command.name);
    assert.ok(command.description.length <= 100);
    checkOptions(command.options);
    const builder = new SlashCommandBuilder()
      .setName(command.name)
      .setDescription(command.description);
    assert.equal(builder.toJSON().name, command.name);
  }
});

test("boutons personnels : contrôle du propriétaire et contexte du tour", () => {
  assert.equal(routeButton("rpg:alice:buy:lot", "bob"), null);
  assert.deepEqual(routeButton("rpg:alice:combat:attack:abc:3", "alice"), {
    action: "combat",
    args: { move: "attack", battleId: "abc", turn: 3 },
  });
  assert.equal(routeButton("rpg:alice:unknown", "alice"), null);
});

test("tous les panneaux, pages et combats produisent des embeds valides", async () => {
  const game = new Game(new MemoryStore(), { random: () => 0.5 });
  let { p } = await game.execute("create", "alice", {
    name: "Aelys",
    raceId: "haut_elfe",
    classId: "mage",
  });
  for (const action of [
    "profile",
    "inventory",
    "quests",
    "leaderboard",
    "guildInfo",
    "partyInfo",
    "market",
  ])
    validatePayload(render(await game.execute(action, "alice"), "alice"));
  for (const category of [
    "races",
    "classes",
    "batiments",
    "recettes",
    "raids",
    "regles",
  ])
    for (let page = 1; page <= 7; page++)
      validatePayload(render({ p, type: "codex", category, page }, "alice"));
  for (const type of ["base", "map", "campaign", "help"])
    validatePayload(render({ p, type }, "alice"));
  await game.execute("travel", "alice", { zoneId: 0 });
  p = (await game.execute("explore", "alice")).p;
  validatePayload(render({ p, type: "campaign" }, "alice"));
  assert.equal(
    render({ p, type: "profile" }, "bob", { readOnly: true }).components.length,
    0,
  );
});

test("panneaux publics : marché et guildes supportent le contenu long sans dépasser Discord", async () => {
  const store = new MemoryStore();
  const game = new Game(store);
  await game.execute("create", "alice", {
    name: "Aelys",
    raceId: "humain",
    classId: "guerrier",
  });
  await store.transaction(async (tx) => {
    const p = await tx.get("player", "alice");
    p.gear = Array.from({ length: 100 }, () => game.generateGear(50));
    p.equipment = {};
    await tx.set("player", "alice", p);
  });
  validatePayload(render(await game.execute("inventory", "alice"), "alice"));
  for (const item of (await game.execute("inventory", "alice")).p.gear.slice(
    0,
    5,
  ))
    await game.execute("sell", "alice", { itemId: item.id, price: 1000000 });
  validatePayload(render(await game.execute("market", "alice"), "alice"));
});

test("le contrôleur reprend les panneaux et permet un codex sans personnage", async () => {
  const game = new Game(new MemoryStore());
  assert.equal(
    (
      await resolveRoute(
        game,
        { action: "codex", args: { category: "races" } },
        "new",
      )
    ).type,
    "codex",
  );
  await game.execute("create", "alice", {
    name: "Aelys",
    raceId: "humain",
    classId: "guerrier",
  });
  assert.equal(
    (await resolveRoute(game, { action: "map" }, "alice")).type,
    "map",
  );
});

test("les configurations incomplètes et le mode démo en production échouent explicitement", () => {
  assert.throws(() => loadConfig({}), /Variables manquantes/);
  assert.throws(
    () =>
      loadConfig({
        DISCORD_TOKEN: "x",
        DISCORD_CLIENT_ID: "123456789012345678",
        DEMO_MODE: "true",
        NODE_ENV: "production",
      }),
    /interdit/,
  );
  const config = loadConfig({
    DISCORD_TOKEN: "x",
    DISCORD_CLIENT_ID: "123456789012345678",
    DEMO_MODE: "true",
  });
  assert.equal(config.port, 3000);
  assert.equal(config.demo, true);
});

test("la disponibilité HTTP exige Discord connecté et une base joignable", async () => {
  let ready = false,
    database = true;
  const server = createHealthServer({
    isReady: () => ready,
    ping: async () => {
      if (!database) throw new Error("offline");
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/health`)).status, 503);
    ready = true;
    assert.equal((await fetch(`${base}/health`)).status, 200);
    database = false;
    assert.equal((await fetch(`${base}/health`)).status, 503);
    assert.equal((await fetch(`${base}/unknown`)).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("un flux Discord réel simulé couvre création, menu, combat et erreurs privées", async () => {
  const game = new Game(new MemoryStore(), { random: () => 0.5 });
  const handler = createInteractionHandler(game);
  const replies = [];
  const interaction = (commandName, values = {}, extra = {}) => ({
    id: `${commandName}-${Math.random()}`,
    user: { id: "alice" },
    commandName,
    deferred: false,
    replied: false,
    inGuild: () => true,
    isAutocomplete: () => false,
    isChatInputCommand: () => true,
    isButton: () => false,
    isStringSelectMenu: () => false,
    options: {
      getString: (key) => values[key] ?? null,
      getInteger: (key) => values[key] ?? null,
      getUser: () => null,
      getSubcommand: () => values.subcommand,
    },
    async deferReply(payload) {
      this.deferred = true;
      replies.push(payload);
    },
    async editReply(payload) {
      validatePayload(payload);
      replies.push(payload);
    },
    async reply(payload) {
      this.replied = true;
      replies.push(payload);
    },
    ...extra,
  });
  await handler(
    interaction("creer", { nom: "Aelys", race: "humain", classe: "guerrier" }),
  );
  assert.equal(replies[0].flags, 64);
  assert.ok(replies[1].embeds[0].title.includes("Aelys"));
  const stranger = interaction(
    "jouer",
    {},
    {
      user: { id: "bob" },
      isChatInputCommand: () => false,
      isButton: () => true,
      customId: "rpg:alice:explore",
    },
  );
  await handler(stranger);
  assert.ok(replies.at(-1).content.includes("autre aventurier"));
});

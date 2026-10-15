import test from "node:test";
import assert from "node:assert/strict";
import { ActionRowBuilder, ModalBuilder } from "discord.js";
import {
  commands,
  routeButton,
  routeCommand,
  routeModal,
  buildModal,
  uiId,
  FORM_KINDS,
} from "../src/commands.js";
import { buildView } from "../src/views.js";
import { Game } from "../src/game.js";
import { MemoryStore } from "../src/store.js";
import { resolveRoute, createInteractionHandler } from "../src/controller.js";
import { loadConfig } from "../src/config.js";
import { createHealthServer } from "../src/health.js";

export function validateComponents(components, owner) {
  assert.ok(components.length <= 5, `Too many rows: ${components.length}`);
  const ids = new Set();
  for (const row of components) {
    new ActionRowBuilder(row).toJSON();
    assert.ok(row.components.length > 0 && row.components.length <= 5);
    for (const component of row.components) {
      assert.ok(component.custom_id.length <= 100, component.custom_id);
      assert.ok(
        !ids.has(component.custom_id),
        `Duplicate ID: ${component.custom_id}`,
      );
      ids.add(component.custom_id);
      if (component.options)
        assert.ok(
          component.options.length > 0 && component.options.length <= 25,
        );
      if (component.disabled) continue;
      const values =
        component.type === 5
          ? ["other-player"]
          : (component.options?.slice(0, 1).map((o) => o.value) ?? []);
      assert.ok(
        routeButton(component.custom_id, owner, values),
        `Unroutable component: ${component.custom_id}`,
      );
    }
  }
}

test("exactement trois commandes sans arguments : profil, marché et info", () => {
  assert.deepEqual(
    commands.map((c) => c.name),
    ["profil", "marché", "info"],
  );
  for (const command of commands) assert.ok(!command.options?.length);
  assert.equal(routeCommand({ commandName: "marché" }).action, "market");
});

test("les boutons personnels contrôlent propriétaire, action autorisée et tour", () => {
  assert.equal(routeButton(uiId("alice", "do", "buy", "lot"), "bob"), null);
  assert.equal(routeButton(uiId("alice", "do", "create"), "alice"), null);
  assert.equal(routeButton("rpg:alice:buy:lot", "alice"), null);
  assert.equal(routeButton(uiId("alice", "nav", "nonexistent"), "alice"), null);
  assert.deepEqual(
    routeButton(uiId("alice", "fight", "attack", "battle", 3), "alice"),
    { action: "combat", args: { move: "attack", battleId: "battle", turn: 3 } },
  );
});

test("tous les formulaires respectent le schéma Discord et sont liés à leur auteur", () => {
  for (const kind of FORM_KINDS) {
    const modal = buildModal("12345678901234567890", kind, [
      "haut_elfe",
      "chevalier_noir",
    ]);
    new ModalBuilder(modal).toJSON();
    assert.ok(modal.custom_id.length <= 100);
    assert.equal(
      routeModal(modal.custom_id, "bob", { getTextInputValue: () => "1" }),
      null,
    );
  }
  assert.equal(buildModal("alice", "unknown"), null);
});

test("les champs numériques refusent notation scientifique, signes et décimales", () => {
  const id = uiId("alice", "submit", "sellResource", "fer");
  for (const quantity of ["-2", "1.5", "1e4", "Infinity", ""]) {
    const route = routeModal(id, "alice", {
      getTextInputValue: (key) => (key === "quantity" ? quantity : "10"),
    });
    assert.ok(Number.isNaN(route.args.quantity));
  }
});

test("le codex reste accessible sans personnage et le marché accueille les nouveaux", async () => {
  const game = new Game(new MemoryStore());
  assert.equal(
    (await resolveRoute(game, { action: "info" }, "new")).type,
    "info",
  );
  assert.equal(
    (await resolveRoute(game, { action: "market" }, "new")).type,
    "welcome",
  );
});

test("les configurations incomplètes et le mode démo en production échouent clairement", () => {
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
  assert.equal(
    loadConfig({
      DISCORD_TOKEN: "x",
      DISCORD_CLIENT_ID: "123456789012345678",
      DEMO_MODE: "true",
    }).demo,
    true,
  );
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
    assert.equal((await fetch(`${base}/other`)).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

const fixture = () => {
  const calls = [];
  const mock = (type, options = {}) => ({
    id: `interaction-${Math.random()}`,
    user: { id: "alice" },
    commandName: "profil",
    message: type === "command" ? undefined : { id: "panel-1" },
    inGuild: () => true,
    isChatInputCommand: () => type === "command",
    isButton: () => type === "button",
    isStringSelectMenu: () => type === "select",
    isUserSelectMenu: () => type === "userSelect",
    isModalSubmit: () => type === "modal",
    isFromMessage: () => true,
    deferred: false,
    replied: false,
    async deferReply(value) {
      this.deferred = true;
      calls.push(["deferReply", value]);
    },
    async deferUpdate() {
      this.deferred = true;
      calls.push(["deferUpdate"]);
    },
    async showModal(value) {
      assert.equal(this.deferred, false);
      this.replied = true;
      calls.push(["modal", value]);
    },
    async editReply(value) {
      calls.push(["edit", value]);
    },
    async followUp(value) {
      calls.push(["followUp", value]);
    },
    ...options,
  });
  const renderer = async (result, owner) => ({
    ...buildView(result, owner),
    result,
  });
  const game = new Game(new MemoryStore(), { random: () => 0.5 });
  return {
    calls,
    mock,
    game,
    handler: createInteractionHandler(game, { renderer, cooldownMs: 0 }),
  };
};

test("parcours Discord complet : accueil, race, classe, formulaire et création sans autre slash", async () => {
  const { calls, mock, handler, game } = fixture();
  await handler(mock("command"));
  assert.equal(calls.at(-1)[1].result.type, "welcome");
  await handler(
    mock("button", { customId: uiId("alice", "nav", "creationRace") }),
  );
  await handler(
    mock("select", { customId: uiId("alice", "race"), values: ["haut_elfe"] }),
  );
  assert.equal(calls.at(-1)[1].result.raceId, "haut_elfe");
  await handler(
    mock("select", {
      customId: uiId("alice", "class", "haut_elfe"),
      values: ["mage"],
    }),
  );
  await handler(
    mock("button", {
      customId: uiId("alice", "form", "create", "haut_elfe", "mage"),
    }),
  );
  const modal = calls.at(-1)[1];
  assert.equal(calls.at(-1)[0], "modal");
  await handler(
    mock("modal", {
      customId: modal.custom_id,
      fields: { getTextInputValue: () => "Aelys" },
    }),
  );
  assert.equal(calls.at(-1)[1].result.type, "profile");
  assert.equal((await game.execute("profile", "alice")).p.classId, "mage");
  assert.ok(calls.some(([kind]) => kind === "deferUpdate"));
});

test("une erreur de bouton conserve le panneau et répond avec un panneau privé", async () => {
  const { calls, mock, handler, game } = fixture();
  await game.execute("create", "alice", {
    name: "Aelys",
    raceId: "humain",
    classId: "guerrier",
  });
  await handler(
    mock("button", { customId: uiId("alice", "do", "buy", "missing") }),
  );
  assert.equal(calls.at(-1)[0], "followUp");
  assert.equal(calls.at(-1)[1].flags, 64);
  assert.equal(calls.at(-1)[1].result.type, "error");
});

test("un autre joueur reçoit son propre panneau sans modifier celui du propriétaire", async () => {
  const { calls, mock, handler } = fixture();
  await handler(mock("button", { customId: uiId("bob", "nav", "profile") }));
  assert.equal(calls[0][0], "deferReply");
  assert.equal(calls[0][1].flags, 64);
  assert.equal(calls.at(-1)[1].result.type, "error");
});

test("les menus de sélection de membre dirigent vers les cadeaux", async () => {
  const { calls, mock, handler, game } = fixture();
  for (const id of ["alice", "bob"])
    await game.execute("create", id, {
      name: "Veilleur",
      raceId: "humain",
      classId: "guerrier",
    });
  await handler(
    mock("userSelect", {
      customId: uiId("alice", "giftTarget"),
      values: ["bob"],
    }),
  );
  assert.equal(calls.at(-1)[1].result.target.id, "bob");
});

test("une ancienne image lente ne remplace pas la navigation plus récente", async () => {
  const { game, mock, calls } = fixture();
  await game.execute("create", "alice", {
    name: "Aelys",
    raceId: "humain",
    classId: "guerrier",
  });
  let release, started;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  const rendering = new Promise((resolve) => {
    started = resolve;
  });
  const handler = createInteractionHandler(game, {
    cooldownMs: 0,
    renderer: async (result) => {
      if (result.type === "profile") {
        started();
        await waiting;
      }
      return { type: result.type };
    },
  });
  const older = handler(
    mock("button", { customId: uiId("alice", "nav", "profile") }),
  );
  await rendering;
  await handler(mock("button", { customId: uiId("alice", "nav", "market") }));
  release();
  await older;
  assert.deepEqual(
    calls
      .filter(([kind]) => kind === "edit")
      .map(([, payload]) => payload.type),
    ["market"],
  );
});

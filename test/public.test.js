import test from "node:test";
import assert from "node:assert/strict";
import { ActionRowBuilder } from "discord.js";
import { loadImage } from "@napi-rs/canvas";
import { Game } from "../src/game.js";
import { MemoryStore } from "../src/store.js";
import { resolveRoute, createInteractionHandler } from "../src/controller.js";
import {
  routeCommand,
  routeComponent,
  publicId,
  uiId,
} from "../src/commands.js";
import { buildView, render } from "../src/views.js";
import { activityFor } from "../src/public.js";

async function fixture() {
  const game = new Game(new MemoryStore(), { random: () => 0.5 });
  for (const id of ["alice", "bob"])
    await game.execute("create", id, {
      name: id === "alice" ? "Aelys" : "Borin",
      raceId: "humain",
      classId: "guerrier",
    });
  const calls = [];
  const mock = (type, options = {}) => ({
    id: `interaction-${Math.random()}`,
    user: { id: "alice" },
    commandName: "profil",
    message:
      type === "command"
        ? undefined
        : { id: "panel", flags: { has: () => true } },
    inGuild: () => true,
    isChatInputCommand: () => type === "command",
    isButton: () => type === "button",
    isStringSelectMenu: () => type === "select",
    isUserSelectMenu: () => false,
    isModalSubmit: () => false,
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
    async editReply(value) {
      calls.push(["edit", value]);
    },
    async followUp(value) {
      calls.push(["followUp", value]);
    },
    ...options,
  });
  const handler = createInteractionHandler(game, {
    cooldownMs: 0,
    renderer: async (result, owner) => ({
      ...buildView(result, owner),
      result,
    }),
  });
  return { game, calls, mock, handler };
}
const lastEdit = (calls) => calls.filter(([kind]) => kind === "edit").at(-1)[1];

test("profil, marché et info sont publics ; social reste privé", async () => {
  const { calls, mock, handler } = await fixture();
  for (const commandName of ["profil", "marché", "info", "social"]) {
    calls.length = 0;
    await handler(mock("command", { commandName }));
    assert.equal(calls[0][0], "deferReply");
    assert.equal(calls[0][1].flags, commandName === "social" ? 64 : 0);
    assert.equal(
      calls.some(([kind]) => kind === "followUp"),
      false,
    );
  }
});

test("/profil joueur consulte un héros sans exiger son propre personnage", async () => {
  const { game, calls, mock, handler } = await fixture();
  const interaction = mock("command", {
    user: { id: "newcomer" },
    options: { getUser: () => ({ id: "bob" }) },
  });
  assert.equal(routeCommand(interaction).args.targetId, "bob");
  await handler(interaction);
  assert.equal(lastEdit(calls).result.target.name, "Borin");
  assert.equal(
    (
      await resolveRoute(
        game,
        { action: "publicProfile", args: { targetId: "unknown" } },
        "newcomer",
      )
    ).type,
    "publicWelcome",
  );
});

test("la projection publique révèle uniquement l’équipement porté et aucun contenu privé", async () => {
  const { game } = await fixture();
  await game.store.transaction(async (tx) => {
    const p = await tx.get("player", "bob");
    p.gold = 987654;
    p.bag.gold = 876543;
    p.resources.bois = 765432;
    p.social.friends = ["SECRET-FRIEND"];
    p.social.blocked = ["SECRET-BLOCK"];
    p.gear.push({ ...p.gear[0], id: "hidden", name: "SECRET-ITEM" });
    await tx.set("player", p.id, p);
  });
  const result = await resolveRoute(
    game,
    { action: "publicProfile", args: { targetId: "bob" } },
    "alice",
  );
  const json = JSON.stringify(result);
  for (const secret of [
    "987654",
    "876543",
    "765432",
    "SECRET-FRIEND",
    "SECRET-BLOCK",
    "SECRET-ITEM",
  ])
    assert.ok(!json.includes(secret), secret);
  for (const key of [
    "p",
    "gold",
    "bag",
    "resources",
    "friends",
    "blocked",
    "gear",
  ])
    assert.equal(Object.hasOwn(result.target, key), false);
  assert.ok(result.target.equipment[0].label.includes("premier serment"));
});

test("tout visiteur ouvre son carnet privé sans remplacer le profil public", async () => {
  const { calls, mock, handler } = await fixture();
  for (const id of ["alice", "bob"]) {
    calls.length = 0;
    await handler(
      mock("button", {
        user: { id },
        customId: publicId("profile"),
        message: { id: "shared", flags: { has: () => false } },
      }),
    );
    assert.deepEqual(calls[0], ["deferReply", { flags: 64 }]);
    assert.equal(lastEdit(calls).result.p.id, id);
    assert.equal(
      calls.some(([kind]) => kind === "deferUpdate"),
      false,
    );
  }
});

test("un bouton ancien sur un message public ouvre aussi une réponse privée", async () => {
  const { calls, mock, handler } = await fixture();
  await handler(
    mock("button", {
      customId: uiId("alice", "nav", "inventory"),
      message: { id: "legacy", flags: { has: () => false } },
    }),
  );
  assert.equal(calls[0][1].flags, 64);
  assert.equal(lastEdit(calls).result.type, "inventory");
});

test("les contrôles publics refusent toutes les mutations et les listes ouvrent le bon lot", () => {
  for (const action of [
    "do",
    "buy",
    "combat",
    "form",
    "submit",
    "citySiege",
    "friendRespond",
  ])
    assert.equal(routeComponent(publicId(action, "bob"), "alice"), null);
  assert.deepEqual(routeComponent(publicId("listing"), "bob", ["lot-id"]), {
    action: "listing",
    args: { listingId: "lot-id" },
  });
  assert.equal(
    routeComponent(publicId("chapter"), "bob", ["races"]).action,
    "codex",
  );
  assert.equal(routeComponent(publicId("chapter"), "bob", ["private"]), null);
});

test("une construction annonce son résultat une fois et les interactions privées restent silencieuses", async () => {
  const { game, calls, mock, handler } = await fixture();
  const click = {
    id: "one-build",
    customId: uiId("alice", "do", "build", 1, "caserne"),
  };
  await handler(mock("button", click));
  await handler(mock("button", click));
  const announcements = calls.filter(
    ([kind, value]) => kind === "followUp" && value.flags === 0,
  );
  assert.equal(announcements.length, 1);
  assert.ok(announcements[0][1].result.text.includes("Caserne"));
  assert.equal(announcements[0][1].result.p, undefined);
  calls.length = 0;
  await handler(
    mock("button", { customId: uiId("alice", "do", "friendRequest", "bob") }),
  );
  assert.equal(
    calls.some(([kind]) => kind === "followUp"),
    false,
  );
  assert.equal((await game.execute("inboxInfo", "bob")).incoming.length, 1);
});

test("les tours ordinaires restent privés, les fins de combat et duels sont annoncées", async () => {
  const { game } = await fixture();
  await game.execute("travel", "alice", { zoneId: 0 });
  await game.execute("explore", "alice");
  let before = (await game.execute("profile", "alice")).p;
  let result = await resolveRoute(
    game,
    { action: "combat", args: { move: "attack" } },
    "alice",
  );
  assert.equal(result.activity, undefined);
  result = await resolveRoute(
    game,
    { action: "combat", args: { move: "flee" } },
    "alice",
  );
  assert.ok(result.activity.text.includes(before.battle.enemy.name));
  assert.equal(result.activity.text.includes("or"), false);
  await game.execute("returnHome", "alice");
  const { duel } = await game.execute("duelChallenge", "alice", {
    targetId: "bob",
  });
  result = await resolveRoute(
    game,
    { action: "duelRespond", args: { duelId: duel.id, response: "accept" } },
    "bob",
  );
  assert.equal(result.activity.type, "publicActivity");
  assert.ok(
    result.activity.text.includes("Aelys") &&
      result.activity.text.includes("Borin"),
  );
  assert.equal(activityFor("gift", {}, result, before), null);
});

test("profils, marché, codex et annonces produisent des PNG avec contrôles publics uniques", async () => {
  const { game } = await fixture();
  await game.execute("sell", "bob", {
    resource: "bois",
    quantity: 3,
    price: 20,
  });
  const results = [
    await resolveRoute(
      game,
      { action: "publicProfile", args: { targetId: "bob" } },
      "alice",
    ),
    await resolveRoute(
      game,
      { action: "publicProfile", args: { targetId: "missing" } },
      "alice",
    ),
    await resolveRoute(game, { action: "publicMarket" }, "newcomer"),
    {
      ...(await resolveRoute(game, { action: "info" }, "alice")),
      public: true,
    },
    {
      ...(await resolveRoute(
        game,
        { action: "codex", args: { category: "races", page: 1 } },
        "alice",
      )),
      public: true,
    },
    {
      type: "publicActivity",
      actorId: "alice",
      actorName: "Aelys",
      level: 1,
      title: "Une victoire",
      text: "Le gardien a été vaincu.",
      background: "social",
    },
  ];
  for (const result of results) {
    const payload = await render(result, "alice");
    assert.ok(payload.files[0].attachment.length < 8_000_000);
    assert.equal(payload.files[0].attachment.subarray(1, 4).toString(), "PNG");
    if (result.type === "publicActivity") {
      const png = await loadImage(payload.files[0].attachment);
      assert.ok(png.height < 760 && png.height >= 360);
    }
    const ids = new Set();
    assert.ok(payload.components.length <= 5);
    for (const row of payload.components) {
      new ActionRowBuilder(row).toJSON();
      for (const c of row.components) {
        assert.ok(c.custom_id.startsWith("tdnp:"));
        assert.ok(!ids.has(c.custom_id), c.custom_id);
        ids.add(c.custom_id);
        assert.ok(
          routeComponent(
            c.custom_id,
            "bob",
            c.options?.slice(0, 1).map((o) => o.value) ?? [],
          ),
          c.custom_id,
        );
      }
    }
  }
});

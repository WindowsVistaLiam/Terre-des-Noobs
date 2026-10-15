import test from "node:test";
import assert from "node:assert/strict";
import { ActionRowBuilder, ModalBuilder } from "discord.js";
import { Game, statsOf } from "../src/game.js";
import { MemoryStore } from "../src/store.js";
import { buildView } from "../src/views.js";
import {
  routeCommand,
  routeComponent,
  routeModal,
  buildModal,
} from "../src/commands.js";
import { resolveRoute } from "../src/controller.js";

const A = "11111111111111111111",
  B = "22222222222222222222",
  C = "33333333333333333333";
async function setup() {
  const game = new Game(new MemoryStore(), { random: () => 0.5 });
  for (const [id, name] of [
    [A, "Aelys"],
    [B, "Borin"],
    [C, "Cerys"],
  ]) {
    await game.execute("create", id, {
      name,
      raceId: "humain",
      classId: "guerrier",
    });
    await game.store.transaction(async (tx) => {
      const p = await tx.get("player", id);
      p.level = 20;
      p.gold = 50000;
      p.hp = statsOf(p).hp;
      for (const key of ["bois", "pierre", "fer", "herbe", "essence"])
        p.resources[key] = 1000;
      await tx.set("player", id, p);
    });
  }
  return game;
}
function validate(view, owner) {
  assert.ok(
    view.components.length <= 5,
    `${view.screen.title}: ${view.components.length} rows`,
  );
  const ids = new Set();
  for (const row of view.components) {
    new ActionRowBuilder(row).toJSON();
    for (const c of row.components) {
      assert.ok(!ids.has(c.custom_id), `Duplicate ${c.custom_id}`);
      ids.add(c.custom_id);
      assert.ok(c.custom_id.length <= 100, c.custom_id);
      if (c.disabled) continue;
      for (const value of c.options?.map((o) => [o.value]) ?? [
        c.type === 5 ? [B] : [],
      ]) {
        const route = routeComponent(c.custom_id, owner, value);
        assert.ok(route, c.custom_id);
        if (route.action === "form")
          new ModalBuilder(
            buildModal(owner, route.kind, route.params),
          ).toJSON();
      }
    }
  }
}
async function view(game, action, args = {}, owner = A) {
  const result = await resolveRoute(game, { action, args }, owner);
  const built = buildView(result, owner);
  validate(built, owner);
  return built;
}
const controls = (v) => v.components.flatMap((r) => r.components);
function click(v, label, owner = A) {
  const c = controls(v).find((c) => c.label === label);
  assert.ok(c && !c.disabled, label);
  return routeComponent(c.custom_id, owner);
}
function choose(v, action, value, owner = A) {
  const c = controls(v).find(
    (c) => c.custom_id.split(":")[2] === action && c.type === 3,
  );
  assert.ok(
    c?.options.some((o) => o.value === value),
    `${action}/${value}`,
  );
  return routeComponent(c.custom_id, owner, [value]);
}
const follow = async (g, route, owner = A) => {
  const r = await resolveRoute(g, route, owner);
  const v = buildView(r, owner);
  validate(v, owner);
  return v;
};

test("/social mène aux amis, à la demande puis à son acceptation sans autre commande", async () => {
  const g = await setup();
  let v = await follow(g, routeCommand({ commandName: "social" }));
  assert.equal(v.screen.background, "social");
  v = await follow(g, click(v, "Rencontrer des joueurs"));
  v = await follow(g, choose(v, "player", B));
  v = await follow(g, click(v, "Demande d’amitié"));
  const mail = await g.execute("inboxInfo", B);
  v = await view(g, "inbox", {}, B);
  v = await follow(
    g,
    choose(v, "notification", `friend|${mail.incoming[0].id}`, B),
    B,
  );
  v = await follow(g, click(v, "Accepter", B), B);
  assert.equal((await g.execute("friendsInfo", A)).entries[0].id, B);
});

test("les menus de duels réservent acceptation et refus au destinataire", async () => {
  const g = await setup();
  let v = await view(g, "playerCard", { targetId: B });
  v = await follow(g, click(v, "Proposer un duel"));
  assert.ok(controls(v).some((c) => c.label === "Retirer mon défi"));
  const duel = (await g.execute("duelsInfo", A)).entries[0];
  v = await view(g, "duel", { duelId: duel.id }, B);
  v = await follow(g, click(v, "Accepter le duel", B), B);
  assert.ok(v.screen.subtitle.includes("Duel terminé"));
  await view(g, "pvpLeaderboard");
});

test("guilde → membres → officier → cité → matériaux → construction", async () => {
  const g = await setup();
  const guild = (await g.execute("guildCreate", A, { name: "Les Veilleurs" }))
    .guild;
  await g.execute("guildJoin", B, { guildId: guild.id });
  await g.execute("guildDonate", A, { gold: 2000 });
  let v = await view(g, "guildInfo");
  v = await follow(g, click(v, "Membres & officiers"));
  v = await follow(g, choose(v, "guildMember", B));
  v = await follow(g, click(v, "Nommer officier"));
  assert.ok((await g.execute("guildInfo", A)).guild.officers.includes(B));
  v = await view(g, "city");
  for (const [resource, quantity] of [
    ["bois", "25"],
    ["pierre", "40"],
    ["fer", "10"],
  ]) {
    const route = choose(v, "cityDonate", resource);
    const modal = buildModal(A, route.kind, route.params);
    v = await follow(
      g,
      routeModal(modal.custom_id, A, { getTextInputValue: () => quantity }),
    );
  }
  v = await follow(g, choose(v, "cityPlan", "remparts"));
  v = await follow(g, click(v, "Améliorer la construction"));
  assert.equal(
    (await g.execute("cityInfo", A)).guild.city.buildings.remparts,
    1,
  );
  v = await follow(g, click(v, "Défendre ensemble"));
  v = await follow(g, click(v, "Assaut"));
  assert.ok(
    (await g.execute("cityInfo", A)).guild.city.invasion.contributions[A] > 0,
  );
});

test("les invitations de guilde se retrouvent et se valident dans la réception", async () => {
  const g = await setup();
  const guild = (await g.execute("guildCreate", A, { name: "Les Veilleurs" }))
    .guild;
  let v = await view(g, "playerCard", { targetId: C });
  v = await follow(g, click(v, "Inviter dans ma guilde"));
  const r = (await g.execute("inboxInfo", C)).invitations[0];
  v = await view(g, "inbox", {}, C);
  v = await follow(g, choose(v, "notification", `guild|${r.id}`, C), C);
  v = await follow(g, click(v, "Accepter", C), C);
  assert.equal((await g.execute("profile", C)).p.guildId, guild.id);
});

test("tous les écrans sociaux, confirmations et sièges ont des composants uniques et routables", async () => {
  const g = await setup();
  const one = (await g.execute("guildCreate", A, { name: "Les Veilleurs" }))
    .guild.id;
  await g.execute("guildJoin", B, { guildId: one });
  const two = (await g.execute("guildCreate", C, { name: "Les Sentinelles" }))
    .guild.id;
  await g.execute("guildDonate", A, { gold: 2000 });
  await g.execute("cityWarToggle", A);
  await g.execute("cityWarToggle", C);
  await g.execute("friendRequest", A, { targetId: B });
  await g.execute("friendRespond", B, {
    requestId: `${A}.${B}`,
    response: "accept",
  });
  for (const action of [
    "social",
    "friends",
    "directory",
    "blocked",
    "inbox",
    "duels",
    "pvpLeaderboard",
    "guildInfo",
    "guildRoster",
    "city",
    "cityDefensePlan",
    "cityTargets",
  ])
    await view(g, action);
  await view(g, "playerCard", { targetId: B });
  await view(g, "guildMember", { targetId: B });
  await view(g, "cityPlan", { buildingId: "remparts" });
  let v = await view(g, "siegePreview", { guildId: two });
  v = await follow(g, click(v, "Engager le siège…"));
  v = await follow(g, click(v, "Confirmer"));
  assert.ok(v.screen.title.includes("contre"));
  for (const kind of [
    "friendRemove",
    "blockPlayer",
    "guildKick",
    "cityWarToggle",
    "citySiege",
  ])
    await view(g, "confirm", { kind, value: kind === "citySiege" ? two : B });
});

test("les nouvelles routes privées refusent demandes, duels et gestion d’autres guildes", async () => {
  const g = await setup();
  await g.execute("friendRequest", A, { targetId: B });
  await assert.rejects(
    resolveRoute(
      g,
      { action: "requestPreview", args: { kind: "friend", key: `${A}.${B}` } },
      C,
    ),
    /appartient/,
  );
  await assert.rejects(resolveRoute(g, { action: "guildRoster" }, A), /guilde/);
  const { duel } = await g.execute("duelChallenge", A, { targetId: B });
  await assert.rejects(
    resolveRoute(g, { action: "duel", args: { duelId: duel.id } }, C),
    /appartient/,
  );
});

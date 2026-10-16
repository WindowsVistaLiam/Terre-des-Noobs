import test from "node:test";
import assert from "node:assert/strict";
import { ActionRowBuilder } from "discord.js";
import { Game, statsOf } from "../src/game.js";
import { MemoryStore } from "../src/store.js";
import { RACES, CLASSES, SHOP } from "../src/content.js";
import { buildView } from "../src/views.js";
import { resolveRoute } from "../src/controller.js";
import {
  routeComponent,
  routeModal,
  buildModal,
  uiId,
} from "../src/commands.js";

const OWNER = "12345678901234567890";
const create = (game, id = OWNER) =>
  game.execute("create", id, {
    name: "Aelys",
    raceId: "humain",
    classId: "guerrier",
  });
async function wealthy(game, id = OWNER) {
  await game.store.transaction(async (tx) => {
    const p = await tx.get("player", id);
    p.level = 35;
    p.gold = 100000;
    p.talentPoints = 5;
    for (const key of [
      "bois",
      "pierre",
      "fer",
      "herbe",
      "cuir",
      "essence",
      "cristal",
      "perle",
      "ecaille",
      "insigne",
    ])
      p.resources[key] = 1000;
    p.hp = statsOf(p).hp;
    p.mana = statsOf(p).mana;
    await tx.set("player", id, p);
  });
}
function controls(view) {
  return view.components.flatMap((row) => row.components);
}
function click(view, label) {
  const button = controls(view).find((c) => c.type === 2 && c.label === label);
  const menu = controls(view).find((c) => c.options?.some((o) => o.label === label));
  const option = menu?.options.find((o) => o.label === label);
  const control = button ?? menu;
  assert.ok(control && !control.disabled, `Action unavailable: ${label}`);
  const route = routeComponent(control.custom_id, OWNER, option ? [option.value] : []);
  assert.ok(route, label);
  return route;
}
function select(view, type, value) {
  const control = controls(view).find(
    (c) => c.type === 3 && c.custom_id.split(":")[2] === type,
  );
  assert.ok(
    control?.options.find((o) => o.value === String(value)),
    `Option unavailable: ${type}/${value}`,
  );
  const route = routeComponent(control.custom_id, OWNER, [String(value)]);
  assert.ok(route);
  return route;
}
const viewFor = async (game, route) =>
  buildView(await resolveRoute(game, route, OWNER), OWNER);
async function submit(game, route, fields) {
  assert.equal(route.action, "form");
  const modal = buildModal(OWNER, route.kind, route.params);
  const action = routeModal(modal.custom_id, OWNER, {
    getTextInputValue: (key) => fields[key] ?? "",
  });
  return viewFor(game, action);
}
function validate(view) {
  assert.ok(view.components.length <= 5, view.screen.title);
  const ids = new Set();
  for (const row of view.components) {
    new ActionRowBuilder(row).toJSON();
    for (const c of row.components) {
      assert.ok(
        !ids.has(c.custom_id),
        `Duplicate ${c.custom_id} in ${view.screen.title}`,
      );
      ids.add(c.custom_id);
      assert.ok(c.custom_id.length <= 100, c.custom_id);
      if (c.disabled) continue;
      if (c.options)
        for (const option of c.options)
          assert.ok(
            routeComponent(c.custom_id, OWNER, [option.value]),
            c.custom_id,
          );
      else
        assert.ok(
          routeComponent(c.custom_id, OWNER, c.type === 5 ? ["friend"] : []),
          c.custom_id,
        );
    }
  }
}

test("tous les états d’accueil et les 288 choix race/classe ont une navigation valide", async () => {
  const game = new Game(new MemoryStore());
  for (const action of ["profile", "market", "info", "welcome", "creationRace"])
    validate(await viewFor(game, { action }));
  for (const raceId of Object.keys(RACES)) {
    validate(
      await viewFor(game, { action: "creationClass", args: { raceId } }),
    );
    for (const classId of Object.keys(CLASSES))
      validate(
        await viewFor(game, {
          action: "creationReview",
          args: { raceId, classId },
        }),
      );
  }
});

test("profil → refuge → construction → amélioration → démolition avec confirmation", async () => {
  const game = new Game(new MemoryStore());
  await create(game);
  await wealthy(game);
  let view = await viewFor(game, { action: "profile" });
  view = await viewFor(game, click(view, "⌂ Mon refuge"));
  view = await viewFor(game, select(view, "slot", 1));
  view = await viewFor(game, select(view, "building", "scierie"));
  assert.match(view.screen.title, /Scierie/);
  view = await viewFor(game, click(view, "Construire"));
  view = await viewFor(game, select(view, "slot", 1));
  view = await viewFor(game, click(view, "Améliorer le bâtiment"));
  assert.equal((await game.execute("profile", OWNER)).p.buildings[0].level, 2);
  view = await viewFor(game, select(view, "slot", 1));
  view = await viewFor(game, click(view, "Démolir…"));
  assert.match(view.screen.title, /Libérer/);
  view = await viewFor(game, click(view, "Confirmer"));
  assert.equal((await game.execute("profile", OWNER)).p.buildings[0], null);
  validate(view);
});

test("profil → aventure → carte → rencontre → tous les tours → retour au refuge", async () => {
  const game = new Game(new MemoryStore(), { random: () => 0.5 });
  await create(game);
  let view = await viewFor(game, { action: "profile" });
  view = await viewFor(game, click(view, "⚔ Partir à l’aventure"));
  view = await viewFor(game, click(view, "Ouvrir la carte"));
  view = await viewFor(game, select(view, "zone", 0));
  view = await viewFor(game, click(view, "Choisir un ennemi"));
  validate(view);
  view = await viewFor(game, select(view, "encounter", "normal|0"));
  let turns = 0,
    stale;
  while ((await game.execute("profile", OWNER)).p.battle) {
    validate(view);
    const route = click(view, "⚔ Attaquer");
    stale ??= route;
    view = await viewFor(game, route);
    assert.ok(++turns < 20);
  }
  assert.ok(turns > 0);
  await assert.rejects(resolveRoute(game, stale, OWNER), /Aucun combat/);
  view = await viewFor(game, click(view, "Rentrer et sécuriser"));
  assert.equal((await game.execute("profile", OWNER)).p.location, "base");
  validate(view);
});

test("marché → ressources → formulaire de vente → annonce → achat par un ami", async () => {
  const game = new Game(new MemoryStore());
  await create(game);
  await create(game, "friend");
  let view = await viewFor(game, { action: "market" });
  view = await viewFor(game, click(view, "Ressources / vendre"));
  const route = select(view, "sellResource", "fer");
  view = await submit(game, route, { quantity: "4", price: "21" });
  validate(view);
  const listingId = (await game.execute("market", OWNER)).listings[0].id;
  view = await viewFor(game, select(view, "listing", listingId));
  validate(view);
  assert.ok(controls(view).some((c) => c.label === "Retirer mon annonce"));
  const friendView = buildView(
    await resolveRoute(
      game,
      { action: "listing", args: { listingId } },
      "friend",
    ),
    "friend",
  );
  const buy = controls(friendView).find((c) => c.label === "Acheter · 21 or");
  await resolveRoute(game, routeComponent(buy.custom_id, "friend"), "friend");
  assert.equal((await game.execute("profile", "friend")).p.resources.fer, 12);
});

test("coffre → objet → déséquiper → enchanter → vendre et retirer le lot", async () => {
  const game = new Game(new MemoryStore());
  await create(game);
  await wealthy(game);
  await game.execute("build", OWNER, { buildingId: "forge", slot: 1 });
  let view = await viewFor(game, { action: "inventory" });
  const itemId = (await game.execute("inventory", OWNER)).p.gear[0].id;
  view = await viewFor(game, select(view, "item", itemId));
  view = await viewFor(game, click(view, "Déséquiper"));
  view = await viewFor(game, select(view, "item", itemId));
  view = await viewFor(game, click(view, "Enchanter"));
  assert.equal((await game.execute("inventory", OWNER)).p.gear[0].upgrade, 1);
  view = await submit(game, click(view, "Vendre…"), { price: "75" });
  const l = (await game.execute("market", OWNER)).listings[0];
  view = await viewFor(game, select(view, "listing", l.id));
  view = await viewFor(game, click(view, "Retirer mon annonce"));
  assert.equal((await game.execute("inventory", OWNER)).p.gear[0].id, itemId);
  validate(view);
});

test("atelier → recette → quantité → fabrication, puis recyclage confirmé", async () => {
  const game = new Game(new MemoryStore());
  await create(game);
  await wealthy(game);
  let view = await viewFor(game, { action: "crafting" });
  view = await viewFor(game, select(view, "recipe", "lame"));
  validate(view);
  view = await submit(game, click(view, "Fabriquer…"), { quantity: "2" });
  const { p } = await game.execute("profile", OWNER);
  assert.equal(p.gear.length, 3);
  view = await viewFor(game, select(view, "item", p.gear[1].id));
  view = await viewFor(game, click(view, "Recycler…"));
  view = await viewFor(game, click(view, "Confirmer"));
  assert.equal((await game.execute("inventory", OWNER)).p.gear.length, 2);
  validate(view);
});

test("marchand → provision → achat d’un lot, fonds et quantités contrôlés", async () => {
  const game = new Game(new MemoryStore());
  await create(game);
  let view = await viewFor(game, { action: "store" });
  view = await viewFor(game, select(view, "shop", "potion"));
  view = await submit(game, click(view, "Acheter des provisions…"), {
    quantity: "3",
  });
  const { p } = await game.execute("profile", OWNER);
  assert.equal(p.resources.potion, 8);
  assert.equal(p.gold, 96);
  for (const quantity of [0, -1, 101, 1.5, NaN])
    await assert.rejects(
      game.execute("shopBuy", OWNER, { resource: "potion", quantity }),
    );
  await assert.rejects(
    game.execute("shopBuy", OWNER, { resource: "potion", quantity: 100 }),
    /manque/,
  );
  assert.equal((await game.execute("profile", OWNER)).p.gold, 96);
  validate(view);
});

test("compagnons → guilde → création → don → amélioration → départ confirmé", async () => {
  const game = new Game(new MemoryStore());
  await create(game);
  await wealthy(game);
  let view = await viewFor(game, { action: "social" });
  view = await viewFor(game, click(view, "Ma guilde"));
  view = await submit(game, click(view, "Fonder une guilde…"), {
    name: "Les Veilleurs",
  });
  validate(view);
  view = await submit(game, click(view, "Contribuer…"), { gold: "500" });
  view = await viewFor(game, click(view, "Améliorer la guilde"));
  assert.match(view.screen.subtitle, /niveau 2/);
  view = await viewFor(game, click(view, "Quitter…"));
  view = await viewFor(game, click(view, "Confirmer"));
  assert.equal((await game.execute("profile", OWNER)).p.guildId, null);
  validate(view);
});

test("groupes ouverts → consentement au raid → lancement et récompenses collectives", async () => {
  const game = new Game(new MemoryStore(), { random: () => 0.5 });
  await create(game);
  await wealthy(game);
  await create(game, "friend");
  await wealthy(game, "friend");
  const { party } = await game.execute("partyCreate", "friend", { raidId: 0 });
  let view = await viewFor(game, { action: "parties" });
  view = await viewFor(game, select(view, "party", party.id));
  assert.ok(
    view.screen.cards.some((c) => c.text.includes("20 de ton énergie")),
  );
  view = await viewFor(game, click(view, "Accepter et rejoindre"));
  await game.execute("partyLeave", "friend");
  await game.execute("partyJoin", "friend", { partyId: party.id });
  view = await viewFor(game, { action: "partyInfo" });
  view = await viewFor(game, click(view, "Lancer le raid…"));
  validate(view);
  view = await viewFor(game, click(view, "Confirmer"));
  validate(view);
  assert.equal((await game.execute("profile", OWNER)).p.raids, 1);
});

test("les chapitres, pages de coffre et états sociaux restent tous navigables", async () => {
  const game = new Game(new MemoryStore());
  await create(game);
  await wealthy(game);
  await game.store.transaction(async (tx) => {
    const p = await tx.get("player", OWNER);
    p.gear.push(...Array.from({ length: 99 }, () => game.generateGear(10)));
    await tx.set("player", OWNER, p);
  });
  for (const action of [
    "profile",
    "map",
    "campaign",
    "base",
    "talents",
    "quests",
    "social",
    "guildInfo",
    "partyInfo",
    "guilds",
    "parties",
    "leaderboard",
    "resources",
    "crafting",
    "store",
    "info",
    "giftOptions",
  ])
    validate(await viewFor(game, { action }));
  for (let page = 1; page <= 17; page++)
    validate(await viewFor(game, { action: "inventory", args: { page } }));
  for (const category of [
    "races",
    "classes",
    "items",
    "metiers",
    "batiments",
    "recettes",
    "raids",
    "regles",
  ])
    for (let page = 1; page <= 7; page++)
      validate(
        await viewFor(game, { action: "codex", args: { category, page } }),
      );
});

test("les routes UI refusent les paramètres invalides et ne révèlent pas le coffre d’autrui", async () => {
  const game = new Game(new MemoryStore());
  await create(game);
  for (const args of [{ slot: 0 }, { slot: 4 }, { slot: NaN }])
    await assert.rejects(resolveRoute(game, { action: "slot", args }, OWNER));
  await assert.rejects(
    resolveRoute(
      game,
      { action: "building", args: { slot: 1, buildingId: "nid_draconique" } },
      OWNER,
    ),
  );
  await assert.rejects(
    resolveRoute(
      game,
      { action: "item", args: { itemId: "not-owned" } },
      OWNER,
    ),
  );
  await assert.rejects(
    resolveRoute(game, { action: "market", args: { page: NaN } }, OWNER),
  );
  await assert.rejects(
    resolveRoute(
      game,
      { action: "giftOptions", args: { targetId: OWNER } },
      OWNER,
    ),
  );
  for (const key of Object.keys(SHOP)) assert.ok(SHOP[key].price > 0);
});

test("les cadeaux et dons de ressources passent par la sélection d’ami et les formulaires", async () => {
  const game = new Game(new MemoryStore());
  await create(game);
  await create(game, "friend");
  let view = await viewFor(game, { action: "social" });
  view = await viewFor(game, click(view, "Offrir un cadeau"));
  const targetControl = controls(view).find((c) => c.type === 5);
  view = await viewFor(
    game,
    routeComponent(targetControl.custom_id, OWNER, ["friend"]),
  );
  view = await submit(game, click(view, "Offrir de l’or…"), { gold: "25" });
  assert.equal((await game.execute("profile", "friend")).p.gold, 175);
  view = await viewFor(game, {
    action: "giftOptions",
    args: { targetId: "friend" },
  });
  view = await submit(game, select(view, "giftResource", "fer"), {
    quantity: "3",
  });
  assert.equal((await game.execute("profile", "friend")).p.resources.fer, 11);
  validate(view);
});

test("les talents, provisions, potions et récompenses de contrat sont accessibles dans les menus", async () => {
  const game = new Game(new MemoryStore());
  await create(game);
  await wealthy(game);
  let view = await viewFor(game, { action: "profile" });
  view = await viewFor(game, click(view, "Talents"));
  view = await viewFor(game, click(view, "Force +2"));
  assert.equal((await game.execute("profile", OWNER)).p.talents.attack, 1);
  view = await viewFor(game, { action: "profile" });
  view = await viewFor(game, click(view, "Récupérer les provisions"));
  assert.equal((await game.execute("profile", OWNER)).p.streak, 1);
  await game.store.transaction(async (tx) => {
    const p = await tx.get("player", OWNER);
    p.hp = 1;
    p.quests.kills = 5;
    await tx.set("player", OWNER, p);
  });
  view = await viewFor(game, { action: "resources" });
  view = await viewFor(game, click(view, "Boire une potion"));
  assert.ok((await game.execute("profile", OWNER)).p.hp > 1);
  view = await viewFor(game, { action: "quests" });
  view = await viewFor(game, click(view, "Chasse aux ombres"));
  assert.ok(
    (await game.execute("profile", OWNER)).p.quests.claimed.includes("kills"),
  );
  validate(view);
});

import test from "node:test";
import assert from "node:assert/strict";
import { Game, GameError, statsOf } from "../src/game.js";
import { MemoryStore } from "../src/store.js";
import { RACES, CLASSES, BUILDINGS, DAY, HOUR } from "../src/content.js";

const initialTime = Date.UTC(2026, 9, 15, 12);
function setup(random = () => 0.5) {
  let time = initialTime;
  const store = new MemoryStore();
  const game = new Game(store, { random, now: () => time });
  return {
    store,
    game,
    advance: (ms) => {
      time += ms;
    },
  };
}
async function create(game, id = "alice", options = {}) {
  return (
    await game.execute("create", id, {
      name: "Aelys",
      raceId: "humain",
      classId: "guerrier",
      ...options,
    })
  ).p;
}
async function edit(store, id, fn) {
  return store.transaction(async (tx) => {
    const p = await tx.get("player", id);
    fn(p);
    await tx.set("player", id, p);
  });
}

test("tous les peuples et classes créent des personnages valides avec un bâtiment exclusif", async () => {
  const { game } = setup();
  assert.equal(Object.keys(RACES).length, 16);
  assert.equal(Object.keys(CLASSES).length, 18);
  for (const [raceId, r] of Object.entries(RACES)) {
    assert.ok(BUILDINGS[r.building].races.includes(raceId));
    for (const classId of Object.keys(CLASSES)) {
      const p = await create(game, `${raceId}-${classId}`, { raceId, classId });
      assert.equal(p.hp, statsOf(p).hp);
      assert.ok(p.hp > 0);
      assert.equal(p.buildings.length, 3);
    }
  }
});

test("création unique et validation des noms", async () => {
  const { game } = setup();
  await create(game);
  await assert.rejects(create(game), /déjà/);
  await assert.rejects(create(game, "bad", { name: "@everyone" }), /Nom/);
  await assert.rejects(create(game, "bad", { name: "   " }), /deux/);
  await assert.rejects(
    create(game, "bad", { raceId: "inexistant" }),
    /inconnue/,
  );
});

test("transactions mémoire : annulation complète en cas d’erreur", async () => {
  const { store, game } = setup();
  await create(game);
  await assert.rejects(
    store.transaction(async (tx) => {
      const p = await tx.get("player", "alice");
      p.gold = 0;
      await tx.set("player", "alice", p);
      throw new Error("rollback");
    }),
  );
  assert.equal((await game.execute("profile", "alice")).p.gold, 150);
});

test("énergie et récupération gardent les fractions de temps entre consultations", async () => {
  const { store, game, advance } = setup();
  await create(game);
  await edit(store, "alice", (p) => {
    p.hp = 10;
    p.mana = 0;
    p.energy = 0;
  });
  for (let i = 0; i < 10; i++) {
    advance(30_000);
    await game.execute("profile", "alice");
  }
  const { p } = await game.execute("profile", "alice");
  assert.equal(p.energy, 1);
  assert.equal(p.mana, 15);
  assert.ok(p.hp > 10);
  await game.execute("travel", "alice", { zoneId: 0 });
  const hp = p.hp;
  advance(HOUR);
  assert.equal((await game.execute("profile", "alice")).p.hp, hp);
});

test("les provisions quotidiennes et contrats ne peuvent être réclamés deux fois", async () => {
  const { store, game, advance } = setup();
  await create(game);
  await game.execute("daily", "alice");
  await assert.rejects(game.execute("daily", "alice"), /déjà/);
  await edit(store, "alice", (p) => {
    p.quests.kills = 5;
  });
  await game.execute("claimQuest", "alice", { questId: "kills" });
  await assert.rejects(
    game.execute("claimQuest", "alice", { questId: "kills" }),
    /déjà/,
  );
  advance(DAY);
  assert.equal((await game.execute("daily", "alice")).p.streak, 2);
  assert.equal((await game.execute("quests", "alice")).p.quests.kills, 0);
});

test("les trois emplacements et les restrictions raciales sont appliqués", async () => {
  const { store, game } = setup();
  await create(game);
  await edit(store, "alice", (p) => {
    p.gold = 10000;
    p.resources.bois = 1000;
    p.resources.pierre = 1000;
  });
  await assert.rejects(
    game.execute("build", "alice", { buildingId: "nid_draconique", slot: 1 }),
    /autre peuple/,
  );
  for (const [i, buildingId] of ["scierie", "carriere", "comptoir"].entries())
    await game.execute("build", "alice", { buildingId, slot: i + 1 });
  await assert.rejects(
    game.execute("build", "alice", { buildingId: "mine", slot: 4 }),
    /1 à 3/,
  );
  await assert.rejects(
    game.execute("build", "alice", { buildingId: "mine", slot: 1 }),
    /occupé/,
  );
});

test("production hors ligne plafonnée à 12 h et conservation des fractions", async () => {
  const { game, advance } = setup();
  await create(game);
  await game.execute("build", "alice", { buildingId: "scierie", slot: 1 });
  let { p } = await game.execute("collect", "alice");
  const before = p.resources.bois;
  advance(HOUR / 8);
  await game.execute("collect", "alice");
  advance(HOUR / 8);
  p = (await game.execute("collect", "alice")).p;
  assert.equal(p.resources.bois, before + 1);
  advance(24 * HOUR);
  p = (await game.execute("collect", "alice")).p;
  assert.equal(p.resources.bois, before + 49);
});

test("pas d’accès aux zones verrouillées et pas de changement de zone en expédition", async () => {
  const { game } = setup();
  await create(game);
  await assert.rejects(
    game.execute("travel", "alice", { zoneId: 1 }),
    /précédente/,
  );
  await game.execute("travel", "alice", { zoneId: 0 });
  await game.execute("explore", "alice");
  await assert.rejects(game.execute("returnHome", "alice"), /combat/);
  await assert.rejects(
    game.execute("build", "alice", { buildingId: "mine", slot: 1 }),
    /base/,
  );
});

test("combat : un tour ne peut être rejoué, une compétence a un délai", async () => {
  const { game, store } = setup();
  await create(game);
  await game.execute("travel", "alice", { zoneId: 0 });
  let { p } = await game.execute("explore", "alice");
  const battleId = p.battle.id;
  await edit(store, "alice", (p) => {
    p.battle.enemy.hp = 1000;
    p.battle.enemy.maxHp = 1000;
  });
  await game.execute("combat", "alice", { move: "skill", battleId, turn: 1 });
  await assert.rejects(
    game.execute("combat", "alice", { move: "skill", battleId, turn: 1 }),
    /déjà/,
  );
  await assert.rejects(
    game.execute("combat", "alice", { move: "skill" }),
    /prochain tour/,
  );
  p = (await game.execute("combat", "alice", { move: "guard" })).p;
  assert.equal(p.battle.turn, 3);
  assert.ok(p.mana > 20);
});

test("deux victoires puis un gardien ouvrent la route et le retour sécurise le butin", async () => {
  const { game, store } = setup();
  await create(game);
  await game.execute("travel", "alice", { zoneId: 0 });
  for (let i = 0; i < 3; i++) {
    const encounter = await game.execute("explore", "alice");
    assert.equal(encounter.p.battle.enemy.boss, i === 2);
    await edit(store, "alice", (p) => {
      p.battle.enemy.hp = 1;
    });
    await game.execute("combat", "alice", { move: "attack" });
  }
  const before = (await game.execute("profile", "alice")).p;
  assert.equal(before.unlockedZone, 1);
  assert.ok(before.bag.gold > 0);
  assert.ok(before.level > 1);
  const { p } = await game.execute("returnHome", "alice");
  assert.equal(p.gold, before.gold + before.bag.gold);
  assert.equal(p.bag.gold, 0);
  assert.equal(p.location, "base");
});

test("défaite : coffre intact, moitié des ressources du sac sauvée, retour à la base", async () => {
  const { game, store } = setup();
  await create(game);
  await game.execute("travel", "alice", { zoneId: 0 });
  await game.execute("explore", "alice");
  const before = (await game.execute("profile", "alice")).p;
  await edit(store, "alice", (p) => {
    p.hp = 1;
    p.battle.enemy.attack = 9999;
    p.battle.enemy.hp = 9999;
    p.bag.gold = 101;
    p.bag.resources = { fer: 5 };
    p.bag.gear.push(game.generateGear(1));
  });
  const { p } = await game.execute("combat", "alice", { move: "guard" });
  assert.equal(p.location, "base");
  assert.equal(p.gold, before.gold + 50);
  assert.equal(p.resources.fer, before.resources.fer + 2);
  assert.equal(p.gear.length, before.gear.length);
  assert.equal(p.battle, null);
});

test("marché : séquestre, double achat simultané, commission et conservation des quantités", async () => {
  const { game, store } = setup();
  await create(game, "alice");
  await create(game, "bob");
  await create(game, "carol");
  await game.execute("sell", "alice", {
    resource: "bois",
    quantity: 10,
    price: 21,
  });
  const listingId = (await game.execute("market", "bob")).listings[0].id;
  const results = await Promise.allSettled(
    ["bob", "carol"].map((id) => game.execute("buy", id, { listingId })),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const players = await store.transaction((tx) => tx.list("player"));
  assert.equal(
    players.reduce((n, p) => n + p.gold, 0),
    450 - 2,
  );
  assert.equal(
    players.reduce((n, p) => n + p.resources.bois, 0),
    90,
  );
  assert.equal((await game.execute("market", "alice")).listings.length, 0);
});

test("marché : annulation, expiration et propriétaire protègent les lots", async () => {
  const { game, advance } = setup();
  await create(game);
  await create(game, "bob");
  await game.execute("sell", "alice", {
    resource: "fer",
    quantity: 3,
    price: 10,
  });
  let l = (await game.execute("market", "alice")).listings[0];
  await assert.rejects(
    game.execute("cancelListing", "bob", { listingId: l.id }),
    /appartient/,
  );
  await assert.rejects(
    game.execute("buy", "alice", { listingId: l.id }),
    /propre/,
  );
  await game.execute("cancelListing", "alice", { listingId: l.id });
  assert.equal((await game.execute("profile", "alice")).p.resources.fer, 8);
  await game.execute("sell", "alice", {
    resource: "fer",
    quantity: 3,
    price: 10,
  });
  advance(8 * DAY);
  await game.execute("market", "bob");
  assert.equal((await game.execute("profile", "alice")).p.resources.fer, 8);
});

test("marché : validation des quantités, prix, fonds et objets portés", async () => {
  const { game } = setup();
  const p = await create(game);
  await create(game, "bob");
  for (const quantity of [-1, 0, 1.5, Infinity, NaN])
    await assert.rejects(
      game.execute("sell", "alice", { resource: "fer", quantity, price: 10 }),
      GameError,
    );
  await assert.rejects(
    game.execute("sell", "alice", { itemId: p.gear[0].id, price: 10 }),
    /Déséquipe/,
  );
  await game.execute("sell", "alice", {
    resource: "fer",
    quantity: 3,
    price: 1000,
  });
  const l = (await game.execute("market", "bob")).listings[0];
  await assert.rejects(
    game.execute("buy", "bob", { listingId: l.id }),
    /manque/,
  );
  assert.equal((await game.execute("market", "bob")).listings.length, 1);
});

test("dons : or, ressources et rollback en cas de fonds insuffisants", async () => {
  const { game } = setup();
  await create(game);
  await create(game, "bob");
  await game.execute("gift", "alice", { targetId: "bob", gold: 25 });
  assert.equal((await game.execute("profile", "bob")).p.gold, 175);
  await game.execute("gift", "alice", {
    targetId: "bob",
    resource: "fer",
    quantity: 2,
  });
  assert.equal((await game.execute("profile", "bob")).p.resources.fer, 10);
  await assert.rejects(
    game.execute("gift", "alice", { targetId: "bob", gold: 1000 }),
    /manque/,
  );
  assert.equal((await game.execute("profile", "bob")).p.gold, 175);
});

test("artisanat, équipement au bon niveau, recyclage et enchantement", async () => {
  const { game, store } = setup();
  await create(game);
  await game.execute("craft", "alice", { recipeId: "potion", quantity: 2 });
  assert.equal((await game.execute("profile", "alice")).p.resources.potion, 11);
  await edit(store, "alice", (p) => {
    p.gold = 10000;
    p.resources = {
      fer: 1000,
      bois: 1000,
      pierre: 1000,
      cuir: 1000,
      essence: 1000,
    };
  });
  let { p } = await game.execute("craft", "alice", { recipeId: "lame" });
  const item = p.gear.at(-1);
  await game.execute("build", "alice", { buildingId: "forge", slot: 1 });
  await game.execute("enchant", "alice", { itemId: item.id });
  p = (await game.execute("equip", "alice", { itemId: item.id })).p;
  assert.equal(p.equipment.weapon, item.id);
  assert.equal(p.gear.at(-1).upgrade, 1);
  await assert.rejects(
    game.execute("salvage", "alice", { itemId: item.id }),
    /Déséquipe/,
  );
  await game.execute("unequip", "alice", { slot: "weapon" });
  await game.execute("salvage", "alice", { itemId: item.id });
  assert.equal((await game.execute("inventory", "alice")).p.gear.length, 1);
});

test("guildes : trésor commun, amélioration réservée au chef et succession", async () => {
  const { game, store } = setup();
  await create(game);
  await create(game, "bob");
  await edit(store, "alice", (p) => {
    p.gold = 1000;
  });
  const { guild } = await game.execute("guildCreate", "alice", {
    name: "Les Veilleurs",
  });
  await game.execute("guildJoin", "bob", { guildId: guild.id });
  await game.execute("guildDonate", "alice", { gold: 500 });
  await assert.rejects(game.execute("guildUpgrade", "bob"), /chef/);
  assert.equal((await game.execute("guildUpgrade", "alice")).guild.level, 2);
  await game.execute("guildLeave", "alice");
  assert.equal((await game.execute("guildInfo", "bob")).guild.leaderId, "bob");
});

test("raids : groupe, prérequis, récompenses atomiques et délai commun de 24 h", async () => {
  const { game, store } = setup();
  await create(game);
  await create(game, "bob");
  for (const id of ["alice", "bob"])
    await edit(store, id, (p) => {
      p.level = 20;
      p.hp = statsOf(p).hp;
    });
  const { party } = await game.execute("partyCreate", "alice", { raidId: 0 });
  await game.execute("partyJoin", "bob", { partyId: party.id });
  await assert.rejects(game.execute("raid", "bob"), /chef/);
  const result = await game.execute("raid", "alice");
  assert.equal(result.won, true);
  for (const id of ["alice", "bob"]) {
    const { p } = await game.execute("profile", id);
    assert.equal(p.energy, 80);
    assert.equal(p.resources.insigne, 1);
    assert.equal(p.raids, 1);
  }
  await assert.rejects(game.execute("raid", "alice"), /24 h|50 %/);
});

test("une même interaction Discord ne déclenche qu’une transaction de jeu", async () => {
  const { game } = setup();
  await create(game);
  await create(game, "bob");
  const results = await Promise.all(
    [1, 2].map(() =>
      game.execute(
        "gift",
        "alice",
        { targetId: "bob", gold: 10 },
        { requestId: "discord-1" },
      ),
    ),
  );
  assert.equal(results.filter((r) => r.duplicate).length, 1);
  assert.equal((await game.execute("profile", "alice")).p.gold, 140);
});

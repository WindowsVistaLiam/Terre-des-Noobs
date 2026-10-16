import test from "node:test";
import assert from "node:assert/strict";
import { ActionRowBuilder } from "discord.js";
import { loadImage } from "@napi-rs/canvas";
import { Game, statsOf } from "../src/game.js";
import { MemoryStore } from "../src/store.js";
import { ZONES, VICTORIES_FOR_BOSS } from "../src/content.js";
import { campaignEnemy } from "../src/campaign.js";
import { buildView } from "../src/views.js";
import { drawPanel } from "../src/canvas.js";
import { resolveRoute } from "../src/controller.js";
import { routeComponent, uiId } from "../src/commands.js";

const OWNER = "123456789012345678";
async function setup() {
  const store = new MemoryStore();
  const game = new Game(store, { random: () => 0.5, now: () => Date.UTC(2026, 9, 16, 12) });
  await game.execute("create", OWNER, { name: "Aelys", raceId: "humain", classId: "guerrier" });
  return { store, game };
}
async function edit(store, fn, id = OWNER) {
  await store.transaction(async (tx) => {
    const p = await tx.get("player", id);
    fn(p);
    await tx.set("player", id, p);
  });
}
const encounter = (mode = "progress", extra = {}) => ({ mode, zoneId: 0, enemyIndex: 0, elite: false, boss: false, ...extra });
async function win(game, args = encounter()) {
  await game.execute("explore", OWNER, args);
  await edit(game.store, (p) => { p.battle.enemy.hp = 1; p.hp = statsOf(p).hp; });
  return game.execute("combat", OWNER, { move: "attack" });
}
function controls(view) { return view.components.flatMap((r) => r.components); }
function validate(view) {
  assert.ok(view.components.length <= 5);
  const ids = new Set();
  for (const row of view.components) {
    new ActionRowBuilder(row).toJSON();
    for (const c of row.components) {
      assert.ok(!ids.has(c.custom_id)); ids.add(c.custom_id);
      assert.ok(c.custom_id.length <= 100);
      if (c.disabled) continue;
      for (const value of c.options?.map((o) => o.value) ?? [undefined])
        assert.ok(routeComponent(c.custom_id, OWNER, value ? [value] : []));
    }
  }
}

test("chaque ennemi peut être choisi, sans cache ni élite aléatoire, avec les mêmes stats en chasse", async () => {
  const { game, store } = await setup();
  await edit(store, (p) => { p.level = 40; p.unlockedZone = 11; });
  for (const zone of ZONES) {
    await game.execute("travel", OWNER, { zoneId: zone.id });
    for (let enemyIndex = 0; enemyIndex < zone.enemies.length; enemyIndex++) {
      for (const elite of [false, true]) {
        await edit(store, (p) => { p.energy = 100; });
        game.random = () => elite ? 0 : 0.99;
        const { p } = await game.execute("explore", OWNER, encounter("farm", { zoneId: zone.id, enemyIndex, elite }));
        assert.deepEqual(p.battle.enemy, campaignEnemy(zone, enemyIndex, { elite }));
        assert.equal(p.energy, 95);
        assert.equal(p.battle.mode, "farm");
        await game.execute("combat", OWNER, { move: "flee" });
      }
    }
  }
});

test("chasser indéfiniment garde le compteur du gardien, donne du butin et conserve le choix après redémarrage", async () => {
  const { game, store } = await setup();
  await game.execute("travel", OWNER, { zoneId: 0 });
  await win(game);
  const before = (await game.execute("profile", OWNER)).p;
  for (let i = 0; i < 5; i++) await win(game, encounter("farm", { enemyIndex: 2 }));
  let { p } = await new Game(store).execute("profile", OWNER);
  assert.equal(p.zoneWins[0], 1);
  assert.equal(p.unlockedZone, 0);
  assert.equal(p.kills, 6);
  assert.ok(p.level > before.level);
  assert.ok(p.bag.gold > before.bag.gold);
  assert.ok(p.bag.resources.bois > before.bag.resources.bois);
  assert.equal(p.gold, before.gold);
  assert.deepEqual(p.hunt, { zoneId: 0, enemyIndex: 2, elite: false });
  const totalGold = p.gold + p.bag.gold, totalWood = p.resources.bois + p.bag.resources.bois;
  ({ p } = await game.execute("returnHome", OWNER));
  assert.equal(p.gold, totalGold);
  assert.equal(p.resources.bois, totalWood);
  assert.equal(p.bag.gold, 0);
  assert.equal(p.zoneWins[0], 1);
});

test("parcours réel : deux combats, chasse répétée, gardien puis nouvelle région sans modifier les ennemis", async () => {
  const { game, store } = await setup();
  await edit(store, (p) => {
    p.level = 12;
    for (const slot of ["weapon", "armor", "charm"]) {
      const item = game.generateGear(12, slot, 2);
      p.gear.push(item); p.equipment[slot] = item.id;
    }
    p.hp = statsOf(p).hp; p.mana = statsOf(p).mana;
  });
  await game.execute("travel", OWNER, { zoneId: 0 });
  const finish = async (args) => {
    let { p } = await game.execute("explore", OWNER, args);
    const originalHp = p.battle.enemy.hp;
    let turns = 0;
    while (p.battle) {
      const b = p.battle;
      const move = p.hp < statsOf(p).hp * 0.4 && p.resources.potion ? "potion"
        : b.turn % 3 === 0 ? "guard" : "attack";
      ({ p } = await game.execute("combat", OWNER, { move, battleId: b.id, turn: b.turn }));
      assert.ok(++turns <= 60);
    }
    assert.equal(p.location, "campaign", "Le héros préparé doit gagner sans secours.");
    assert.equal(originalHp, campaignEnemy(ZONES[args.zoneId], args.enemyIndex, args).hp);
    return p;
  };
  await finish(encounter()); await finish(encounter("progress", { enemyIndex: 1 }));
  for (let i = 0; i < 3; i++) {
    const p = await finish(encounter("farm", { enemyIndex: 2 }));
    assert.equal(p.zoneWins[0], 2); assert.equal(p.unlockedZone, 0);
  }
  let p = await finish(encounter("progress", { boss: true }));
  assert.equal(p.unlockedZone, 1);
  await game.execute("travel", OWNER, { zoneId: 1 });
  p = await finish(encounter("farm", { zoneId: 1 }));
  assert.ok(p.bag.resources.herbe > 0);
  assert.equal(p.zoneWins[1] ?? 0, 0);
  const banked = (await game.execute("returnHome", OWNER)).p;
  assert.ok(banked.resources.herbe > 8);
  assert.equal(banked.kills, 7);
});

test("une ancienne sauvegarde de combat sans mode continue en progression", async () => {
  const { game, store } = await setup();
  await game.execute("travel", OWNER, { zoneId: 0 });
  await game.execute("explore", OWNER);
  await edit(store, (p) => { delete p.battle.mode; p.battle.enemy.hp = 1; });
  const { p } = await new Game(store, { random: () => 0.5 }).execute("combat", OWNER, { move: "attack" });
  assert.equal(p.zoneWins[0], 1);
});

test("gardien optionnel après deux victoires, compteur plafonné, chasse ou progression restent disponibles", async () => {
  const { game } = await setup();
  await game.execute("travel", OWNER, { zoneId: 0 });
  await assert.rejects(game.execute("explore", OWNER, encounter("progress", { boss: true })), /2 combats/);
  await win(game); await win(game);
  assert.equal((await game.execute("profile", OWNER)).p.zoneWins[0], VICTORIES_FOR_BOSS);
  await win(game, encounter("farm"));
  await win(game, encounter("progress", { elite: true }));
  const { p } = await win(game, encounter("progress", { boss: true }));
  assert.deepEqual(p.bosses, [0]);
  assert.equal(p.unlockedZone, 1);
  assert.equal(p.zoneWins[0], 0);
  assert.equal(p.bag.gear.length, 1); // Le gardien garantit un équipement.
});

test("les paramètres falsifiés et les rencontres devenues invalides ne coûtent aucune énergie", async () => {
  const { game, store } = await setup();
  await game.execute("travel", OWNER, { zoneId: 0 });
  for (const extra of [
    { mode: "cheat" }, { enemyIndex: -1 }, { enemyIndex: 3 }, { enemyIndex: 0.5 },
    { zoneId: 11 }, { elite: "true" }, { boss: "false" },
    { mode: "farm", boss: true }, { boss: true, elite: true },
  ]) {
    const before = (await game.execute("profile", OWNER)).p;
    await assert.rejects(game.execute("explore", OWNER, encounter("progress", extra)));
    assert.deepEqual((await game.execute("profile", OWNER)).p, before);
  }
  await edit(store, (p) => { p.energy = 4; });
  await assert.rejects(game.execute("explore", OWNER, encounter("farm")), /5 énergie/);
  await edit(store, (p) => { p.energy = 10; });
  const races = await Promise.allSettled([1, 2].map(() => game.execute("explore", OWNER, encounter("farm"))));
  assert.equal(races.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await game.execute("profile", OWNER)).p.energy, 5);
});

test("changement de région entre combats : sac exposé, niveau requis et zones verrouillées respectés", async () => {
  const { game, store } = await setup();
  await edit(store, (p) => { p.unlockedZone = 2; });
  await assert.rejects(game.execute("travel", OWNER, { zoneId: 2 }), /Niveau 5/);
  await edit(store, (p) => { p.level = 10; p.zoneWins = { 0: 2, 2: 1 }; });
  await game.execute("travel", OWNER, { zoneId: 2 });
  await edit(store, (p) => { p.bag = { gold: 123, resources: { fer: 8 }, gear: [] }; });
  const { p } = await game.execute("travel", OWNER, { zoneId: 0 });
  assert.equal(p.gold, 150); assert.equal(p.bag.gold, 123);
  assert.equal(p.bag.resources.fer, 8); assert.equal(p.zoneWins[2], 1);
  assert.equal(p.zoneWins[0], 2); assert.equal(p.unlockedZone, 2);
  await assert.rejects(game.execute("explore", OWNER, encounter("farm", { zoneId: 2 })), /changé de région/);
  await game.execute("explore", OWNER, encounter("farm"));
  await assert.rejects(game.execute("travel", OWNER, { zoneId: 2 }), /combat/);
});

test("la fuite et la défaite en chasse préservent le compteur, mais gardent les pertes de butin", async () => {
  for (const move of ["flee", "guard"]) {
    const { game, store } = await setup();
    await game.execute("travel", OWNER, { zoneId: 0 });
    await edit(store, (p) => { p.zoneWins[0] = 2; p.bag.gold = 100; });
    await game.execute("explore", OWNER, encounter("farm"));
    if (move === "guard") await edit(store, (p) => { p.hp = 1; p.battle.enemy.attack = 10000; });
    const { p } = await game.execute("combat", OWNER, { move });
    assert.equal(p.zoneWins[0], 2);
    assert.equal(p.battle, null);
    assert.equal(p.bag.gold, move === "flee" ? 75 : 0);
    assert.equal(p.gold, move === "flee" ? 150 : 200);
  }
});

test("navigation Discord : choisir, chasser, recommencer, gardien, anciens boutons et protection du propriétaire", async () => {
  const { game, store } = await setup();
  await game.execute("travel", OWNER, { zoneId: 0 });
  const view = buildView(await resolveRoute(game, { action: "encounters" }, OWNER), OWNER);
  validate(view);
  const farmMenu = controls(view).find((c) => c.custom_id.includes(":encounter:farm:"));
  const chosen = routeComponent(farmMenu.custom_id, OWNER, ["normal|1"]);
  assert.equal(routeComponent(farmMenu.custom_id, "other", ["normal|1"]), null);
  assert.equal(routeComponent(farmMenu.custom_id, OWNER, ["normal|99"]), null);
  const result = await resolveRoute(game, chosen, OWNER);
  assert.equal(result.p.battle.enemy.name, ZONES[0].enemies[1]);
  validate(buildView(result, OWNER));
  await edit(store, (p) => { p.battle.enemy.hp = 1; });
  const won = await game.execute("combat", OWNER, { move: "attack" });
  const after = buildView(won, OWNER); validate(after);
  const repeat = controls(after).find((c) => c.label === "Chasser le même ennemi · 5 énergie");
  const again = await resolveRoute(game, routeComponent(repeat.custom_id, OWNER), OWNER);
  assert.equal(again.p.battle.enemy.name, ZONES[0].enemies[1]);
  assert.equal(again.p.battle.mode, "farm");
  await game.execute("combat", OWNER, { move: "flee" });
  await edit(store, (p) => { p.zoneWins[0] = 2; });
  const ready = buildView(await resolveRoute(game, { action: "encounters" }, OWNER), OWNER);
  validate(ready);
  assert.ok(controls(ready).find((c) => c.custom_id.includes(":encounter:progress:")).options.some((o) => o.value === "boss|0"));
  assert.ok(!controls(ready).find((c) => c.custom_id.includes(":encounter:farm:")).options.some((o) => o.value === "boss|0"));
  assert.equal(routeComponent(uiId(OWNER, "do", "explore"), OWNER).action, "encounters");
});

test("carte paginée : étapes distinctes, progression inchangée en farm, données publiques et blocages", async () => {
  const { game, store } = await setup();
  for (let i = 0; i < 12; i++) {
    const id = `friend${i}`;
    await game.execute("create", id, { name: `Ami ${i}`, raceId: "nain", classId: "guerrier" });
    await edit(store, (p) => { p.unlockedZone = i; p.gold = 987654; p.customization.bio = "PRIVATE"; }, id);
  }
  await edit(store, (p) => { p.social.blocked = ["friend0"]; p.unlockedZone = 2; p.zone = 0; p.location = "campaign"; });
  await edit(store, (p) => { p.social.blocked = [OWNER]; }, "friend1");
  const result = await resolveRoute(game, { action: "map", args: { page: 1 } }, OWNER);
  assert.equal(result.pages, 2); assert.equal(result.travelers.length, 6);
  assert.equal(result.travelers[0].stage, 2);
  assert.equal(result.travelers[0].location, ZONES[0].name);
  const second = await resolveRoute(game, { action: "map", args: { page: 2 } }, OWNER);
  const all = [...result.travelers, ...second.travelers.slice(1)];
  assert.equal(new Set(all.map((v) => v.id)).size, 11);
  assert.ok(all.every((v) => !["friend0", "friend1"].includes(v.id)));
  assert.ok(!JSON.stringify(all).includes("987654"));
  assert.ok(!JSON.stringify(all).includes("PRIVATE"));
  assert.deepEqual(Object.keys(all[0]).sort(), ["completed", "id", "inBattle", "level", "location", "name", "stage"]);
  assert.equal((await game.execute("campaignMap", OWNER, { page: 9999 })).page, 2);
  await assert.rejects(game.execute("campaignMap", OWNER, { page: -1 }), /Page/);
  for (const data of [result, second]) validate(buildView(data, OWNER));
});

test("carte et bestiaire Canvas : PNG réels, douze étapes reliées, six héros sans débordement", async () => {
  const { game, store } = await setup();
  for (let i = 0; i < 5; i++) await game.execute("create", `friend${i}`, {
    name: "Aventurier au très long", raceId: "humain", classId: "mage",
  });
  await edit(store, (p) => { p.level = 40; p.unlockedZone = 11; p.bosses = ZONES.slice(0, 11).map((z) => z.id); });
  await game.execute("travel", OWNER, { zoneId: 0 });
  for (const action of ["map", "encounters"]) {
    const view = buildView(await resolveRoute(game, { action }, OWNER), OWNER);
    const panel = await drawPanel(view.screen);
    const image = await loadImage(panel.buffer);
    assert.equal(image.width, 1280);
    assert.ok(panel.buffer.length < 8_000_000);
    for (const r of [...panel.cards, ...panel.mapNodes]) {
      assert.ok(r.x >= 58 && r.x + r.width <= 1222);
      assert.ok(r.y >= 170 && r.y + r.height < panel.height - 80);
    }
    if (action === "map") {
      assert.equal(panel.mapNodes.length, 12);
      assert.equal(view.screen.campaignMap.travelers.length, 6);
      assert.ok(panel.mapNodes[4].x > panel.mapNodes[7].x);
    }
  }
});

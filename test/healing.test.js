import test from "node:test";
import assert from "node:assert/strict";
import { Game, statsOf } from "../src/game.js";
import { MemoryStore } from "../src/store.js";
import { resolveRoute } from "../src/controller.js";
import { buildView, render } from "../src/views.js";
import { loadImage } from "@napi-rs/canvas";

async function battle({
  classId = "necromancien",
  raceId = "humain",
  hp = 40,
  heroHit = 102,
  enemyHit = 21,
  enemyHp = 1000,
  level = 1,
} = {}) {
  const game = new Game(new MemoryStore(), {
    random: () => 0.5,
    now: () => Date.UTC(2026, 9, 15, 12),
  });
  await game.execute("create", "hero", { name: "Val", classId, raceId });
  await game.execute("travel", "hero", { zoneId: 0 });
  await game.execute("explore", "hero");
  await game.store.transaction(async (tx) => {
    const p = await tx.get("player", "hero");
    p.level = level;
    p.hp = hp;
    p.mana = statsOf(p).mana;
    p.battle.enemy.hp = enemyHp;
    p.battle.enemy.maxHp = enemyHp;
    await tx.set("player", p.id, p);
  });
  const hits = [heroHit, enemyHit];
  game.hit = () => {
    assert.ok(hits.length, "frappe supplémentaire inattendue");
    return hits.shift();
  };
  return game;
}

test("humain nécromancien : 46 PV soignés puis 21 dégâts donnent bien +25 PV nets", async () => {
  const game = await battle();
  const result = await game.execute("combat", "hero", { move: "skill" });
  assert.equal(result.p.hp, 65);
  assert.match(result.message, /Vol de vie : \+46 PV · 45 % de 102 dégâts/);
  assert.match(result.message, /Riposte.*21 dégâts/);
  assert.match(result.message, /PV : 40 → 65 \/ 95 \(\+25 sur le tour\)/);
  assert.equal((await game.execute("profile", "hero")).p.hp, 65);
});

test("un drain soigne même si la riposte annule le gain visible sur la jauge", async () => {
  const game = await battle({ enemyHit: 50 });
  const { p, message } = await game.execute("combat", "hero", {
    move: "skill",
  });
  assert.equal(p.hp, 36);
  assert.match(message, /Vol de vie : \+46 PV/);
  assert.match(message, /Riposte.*50 dégâts/);
  assert.match(message, /\(-4 sur le tour\)/);
});

test("le soin près du maximum indique les PV reçus et la limite avant la riposte", async () => {
  const game = await battle({ hp: 90 });
  const { p, message } = await game.execute("combat", "hero", {
    move: "skill",
  });
  assert.equal(p.hp, 74);
  assert.match(
    message,
    /Vol de vie : \+5 PV sur 46 possibles \(limite 95 PV\)/,
  );
  const full = await battle({ hp: 95 });
  assert.match(
    (await full.execute("combat", "hero", { move: "skill" })).message,
    /\+0 PV sur 46 possibles/,
  );
});

test("la compétence létale soigne avant la victoire, sans riposte", async () => {
  const game = await battle({ enemyHp: 80, level: 2 });
  const { p, message } = await game.execute("combat", "hero", {
    move: "skill",
  });
  assert.equal(p.battle, null);
  assert.equal(p.hp, 86);
  assert.match(message, /Vol de vie : \+46 PV/);
  assert.match(message, /Ennemi vaincu : aucune riposte/);
  assert.match(message, /PV : 40 → 86/);
  assert.doesNotMatch(message, /Riposte.*dégâts/);
});

test("les drains physiques et magiques, et les bonus de soins, gardent leurs taux en campagne", async () => {
  for (const [classId, raceId, healed] of [
    ["necromancien", "humain", 45],
    ["barde", "humain", 45],
    ["alchimiste", "humain", 45],
    ["paladin", "humain", 35],
    ["chevalier_noir", "humain", 35],
    ["necromancien", "celeste", 52],
  ]) {
    const game = await battle({
      classId,
      raceId,
      hp: 10,
      heroHit: 100,
      enemyHit: 1,
    });
    const { p, message } = await game.execute("combat", "hero", {
      move: "skill",
    });
    assert.equal(p.hp, 10 + healed - 1, classId);
    assert.ok(
      message.includes(`Vol de vie : +${healed} PV`),
      `${classId}: ${message}`,
    );
  }
});

test("les potions et les sorts de soin affichent aussi leur soin réel", async () => {
  const game = await battle({ hp: 90, heroHit: 21 });
  const potion = await game.execute("combat", "hero", { move: "potion" });
  assert.equal(potion.p.hp, 74);
  assert.match(potion.message, /Potion de soin : \+5 PV sur 38 possibles/);
  const priest = await battle({ classId: "pretre", hp: 10, heroHit: 21 });
  const healed = await priest.execute("combat", "hero", { move: "skill" });
  assert.match(healed.message, /Prière de l’aube : \+58 PV/);
  assert.equal(healed.p.hp, 62);
});

test("le détail du dernier soin reste visible après réouverture et se rend en PNG", async () => {
  const game = await battle({ hp: 90 });
  await game.execute("combat", "hero", { move: "skill" });
  const result = await resolveRoute(game, { action: "campaign" }, "hero");
  const { screen } = buildView(result, "hero");
  assert.match(screen.notice, /Vol de vie : \+5 PV sur 46 possibles/);
  assert.match(screen.notice, /Riposte.*21 dégâts/);
  const payload = await render(result, "hero");
  const png = await loadImage(payload.files[0].attachment);
  assert.equal(png.width, 1280);
  assert.ok(payload.files[0].attachment.length < 8_000_000);
});

test("en duel, un drain magique soigne à 45 %, un drain physique à 35 %, sans toucher aux jauges réelles", async () => {
  for (const [classId, expected] of [
    ["necromancien", 36],
    ["paladin", 28],
  ]) {
    const game = new Game(new MemoryStore(), {
      random: () => 0.5,
      now: () => Date.UTC(2026, 9, 15, 12),
    });
    for (const [id, cls] of [
      ["target", "guerrier"],
      ["drainer", classId],
    ])
      await game.execute("create", id, {
        name: "Veilleur",
        raceId: "humain",
        classId: cls,
      });
    const before = (await game.execute("profile", "drainer")).p;
    // L’adversaire joue d’abord : il crée une réserve de PV manquants.
    // Le drain inflige 80 dégâts, puis la frappe suivante termine le duel.
    const hits = [50, 80, 1000];
    game.hit = () => hits.shift();
    const { duel } = await game.execute("duelChallenge", "target", {
      targetId: "drainer",
    });
    const result = await game.execute("duelRespond", "drainer", {
      duelId: duel.id,
      response: "accept",
    });
    assert.equal(
      result.duel.fighters.find((f) => f.id === "drainer").healed,
      expected,
      classId,
    );
    const after = (await game.execute("profile", "drainer")).p;
    for (const key of ["hp", "mana", "energy", "gold", "xp"])
      assert.equal(after[key], before[key]);
  }
});

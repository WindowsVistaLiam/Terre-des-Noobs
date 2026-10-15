import test from "node:test";
import assert from "node:assert/strict";
import { Game, statsOf } from "../src/game.js";
import { MemoryStore } from "../src/store.js";
import { CLASSES, HOUR } from "../src/content.js";

async function fight(classId, prepared = false) {
  let now = Date.UTC(2026, 9, 15, 12);
  const game = new Game(new MemoryStore(), {
    random: () => 0.5,
    now: () => now,
  });
  let { p } = await game.execute("create", "hero", {
    name: "Aelys",
    raceId: "humain",
    classId,
  });
  if (prepared) {
    await game.execute("build", "hero", {
      buildingId:
        CLASSES[classId].stats.power > CLASSES[classId].stats.attack
          ? "tour"
          : "caserne",
      slot: 1,
    });
    p = (await game.execute("craft", "hero", { recipeId: "protection" })).p;
    await game.execute("equip", "hero", { itemId: p.gear.at(-1).id });
  }
  now += HOUR;
  await game.execute("travel", "hero", { zoneId: 0 });
  p = (await game.execute("explore", "hero")).p;
  const hp = p.battle.enemy.hp;
  let turns = 0;
  while (p.battle && turns < 60) {
    const skill = CLASSES[classId].skill;
    const move =
      p.battle.turn % 3 === 0
        ? "guard"
        : p.mana >= skill.cost &&
            p.battle.turn >= p.battle.skillReady &&
            (skill.kind !== "heal" || p.hp < statsOf(p).hp * 0.65)
          ? "skill"
          : "attack";
    p = (await game.execute("combat", "hero", { move })).p;
    turns++;
  }
  return {
    hp,
    turns,
    won: p.location !== "base",
    healthRatio: p.hp / statsOf(p).hp,
  };
}

test("un ennemi de départ résiste à plusieurs coups et un héros préparé conserve plus de vie", async () => {
  const bare = await fight("guerrier"),
    prepared = await fight("guerrier", true);
  assert.ok(bare.hp >= 100);
  assert.ok(bare.turns >= 5);
  assert.equal(prepared.won, true);
  assert.ok(prepared.turns < bare.turns);
  assert.ok(prepared.healthRatio > bare.healthRatio);
});

test("toutes les classes peuvent passer la première rencontre après une préparation accessible", async () => {
  for (const classId of Object.keys(CLASSES)) {
    const result = await fight(classId, true);
    assert.equal(result.won, true, classId);
    assert.ok(
      result.turns >= 3 && result.turns <= 30,
      `${classId}: ${result.turns}`,
    );
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PostgresStore } from "../src/store.js";
import { Game } from "../src/game.js";
import { normalizeImage } from "../src/profile-media.js";
import { createCanvas } from "@napi-rs/canvas";
import { resolveRoute } from "../src/controller.js";
import { previewReset, confirmReset } from "../src/admin.js";

const url = process.env.TEST_DATABASE_URL;
test(
  "PostgreSQL réel : sauvegarde, redémarrage, rollback et achats concurrents entre deux connexions",
  { skip: !url },
  async () => {
    // Schéma isolé : ne jamais tronquer ou supprimer les tables d’une base existante.
    const schema = `test_${randomUUID().replaceAll("-", "")}`;
    const admin = new PostgresStore(url);
    let a, b;
    try {
      await admin.pool.query(`CREATE SCHEMA ${schema}`);
      const options = { options: `-c search_path=${schema}` };
      a = new PostgresStore(url, options);
      b = new PostgresStore(url, options);
      await a.init();
      await b.init();
      const ga = new Game(a),
        gb = new Game(b);
      for (const id of ["seller", "one", "two"])
        await ga.execute("create", id, {
          name: "Veilleur",
          raceId: "nain",
          classId: "guerrier",
        });
      assert.equal((await gb.execute("profile", "seller")).p.raceId, "nain");
      await assert.rejects(
        a.transaction(async (tx) => {
          const p = await tx.get("player", "seller");
          p.gold = 0;
          await tx.set("player", "seller", p);
          throw new Error("rollback");
        }),
      );
      assert.equal((await gb.execute("profile", "seller")).p.gold, 150);
      await ga.execute("sell", "seller", {
        resource: "fer",
        quantity: 4,
        price: 21,
      });
      const l = (await ga.execute("market", "one")).listings[0];
      const results = await Promise.allSettled([
        ga.execute("buy", "one", { listingId: l.id }),
        gb.execute("buy", "two", { listingId: l.id }),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal((await gb.execute("profile", "seller")).p.gold, 169);
      await ga.execute("friendRequest", "seller", { targetId: "one" });
      const social = await Promise.allSettled(
        [ga, gb].map((game) =>
          game.execute("friendRespond", "one", {
            requestId: "seller.one",
            response: "accept",
          }),
        ),
      );
      assert.equal(social.filter((r) => r.status === "fulfilled").length, 1);
      await ga.execute("daily", "seller");
      const { guild } = await ga.execute("guildCreate", "seller", {
        name: "Les Veilleurs",
      });
      await gb.execute("guildJoin", "one", { guildId: guild.id });
      await gb.execute("cityDonate", "one", { resource: "bois", quantity: 10 });
      const goldAfterSocial = (await ga.execute("profile", "seller")).p.gold;
      const image = createCanvas(64, 64);
      image.getContext("2d").fillRect(0, 0, 64, 64);
      const portrait = await normalizeImage(
        await image.encode("png"),
        "portrait",
      );
      await ga.execute("customizeImage", "seller", {
        slot: "portrait",
        media: portrait,
      });
      await ga.execute("customizeText", "seller", {
        title: "Gardien de Vesper",
        bio: "Une histoire sauvegardée dans PostgreSQL.",
      });
      await ga.execute("travel", "seller", { zoneId: 0 });
      await ga.execute("explore", "seller", {
        mode: "farm", zoneId: 0, enemyIndex: 2, elite: true, boss: false,
      }, { requestId: "saved-hunt" });
      const savedBattle = (await gb.execute("profile", "seller")).p.battle;
      await a.close();
      a = new PostgresStore(url, options);
      await a.init();
      assert.equal(
        (await new Game(a).execute("profile", "seller")).p.gold,
        goldAfterSocial,
      );
      assert.deepEqual(
        (await new Game(a).execute("profile", "seller")).p.social.friends,
        ["one"],
      );
      assert.equal(
        (await new Game(a).execute("cityInfo", "seller")).guild.city.resources
          .bois,
        10,
      );
      const publicHero = await resolveRoute(
        new Game(a),
        { action: "publicProfile", args: { targetId: "seller" } },
        "one",
      );
      assert.equal(publicHero.target.title, "Gardien de Vesper");
      assert.equal(publicHero.appearance.portrait.hash, portrait.hash);
      assert.equal(publicHero.appearance.portrait.data, portrait.data);
      const restored = new Game(a);
      const hunter = (await restored.execute("profile", "seller")).p;
      assert.deepEqual(hunter.battle, savedBattle);
      assert.equal(hunter.battle.mode, "farm");
      assert.deepEqual(hunter.hunt, { zoneId: 0, enemyIndex: 2, elite: true });
      assert.equal((await restored.execute("explore", "seller", {}, { requestId: "saved-hunt" })).duplicate, true);
      assert.equal((await restored.execute("profile", "seller")).p.energy, 95);
      const map = await restored.execute("campaignMap", "one");
      assert.ok(map.travelers.find((v) => v.id === "seller").inBattle);
      const illustratedMap = await resolveRoute(restored, { action: "map" }, "one");
      assert.equal(illustratedMap.appearance.travelers.seller.hash, portrait.hash);
      assert.equal(illustratedMap.appearance.travelers.seller.data, portrait.data);
      await a.transaction(async (tx) => {
        const p = await tx.get("player", "two"); p.level = 5; p.gold = 2000; p.kills = 25;
        await tx.set("player", "two", p);
      });
      await restored.execute("shopBuy", "two", { resource: "sceau_classe", quantity: 1 });
      await restored.execute("changeIdentity", "two", { kind: "class", target: "mage" });
      await restored.execute("chooseSpecialization", "two", { specId: "mage_2" });
      await restored.execute("equipHonor", "two", { slot: "frame", honorId: "chasseur" });
      const avatar = await normalizeImage(await image.encode("png"), "avatar");
      await restored.execute("customizeImage", "two", { slot: "avatar", media: avatar });
      const pending = await previewReset(restored, "seller", "two", "main");
      await a.close(); a = new PostgresStore(url, options); await a.init();
      const restarted = new Game(a);
      const evolution = await resolveRoute(restarted, { action: "inventory" }, "two");
      assert.equal(evolution.p.classId, "mage"); assert.equal(evolution.p.specialization, "mage_2");
      assert.equal(evolution.p.resources.sceau_classe, 0);
      assert.equal(evolution.appearance.avatar.hash, avatar.hash);
      assert.equal(evolution.appearance.frame.id, "forest");
      const resets = await Promise.allSettled([restarted, gb].map((game) => confirmReset(game, "seller", pending.token, "main")));
      assert.equal(resets.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(await a.transaction((tx) => tx.get("player", "two")), null);
      assert.equal(await a.transaction((tx) => tx.get("profile_media", "two.avatar")), null);
      assert.ok(await a.transaction((tx) => tx.get("player", "seller")));
    } finally {
      if (a) await a.close();
      if (b) await b.close();
      await admin.pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.close();
    }
  },
);

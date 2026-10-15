import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PostgresStore } from "../src/store.js";
import { Game } from "../src/game.js";

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
      await a.close();
      a = new PostgresStore(url, options);
      await a.init();
      assert.equal(
        (await new Game(a).execute("profile", "seller")).p.gold,
        169,
      );
    } finally {
      if (a) await a.close();
      if (b) await b.close();
      await admin.pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.close();
    }
  },
);

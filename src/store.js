import pg from "pg";

export class PostgresStore {
  constructor(connectionString, options = {}) {
    this.pool = new pg.Pool({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 10000,
      ...options,
    });
    this.pool.on("error", (error) =>
      console.error("PostgreSQL pool:", error.message),
    );
  }
  async init() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS rpg_documents (
      kind TEXT NOT NULL, id TEXT NOT NULL, data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (kind, id)
    )`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS rpg_market_created
      ON rpg_documents ((data->>'createdAt')) WHERE kind = 'listing'`);
  }
  async transaction(fn) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '10s'");
      await client.query("SET LOCAL statement_timeout = '15s'");
      // Un verrou partagé entre toutes les instances : achats, dons et raids atomiques.
      // Adapté à un bot de communauté. Voir docs/ARCHITECTURE.md pour le dimensionnement.
      await client.query("SELECT pg_advisory_xact_lock(742019001)");
      const tx = {
        get: async (kind, id) =>
          (
            await client.query(
              "SELECT data FROM rpg_documents WHERE kind=$1 AND id=$2",
              [kind, id],
            )
          ).rows[0]?.data ?? null,
        set: async (kind, id, data) => {
          await client.query(
            `INSERT INTO rpg_documents(kind,id,data) VALUES($1,$2,$3)
          ON CONFLICT(kind,id) DO UPDATE SET data=EXCLUDED.data, updated_at=NOW()`,
            [kind, id, JSON.stringify(data)],
          );
        },
        delete: async (kind, id) => {
          await client.query(
            "DELETE FROM rpg_documents WHERE kind=$1 AND id=$2",
            [kind, id],
          );
        },
        list: async (kind) =>
          (
            await client.query(
              "SELECT data FROM rpg_documents WHERE kind=$1 ORDER BY id",
              [kind],
            )
          ).rows.map((row) => row.data),
      };
      const result = await fn(tx);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  async ping() {
    await this.pool.query("SELECT 1");
  }
  async close() {
    await this.pool.end();
  }
}

// Réservé aux tests et au mode démo explicite : aucune promesse de persistance.
export class MemoryStore {
  documents = new Map();
  queue = Promise.resolve();
  async init() {}
  async ping() {}
  async close() {}
  async transaction(fn) {
    const previous = this.queue;
    let unlock;
    this.queue = new Promise((resolve) => {
      unlock = resolve;
    });
    await previous;
    const snapshot = structuredClone(this.documents);
    const key = (kind, id) => `${kind}:${id}`;
    try {
      const result = await fn({
        get: async (kind, id) =>
          structuredClone(snapshot.get(key(kind, id)) ?? null),
        set: async (kind, id, data) => {
          snapshot.set(key(kind, id), structuredClone(data));
        },
        delete: async (kind, id) => {
          snapshot.delete(key(kind, id));
        },
        list: async (kind) =>
          [...snapshot.entries()]
            .filter(([k]) => k.startsWith(`${kind}:`))
            .map(([, v]) => structuredClone(v)),
      });
      this.documents = snapshot;
      return result;
    } finally {
      unlock();
    }
  }
}

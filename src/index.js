import { Client, Events, GatewayIntentBits, ActivityType } from "discord.js";
import { PostgresStore, MemoryStore } from "./store.js";
import { Game } from "./game.js";
import { loadConfig } from "./config.js";
import { registerCommands } from "./register.js";
import { createInteractionHandler } from "./controller.js";
import { createHealthServer } from "./health.js";
import { errorMessage, databaseStartupMessage } from "./errors.js";

let store, client, server, cleanupTimer;
let stopping = false;
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  clearInterval(cleanupTimer);
  const timeout = setTimeout(() => process.exit(code || 1), 10000);
  timeout.unref();
  if (client) client.destroy();
  if (server)
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeIdleConnections();
    });
  if (store) await store.close().catch(() => {});
  process.exitCode = code;
}
process.once("SIGINT", () => {
  void shutdown();
});
process.once("SIGTERM", () => {
  void shutdown();
});
process.on("unhandledRejection", (error) => {
  console.error("Erreur asynchrone:", errorMessage(error));
  void shutdown(1);
});

async function main() {
  const config = loadConfig();
  store = config.demo
    ? new MemoryStore()
    : new PostgresStore(config.databaseUrl);
  try {
    await store.init();
  } catch (error) {
    throw new Error(databaseStartupMessage(error, config), { cause: error });
  }
  if (config.demo)
    console.warn("MODE DÉMO : les personnages seront perdus au redémarrage.");
  client = new Client({
    intents: [GatewayIntentBits.Guilds],
    allowedMentions: { parse: [] },
  });
  server = createHealthServer({
    isReady: () => !stopping && client.isReady(),
    ping: () => store.ping(),
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, "0.0.0.0", resolve);
  });
  client.once(Events.ClientReady, (ready) => {
    console.log(
      `Brumeterre est ouverte : ${ready.user.tag} · ${ready.guilds.cache.size} serveur(s).`,
    );
    ready.user.setActivity("/profil • Brumeterre vous attend", {
      type: ActivityType.Playing,
    });
  });
  client.on(Events.Error, (error) => console.error("Discord:", error.message));
  client.on(Events.Warn, (warning) => console.warn("Discord:", warning));
  client.on(
    Events.InteractionCreate,
    createInteractionHandler(new Game(store), { adminGuildId: config.guildId }),
  );
  if (config.register) await registerCommands({ ...config, store });
  const cleanup = async () => {
    if (store instanceof PostgresStore)
      await store.pool.query(
        "DELETE FROM rpg_documents WHERE kind='interaction' AND (data->>'createdAt')::bigint < $1",
        [Date.now() - 7 * 86400000],
      );
    if (store instanceof PostgresStore) await store.pool.query(
      "DELETE FROM rpg_documents WHERE kind='admin_reset' AND (data->>'expiresAt')::bigint < $1", [Date.now()],
    );
  };
  await cleanup();
  cleanupTimer = setInterval(() => {
    cleanup().catch((error) => console.error("Nettoyage:", error.message));
  }, 6 * 3600000);
  cleanupTimer.unref();
  await client.login(config.token);
}
main().catch((error) => {
  console.error("Démarrage impossible:", errorMessage(error));
  void shutdown(1);
});

import { createHash } from "node:crypto";
import { REST, Routes } from "discord.js";
import { commands } from "./commands.js";

export async function registerCommands({
  token,
  clientId,
  guildId,
  store,
  force = false,
}) {
  const scope = guildId ? `${clientId}:${guildId}` : clientId;
  const hash = createHash("sha256")
    .update(JSON.stringify(commands))
    .digest("hex");
  if (store && !force) {
    const old = await store.transaction((tx) =>
      tx.get("config", `commands:${scope}`),
    );
    if (old?.hash === hash) return false;
  }
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(
    guildId
      ? Routes.applicationGuildCommands(clientId, guildId)
      : Routes.applicationCommands(clientId),
    { body: commands },
  );
  if (store)
    await store.transaction((tx) =>
      tx.set("config", `commands:${scope}`, { hash }),
    );
  console.log(
    `${commands.length} commandes enregistrées (${guildId ? "serveur de test" : "globales"}).`,
  );
  return true;
}

export function loadConfig(env = process.env) {
  const required = ["DISCORD_TOKEN", "DISCORD_CLIENT_ID"];
  if (env.DEMO_MODE !== "true") required.push("DATABASE_URL");
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length)
    throw new Error(
      `Variables manquantes : ${missing.join(", ")}. Voir .env.example et README.md.`,
    );
  if (!/^\d{17,20}$/.test(env.DISCORD_CLIENT_ID))
    throw new Error(
      "DISCORD_CLIENT_ID doit être l’Application ID numérique Discord.",
    );
  if (env.DISCORD_GUILD_ID && !/^\d{17,20}$/.test(env.DISCORD_GUILD_ID))
    throw new Error(
      "DISCORD_GUILD_ID doit être un identifiant numérique de serveur.",
    );
  if (env.NODE_ENV === "production" && env.DEMO_MODE === "true")
    throw new Error(
      "DEMO_MODE est interdit en production : configure DATABASE_URL.",
    );
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT doit être compris entre 1 et 65535.");
  return {
    token: env.DISCORD_TOKEN,
    clientId: env.DISCORD_CLIENT_ID,
    guildId: env.DISCORD_GUILD_ID || undefined,
    databaseUrl: env.DATABASE_URL,
    demo: env.DEMO_MODE === "true",
    register: env.REGISTER_COMMANDS !== "false",
    port,
  };
}

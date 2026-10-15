export function loadConfig(env = process.env) {
  const railway = Boolean(env.RAILWAY_PROJECT_ID || env.RAILWAY_ENVIRONMENT_ID);
  const production = env.NODE_ENV === "production" || railway;
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
  if (production && env.DEMO_MODE === "true")
    throw new Error(
      "DEMO_MODE est interdit en production : configure DATABASE_URL.",
    );
  if (railway && env.DEMO_MODE !== "true") {
    let database;
    try {
      database = new URL(env.DATABASE_URL);
    } catch {
      throw new Error(
        "DATABASE_URL invalide sur Railway : ajoute une référence à DATABASE_URL du service PostgreSQL dans Variables → Add Reference.",
      );
    }
    if (
      ["localhost", "127.0.0.1", "[::1]", "0.0.0.0", "[::]"].includes(
        database.hostname.toLowerCase(),
      ) ||
      database.hostname.toLowerCase().endsWith(".localhost")
    )
      throw new Error(
        "DATABASE_URL pointe vers une adresse locale sur Railway. Dans Variables du bot, remplace-la par une référence à DATABASE_URL du service PostgreSQL, par exemple ${{Postgres.DATABASE_URL}}, ou utilise Add Reference.",
      );
    if (!["postgres:", "postgresql:"].includes(database.protocol))
      throw new Error(
        "DATABASE_URL doit être une URL PostgreSQL. Sur Railway, sélectionne DATABASE_URL du service PostgreSQL avec Add Reference.",
      );
  }
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
    production,
    railway,
    port,
  };
}

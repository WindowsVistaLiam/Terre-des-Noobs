// Les erreurs réseau agrégées de Node peuvent avoir un message vide.
export function errorMessage(error) {
  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message;
  }
  const codes = [
    error?.code,
    ...(error?.errors ?? []).map((item) => item?.code),
  ].filter((code) => typeof code === "string" && /^[A-Z0-9_]+$/.test(code));
  if (codes.includes("ECONNREFUSED")) {
    return "Connexion refusée (ECONNREFUSED). Vérifie que le service demandé est démarré et accessible.";
  }
  return [...new Set(codes)].join(", ") || error?.name || "Erreur inconnue";
}

export function databaseStartupMessage(error, config) {
  const hint = config.railway
    ? "Sur Railway, vérifie que PostgreSQL est démarré dans le même projet et environnement, puis sélectionne sa variable DATABASE_URL avec Variables → Add Reference dans le service du bot. Garde DEMO_MODE=false."
    : config.production
      ? "Vérifie DATABASE_URL et la disponibilité du service PostgreSQL. Garde DEMO_MODE=false en production."
      : "Pour un test local sans base de données, mets DEMO_MODE=true dans .env.";
  return `Connexion PostgreSQL impossible : ${errorMessage(error)} ${hint}`;
}

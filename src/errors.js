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

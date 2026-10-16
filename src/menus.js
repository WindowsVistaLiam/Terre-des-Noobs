// Les options conservent les routes existantes : mêmes validations, formulaires
// et confirmations, y compris après un redémarrage ou depuis un ancien panneau.
const DIRECT_ACTIONS = new Set([
  "returnHome", "rest", "collect", "daily", "claimQuest", "talent",
  "buy", "cancelListing", "equip", "unequip", "enchant", "consume",
  "build", "upgradeBuilding", "partyJoin", "partyCreate", "guildJoin",
  "friendRespond", "guildInviteRespond", "duelRespond", "cityClaim",
  "cityGuard", "cityDefense", "cityUpgrade", "citySiege",
]);
const MAIN_DESTINATIONS = new Set(["profile", "social", "market", "info"]);
const routeParts = (component) => {
  const parts = component.custom_id.split(":");
  const offset = parts[0] === "tdnp" ? 1 : 2;
  return { action: parts[offset], arg: parts[offset + 1] };
};
const destination = (component) => {
  const { action, arg } = routeParts(component);
  return action === "nav" ? arg : action;
};
const pagination = (label) =>
  /^(?:←|→|← Précédent|Suivant →|← Page précédente|Page suivante →|\d+ \/ \d+)$/.test(label);
function keepButton(component) {
  const { action, arg } = routeParts(component);
  return action === "fight" || action === "huntAgain" ||
    pagination(component.label) || ["Confirmer", "Annuler"].includes(component.label) ||
    (action === "do" && DIRECT_ACTIONS.has(arg)) ||
    (action === "form" && ["create", "craft", "shopBuy"].includes(arg)) ||
    (action === "confirm" && ["raid", "citySiege"].includes(arg)) ||
    (action === "nav" && ["campaign", "encounters", "creationRace"].includes(arg)) ||
    ["Mon carnet privé", "Rejoindre l’aventure", "Ouvrir la carte", "Voir son profil"].includes(component.label);
}

export function compactMenus(rows, owner, isPublic = false) {
  isPublic ||= rows.some((row) => row.components.some((c) => c.custom_id?.startsWith("tdnp:")));
  const selections = [], fixedRows = [], buttons = [], contextual = [], global = [];
  for (const row of rows) {
    if (row.components.some((c) => c.type !== 2)) {
      selections.push(row);
      continue;
    }
    const mainNavigation = row.components.length === 4 &&
      new Set(row.components.map(destination)).size === 4 &&
      row.components.every((c) => MAIN_DESTINATIONS.has(destination(c)));
    if (mainNavigation) {
      for (const c of row.components) {
        if (c.label === "Mon carnet privé") buttons.push(c);
        else if (!c.disabled) global.push(c);
      }
      continue;
    }
    if (row.components.every((c) => routeParts(c).action === "fight")) {
      fixedRows.push(row);
      continue;
    }
    for (const c of row.components) {
      if (keepButton(c)) buttons.push(c);
      else if (!c.disabled) contextual.push(c);
    }
  }
  const menus = [];
  const addMenu = (choices, kind, placeholder) => {
    for (let start = 0; start < choices.length; start += 25) {
      menus.push({ type: 1, components: [{
        type: 3,
        custom_id: isPublic ? `tdnp:menu:${kind}:${start}` : `tdn:${owner}:menu:${kind}:${start}`,
        placeholder, min_values: 1, max_values: 1,
        options: choices.slice(start, start + 25).map((c) => ({
          label: c.label.slice(0, 100), value: c.custom_id,
        })),
      }] });
    }
  };
  for (let i = 0; i < buttons.length; i += 5)
    fixedRows.push({ type: 1, components: buttons.slice(i, i + 5) });
  if (selections.length + fixedRows.length + Number(contextual.length > 0) + Number(global.length > 0) > 5) {
    addMenu([...contextual, ...global], "all", "Actions et navigation");
  } else {
    addMenu(contextual, "context", "Actions et rubriques de ce menu");
    addMenu(global, "global", global.some((c) => destination(c) === "profile")
      ? "Navigation · Profil, Social, Marché, Info" : "Navigation · Social, Marché, Info");
  }
  return [...selections, ...menus.filter((m) => !m.components[0].custom_id.includes(":global:")),
    ...fixedRows, ...menus.filter((m) => m.components[0].custom_id.includes(":global:"))];
}

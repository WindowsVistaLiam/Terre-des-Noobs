import { ensure, statsOf, gearLabel } from "./game.js";
import {
  RACES,
  CLASSES,
  ZONES,
  BUILDINGS,
  RECIPES,
  RESOURCES,
} from "./content.js";
import { CITY_UPGRADES } from "./social-content.js";

// Une projection explicite : aucun coffre, sac, courrier ou lien d’amitié.
export async function publicProfile(game, targetId) {
  return game.store.transaction(async (tx) => {
    const p = await tx.get("player", targetId);
    if (!p) return { type: "publicWelcome", targetId, now: game.now() };
    const guild = p.guildId ? await tx.get("guild", p.guildId) : null;
    return {
      type: "publicProfile",
      now: game.now(),
      target: {
        id: p.id,
        name: p.name,
        raceId: p.raceId,
        classId: p.classId,
        level: p.level,
        stats: statsOf(p),
        guildName: guild?.name,
        location: p.location === "base" ? "Au refuge" : ZONES[p.zone].name,
        inBattle: Boolean(p.battle),
        bosses: p.bosses.length,
        kills: p.kills,
        wins: p.social?.wins ?? 0,
        losses: p.social?.losses ?? 0,
        honor: p.social?.honor ?? 0,
        defenses: p.social?.defenses ?? 0,
        equipment: Object.entries(p.equipment).map(([slot, id]) => {
          const item = p.gear.find((g) => g.id === id);
          return {
            slot,
            label: item ? gearLabel(item) : "Aucun",
            level: item?.level,
          };
        }),
      },
    };
  });
}

export async function publicMarket(game, page = 1) {
  ensure(
    Number.isSafeInteger(page) && page >= 1 && page <= 10000,
    "Page invalide.",
  );
  return game.store.transaction(async (tx) => {
    const all = (await tx.list("listing"))
      .filter((l) => l.expiresAt > game.now())
      .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
    const pages = Math.max(1, Math.ceil(all.length / 6));
    page = Math.min(page, pages);
    return {
      type: "publicMarket",
      page,
      pages,
      now: game.now(),
      listings: all.slice((page - 1) * 6, page * 6).map((l) => ({
        id: l.id,
        sellerName: l.sellerName,
        price: l.price,
        label: l.item
          ? gearLabel(l.item)
          : `${l.quantity} ${RESOURCES[l.resource]}`,
      })),
    };
  });
}

// Les annonces ne réutilisent jamais le message détaillé du menu personnel.
export function activityFor(action, args, result, before) {
  const p = result.p;
  if (!p || result.duplicate) return null;
  let title,
    text,
    background = "profile";
  switch (action) {
    case "create":
      title = "Un nouveau héros entre dans la Brume";
      text = `${p.name}, ${RACES[p.raceId].name} ${CLASSES[p.classId].name}, commence son aventure.`;
      break;
    case "travel":
      title = "Le départ d’un aventurier";
      text = `${p.name} prend la route de ${ZONES[p.zone].name}.`;
      break;
    case "combat": {
      if (!before?.battle || p.battle) return null;
      const enemy = before.battle.enemy;
      title =
        args.move === "flee"
          ? "Repli dans la Brume"
          : p.kills > before.kills
            ? "Victoire sur la route"
            : "Retour des éclaireurs";
      text =
        args.move === "flee"
          ? `${p.name} se replie face à ${enemy.name}.`
          : p.kills > before.kills
            ? `${p.name} terrasse ${enemy.name}${enemy.boss ? ", gardien de la région" : ""} dans ${ZONES[p.zone].name}. Niveau ${p.level}.`
            : `${enemy.name} repousse ${p.name}, qui est ramené au refuge.`;
      break;
    }
    case "build":
    case "upgradeBuilding": {
      const b = p.buildings[args.slot - 1];
      if (!b) return null;
      title = "Un refuge se développe";
      text = `${p.name} ${action === "build" ? "construit" : "améliore"} ${BUILDINGS[b.type].name} : niveau ${b.level}.`;
      break;
    }
    case "craft":
      if (!RECIPES[args.recipeId]?.slot) return null;
      title = "Une création à l’atelier";
      text = `${p.name} fabrique ${args.quantity ?? 1} × ${RECIPES[args.recipeId].name}.`;
      background = "market";
      break;
    case "sell":
      title = "Une nouvelle offre au marché";
      text = `${p.name} met en vente ${args.itemId ? "un équipement" : `${args.quantity ?? 1} ${RESOURCES[args.resource]}`} pour ${args.price} or le lot.`;
      background = "market";
      break;
    case "guildCreate":
    case "guildJoin":
    case "guildInviteRespond":
      if (
        !result.guild ||
        (action === "guildInviteRespond" && args.response !== "accept")
      )
        return null;
      title =
        action === "guildCreate"
          ? "Une nouvelle bannière"
          : "Un compagnon rejoint la guilde";
      text = `${p.name} ${action === "guildCreate" ? "fonde" : "rejoint"} ${result.guild.name}.`;
      background = "social";
      break;
    case "guildUpgrade":
      title = "Une bannière grandit";
      text = `${result.guild.name} atteint le niveau ${result.guild.level}, sous l’impulsion de ${p.name}.`;
      background = "social";
      break;
    case "duelRespond": {
      const d = result.duel;
      if (d?.status !== "finished") return null;
      title = "Les résultats de la lice";
      text = `${d.fromName} affronte ${d.toName} : ${d.winner ? `${d.fighters.find((f) => f.id === d.winner).name} remporte le duel` : "égalité"}, après ${d.turns} tours.`;
      background = "social";
      break;
    }
    case "raid":
      title = result.won ? "Le raid est victorieux" : "Le raid doit se replier";
      text = `${result.fighters.map((f) => f.name).join(", ")} ${result.won ? "terrassent" : "affrontent"} ${result.boss.name}.`;
      background = "social";
      break;
    case "cityUpgrade":
      title = "La cité renforce ses défenses";
      text = `${p.name} améliore ${CITY_UPGRADES[args.buildingId].name} pour ${result.guild.name} : niveau ${result.guild.city.buildings[args.buildingId]}.`;
      background = "social";
      break;
    case "cityDefense":
      if (!result.guild.city.invasion.won) return null;
      title = "La cité a tenu bon";
      text = `${result.guild.name} repousse ${result.guild.city.invasion.name} ! ${p.name} mène la dernière sortie et les défenseurs peuvent réclamer leur récompense.`;
      background = "social";
      break;
    case "citySiege":
      title = "Les échos du siège";
      text = `${result.siege.attacker} attaque ${result.siege.defender} : ${result.siege.won ? "victoire des assaillants" : "les défenseurs tiennent bon"}.`;
      background = "social";
      break;
    default:
      return null;
  }
  return {
    type: "publicActivity",
    title,
    text,
    background,
    actorId: p.id,
    actorName: p.name,
    level: p.level,
  };
}

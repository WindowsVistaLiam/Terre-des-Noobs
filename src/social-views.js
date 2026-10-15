import { RACES, CLASSES, RESOURCES, HOUR, dayKey } from "./content.js";
import {
  CITY_UPGRADES,
  cityUpgradeCost,
  DEFENSE_ROLES,
} from "./social-content.js";
import { plainText } from "./canvas.js";

const resources = (values) =>
  Object.entries(values)
    .filter(([, n]) => n > 0)
    .map(([key, n]) => `${plainText(RESOURCES[key] ?? key)} : ${n}`)
    .join("\n") || "Aucun matériau en réserve.";
const seen = (time, now) =>
  now - time < 10 * 60000
    ? "Actif récemment dans le jeu"
    : now - time < 24 * HOUR
      ? "Vu dans le jeu aujourd’hui"
      : "En voyage";
const types = new Set([
  "social",
  "friends",
  "blocked",
  "directory",
  "playerCard",
  "inbox",
  "request",
  "duels",
  "duel",
  "pvpLeaderboard",
  "guildRoster",
  "guildMember",
  "city",
  "cityDefensePlan",
  "cityUpgrade",
  "cityTargets",
  "siegePreview",
  "siege",
]);

export function buildSocialView(result, owner, ui) {
  if (!types.has(result.type)) return false;
  const {
    screen,
    card,
    row,
    choice,
    btn,
    nav,
    act,
    push,
    select,
    pages,
    back,
  } = ui;
  const { p, now = Date.now() } = result;
  screen.background = "social";
  screen.tone = "purple";
  switch (result.type) {
    case "social": {
      const incoming =
        (result.mail?.incoming.length ?? 0) +
        (result.mail?.invitations.length ?? 0) +
        (result.mail?.challenges.length ?? 0);
      screen.title = "Le cercle des compagnons";
      screen.subtitle = `${p.name} · ${p.social.friends.length} ami(s) · ${incoming} demande(s) reçue(s)`;
      screen.cards = [
        card(
          "Tes amis & ta réception",
          "Demandes d’amis, invitations de guilde, défis et cadeaux. Retrouve les personnages de tes amis et compare vos équipements sans exposer vos coffres.",
        ),
        card(
          result.guildName ?? "Une cité à bâtir ensemble",
          "Dépose des matériaux, construis les remparts, prends la garde et repousse les invasions avec tes compagnons. Les guildes volontaires peuvent aussi se défier en siège.",
        ),
        card(
          "La lice des compagnons",
          `${p.social.wins} victoire(s), ${p.social.losses} défaite(s), ${p.social.draws} égalité(s) en duel.\nLes duels exigent l’accord de l’adversaire et ne consomment ni vie réelle, ni or, ni équipement.`,
        ),
        card(
          "Le renom de ton héros",
          `${p.social.honor} honneur · ${p.social.defenses} défense(s) de cité récompensée(s)\nLes défenses coopératives donnent des récompenses. Les duels sont réservés au prestige du classement.`,
        ),
      ];
      push(
        row(
          nav("Mes amis", "friends"),
          nav(`Réception (${incoming})`, "inbox"),
          nav("Voir les profils", "directory"),
        ),
      );
      push(
        row(
          nav("Ma guilde", "guildInfo"),
          nav("Notre cité", "city"),
          nav("Mon groupe", "partyInfo"),
          nav("Mes duels", "duels"),
        ),
      );
      push(
        row(
          nav("Classement des duels", "pvpLeaderboard"),
          nav("Les héros", "leaderboard"),
          btn("Offrir un cadeau", "giftTargetMenu"),
        ),
      );
      break;
    }
    case "friends":
    case "directory":
    case "blocked": {
      const blocked = result.type === "blocked",
        friends = result.type === "friends";
      screen.title = blocked
        ? "Les portes fermées"
        : friends
          ? "Ton cercle d’amis"
          : "Les aventuriers de Brumeterre";
      screen.subtitle = `Page ${result.page} / ${result.pages}${friends ? ` · ${p.social.friends.length} / 100 amis` : ""}`;
      screen.cards = result.entries.map((v) =>
        card(
          v.name,
          `${RACES[v.raceId].name} · ${CLASSES[v.classId].name} · niveau ${v.level}\n${blocked ? "Interactions directes bloquées." : `${seen(v.lastActiveAt ?? 0, now)}\n${v.wins ?? 0} victoire(s) en duel`}`,
        ),
      );
      if (!screen.cards.length)
        screen.cards = [
          card(
            blocked
              ? "Personne n’est bloqué"
              : friends
                ? "Ton cercle attend ses premiers noms"
                : "Les routes sont encore calmes",
            friends
              ? "Retrouve un membre du serveur ou parcours l’annuaire pour lui envoyer une demande d’amitié."
              : "Les nouveaux aventuriers apparaîtront ici après avoir créé leur personnage.",
          ),
        ];
      push(
        select(
          "player",
          blocked
            ? "Consulter et débloquer un aventurier"
            : "Rencontrer un aventurier",
          result.entries.map((v) =>
            choice(v.id, `${v.name} · niv. ${v.level}`),
          ),
        ),
      );
      if (!blocked)
        push(
          row({
            type: 5,
            custom_id: ui.id("player", "lookup"),
            placeholder: "Retrouver un membre du serveur",
            min_values: 1,
            max_values: 1,
          }),
        );
      pages(result.page, result.pages, result.type);
      push(
        row(
          nav("Demandes & invitations", "inbox"),
          nav(
            blocked ? "Mes amis" : "Personnes bloquées",
            blocked ? "friends" : "blocked",
          ),
        ),
      );
      break;
    }
    case "playerCard": {
      const t = result.target,
        unavailable = result.blocked || result.unavailable || t.id === owner;
      screen.title = t.name;
      screen.subtitle = `${RACES[t.raceId].name} · ${CLASSES[t.classId].name} · niveau ${t.level}`;
      screen.cards = [
        card(
          "Sa voie",
          `${t.stats.attack} attaque · ${t.stats.defense} défense\n${t.stats.power} puissance · ${t.stats.hp} PV maximum\n${t.guildName ?? "Sans guilde"}`,
        ),
        card(
          "Son renom",
          `${t.wins} victoire(s) et ${t.losses} défaite(s) en duel\n${t.honor} honneur · ${t.defenses} défense(s) de cité\n${result.mutualCount} ami(s) en commun`,
        ),
        card(
          "Votre relation",
          result.blocked
            ? "Tu as bloqué cet aventurier. Débloque-le pour lui proposer à nouveau une amitié ou un duel."
            : result.isFriend
              ? "Vous êtes amis. Invitez-vous en guilde, entraînez-vous en duel ou partagez vos trouvailles."
              : "Propose une amitié ou un duel. Ton adversaire doit accepter avant toute rencontre.",
        ),
        card(
          "La lice est sans risque",
          "Un duel simule vos personnages à pleine vie et plein mana avec leurs équipements actuels. Il ne donne ni or ni XP. Vos jauges réelles restent inchangées.",
        ),
      ];
      push(
        row(
          btn(
            result.isFriend ? "Retirer des amis…" : "Demande d’amitié",
            result.isFriend ? "confirm" : "do",
            [result.isFriend ? "friendRemove" : "friendRequest", t.id],
            { disabled: unavailable },
          ),
          btn("Proposer un duel", "do", ["duelChallenge", t.id], {
            style: 1,
            disabled: unavailable || p.location !== "base",
          }),
          btn("Offrir un cadeau", "giftFor", [t.id], {
            disabled: unavailable || p.location !== "base",
          }),
        ),
      );
      push(
        row(
          btn("Inviter dans ma guilde", "do", ["guildInvite", t.id], {
            disabled: unavailable || !result.canInvite || Boolean(t.guildId),
          }),
          btn(
            result.blocked ? "Débloquer" : "Bloquer…",
            result.blocked ? "do" : "confirm",
            [result.blocked ? "unblockPlayer" : "blockPlayer", t.id],
            { style: result.blocked ? 2 : 4, disabled: t.id === owner },
          ),
          nav("Retour aux amis", "friends"),
          btn("Profil complet", "viewProfile", [t.id]),
        ),
      );
      break;
    }
    case "inbox": {
      screen.title = "Le courrier des compagnons";
      screen.subtitle = `Demandes reçues et envoyées · page ${result.page} / ${result.pages}`;
      screen.cards = result.entries.map(({ kind, record: r }) =>
        card(
          kind === "friend"
            ? r.from === owner
              ? `Amitié envoyée à ${r.toName}`
              : `${r.fromName} veut devenir ton ami`
            : kind === "guild"
              ? `Invitation : ${r.guildName}`
              : `Défi de ${r.fromName}`,
          kind === "duel"
            ? "Duel d’entraînement sans perte de ressources. Réponds avant 15 minutes."
            : kind === "guild"
              ? `${r.fromName} t’invite sous sa bannière. Tu peux accepter ou refuser.`
              : "Demande valable sept jours. Aucune amitié n’est ajoutée sans acceptation.",
        ),
      );
      if (!screen.cards.length)
        screen.cards = [
          card(
            "Aucun courrier en attente",
            "Les demandes d’amis, invitations de guilde et défis apparaîtront ici. Tu peux rencontrer des aventuriers dans l’annuaire.",
          ),
        ];
      push(
        select(
          "notification",
          "Ouvrir une demande ou un défi",
          result.entries.map(({ kind, record: r }) =>
            choice(
              `${kind}|${r.id}`,
              kind === "friend"
                ? `${r.from === owner ? "À" : "De"} ${r.from === owner ? r.toName : r.fromName} · amitié`
                : kind === "guild"
                  ? `Guilde ${r.guildName}`
                  : `Duel de ${r.fromName}`,
            ),
          ),
        ),
      );
      pages(result.page, result.pages, "inbox");
      back("social", "← Au cercle");
      break;
    }
    case "request": {
      const r = result.record,
        isGuild = result.kind === "guild",
        valid = r.status === "pending" && r.expiresAt > now;
      screen.title = isGuild
        ? `Sous la bannière de ${r.guildName}`
        : `Une amitié avec ${r.from === owner ? r.toName : r.fromName}`;
      screen.subtitle = valid
        ? "Une décision t’appartient."
        : "Cette demande n’est plus active.";
      screen.cards = [
        card(
          "Le courrier",
          isGuild
            ? `${r.fromName} t’invite à rejoindre ${r.guildName}. La guilde possède un trésor commun et une cité à défendre.`
            : `${r.fromName} souhaite ajouter ${r.toName} à son cercle d’amis.`,
        ),
        card(
          "Ton choix",
          "Accepter ajoute la relation à vos personnages. Refuser classe la demande ; un délai évite les demandes répétées. Aucun message privé automatique n’est envoyé.",
        ),
      ];
      if (r.to === owner)
        push(
          row(
            btn(
              "Accepter",
              "do",
              [
                isGuild ? "guildInviteRespond" : "friendRespond",
                r.id,
                "accept",
              ],
              { style: 3, disabled: !valid },
            ),
            btn(
              "Refuser",
              "do",
              [
                isGuild ? "guildInviteRespond" : "friendRespond",
                r.id,
                "decline",
              ],
              { disabled: !valid },
            ),
          ),
        );
      else if (!isGuild)
        push(
          row(
            btn("Annuler ma demande", "do", ["friendRespond", r.id, "cancel"], {
              disabled: !valid,
            }),
          ),
        );
      back("inbox", "← À la réception");
      break;
    }
    case "duels":
      screen.title = "Le livre de la lice";
      screen.subtitle = `${p.social.wins} victoires · ${p.social.losses} défaites · ${p.social.draws} égalités · page ${result.page} / ${result.pages}`;
      screen.cards = result.entries.map((d) =>
        card(
          `${d.fromName} contre ${d.toName}`,
          d.status === "finished"
            ? `${d.winner ? (d.winner === owner ? "Tu as remporté ce duel." : "Ton adversaire a gagné.") : "Égalité."}\n${d.turns} tours · vos personnages réels sont intacts.`
            : "Un défi attend une réponse pendant 15 minutes.",
        ),
      );
      if (!screen.cards.length)
        screen.cards = [
          card(
            "La lice t’attend",
            "Choisis un aventurier dans tes amis ou l’annuaire et propose-lui un duel. Il devra accepter depuis sa réception.",
          ),
        ];
      push(
        select(
          "duelEntry",
          "Consulter un duel",
          result.entries.map((d) =>
            choice(
              d.id,
              `${d.fromName} / ${d.toName}`,
              d.status === "finished"
                ? "Compte rendu du duel"
                : "Défi en attente",
            ),
          ),
        ),
      );
      pages(result.page, result.pages, "duels");
      push(
        row(
          nav("Trouver un adversaire", "directory"),
          nav("Classement", "pvpLeaderboard"),
        ),
      );
      break;
    case "duel": {
      const d = result.duel,
        pending = d.status === "pending" && d.expiresAt > now;
      screen.title = `${d.fromName} contre ${d.toName}`;
      screen.subtitle =
        d.status === "finished"
          ? `Duel terminé · ${d.turns} tours`
          : pending
            ? "Défi d’entraînement · valable 15 minutes"
            : "Ce défi est clos";
      screen.cards = d.fighters?.map((f) =>
        card(
          f.name,
          `${f.hp} / ${f.maxHp} PV au dernier tour\n${f.damage} dégâts infligés · ${f.healed} soins\n${d.winner === f.id ? "Vainqueur de la rencontre" : !d.winner ? "Égalité" : "La revanche sera pour une autre fois"}`,
        ),
      ) ?? [
        card(
          "Un duel sans perte",
          "Les deux héros s’affrontent à pleine vie et mana, avec leurs équipements actuels. Vous devez tous deux être à la base. Aucun or, XP, objet ou PV réel ne sera perdu.",
        ),
        card(
          "Une minute entre deux rencontres",
          "L’ordre de jeu alterne à chaque tour. Les compétences et soins sont simulés ; après 40 tours sans vainqueur, la rencontre est déclarée nulle.",
        ),
      ];
      if (pending)
        push(
          row(
            ...(d.to === owner
              ? [
                  btn(
                    "Accepter le duel",
                    "do",
                    ["duelRespond", d.id, "accept"],
                    { style: 3 },
                  ),
                  btn("Décliner", "do", ["duelRespond", d.id, "decline"]),
                ]
              : [
                  btn("Retirer mon défi", "do", [
                    "duelRespond",
                    d.id,
                    "cancel",
                  ]),
                ]),
          ),
        );
      back("duels", "← Mes duels");
      break;
    }
    case "pvpLeaderboard":
      screen.title = "Les champions de la lice";
      screen.subtitle =
        "Classement par victoires en duel, puis honneur de défense.";
      screen.cards = result.leaders.map((v, i) =>
        card(
          `${i + 1}. ${v.name}`,
          `${CLASSES[v.classId].name} · niveau ${v.level}\n${v.wins} victoires · ${v.losses} défaites\n${v.honor} honneur · ${v.defenses} défenses récompensées`,
        ),
      );
      back("social", "← Au cercle");
      break;
    case "guildRoster":
      screen.title = `Les compagnons de ${result.guild.name}`;
      screen.subtitle = `Page ${result.page} / ${result.pages} · ${result.guild.members.length} membres`;
      screen.cards = result.entries.map((m) =>
        card(
          m.name,
          `Niveau ${m.level}\n${m.id === result.guild.leaderId ? "Chef de guilde" : result.guild.officers?.includes(m.id) ? "Officier" : "Compagnon"}`,
        ),
      );
      push(
        select(
          "guildMember",
          "Consulter ou gérer un membre",
          result.entries.map((m) => choice(m.id, m.name, `Niveau ${m.level}`)),
        ),
      );
      pages(result.page, result.pages, "guildRoster");
      back("guildInfo", "← À la guilde");
      break;
    case "guildMember": {
      const g = result.guild,
        m = result.member,
        leader = g.leaderId === owner,
        promoted = g.officers?.includes(m.id);
      screen.title = m.name;
      screen.subtitle = `${g.name} · niveau ${m.level}`;
      screen.cards = [
        card(
          "Son rang",
          m.id === g.leaderId
            ? "Chef de guilde"
            : promoted
              ? "Officier"
              : "Compagnon",
        ),
        card(
          "Les officiers",
          "Ils peuvent inviter des membres, publier le message de guilde, construire dans la cité et lancer des sièges. Le chef reste responsable des promotions, exclusions et de l’activation des sièges.",
        ),
      ];
      push(
        row(
          btn("Voir son personnage", "player", [m.id]),
          btn(
            promoted ? "Retirer le rang d’officier" : "Nommer officier",
            "do",
            ["guildManage", m.id, promoted ? "demote" : "promote"],
            { disabled: !leader || m.id === owner },
          ),
          btn("Exclure…", "confirm", ["guildKick", m.id], {
            style: 4,
            disabled: !leader || m.id === owner,
          }),
        ),
      );
      back("guildRoster", "← Aux membres");
      break;
    }
    case "city": {
      const g = result.guild,
        c = g.city,
        stats = result.cityStats,
        e = c.invasion;
      screen.title = `Cité · ${g.name}`;
      screen.subtitle = `Prestige ${c.prestige} · ${c.warfare ? "Sièges entre guildes activés" : "Cité à l’abri des sièges entre guildes"}`;
      screen.metrics = [
        {
          label: "Intégrité",
          value: `${c.integrity} / ${stats.maxIntegrity}`,
          current: c.integrity,
          max: stats.maxIntegrity,
          color: "green",
        },
        { label: "Défense de siège", value: `${stats.defense}` },
        { label: "Trésor commun", value: `${g.gold} or` },
      ];
      screen.cards = [
        card(
          "Votre domaine commun",
          Object.entries(CITY_UPGRADES)
            .map(([key, b]) => `${b.name} : niveau ${c.buildings[key]} / 5`)
            .join("\n"),
        ),
        card("Les réserves de la cité", resources(c.resources)),
        card(
          e?.name ?? "La menace du jour",
          e?.won
            ? "L’invasion est repoussée ! Les participants peuvent récupérer leur récompense.\nUne récompense par personnage et par jour."
            : `Menace restante : ${e?.hp ?? 0} / ${e?.maxHp ?? 0}\nTrois sorties par personne et par jour, espacées de cinq minutes. 10 énergie et 10 % de PV par sortie.\nJouez ensemble : un assaut, un bastion ou un soutien selon votre héros.`,
        ),
        card(
          "Gardes & vie de la guilde",
          `${stats.guards} garde(s) actif(s)\n${
            Object.values(c.guards)
              .map((v) => v.name)
              .join(", ") || "Personne ne monte encore la garde."
          }\n${
            g.log
              ?.slice(0, 3)
              .map((v) => v.text)
              .join("\n") ||
            "Les premières pierres de votre histoire attendent vos actes."
          }`,
        ),
      ];
      push(
        select(
          "cityPlan",
          "Consulter les fortifications et leurs coûts",
          Object.entries(CITY_UPGRADES).map(([key, b]) =>
            choice(key, `${b.name} · niv. ${c.buildings[key]}`, b.description),
          ),
        ),
      );
      push(
        select(
          "cityDonate",
          "Donner des matériaux à la réserve…",
          ["bois", "pierre", "fer", "herbe", "essence"]
            .filter((k) => p.resources[k] > 0)
            .map((key) =>
              choice(
                key,
                `${plainText(RESOURCES[key])} · ${p.resources[key]} disponible(s)`,
              ),
            ),
        ),
      );
      push(
        row(
          nav("Défendre ensemble", "cityDefensePlan"),
          btn("Monter la garde · 10 énergie", "do", ["cityGuard"], {
            disabled: Boolean(c.guards[owner]) || p.energy < 10,
          }),
          btn("Récompense du jour", "do", ["cityClaim"], {
            style: 3,
            disabled:
              !e?.won ||
              !(e?.contributions[owner] > 0) ||
              p.social.cityClaimDay === dayKey(now),
          }),
        ),
      );
      push(
        row(
          nav("Les sièges", "cityTargets"),
          btn(
            c.warfare ? "Désactiver les sièges…" : "Activer les sièges…",
            "confirm",
            ["cityWarToggle"],
            { disabled: g.leaderId !== owner },
          ),
          btn("Donner de l’or…", "form", ["guildDonate"]),
          nav("Guilde", "guildInfo"),
        ),
      );
      break;
    }
    case "cityDefensePlan": {
      const e = result.guild.city.invasion,
        b = result.guild.city.buildings;
      screen.title = e.name;
      screen.subtitle = `Invasion de ${result.guild.name} · menace ${e.hp} / ${e.maxHp}`;
      screen.cards = [
        card(
          "Assaut",
          "La force de ton arme ou de ta magie et la caserne renforcent cette sortie.",
        ),
        card(
          "Bastion",
          "Ta défense, tes PV et les remparts permettent de briser l’élan des envahisseurs.",
        ),
        card(
          "Soutien",
          "Ta puissance, tes PV et l’hospice rendent cette sortie efficace.",
        ),
        card(
          "Ton engagement",
          `${e.sorties[owner] ?? 0} / 3 sorties aujourd’hui\n10 énergie et 10 % de tes PV maximaux par sortie. Il faut être à la base avec 50 % de vie. Attends cinq minutes entre sorties.\nPhare : +${b.phare * 8} à chaque sortie.\nLes participants réclament leurs récompenses après la victoire.`,
        ),
      ];
      push(
        row(
          ...Object.entries(DEFENSE_ROLES).map(([key, label]) =>
            btn(label, "do", ["cityDefense", key], {
              style: 1,
              disabled:
                e.won ||
                (e.sorties[owner] ?? 0) >= 3 ||
                result.guild.members.length < 2 ||
                p.energy < 10,
            }),
          ),
        ),
      );
      back("city", "← À la cité");
      break;
    }
    case "cityUpgrade": {
      const g = result.guild,
        b = CITY_UPGRADES[result.buildingId],
        level = g.city.buildings[result.buildingId],
        cost = cityUpgradeCost(result.buildingId, level + 1);
      screen.title = b.name;
      screen.subtitle = `Construction commune · niveau ${level} / 5`;
      screen.cards = [
        card("Les avantages", b.description),
        card(
          "Prochain niveau",
          level >= 5
            ? "Cette construction a atteint son niveau maximal."
            : `${cost.gold} or du trésor\n${resources(cost.resources)}`,
        ),
        card(
          "Le trésor disponible",
          `${g.gold} or\n${resources(g.city.resources)}`,
        ),
        card(
          "Bâtir ensemble",
          "Tous les membres peuvent contribuer en or et en matériaux. Le chef et les officiers choisissent les constructions à améliorer.",
        ),
      ];
      push(
        row(
          btn(
            "Améliorer la construction",
            "do",
            ["cityUpgrade", result.buildingId],
            {
              style: 3,
              disabled:
                level >= 5 ||
                !(g.leaderId === owner || g.officers?.includes(owner)),
            },
          ),
          nav("← À la cité", "city"),
        ),
      );
      break;
    }
    case "cityTargets":
      screen.title = "Les bannières rivales";
      screen.subtitle = `Sièges volontaires · page ${result.page} / ${result.pages}`;
      screen.cards = result.entries.map((g) =>
        card(
          g.name,
          `Guilde niveau ${g.level}\n${g.cityStats.defense} défense · ${g.cityStats.guards} garde(s)\n${g.city.shieldUntil > now ? "Protégée après un siège récent." : "Un siège peut être proposé."}`,
        ),
      );
      if (!screen.cards.length)
        screen.cards = [
          card(
            "Pas de cité rivale disponible",
            "Seules les guildes ayant activé les sièges et un niveau proche du vôtre apparaissent. Votre chef peut activer les sièges depuis la cité.",
          ),
          card(
            "Le prix d’une expédition",
            "120 or du trésor et 15 énergie du commandant. Une attaque toutes les six heures. Les coffres personnels et bâtiments sont protégés ; les victoires apportent du prestige.",
          ),
        ];
      push(
        select(
          "siegeTarget",
          "Examiner une cité adverse",
          result.entries.map((g) =>
            choice(
              g.id,
              g.name,
              `${g.cityStats.defense} défense · niveau ${g.level}`,
            ),
          ),
        ),
      );
      pages(result.page, result.pages, "cityTargets");
      back("city", "← À la cité");
      break;
    case "siegePreview": {
      const t = result.target,
        g = result.guild,
        can =
          (g.leaderId === owner || g.officers?.includes(owner)) &&
          g.city.warfare &&
          t.city.warfare &&
          t.city.shieldUntil <= now &&
          (g.city.attackAt === null || now - g.city.attackAt >= 6 * HOUR);
      screen.title = `Aux portes de ${t.name}`;
      screen.subtitle = "Reconnaissance avant un siège volontaire";
      screen.cards = [
        card(
          "Les remparts adverses",
          `${t.cityStats.defense} défense\n${t.city.integrity} / ${t.cityStats.maxIntegrity} intégrité\n${t.cityStats.guards} garde(s) actif(s)`,
        ),
        card(
          "Votre expédition",
          `${result.cityStats.attack} puissance d’armée avant le bonus de ton personnage\nCoût : 120 or du trésor et 15 énergie.\nRécupération : six heures entre deux attaques.`,
        ),
        card(
          "Les règles du siège",
          "Les deux guildes doivent activer les sièges. Aucun coffre n’est pillé et aucun bâtiment n’est détruit. L’intégrité ne descend pas sous 25 % et remonte avec le temps.",
        ),
        card(
          "L’heure du choix",
          `${t.city.shieldUntil > now ? "Cette cité est encore protégée." : "La défense recevra six heures de protection après la bataille."}\nSeul le chef ou un officier engage le trésor.`,
        ),
      ];
      push(
        row(
          btn("Engager le siège…", "confirm", ["citySiege", t.id], {
            style: 4,
            disabled: !can,
          }),
          nav("← Autres cités", "cityTargets"),
        ),
      );
      break;
    }
    case "siege": {
      const s = result.siege;
      screen.title = `${s.attacker} contre ${s.defender}`;
      screen.subtitle = s.won
        ? "Victoire des assaillants"
        : "Les défenseurs tiennent bon";
      screen.cards = [
        card(
          "La puissance engagée",
          `${s.attack} attaque\n${s.defense} défense`,
        ),
        card(
          "La mémoire des bannières",
          s.won
            ? "+30 prestige pour les assaillants."
            : "+15 prestige pour les défenseurs.",
        ),
        card(
          "Après la bataille",
          "Aucun objet ou bâtiment n’est perdu. Les dégâts d’intégrité se réparent progressivement. La cité défendue bénéficie de six heures de protection.",
        ),
      ];
      back("city", "← À notre cité");
      break;
    }
  }
  return true;
}

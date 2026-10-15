# Terre des Noobs — Les Chroniques de Brumeterre

Un RPG Discord social en français, avec des **menus en images Canvas** et **quatre commandes**. Univers original de fantasy sombre : cadres de métal ancien, dorures, forteresse dans la Brume et typographie médiévale.

> La cloche de Rosée a sonné sans sonneur. Les routes disparaissent dans la Brume. Bâtissez un refuge, rassemblez vos compagnons et retrouvez le Roi oublié.

## Quatre portes d’entrée, tout le reste dans les menus

| Commande      | Ce qu’on y trouve                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **`/profil`** | Création du héros, statistiques, aventure et combats, refuge, bâtiments, talents, contrats et provisions                              |
| **`/social`** | Amis, demandes, invitations, duels, guildes, officiers, cité, invasions, sièges, cadeaux et groupes de raid                           |
| **`/marché`** | Marché global, annonces, achat et vente, coffre, équipement, ressources, marchand de provisions, artisanat, enchantement et recyclage |
| **`/info`**   | Encyclopédie paginée : races, classes, métiers d’artisanat, objets, bâtiments, recettes, raids et règles                              |

Les boutons du bas relient toujours les quatre espaces. Les listes permettent de choisir une race, une classe, une destination, un équipement, un lot, un bâtiment ou une recette. Les formulaires ne servent qu’à saisir un nom, une quantité, un prix, un message de guilde ou un code. **Aucun identifiant d’objet à recopier, aucune sous-commande à apprendre.**

Les panneaux, résultats, confirmations et erreurs sont des PNG générés localement par Canvas. Les boutons, listes et formulaires restent les contrôles natifs de Discord. Un menu remplace son image précédente : les pièces jointes ne s’accumulent pas. Les images incluent une description alternative.

Le Profil conserve son panorama d’origine. Social utilise une salle de guilde, le Marché une rue marchande, et Info une bibliothèque. Les peuples du codex partagent cette bibliothèque avec une couleur de texte propre à chacun.

![Exemple du panneau de personnage](docs/images/profil.png)

## Ce qui est jouable

- **16 peuples et 18 classes**, soit 288 combinaisons. Chaque race a ses bonus et son bâtiment exclusif ; chaque classe a sa compétence active.
- **12 régions**, 36 ennemis ordinaires, des élites, 12 gardiens et une histoire de campagne. Combats au tour par tour avec frappe lourde annoncée, garde, mana, potions et fuite.
- **Un sac d’expédition exposé** : poursuivre l’aventure avec les PV restants ou rentrer sécuriser le butin. La défaite coûte la moitié de l’or et des matériaux du sac, ainsi que ses équipements. Le coffre et les objets portés restent protégés.
- **3 emplacements de bâtiments**, 9 constructions communes et 16 héritages raciaux. Améliorations jusqu’au niveau 5, production hors ligne, repos et bonus passifs.
- **Marché entre joueurs** : lots sous séquestre, achats atomiques, commission de 5 %, expiration après sept jours et annulation. Un marchand fournit aussi les consommables et matériaux courants.
- Artisanat, équipement de cinq raretés, enchantements garantis jusqu’à +5, recyclage et talents permanents.
- Guildes de 30 membres, trésor commun, dons, recrutement par menus, groupes de 2–4 amis et trois raids coopératifs avec récompenses individuelles.
- Demandes d’amis réciproques, réception des invitations, annuaire, profils publics sans coffre, blocage, duels acceptés et classement de la lice.
- Cité de guilde avec remparts, caserne, hospice et phare ; réserves communes, gardes, invasions quotidiennes coopératives et sièges volontaires entre guildes.
- Provisions et contrats quotidiens, séries de connexion, événements mondiaux et classement.

Les « métiers » du codex décrivent les activités accessibles à tous : alchimie, forge, enchantement et récolte/recyclage. Ils ne constituent pas une seconde classe à choisir.

## Jouer ensemble

Dans **Social → Rencontrer des joueurs**, consulte un personnage pour demander son amitié, offrir un cadeau, proposer un duel ou l’inviter dans ta guilde si tu en as le droit. Le destinataire répond dans **Réception**. Les demandes d’amis et invitations durent sept jours ; un défi dure quinze minutes. Les listes d’amis sont limitées à 100, les demandes envoyées à 10 et les défis en attente à 3. Le blocage coupe les interactions directes dans les deux sens. Aucun message privé automatique n’est envoyé.

Les **duels d’entraînement** nécessitent l’accord de l’adversaire et deux personnages au refuge. La simulation utilise vos équipements, à pleine vie et plein mana, en alternant le premier joueur. Après 40 tours sans vainqueur : égalité. Vos PV, mana, énergie, objets, or et XP réels ne changent pas ; seuls les résultats du classement sont enregistrés. Une minute de récupération sépare deux duels.

Le chef de guilde peut nommer des **officiers**, rétrograder ou exclure des membres. Les officiers peuvent inviter, publier le message de guilde, améliorer les constructions de la cité et engager des sièges. Seul le chef peut activer ou désactiver les sièges et améliorer le niveau général de la guilde.

### Défendre et développer la cité

1. Fonder ou rejoindre une guilde, puis ouvrir **Social → Notre cité**.
2. Donner de l’or au trésor et des matériaux à la réserve commune. Le chef et les officiers choisissent les constructions à améliorer, jusqu’au niveau 5.
3. Monter la garde : 10 énergie pour renforcer la défense de siège pendant 24 heures, selon les statistiques de ton héros. Tu peux continuer tes autres aventures.
4. Repousser l’invasion du jour avec au moins deux membres dans la guilde : chacun dispose de trois sorties, espacées de cinq minutes. Une sortie coûte 10 énergie et 10 % des PV maximum, et exige au moins 50 % de vie au refuge.
5. Choisir **Assaut**, **Bastion** ou **Soutien** selon ses statistiques et les constructions de la cité. Les contributions se cumulent contre la même menace. Une fois l’invasion vaincue, seuls les participants peuvent réclamer la récompense, une fois par jour toutes guildes confondues.

Les défenses réussies donnent or, expérience, matériaux et honneur aux participants, ainsi que du prestige et de l’or au trésor. Les invasions changent à minuit UTC. Un joueur quittant la guilde perd sa contribution de garde ; les dons restent au trésor.

Les **sièges entre guildes sont volontaires** : les deux chefs doivent avoir activé cette participation. L’écart de niveau général des guildes ne peut pas dépasser deux. Un chef ou officier peut engager 120 or du trésor et 15 de sa propre énergie. Une attaque toutes les six heures ; la cité défendue reçoit six heures de protection. Les coffres ne sont pas pillés, les bâtiments restent debout et l’intégrité ne descend pas sous 25 %. Elle se répare progressivement, avec l’aide de l’hospice. Les victoires donnent du prestige.

## Une campagne à préparer

Les ennemis demandent désormais plusieurs tours et frappent plus fort. Les gains d’or et d’expérience sont augmentés pour que chaque rencontre compte ; **deux victoires** font apparaître le gardien. Leurs statistiques dépendent de la région et ne s’adaptent pas au niveau du héros : revenir mieux équipé rend réellement la route plus accessible.

Avant le premier départ, fabrique la **Protection du voyageur** à l’atelier : 35 or, 4 fers, 4 cuirs et 6 bois. Construis une caserne pour la mêlée ou une tour des arcanes pour la magie ; les remparts aident à encaisser. En combat, protège-toi contre les frappes lourdes, surveille le mana et prévois des potions. Une élite ou un gardien peut nécessiter un repli et davantage d’améliorations.

## Tester dans Visual Studio Code

Node.js **22.12+**, 24 recommandé. Dans **Terminal → Nouveau terminal**, à la racine du projet :

```powershell
npm.cmd ci
```

Créer `.env` à partir de `.env.example` si nécessaire, puis remplir :

```dotenv
DISCORD_TOKEN=TON_TOKEN_DE_BOT
DISCORD_CLIENT_ID=TON_APPLICATION_ID
DISCORD_GUILD_ID=ID_DE_TON_SERVEUR_DE_TEST
REGISTER_COMMANDS=true
DEMO_MODE=true
NODE_ENV=development
PORT=3000
```

Le token se génère dans [Discord Developer Portal](https://discord.com/developers/applications) → application → **Bot**. L’Application ID est dans **General Information**. Pour copier l’ID du serveur, activer le Mode développeur dans Discord → Paramètres → Avancés, puis clic droit sur le serveur → Copier l’identifiant.

Inviter le bot avec les scopes **bot** et **applications.commands**, et les permissions **View Channels**, **Send Messages**, **Embed Links** et **Attach Files**. Aucun intent privilégié n’est nécessaire. L’URL d’interactions HTTP reste vide : le bot utilise la connexion Gateway.

```powershell
npm.cmd start
```

Attendre **« 4 commandes enregistrées »** puis **« Brumeterre est ouverte »**. Dans Discord, ouvrir **`/profil`**, cliquer sur **Créer mon aventurier**, choisir sa race et sa classe, puis saisir son nom. Tout le parcours suivant passe par les boutons et les menus.

**Le mode démo est en mémoire : les personnages disparaissent à l’arrêt du bot.** Il est interdit en production. Pour conserver les parties en local, démarrer PostgreSQL avec Docker :

```powershell
docker compose up -d
```

Puis mettre `DEMO_MODE=false` et `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/terre_des_noobs` dans `.env`.

## Déployer sur Railway avec GitHub

Dépôt : [WindowsVistaLiam/Terre-des-Noobs](https://github.com/WindowsVistaLiam/Terre-des-Noobs).

1. Créer un projet Railway et ajouter un service **PostgreSQL**.
2. Ajouter un service depuis ce dépôt GitHub, branche `main`.
3. Configurer les variables du service bot :

| Variable            | Valeur                                                                         |
| ------------------- | ------------------------------------------------------------------------------ |
| `DISCORD_TOKEN`     | Token secret du bot                                                            |
| `DISCORD_CLIENT_ID` | Application ID numérique                                                       |
| `DATABASE_URL`      | Référence Railway au service de base, par exemple `${{Postgres.DATABASE_URL}}` |
| `REGISTER_COMMANDS` | `true`                                                                         |
| `NODE_ENV`          | `production`                                                                   |
| `DEMO_MODE`         | `false`                                                                        |
| `DISCORD_GUILD_ID`  | Facultatif : ID du serveur si les commandes restent limitées à celui-ci        |

Le nom `Postgres` de la référence doit correspondre au service PostgreSQL réel. Railway fournit `PORT`. Le fichier `railway.json` impose une réplique, désactive la mise en veille, configure le redémarrage et utilise `/health` pour le contrôle de disponibilité. Un domaine public n’est pas nécessaire au bot.

Le Dockerfile embarque Canvas, les polices et les quatre décors. Aucun téléchargement d’images, d’avatars ou de polices n’est nécessaire au rendu en production. Aucune clé d’API d’IA n’est requise.

Les sauvegardes restent dans PostgreSQL lors des redéploiements. Activer les sauvegardes de la base dans Railway selon son offre. Les pushes sur `main` déclenchent les mises à jour lorsque le dépôt est lié ; activer **Wait for CI** pour attendre les vérifications GitHub Actions.

Références : [déploiements GitHub Railway](https://docs.railway.com/deployments/github-autodeploys), [PostgreSQL Railway](https://docs.railway.com/databases/postgresql), [healthchecks](https://docs.railway.com/deployments/healthchecks).

## Mettre à jour les menus

1. Mettre le code à jour et lancer `npm ci`.
2. Vérifier la permission **Attach Files** du bot dans le salon de jeu.
3. Redémarrer le bot. L’enregistrement remplace automatiquement les anciennes commandes par les quatre nouvelles dans le même périmètre.
4. Rouvrir `/profil`, `/social`, `/marché` ou `/info`. Les nouveaux champs sociaux et la cité sont initialisés automatiquement sur les sauvegardes existantes ; aucun personnage n’est recréé.

Si `REGISTER_COMMANDS=false`, exécuter `npm run register` pour forcer la mise à jour. Avec `DISCORD_GUILD_ID`, les commandes sont propres à ce serveur ; sans cette variable, elles sont globales. Un changement de périmètre ne supprime pas les commandes laissées dans l’autre périmètre.

## Développement et vérification

```powershell
npm run dev       # Recharge le bot après changement de code
npm run check     # Vérifie la syntaxe JavaScript
npm test          # Jeu, menus, formulaires, images Canvas et disponibilité HTTP
npm run preview   # Génère 17 vrais panneaux dans .local/previews, sans token
npm run register  # Réenregistre les quatre commandes Discord
```

Le test d’intégration PostgreSQL s’active avec `TEST_DATABASE_URL`. Il crée un schéma temporaire isolé, utilise deux pools pour les achats concurrents, vérifie le rollback et la persistance après reconnexion, puis supprime uniquement son schéma. Les tests Canvas génèrent et décodent les PNG, contrôlent leurs dimensions et poids et vérifient que les cartes restent à l’intérieur de l’image. Les parcours simulent boutons, listes, formulaires et commandes sans envoyer de messages dans un salon réel.

GitHub Actions exécute les tests sur Linux contre PostgreSQL 17, construit le Dockerfile et vérifie le rendu Canvas dans l’image de production.

## Organisation du code

- `src/content.js` : univers, bonus, bâtiments, recettes et marchand.
- `src/game.js` : règles, progression et transactions.
- `src/commands.js` : quatre commandes, identifiants de navigation et formulaires.
- `src/social-game.js` : amitiés, invitations, duels, cité, invasions et sièges atomiques.
- `src/social-content.js` et `src/social-views.js` : couleurs des races, règles de cité et menus sociaux.
- `src/controller.js` : interactions Discord, validation et parcours des menus.
- `src/views.js` : contenu des écrans et contrôles natifs.
- `src/canvas.js` : rendu graphique et mise en page mesurée.
- `src/assets/` : décor original et polices embarquées avec leurs licences.
- `src/store.js` : sauvegarde PostgreSQL et mode mémoire réservé aux essais.

Voir [l’architecture](docs/ARCHITECTURE.md) et [les ressources graphiques](docs/ART.md). Cette version cible une communauté d’amis ; l’équilibrage avancé reste à affiner avec les retours de vraies parties.

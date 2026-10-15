# 🌫️ Terre des Noobs

**Les Chroniques de Brumeterre** — un RPG Discord social, en français, pour partir à l’aventure entre amis. Univers original de fantasy sombre, inspiré des grandes campagnes de jeu de rôle.

> La cloche de Rosée a sonné sans sonneur. Les routes disparaissent dans la Brume. Bâtissez un refuge, rassemblez vos compagnons et retrouvez le Roi oublié.

## Ce qui est jouable

- **16 races** : humain, hauts-elfes, elfes sylvains et sombres, nains et nains des cendres, demi-dragons, orcs, demi-orcs, halfelins, gnomes, sang-infernaux, sang-célestes, hommes-bêtes, revenants et sauriens.
- **18 classes** : guerrier, archer, assassin, mage, paladin, nécromancien, druide, barde, berserker, moine, rôdeur, sorcier, prêtre, chaman, ingénieur, chevalier noir, duelliste et alchimiste. Chacune possède sa compétence ; toutes les combinaisons race/classe sont possibles.
- **12 régions**, 36 ennemis ordinaires, des élites et 12 gardiens. Exploration, caches, combats au tour par tour, compétences, potions, fuite, niveaux, talents et équipement.
- **Un vrai choix d’expédition** : poursuivre avec les PV et le mana restants, ou rentrer mettre le butin à l’abri. Une défaite fait perdre la moitié de l’or et des matériaux du sac, et ses équipements. Le coffre et l’équipement porté restent protégés.
- **Un refuge à 3 emplacements** : 9 bâtiments communs et 16 bâtiments raciaux exclusifs, améliorables jusqu’au niveau 5. Production hors ligne, repos et bonus permanents.
- **Économie entre joueurs** : marché global, lots sous séquestre, achats atomiques, commission de 5 %, expiration après 7 jours, annulation et dons directs.
- **Artisanat** : consommables, armes, armures, talismans, reliques, enchantements garantis jusqu’à +5 et recyclage. Cinq raretés de butin.
- **Social** : guildes de 30 membres avec trésor et bonus communs, groupes de 2–4 amis, trois raids coopératifs simulés avec soins de groupe et récompenses individuelles.
- Provisions quotidiennes, séries de connexion, trois contrats quotidiens, quatre événements mondiaux tournants et classement global.
- **25 commandes slash**, panneaux Discord, boutons persistants et menus de destination. Pas de service d’IA ni d’abonnement supplémentaire pour faire fonctionner le jeu.

## Déployer sur Railway depuis GitHub

Le dépôt cible est [WindowsVistaLiam/Terre-des-Noobs](https://github.com/WindowsVistaLiam/Terre-des-Noobs).

### 1. Créer le bot Discord

1. Ouvrir le [Discord Developer Portal](https://discord.com/developers/applications), créer une application puis ouvrir **Bot**.
2. Générer le token du bot et le conserver comme secret. Ne jamais le committer, le copier dans un salon ou le partager.
3. Dans **General Information**, copier l’**Application ID**.
4. Dans l’installation OAuth2 pour un serveur, sélectionner les scopes **bot** et **applications.commands**. Donner les permissions **View Channels**, **Send Messages** et **Embed Links**. Aucun intent privilégié n’est nécessaire.
5. Inviter le bot sur son serveur. Laisser l’URL d’interactions HTTP vide : le bot utilise la connexion Gateway de Discord.

Exemple de lien d’invitation, en remplaçant `APPLICATION_ID` :

```text
https://discord.com/oauth2/authorize?client_id=APPLICATION_ID&permissions=19456&scope=bot%20applications.commands
```

### 2. Créer les services Railway

1. Créer un projet Railway et ajouter un service **PostgreSQL**.
2. Ajouter un service depuis **GitHub Repo**, sélectionner ce dépôt et la branche `main`.
3. Dans les variables du service **bot**, renseigner :

| Variable            | Valeur                                                               |
| ------------------- | -------------------------------------------------------------------- |
| `DISCORD_TOKEN`     | Le token secret du bot                                               |
| `DISCORD_CLIENT_ID` | L’Application ID numérique                                           |
| `DATABASE_URL`      | `${{Postgres.DATABASE_URL}}` via une référence au service PostgreSQL |
| `REGISTER_COMMANDS` | `true`                                                               |
| `NODE_ENV`          | `production`                                                         |
| `DISCORD_GUILD_ID`  | Facultatif : ID de ton serveur de test                               |

Le nom `Postgres` de la référence doit correspondre au nom du service de base de données dans ton projet. Utiliser le réseau privé Railway. Railway fournit `PORT` automatiquement.

4. Conserver **une seule réplique** et désactiver la mise en veille / Serverless du service bot : sa connexion Discord doit rester ouverte.
5. Déployer. Le Dockerfile installe les dépendances verrouillées ; le bot initialise sa table sans effacer les sauvegardes et enregistre ses commandes automatiquement si leur définition a changé.
6. Vérifier le message **« Brumeterre est ouverte »** dans les logs, puis lancer `/aide` dans Discord.

`railway.json` configure Docker, le redémarrage sur échec et le contrôle `/health`. Un domaine public n’est pas nécessaire au fonctionnement Discord. Si tu en génères un, `/health` renvoie 200 uniquement lorsque Discord et PostgreSQL sont disponibles, sans exposer de données de jeu.

Avec `DISCORD_GUILD_ID`, les commandes sont enregistrées sur ce serveur uniquement. Sans cette variable, elles sont globales et leur propagation dépend de Discord. Lors d’un passage du mode test au mode global, les anciennes commandes du serveur test peuvent encore apparaître : les supprimer depuis l’API Discord ou conserver le même périmètre. Le bot ne supprime volontairement pas les commandes d’autres périmètres.

### 3. Mises à jour

Une fois le dépôt connecté, les pushes sur la branche liée déclenchent les redéploiements Railway. La base PostgreSQL reste dans son service séparé : personnages, combats, annonces, guildes et groupes survivent au redémarrage.

```powershell
git add .
git commit -m "Ameliore Brumeterre"
git push origin main
```

Le workflow GitHub Actions vérifie le code, les scénarios du jeu et les transactions contre PostgreSQL. Activer l’option Railway **Wait for CI** pour attendre ces vérifications avant le déploiement.

Références : [déploiements GitHub Railway](https://docs.railway.com/deployments/github-autodeploys), [PostgreSQL Railway](https://docs.railway.com/databases/postgresql), [healthchecks Railway](https://docs.railway.com/deployments/healthchecks), [discord.js](https://discord.js.org/docs/packages/discord.js/14.27.0).

## Lancer en local

Node.js **22.12+** (24 recommandé), npm et une base PostgreSQL sont nécessaires.

```powershell
npm ci
Copy-Item .env.example .env
# Compléter .env avec les identifiants Discord et la connexion PostgreSQL
# Si Docker est installé :
docker compose up -d
npm start
```

Pour un essai avec Discord sans installer PostgreSQL, mettre `DEMO_MODE=true` dans `.env`. **Ce mode est en mémoire : toutes les données sont perdues au redémarrage.** Il est interdit lorsque `NODE_ENV=production`.

```powershell
npm run dev       # Redémarrage automatique après modification du code
npm run register  # Force le réenregistrement des commandes dans le périmètre configuré
npm run check     # Vérifie la syntaxe de tous les modules
npm test          # Tests de jeu, commandes, panneaux, contrôleur et disponibilité HTTP
```

Le test PostgreSQL s’active avec une variable `TEST_DATABASE_URL`. Il crée un schéma temporaire isolé et le supprime ensuite, sans vider les tables existantes. Utiliser de préférence une base réservée aux tests.

```powershell
$env:TEST_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/terre_des_noobs'
npm test
```

## Les cinq premières minutes

```text
/codex categorie:races
/codex categorie:classes
/creer nom:Aelys race:elfe_sylvain classe:archer
/quotidien
/base construire batiment:scierie emplacement:1
/base construire batiment:carriere emplacement:2
/carte
```

Choisir les Marches de Rosée, puis ouvrir `/campagne`. Les boutons permettent d’explorer et de jouer les tours. Après trois victoires dans la région, le gardien apparaît à la prochaine exploration. Le vaincre ouvre la route suivante ; le niveau requis reste à atteindre en rejouant les régions accessibles.

Rentrer régulièrement, équiper le butin avec `/equiper`, dépenser les talents avec `/talent` et préparer des potions à l’atelier. À la base, PV et mana remontent naturellement ; le repos payant est instantané. L’énergie se recharge de 1 toutes les cinq minutes, partout et même hors ligne.

## Commandes

| Commande                                                                                 | Fonction                                     |
| ---------------------------------------------------------------------------------------- | -------------------------------------------- |
| `/jouer`, `/aide`, `/codex`                                                              | Carnet, premiers pas et encyclopédie paginée |
| `/creer`, `/profil`, `/talent`                                                           | Identité, statistiques et progression        |
| `/carte`, `/voyager`, `/campagne`, `/combat`, `/rentrer`                                 | Voyage, exploration, combat, retour          |
| `/base voir`, `construire`, `ameliorer`, `demolir`, `recolter`, `repos`                  | Refuge et ses trois emplacements             |
| `/inventaire`, `/equiper`, `/retirer`, `/utiliser`                                       | Équipement et consommables                   |
| `/atelier recettes`, `fabriquer`, `enchanter`, `recycler`                                | Artisanat et améliorations                   |
| `/marche voir`, `mes-annonces`, `vendre-ressource`, `vendre-objet`, `acheter`, `annuler` | Commerce global                              |
| `/donner joueur:… or:…`                                                                  | Don d’or à un ami                            |
| `/donner joueur:… ressource:… quantite:…`                                                | Don de matériaux ou consommables             |
| `/quotidien`, `/quetes`                                                                  | Provisions et contrats du jour               |
| `/guilde voir`, `creer`, `rejoindre`, `donner`, `ameliorer`, `quitter`                   | Guilde et trésor partagé                     |
| `/groupe voir`, `creer`, `rejoindre`, `quitter`, puis `/raid`                            | Raids à plusieurs                            |
| `/classement`                                                                            | Les dix héros les plus avancés               |

Les panneaux personnels sont privés. Les affichages de guildes, le recrutement de groupe, les résultats de raids et le classement sont publics dans le salon. Les dons ne déclenchent aucun message privé automatique. Le destinataire verra ses ressources mises à jour dans son coffre.

Le chef lance le raid au nom du groupe. Rejoindre signifie accepter l’engagement de **20 énergie**. Il faut être à la base, avoir au moins 50 % de sa vie et attendre 24 heures entre deux tentatives, victoire ou défaite. Les raids sont résolus collectivement en une simulation, tandis que la campagne solo se joue au tour par tour.

## Personnaliser et administrer

- Le contenu, les bonus, coûts et recettes se trouvent dans `src/content.js`.
- Les règles et transactions se trouvent dans `src/game.js`.
- Les commandes et panneaux se trouvent dans `src/commands.js` et `src/views.js`.
- Les sauvegardes utilisent la table PostgreSQL `rpg_documents` : un document versionné par personnage, annonce, guilde ou groupe. Voir [l’architecture](docs/ARCHITECTURE.md).
- Il n’y a pas de commande permettant aux joueurs de s’attribuer de l’or ou des niveaux, ni de suppression de personnage exposée.
- Activer les sauvegardes de la base PostgreSQL dans Railway selon les options disponibles sur ton offre. Un déploiement n’est pas une sauvegarde de la base.

Cette version cible une communauté d’amis. L’équilibrage est initial et mérite des retours de vraies parties, particulièrement pour les raids et les niveaux avancés. Le code est testé sans token Discord réel ; l’invitation du bot et un premier parcours sur ton serveur restent à effectuer après configuration.

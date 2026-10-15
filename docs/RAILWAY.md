# Déployer Terre des Noobs sur Railway

Le dépôt est [WindowsVistaLiam/Terre-des-Noobs](https://github.com/WindowsVistaLiam/Terre-des-Noobs), branche `main`.
Il faut deux services dans le même projet Railway : le bot et sa base PostgreSQL.

## 1. Créer le projet et la base

Sur [Railway](https://railway.com/dashboard), connecte ton compte GitHub et crée un nouveau projet vide (**New Project → Empty Project**).
Dans ce projet, clique **+ New → Database → Add PostgreSQL**. Attends que la base soit démarrée et vérifie le nom du service : ce guide utilise **Postgres**.

## 2. Relier le dépôt

Dans le même projet, clique **+ New → GitHub Repo**, puis sélectionne **WindowsVistaLiam/Terre-des-Noobs**.
Autorise l’application Railway à accéder au dépôt si celui-ci n’apparaît pas.

Dans le service du bot, vérifie dans **Settings** que la source est ce dépôt, branche **main**, avec le répertoire racine du dépôt. Le `Dockerfile` et `railway.json` sont à la racine ; laisse les commandes Build et Start personnalisées vides. L’image démarre avec `node src/index.js`.

Un premier essai peut échouer tant que les variables ne sont pas remplies : termine l’étape suivante et redéploie.

## 3. Remplir les variables du bot

Ouvre le service **du bot**, onglet **Variables**, puis **Raw Editor**.
Copie le contenu de [railway.variables.example](../railway.variables.example), puis remplace les trois valeurs Discord :

```dotenv
DISCORD_TOKEN=TON_TOKEN_DE_BOT
DISCORD_CLIENT_ID=TON_APPLICATION_ID
DISCORD_GUILD_ID=ID_DE_TON_SERVEUR
DATABASE_URL=${{Postgres.DATABASE_URL}}
NODE_ENV=production
DEMO_MODE=false
REGISTER_COMMANDS=true
```

Les valeurs Discord sont celles de ton `.env` local. Le token est celui de l’application Discord, pas un code Google Authenticator. Saisis-le uniquement dans Railway, jamais dans GitHub.

Pour `DATABASE_URL`, conserve la référence `${{Postgres.DATABASE_URL}}` : Railway la résout vers la base du projet. Si le service porte un autre nom, sélectionne sa variable `DATABASE_URL` avec **Add Reference** ou adapte le nom dans la référence. N’utilise pas l’adresse `localhost` de ton essai local.

Garde le même `DISCORD_GUILD_ID` qu’en local pour continuer sur ton serveur avec les mêmes commandes. Pour diffuser le bot à tous les serveurs où il est invité, cette variable est facultative ; changer de périmètre ne supprime pas les commandes déjà enregistrées dans l’ancien.

Ne fixe pas `PORT` : Railway le fournit. Aucune clé d’IA n’est nécessaire.

## 4. Passer du local à Railway

Avant d’activer la version Railway, arrête ton bot local avec **Ctrl+C** dans le terminal où tourne `npm.cmd start`.
Cela évite de laisser les deux versions répondre aux mêmes interactions avec des sauvegardes différentes.

Si tes essais utilisaient `DEMO_MODE=true`, les personnages étaient conservés en mémoire uniquement : ils ne sont pas transférés vers Railway. La nouvelle partie Railway sera sauvegardée dans PostgreSQL et conservée lors des prochains redéploiements. Une base PostgreSQL locale existante nécessite un transfert séparé pour récupérer ses personnages.

Enregistre les variables, applique les changements en attente avec **Deploy**, puis consulte les logs du bot. Le message attendu est :

```text
Brumeterre est ouverte : ... · ... serveur(s).
```

Au premier démarrage ou quand la définition des commandes change, tu verras aussi `4 commandes enregistrées`. La table des sauvegardes est créée automatiquement : aucune commande de migration manuelle n’est nécessaire.

Le contrôle `/health` devient disponible lorsque Discord est connecté et PostgreSQL joignable. Le bot n’a pas besoin de domaine public ; il se connecte à Discord par Gateway. Le fichier `railway.json` définit une réplique, désactive la mise en veille et configure le contrôle de démarrage et les redémarrages sur erreur.

## 5. Tester et mettre à jour

Sur ton serveur Discord, ouvre `/profil`, crée ton personnage puis vérifie `/social`, `/marché` et `/info`. Le bot doit pouvoir voir le salon, envoyer des messages, intégrer des liens et joindre des fichiers. Les images nécessitent **Attach Files**.

Dans **Settings** du service bot, conserve les déploiements automatiques sur **main** et active **Wait for CI** pour attendre la réussite de GitHub Actions. Ensuite, un push sur `main` suffit pour mettre à jour le bot. Railway construit l’image Docker puis lance la nouvelle version.

Les données vivent dans le service PostgreSQL : conserve cette base lors des mises à jour du bot. Configure ses sauvegardes selon les options de ton offre Railway.

## Si le déploiement échoue

| Message ou symptôme                    | À vérifier                                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `Variables manquantes`                 | Variables renseignées dans le service **bot**, sans valeurs vides.                                                         |
| `DEMO_MODE est interdit en production` | `DEMO_MODE=false`, avec une référence `DATABASE_URL` valide.                                                               |
| Connexion PostgreSQL impossible        | Base démarrée, même projet et environnement, référence au bon service, absence de `localhost`.                             |
| Token Discord invalide                 | Token de bot actuel, copié sans guillemets ni espaces.                                                                     |
| Contrôle de disponibilité en échec     | Les logs de démarrage indiquent si Discord ou la base empêche `/health` de répondre.                                       |
| Images absentes ou refusées            | Permission **Attach Files** dans le salon utilisé.                                                                         |
| Commandes absentes                     | Application ID et serveur corrects, `REGISTER_COMMANDS=true`, bot invité avec les scopes `bot` et `applications.commands`. |

## Documentation Railway

- [Ajouter et connecter PostgreSQL](https://docs.railway.com/databases/postgresql)
- [Variables et références](https://docs.railway.com/variables)
- [Déploiements automatiques depuis GitHub et Wait for CI](https://docs.railway.com/deployments/github-autodeploys)
- [Contrôles de disponibilité et PORT](https://docs.railway.com/deployments/healthchecks)

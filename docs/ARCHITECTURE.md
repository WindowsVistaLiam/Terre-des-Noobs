# Architecture et garanties

## Composants

Node.js ESM, discord.js 14, node-postgres et `@napi-rs/canvas`. Le bot maintient une connexion Gateway avec l’intent `Guilds` uniquement. Aucun accès au contenu des messages, liste complète des membres, dashboard public ou webhook d’interactions n’est nécessaire.

`content.js` décrit l’univers. `game.js` applique les règles sans dépendance à Discord ; les méthodes de `social-game.js` partagent son contexte transactionnel. `commands.js` définit les quatre commandes et traduit boutons, listes et formulaires. `controller.js` accuse réception avant les opérations de base et le rendu ; un formulaire est ouvert avant tout accusé de réception. `views.js` et `social-views.js` construisent le contenu sémantique des écrans et les contrôles ; `canvas.js` les rend en PNG. `store.js` assure les transactions.

Les champs `player.social`, `guild.city`, `guild.officers`, `guild.bulletin` et `guild.log` sont initialisés de façon additive et idempotente sur les anciens documents. Le schéma reste en version 1 car aucune donnée existante n’est supprimée ou réinterprétée. Les demandes d’amis, invitations, duels et comptes rendus de siège ont chacun leur type de document. Leur propriété, leur statut et leur expiration sont revérifiés à chaque réponse.

Les amitiés sont enregistrées dans les deux personnages dans la même transaction. Les invitations exigent un accord et les duels travaillent sur des copies des jauges. Les blocages annulent les demandes directes en attente. Un profil social public expose des statistiques sélectionnées, sans inventaire ni fortune. L’activité affichée concerne le jeu et ne prétend pas refléter la présence Discord.

Les cités sont attachées à leur guilde. Les dons débitent le coffre personnel et créditent la réserve dans la même transaction. Les constructions débitent le trésor et les matériaux ensemble. Les sièges vérifient rôles, volontariat, niveaux, énergie, délais et protection avant toute dépense. L’invasion quotidienne conserve un compteur par joueur et une liste de récompenses réclamées ; un marqueur global quotidien sur le personnage empêche le cumul par changement de guilde. Les gardes sont retirés au départ d’un membre.

Les parcours ne reposent sur aucun collecteur temporaire ou session en mémoire. Les identifiants des composants contiennent leur propriétaire, leur action et leur contexte minimal. Les menus restent donc utilisables après redémarrage, à données persistantes identiques. Le parcours de création porte ses choix de race et classe jusqu’au formulaire du nom. Les boutons de confirmation précèdent la démolition, le recyclage, le départ d’une guilde ou d’un groupe et le lancement d’un raid.

Les panneaux sont privés. Une erreur dans un bouton répond par une image privée sans remplacer le panneau initial. Un formulaire issu d’un message met à jour ce même message. Chaque remplacement efface les anciennes pièces jointes et charge un seul PNG. Les images restent sous la limite des pièces jointes et incluent une description alternative. Le marchand est un puits d’or à prix fixes ; seuls les joueurs vendent des équipements.

## Persistance

La table `rpg_documents` possède une clé primaire `(kind, id)`, un document JSONB et un horodatage. Les personnages ont `schemaVersion: 1`. L’initialisation crée la table et l’index nécessaires avec `IF NOT EXISTS`, sans suppression ou réécriture des sauvegardes. Une évolution incompatible devra ajouter une migration explicite ; ne pas simplement changer la version.

Un compte Discord possède un personnage partagé sur tous les serveurs où cette instance du bot est présente. Le marché, les guildes et les groupes sont également globaux à cette base. Deux installations utilisant des bases différentes forment deux mondes distincts.

Chaque opération de jeu s’exécute dans une transaction PostgreSQL avec un verrou consultatif transactionnel commun. Le verrou sérialise les modifications entre les connexions et les processus, y compris un éventuel chevauchement de déploiement. Cela simplifie les garanties pour une petite communauté :

- L’annonce et le lot sortent ensemble du coffre, ou aucune modification n’est enregistrée.
- L’achat déplace lot et or, crédite le vendeur et supprime l’annonce dans la même transaction.
- Deux acheteurs ne peuvent pas emporter le même lot.
- Un don ou un raid est enregistré entièrement, ou annulé pour tous ses participants.
- Une erreur métier annule aussi les modifications intermédiaires.

Les identifiants des interactions Discord sont enregistrés dans cette transaction. Une livraison répétée de la même interaction est ignorée. Ces marqueurs sont purgés après sept jours. Les boutons de combat portent aussi l’identifiant du combat et le numéro de tour : un ancien bouton ne peut pas jouer un nouveau tour. Les boutons appartiennent à l’utilisateur qui a ouvert le panneau.

**Dimensionnement :** ce verrou est volontairement global. Les transactions sont courtes et sans appels réseau Discord, mais tous les joueurs passent par cette file d’attente. Les classements et listes chargent actuellement les documents de leur type. Pour un grand bot public, remplacer les listes par des requêtes indexées et paginées, puis le verrou global par des verrous ordonnés sur les joueurs et annonces concernés. Les transactions et leurs tests fournissent la base pour cette évolution.

Utiliser une seule réplique Gateway. La déduplication protège les mutations pendant les redémarrages ; elle n’est pas un système de sharding ou de coordination de plusieurs clients Discord.

## Temps et absence de tâches obligatoires

Énergie, PV et mana sont recalculés lors de la prochaine interaction à partir d’horodatages persistés. Les fractions de temps ne sont pas perdues lorsque l’utilisateur consulte souvent son profil. La récupération passive des PV et du mana ne fonctionne qu’à la base.

La production se calcule à la récolte et avant une amélioration/démolition, avec conservation des fractions de ressource. L’absence est plafonnée à 12 heures pour chaque calcul. Les annonces expirées sont restituées lors du prochain accès au marché ; une restitution de matériel peut dépasser ponctuellement les 100 équipements du coffre, pour ne jamais détruire un objet sous séquestre. Les achats et nouvelles fabrications respectent normalement la limite.

Provisions, contrats et événement mondial utilisent les jours UTC. Les raids utilisent un délai glissant de 24 heures. Aucune récompense n’exige un timer en mémoire : un redémarrage ne les remet pas à zéro.

## Santé et arrêt

Le serveur HTTP écoute `0.0.0.0:PORT`. `/health` renvoie 200 si le client Discord est prêt et `SELECT 1` réussit, 503 sinon. Il sert au contrôle Railway lors du déploiement ; configurer un moniteur externe séparé si une surveillance continue est souhaitée.

SIGINT et SIGTERM ferment le client Discord, le serveur et le pool PostgreSQL. Le mode mémoire n’est permis qu’en essai explicite et est refusé lorsque `NODE_ENV=production`.

## Vérification

Les tests couvrent les 288 combinaisons d’identité et de menus de création, les invariants d’économie, annulations de transactions, progression et combats, récupération hors ligne, guildes, raids, déduplication, schémas Discord, propriétaire des composants, formulaires et parcours complets sans commande supplémentaire. Les rendus Canvas sont produits et décodés, avec vérification des dimensions, de la taille des fichiers, des textes longs et de l’absence de débordement des cartes. Le test PostgreSQL utilise deux pools concurrents, vérifie le rollback et recrée une connexion pour vérifier la persistance. GitHub Actions l’exécute contre PostgreSQL 17 puis construit et teste le rendu dans le conteneur de production.

Le flux Discord est testé par des interactions simulées ; ces tests ne remplacent pas un essai sur serveur réel avec le token et les permissions effectives. Aucun secret n’est requis pour les tests de logique.

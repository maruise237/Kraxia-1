## 1. postgres

Rôle :
- base de données de la plateforme
- stocke utilisateurs, informations des conteneurs, quotas, journal d'audit, liaisons aux agents partagés, etc.

Port :
- 15432 → 5432

## 2. gateway

Rôle :
- backend central de tout le système
- authentification, gestion des utilisateurs, proxy LLM, statistiques de quotas
- démarre « un conteneur openclaw par utilisateur » pour les utilisateurs dedicated
- route les utilisateurs shared vers l'openclaw partagé
- quasi toutes les requêtes du front-end passent par lui

Port :
- 8080

## 3. frontend

Rôle :
- interface complète
- orientée scénario d'usage OpenClaw historique complet
- plus adaptée au mode dedicated

Port :
- 3080

## 4. shared-openclaw

Rôle :
- « runtime OpenClaw partagé » ajouté récemment
- tous les utilisateurs shared partagent cette instance openclaw unique
- mais platform mappe chaque utilisateur vers un agent + un workspace indépendants
- sert principalement share-openclaw-front et l'API partagée

Aucun port exposé directement :
- appelable uniquement par le gateway sur le réseau interne

## 5. manage-front

Rôle :
- console d'administration
- l'administrateur consulte les utilisateurs, modifie quotas et statuts
- permet aussi de basculer un utilisateur en mode :
  - dedicated
  - shared

Port :
- 3081

## 6. simple-front

Rôle :
- front-end de messagerie léger
- interface de chat simplifiée
- proche de l'entrée légère existante

Port :
- 3082

## 7. share-openclaw-front

Rôle :
- front-end du mode partagé (ajout récent)
- dédié aux utilisateurs shared
- l'utilisateur ne voit que « son agent partagé, ses sessions, son workspace »
- ne voit pas les agents des autres

Port :
- 3083

## Relations globales

- Utilisateurs dedicated :
  `frontend/simple-front -> gateway -> conteneur openclaw personnel`

- Utilisateurs shared :
  `share-openclaw-front -> gateway -> shared-openclaw`

**Remarque** : un utilisateur déjà en mode shared qui utilise le front-end par défaut ne peut pas se connecter ni afficher son conteneur, car le mode shared communique avec le conteneur openclaw_shared.

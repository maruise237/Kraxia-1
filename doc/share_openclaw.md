# Mode partagé OpenClaw (share_openclaw_front) — conception et mise en œuvre

## Contexte existant

- La plateforme proxifie actuellement `/api/openclaw/*` vers le conteneur utilisateur via `platform/app/routes/proxy.py`
- Chaque conteneur utilisateur monte `/root/.openclaw` en volume dédié — voir `platform/app/container/manager.py`
- OpenClaw supporte nativement le multi-agents
- Les clés de session OpenClaw portent naturellement un préfixe agent :
  `agent:<agentId>:...`
  (clair dans `openclaw/src/routing/session-key.ts`)
- simple_front gère déjà les répertoires d'upload par agent :
  - main → workspace/uploads
  - autres agents → workspace-<agentId>/uploads
  (voir `simple_front/src/pages/Chat.tsx`)
- le bridge expose déjà des API agents/sessions/files : l'instance partagée ne part pas de zéro

## 1. Isolation logique

- l'utilisateur A ne voit pas les agents de B
- l'utilisateur A ne voit pas les sessions de B
- les fichiers téléversés par A n'entrent pas dans le workspace de B
- bases de connaissances / compétences / fichiers de travail de A lui appartiennent

---

## 2. Architecture globale recommandée : double runtime

Faire coexister deux lignes produit :

### A. Mode dedicated
- solution actuelle inchangée
- un conteneur par utilisateur
- adapté à :
  - usage intensif d'outils
  - terminal/code/tâches longues
  - clients exigeant une forte isolation
  - utilisateurs ToB à forte valeur

### B. Mode shared
- tous les utilisateurs partagent un conteneur openclaw partagé
- chaque utilisateur correspond à un seul agent du runtime partagé
- chaque agent a son propre workspace
- front-end ultra-simple, uniquement conversation/API
- adapté à :
  - appels API
  - messagerie légère
  - expérience type simple_front
  - grands volumes d'utilisateurs à faible coût

Ajouter en base un champ `runtime_mode` ou `agent_backend_mode` :

- `user.runtime_mode = dedicated | shared`
ou
- `agent.runtime_mode = dedicated | shared`

---

## 3. Règle la plus critique : ne jamais exposer l'API multi-agents native aux utilisateurs

Point essentiel.

Si vous exposez directement `/api/agents` et `/api/sessions` de l'instance partagée au front-end, cela échouera forcément : l'instance contient les agents et sessions de TOUS les utilisateurs.

Approche correcte :

- le front-end n'appelle que les « API à vue isolée utilisateur » de platform
- platform appelle ensuite les API natives du shared openclaw
- puis filtre, mappe et réécrit les réponses

Autrement dit : une nouvelle famille d'API platform, par exemple :

```
/api/shared-agent/me
/api/shared-agent/sessions
/api/shared-agent/sessions/{key}
/api/shared-agent/chat
/api/shared-agent/files/upload
```

Le front-end share_openclaw_front n'appelle que celle-ci — jamais le proxy brut `/api/openclaw/*`.

---

## 4. Modèle de données recommandé pour le mode partagé

Quelques tables à ajouter côté platform ; au minimum une table de liaison :

### 1. shared_runtime
Enregistre l'instance OpenClaw partagée. Champs possibles :
- id
- name
- docker_id / internal_host / internal_port
- status
- config_version

Avec une seule instance au départ, cette table est optionnelle (config figée possible) ; recommandée à terme.

### 2. shared_agent_binding
Liaison entre utilisateur et agent partagé. Champs possibles :
- id
- user_id
- runtime_id
- openclaw_agent_id
- workspace_dir
- mode
- created_at
- updated_at
- status

Contraintes conseillées :
- `user_id` unique (un seul agent partagé par utilisateur)
ou
- `(user_id, logical_agent_name)` unique (si plusieurs agents partagés autorisés plus tard)

### 3. Optionnel : shared_session_index
Table d'index pour lister/auditer/archiver plus vite.
Pas indispensable en v1 : interroger directement les sessions OpenClaw puis filtrer par préfixe suffit.

---

## 5. Conventions de nommage : clé de voûte de l'isolation

À contraindre uniformément.

### 1. Identifiant d'agent partagé
Ne pas utiliser le nom d'utilisateur (collisions + fuite d'information). Suggestions :
- `u_<shortuuid>`
ou
- `usr_<user_id_hash>`

Exemple : `usr_a1b2c3d4`

### 2. Workspace
Doit être un répertoire dédié à l'agent :
- `~/.openclaw/workspace-usr_a1b2c3d4`

simple_front utilise déjà la convention `workspace-<agentId>` — à conserver telle quelle.

### 3. Clé de session
Toutes les sessions doivent relever de cet agent :
- `agent:usr_a1b2c3d4:main`
- `agent:usr_a1b2c3d4:session-177xxxx`
- `agent:usr_a1b2c3d4:web:default`

Le mécanisme natif OpenClaw (`agent:<agentId>:...`) est ici un atout.

---

## 6. Rôle de platform en mode partagé

platform n'est plus un simple « reverse proxy » mais un « contrôleur d'isolation ».

Six responsabilités principales :

1. **ensure shared agent exists** — à la première entrée sur share_openclaw_front ou premier appel API :
   - consulter shared_agent_binding
   - si absent, créer l'agent dans le shared openclaw
   - workspace fixé à `~/.openclaw/workspace-<agentId>`
   - créer l'enregistrement de liaison

2. **Injection automatique de l'identité d'agent** :
   - lister sessions : ne retourner que celles préfixées par l'agent de l'utilisateur courant
   - envoyer un message : sessionKey doit appartenir à l'agent de l'utilisateur
   - nouvelle session : key générée par la plateforme pour cet agent
   - upload : upload_dir fixé au workspace de l'agent courant

3. **Filtrage / réécriture des réponses**
   ex. sessions.list du runtime partagé renvoie tout :
   - platform ne garde que l'agent courant
   - les détails d'implémentation ne remontent pas au front-end

4. **Blocage des accès hors périmètre**
   Tout agentId/sessionKey/path entrant doit être validé :
   - agentId == agent lié à l'utilisateur courant
   - sessionKey préfixé par `agent:<bound_agent_id>:`
   - upload_dir sous `workspace-<bound_agent_id>`

5. **Quota et audit unifiés**
   L'instance partagée mélange tout : la comptabilisation doit revenir à platform.
   Le proxy LLM et la journalisation d'usage déjà présents sont exactement bons — à conserver.

6. **Routage dedicated/shared**
   Un RuntimeRouter dans platform :
   - dedicated → `_container_url(db, user)` actuel
   - shared → URL du runtime partagé

---

## 7. Schéma le plus robuste : « 1 seul Agent par utilisateur » en mode partagé

Cohérent avec votre objectif et idéal pour une première phase.

Ne pas autoriser plusieurs agents par utilisateur en mode partagé dès le départ, sinon :
- gestion front complexe
- liaisons complexes
- appartenance des sessions complexe
- arborescence fichiers complexe
- rattachement des quotas complexe
- audit complexe

V1 du mode partagé :

**un seul agent par utilisateur dans le runtime partagé**, avec :
- une identité fixe
- un workspace fixe
- plusieurs sessions
- une UI chat simple
- upload optionnel
- base de connaissances légère optionnelle

share_openclaw_front ressemble alors beaucoup à simple_front — sauf que derrière il n'y a pas un conteneur dédié mais « l'agent dédié de l'utilisateur » dans une instance partagée.

---

## 8. Conception API recommandée

Plutôt que réutiliser `/api/openclaw/*`, créer une « API à vue utilisateur dédiée » :

### 1. Obtenir l'agent partagé courant
`GET /api/shared-openclaw/me`
Retourne :
- agent_id
- display_name
- workspace_status
- runtime_mode
- model
- created_at

### 2. Lister mes sessions
`GET /api/shared-openclaw/sessions`
En interne :
- appelle sessions.list du runtime partagé
- filtre le préfixe `agent:<my_agent_id>:`
- renvoie une structure simplifiée

### 3. Obtenir une session
`GET /api/shared-openclaw/sessions/{key}`
Validation :
- key doit appartenir à l'agent courant

### 4. Envoyer un message
`POST /api/shared-openclaw/chat`
body :
- session_key (facultatif)
- message
- attachments

Logique plateforme :
- sans session_key, générer une nouvelle session de l'agent courant
- appeler chat.send du runtime partagé
- deliver=false
- renvoyer runId / résultat

### 5. Téléverser un fichier
`POST /api/shared-openclaw/files/upload`
Logique plateforme :
- refuser tout upload_dir fourni par le front-end
- imposer `workspace-<agentId>/uploads`
→ élimine totalement l'injection de chemin

### 6. Optionnel : renommer/supprimer une session
`PUT /api/shared-openclaw/sessions/{key}/title`
`DELETE /api/shared-openclaw/sessions/{key}`

---

## 9. Concevoir share_openclaw_front

Votre intuition est bonne : un nouveau front-end dédié est la meilleure option.

Son positionnement diffère du frontend complet :
- pas d'administration de la plateforme
- aucune interface multi-agents native visible
- uniquement « mon assistant »

Pages suggérées :

1. **Connexion** — réutilise l'authentification existante
2. **Chat principal** — à gauche mes sessions ; à droite fenêtre de conversation, upload, nouvelle session, suppression/renommage
3. **Page de réglages très légère (optionnelle)** — seulement des champs sûrs : nom, emoji/avatar, modèle par défaut (si autorisé). Ne pas exposer compétences/outils/cron/canaux complexes.

La v1 peut même se passer de page réglages.

En pratique : reprendre l'UX de simple_front avec trois adaptations :
- ne pas appeler `listAgents()` (en partagé, il n'y a que l'agent de l'utilisateur)
- ne pas laisser choisir l'agent
- le répertoire d'upload est décidé par le back-end, pas par le front-end

---

## 10. Faire respecter concrètement l'isolation

C'est le cœur du sujet.

Le risque maximal d'une instance partagée est l'interférence entre utilisateurs — la plateforme doit imposer ces règles de façon stricte.

1. **Isolation des sessions**
   Au listage, ne considérer que :
   - `key.startswith(f"agent:{user_agent_id}:")`
   Revalider ce préfixe à toute lecture/écriture/suppression.

2. **Isolation du workspace**
   Toute opération fichier confinée à :
   - `~/.openclaw/workspace-<user_agent_id>`
   La convention front de simple_front ne suffit pas : le back-end doit revalider.

3. **Isolation des agents**
   Toute opération agents.update / files / delete doit se rattacher à l'openclaw_agent_id de l'utilisateur courant. Refuser tout agentId arbitraire.

4. **Isolation des outils**
   Si les outils sont activés en partagé, rester très conservateur :
   - terminal interdit (au moins en v1)
   - écritures système interdites
   - outils limités à : lecture/écriture workspace, recherche dans le workspace, web simple, base de connaissances simple
   OpenClaw dispose de mécanismes workspace-only/sandbox, mais mieux vaut ne pas compter sur la « discipline du modèle ».

5. **Isolation des quotas**
   En partagé, risques typiques : contextes interminables, appels API frénétiques. La plateforme doit maintenir :
   - quota quotidien par utilisateur
   - limitation de concurrence
   - timeouts
   - limite de taille des requêtes

6. **Isolation de la concurrence**
   Sur l'instance partagée :
   - limite de runs concurrents par utilisateur (ex. 1 à 3)
   - plafond global de concurrence du runtime partagé
   Sinon un utilisateur peut paralyser toute l'instance.

---

## 11. Compatibilité avec l'existant

Mieux vaut ne pas toucher la logique principale frontend + proxy : ajouter une branche parallèle.

Recommandation :

1. **Voie dedicated inchangée**
   - `/api/openclaw/*` reste le proxy par conteneur
   - le frontend actuel continue de fonctionner
   - transparence totale pour les utilisateurs existants

2. **Voie shared ajoutée**
   - nouvelles routes `/api/shared-openclaw/*`
   - `/share` ou domaine séparé hébergeant share_openclaw_front
   - nouveaux utilisateurs pouvant opter pour le mode shared

3. **Couche routeur dans platform**
   - `if user.runtime_mode == dedicated -> ancien circuit`
   - `if user.runtime_mode == shared -> service de l'instance partagée`

Permet une montée en charge progressive (grayscale).

---

## 12. Découpage interne recommandé de platform

Modules possibles :

1. `platform/app/shared_runtime/client.py` — accès au bridge openclaw partagé
2. `platform/app/shared_runtime/manager.py` — garantir le runtime vivant, créer l'agent utilisateur, gérer les liaisons
3. `platform/app/shared_runtime/guard.py` — vérification d'appartenance sessions/agents/chemins workspace
4. `platform/app/routes/shared_openclaw.py` — API exposée à share_openclaw_front
5. `platform/app/services/runtime_router.py` — arbitrage unified dedicated/shared

---

## 13. Configuration à écrire à la création d'un agent partagé

Attributs minimaux de l'agent partagé de chaque utilisateur :

- id : usr_xxx
- name : pseudo utilisateur ou nom généré par la plateforme
- workspace : ~/.openclaw/workspace-usr_xxx
- identity.name : nom d'affichage de l'agent
- model : optionnel, hérite de la plateforme
- skills : liste blanche recommandée en mode partagé
- memorySearch : activable, mais limité au scope de l'agent
- tools : liste blanche spécifique au mode partagé

Pour des appels API stables : créer chaque agent depuis un gabarit fixe, sans modification libre du toolset par l'utilisateur.

---

## 14. Faut-il autoriser connaissances/compétences/cron en mode partagé ?

Recommandation :

Phase 1 :
- supporté : sessions, upload de fichiers, base de connaissances simple
- non supporté : cron, canaux, installation de skills complexes, plugins, paramètres système

Raison simple : ces capacités franchissent facilement la frontière « les utilisateurs ne s'affectent pas ». En particulier :
- cron occupe durablement l'instance partagée
- les canaux introduisent un état au niveau compte
- installer des skills peut écrire dans des répertoires globaux
- la config des plugins peut impacter toute l'instance

Le mode partagé doit donc être un « service agent simplifié », pas une « console OpenClaw complète ».

---

## 15. Compromis commercial très pratique : stratification automatique par niveau

Argumentaire commercial possible :

- gratuits / standards → mode shared
- premium / entreprise → mode dedicated

Avantages :
- coûts maîtrisés
- architecture unifiée
- parcours d'évolution clair

Jusqu'à proposer « migration du partagé vers le dédié » :
- conservation des données logiques de l'agent
- export workspace/session
- bascule vers un conteneur dedicated

---

## 16. Risques majeurs à surveiller

1. **Le mode partagé ne remplace pas le dédié** — avec terminal, modifications système, tâches de fond, le risque explose
2. **L'isolation front-end n'est pas une isolation** — validation stricte obligatoire côté plateforme ; ne jamais faire confiance aux agentId/sessionKey/upload_dir venus du client
3. **Ne pas exposer la liste brute /agents de l'instance partagée** — fuite directe
4. **Interdire les chemins de workspace personnalisés** — générés par le back-end uniquement
5. **Interdire aux agents partagés l'installation de skills globaux ou la modification de la config globale** — sinon contamination croisée

---

## 17. Feuille de route recommandée

**Phase 1 — version minimale viable**
- 1 conteneur shared runtime supplémentaire
- table shared_agent_binding
- routes /api/shared-openclaw/*
- réalisation de share_openclaw_front
- 1 agent partagé par utilisateur
- uniquement chat, sessions, upload
- outils à haut risque désactivés
- pas de channels/cron/plugins

**Phase 2 — isolation renforcée**
- limites de concurrence
- rate limiting par utilisateur
- middleware guard sessions/agents/chemins
- health-check et auto-récupération du runtime partagé

**Phase 3 — mixité commerciale**
- choix shared/dedicated par l'utilisateur
- migration en un clic côté admin
- routage du front-end selon le mode utilisateur

---

## 18. Recommandation finale

« Plateforme bimode + front minimal pour le partagé + proxy d'isolation strict dans platform »

En une phrase :
conserver le schéma actuel 1 utilisateur = 1 conteneur ;
ajouter share_openclaw_front, orienté uniquement « 1 agent partagé par utilisateur » ;
platform assure la cartographie user → agent partagé, le filtrage par préfixe de session, la contrainte stricte des chemins de workspace et le contrôle des quotas/concurrence ;
le mode partagé offre uniquement conversation/API légère, sans capacités globales à haut risque.

---

## 19. Schéma d'architecture simplifié

Mode existant :
```
frontend -> platform -> user container -> bridge -> openclaw
```

Mode ajouté :
```
share_openclaw_front -> platform/routes partagées -> bridge partagé -> openclaw partagé
                                          |
                                          +-> mapping user_id -> agent_id
                                          +-> filtrage des sessions
                                          +-> confinement du workspace
                                          +-> quotas/audit unifiés
```

---

## 20. Mise en œuvre concrète sur votre code

Au vu du code existant, plan d'action direct :

1. ne pas modifier la logique dedicated actuelle de `platform/app/routes/proxy.py`
2. créer `platform/app/routes/shared_openclaw.py`
3. créer manager/client du runtime partagé
4. persister en base : user_id → openclaw_agent_id → workspace_dir
5. dériver share_openclaw_front de simple_front :
   - retirer la sélection d'agents
   - retirer la liste globale d'agents
   - faire pointer toutes les API vers `/api/shared-openclaw/*`
   - upload_dir décidé par le back-end, plus par le front-end
6. création d'agents réservée à la plateforme — pas de création libre par les utilisateurs
7. validation stricte des session keys : elles doivent appartenir à l'agent courant

Étape suivante possible : rédaction d'un « document de conception détaillé » (schéma de base, définition des interfaces, découpage platform, structure des pages, plan de migration progressive).

---

# Mise en œuvre réalisée

## 1. Backend : ajout du mode shared OpenClaw

- Nouveau champ de mode d'exécution utilisateur
  - `platform/app/db/models.py`
  - `User.runtime_mode`, valeur par défaut dedicated
- Nouvelle table de liaison des agents partagés
  - SharedAgentBinding
  - maintient user_id → openclaw_agent_id → workspace_dir
- Nouvelle couche de service runtime partagé
  - `platform/app/shared_runtime.py`
  - responsable de :
    - vérifier l'activation du mode partagé
    - créer/récupérer automatiquement l'agent partagé des utilisateurs shared
    - générer les clés de session
    - valider l'appartenance des sessions
    - téléverser les fichiers dans le workspace personnel
- Nouvelles routes API partagées
  - `platform/app/routes/shared_openclaw.py`
  - fournit :
    - GET /api/shared-openclaw/me
    - GET /api/shared-openclaw/sessions
    - GET /api/shared-openclaw/sessions/{key}
    - POST /api/shared-openclaw/chat
    - GET /api/shared-openclaw/runs/{run_id}/wait
    - PUT /api/shared-openclaw/sessions/{key}/title
    - DELETE /api/shared-openclaw/sessions/{key}
    - POST /api/shared-openclaw/files/upload
- Routes montées dans l'application principale
  - `platform/app/main.py`

## 2. Backend : stratégie d'isolation appliquée

- Les utilisateurs shared ne passent plus par l'ancien circuit `/api/openclaw/*` dédié
  - `platform/app/routes/proxy.py`
  - si runtime_mode=shared → réponse 409 invitant à utiliser /api/shared-openclaw
- Validation stricte par préfixe des sessions partagées
  - accès restreint aux sessions `agent:<agent partagé de l'utilisateur>:...`
- Upload de fichiers : plus aucun chemin venu du front-end
  - écriture forcée côté back-end dans :
    - workspace-<agent_id>/uploads

## 3. Backend : configuration et déploiement

- Nouvelles variables dans `platform/app/config.py` :
  - PLATFORM_SHARED_OPENCLAW_ENABLED
  - PLATFORM_SHARED_OPENCLAW_URL
  - PLATFORM_SHARED_OPENCLAW_TIMEOUT_SECONDS
  - PLATFORM_SHARED_OPENCLAW_SYSTEM_TOKEN
- Ajouts dans docker-compose.yml :
  - service shared-openclaw
  - service share-openclaw-front
  - volume shared_openclaw_data
- Variables du gateway complétées pour le runtime partagé

## 4. Console admin : bascule du mode utilisateur

- manage_front prend en charge runtime_mode
- liste des utilisateurs et boîte d'édition affichent/permettent :
  - dedicated
  - shared
- affichage de shared_agent_id (si créé)

## 5. Nouveau front-end : share_openclaw_front

- Nouveau répertoire :
  - share_openclaw_front/
- Implémenté :
  - page de connexion
  - page de chat partagé
  - liste des sessions
  - création de session
  - renommage de session
  - suppression de session
  - upload de fichiers
- Ce front-end ne cible que « l'agent partagé de l'utilisateur courant »
- Aucune vue multi-agents exposée — conforme au besoin « esprit simple_front mais sans interférence entre utilisateurs »

## État de la vérification

Vérifications effectuées :
- compilation `compileall` de platform/app : OK
- `npm install && npm run build` de share_openclaw_front : succès
- Le nouveau front-end et les nouveaux fichiers backend sont cohérents syntaxiquement et en build

## Utilisation

1. Construire l'image de base openclaw (étape inchangée) :
   ```bash
   docker build -f openclaw/Dockerfile.bridge -t openclaw:latest openclaw/
   ```
2. Démarrer les services :
   ```bash
   docker compose up -d --build
   ```
3. Points d'accès :
   - Frontend complet (mode dedicated) : http://localhost:3080
   - Console admin : http://localhost:3081
   - simple_front : http://localhost:3082
   - Front partagé share_openclaw_front : http://localhost:3083
4. Basculer un utilisateur en mode shared :
   - console admin → éditer l'utilisateur
   - passer runtime_mode à shared
5. Connexion de l'utilisateur sur 3083 :
   - la liaison d'agent partagé est créée automatiquement à la première visite
   - toutes les sessions et fichiers suivants relèvent de cet agent partagé

## Remarque importante

Cette version atteint les objectifs principaux :
- compatibilité avec le schéma 1 conteneur/utilisateur
- ajout du schéma « 1 OpenClaw partagé »
- chaque utilisateur possède son propre agent dans l'instance partagée
- chaque agent a son workspace
- front-end simplifié, sans vue d'interférence inter-utilisateurs

Limite assumée de la version actuelle :

L'authentification LLM du runtime partagé repose sur un **system token partagé** :
- l'instance fonctionne ainsi,
- mais le proxy LLM ne peut pas encore attribuer précisément la consommation token à chaque utilisateur réel, comme en mode dedicated
- autrement dit : l'« isolation sessions/fichiers/agents » du mode partagé est faite ;
  la « consommation LLM par utilisateur partagé » reste une v1, pas la version définitive

Cela n'empêche ni de lancer le mode partagé, ni d'en faire un service API et une entrée de chat simplifiée. Pour une facturation ou des quotas fins, la phase 2 est recommandée :

## Trois chantiers suggérés pour la suite

1. **Imputation précise des quotas/usage en mode partagé**
   - lier les requêtes LLM du runtime partagé à l'utilisateur platform réel
   - pour que usage_records compte réellement par utilisateur shared

2. **Protection de concurrence en mode partagé**
   - limite de runs concurrents par utilisateur
   - plafond global du runtime partagé
   - empêcher qu'un utilisateur n'accapare l'instance

3. **Liste blanche d'outils en mode partagé**
   - restriction explicite des outils à haut risque pour les agents partagés
   - désactiver notamment terminal / tâches longues / modification de config globale
   - garder chat, fichiers et capacités workspace légères

---

| Service | Port | Description |
|---------|------|-------------|
| postgres | 15432 | base de données |
| gateway | 8080 | passerelle plateforme |
| frontend | 3080 | front-end utilisateurs |
| simple-front | 3082 | front-end simplifié |
| manage-front | 3081 | front-end administrateur |
| shared-openclaw | 18080 | service OpenClaw partagé ✨ |
| share-openclaw-front | 3083 | front-end partagé ✨ |

- Nouveaux inscrits via share_openclaw_front → runtime_mode=shared
- Nouveaux comptes créés par connexion QR via share_openclaw_front → runtime_mode=shared
- Utilisateurs existants → runtime_mode conservé, sans changement imposé

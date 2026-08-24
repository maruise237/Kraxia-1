# Journal des modifications

## Premières entrées

1. Ajout de la page Skills : consulter, supprimer, télécharger, téléverser des compétences.

```
┌────────────────────────────────┬────────────────────────────────────────────────────┐
│              Fichier           │                      Modification                  │
├────────────────────────────────┼────────────────────────────────────────────────────┤
│ nanobot/web/server.py          │ Ajout de 3 endpoints API skills                    │
├────────────────────────────────┼────────────────────────────────────────────────────┤
│ frontend/types/index.ts        │ Ajout de l'interface Skill                         │
├────────────────────────────────┼────────────────────────────────────────────────────┤
│ frontend/lib/api.ts            │ Ajout de listSkills, deleteSkill, uploadSkill      │
├────────────────────────────────┼────────────────────────────────────────────────────┤
│ frontend/app/skills/page.tsx   │ Nouveau fichier — page de gestion des Skills       │
├────────────────────────────────┼────────────────────────────────────────────────────┤
│ frontend/components/Header.tsx │ Ajout de l'entrée Skills dans la navigation        │
└────────────────────────────────┴────────────────────────────────────────────────────┘
```

2. Quota de tokens par utilisateur — `platform/app/config.py` :

```python
# Quotas (tokens par jour)
quota_free: int = 20000000
quota_basic: int = 1_000_000
quota_pro: int = 10_000_000
```

---

# Journal des modifications (détaillé)

## 2026-03-05 : remplacement de Nanobot → pont OpenClaw Bridge

### Vue d'ensemble

Remplacement de l'agent Nanobot (Python) d'origine par OpenClaw (TypeScript), avec une couche d'adaptation Bridge pour la compatibilité API — bascule transparente pour le front-end et la passerelle Platform.

### Changement d'architecture

```
Avant :
  Frontend → Platform Gateway → Nanobot (Python, port 18080)

Après :
  Frontend → Platform Gateway → Bridge Server (Express, port 18080)
                                      ↓ (WebSocket interne)
                              OpenClaw Gateway (port 18789)
                                      ↓
                                Fournisseur LLM
```

### Nouveaux fichiers (`openclaw/bridge/`)

| Fichier | Description |
|---------|-------------|
| `bridge/config.ts` | analyse des variables d'env, génération de la config openclaw (~/.openclaw/openclaw.json) |
| `bridge/gateway-client.ts` | client WebSocket encapsulant connexion et RPC vers l'OpenClaw Gateway |
| `bridge/server.ts` | point d'entrée du serveur HTTP Express, montage des routes |
| `bridge/start.ts` | démarrage : sous-processus gateway openclaw → attente prêt → serveur bridge |
| `bridge/websocket.ts` | handler WebSocket (/ws/{session_id}), conversion des événements chat openclaw au format nanobot |
| `bridge/utils.ts` | utilitaires (asyncHandler, conversion session key, extraction texte…) |
| `bridge/types.d.ts` | déclarations de types du module unzipper |
| `bridge/routes/chat.ts` | POST /api/chat et /api/chat/stream (SSE) |
| `bridge/routes/sessions.ts` | GET/DELETE /api/sessions — gestion des sessions |
| `bridge/routes/status.ts` | GET /api/status et /api/ping |
| `bridge/routes/files.ts` | upload/download/liste/suppression de fichiers (système de fichiers direct) |
| `bridge/routes/workspace.ts` | navigation/upload/download/suppression/création répertoires workspace |
| `bridge/routes/skills.ts` | compétences : liste/upload/download/suppression (zip pris en charge) |
| `bridge/routes/commands.ts` | liste des commandes (intégrées + plugins + compétences) |
| `bridge/routes/plugins.ts` | liste/suppression des plugins |
| `bridge/routes/cron.ts` | CRUD tâches planifiées (via RPC gateway) |
| `bridge/routes/marketplaces.ts` | CRUD marchés (git clone + système de fichiers) |
| `bridge/package.json` | dépendances du bridge (express, ws, multer, mime-types, archiver, unzipper) |
| `tsconfig.bridge.json` | configuration TypeScript du bridge |
| `Dockerfile.bridge` | build de l'image Docker |
| `bridge-entrypoint.sh` | script d'entrée Docker |

### Fichiers modifiés

| Fichier | Modifications |
|---------|---------------|
| `platform/app/config.py` | valeur par défaut de `nanobot_image` changée en `"openclaw-bridge:latest"` |
| `platform/app/container/manager.py` | commande de démarrage → `node bridge/dist/start.js`, volumes montés sur `/root/.openclaw/` |
| `start_local.py` | service "nanobot" → "bridge", démarrage via `tsx bridge/start.ts`, timeout porté à 120 s |
| `deploy_docker.py` | build image `openclaw-bridge:latest` via `openclaw/Dockerfile.bridge` |
| `prepare.py` | vérification des dépendances openclaw (pnpm install) et bridge (npm install) à la place de nanobot |
| `check_status.py` | health-check conteneur utilisateur : node (fetch API) au lieu de python3 |

### Détails techniques clés

#### Format de configuration OpenClaw (~/.openclaw/openclaw.json)

```json
{
  "models": {
    "mode": "replace",
    "providers": {
      "platform-proxy": {
        "baseUrl": "http://localhost:8080/llm/v1",
        "api": "openai-completions",
        "apiKey": "<token>",
        "models": [{ "id": "<model>", "name": "<model>" }]
      }
    }
  },
  "agents": { "defaults": { "model": "platform-proxy/<model>" } },
  "gateway": { "mode": "local", "port": 18789, "bind": "loopback", "auth": { "mode": "none" } }
}
```

Points d'attention :
- le champ provider utilise `api: "openai-completions"` (pas `type: "openai"`)
- chaque modèle doit avoir `id` **et** `name`
- le modèle d'agent se référence comme `"provider-name/model-id"`
- la gateway exige `mode: "local"`

#### Authentification par identité d'appareil (Device Identity)

Même avec `auth.mode = "none"`, la connexion requiert une identité d'appareil (paire Ed25519 + signature).

Flux :
1. le client génère une paire de clés Ed25519 éphémère
2. réception de l'événement `connect.challenge`, extraction du nonce
3. construction de la chaîne payload v3 (`v3|deviceId|clientId|mode|role|scopes|timestamp|token|nonce|platform|deviceFamily`)
4. signature du payload avec la clé privée
5. envoi de l'objet `device` (id, publicKey, signature, signedAt, nonce) dans la requête connect

`client.id` doit être une valeur prédéfinie (ex. `"gateway-client"`).

### Problèmes rencontrés pendant le débogage

1. **Format de config erroné** : `type` → `api`, `name` manquant, champ provider invalide
2. **Mode de la gateway non défini** : `mode: "local"` obligatoire explicitement
3. **Schéma connect inadapté** : objet `client` imbriqué requis avec `minProtocol/maxProtocol`
4. **Identité d'appareil obligatoire** : en mode auth=none, `sharedAuthOk` reste false — impossible de sauter la vérification
5. **Validation du Client ID** : valeurs définies dans `GATEWAY_CLIENT_IDS` uniquement

---

### Renommages Nanobot → OpenClaw

Frontend (8 fichiers) :
- lib/api.ts — tous les /api/nanobot/ → /api/openclaw/, clés localStorage renommées
- lib/store.ts — nanobotReady → openclawReady
- app/page.tsx — textes UI et noms de variables
- app/layout.tsx — titre → « OpenClaw »
- app/help/page.tsx — textes d'aide
- app/status/page.tsx — messages d'erreur et commandes
- app/plugins/page.tsx — chemins et textes
- app/login/page.tsx + app/register/page.tsx — titres
- components/Header.tsx — affichage en-tête et variables d'état
- types/index.ts — commentaires

Platform Gateway (5 fichiers) :
- routes/proxy.py — préfixe /api/openclaw, références de config
- config.py — dev_openclaw_url, openclaw_image, noms de réseaux…
- main.py — nom du service
- llm_proxy/service.py — références de config
- container/manager.py — noms conteneurs/volumes

Infrastructure (2 fichiers) :
- Dockerfile — répertoire .openclaw, point d'entrée
- start_local.py — noms de conteneurs Docker, variables d'env, textes UI

Note : openclaw/Dockerfile.bridge embarque déjà tout le programme principal openclaw (COPY . . + pnpm build), pas seulement le bridge.

---

### Page Chat

- bouton 📎 pièces jointes à gauche de la zone de saisie, sélection multiple
- collage d'images (Ctrl+V / Cmd+V)
- zone d'aperçu : miniatures pour les images, nom+taille pour les fichiers, suppression unitaire
- logique d'envoi :
  - images (image/*) → encodées en base64, envoyées directement à la gateway comme attachment
  - autres fichiers (PDF/documents) → upload vers workspace/uploads/ puis insertion de `[附件: workspace/uploads/xxx.pdf]` dans le message ; l'agent lit le chemin avec ses outils fichiers

### WebSocket (signaux précis)

- connexion au chargement : /api/openclaw/ws?token=JWT
- handshake gateway complet (connect.challenge → connect, protocole v3)
- écoute des événements chat ; sur state = "final"/"error"/"aborted" :
  - rafraîchissement immédiat de la liste des messages
  - sending=false, fin de l'animation
  - interruption de la boucle de polling via wsCompletedRef
- reconnexion automatique (3 s)

Polling (filet de sécurité + messages intermédiaires) :
- récupération des messages toutes les 2 s, affichage en direct des réponses intermédiaires de l'agent
- si le WebSocket a déjà signalé la fin, sortie immédiate du polling
- sans WebSocket, seuil de stabilité de 15 s en secours

---

### 1. Échec d'authentification (gateway token missing)

Cause : writeOpenclawConfig conservait la config gateway existante de l'utilisateur, mais celle-ci n'avait pas `auth: { mode: "none" }` — la gateway exige un token que le bridge n'envoie pas.

Correctif (config.ts) :
- `gateway.auth = { mode: "none" }` forcé systématiquement — le bridge doit se connecter sans authentification
- gateway.mode/port/bind garantis corrects
- models.mode ne force plus "replace" : défaut "merge" pour préserver les providers de l'utilisateur (ex. moonshot)
- controlUi.allowedOrigins fusionné entre valeurs existantes et par défaut

### 2. Canaux non démarrés (OPENCLAW_SKIP_CHANNELS)

Cause : le bridge passait systématiquement OPENCLAW_SKIP_CHANNELS=1 au démarrage de la gateway.

Correctif :
- nouvelle variable BRIDGE_ENABLE_CHANNELS=1 pour activer les canaux
- start_local.py passe automatiquement BRIDGE_ENABLE_CHANNELS=1 — Feishu etc. fonctionnent en dev local
- mode Docker : toujours ignorés par défaut (un conteneur indépendant par utilisateur)

### 3. Nouvelle page de gestion des plugins

- backend (plugins.ts) : scan de ~/.openclaw/extensions/, lecture des métadonnées plugins.installs d'openclaw.json ; ajout de POST /api/plugins/install et DELETE /api/plugins/:name via CLI openclaw
- front-end (Plugins.tsx) : nouvelle page /plugins listant les plugins installés + catalogue d'extensions de canaux disponibles (Feishu, Matrix, Teams…), installation/désinstallation en un clic, saisie manuelle de paquet npm
- barre latérale : entrée « Gestion des plugins » dans le Centre de compétences

---

### Perte de streaming : cause racine

Le protocole WebSocket de la gateway exige une signature d'authentification Ed25519 (voir bridge/gateway-client.ts). Les requêtes connect du front-end arrivaient sans champ device ni signature → déconnexion immédiate après handshake (code 1000) :
- aucun événement delta reçu → pas d'affichage streamé
- reconnexions en boucle → cycles massifs de connexions/déconnexions WS

**Solution : remplacer WebSocket par SSE (Server-Sent Events)**

1. Bridge gateway-client.ts — ajout de offEvent() pour nettoyer les listeners des connexions SSE
2. Bridge routes/events.ts (nouveau fichier) — endpoint SSE /api/events/stream : relaie les événements chat de la gateway via le BridgeGatewayClient déjà authentifié, poussés au format SSE
3. Bridge server.ts — montage de la route events
4. Platform proxy.py — traitement spécial du chemin events/stream : proxy streaming httpx.stream() sans buffering
5. Frontend Chat.tsx — code WebSocket remplacé intégralement par EventSource (SSE) :
   - ni handshake ni authentification gateway nécessaires
   - reconnexion native du navigateur (back-off intégré)
   - réception des événements delta/started/final pour l'affichage progressif
   - curseur clignotant pendant le streaming
6. vite.config.ts — suppression de la config proxy WS devenue inutile

Relancer start_local.py puis tester.

---

### Pourquoi les agents ne s'affichaient pas

La découverte des agents scanne ~/.openclaw/agents/<id>/ + agents.list d'openclaw.json — pas le répertoire workspace. Déposer les fichiers ne suffisait pas :
1. créer ~/.openclaw/agents/<id>/
2. enregistrer dans openclaw.json

### Corrections apportées

start_local.py (déploiement local) :
- nouvelle fonction _sync_agents() : parcourt deploy_copy/Agents/
- _register_agents_in_config() : inscrit l'agent dans agents.list d'openclaw.json
- trois actions par agent :
  a. ~/.openclaw/agents/<id>/ — création du répertoire (découverte disque par la gateway)
  b. ~/.openclaw/workspace-<id>/ — synchronisation des SOUL.md etc.
  c. openclaw.json agents.list[] — enregistrement id, name, workspace

bridge-entrypoint.sh (démarrage Docker) :
- même logique en bash + node
- parcours de /deploy-copy/Agents/*/ : création répertoire, synchro fichiers, enregistrement config

Les deux scripts sont idempotents — fichiers existants non écrasés, agents déjà enregistrés non dupliqués.

---

### Import de compétences depuis Git

1. Backend marketplaces.ts — 2 nouveaux endpoints

- POST /api/marketplaces/git/scan-skills — reçoit une URL git (https://, git@, ssh://, git://), clone le dépôt, scanne jusqu'à 3 niveaux de profondeur les répertoires contenant SKILL.md, renvoie la liste des compétences + cacheKey
- POST /api/marketplaces/git/install-skills — reçoit cacheKey + liste de compétences choisies, copie les répertoires vers ~/.openclaw/skills/ (installation globale)

Fonctions auxiliaires :
- hashString() — nom de répertoire cache unique
- parseSkillMdDescription() — extraction de la description depuis SKILL.md
- scanForSkills() — recherche récursive des répertoires avec SKILL.md

2. Front-end api.ts — nouveaux types et fonctions

- types GitSkillInfo, GitScanResult
- scanGitSkills(url)
- installGitSkills(cacheKey, skillNames)

3. UI SkillStore.tsx — zone d'import Git

- champ URL Git à thème violet + bouton Analyser
- résultats en liste à cases à cocher, tout cocher/décocher
- installation groupée, état vert « installée » après coup
- rafraîchissement automatique de la liste des compétences installées

Flux :

1. saisie de https://github.com/xxx/repo.git ou git@github.com:xxx/repo.git
2. « Analyser » → clone back-end, scan de tous les SKILL.md
3. affichage de la liste, tout sélectionné par défaut
4. coche des compétences voulues → « Installer la sélection »
5. copie vers le répertoire global des skills, rafraîchissement

---

### Console admin (manage_front)

L'API Admin existante couvre l'essentiel ; manquaient :

1. Requête du journal d'audit — table audit_logs alimentée mais sans endpoint : ajout de GET /api/admin/audit
2. Historique de consommation — /usage/summary ne donnait que le jour courant : ajout de GET /api/admin/usage/history (par jour/utilisateur)
3. Réinitialisation de mot de passe — ajout de PUT /api/admin/users/{user_id}/password

Structure du front-end :

```
manage_front/
├── src/
│   ├── app/
│   │   ├── login/page.tsx
│   │   ├── (admin)/
│   │   │   ├── layout.tsx        (layout avec sidebar)
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── users/page.tsx
│   │   │   ├── containers/page.tsx
│   │   │   ├── usage/page.tsx
│   │   │   └── audit/page.tsx
│   │   ├── layout.tsx
│   │   └── page.tsx              (redirection dashboard)
│   ├── components/
│   │   ├── ui/                   (composants shadcn)
│   │   ├── sidebar.tsx
│   │   └── header.tsx
│   ├── lib/
│   │   ├── api.ts                (client API Gateway)
│   │   └── auth.ts               (stockage/validation JWT)
│   └── types/
│       └── index.ts
├── Dockerfile
├── docker-compose.yml            (ou celui de la racine)
├── tailwind.config.ts
├── next.config.js
└── package.json
```

Flux d'authentification :

1. accès à la console → redirection /login si non connecté
2. identifiants → appel Gateway /api/auth/login
3. contrôle du rôle retourné : non-admin → refus
4. admin → JWT stocké en localStorage → pages admin
5. chaque requête porte Authorization: Bearer <token>

Extensions de la Gateway API (platform/app/routes/admin.py) :
- GET /api/admin/users — pagination, recherche, infos conteneurs, optimisation N+1
- PUT /api/admin/users/{user_id}/password — reset admin
- GET /api/admin/usage/history — historique par jour/modèle
- GET /api/admin/audit — journal d'audit paginé et filtrable

Front-end admin (manage_front/) :
- /login — connexion, contrôle rôle admin
- /dashboard — total utilisateurs/conteneurs actifs/usage du jour
- /users — édition rôle/quota/statut, reset mot de passe
- /containers — pause/destruction
- /usage — statistiques, courbes + histogrammes
- /audit — filtre par type d'opération
- route proxy API (déploiement Docker en production)
- Dockerfile + service docker-compose

Lancement :
- dev : `cd manage_front && npm run dev -- -p 3001`
- prod : `docker compose up manage-front`

---

### Attribution automatique des ports

Fichiers modifiés :

```
┌───────────────────────────────────┬──────────┬─────────────────────────┐
│              Fichier              │  Changt  │         Rôle            │
├───────────────────────────────────┼──────────┼─────────────────────────┤
│ platform/app/config.py            │ +2       │ 2 nouvelles options     │
│ platform/app/container/manager.py │ +139 -25 │ logique principale      │
│ openclaw/Dockerfile.bridge        │ +38 -3   │ miroirs CN (secondaire) │
└───────────────────────────────────┴──────────┴─────────────────────────┘
```

Détail du mécanisme — cœur dans create_container() de manager.py :

1. Options de configuration

```python
user_container_publish_ports: bool = True   # exposer les ports ?
user_container_bind_ip: str = "0.0.0.0"     # IP d'écoute
```

2. Déclaration du mappage à la création

```python
"ports": {
    "5900/tcp": (bind_ip, None),    # port navigateur
    "30000/tcp": (bind_ip, None),   # port service
}
```

Le point clé est `None` : Docker choisit automatiquement un port hôte libre — équivalent à `docker run -p 0.0.0.0::5900 -p 0.0.0.0::30000`. Avec 10 conteneurs utilisateurs, Docker attribue des ports hôtes distincts (32768, 32769, …) — zéro conflit.

3. Consultation des ports réels après démarrage

Via `_published_binding()` : lecture de NetworkSettings.Ports pour obtenir les ports hôtes effectivement attribués.

4. Réécriture de l'information dans le conteneur

`_build_expose_port_skill_markdown()` génère un fichier Markdown documentant :
- port conteneur 5900 → port hôte X
- port conteneur 30000 → port hôte Y

Puis `_write_expose_port_skill()` écrit ce fichier via l'API put_archive de Docker dans
`~/.openclaw/workspace/skills/container-expose-info/SKILL.md`.

Pourquoi ? L'agent du conteneur lit ce skill pour connaître son port exposé côté hôte et communiquer l'adresse exacte à l'utilisateur.

### Flux global

```
création conteneur → attribution auto Docker → lecture ports réels
→ génération fichier explicatif → écriture dans le conteneur
                                              ↓
                          l'agent informe l'utilisateur :
                          « votre navigateur tourne sur host:32768 »
```

En bref : `None` laisse Docker choisir les ports (résout les conflits multi-utilisateurs), puis l'agent en conteneur est informé du résultat.

---

# 03.18

- ajout de la config agents : 4 agents définis (boss/programmer/researcher/hr), boss par défaut
- ajout de tools.agentToAgent : activation de la communication inter-agents entre les 4
- ajout de tools.sessions.visibility: "tree" : boss voit les sessions de sous-tâches qu'il a distribuées
- ajout de session.agentToAgent.maxPingPongTurns: 3 : limite des allers-retours inter-agents
- boss subagents.allowAgents restreint à programmer/researcher/hr

# 0319 — Rôles des agents par défaut

```
Patron (vous)
  ├── main (entrée par défaut) ⭐
  │     └── manager 📋
  │           ├── programmer 💻
  │           ├── researcher 🔬
  │           └── hr 🤝
  └── doctor (médecin) 🩺  ← rôle racine indépendant
```

Changements clés :
- main = "default": true — tous les messages arrivent d'abord à main
- main ne peut distribuer qu'à manager (allowAgents: ["manager"])
- manager perd default ; distribué par main au besoin, puis répartit vers programmer/researcher/hr
- agentToAgent.allow inclut désormais "main"

# 0320 — Validation de la config avant redémarrage de la passerelle

Backend (openclaw/bridge/routes/settings.ts) :
- avant tout redémarrage, exécution de `openclaw doctor --non-interactive` pour valider la configuration
- détection de « Invalid config » dans la sortie même si le code de retour doctor vaut 0
- si invalide : HTTP 400 avec détails — pas de redémarrage

Frontend (frontend/src/pages/SystemSettings.tsx) :
- nouvel état configError pour l'affichage des erreurs de validation
- si échec de redémarrage contenant « Invalid config », panneau dédié (affichage formaté `<pre>` des erreurs)
- les erreurs de redémarrage classiques gardent le circuit error habituel

# Connexion SSO

Principe :

```
┌──────────────┐    postMessage     ┌──────────────┐   POST /api/auth/sso   ┌─────────────┐
│ Login front  │ ←──────────────── │ InfoX-Med    │                        │  Platform   │
│  (iframe)    │  {key:"pushToken" │ page login   │                        │  Gateway    │
│              │   data: token}    │ (dans iframe)│                        │             │
└──────┬───────┘                   └──────────────┘                        └──────┬──────┘
       │                                                                          │
       │ 1. l'utilisateur termine la connexion InfoX-Med dans l'iframe             │
       │ 2. l'iframe transmet le token au parent via postMessage                   │
       │ 3. le front appelle POST /api/auth/sso {infox_token:"pc-xxx|1106970"} ───→│
       │                                                                          │
       │ 4. le back-end valide le token auprès de l'API InfoX-Med, obtient trueName│
       │                                 ┌───────────────────┐                    │
       │                                 │ api.infox-med.com │ ← POST /user/getUserInfo
       │                                 │ valide le token   │  (header: token)   │
       │                                 └───────────────────┘                    │
       │                                                                          │
       │ 5. création/mise à jour de l'utilisateur PostgreSQL (sso_uid + sso_token) │
       │ 6. destruction de l'ancien conteneur (réinjection du token au rebuild)    │
       │ 7. émission du JWT plateforme ←────────────────────────────────────────── │
       │                                                                          │
       │ 8. requêtes suivantes authentifiées par ce JWT                            │
       │ 9. premier appel : création auto du conteneur avec env INFOX_MED_TOKEN    │
       │                                 ┌───────────────────┐                    │
       │                                 │ Docker Container  │                    │
       │                                 │ env:              │                    │
       │                                 │  INFOX_MED_TOKEN  │ ← lu par les skills│
       │                                 └───────────────────┘                    │
```

Fichiers modifiés

Backend (platform/) :

| Fichier | Modifications |
|---------|--------------|
| platform/app/db/models.py | champs sso_uid et sso_token ajoutés à User |
| platform/app/auth/service.py | ajout get_user_by_sso_uid(), create_or_update_sso_user() |
| platform/app/routes/auth.py | nouveau POST /api/auth/sso : validation token infox-med → create/update user → destruction ancien conteneur → renvoi JWT |
| platform/app/container/manager.py | create_container() consulte sso_token et injecte INFOX_MED_TOKEN dans le conteneur |

Frontend (frontend/) :

| Fichier | Modifications |
|---------|--------------|
| frontend/src/pages/Login.tsx | page réécrite : formulaire → iframe infox-med.com/loginPage, écoute postMessage pour récupérer le token |
| frontend/src/lib/api.ts | ajout ssoLogin(infoxToken) appelant /api/auth/sso |

Skills (deploy_copy/skills/) :

| Fichier | Modifications |
|---------|--------------|
| deploy_copy/skills/medical-keyword-search/scripts/medical_search.py | token codé en dur remplacé par os.environ.get("INFOX_MED_TOKEN", fallback) |
| deploy_copy/skills/full-paper-api/SKILL.md | token des exemples curl remplacé par la variable $INFOX_MED_TOKEN |

Scripts de démarrage :

| Fichier | Modifications |
|---------|--------------|
| start_local.py | injection de OPENCLAW_GATEWAY_TOKEN au démarrage du bridge (corrige l'erreur extension-relay) |

Base de données :

- ALTER TABLE users ADD COLUMN sso_uid / sso_token exécuté — pas besoin de recréer la table

# Commandes slash

Registre : openclaw/src/auto-reply/commands-registry.ts

# Bug : réponse multi-tours complète uniquement après rafraîchissement

Cause racine : le front-end jugeait mal la fin du tour. Il obtenait bien un runId lors du POST /messages mais ne l'utilisait pas — il devinait la fin à l'apparition d'un message assistant dans la session, pouvant s'arrêter avant la fin réelle de la réponse de l'agent. D'où la nécessité de rafraîchir pour voir le contenu complété.

Corrigé : attente de la fin réelle par runId. Le bridge expose désormais GET /api/runs/:runId/wait qui appelle nativement agent.wait d'openclaw — voir openclaw/bridge/routes/sessions.ts:142. Le front-end attend la vraie fin via le runId retourné puis recharge la session — voir frontend/src/pages/Chat.tsx:388 et :508 ; encapsulation API dans frontend/src/lib/api.ts:103 et :377.

Validation : npm run build du front OK ; validation du chargement de module pour bridge/routes/sessions.ts. Le bridge ayant été modifié, relancer start_local.py localement — le hot reload front ne suffit pas, l'API d'attente back-end exige un redémarrage.

# SSE et streaming

Le front-end empile deux mécanismes :

- **vrai streaming (SSE)** : dès qu'une增量 delta arrive du back-end, le front la reçoit et met à jour en temps réel.
- **faux effet machine à écrire** : l'affichage « lettre par lettre » est simulé côté client par un timer révélant le texte déjà reçu — le back-end n'envoie pas caractère par caractère.

En résumé :
- plan données : vrai streaming SSE
- plan visuel : animation machine à écrire simulée par le front

Distinction essentielle : front-end = SSE réel + animation machine à écrire.

# SSO : reconstruction systématique du conteneur corrigée

Bug : après chaque login SSO, le conteneur était détruit/reconstruit même s'il existait et tournait déjà.

⏺ Correctif dans platform/app/routes/auth.py:211-231 :

Problème : destroy_container() était invoqué sans condition à chaque connexion SSO, détruisant le conteneur et faisant perdre du temps à l'utilisateur.

Correction :
1. lecture de l'ancien sso_token avant mise à jour des informations utilisateur
2. destruction du conteneur uniquement si sso_token a changé (réinjection nécessaire d'INFOX_MED_TOKEN)
3. token inchangé (reconnexion rapide, refresh de page) → conteneur existant réutilisé tel quel

Effets :
- premier login d'un nouvel utilisateur : aucun conteneur → ensure_running le crée — comportement inchangé
- utilisateur existant, token identique → réutilisation immédiate — réponse en quelques secondes
- utilisateur existant, token renouvelé (nouvelle session SSO) → destruction/reconstruction — comportement inchangé, mais c'est nécessaire
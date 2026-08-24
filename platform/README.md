# Hermes Platform

Hermes Platform est un service passerelle multi-tenant basé sur FastAPI, chargé de la gestion des utilisateurs, des quotas et des conteneurs runtime. Le backend runtime par défaut est Hermes Agent ; les chemins d'API compatibles OpenClaw ainsi que la configuration de repli OpenClaw sont conservés.

## Fonctionnalités

- **Gestion des utilisateurs** — inscription, connexion, authentification JWT, rôles (admin/user)
- **Gestion des quotas** — trois niveaux (free/basic/pro) limitant la consommation quotidienne de tokens
- **Gestion des conteneurs** — création et gestion d'un conteneur Docker dédié par utilisateur
- **Proxy LLM** — routage unifié des requêtes LLM ; les clés API restent côté plateforme, aucun secret dans les conteneurs
- **Statistiques d'usage** — enregistrement et agrégation de la consommation LLM par utilisateur

## Stack technique

- **Framework web** : FastAPI + Uvicorn
- **Base de données** : PostgreSQL + SQLAlchemy (async) + Alembic
- **Authentification** : JWT (python-jose) + bcrypt
- **Conteneurs** : Docker SDK for Python

## Vue d'ensemble de l'architecture

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────────┐
│   Client    │────▶│  Platform API   │────▶│ Runtime Container│
│  (Frontend) │     │   (port 8080)   │     │  (Hermes défaut) │
└─────────────┘     └────────┬────────┘     └──────────────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │   PostgreSQL   │
                    └────────────────┘
```

## Points d'accès API

| Route | Description |
|-------|-------------|
| `GET /api/ping` | Sonde de santé |
| `POST /api/auth/register` | Inscription |
| `POST /api/auth/login` | Connexion |
| `POST /api/auth/refresh` | Rafraîchissement du token |
| `POST /api/auth/container` | Informations d'accès au conteneur utilisateur |
| `POST /api/llm/v1/*` | Interface proxy LLM |
| `GET /api/admin/users` | Liste des utilisateurs (admin) |
| `PUT /api/admin/users/{user_id}` | Mise à jour d'un utilisateur (admin) |
| `DELETE /api/admin/users/{user_id}/container` | Suppression du conteneur d'un utilisateur (admin) |
| `GET /api/admin/usage/summary` | Statistiques d'usage de la plateforme |
| `/api/openclaw/*` | API compatible dedicated, routée par défaut vers le backend runtime Hermes |
| `/api/shared-openclaw/*` | API compatible shared, routée par défaut vers le runtime Hermes partagé |

## Configuration

Par variables d'environnement (préfixe `PLATFORM_`) :

| Variable | Valeur par défaut | Description |
|----------|-------------------|-------------|
| `PLATFORM_DATABASE_URL` | `postgresql+asyncpg://nanobot:nanobot@localhost:5432/nanobot_platform` | Connexion base de données |
| `PLATFORM_JWT_SECRET` | `change-me-in-production` | Secret JWT |
| `PLATFORM_DEFAULT_MODEL` | `claude-sonnet-4-5` | Modèle par défaut des nouveaux utilisateurs |
| `PLATFORM_DEDICATED_RUNTIME_BACKEND` | `hermes` | Runtime des conteneurs dédiés ; retour explicite à `openclaw` possible |
| `PLATFORM_SHARED_RUNTIME_BACKEND` | `hermes` | Backend du runtime partagé ; retour explicite à `openclaw` possible |
| `PLATFORM_HERMES_IMAGE` | `nanobot-hermes-agent:latest` | Image Docker du runtime Hermes dédié |
| `PLATFORM_OPENCLAW_IMAGE` | `openclaw:latest` | Image Docker de repli OpenClaw |
| `PLATFORM_SHARED_HERMES_URL` | `http://shared-openclaw:8080` | URL de l'API du runtime Hermes partagé |
| `PLATFORM_CONTAINER_MEMORY_LIMIT` | `2g` | Limite mémoire des conteneurs |
| `PLATFORM_QUOTA_FREE` | `20000000` | Quota quotidien des utilisateurs free |

## Modèle de données

- **User** — compte utilisateur (username, email, password_hash, role, quota_tier)
- **Container** — métadonnées du conteneur utilisateur (docker_id, status, internal_host, internal_port)
- **UsageRecord** — consommation LLM (model, input_tokens, output_tokens)
- **AuditLog** — journal d'audit des opérations

## Démarrage rapide

```bash
# Installer les dépendances
cd platform
pip install -e .

# Démarrer le service (PostgreSQL requis)
export PLATFORM_DATABASE_URL="postgresql+asyncpg://user:pass@localhost:5432/nanobot_platform"
python -m app.main
```

## Déploiement Docker

```bash
# Via docker compose (voir docker-compose.yml à la racine du projet)
docker-compose up -d platform
```

## Comment le front-end détermine si le conteneur utilisateur est démarré

Flux de traitement des requêtes

Lorsque le front-end appelle `http://<host>:8080/api/openclaw/sessions/web%3Adefault` :

1. **Entrée : API compatible OpenClaw**
   Les requêtes chat/session/run adaptées arrivent d'abord dans `platform/app/api_compat/openclaw_compat.py`, puis `platform/app/runtime_router.py` sélectionne le backend Hermes ou OpenClaw selon le mode runtime de l'utilisateur et la configuration. Les chemins legacy non adaptés tombent toujours dans `platform/app/routes/proxy.py`.

   ```python
   @router.post("/api/openclaw/sessions/{session_key:path}/messages")
   async def send_dedicated_message(...):
       backend = get_runtime_backend(user)  # <-- étape clé
   ```

2. **Vérification de l'état du conteneur dédié : ensure_running**
   Le backend Hermes dédié appelle la fonction `ensure_running` (`platform/app/container/manager.py`) qui :

   1. Interroge l'enregistrement du conteneur en base — vérifie si l'utilisateur possède un conteneur
   2. Traite selon le statut :
      - None → création d'un nouveau conteneur
      - paused → unpause pour reprendre
      - archived → recréation
      - running → vérification de l'état réel auprès de Docker

3. **Contrôle effectif via l'API Docker**
   Dans `ensure_running` :

   ```python
   elif record.status == "running":
       try:
           c = client.containers.get(record.docker_id)
           if c.status != "running":
               c.start()  # démarre si l'état n'est pas running
       except DockerNotFound:
           # conteneur supprimé en externe → recréation
           return await create_container(db, user_id)
   ```

# Tests de l'API OpenClaw Platform

Tests d'intégration de la passerelle API OpenClaw Platform (`platform/app/routes`).

Ces tests vérifient les points d'accès API déployés en envoyant de vraies requêtes HTTP au service passerelle en cours d'exécution.

## Prérequis

- Les services Docker Compose doivent être démarrés (`docker compose up -d`)
- La passerelle doit être joignable (adresse par défaut : `http://localhost:8080`)
- L'utilisateur administrateur doit exister (créé automatiquement au premier démarrage)

## Démarrage rapide

```bash
# 1. Vérifier que les services tournent
docker compose ps

# 2. Installer pytest
pip install pytest

# 3. Lancer tous les tests
cd tests
pytest -v

# 4. Lancer un fichier de test précis
pytest test_auth.py -v

# 5. Utiliser une URL de base personnalisée
OPENCLAW_BASE_URL=http://127.0.0.1:8080 pytest -v
```

## Variables d'environnement

| Variable | Valeur par défaut | Description |
|---|---|---|
| `OPENCLAW_BASE_URL` | `http://localhost:8080` | URL de base de la passerelle API |
| `ADMIN_USERNAME` | `admin` | Nom d'utilisateur admin pour les tests d'authentification |
| `ADMIN_PASSWORD` | `admin123` | Mot de passe admin pour les tests d'authentification |

## Organisation des fichiers de test

Chaque fichier couvre un domaine fonctionnel de l'API :

| Fichier | Domaine | Points d'accès couverts |
|---|---|---|
| `test_ping.py` | Sonde de santé | `GET /api/ping` |
| `test_auth.py` | Authentification | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/auth/me`, `POST /api/auth/api-token`, `PUT /api/auth/change-password` |
| `test_openclaw_dedicated.py` | Runtime dédié | `GET /api/openclaw/agents`, `GET /api/openclaw/skills`, `POST /api/openclaw/marketplaces/skills/search`, `POST /api/openclaw/runtime/prewarm`, `GET /api/openclaw/sessions`, `GET /api/openclaw/commands`, `GET /api/openclaw/container/info`, `GET /api/openclaw/ping` |
| `test_admin.py` | Administration | `GET/POST /api/admin/users`, `PUT /api/admin/users/{id}`, `PUT /api/admin/users/{id}/password`, `POST /api/admin/containers/sync`, `GET /api/admin/usage/summary`, `GET /api/admin/usage/history`, `GET /api/admin/audit` |
| `test_filemanager.py` | Gestionnaire de fichiers | `GET /api/openclaw/filemanager/browse`, `POST /api/openclaw/filemanager/mkdir`, `DELETE /api/openclaw/filemanager/delete` |
| `test_llm.py` | Proxy LLM | `POST /llm/v1/chat/completions` |
| `test_container.py` | Gestion des conteneurs | `GET /api/openclaw/container/info`, `POST /api/openclaw/container/doctor-fix`, `GET /api/openclaw/filemanager/download`, `GET /api/openclaw/filemanager/serve` |

## Approche de test

Tous les tests utilisent `urllib.request` (bibliothèque standard Python), selon le même modèle que `call_agent_api.py` :

- **`conftest.py`** fournit les utilitaires partagés : `api_url()`, `json_request()`, `auth_headers()`, `admin_token()`, `register_user()`
- Les tests génèrent des noms d'utilisateur uniques via `unique_username()` pour éviter les collisions
- Les points d'accès protégés sont testés avec et sans token valide
- Les cas d'erreur sont couverts (mauvais mot de passe, utilisateur dupliqué, champ manquant)

## Remarques

- Certains points d'accès exigent un conteneur dédié actif (messages de chat, upload de fichiers). Ces tests peuvent nécessiter un utilisateur disposant d'un conteneur runtime actif.
- Les points d'accès SSE et WebSocket ne sont pas couverts par ces tests HTTP — ils requièrent une infrastructure de test de streaming spécifique.
- Les tests sont conçus pour pouvoir être relancés sans risque sur le même déploiement.

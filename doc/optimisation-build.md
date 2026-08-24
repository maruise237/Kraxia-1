# Optimisation du build en une commande

Objectif : dans l'environnement réseau Docker Desktop actuel, maintenir le premier build sous 30 minutes de façon fiable et éviter de perdre du temps sur des échecs tardifs (miroirs d'images, PyPI, npm, téléchargements Playwright).

## Point d'entrée recommandé

```powershell
$env:PYTHONUTF8='1'
$env:PYTHONIOENCODING='utf-8'
python build_once.py
```

Vérification avec nettoyage complet :

```powershell
python build_once.py --clean --clean-volumes
```

Valider uniquement les images pré-téléchargées et la santé des services :

```powershell
python build_once.py --skip-build
```

## Ce que fait le script

1. Vérifie le démon Docker.
2. Pré-télécharge les images de base externes ; si Docker Hub est instable, passe par un miroir puis re-tag vers le nom standard.
3. Construit dans l'ordre des dépendances :
   - `hermes-base:latest`
   - `nanobot-hermes-agent:latest`
   - les images des services compose
4. Démarre `docker-compose.yml`.
5. Vérifie `/api/ping` du gateway et les ports des fronts.

## Correctifs de build déjà intégrés

- Les images Docker Hub (`postgres:16-alpine`, etc.) sont pré-téléchargées pour éviter les blocages en fin de `docker compose up`.
- Le build ne dépend plus de l'image de base `ghcr.io/astral-sh/uv` ; il s'appuie sur des images Debian/Python miroirables et installe `uv` depuis PyPI — évite les timeouts GHCR.
- L'image de base Hermes n'importe plus `tianon/gosu` : `gosu` est installé via apt Debian.
- npm utilise systématiquement `registry.npmmirror.com`, des paramètres de retry et le cache BuildKit.
- PyPI utilise le dépôt officiel, contournant les 403 du miroir Tsinghua observés dans cet environnement.
- L'image de base Hermes installe le paquet système `chromium` et définit `AGENT_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium` — évite les 404 du miroir Playwright tout en gardant les capacités navigateur.
- Hermes bridge ne réinstalle pas via apt les dépendances navigateur/système déjà présentes dans l'image de base.

## Journal de vérification complète

2026-05-25 — validation après nettoyage complet :

- Périmètre nettoyé : conteneurs projet, volumes projet, images projet, images de base utilisées, réseaux inutilisés, cache de build BuildKit.
- Commande : `python build_once.py --clean --clean-volumes`
- Résultat : succès.
- Durée totale : `1031 s`, soit environ `17 min 11 s`.
- Vérifications au démarrage :
  - `http://localhost:8080/api/ping`
  - `http://localhost:3080`
  - `http://localhost:3081/login`
  - `http://localhost:3082`
  - `http://localhost:3083`

## Reste à configurer

Des services démarrés ne signifient pas des modèles appelables. Avant la première vraie utilisation, créez `.env` avec au moins une clé API LLM :

```env
DASHSCOPE_API_KEY=...
DEFAULT_MODEL=dashscope/qwen3-coder-plus
JWT_SECRET=change-this-in-real-deployments
```

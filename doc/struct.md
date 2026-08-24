Répertoires :
- `hermes-agent` est le backend de l'agent
- `platform` administre et contrôle hermes-agent
- `frontend` se connecte à platform pour les conversations
- `deploy_copy` est copié dans hermes-agent
- le fichier `.env` est utilisé par platform

# Déploiement en conteneurs

```bash
python deploy_docker.py --rebuild hermes,gateway,frontend --fast
```

```
ec5a24e03a8b   openclaw-frontend             "/docker-entrypoint.…"   19 minutes ago   Up 19 minutes   80/tcp, 0.0.0.0:3080->3000/tcp   openclaw-frontend
7daabe89cc4d   openclaw-gateway              "uvicorn app.main:ap…"   19 minutes ago   Up 19 minutes   0.0.0.0:8080->8080/tcp           openclaw-gateway
```

# Vrais conteneurs utilisateurs

```
ec4b38f8aa3c   nanobot-hermes-agent:latest   "/opt/hermes/docker/…"   4 minutes ago   hermes-user-f0536784
```

# API du Bridge openclaw

## Agents

Lister tous les agents :

```bash
curl -s http://127.0.0.1:18080/api/agents
```

Supprimer un agent :

```bash
curl -s -X DELETE http://127.0.0.1:18080/api/agents/test-agent-123
```

## Passerelle

Sonde de santé :

```bash
curl -s http://127.0.0.1:8080/api/ping
# {"message":"pong","service":"openclaw-platform"}
```

Consulter l'état du conteneur :

```bash
curl -s -H "Authorization: Bearer <TOKEN>" http://127.0.0.1:8080/api/openclaw/container/info
```

Réponse :

```json
{
  "container_name": "hermes-user-f0536784",
  "status": "running",
  "docker_id": "3a2399dd01ee…",
  "created_at": "2026-04-20T12:31:57.034631",
  "ports": [{ "container_port": "18080/tcp", "host_port": "0.0.0.0:55297" }]
}
```

## Hermes Agent

### 1. Run SSE natif de Hermes

- Lancer un run : `POST /v1/runs`
- S'abonner aux événements : `GET /v1/runs/{run_id}/events`
- Cette chaîne produit réellement `message.delta` / `run.completed` / `run.failed`
- Code : `hermes-agent/gateway/platforms/api_server.py:1707` et `hermes-agent/gateway/platforms/api_server.py:1885`

Modifications principales dans :

- `platform/app/hermes_client.py:50`
- `platform/app/runtime_backends/dedicated_hermes.py:93`
- `platform/app/runtime_backends/shared_hermes.py:101`
- `platform/app/api_compat/openclaw_compat.py:71`

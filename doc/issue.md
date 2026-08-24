# Erreur d'authentification de la passerelle

Cause probable : une **autre instance openclaw a été démarrée**, entrant en conflit avec l'instance existante. Arrêtez les autres instances openclaw pour résoudre le problème.

```
[  bridge] [gateway-client] Connection closed (unauthorized: gateway token missing (provide gateway auth token)), reconnecting in 2s...
[  bridge] [gateway-client] Connection closed (unauthorized: gateway token missing (provide gateway auth token)), reconnecting in 2s...
[  bridge] [gateway-client] Connection closed (unauthorized: gateway token missing (provide gateway auth token)), reconnecting in 2s...
```

```
⏺ Update(~/.openclaw/openclaw.json)
  ⎿  Added 2 lines, removed 1 line
      57      "port": 18789,
      58      "bind": "loopback",
      59      "auth": {
      60 -      "mode": "none"
      60 +      "mode": "none",
      61 +      "token": "
      62      },
      63      "controlUi": {
      64        "allowedOrigins": [
```

# Test du flux SSE en modes dedicated et shared

Exécution de `call_agent_api.py` pour vérifier la sortie streaming SSE des deux modes.

## Compte dédié (dedicated) — SSE

```
[INFO] username=user2 runtime_mode=dedicated session_key=agent:main:session-1775998834223-7a3b67
[INFO] send_result={"ok": true, "runId": "1aa23a21-6019-456b-85f8-7c696d006c79"}
[user2:dedicated] state=delta
[user2:dedicated] delta: Je suis **l'assistant Medclaw**…
[user2:dedicated] state=delta
[user2:dedicated] delta: … accumulation incrémentale du texte…
[user2:dedicated] state=final
[user2:dedicated] payload: {"runId": "1aa23a21-…", "state": "final", "message": {"role": "assistant", "content": [{"type": "text", "text": "<réponse complète>"}], "timestamp": 1775998842102}}
[INFO] run_result={"runId": "1aa23a21-…", "status": "ok", "endedAt": 1775998842102, "error": null}
[INFO] final_message_count=2
```

La réponse de l'assistant arrive bien par fragments (`delta`) puis se clôture avec un événement `final` contenant le message complet.

## Compte partagé (shared) — SSE

```
[INFO] username=share2 runtime_mode=shared session_key=agent:usr_92eb50f312bf49258667abb2:session-1775998846442-a48d32
[INFO] send_result={"ok": true, "runId": "92d89bf1-ee7e-4849-9e6a-a033f7c23c85", "session_key": "agent:usr_92eb50f312bf49258667abb2:session-…"}
[share2:shared] state=delta
[share2:shared] delta: OpenClaw est une plateforme d'assistant IA personnel…
[share2:shared] state=final
[share2:shared] payload: {"runId": "92d89bf1-…", "state": "final", "message": {"role": "assistant", "content": [{"type": "text", "text": "<réponse complète>"}], "timestamp": 1775998855430}}
[INFO] run_result={"runId": "92d89bf1-…", "status": "ok", "endedAt": 1775998855429, "error": null}
[INFO] final_message_count=2

Process finished with exit code 0
```

Les deux modes produisent le même cycle d'événements SSE : `delta` → `final`.

# Correctif : le SSE ne transmettait pas les événements « agent » — le front-end perdait l'état d'exécution des outils

Le flux SSE pouvait-il présenter ce problème ? L'analyse ci-dessous est-elle exacte ?

> Quand l'agent exécute un outil (génération de PPT), la gateway émet un événement `agent`, pas un événement `chat`. Or le SSE du bridge ne relaie que les événements `chat` — après le premier `final` (réponse texte), le front-end perd totalement la perception de l'activité de l'agent, d'où une interruption.

## Origine du problème

1. **Types d'événements émis par la gateway** :
   - événements `chat` : incréments de texte (delta) et réponse finale (final) du chat
   - événements `agent` : événements internes à l'agent, incluant l'exécution des outils (`stream: "tool"`)

2. **Filtrage SSE du bridge** (`openclaw/bridge/routes/events.ts:18-21`) :

   ```ts
   const listener = (evt: GatewayEvent) => {
     // Only forward chat events (delta, final, started, error, aborted)
     if (evt.event === "chat") {
       res.write(`data: ${JSON.stringify(evt)}\n\n`);
     }
   };
   ```

3. **Proxy SSE de Platform** (`platform/app/routes/proxy.py:193-212`) :
   - simple transfert octet par octet du flux SSE du bridge, sans traitement supplémentaire

## Scénario concret

Quand l'agent exécute un outil (ex. génération de PPT) :

1. La gateway émet un événement `agent` (`stream: "tool"`)
2. Le bridge SSE ne relaie que les événements `chat` et ignore les événements `agent`
3. Après réception du premier événement `final` (réponse texte), le front-end ne perçoit plus l'exécution des outils
4. Le front-end considère la réponse terminée alors que l'agent exécute peut-être encore un outil long

## Impact

- l'interface peut afficher « réponse terminée »
- l'utilisateur ignore que l'agent travaille encore en arrière-plan
- impossible d'afficher la progression ou l'état des outils

## Solution proposée

Modifier `openclaw/bridge/routes/events.ts` pour relayer aussi les événements `agent` :

```ts
const listener = (evt: GatewayEvent) => {
  // Forward both chat and agent events
  if (evt.event === "chat" || evt.event === "agent") {
    res.write(`data: ${JSON.stringify(evt)}\n\n`);
  }
};
```

Ainsi le front-end recevrait les événements d'exécution d'outils et afficherait correctement l'activité de l'agent.

---

## Vérification de l'analyse

L'analyse est globalement exacte, quelques précisions toutefois :

### Points confirmés

1. **Le bridge ne relaie bien que les événements chat** — lignes 23-28 de `openclaw/bridge/routes/events.ts` : filtre strict `event === "chat"`, les événements agent sont silencieusement jetés.
2. **Le proxy Platform est transparent** — `platform/app/routes/proxy.py` transfère au niveau octet sans filtrage ni transformation ; le problème se situe donc dans le bridge.
3. **Le front-end perd la trace des outils** — après `final`, aucun événement ultérieur n'indique que l'agent travaille encore.

### Point à vérifier avant de corriger

La gateway émet-elle réellement des événements de type `event: "agent"` ?

Dans `openclaw/src/gateway/server-chat.ts`, les émissions identifiées sont toutes `broadcast("chat", ...)` et `nodeSendToSession(sessionKey, "chat", ...)`. Si la gateway n'émet pas d'événements agent, le problème dépasse le simple filtrage du bridge : il faudra aussi ajouter l'émission d'événements d'état d'exécution côté gateway.

### Confirmation : la gateway émet bien des événements "agent", très riches

Dans `server-chat.ts` (lignes 747, 773, 796), la gateway émet via `broadcast("agent", payload)` avec la structure :

```json
{
  "runId": "string",
  "seq": 0,
  "stream": "lifecycle | tool | assistant | error",
  "ts": 0,
  "data": {},
  "sessionKey": "?"
}
```

Avec `stream: "tool"`, `data.phase` couvre `"start" | "call" | "result" | "partial"` — tout le cycle de vie d'un outil.

### Chaîne du problème confirmée

```
Gateway émet agent event (stream: "tool", phase: "start"/"call"/"result")
    ↓
Le listener SSE du bridge teste seulement evt.event === "chat" → événement agent perdu
    ↓
Le proxy Platform relaye tel quel → aucun événement agent non plus
    ↓
Front-end reçoit chat final puis plus rien → croit la réponse terminée
```

---

## Correctif appliqué : relayer les événements agent en SSE pour exposer l'état des outils

### Contexte

Quand l'agent exécute un outil (ex. génération de PPT), la gateway émet un événement `agent` (`stream: "tool"`) mais le SSE du bridge ne relaie que `chat`. Après `chat final`, le front-end attend 3 secondes de debounce puis juge la réponse terminée, alors que l'agent travaille peut-être encore sur un outil long. L'utilisateur voit « réponse terminée » pendant que le fond continue de travailler.

### Fichiers modifiés

#### 1. Relais SSE du bridge

Fichier : `openclaw/bridge/routes/events.ts`

```ts
const listener = (evt: GatewayEvent) => {
  if (evt.event === "chat" || evt.event === "agent") {
    res.write(`data: ${JSON.stringify(evt)}\n\n`);
  }
};
```

Mise à jour du commentaire décrivant les types d'événements relayés.

#### 2. Traitement des événements agent côté front-end

Fichier : `frontend/src/pages/Chat.tsx`

Ajout dans `sse.onmessage` du traitement des événements `agent` :

- événement `agent` avec `stream === "tool"` :
  - `phase: "start" / "call"` → annule le timer de debounce, maintient `agentRunning = true`
  - `phase: "result"` → traitement standard (attend le prochain `chat final` pour conclure)
- événement `agent` avec `stream === "lifecycle"` :
  - sur événement de fin de run, garantit le nettoyage de l'état

Logique clé : quand le timer de 3 s du `chat final` tourne, la réception d'un nouvel événement outil prouve que l'agent travaille encore — on annule le timer et on reste en chargement.

#### 3. Composant notifications (optionnel)

Fichier : `frontend/src/components/NotificationProvider.tsx`

Si les notifications doivent aussi refléter l'exécution des outils. Priorité faible, reporté.

### Diff du bridge

```diff
       const listener = (evt: GatewayEvent) => {
-      // Only forward chat events (delta, final, started, error, aborted)
-      if (evt.event === "chat") {
+      // Forward chat events (delta, final, started, error, aborted)
+      // and agent events (tool execution lifecycle, assistant streaming)
+      if (evt.event === "chat" || evt.event === "agent") {
         res.write(`data: ${JSON.stringify(evt)}\n\n`);
       }
```

### Diff du front-end (Chat.tsx)

Nouveau callback `handleAgentEvent` :

```tsx
// Handle agent events (tool execution, lifecycle) to maintain loading state
const handleAgentEvent = useCallback((payload: any) => {
  const { stream, data, sessionKey } = payload
  const currentKey = activeSessionKeyRef.current
  if (!sessionKey || !currentKey) return

  const normalizedGw = sessionKey.replace(/:/g, '')
  const normalizedActive = currentKey.replace(/:/g, '')
  const isCurrentSession = normalizedGw === normalizedActive || sessionKey === currentKey
  if (!isCurrentSession) return

  if (stream === 'tool') {
    const phase = data?.phase
    console.log('[SSE] agent tool event:', { phase })
    // Tool starting/calling — agent is still working, cancel any completion timer
    if (phase === 'start' || phase === 'call') {
      if (sseFinalTimerRef.current) {
        clearTimeout(sseFinalTimerRef.current)
        sseFinalTimerRef.current = null
      }
      setAgentRunning(true)
    }
  } else if (stream === 'lifecycle') {
    const phase = data?.phase
    // Agent run ended — no more events expected, allow completion
    if (phase === 'end') {
      if (sseFinalTimerRef.current) clearTimeout(sseFinalTimerRef.current)
      sseFinalTimerRef.current = setTimeout(() => {
        const key = activeSessionKeyRef.current
        if (key) {
          getSession(key).then(detail => {
            setMessages(detail.messages || [])
            setStreamingText('')
            setSending(false)
            setAgentRunning(false)
            sseCompletedRef.current = true
            fetchSessions()
          }).catch(() => { /* … */ })
        }
      }, 1000)
    }
  }
}, [fetchSessions])
```

Branchement dans `onmessage` :

```diff
         const msg = JSON.parse(evt.data)
         if (msg.event === 'chat' && msg.payload) {
           handleChatEvent(msg.payload)
+        } else if (msg.event === 'agent' && msg.payload) {
+          handleAgentEvent(msg.payload)
         }
```

Et mise à jour du tableau de dépendances :

```diff
-  }, [handleChatEvent])
+  }, [handleChatEvent, handleAgentEvent])
```

### Validation

1. Démarrer le projet et envoyer une requête nécessitant un outil (ex. génération PPT)
2. Observer dans la console navigateur la réception des événements `agent`
3. Confirmer que le front reste en chargement pendant l'exécution de l'outil (pas de « terminé » prématuré)
4. Confirmer qu'une conversation normale (sans outil) n'est pas affectée

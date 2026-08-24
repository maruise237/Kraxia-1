# Variables d'environnement

## 1. `OPENCLAW_SKIP_GMAIL_WATCHER=1`

Ignore le démarrage du surveillant Gmail.

- À 1, la passerelle ne démarre pas le surveillant Gmail au lancement
- Ce surveillant écoute les nouveaux messages des comptes Gmail et déclenche les hooks correspondants
- Peut être ignoré si aucun compte Gmail n'est configuré ou sans besoin de déclencheurs e-mail
- Référence : `src/hooks/gmail-watcher-lifecycle.ts:16`

## 2. `OPENCLAW_SKIP_CRON=1`

Ignore le démarrage des tâches planifiées (Cron).

- À 1, désactive la fonction Cron de la passerelle
- Cron exécute des tâches périodiques (vérifications régulières, déclenchements différés…)
- Référence : `src/gateway/server-cron.ts:153`

## 3. `OPENCLAW_SKIP_CANVAS_HOST=1`

Ignore le démarrage du Canvas Host.

- Le Canvas Host est le service hôte de canvas d'OpenClaw pour les interfaces visuelles
- À 1, le service canvas host ne démarre pas
- Peut être ignoré sans fonctionnalité canvas ou en environnement restreint
- Référence : `src/canvas-host/server.ts:172`

## 4. `OPENCLAW_SKIP_BROWSER_CONTROL_SERVER=1`

Ignore le démarrage du serveur de contrôle navigateur.

- Ce serveur permet le contrôle à distance du navigateur (tests automatisés, scraping…)
- À 1, le service de contrôle navigateur ne démarre pas
- Référence : `extensions/browser/src/plugin-service.ts:28`

## 5. `OPENCLAW_DISABLE_BONJOUR=1`

Désactive la découverte de services Bonjour/mDNS.

- Bonjour (mDNS) permet la découverte automatique de la passerelle OpenClaw sur le réseau local
- À 1, la découverte de services locaux est désactivée
- Référence : `src/infra/bonjour.ts:29`

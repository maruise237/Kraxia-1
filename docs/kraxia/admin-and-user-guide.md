# Guides Kraxia

## Guide utilisateur

### Première connexion

Après l’inscription, l’utilisateur indique en quelques mots ce qu’il souhaite accomplir avec son assistant. Il choisit ensuite la langue et le ton de réponse, puis sélectionne les canaux à activer. Ces préférences peuvent être modifiées depuis **Préférences**.

### Discussion

La page **Discuter** est le point d’entrée principal. Les demandes peuvent concerner l’organisation personnelle, la rédaction, la recherche, les documents, les habitudes ou toute autre tâche autorisée par l’offre. L’utilisateur reste responsable de vérifier les résultats avant toute action sensible.

### Mes canaux

La page **Mes canaux** permet d’ajouter ou de retirer un canal. Pour Telegram ou Discord, le token du bot est demandé une seule fois puis conservé de manière chiffrée. Pour WhatsApp, l’état `association requise` signifie qu’un QR code doit encore être scanné ; il ne faut pas présenter ce canal comme connecté avant la fin de cette association.

### Offre et usage

L’offre de lancement inclut 2 Go de mémoire, 15 Go de stockage et 5 dollars de crédit LLM, avec WhatsApp, Telegram et Discord. Les compteurs affichés servent à prévenir l’utilisateur avant d’atteindre une limite. Le paiement en ligne n’est pas activé dans le MVP ; aucune page ne doit simuler un paiement réussi.

## Guide administrateur

### Accès

La console d’administration est séparée de l’interface client. Elle doit être protégée par l’authentification admin, un domaine HTTPS et, idéalement, une restriction réseau ou une authentification renforcée.

### Contrôles quotidiens

| Contrôle | Vérification |
|---|---|
| Santé Platform | `GET /api/health` doit renvoyer `status=ok` et `database=ok`. |
| Déploiement | Le dernier déploiement Dokploy doit être `done`. |
| Runtimes | Vérifier les états `running`, `paused` ou `stopped` et traiter les erreurs récurrentes. |
| Crédit LLM | Surveiller `UserQuota.llm_credit_cents_used` et les écritures du `CreditLedger`. |
| Stockage | Vérifier la mesure des volumes avant l’ouverture de l’upload massif. |
| Canaux | Ne jamais demander ou afficher un token dans un ticket, un log ou une capture d’écran. |

### Actions sensibles

La pause, la reprise, le redémarrage ou la suppression d’un runtime doivent rester des actions admin explicites et auditables. La suppression d’un runtime ne doit pas supprimer le volume persistant sans confirmation et procédure de restauration.

### Incidents

En cas d’erreur de canal, vérifier d’abord l’état du runtime et les logs sans extraire les variables d’environnement. Pour WhatsApp, demander une nouvelle association uniquement lorsque la session persistée est absente ou invalide. Pour Telegram et Discord, demander le renouvellement du token via l’interface sécurisée, jamais par chat support.

## Variables de production

`CHANNEL_ENCRYPTION_KEY` est obligatoire avant d’enregistrer des canaux en production. Il doit être généré aléatoirement, conservé dans le gestionnaire de secrets de Dokploy et différent de `JWT_SECRET`. Les clés fournisseurs LLM restent exclusivement dans l’environnement de la Platform.

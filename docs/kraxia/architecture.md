# Architecture Kraxia

## Promesse produit

Kraxia fournit à chaque client un assistant personnel francophone disponible en continu depuis le web et, selon la configuration choisie, WhatsApp, Telegram ou Discord. Le compte, les documents et les habitudes restent séparés de ceux des autres utilisateurs.

## Principes non négociables

| Principe | Implémentation MVP |
|---|---|
| Un utilisateur, un runtime | Un conteneur Hermes dédié est associé à chaque ligne `Container` utilisateur. |
| Aucun runtime exposé publiquement | Les runtimes n’ont pas de `ports` Docker publiés. La plateforme utilise une adresse privée sur le réseau de contrôle. |
| Réseaux privés | Le réseau de contrôle est interne à Docker ; un réseau egress séparé autorise les connexions sortantes nécessaires aux fournisseurs de canaux et de modèles. |
| Données persistantes | Le répertoire Hermes `/opt/data` est monté sur un volume dédié au runtime. |
| Clés LLM côté plateforme | Le proxy LLM centralise les clés fournisseur et journalise l’usage ; elles ne sont pas injectées dans les runtimes utilisateurs. |
| Secrets de canaux chiffrés | Les tokens Telegram/Discord et informations de liaison sont chiffrés au repos par Fernet. La clé doit être distincte du secret JWT en production. |
| Mise à jour contrôlée | Hermes n’est pas mis à jour automatiquement pour les utilisateurs ; une mise à jour doit être déclenchée par l’exploitation. |

## Flux d’une requête

1. Le client s’authentifie auprès de la Platform.
2. La Platform vérifie l’utilisateur, son abonnement, ses quotas et son runtime.
3. Le gateway transmet la demande au runtime dédié via le réseau Docker privé.
4. Hermes utilise uniquement les capacités et identifiants de canaux qui lui ont été explicitement attribués.
5. Les appels LLM passent par le proxy Platform ; l’usage est enregistré dans `UsageRecord` et `CreditLedger`.

## Canaux

Telegram et Discord utilisent le long-polling sortant du runtime. Aucun port entrant n’est requis. WhatsApp s’appuie sur la session Baileys persistée dans `/opt/data` et nécessite une association par QR code avant de pouvoir être considéré comme connecté. L’API ne renvoie jamais de token secret au navigateur.

## Préparation multi-VPS

Le MVP conserve la notion de runtime dédié et le réseau privé sur le nœud local. La prochaine étape d’infrastructure est d’introduire un registre de nœuds de calcul et un agent authentifié par nœud. Tant que cet agent n’existe pas, aucune orchestration Docker distante n’est déclarée comme disponible.

## Observabilité

`GET /api/health` vérifie l’accès à PostgreSQL et expose l’état général de la Platform. Les opérations d’administration importantes sont journalisées. Les journaux utilisateur et les identifiants de canal ne doivent pas être copiés dans les réponses client.

> En production, configurer une clé `CHANNEL_ENCRYPTION_KEY` dédiée, un domaine HTTPS réel et une rotation des identifiants précédemment exposés pendant les opérations de mise en place.

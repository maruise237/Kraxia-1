# Journaux du gateway Hermes

Le niveau de sortie stderr par défaut du gateway Hermes est WARNING (verbosity=0) : `docker logs` n'affiche donc que les messages WARNING et au-delà. Les journaux INFO (traitement normal des requêtes, exécution des agents…) ne sortent pas sur stderr — ils sont écrits dans les fichiers de journalisation du conteneur :

- `/opt/data/logs/agent.log` — journal principal (INFO+)
- `/opt/data/logs/gateway.log` — composant gateway (INFO+)
- `/opt/data/logs/errors.log` — erreurs (WARNING+)

Pour passer en mode verbeux : remplacer `gateway run` par `gateway run -v`.

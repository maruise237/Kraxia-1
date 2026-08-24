# Déploiement sur une machine interne sans Internet

## Étape 1 — empaqueter depuis une machine connectée

```bash
python offline_deploy.py pack --host 192.168.1.100
```

Construit toutes les images (openclaw base + gateway + frontend + manage-front + postgres) et les exporte vers `openclaw-images.tar`.

## Étape 2 — copier vers le serveur cible (le script affiche les commandes exactes)

```bash
scp openclaw-images.tar user@192.168.1.100:/data/server/nanobot/
# ou synchroniser tout le répertoire du projet :
rsync -av ./ user@192.168.1.100:/data/server/nanobot/
```

## Étape 3 — déployer sur le serveur cible

```bash
python offline_deploy.py deploy --host 192.168.1.100
```

Importe les images, vérifie, démarre les services et exécute les contrôles de santé.

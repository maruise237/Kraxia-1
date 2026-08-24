# Comment mettre à jour openclaw

```
## Se placer dans un répertoire et cloner le dépôt officiel openclaw
cd /Users/admin/git
git clone https://github.com/openclaw/openclaw
git pull
## Installer les dépendances et lancer
pnpm install
pnpm openclaw

## Depuis le répertoire de ce projet : synchroniser openclaw puis supprimer les skills inutiles
python upgrade_openclaw.py /Users/admin/git/openclaw
python delete_openclaw_skills.py
```

### Conception et mise en œuvre du transfert de fichiers — synthèse

Ce chantier a ajouté au **platform Nanobot une capacité complète d'upload/download de fichiers**, avec :

* téléversement de fichiers par l'utilisateur dans le chat (≤ 50 Mo)
* analyse du contenu des fichiers par l'agent
* génération de nouveaux fichiers par l'agent, renvoyés en pièces jointes
* page de gestion des fichiers pour consultation et suppression centralisées

---

## 1. Architecture générale

Approche retenue : **API fichiers dédiée + références dans les messages**

Flux :

```
Frontend (3080)
    ↓
Gateway (8080)
    ↓
Conteneur utilisateur (18080)
```

Idée clé :

* les fichiers transitent par une API HTTP indépendante (upload/download)
* les messages de chat référencent un `file_id` via le champ `attachments`
* les fichiers sont stockés dans le volume workspace de chaque conteneur utilisateur
* le Gateway reste un proxy transparent — aucune modification nécessaire

Avantages :

* upload découplé du chat
* fichiers réutilisables
* ne bloque pas le WebSocket
* n'augmente pas la complexité du Gateway
* isolation naturelle des utilisateurs (un volume par conteneur)

---

## 2. Stockage des fichiers

Structure :

```
/workspace/files/<file_id>/
    metadata.json
    <fichier_original>
```

Exemple de metadata :

```json
{
  "id": "a1b2c3d4e5f6",
  "name": "report.pdf",
  "content_type": "application/pdf",
  "size": 1048576,
  "created_at": "...",
  "session_id": "web:default"
}
```

Caractéristiques :

* `file_id` = 12 premiers caractères d'un UUID4
* cycle de vie des fichiers lié au volume
- stratégie de nettoyage extensible ultérieurement

---

## 3. Implémentation backend

### 1️⃣ API fichiers (nouveau)

Ajouts dans `server.py` :

* `POST /api/files/upload`
* `GET /api/files/{file_id}`
* `GET /api/files`
* `DELETE /api/files/{file_id}`

Prise en charge :

* upload multipart
* transfert binaire transparent
* affichage inline des images
* download en pièce jointe

---

### 2️⃣ Support des attachments en WebSocket et chat HTTP

Nouvelle structure de message :

```json
{
  "type": "message",
  "content": "...",
  "attachments": [
    {
      "file_id": "...",
      "name": "...",
      "content_type": "...",
      "size": 0
    }
  ]
}
```

Prise en charge :

* envoi de fichiers utilisateurs avec les messages
* retour des fichiers générés par l'agent comme pièces jointes
* champ attachments présent dans l'historique des sessions

---

### 3️⃣ Traitement des fichiers par l'agent

Entrées :

* images → traitement par modèle Vision
* fichiers texte → extraction puis injection dans le Prompt
* autres formats → stockage sans analyse

Sorties :

nouvelle fonction utilitaire :

```
save_output_file()
```

Responsable de :

* générer un file_id
* déplacer le fichier vers le répertoire files
* écrire les metadata
* référencer la pièce jointe dans la réponse

---

### 4️⃣ Renforcement sécurité

Corrections et durcissements :

* protection contre le path traversal
* validation des noms de fichiers et des file_id
* contrôle de validité des entrées
* chargement des images authentifié (anti accès non autorisé)

---

## 4. Implémentation front-end

### 1️⃣ Zone de saisie enrichie

Ajouts :

* bouton 📎 pièces jointes
* barre de progression d'upload
* liste des pièces jointes en attente
* envoi des file_id avec le message

---

### 2️⃣ Rendu des pièces jointes dans les bulles

* image → affichage inline direct
* autre fichier → carte fichier + bouton télécharger

---

### 3️⃣ Page de gestion des fichiers

Nouvelle page :

* liste de tous les fichiers
* filtrage par session
* téléchargement
* suppression

Onglet « Fichiers » ajouté à la navigation.

---

## 5. Déroulé complet

Réalisations :

* 1 document de conception
* 1 plan de mise en œuvre
* 10 tâches
* 9+ commits
* plusieurs revues Spec + Code Review
* correction de 1 problème critique et 2 importants

Périmètre modifié :

Backend :

* files.py
* server.py
* web.py

Frontend :

* types
* api.ts
* page chat
* page fichiers
* header

---

## 6. Capacités finales

Le système prend désormais en charge :

✅ upload de fichiers depuis le chat
✅ lecture et analyse par l'agent
✅ génération de fichiers par l'agent et restitution
✅ affichage inline des images
✅ page de gestion des fichiers
✅ protection sécurisée des chemins
✅ support double canal WebSocket + HTTP

---

## 7. Évaluation de la maturité architecturale

Implémentation actuelle :

* architecture claire
* très faiblement couplée au système existant
* sécurité maîtrisée
* facilement extensible (branchement futur S3 / stockage objet possible)
* préserve le rôle de pur proxy du Gateway

---

Ci-dessous, la liste exhaustive des fichiers créés ou modifiés par cette fonctionnalité de **transfert de fichiers**, classés Backend / Frontend.

---

# 1. Changements backend

## ✅ 1️⃣ Nouveaux fichiers

### `nanobot/web/files.py`

**Rôle : module central de stockage des fichiers**

Contient :

* logique de sauvegarde des fichiers
* écriture de metadata.json
* lecture de la liste des fichiers
* suppression de fichiers
* validation sécurisée des chemins (anti path traversal)
* validation des file_id

C'est le module de fondation de tout le système de fichiers.

---

## ✅ 2️⃣ Fichiers modifiés

### `nanobot/web/server.py`

**Fichier le plus remanié**

Ajouts :

* `POST /api/files/upload`
* `GET /api/files/{file_id}`
* `GET /api/files`
* `DELETE /api/files/{file_id}`

Renforcements :

* les messages WebSocket supportent `attachments`
* l'interface chat HTTP supporte `attachments`
* l'historique de session renvoie les attachments
* décision inline / attachment selon le type de fichier
* validation de taille (≤ 50 Mo)

---

### `nanobot/channels/web.py`

**Nouvelles fonctions :**

* les messages WebSocket sortants supportent `attachments`
* les fichiers produits par l'agent sont automatiquement joints à la réponse

---

# 2. Changements frontend

## ✅ 1️⃣ Fichiers modifiés

### `frontend/types/index.ts`

Ajout :

```ts
export interface FileAttachment {
  file_id: string
  name: string
  content_type: string
  size?: number
}
```

Mise à jour :

* `ChatMessage` gagne `attachments?: FileAttachment[]`

---

### `frontend/lib/api.ts`

Ajouts :

* `uploadFile()` (avec callback de progression)
* `listFiles()`
* `deleteFile()`
* `getFileUrl()`
* `sendRaw()` (support attachments)

Renforcements :

* `sendMessage()` accepte les attachments
* le handler WebSocket traite le champ pièces jointes

---

### `frontend/app/page.tsx`

Ajouts :

* bouton 📎 pièces jointes
* UI de progression d'upload
* liste des pièces jointes en attente
* rendu des pièces jointes dans les bulles
* composant d'affichage inline des images
* composant carte fichier

C'est la refonte cœur de la page de chat.

---

### `frontend/app/files/page.tsx`

**Nouvelle page de gestion des fichiers**

Fonctions :

* lister les fichiers
* télécharger
* supprimer
* filtrer par session

---

### `frontend/components/Header.tsx`

Ajout :

* onglet de navigation « Fichiers »

---

# 3. Historique des commits

Depuis la version de base, ajouts :

* 1 fichier backend
* 1 page frontend
* modifications de nombreux fichiers cœur
* plus de 10 commits
* corrections de plusieurs failles de sécurité

---

# 4. Tableau récapitulatif

| Type | Fichier | Nature | Description |
|------|---------|--------|-------------|
| Backend | nanobot/web/files.py | ajout | module central de stockage |
| Backend | nanobot/web/server.py | modif | API fichiers + chat attachments |
| Backend | nanobot/channels/web.py | modif | WebSocket avec pièces jointes |
| Frontend | frontend/types/index.ts | modif | type FileAttachment |
| Frontend | frontend/lib/api.ts | modif | API upload/download |
| Frontend | frontend/app/page.tsx | modif | UI pièces jointes du chat |
| Frontend | frontend/app/files/page.tsx | ajout | page gestion des fichiers |
| Frontend | frontend/components/Header.tsx | modif | onglet Fichiers |

---

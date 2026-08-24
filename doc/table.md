# Schéma de la base PostgreSQL

## Table `users` actuelle

| Champ | Type | Description |
|-------|------|-------------|
| `id` | varchar(36) PK | clé primaire UUID |
| `username` | varchar(64) UNIQUE | nom d'utilisateur (utilisateurs SSO : trueName) |
| `email` | varchar(256) UNIQUE | e-mail (SSO : `{uid}@infox-med.sso`) |
| `password_hash` | varchar(256) | mot de passe bcrypt (valeur aléatoire pour les utilisateurs SSO) |
| `role` | varchar(16) | user / admin |
| `quota_tier` | varchar(16) | free / basic / pro |
| `is_active` | boolean | compte activé ou non |
| `created_at` | timestamp | date de création |
| `updated_at` | timestamp | date de mise à jour |
| `sso_uid` | varchar(64) UNIQUE | ID utilisateur SSO (ex. 1106970) |
| `sso_token` | varchar(256) | token SSO (injecté dans le conteneur) |

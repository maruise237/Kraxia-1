# Déployer un modèle en local avec vLLM

Ce document décrit comment basculer le projet de DashScope (Alibaba Qwen) vers un service d'inférence vLLM local.

---

## Qu'est-ce que vLLM

[vLLM](https://github.com/vllm-project/vllm) est un framework d'inférence open source haute performance pour grands modèles, capable d'exécuter Llama, Qwen, Mistral, DeepSeek et autres modèles open source majeurs. Il expose une interface totalement compatible avec l'API OpenAI — le projet peut donc basculer sans friction.

**Cas d'usage :**
- déploiement privé, données confinées au réseau interne
- environnement hors ligne ou sans accès aux API cloud
- besoin de latence plus faible ou de débit supérieur
- utilisation de modèles fine-tunés maison

---

## Étape 1 : démarrer le service vLLM

### Installer vLLM

```bash
pip install vllm
```

### Démarrer le service d'inférence

Exemple avec Qwen2.5-7B-Instruct :

```bash
vllm serve Qwen/Qwen2.5-7B-Instruct \
  --host 0.0.0.0 \
  --port 8000 \
  --served-model-name Qwen2.5-7B-Instruct
```

Une fois démarré, l'API écoute sur `http://localhost:8000/v1`.

Vérifier le service :

```bash
curl http://localhost:8000/v1/models
```

> **Remarque :** le nom donné à `--served-model-name` est le nom de modèle à utiliser dans la configuration.

---

## Étape 2 : configurer le projet

Le fichier de configuration principal se trouve dans `~/.nanobot/config.json` (JSON).

### Méthode 1 : modifier config.json (recommandé)

Éditez `~/.nanobot/config.json`, ajoutez la configuration `vllm` sous `providers` et changez le modèle par défaut :

```json
{
  "providers": {
    "vllm": {
      "apiKey": "EMPTY",
      "apiBase": "http://localhost:8000/v1"
    }
  },
  "agents": {
    "defaults": {
      "model": "Qwen2.5-7B-Instruct"
    }
  }
}
```

**Champs :**

| Champ | Description |
|-------|-------------|
| `providers.vllm.apiKey` | vLLM ne requiert pas d'authentification par défaut : `"EMPTY"` suffit ; si `--api-key` a été passé au démarrage, indiquez cette valeur |
| `providers.vllm.apiBase` | Adresse du service vLLM, incluant le chemin `/v1` |
| `agents.defaults.model` | Nom du modèle, identique à `--served-model-name` de vLLM |

### Méthode 2 : variables d'environnement

Vous pouvez aussi surcharger via des variables d'environnement (ou un fichier `.env`) sans toucher à config.json :

```bash
# fichier .env
NANOBOT_PROVIDERS__VLLM__API_KEY=EMPTY
NANOBOT_PROVIDERS__VLLM__API_BASE=http://localhost:8000/v1
NANOBOT_AGENTS__DEFAULTS__MODEL=Qwen2.5-7B-Instruct
```

> Préfixe `NANOBOT_`, hiérarchie séparée par double tiret bas `__`.

---

## Comparaison avec la configuration DashScope

| Élément | DashScope (actuel) | vLLM (local) |
|---------|--------------------|--------------|
| Clé dans `.env` | `DASHSCOPE_API_KEY=sk-xxx` | aucune clé requise (ou `EMPTY`) |
| Provider config.json | `"dashscope": {"apiKey": "sk-xxx"}` | `"vllm": {"apiKey": "EMPTY", "apiBase": "http://..."}` |
| Exemple de modèle | `qwen-max` | `Qwen2.5-7B-Instruct` |
| Routage interne LiteLLM | `dashscope/qwen-max` | `hosted_vllm/Qwen2.5-7B-Instruct` |

La bascule ne modifie que `providers` et `agents.defaults.model` — aucun autre code.

---

## Exemple complet de config.json

Configuration minimale complète (les autres champs gardent leur valeur par défaut) :

```json
{
  "providers": {
    "vllm": {
      "apiKey": "EMPTY",
      "apiBase": "http://localhost:8000/v1"
    }
  },
  "agents": {
    "defaults": {
      "model": "Qwen2.5-7B-Instruct",
      "maxTokens": 8192,
      "temperature": 0.1
    }
  }
}
```

---

## Commandes de démarrage courantes

### Série Qwen2.5

```bash
# 7B, GPU grand public (24 Go VRAM)
vllm serve Qwen/Qwen2.5-7B-Instruct --served-model-name Qwen2.5-7B-Instruct

# 72B, multi-GPU
vllm serve Qwen/Qwen2.5-72B-Instruct --served-model-name Qwen2.5-72B-Instruct \
  --tensor-parallel-size 4
```

### Série DeepSeek

```bash
vllm serve deepseek-ai/DeepSeek-R1-Distill-Qwen-7B \
  --served-model-name DeepSeek-R1-7B
```

### Série Llama

```bash
vllm serve meta-llama/Llama-3.1-8B-Instruct \
  --served-model-name Llama-3.1-8B-Instruct
```

---

## Support des appels d'outils (Tool Calling)

vLLM supporte les appels d'outils, à condition que le modèle gère nativement le Function Calling (ex. Qwen2.5-Instruct, Llama-3.1-Instruct…).

Ajoutez au démarrage :

```bash
vllm serve Qwen/Qwen2.5-7B-Instruct \
  --served-model-name Qwen2.5-7B-Instruct \
  --enable-auto-tool-choice \
  --tool-call-parser hermes
```

Valeurs de `--tool-call-parser` selon les familles de modèles :

| Famille | parser |
|---------|--------|
| Qwen2.5 | `hermes` |
| Llama 3.1/3.2 | `llama3_json` |
| Mistral | `mistral` |
| DeepSeek | `hermes` |

---

## Test curl après déploiement

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer Empty" \
     -d '{
           "model": "Qwen2.5-7B-Instruct",
           "messages": [
               {"role": "user", "content": "Bonjour"}
           ]
         }'
```

Réponse :

```json
{"id":"chatcmpl-8c9ba236ade65176","object":"chat.completion","created":1773411630,"model":"Qwen2.5-7B-Instruct","choices":[{"index":0,"message":{"role":"assistant","content":"Bonjour ! Ravi de vous aider..."},"logprobs":null,"finish_reason":"stop","stop_reason":null,"token_ids":null}],"service_tier":null,"system_fingerprint":null,"usage":{"prompt_tokens":30,"total_tokens":49,"completion_tokens":19,"prompt_tokens_details":null},"prompt_logprobs":null,"prompt_token_ids":null,"kv_transfer_params":null}
```

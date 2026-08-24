import { useState } from 'react'
import { generateApiToken } from '../lib/api'
import { Key, Copy, Check, RefreshCw } from 'lucide-react'

const AGENT_EXAMPLE = `import json
import time
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError

BASE_URL = "http://YOUR_SERVER:8080"
API_TOKEN = "YOUR_API_TOKEN"  # généré depuis la page Système → API du front-end


def api_request(path, method="GET", body=None, timeout=120):
    """Envoie une requête HTTP authentifiée."""
    url = f"{BASE_URL}{path}"
    data = json.dumps(body).encode() if body else None
    req = Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {API_TOKEN}",
        "Content-Type": "application/json",
    })
    try:
        with urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except HTTPError as e:
        raise RuntimeError(f"API {method} {path} échec ({e.code}): {e.read().decode()}")


def call_agent(agent_id, message, session_key=None, poll_interval=2.0,
               poll_timeout=300, stable_seconds=15):
    """Envoie un message à l'agent et attend la réponse complète par polling.

    L'agent peut produire plusieurs réponses (entrecoupées d'appels d'outils) ;
    on continue de scruter jusqu'à ce que le nombre de messages reste stable
    pendant stable_seconds secondes, ce qui signale la fin de la réponse.

    Args:
        agent_id:        ID de l'agent (ex. "main")
        message:         message de l'utilisateur
        session_key:     réutilise une session existante (crée une nouvelle session si vide)
        poll_interval:   intervalle de polling (secondes)
        poll_timeout:    durée d'attente maximale (secondes)
        stable_seconds:  durée de stabilité avant de considérer la réponse terminée (secondes)

    Returns:
        Liste de tous les textes de réponse de l'assistant, None en cas de timeout
    """
    if not session_key:
        session_key = f"agent:{agent_id}:session-{int(time.time() * 1000)}"
    encoded_key = session_key.replace(":", "%3A")

    # Nombre de messages avant l'envoi
    try:
        before = api_request(f"/api/openclaw/sessions/{encoded_key}")
        msg_count_before = len(before.get("messages", []))
    except RuntimeError:
        msg_count_before = 0

    # Envoi du message
    result = api_request(
        f"/api/openclaw/sessions/{encoded_key}/messages",
        method="POST",
        body={"message": message},
    )
    print(f"Envoyé, runId={result.get('runId')}")

    # Polling de la réponse (jusqu'à stabilité pendant stable_seconds secondes)
    start = time.time()
    last_count = msg_count_before
    last_change = time.time()
    replies = []

    while time.time() - start < poll_timeout:
        time.sleep(poll_interval)
        try:
            session = api_request(f"/api/openclaw/sessions/{encoded_key}")
        except RuntimeError:
            continue

        messages = session.get("messages", [])
        if len(messages) != last_count:
            last_count = len(messages)
            last_change = time.time()

        if len(messages) > msg_count_before:
            replies = [m.get("content", "") for m in messages[msg_count_before:]
                       if m.get("role") == "assistant"]

        if replies and (time.time() - last_change) >= stable_seconds:
            print(f"Terminé ({time.time() - start:.1f}s)")
            return replies

        sys.stdout.write(f"\\rEn attente de la réponse de l'agent... {int(time.time()-start)}s")
        sys.stdout.flush()

    print(f"\\nTimeout ({poll_timeout}s)")
    return None


# ── Exemple d'utilisation ──────────────────────────────────────────────────────

replies = call_agent(agent_id="main", message="Bonjour, présente-toi")
if replies:
    for i, text in enumerate(replies):
        if len(replies) > 1:
            print(f"--- Réponse {i+1} ---")
        print(text)
else:
    print("Aucune réponse")
`

const CLI_EXAMPLE = `# Appel avec un token API
python call_agent_api.py --api-token "eyJ..." --agent main -m "Bonjour"

# Spécifier l'ID de l'agent
python call_agent_api.py --api-token "eyJ..." --agent insurance -m "Analyse ma proposition d'assurance"

# Réutiliser une session existante (conversation multi-tours)
python call_agent_api.py --api-token "eyJ..." --agent main -m "Continue" --session "agent:main:session-123"

# Utiliser des variables d'environnement
export OPENCLAW_API_TOKEN="eyJ..."
export OPENCLAW_BASE_URL="http://your-server:8080"
python call_agent_api.py --agent main -m "Bonjour"
`

export default function ApiAccess() {
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  async function handleGenerate() {
    setLoading(true)
    try {
      const res = await generateApiToken()
      setToken(res.api_token)
    } catch (e: unknown) {
      alert('Échec de la génération : ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setLoading(false)
    }
  }

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-dark-text">Accès API</h1>
        <p className="mt-1 text-sm text-dark-text-secondary">
          Générez un token API et appelez vos agents via des scripts Python
        </p>
      </div>

      {/* Token Section */}
      <div className="rounded-xl border border-dark-border bg-dark-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Key size={20} className="text-accent-blue" />
          <h2 className="text-lg font-semibold text-dark-text">API Token</h2>
        </div>
        <p className="text-sm text-dark-text-secondary mb-4">
          Le token API est valable 365 jours et permet d'appeler les agents par programme.
        </p>

        {token ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-dark-bg px-4 py-3 text-sm text-green-400 font-mono break-all border border-dark-border">
                {token}
              </code>
              <button
                onClick={() => copyToClipboard(token, 'token')}
                className="shrink-0 rounded-lg bg-dark-bg border border-dark-border px-3 py-3 text-dark-text-secondary hover:text-dark-text transition-colors"
                title="Copier"
              >
                {copied === 'token' ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-yellow-500">Conservez-le précieusement : le token ne s'affiche qu'une seule fois</span>
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="ml-auto flex items-center gap-1.5 text-xs text-dark-text-secondary hover:text-dark-text transition-colors"
              >
                <RefreshCw size={14} />
                Régénérer
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="rounded-lg bg-accent-blue px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-blue/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Génération...' : 'Générer un token API'}
          </button>
        )}
      </div>

      {/* CLI Usage */}
      <div className="rounded-xl border border-dark-border bg-dark-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-dark-text">Appel en ligne de commande</h2>
          <button
            onClick={() => copyToClipboard(CLI_EXAMPLE, 'cli')}
            className="flex items-center gap-1.5 rounded-lg bg-dark-bg border border-dark-border px-3 py-1.5 text-xs text-dark-text-secondary hover:text-dark-text transition-colors"
          >
            {copied === 'cli' ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
            Copier
          </button>
        </div>
        <p className="text-sm text-dark-text-secondary mb-3">
          Le fichier <code className="text-accent-blue">call_agent_api.py</code> à la racine du projet s'utilise directement :
        </p>
        <pre className="rounded-lg bg-dark-bg border border-dark-border p-4 text-sm text-dark-text-secondary font-mono overflow-x-auto leading-relaxed">
          {CLI_EXAMPLE}
        </pre>
      </div>

      {/* Python Example */}
      <div className="rounded-xl border border-dark-border bg-dark-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-dark-text">Exemple d'appel Python</h2>
          <button
            onClick={() => copyToClipboard(AGENT_EXAMPLE, 'agent')}
            className="flex items-center gap-1.5 rounded-lg bg-dark-bg border border-dark-border px-3 py-1.5 text-xs text-dark-text-secondary hover:text-dark-text transition-colors"
          >
            {copied === 'agent' ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
            Copier le code
          </button>
        </div>
        <p className="text-sm text-dark-text-secondary mb-3">
          Envoie un message à un agent et attend la réponse — intégrable dans vos propres projets Python.
        </p>
        <div className="text-xs text-dark-text-secondary mb-2 font-mono">
          Point d'accès : <code className="text-accent-blue">POST /api/openclaw/sessions/:key/messages</code>
          &nbsp;|&nbsp; Authentification : <code className="text-accent-blue">Bearer {'<API_TOKEN>'}</code>
        </div>
        <pre className="rounded-lg bg-dark-bg border border-dark-border p-4 text-sm text-dark-text-secondary font-mono overflow-x-auto max-h-[500px] overflow-y-auto leading-relaxed">
          {AGENT_EXAMPLE}
        </pre>
      </div>
    </div>
  )
}

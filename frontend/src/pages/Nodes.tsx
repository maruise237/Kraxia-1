import { useState, useEffect } from 'react'
import {
  Loader2,
  RefreshCw,
  Monitor,
  Smartphone,
  Server,
  Wifi,
  WifiOff,
  Trash2,
  Check,
  X,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { fetchJSON } from '../lib/api'

interface NodeInfo {
  nodeId: string
  displayName?: string
  platform?: string
  version?: string
  coreVersion?: string
  uiVersion?: string
  remoteIp?: string
  deviceFamily?: string
  modelIdentifier?: string
  caps?: string[]
  commands?: string[]
  permissions?: Record<string, boolean>
  paired?: boolean
  connected?: boolean
  connectedAtMs?: number
}

interface PairedNode {
  nodeId: string
  displayName?: string
  platform?: string
  version?: string
  remoteIp?: string
  permissions?: Record<string, boolean>
  createdAtMs?: number
  approvedAtMs?: number
  lastConnectedAtMs?: number
}

interface PendingRequest {
  requestId: string
  nodeId: string
  displayName?: string
  platform?: string
  version?: string
  remoteIp?: string
  ts: number
}

interface NodesResponse {
  nodes: NodeInfo[]
  pending: PendingRequest[]
  paired: PairedNode[]
}

function getPlatformIcon(platform?: string) {
  const p = (platform || '').toLowerCase()
  if (p.includes('ios') || p.includes('android') || p.includes('iphone') || p.includes('ipad'))
    return <Smartphone size={16} />
  if (p.includes('darwin') || p.includes('macos') || p.includes('mac'))
    return <Monitor size={16} />
  return <Server size={16} />
}

function getPlatformLabel(platform?: string, deviceFamily?: string) {
  const p = (platform || deviceFamily || '').toLowerCase()
  if (p.includes('darwin') || p.includes('macos')) return 'macOS'
  if (p.includes('ios')) return 'iOS'
  if (p.includes('android')) return 'Android'
  if (p.includes('linux')) return 'Linux'
  if (p.includes('win')) return 'Windows'
  return platform || 'Unknown'
}

function timeAgo(ms?: number) {
  if (!ms) return '-'
  const diff = Date.now() - ms
  if (diff < 60_000) return 'à l\'instant'
  if (diff < 3600_000) return `il y a ${Math.floor(diff / 60_000)} min`
  if (diff < 86400_000) return `il y a ${Math.floor(diff / 3600_000)} h`
  return `il y a ${Math.floor(diff / 86400_000)} j`
}

export default function Nodes() {
  const [data, setData] = useState<NodesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [expandedNode, setExpandedNode] = useState<string | null>(null)
  const [nodeDetails, setNodeDetails] = useState<Record<string, unknown> | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await fetchJSON<NodesResponse>('/api/openclaw/nodes')
      setData(result)
    } catch (err: any) {
      setError(err?.message || 'Échec du chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const flash = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(''), 3000)
  }

  const handleApprove = async (requestId: string) => {
    try {
      await fetchJSON('/api/openclaw/nodes/pair/approve', {
        method: 'POST',
        body: JSON.stringify({ requestId }),
      })
      flash('Demande d\'appairage approuvée')
      loadData()
    } catch (err: any) {
      setError(err?.message || 'Échec de l\'opération')
    }
  }

  const handleReject = async (requestId: string) => {
    try {
      await fetchJSON('/api/openclaw/nodes/pair/reject', {
        method: 'POST',
        body: JSON.stringify({ requestId }),
      })
      flash('Demande d\'appairage refusée')
      loadData()
    } catch (err: any) {
      setError(err?.message || 'Échec de l\'opération')
    }
  }

  const handleDelete = async (nodeId: string, name?: string) => {
    if (!confirm(`Confirmer le retrait du nœud "${name || nodeId}" ?`)) return
    try {
      await fetchJSON(`/api/openclaw/nodes/${encodeURIComponent(nodeId)}`, {
        method: 'DELETE',
      })
      flash('Nœud retiré')
      loadData()
    } catch (err: any) {
      setError(err?.message || 'Échec de la suppression')
    }
  }

  const toggleDetail = async (nodeId: string) => {
    if (expandedNode === nodeId) {
      setExpandedNode(null)
      setNodeDetails(null)
      return
    }
    setExpandedNode(nodeId)
    setLoadingDetail(true)
    try {
      const detail = await fetchJSON<Record<string, unknown>>(`/api/openclaw/nodes/${encodeURIComponent(nodeId)}`)
      setNodeDetails(detail)
    } catch {
      setNodeDetails(null)
    } finally {
      setLoadingDetail(false)
    }
  }

  // Merge node.list nodes with paired list to get a complete view
  const mergedNodes: (NodeInfo & { lastConnectedAtMs?: number })[] = []
  if (data) {
    const seenIds = new Set<string>()
    // Connected/live nodes first
    for (const n of data.nodes) {
      seenIds.add(n.nodeId)
      const pairedInfo = data.paired.find(p => p.nodeId === n.nodeId)
      mergedNodes.push({
        ...n,
        lastConnectedAtMs: pairedInfo?.lastConnectedAtMs,
      })
    }
    // Paired but not currently connected
    for (const p of data.paired) {
      if (!seenIds.has(p.nodeId)) {
        mergedNodes.push({
          nodeId: p.nodeId,
          displayName: p.displayName,
          platform: p.platform,
          version: p.version,
          remoteIp: p.remoteIp,
          permissions: p.permissions,
          paired: true,
          connected: false,
          lastConnectedAtMs: p.lastConnectedAtMs,
        })
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="animate-spin text-accent-blue" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-text">Gestion des nœuds</h1>
          <p className="mt-1 text-sm text-dark-text-secondary">
            Gérez les appareils nœuds connectés à la passerelle
          </p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-1.5 rounded-lg border border-dark-border px-3 py-1.5 text-xs text-dark-text-secondary hover:text-dark-text transition-colors"
        >
          <RefreshCw size={14} />
          Rafraîchir
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-accent-red/10 p-3 text-sm text-accent-red flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
          <button onClick={() => setError('')} className="ml-auto"><X size={14} /></button>
        </div>
      )}
      {successMsg && (
        <div className="mb-4 rounded-lg bg-accent-green/10 p-3 text-sm text-accent-green flex items-center gap-2">
          <CheckCircle size={16} />
          {successMsg}
        </div>
      )}

      <div className="space-y-6">
        {/* Pending Pairing Requests */}
        {data && data.pending.length > 0 && (
          <section className="rounded-xl border border-accent-yellow/30 bg-accent-yellow/5 overflow-hidden">
            <div className="px-5 py-3 border-b border-accent-yellow/20 flex items-center gap-2">
              <AlertCircle size={16} className="text-accent-yellow" />
              <h2 className="text-sm font-semibold text-dark-text">Demandes d'appairage en attente</h2>
              <span className="ml-2 rounded-full bg-accent-yellow/20 px-2 py-0.5 text-xs text-accent-yellow font-medium">
                {data.pending.length}
              </span>
            </div>
            <div className="divide-y divide-dark-border">
              {data.pending.map(req => (
                <div key={req.requestId} className="px-5 py-3 flex items-center gap-4">
                  <div className="text-dark-text-secondary">
                    {getPlatformIcon(req.platform)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-dark-text">
                      {req.displayName || req.nodeId.slice(0, 12)}
                    </div>
                    <div className="text-xs text-dark-text-secondary flex gap-3 mt-0.5">
                      <span>{getPlatformLabel(req.platform)}</span>
                      {req.remoteIp && <span>{req.remoteIp}</span>}
                      {req.version && <span>v{req.version}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(req.requestId)}
                      className="flex items-center gap-1 rounded-lg bg-accent-green/15 px-3 py-1.5 text-xs text-accent-green hover:bg-accent-green/25 transition-colors"
                    >
                      <Check size={14} />
                      Approuver
                    </button>
                    <button
                      onClick={() => handleReject(req.requestId)}
                      className="flex items-center gap-1 rounded-lg bg-accent-red/15 px-3 py-1.5 text-xs text-accent-red hover:bg-accent-red/25 transition-colors"
                    >
                      <X size={14} />
                      Refuser
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Node List */}
        <section className="rounded-xl border border-dark-border bg-dark-card overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-border flex items-center gap-2">
            <Monitor size={16} className="text-dark-text-secondary" />
            <h2 className="text-sm font-semibold text-dark-text">Nœuds appairés</h2>
            <span className="ml-2 rounded-full bg-dark-bg px-2 py-0.5 text-xs text-dark-text-secondary font-medium">
              {mergedNodes.length}
            </span>
          </div>

          {mergedNodes.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Server size={32} className="mx-auto mb-3 text-dark-text-secondary/40" />
              <p className="text-sm text-dark-text-secondary">Aucun nœud appairé</p>
              <p className="text-xs text-dark-text-secondary mt-1">
                Exécutez <code className="bg-dark-bg px-1.5 py-0.5 rounded text-accent-blue">openclaw node run --host &lt;gateway-host&gt;</code> sur un autre appareil pour ajouter un nœud
              </p>
            </div>
          ) : (
            <div className="divide-y divide-dark-border">
              {mergedNodes.map(node => (
                <div key={node.nodeId}>
                  <div
                    className="px-5 py-3 flex items-center gap-4 hover:bg-dark-bg/50 cursor-pointer transition-colors"
                    onClick={() => toggleDetail(node.nodeId)}
                  >
                    <div className="text-dark-text-secondary">
                      {getPlatformIcon(node.platform || node.deviceFamily)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-dark-text">
                          {node.displayName || node.nodeId.slice(0, 12)}
                        </span>
                        <span className="flex items-center gap-1">
                          {node.connected ? (
                            <>
                              <Wifi size={12} className="text-accent-green" />
                              <span className="text-xs text-accent-green">En ligne</span>
                            </>
                          ) : (
                            <>
                              <WifiOff size={12} className="text-dark-text-secondary/50" />
                              <span className="text-xs text-dark-text-secondary/50">Hors ligne</span>
                            </>
                          )}
                        </span>
                      </div>
                      <div className="text-xs text-dark-text-secondary flex gap-3 mt-0.5">
                        <span>{getPlatformLabel(node.platform, node.deviceFamily)}</span>
                        {node.remoteIp && <span>{node.remoteIp}</span>}
                        {node.version && <span>v{node.version}</span>}
                        {node.lastConnectedAtMs && !node.connected && (
                          <span>Dernière connexion : {timeAgo(node.lastConnectedAtMs)}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(node.nodeId, node.displayName) }}
                        className="rounded-lg p-1.5 text-dark-text-secondary hover:text-accent-red hover:bg-accent-red/10 transition-colors"
                        title="Retirer le nœud"
                      >
                        <Trash2 size={14} />
                      </button>
                      {expandedNode === node.nodeId ? <ChevronUp size={14} className="text-dark-text-secondary" /> : <ChevronDown size={14} className="text-dark-text-secondary" />}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expandedNode === node.nodeId && (
                    <div className="px-5 pb-4 bg-dark-bg/30">
                      {loadingDetail ? (
                        <div className="py-4 flex justify-center">
                          <Loader2 size={16} className="animate-spin text-accent-blue" />
                        </div>
                      ) : (
                        <div className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-xs pt-2">
                          <span className="text-dark-text-secondary">Node ID</span>
                          <span className="text-dark-text font-mono break-all">{node.nodeId}</span>

                          {node.modelIdentifier && (
                            <>
                              <span className="text-dark-text-secondary">Modèle de l'appareil</span>
                              <span className="text-dark-text">{node.modelIdentifier}</span>
                            </>
                          )}

                          {node.coreVersion && (
                            <>
                              <span className="text-dark-text-secondary">Version Core</span>
                              <span className="text-dark-text">{node.coreVersion}</span>
                            </>
                          )}

                          {node.uiVersion && (
                            <>
                              <span className="text-dark-text-secondary">Version UI</span>
                              <span className="text-dark-text">{node.uiVersion}</span>
                            </>
                          )}

                          {node.caps && node.caps.length > 0 && (
                            <>
                              <span className="text-dark-text-secondary">Capacités</span>
                              <div className="flex flex-wrap gap-1">
                                {node.caps.map(cap => (
                                  <span key={cap} className="rounded bg-dark-bg px-1.5 py-0.5 text-dark-text-secondary border border-dark-border">
                                    {cap}
                                  </span>
                                ))}
                              </div>
                            </>
                          )}

                          {node.commands && node.commands.length > 0 && (
                            <>
                              <span className="text-dark-text-secondary">Commandes</span>
                              <div className="flex flex-wrap gap-1">
                                {node.commands.map(cmd => (
                                  <span key={cmd} className="rounded bg-accent-blue/10 px-1.5 py-0.5 text-accent-blue">
                                    {cmd}
                                  </span>
                                ))}
                              </div>
                            </>
                          )}

                          {node.permissions && Object.keys(node.permissions).length > 0 && (
                            <>
                              <span className="text-dark-text-secondary">Permissions</span>
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(node.permissions).map(([key, granted]) => (
                                  <span
                                    key={key}
                                    className={`rounded px-1.5 py-0.5 ${granted ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-red/10 text-accent-red'}`}
                                  >
                                    {key}={granted ? 'yes' : 'no'}
                                  </span>
                                ))}
                              </div>
                            </>
                          )}

                          {nodeDetails && (
                            <>
                              <span className="text-dark-text-secondary">Données brutes</span>
                              <pre className="rounded bg-dark-bg border border-dark-border p-2 overflow-x-auto text-dark-text-secondary max-h-40">
                                {JSON.stringify(nodeDetails, null, 2)}
                              </pre>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* How to add nodes */}
        <section className="rounded-xl border border-dark-border bg-dark-card overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-border">
            <h2 className="text-sm font-semibold text-dark-text">Comment ajouter des nœuds</h2>
          </div>
          <div className="px-5 py-4 space-y-3 text-sm text-dark-text-secondary">
            <div>
              <p className="font-medium text-dark-text mb-1">Hôte distant</p>
              <code className="block bg-dark-bg rounded-lg px-3 py-2 text-xs text-accent-blue font-mono">
                openclaw node run --host &lt;gateway-host&gt; --port 18789 --display-name "My Node"
              </code>
            </div>
            <div>
              <p className="font-medium text-dark-text mb-1">Application barre de menus macOS</p>
              <p className="text-xs">Activez le mode Nœud dans l'application de barre de menus OpenClaw ; elle se connectera automatiquement à la passerelle</p>
            </div>
            <div>
              <p className="font-medium text-dark-text mb-1">Via un tunnel SSH</p>
              <code className="block bg-dark-bg rounded-lg px-3 py-2 text-xs text-accent-blue font-mono whitespace-pre-wrap">
{`ssh -N -L 18790:127.0.0.1:18789 user@gateway-host
openclaw node run --host 127.0.0.1 --port 18790`}
              </code>
            </div>
            <p className="text-xs text-dark-text-secondary/70">
              Les nouveaux nœuds apparaîtront dans « Demandes d'appairage en attente » une fois connectés — approuvez-les pour les utiliser
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}

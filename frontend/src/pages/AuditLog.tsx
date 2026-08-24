import { Shield, AlertTriangle, Info, CheckCircle } from 'lucide-react'

const logs = [
  { id: 1, time: '10:32:15', level: 'info', agent: 'Nova-Alpha 01', action: 'Génération du rapport d\'étude de marché terminée', detail: 'Rapport PDF généré et envoyé sur WeChat Work' },
  { id: 2, time: '10:28:03', level: 'warning', agent: 'DevOps-Bot 02', action: 'Utilisation CPU au-dessus du seuil', detail: 'Le CPU du serveur prod-web-03 a atteint 92 %' },
  { id: 3, time: '10:15:47', level: 'info', agent: 'Sales-AI 03', action: 'Génération de la proposition client terminée', detail: 'Proposition personnalisée générée pour le client #A2089' },
  { id: 4, time: '09:50:22', level: 'info', agent: 'Doc-Parser 04', action: 'Analyse du contrat terminée', detail: '23 clauses clés extraites avec succès' },
  { id: 5, time: '09:30:11', level: 'security', agent: 'Security-Guard 05', action: 'Connexion anormale détectée', detail: 'Tentative de connexion depuis une IP inconnue bloquée' },
  { id: 6, time: '09:15:00', level: 'info', agent: 'Système', action: 'Sauvegarde quotidienne des données terminée', detail: 'Taille de la sauvegarde : 2.3 Go' },
  { id: 7, time: '09:00:05', level: 'warning', agent: 'Sales-AI 03', action: 'Latence de réponse au-dessus du seuil', detail: 'Temps de réponse moyen 1,8 s, seuil 1,5 s' },
  { id: 8, time: '08:45:30', level: 'info', agent: 'DevOps-Bot 02', action: 'Déploiement du pipeline réussi', detail: 'v2.3.1 déployée sur l\'environnement staging' },
]

const levelConfig = {
  info: { icon: Info, color: 'text-accent-blue', bg: 'bg-accent-blue/10' },
  warning: { icon: AlertTriangle, color: 'text-accent-yellow', bg: 'bg-accent-yellow/10' },
  security: { icon: Shield, color: 'text-accent-red', bg: 'bg-accent-red/10' },
  success: { icon: CheckCircle, color: 'text-accent-green', bg: 'bg-accent-green/10' },
}

export default function AuditLog() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark-text">Journal d'audit</h1>
        <p className="mt-1 text-sm text-dark-text-secondary">Historique des opérations système et des événements de sécurité</p>
      </div>

      <div className="space-y-2">
        {logs.map(log => {
          const config = levelConfig[log.level as keyof typeof levelConfig] || levelConfig.info
          const Icon = config.icon
          return (
            <div key={log.id} className="flex items-start gap-4 rounded-xl border border-dark-border bg-dark-card p-4 hover:bg-dark-card-hover transition-colors">
              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${config.bg}`}>
                <Icon size={16} className={config.color} />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-dark-text">{log.action}</div>
                  <span className="text-xs text-dark-text-secondary">Aujourd'hui {log.time}</span>
                </div>
                <div className="mt-0.5 text-xs text-dark-text-secondary">{log.detail}</div>
                <div className="mt-1 text-xs text-dark-text-secondary/70">Source : {log.agent}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

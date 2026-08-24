import { useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  Bot,
  Compass,
  FileText,
  Globe2,
  PenLine,
} from 'lucide-react'
import AgentCreatePanel from '../components/AgentCreatePanel.tsx'
import type { AgentInfo } from '../lib/api.ts'
import type { LayoutOutletContext } from '../components/Layout.tsx'

const builtInAgentIds = new Set([
  'main',
  'manager',
  'programmer',
  'researcher',
  'hr',
  'doctor',
])

const agentMeta: Record<string, { description: string; icon: typeof Bot }> = {
  main: {
    description: 'Point d\'entrée de conversation par défaut, pour les tâches générales et la collaboration quotidienne',
    icon: Bot,
  },
  manager: {
    description: 'Décompose les tâches, distribue des sous-agents et fait progresser les objectifs complexes',
    icon: Compass,
  },
  programmer: {
    description: 'Traite le code, l\'implémentation technique, le débogage et les solutions d\'ingénierie',
    icon: FileText,
  },
  researcher: {
    description: 'Étudie les informations publiques, filtre les sources et synthétise les conclusions',
    icon: Compass,
  },
  hr: {
    description: 'Gère le recrutement, les processus RH et la communication avec les candidats',
    icon: PenLine,
  },
  doctor: {
    description: 'Agent d\'assistance spécialisé pour les consultations médicales',
    icon: Globe2,
  },
}

function getAgentName(agent: AgentInfo): string {
  return agent.identity?.name || agent.name || agent.id
}

function AgentCardSkeleton() {
  return (
    <div className="workspace-card flex min-h-[86px] items-center gap-4 rounded-lg border border-light-border bg-light-card-hover px-5 py-4">
      <span className="skeleton-shimmer h-8 w-8 shrink-0 rounded-xl" />
      <span className="min-w-0 flex-1 space-y-2">
        <span className="skeleton-shimmer block h-4 w-2/3 rounded-full" />
        <span className="skeleton-shimmer block h-3 w-full rounded-full" />
      </span>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { agents, agentsLoading, refreshAgents } = useOutletContext<LayoutOutletContext>()
  const [agentPanelOpen, setAgentPanelOpen] = useState(false)

  const builtInAgents = agents.filter(agent => builtInAgentIds.has(agent.id))
  const customAgents = agents.filter(
    agent => !builtInAgentIds.has(agent.id),
  )

  return (
    <div className="h-full overflow-y-auto bg-light-bg">
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-5 py-10 sm:px-8 lg:px-12">
        <section className="flex flex-col gap-5 pt-1 sm:pt-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-[560px]">
            <h1 className="text-[26px] font-bold leading-tight tracking-normal text-light-text sm:text-[32px]">
              Bonjour, je suis votre assistant IA personnel
            </h1>
            <p className="mt-3 text-lg font-semibold leading-7 text-light-text sm:text-xl">
              Je m'appuie sur vos objectifs et votre contexte pour
              <br />
              localiser, organiser et générer du contenu rapidement
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAgentPanelOpen(true)}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-light-border bg-light-card px-4 py-2.5 text-sm font-medium text-light-text transition-colors hover:bg-light-card-hover sm:w-auto"
          >
            <Bot size={17} className="text-accent-blue" />
            Créer un agent dédié
          </button>
        </section>

        <section className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {agentsLoading ? (
            Array.from({ length: 6 }).map((_, index) => <AgentCardSkeleton key={index} />)
          ) : builtInAgents.map(agent => {
            const meta = agentMeta[agent.id] || { description: 'Démarrer une nouvelle conversation d\'agent', icon: Bot }
            const Icon = meta.icon
            return (
            <button
              key={agent.id}
              type="button"
              onClick={() => navigate(`/chat?new=1&agent=${encodeURIComponent(agent.id)}`)}
              className="workspace-card flex min-h-[86px] cursor-pointer items-center gap-4 rounded-lg border border-light-border bg-light-card-hover px-5 py-4 text-left transition-colors hover:bg-light-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-blue"
            >
              <Icon size={32} strokeWidth={2} className="shrink-0 text-accent-blue" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-light-text">{getAgentName(agent)}</span>
                <span className="mt-1 block truncate text-xs text-light-text-secondary">{meta.description}</span>
              </span>
            </button>
            )
          })}
          {!agentsLoading && customAgents.map(agent => (
            <button
              key={agent.id}
              type="button"
              onClick={() => navigate(`/chat?new=1&agent=${encodeURIComponent(agent.id)}`)}
              className="workspace-card flex min-h-[86px] cursor-pointer items-center gap-4 rounded-lg border border-light-border bg-light-card-hover px-5 py-4 text-left transition-colors hover:bg-light-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-blue"
            >
              <FileText size={32} strokeWidth={2} className="shrink-0 text-accent-blue" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-light-text">{getAgentName(agent)}</span>
                <span className="mt-1 block truncate text-xs text-light-text-secondary">Votre assistant réutilisable dédié</span>
              </span>
            </button>
          ))}
        </section>
      </div>
      <AgentCreatePanel
        open={agentPanelOpen}
        onClose={() => setAgentPanelOpen(false)}
        onCreated={async (agentId, displayName) => {
          await refreshAgents({ force: true })
          navigate(
            `/chat?new=1&agent=${encodeURIComponent(agentId)}&createdAgent=${encodeURIComponent(displayName)}`,
          )
        }}
      />
    </div>
  )
}

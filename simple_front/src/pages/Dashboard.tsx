import { useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  ArrowRight,
  Bot,
  CalendarCheck,
  FileText,
  MessageCircle,
  Paperclip,
  Plus,
  Sparkles,
  Users,
} from 'lucide-react'
import AgentCreatePanel from '../components/AgentCreatePanel.tsx'
import type { AgentInfo } from '../lib/api.ts'
import type { LayoutOutletContext } from '../components/Layout.tsx'

const builtInAssistantIds = new Set(['main', 'manager', 'programmer', 'researcher', 'hr', 'doctor'])

const assistantMeta: Record<string, { description: string; icon: typeof Bot }> = {
  main: {
    description: 'Ton assistant du quotidien, disponible pour réfléchir et agir avec toi.',
    icon: Bot,
  },
  manager: {
    description: 'Pour organiser tes priorités, tes projets et ta semaine.',
    icon: CalendarCheck,
  },
  programmer: {
    description: 'Pour t’aider à construire, corriger et comprendre tes outils.',
    icon: Sparkles,
  },
  researcher: {
    description: 'Pour chercher, comparer et résumer les informations utiles.',
    icon: FileText,
  },
  hr: {
    description: 'Pour préparer tes recrutements et tes échanges professionnels.',
    icon: Users,
  },
  doctor: {
    description: 'Pour organiser tes questions et informations de santé.',
    icon: MessageCircle,
  },
}

function getAssistantName(assistant: AgentInfo): string {
  if (assistant.id === 'main') return 'Mon assistant'
  return assistant.identity?.name || assistant.name || 'Mon assistant'
}

function AssistantCardSkeleton() {
  return (
    <div className="flex min-h-[112px] items-center gap-4 rounded-2xl border border-light-border bg-light-card px-5 py-4">
      <span className="skeleton-shimmer h-11 w-11 shrink-0 rounded-2xl" />
      <span className="min-w-0 flex-1 space-y-2">
        <span className="skeleton-shimmer block h-4 w-2/3 rounded-full" />
        <span className="skeleton-shimmer block h-3 w-full rounded-full" />
      </span>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { user, agents, agentsLoading, refreshAgents } = useOutletContext<LayoutOutletContext>()
  const [assistantPanelOpen, setAssistantPanelOpen] = useState(false)

  const builtInAssistants = agents.filter(assistant => builtInAssistantIds.has(assistant.id))
  const customAssistants = agents.filter(assistant => !builtInAssistantIds.has(assistant.id))

  return (
    <div className="h-full overflow-y-auto bg-light-bg">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-5 py-8 sm:px-8 sm:py-12 lg:px-12">
        <section className="relative overflow-hidden rounded-[28px] bg-slate-900 px-6 py-8 text-white shadow-xl shadow-slate-900/10 sm:px-9 sm:py-10">
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="relative max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-cyan-100">
              <Sparkles size={14} />
              Ton espace Kraxia
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Que veux-tu faire aujourd’hui ?
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
              Ton assistant est là pour t’aider à organiser tes idées, avancer dans ton travail et gagner du temps.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => navigate('/chat?new=1')}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-slate-900 transition-transform hover:-translate-y-0.5 hover:bg-cyan-50 active:translate-y-0"
              >
                <MessageCircle size={17} />
                Commencer une discussion
                <ArrowRight size={16} />
              </button>
              <button
                type="button"
                onClick={() => navigate(user?.onboarding_completed ? '/settings' : '/onboarding')}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 text-sm font-medium text-white transition-colors hover:bg-white/15"
              >
                {user?.onboarding_completed ? 'Connecter un canal' : 'Configurer mon espace'}
              </button>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-blue">Actions rapides</p>
              <h2 className="mt-1 text-xl font-semibold text-light-text">Commencer en un instant</h2>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Organiser ma semaine', icon: CalendarCheck },
              { label: 'Répondre à mes clients', icon: MessageCircle },
              { label: 'Préparer un document', icon: FileText },
            ].map(action => {
              const Icon = action.icon
              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => navigate('/chat?new=1')}
                  className="group flex items-center gap-3 rounded-2xl border border-light-border bg-light-card px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-accent-blue/40 hover:shadow-md"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-accent-blue transition-colors group-hover:bg-accent-blue group-hover:text-white">
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-medium text-light-text">{action.label}</span>
                  <ArrowRight size={15} className="text-slate-400 transition-transform group-hover:translate-x-0.5" />
                </button>
              )
            })}
          </div>
        </section>

        <section className="mt-10 pb-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-blue">Ton espace</p>
              <h2 className="mt-1 text-xl font-semibold text-light-text">Mes assistants</h2>
              <p className="mt-1 text-sm text-light-text-secondary">Choisis une aide adaptée à ton besoin, ou reste avec ton assistant principal.</p>
            </div>
            <button
              type="button"
              onClick={() => setAssistantPanelOpen(true)}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-light-border bg-light-card px-3.5 py-2.5 text-sm font-medium text-light-text transition-colors hover:border-accent-blue/40 hover:text-accent-blue"
            >
              <Plus size={16} />
              Ajouter une aide
            </button>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agentsLoading ? (
              Array.from({ length: 6 }).map((_, index) => <AssistantCardSkeleton key={index} />)
            ) : (
              <>
                {builtInAssistants.map(assistant => {
                  const meta = assistantMeta[assistant.id] || { description: 'Une aide adaptée à tes besoins.', icon: Bot }
                  const Icon = meta.icon
                  return (
                    <button
                      key={assistant.id}
                      type="button"
                      onClick={() => navigate(`/chat?new=1&agent=${encodeURIComponent(assistant.id)}`)}
                      className="group flex min-h-[112px] cursor-pointer items-start gap-4 rounded-2xl border border-light-border bg-light-card px-5 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-accent-blue/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-blue"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-accent-blue transition-colors group-hover:bg-accent-blue group-hover:text-white">
                        <Icon size={21} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-light-text">{getAssistantName(assistant)}</span>
                        <span className="mt-1.5 block text-xs leading-5 text-light-text-secondary">{meta.description}</span>
                      </span>
                    </button>
                  )
                })}
                {customAssistants.map(assistant => (
                  <button
                    key={assistant.id}
                    type="button"
                    onClick={() => navigate(`/chat?new=1&agent=${encodeURIComponent(assistant.id)}`)}
                    className="group flex min-h-[112px] cursor-pointer items-start gap-4 rounded-2xl border border-light-border bg-light-card px-5 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-accent-blue/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-blue"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 transition-colors group-hover:bg-amber-500 group-hover:text-white">
                      <Bot size={21} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-light-text">{getAssistantName(assistant)}</span>
                      <span className="mt-1.5 block text-xs leading-5 text-light-text-secondary">Une aide personnalisée que tu peux retrouver à tout moment.</span>
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
        </section>

        <section className="mt-auto grid gap-3 border-t border-light-border pt-5 text-sm sm:grid-cols-2">
          <button
            type="button"
            onClick={() => navigate('/knowledge')}
            className="flex items-center gap-3 rounded-2xl bg-light-card px-4 py-3 text-left text-light-text transition-colors hover:bg-light-card-hover"
          >
            <Paperclip size={17} className="text-accent-blue" />
            <span><strong className="font-medium">Mes documents</strong><span className="ml-1 text-light-text-secondary">— retrouver ce qui compte</span></span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/cron')}
            className="flex items-center gap-3 rounded-2xl bg-light-card px-4 py-3 text-left text-light-text transition-colors hover:bg-light-card-hover"
          >
            <CalendarCheck size={17} className="text-accent-blue" />
            <span><strong className="font-medium">Mes habitudes</strong><span className="ml-1 text-light-text-secondary">— ne plus rien oublier</span></span>
          </button>
        </section>
      </div>

      <AgentCreatePanel
        open={assistantPanelOpen}
        onClose={() => setAssistantPanelOpen(false)}
        onCreated={async (assistantId, displayName) => {
          await refreshAgents({ force: true })
          navigate(`/chat?new=1&agent=${encodeURIComponent(assistantId)}&createdAgent=${encodeURIComponent(displayName)}`)
        }}
      />
    </div>
  )
}

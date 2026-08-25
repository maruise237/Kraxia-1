import { useEffect, useMemo, useState } from 'react'
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Palette,
  ShieldCheck,
  Sun,
  Trash2,
} from 'lucide-react'
import AgentCreatePanel from '../components/AgentCreatePanel.tsx'
import IconButton from '../components/ui/IconButton.tsx'
import Popconfirm from '../components/ui/Popconfirm.tsx'
import { useToast } from '../components/ui/Toast.tsx'
import {
  DEFAULT_APPEARANCE,
  readAppearanceSettings,
  saveAppearanceSettings,
  type AppearanceSettings,
  type ThemeMode,
} from '../lib/appearance.ts'
import {
  deleteAgent,
  getAgentFile,
  listAgents,
  setAgentFile,
  updateAgentName,
  type AgentInfo,
} from '../lib/api.ts'

const tabs = [
  { id: 'appearance', label: 'Apparence', icon: Palette },
  { id: 'agents', label: 'Agents', icon: Bot },
] as const

const accentOptions = [
  { name: 'Bleu sarcelle', value: '#0891b2' },
  { name: 'Bleu', value: '#339cff' },
  { name: 'Vert', value: '#22c55e' },
  { name: 'Violet', value: '#8b5cf6' },
]

const themeOptions: Array<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
  { value: 'system', label: 'Système' },
]

const SYSTEM_AGENT_IDS = new Set([
  'main',
  'manager',
  'programmer',
  'researcher',
  'hr',
  'doctor',
])

function getAgentDisplayName(agent: AgentInfo): string {
  return agent.identity?.name || agent.name || agent.id
}

function isSystemAgent(agent: AgentInfo): boolean {
  return SYSTEM_AGENT_IDS.has(agent.id)
}

function parseIdentityDescription(content: string): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  if (lines[0]?.trim().startsWith('# ')) {
    return lines.slice(1).join('\n').trim()
  }
  return content.trim()
}

function buildIdentityContent(displayName: string, description: string): string {
  const body = description.trim()
  return `# ${displayName.trim()}\n\n${body}${body ? '\n' : ''}`
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-5 border-t border-light-border px-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-light-text">{label}</div>
        {description && <div className="mt-0.5 text-xs text-light-text-secondary">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={`flex h-7 w-12 cursor-pointer items-center rounded-full p-0.5 transition-colors ${
        checked ? 'bg-accent-blue' : 'bg-slate-200'
      }`}
    >
      <span
        className={`h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

function AgentsSettings() {
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState('')
  const [panelLoadingId, setPanelLoadingId] = useState('')
  const [systemOpen, setSystemOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(true)
  const [panel, setPanel] = useState<{
    mode: 'edit' | 'view'
    values: {
      agentId: string
      displayName: string
      description: string
      avatar: string
    }
  } | null>(null)
  const toast = useToast()

  const systemAgents = useMemo(() => agents.filter(isSystemAgent), [agents])
  const customAgents = useMemo(() => agents.filter(agent => !isSystemAgent(agent)), [agents])

  const loadAgents = async () => {
    setLoading(true)
    try {
      const result = await listAgents()
      setAgents(result.agents || [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec du chargement des agents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAgents()
  }, [])

  const openAgentPanel = async (agent: AgentInfo, mode: 'edit' | 'view') => {
    setPanelLoadingId(agent.id)
    try {
      const result = await getAgentFile(agent.id, 'IDENTITY.md')
      setPanel({
        mode,
        values: {
          agentId: agent.id,
          displayName: getAgentDisplayName(agent),
          description: parseIdentityDescription(result.file.content || ''),
          avatar: agent.identity?.avatarUrl || agent.identity?.avatar || '',
        },
      })
    } catch {
      setPanel({
        mode,
        values: {
          agentId: agent.id,
          displayName: getAgentDisplayName(agent),
          description: '',
          avatar: agent.identity?.avatarUrl || agent.identity?.avatar || '',
        },
      })
    } finally {
      setPanelLoadingId('')
    }
  }

  const handleDelete = async (agent: AgentInfo) => {
    if (isSystemAgent(agent)) return
    setDeletingId(agent.id)
    try {
      await deleteAgent(agent.id)
      toast.success(`Agent ${getAgentDisplayName(agent)} supprimé`)
      await loadAgents()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec de la suppression de l\'agent')
    } finally {
      setDeletingId('')
    }
  }

  const renderCustomAgentRow = (agent: AgentInfo) => {
    return (
      <button
        key={agent.id}
        type="button"
        onClick={() => openAgentPanel(agent, 'edit')}
        className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-light-card-hover/70"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-accent-blue/10 text-base text-accent-blue">
          {agent.identity?.avatarUrl ? <img src={agent.identity.avatarUrl} alt="" className="h-full w-full object-cover" /> : <Bot size={18} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-light-text">{getAgentDisplayName(agent)}</span>
        </span>
        {panelLoadingId === agent.id ? (
          <Loader2 size={15} className="shrink-0 animate-spin text-light-text-secondary" />
        ) : (
          <Popconfirm
            title="Supprimer l'agent"
            description={`L'agent « ${getAgentDisplayName(agent)} » et ses fichiers d'espace de travail seront supprimés ; cette action est irréversible.`}
            confirmText="Supprimer"
            danger
            onConfirm={() => handleDelete(agent)}
          >
            <IconButton
              label="Supprimer l'agent"
              disabled={deletingId === agent.id}
              tone="danger"
              onClick={event => event.stopPropagation()}
            >
              {deletingId === agent.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            </IconButton>
          </Popconfirm>
        )}
      </button>
    )
  }

  const renderSystemAgentRow = (agent: AgentInfo) => (
    <button
      key={agent.id}
      type="button"
      onClick={() => openAgentPanel(agent, 'view')}
      className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-light-card-hover/70"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-base text-light-text-secondary">
        {agent.identity?.avatarUrl ? <img src={agent.identity.avatarUrl} alt="" className="h-full w-full object-cover" /> : <Bot size={18} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-light-text">{getAgentDisplayName(agent)}</span>
      </span>
      {panelLoadingId === agent.id ? (
        <Loader2 size={15} className="shrink-0 animate-spin text-light-text-secondary" />
      ) : (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-blue/5 px-2 py-0.5 text-[11px] font-medium text-accent-blue">
          <ShieldCheck size={12} />
          Intégré au système
        </span>
      )}
    </button>
  )

  const renderSectionHeader = (
    label: string,
    count: number,
    open: boolean,
    onToggle: () => void,
  ) => (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-medium text-light-text-secondary transition-colors hover:bg-light-card-hover hover:text-light-text"
    >
      {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      <span className="flex-1">{label}</span>
      <span>{count}</span>
    </button>
  )

  return (
    <div className="mt-8">
      <section className="rounded-xl bg-light-card p-2">
        {loading ? (
          <div className="flex items-center gap-2 px-3 py-4 text-sm text-light-text-secondary">
            <Loader2 size={16} className="animate-spin" />
            Chargement des agents
          </div>
        ) : (
          <>
            <div>
              {renderSectionHeader('Personnalisés', customAgents.length, customOpen, () => setCustomOpen(open => !open))}
              {customOpen && (
                customAgents.length > 0 ? (
                  <div className="space-y-1">{customAgents.map(renderCustomAgentRow)}</div>
                ) : (
                  <div className="px-3 py-5 text-sm text-light-text-secondary">Aucun agent personnalisé</div>
                )
              )}
            </div>

            <div className="mt-5">
              {renderSectionHeader('Intégrés au système', systemAgents.length, systemOpen, () => setSystemOpen(open => !open))}
              {systemOpen && (
                <div className="space-y-1">{systemAgents.map(renderSystemAgentRow)}</div>
              )}
            </div>
          </>
        )}
      </section>

      <AgentCreatePanel
        open={Boolean(panel)}
        mode={panel?.mode}
        initialValues={panel?.values}
        onClose={() => setPanel(null)}
        onSaved={async input => {
          await updateAgentName(input.agentId, input.displayName, input.avatar)
          await setAgentFile(input.agentId, 'IDENTITY.md', buildIdentityContent(input.displayName, input.description))
          toast.success('Agent enregistré')
          await loadAgents()
        }}
      />
    </div>
  )
}

function AppearancePreview({ settings }: { settings: AppearanceSettings }) {
  return (
    <div className="overflow-hidden rounded-xl border border-light-border bg-light-card">
      <div className="flex items-center justify-between border-b border-light-border px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-light-text">Aperçu du thème</div>
          <div className="mt-1 text-xs text-light-text-secondary">Vérifiez le rendu global de la barre latérale, des cartes et de la couleur d'accent</div>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-light-card-hover p-1">
          {themeOptions.map(option => (
            <span
              key={option.value}
              className={`rounded-full px-3 py-1 text-xs ${
                settings.theme === option.value
                  ? 'bg-light-card text-light-text shadow-sm'
                  : 'text-light-text-secondary'
              }`}
            >
              {option.label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid min-h-36 grid-cols-[0.72fr_1fr] text-xs">
        <div className="border-r border-light-border bg-light-sidebar p-3">
          <div className="mb-3 flex items-center gap-2 text-light-text">
            <Bot size={15} className="text-accent-blue" />
            <span className="font-medium">Kraxia</span>
          </div>
          <div className="space-y-1">
            <div className="rounded-lg bg-light-card px-3 py-2 text-light-text shadow-sm">Accueil</div>
            <div className="rounded-lg px-3 py-2 text-light-text-secondary">Paramètres</div>
            <div className="rounded-lg px-3 py-2 text-light-text-secondary">Mes conversations</div>
          </div>
        </div>
        <div className="bg-light-bg p-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-medium text-light-text">Apparence</span>
            <span className="rounded-full bg-accent-blue px-2.5 py-1 text-white">{settings.accent}</span>
          </div>
          <div className="space-y-2">
            <div className="h-9 rounded-lg border border-light-border bg-light-card" />
            <div className="h-9 rounded-lg border border-light-border bg-light-card-hover" />
            <div className="h-2 w-2/3 rounded-full bg-accent-blue" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]['id']>('appearance')
  const [settings, setSettings] = useState<AppearanceSettings>(() => readAppearanceSettings())

  const updateSettings = (patch: Partial<AppearanceSettings>) => {
    setSettings(current => {
      const next = { ...current, ...patch }
      saveAppearanceSettings(next)
      return next
    })
  }

  const activeLabel = useMemo(
    () => tabs.find(tab => tab.id === activeTab)?.label || 'Paramètres',
    [activeTab],
  )

  return (
    <div className="h-full overflow-hidden bg-light-bg">
      <div className="flex h-full">
        <aside className="hidden w-64 shrink-0 border-r border-light-border bg-light-sidebar px-3 py-4 md:block">
          <div className="mb-3 px-2 text-xs font-medium text-light-text-secondary">Paramètres</div>
          <nav className="space-y-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'bg-light-card text-light-text shadow-sm'
                    : 'text-light-text-secondary hover:bg-light-card/70 hover:text-light-text'
                }`}
              >
                <tab.icon size={17} />
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-4xl flex-col px-5 py-8 sm:px-8 lg:py-12">
            <div className="mb-6 flex flex-wrap gap-2 md:hidden">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'bg-light-card-hover text-light-text'
                      : 'text-light-text-secondary hover:bg-light-card-hover hover:text-light-text'
                  }`}
                >
                  <tab.icon size={16} />
                  {tab.label}
                </button>
              ))}
            </div>

            <h1 className="text-2xl font-semibold tracking-normal text-light-text">{activeLabel}</h1>

            {activeTab === 'appearance' ? (
              <div className="mt-8 space-y-4">
                <AppearancePreview settings={settings} />

                <section className="overflow-hidden rounded-xl border border-light-border bg-light-card">
                  <SettingRow label="Thème" description="Clair, sombre, ou selon les préférences du système">
                    <div className="flex rounded-full bg-light-card-hover p-1">
                      {themeOptions.map(option => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => updateSettings({ theme: option.value })}
                          className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
                            settings.theme === option.value
                              ? 'bg-light-card text-light-text shadow-sm'
                              : 'text-light-text-secondary hover:text-light-text'
                          }`}
                        >
                          <Sun size={14} />
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </SettingRow>

                  <SettingRow label="Couleur d'accent" description="Utilisée pour les boutons, le focus et les états clés">
                    <div className="flex items-center gap-2">
                      {accentOptions.map(option => (
                        <button
                          key={option.value}
                          type="button"
                          aria-label={`Choisir ${option.name}`}
                          onClick={() => updateSettings({ accent: option.value })}
                          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-light-border"
                          style={{ backgroundColor: option.value }}
                        >
                          {settings.accent === option.value && <Check size={15} className="text-white" />}
                        </button>
                      ))}
                    </div>
                  </SettingRow>

                  <SettingRow label="Barre latérale translucide" description="Allège la barre latérale tout en conservant le ton cyan clair actuel">
                    <Toggle
                      checked={settings.translucentSidebar}
                      label="Basculer la barre latérale translucide"
                      onChange={checked => updateSettings({ translucentSidebar: checked })}
                    />
                  </SettingRow>

                  <SettingRow label="Densité de l'interface" description="Le mode compact resserre les espacements des cartes et des listes">
                    <div className="flex rounded-full bg-light-card-hover p-1">
                      {[
                        { value: 'comfortable', label: 'Confortable' },
                        { value: 'compact', label: 'Compact' },
                      ].map(option => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => updateSettings({ density: option.value as AppearanceSettings['density'] })}
                          className={`cursor-pointer rounded-full px-3 py-1.5 text-sm transition-colors ${
                            settings.density === option.value
                              ? 'bg-light-card text-light-text shadow-sm'
                              : 'text-light-text-secondary hover:text-light-text'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </SettingRow>

                  <SettingRow label="Contraste" description="Ajuste la netteté du texte et des bordures">
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="35"
                        max="75"
                        value={settings.contrast}
                        onChange={event => updateSettings({ contrast: Number(event.target.value) })}
                        className="w-36 accent-accent-blue"
                        aria-label="Ajuster le contraste"
                      />
                      <span className="w-8 text-right text-sm text-light-text-secondary">{settings.contrast}</span>
                    </div>
                  </SettingRow>
                </section>

                <button
                  type="button"
                  onClick={() => updateSettings(DEFAULT_APPEARANCE)}
                  className="self-start rounded-xl border border-light-border px-4 py-2 text-sm text-light-text-secondary transition-colors hover:bg-light-card-hover hover:text-light-text"
                >
                  Réinitialiser l'apparence par défaut
                </button>
              </div>
            ) : (
              <AgentsSettings />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

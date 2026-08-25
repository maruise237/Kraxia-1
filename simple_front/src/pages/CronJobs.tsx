import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarClock,
  Clock,
  Loader2,
  MessageSquare,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react'
import ClearableInput from '../components/ui/ClearableInput.tsx'
import ClearableTextarea from '../components/ui/ClearableTextarea.tsx'
import IconButton from '../components/ui/IconButton.tsx'
import Popconfirm from '../components/ui/Popconfirm.tsx'
import { useToast } from '../components/ui/Toast.tsx'
import {
  createCronJob,
  deleteCronJob,
  getAccessToken,
  listCronJobs,
  runCronJob,
  toggleCronJob,
  type CronJob,
} from '../lib/api.ts'

type ScheduleType = 'every' | 'cron' | 'once'

const scheduleOptions: Array<{ value: ScheduleType; label: string }> = [
  { value: 'every', label: 'Intervalle fixe' },
  { value: 'cron', label: 'Cron' },
  { value: 'once', label: 'Unique' },
]

function formatTime(ms: number | null): string {
  if (!ms) return '-'
  const date = new Date(ms)
  const now = new Date()
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  if (date.toDateString() === now.toDateString()) return `Aujourd'hui ${time}`
  return `${date.getMonth() + 1}/${date.getDate()} ${time}`
}

function formatEveryMs(ms: number | null): string {
  if (!ms || ms <= 0) return '-'
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `toutes les ${seconds} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `toutes les ${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainMinutes = minutes % 60
  if (hours < 24) {
    return remainMinutes > 0 ? `toutes les ${hours} h ${remainMinutes} min` : `toutes les ${hours} h`
  }
  const days = Math.floor(hours / 24)
  const remainHours = hours % 24
  return remainHours > 0 ? `tous les ${days} j ${remainHours} h` : `tous les ${days} j`
}

function minutesToSeconds(value: string): number {
  return (Number.parseInt(value, 10) || 0) * 60
}

function getScheduleText(job: CronJob): string {
  return job.schedule_display || job.schedule_expr || formatEveryMs(job.schedule_every_ms)
}

function getJobTitle(job: CronJob): string {
  return job.name?.trim() || job.id
}

function openSession(sessionKey: string | null | undefined): void {
  if (!sessionKey) return
  window.location.href = `/chat?session=${encodeURIComponent(sessionKey)}`
}

function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-light-border bg-light-card px-4 py-3" aria-hidden="true">
      <div className="skeleton-shimmer h-3 w-16 rounded-full" />
      <div className="skeleton-shimmer mt-3 h-7 w-10 rounded-lg" />
    </div>
  )
}

function CronJobsSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-light-border bg-light-card" aria-label="Chargement des tâches planifiées">
      <div className="hidden grid-cols-[minmax(220px,1fr)_180px_150px_150px_164px] gap-3 border-b border-light-border bg-light-card-hover px-4 py-3 lg:grid">
        {Array.from({ length: 5 }).map((_, index) => (
          <span key={index} className={`skeleton-shimmer h-3 rounded-full ${index === 0 ? 'w-12' : 'w-16'} ${index === 4 ? 'ml-auto' : ''}`} />
        ))}
      </div>
      <div className="divide-y divide-light-border">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(220px,1fr)_180px_150px_150px_164px] lg:items-center"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="skeleton-shimmer h-4 w-44 max-w-[62%] rounded-full" />
                <span className="skeleton-shimmer h-5 w-11 rounded-full" />
              </div>
              <div className="skeleton-shimmer mt-3 h-3 w-full max-w-md rounded-full" />
            </div>
            <div className="flex items-center gap-2">
              <span className="skeleton-shimmer h-4 w-4 shrink-0 rounded-md" />
              <span className="skeleton-shimmer h-3 w-28 rounded-full" />
            </div>
            <div className="skeleton-shimmer h-3 w-20 rounded-full" />
            <div className="skeleton-shimmer h-3 w-20 rounded-full" />
            <div className="flex items-center justify-end gap-1">
              <span className="skeleton-shimmer h-8 w-8 rounded-lg" />
              <span className="skeleton-shimmer h-8 w-8 rounded-lg" />
              <span className="skeleton-shimmer h-8 w-8 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CreateCronPanel({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (job: CronJob) => void
}) {
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [scheduleType, setScheduleType] = useState<ScheduleType>('every')
  const [everyMinutes, setEveryMinutes] = useState('60')
  const [cronExpr, setCronExpr] = useState('')
  const [atIso, setAtIso] = useState('')
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const everyPreview = useMemo(
    () => formatEveryMs(minutesToSeconds(everyMinutes) * 1000),
    [everyMinutes],
  )

  const handleSubmit = async () => {
    const trimmedName = name.trim()
    const trimmedMessage = message.trim()
    if (!trimmedName) {
      toast.error('Veuillez saisir le nom de la tâche')
      return
    }
    if (!trimmedMessage) {
      toast.error('Veuillez saisir le message de la tâche')
      return
    }

    const params: Parameters<typeof createCronJob>[0] = {
      name: trimmedName,
      message: trimmedMessage,
    }

    if (scheduleType === 'every') {
      const minutes = Number.parseInt(everyMinutes, 10)
      if (!Number.isFinite(minutes) || minutes < 1) {
        toast.error('L\'intervalle en minutes doit être supérieur à 0')
        return
      }
      params.every_seconds = minutes * 60
    }

    if (scheduleType === 'cron') {
      const expr = cronExpr.trim()
      if (!expr) {
        toast.error('Veuillez saisir l\'expression Cron')
        return
      }
      params.cron_expr = expr
    }

    if (scheduleType === 'once') {
      if (!atIso.trim()) {
        toast.error('Veuillez choisir la date d\'exécution')
        return
      }
      const date = new Date(atIso)
      if (Number.isNaN(date.getTime())) {
        toast.error('Format de date d\'exécution invalide')
        return
      }
      params.at_iso = date.toISOString()
    }

    setSaving(true)
    try {
      const job = await createCronJob(params)
      onCreated(job)
      setName('')
      setMessage('')
      setScheduleType('every')
      setEveryMinutes('60')
      setCronExpr('')
      setAtIso('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec de la création')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30 backdrop-blur-[1px]">
      <button type="button" aria-label="Fermer le panneau de création de tâche" className="min-w-0 flex-1" onClick={onClose} />
      <aside className="agent-panel flex h-full w-full max-w-xl flex-col border-l border-light-border bg-light-card shadow-2xl shadow-slate-950/15">
        <header className="flex items-center justify-between border-b border-light-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-light-text">Nouvelle tâche planifiée</h2>
            <p className="mt-1 text-xs text-light-text-secondary">Envoie un message à l'agent à intervalles réguliers</p>
          </div>
          <IconButton label="Fermer le panneau" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="space-y-5">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-light-text-secondary">Nom de la tâche</span>
              <ClearableInput
                value={name}
                onValueChange={setName}
                placeholder="Ex. : rapport quotidien"
                clearLabel="Effacer le nom de la tâche"
                className="h-10 rounded-xl border border-light-border bg-light-card-hover px-3 text-sm text-light-text placeholder:text-light-text-secondary focus:border-accent-blue"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-light-text-secondary">Message de la tâche</span>
              <ClearableTextarea
                value={message}
                onValueChange={setMessage}
                rows={4}
                placeholder="Contenu du message que l'agent recevra..."
                clearLabel="Effacer le message de la tâche"
                className="resize-none rounded-xl border border-light-border bg-light-card-hover px-3 py-2 text-sm leading-6 text-light-text placeholder:text-light-text-secondary focus:border-accent-blue"
              />
              <span className="mt-1 block text-xs text-light-text-secondary">
                Au déclenchement, ce message est envoyé à l'agent comme saisie utilisateur ; le résultat est consigné dans une session ouvrable.
              </span>
            </label>

            <div>
              <div className="mb-2 text-xs font-medium text-light-text-secondary">Mode de planification</div>
              <div className="grid grid-cols-3 gap-2 rounded-xl bg-light-card-hover p-1">
                {scheduleOptions.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setScheduleType(option.value)}
                    className={`cursor-pointer rounded-lg px-3 py-2 text-sm transition-colors ${
                      scheduleType === option.value
                        ? 'bg-light-card text-light-text shadow-sm'
                        : 'text-light-text-secondary hover:text-light-text'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {scheduleType === 'every' && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-light-text-secondary">Intervalle (minutes)</span>
                <ClearableInput
                  type="number"
                  min={1}
                  step={1}
                  value={everyMinutes}
                  onValueChange={setEveryMinutes}
                  placeholder="60"
                  clearLabel="Effacer l'intervalle"
                  className="h-10 rounded-xl border border-light-border bg-light-card-hover px-3 text-sm text-light-text placeholder:text-light-text-secondary focus:border-accent-blue"
                />
                <span className="mt-1 block text-xs text-light-text-secondary">
                  {everyPreview}. Les habitudes sont vérifiées automatiquement ; choisis un intervalle d’au moins une minute.
                </span>
              </label>
            )}

            {scheduleType === 'cron' && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-light-text-secondary">Expression Cron</span>
                <ClearableInput
                  value={cronExpr}
                  onValueChange={setCronExpr}
                  placeholder="0 9 * * *"
                  clearLabel="Effacer l'expression Cron"
                  className="h-10 rounded-xl border border-light-border bg-light-card-hover px-3 font-mono text-sm text-light-text placeholder:text-light-text-secondary focus:border-accent-blue"
                />
                <span className="mt-1 block text-xs text-light-text-secondary">
                  Format : minute heure jour mois jour-semaine — par exemple 0 9 * * * signifie tous les jours à 9h00.
                </span>
              </label>
            )}

            {scheduleType === 'once' && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-light-text-secondary">Date d'exécution</span>
                <ClearableInput
                  type="datetime-local"
                  value={atIso}
                  onValueChange={setAtIso}
                  clearLabel="Effacer la date d'exécution"
                  className="h-10 rounded-xl border border-light-border bg-light-card-hover px-3 text-sm text-light-text focus:border-accent-blue"
                />
              </label>
            )}
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-light-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-xl border border-light-border px-4 py-2 text-sm text-light-text-secondary transition-colors hover:bg-light-card-hover hover:text-light-text"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="flex cursor-pointer items-center gap-2 rounded-xl bg-accent-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            Créer
          </button>
        </footer>
      </aside>
    </div>
  )
}

export default function CronJobs() {
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [runningId, setRunningId] = useState('')
  const [togglingId, setTogglingId] = useState('')
  const [deletingId, setDeletingId] = useState('')
  const toast = useToast()

  const loadJobs = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true)
    try {
      const result = await listCronJobs(true)
      setJobs(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec de la récupération des tâches planifiées')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [toast])

  useEffect(() => {
    void loadJobs(true)
  }, [loadJobs])

  useEffect(() => {
    const token = getAccessToken()
    if (!token) return

    const sse = new EventSource(`/api/openclaw/events/stream?token=${encodeURIComponent(token)}`)
    sse.onmessage = event => {
      try {
        const message = JSON.parse(event.data)
        if (message.event !== 'chat' || message.payload?.state !== 'final') return
        void loadJobs()
      } catch {
        // Ignore keepalive or malformed payloads.
      }
    }
    return () => sse.close()
  }, [loadJobs])

  const enabledCount = useMemo(() => jobs.filter(job => job.enabled).length, [jobs])

  const handleRefresh = () => {
    setRefreshing(true)
    void loadJobs()
  }

  const handleToggle = async (job: CronJob) => {
    setTogglingId(job.id)
    try {
      const updated = await toggleCronJob(job.id, !job.enabled)
      setJobs(current => current.map(item => (item.id === job.id ? updated : item)))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec du changement d\'état')
    } finally {
      setTogglingId('')
    }
  }

  const handleRun = async (job: CronJob) => {
    setRunningId(job.id)
    try {
      await runCronJob(job.id)
      toast.success(`« ${getJobTitle(job)} » déclenchée`)
      await loadJobs()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec de l\'exécution')
    } finally {
      setRunningId('')
    }
  }

  const handleDelete = async (job: CronJob) => {
    setDeletingId(job.id)
    try {
      await deleteCronJob(job.id)
      setJobs(current => current.filter(item => item.id !== job.id))
      toast.success(`« ${getJobTitle(job)} » supprimée`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec de la suppression')
    } finally {
      setDeletingId('')
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-light-bg">
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-5 py-8 sm:px-8 lg:px-12">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-normal text-light-text">Tâches planifiées</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-light-text-secondary">
              Gérez les exécutions automatiques de vos agents. Après chaque exécution, le résultat rejoint la session correspondante et déclenche la notification non lue dans la barre latérale.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <IconButton label="Rafraîchir les tâches planifiées" onClick={handleRefresh} disabled={refreshing} tone="primary">
              <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} />
            </IconButton>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex cursor-pointer items-center gap-2 rounded-xl bg-accent-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-700"
            >
              <Plus size={16} />
              Nouvelle tâche
            </button>
          </div>
        </header>

        <section className="mt-6 grid gap-3 sm:grid-cols-3">
          {loading ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          ) : (
            <>
              <div className="rounded-xl border border-light-border bg-light-card px-4 py-3">
                <div className="text-xs text-light-text-secondary">Toutes les tâches</div>
                <div className="mt-1 text-2xl font-semibold text-light-text">{jobs.length}</div>
              </div>
              <div className="rounded-xl border border-light-border bg-light-card px-4 py-3">
                <div className="text-xs text-light-text-secondary">En cours</div>
                <div className="mt-1 text-2xl font-semibold text-light-text">{enabledCount}</div>
              </div>
              <div className="rounded-xl border border-light-border bg-light-card px-4 py-3">
                <div className="text-xs text-light-text-secondary">Tâches en erreur</div>
                <div className="mt-1 text-2xl font-semibold text-light-text">
                  {jobs.filter(job => job.last_status === 'error').length}
                </div>
              </div>
            </>
          )}
        </section>

        <section className="mt-5 min-h-0 flex-1">
          {loading ? (
            <CronJobsSkeleton />
          ) : jobs.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-light-border bg-light-card px-5 py-12 text-center">
              <Clock size={40} className="text-accent-blue" />
              <div className="mt-4 text-sm font-medium text-light-text">Aucune tâche planifiée</div>
              <div className="mt-1 max-w-sm text-sm leading-6 text-light-text-secondary">
                Créez des tâches à intervalle fixe, Cron ou exécution unique pour que l'agent traite automatiquement des messages aux moments choisis.
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="mt-5 flex cursor-pointer items-center gap-2 rounded-xl bg-accent-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-700"
              >
                <Plus size={16} />
                Créer une première tâche
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-light-border bg-light-card">
              <div className="hidden grid-cols-[minmax(220px,1fr)_180px_150px_150px_164px] gap-3 border-b border-light-border bg-light-card-hover px-4 py-3 text-xs font-medium text-light-text-secondary lg:grid">
                <span>Tâche</span>
                <span>Planification</span>
                <span>Dernière exécution</span>
                <span>Prochaine exécution</span>
                <span className="text-right">Action</span>
              </div>
              <div className="divide-y divide-light-border">
                {jobs.map(job => (
                  <div
                    key={job.id}
                    className="grid gap-3 px-4 py-4 transition-colors hover:bg-light-card-hover/55 lg:grid-cols-[minmax(220px,1fr)_180px_150px_150px_164px] lg:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`truncate text-sm font-medium ${
                            job.enabled ? 'text-light-text' : 'text-light-text-secondary line-through'
                          }`}
                          title={getJobTitle(job)}
                        >
                          {getJobTitle(job)}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            job.enabled ? 'bg-accent-green/10 text-green-700' : 'bg-slate-100 text-light-text-secondary'
                          }`}
                        >
                          {job.enabled ? 'Active' : 'Désactivée'}
                        </span>
                        {job.last_status === 'error' && (
                          <span className="shrink-0 rounded-full bg-accent-red/10 px-2 py-0.5 text-[11px] font-medium text-accent-red">
                            Erreur
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-light-text-secondary" title={job.message}>
                        {job.message}
                      </p>
                      {job.last_output && (
                        <button
                          type="button"
                          onClick={() => openSession(job.session_key)}
                          className="mt-1 max-w-full truncate text-left text-xs text-accent-blue hover:underline"
                          title={job.last_output}
                        >
                          Dernier résultat : {job.last_output}
                        </button>
                      )}
                      {job.last_error && (
                        <p className="mt-1 truncate text-xs text-accent-red" title={job.last_error}>
                          {job.last_error}
                        </p>
                      )}
                      {job.last_delivery_error && (
                        <p className="mt-1 truncate text-xs text-amber-700" title={job.last_delivery_error}>
                          Remarque de livraison : {job.last_delivery_error}
                        </p>
                      )}
                    </div>

                    <div className="flex min-w-0 items-center gap-2 text-xs text-light-text-secondary">
                      <CalendarClock size={15} className="shrink-0 text-accent-blue" />
                      <span className="truncate" title={getScheduleText(job)}>{getScheduleText(job)}</span>
                    </div>
                    <div className="text-xs text-light-text-secondary">
                      <span className="lg:hidden">Dernière :</span>
                      {formatTime(job.last_run_at_ms)}
                    </div>
                    <div className="text-xs text-light-text-secondary">
                      <span className="lg:hidden">Prochaine :</span>
                      {formatTime(job.next_run_at_ms)}
                    </div>

                    <div className="flex items-center justify-end gap-1">
                      <IconButton
                        label={job.enabled ? 'Désactiver la tâche' : 'Activer la tâche'}
                        onClick={() => void handleToggle(job)}
                        disabled={togglingId === job.id}
                      >
                        {togglingId === job.id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : job.enabled ? (
                          <Pause size={16} />
                        ) : (
                          <Play size={16} />
                        )}
                      </IconButton>
                      <IconButton
                        label="Exécuter maintenant"
                        tone="primary"
                        onClick={() => void handleRun(job)}
                        disabled={runningId === job.id || !job.enabled}
                      >
                        {runningId === job.id ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                      </IconButton>
                      {job.session_key && (
                        <IconButton label="Ouvrir la session de résultat" onClick={() => openSession(job.session_key)}>
                          <MessageSquare size={16} />
                        </IconButton>
                      )}
                      <Popconfirm
                        title="Supprimer cette tâche planifiée ?"
                        description={`« ${getJobTitle(job)} » sera supprimée ; cette action est irréversible.`}
                        confirmText="Supprimer"
                        danger
                        onConfirm={() => handleDelete(job)}
                      >
                        <IconButton label="Supprimer la tâche" tone="danger" disabled={deletingId === job.id}>
                          {deletingId === job.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                        </IconButton>
                      </Popconfirm>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      <CreateCronPanel
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={job => {
          setJobs(current => [...current, job])
          toast.success(`« ${getJobTitle(job)} » créée ; le résultat apparaîtra dans la session correspondante`)
          setCreateOpen(false)
        }}
      />
    </div>
  )
}

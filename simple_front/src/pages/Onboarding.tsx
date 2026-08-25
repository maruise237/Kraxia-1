import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, MessageCircle, Sparkles } from 'lucide-react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { updatePreferences } from '../lib/api.ts'
import type { LayoutOutletContext } from '../components/Layout.tsx'

const channels = [
  { id: 'whatsapp', label: 'WhatsApp', description: 'Recevoir de l’aide dans tes échanges quotidiens.' },
  { id: 'telegram', label: 'Telegram', description: 'Garder un accès rapide et privé à ton assistant.' },
  { id: 'discord', label: 'Discord', description: 'Travailler avec ton équipe et tes communautés.' },
]

const tones = [
  { id: 'simple', label: 'Simple et direct', description: 'Des réponses claires, sans jargon.' },
  { id: 'professional', label: 'Professionnel', description: 'Un ton structuré pour ton activité.' },
  { id: 'friendly', label: 'Chaleureux', description: 'Une conversation naturelle et encourageante.' },
]

export default function Onboarding() {
  const navigate = useNavigate()
  const { user } = useOutletContext<LayoutOutletContext>()
  const [step, setStep] = useState(0)
  const [goal, setGoal] = useState(user?.assistant_goal || '')
  const [tone, setTone] = useState(user?.preferred_tone || 'simple')
  const [language, setLanguage] = useState(user?.preferred_language || 'fr')
  const [selectedChannels, setSelectedChannels] = useState<string[]>(user?.preferred_channels || [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canContinue = useMemo(() => {
    if (step === 0) return goal.trim().length >= 3
    return true
  }, [goal, step])

  const toggleChannel = (id: string) => {
    setSelectedChannels(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }

  const finish = async () => {
    setSaving(true)
    setError('')
    try {
      await updatePreferences({
        assistant_goal: goal.trim(),
        preferred_language: language,
        preferred_tone: tone,
        preferred_channels: selectedChannels,
      })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’enregistrer ton espace pour le moment.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-full overflow-y-auto bg-light-bg px-5 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-3xl flex-col justify-center">
        <div className="mb-8 flex items-center justify-between">
          <button type="button" onClick={() => navigate('/dashboard')} className="text-sm text-light-text-secondary transition-colors hover:text-light-text">
            Passer pour l’instant
          </button>
          <div className="flex items-center gap-2 text-sm font-semibold text-light-text"><Sparkles size={17} className="text-accent-blue" /> Kraxia</div>
        </div>

        <section className="rounded-[28px] border border-light-border bg-light-card p-6 shadow-xl shadow-slate-900/5 sm:p-10">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent-blue">
            <span>Étape {step + 1} sur 3</span>
            <span className="h-px flex-1 bg-light-border" />
          </div>

          {step === 0 && (
            <div className="mt-8">
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-accent-blue"><MessageCircle size={25} /></div>
              <h1 className="text-3xl font-semibold tracking-tight text-light-text">Qu’aimerais-tu améliorer ?</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-light-text-secondary">Dis-nous ce que tu veux accomplir. Kraxia s’en servira pour te proposer une aide vraiment utile.</p>
              <label className="mt-8 block text-sm font-medium text-light-text" htmlFor="assistant-goal">Mon objectif principal</label>
              <textarea
                id="assistant-goal"
                value={goal}
                onChange={event => setGoal(event.target.value)}
                placeholder="Exemple : mieux organiser mes clients, préparer mes réponses et ne plus oublier mes rendez-vous."
                rows={5}
                autoFocus
                className="mt-2 w-full resize-none rounded-2xl border border-light-border bg-light-bg px-4 py-3 text-sm leading-6 text-light-text outline-none transition-colors placeholder:text-light-text-secondary focus:border-accent-blue/60 focus:ring-4 focus:ring-accent-blue/10"
              />
            </div>
          )}

          {step === 1 && (
            <div className="mt-8">
              <h1 className="text-3xl font-semibold tracking-tight text-light-text">Comment veux-tu échanger ?</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-light-text-secondary">Ces préférences peuvent être modifiées plus tard. Elles servent simplement à adapter ton expérience.</p>
              <div className="mt-8">
                <p className="text-sm font-medium text-light-text">Langue préférée</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {[['fr', 'Français'], ['en', 'English']].map(([id, label]) => (
                    <button key={id} type="button" onClick={() => setLanguage(id)} className={`rounded-xl border px-4 py-3 text-sm transition-colors ${language === id ? 'border-accent-blue bg-blue-50 font-medium text-accent-blue' : 'border-light-border text-light-text-secondary hover:border-accent-blue/40'}`}>{label}</button>
                  ))}
                </div>
              </div>
              <div className="mt-8">
                <p className="text-sm font-medium text-light-text">Ton assistant doit être…</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {tones.map(option => (
                    <button key={option.id} type="button" onClick={() => setTone(option.id)} className={`rounded-2xl border p-4 text-left transition-all ${tone === option.id ? 'border-accent-blue bg-blue-50 shadow-sm' : 'border-light-border hover:border-accent-blue/40'}`}>
                      <span className="block text-sm font-medium text-light-text">{option.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-light-text-secondary">{option.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="mt-8">
              <h1 className="text-3xl font-semibold tracking-tight text-light-text">Où veux-tu retrouver Kraxia ?</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-light-text-secondary">Choisis les endroits qui te conviennent. Tu pourras les connecter quand tu seras prêt.</p>
              <div className="mt-8 space-y-3">
                {channels.map(channel => {
                  const selected = selectedChannels.includes(channel.id)
                  return (
                    <button key={channel.id} type="button" onClick={() => toggleChannel(channel.id)} className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-all ${selected ? 'border-accent-blue bg-blue-50' : 'border-light-border hover:border-accent-blue/40'}`}>
                      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${selected ? 'bg-accent-blue text-white' : 'bg-light-bg text-accent-blue'}`}><MessageCircle size={20} /></span>
                      <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-light-text">{channel.label}</span><span className="mt-1 block text-xs text-light-text-secondary">{channel.description}</span></span>
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${selected ? 'border-accent-blue bg-accent-blue text-white' : 'border-light-border text-transparent'}`}><Check size={14} /></span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {error && <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

          <div className="mt-10 flex items-center justify-between gap-3 border-t border-light-border pt-6">
            <button type="button" disabled={step === 0 || saving} onClick={() => setStep(current => current - 1)} className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-light-text-secondary transition-colors hover:bg-light-bg hover:text-light-text disabled:invisible"><ArrowLeft size={16} /> Retour</button>
            {step < 2 ? (
              <button type="button" disabled={!canContinue} onClick={() => setStep(current => current + 1)} className="inline-flex items-center gap-2 rounded-xl bg-accent-blue px-5 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">Continuer <ArrowRight size={16} /></button>
            ) : (
              <button type="button" disabled={saving || !canContinue} onClick={() => void finish()} className="inline-flex items-center gap-2 rounded-xl bg-accent-blue px-5 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Enregistrement…' : 'Terminer mon espace'} <Check size={16} /></button>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

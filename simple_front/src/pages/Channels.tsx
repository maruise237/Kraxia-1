import { useEffect, useState } from 'react'
import { Check, Link2, Loader2, MessageCircle, ShieldCheck, Trash2 } from 'lucide-react'
import { connectChannel, disconnectChannel, listChannels, type ChannelConnectionInfo } from '../lib/api.ts'

const channelCopy: Record<string, { title: string; description: string; placeholder: string }> = {
  whatsapp: { title: 'WhatsApp', description: 'Retrouve ton assistant dans tes échanges du quotidien.', placeholder: 'Colle ici ton identifiant de connexion WhatsApp' },
  telegram: { title: 'Telegram', description: 'Discute avec ton assistant depuis Telegram.', placeholder: 'Colle ici le token de ton bot Telegram' },
  discord: { title: 'Discord', description: 'Donne à ton assistant une place dans ton espace Discord.', placeholder: 'Colle ici le token de ton bot Discord' },
}

export default function Channels() {
  const [items, setItems] = useState<ChannelConnectionInfo[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  const refresh = async () => {
    setLoading(true)
    try {
      const result = await listChannels()
      setItems(result.channels)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Impossible de charger tes canaux.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  const save = async (channel: string) => {
    const value = values[channel]?.trim()
    if (!value) return
    setSaving(channel)
    setNotice('')
    try {
      await connectChannel(channel, { display_name: channelCopy[channel].title, credentials: { token: value } })
      setValues(current => ({ ...current, [channel]: '' }))
      setNotice(`${channelCopy[channel].title} est maintenant configuré.`)
      await refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Impossible de connecter ce canal.')
    } finally {
      setSaving(null)
    }
  }

  const remove = async (channel: string) => {
    setSaving(channel)
    setNotice('')
    try {
      await disconnectChannel(channel)
      setNotice(`${channelCopy[channel].title} a été déconnecté.`)
      await refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Impossible de déconnecter ce canal.')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-light-bg">
      <div className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8 sm:py-12 lg:px-12">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-blue">Présence de Kraxia</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-light-text">Mes canaux</h1>
          <p className="mt-3 text-sm leading-6 text-light-text-secondary">Connecte Kraxia aux endroits où tu échanges déjà. Tu peux modifier ou retirer une connexion à tout moment.</p>
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
          <ShieldCheck size={19} className="mt-0.5 shrink-0" />
          <p>Les informations de connexion sont protégées et ne sont jamais réaffichées après leur enregistrement.</p>
        </div>

        {notice && <p className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-sm text-accent-blue">{notice}</p>}

        <div className="mt-8 space-y-4">
          {loading ? <div className="flex items-center gap-2 text-sm text-light-text-secondary"><Loader2 size={16} className="animate-spin" /> Chargement de tes canaux…</div> : items.map(item => {
            const copy = channelCopy[item.channel]
            if (!copy) return null
            const connected = item.status !== 'not_connected'
            return (
              <section key={item.channel} className="rounded-2xl border border-light-border bg-light-card p-5 shadow-sm sm:p-6">
                <div className="flex items-start gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-accent-blue"><MessageCircle size={21} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-light-text">{copy.title}</h2>
                      {connected && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700"><Check size={12} /> Connecté</span>}
                    </div>
                    <p className="mt-1 text-sm text-light-text-secondary">{copy.description}</p>
                  </div>
                </div>
                {connected ? (
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-light-bg px-3.5 py-3">
                    <span className="text-sm text-light-text-secondary">Connexion protégée enregistrée</span>
                    <button type="button" onClick={() => void remove(item.channel)} disabled={saving === item.channel} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"><Trash2 size={15} /> Déconnecter</button>
                  </div>
                ) : (
                  <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                    <input type="password" value={values[item.channel] || ''} onChange={event => setValues(current => ({ ...current, [item.channel]: event.target.value }))} placeholder={copy.placeholder} className="min-h-11 min-w-0 flex-1 rounded-xl border border-light-border bg-light-bg px-3.5 text-sm text-light-text outline-none transition-colors placeholder:text-light-text-secondary focus:border-accent-blue/60 focus:ring-4 focus:ring-accent-blue/10" />
                    <button type="button" onClick={() => void save(item.channel)} disabled={saving === item.channel || !values[item.channel]?.trim()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent-blue px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">{saving === item.channel ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />} Connecter</button>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}

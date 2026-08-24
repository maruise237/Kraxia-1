/**
 * FileDownloadPlugin — plugin autonome qui détecte les chemins de fichiers dans le rendu Markdown
 * et les transforme en cartes de fichiers téléchargeables.
 * Les fichiers de type image sont prévisualisés directement en ligne.
 *
 * Utilisation :
 *   import { fileDownloadLinkRenderer, remarkFileLinks } from './FileDownloadPlugin'
 *   // Ajouter remarkFileLinks aux remarkPlugins de ReactMarkdown
 *   // Dans les components de ReactMarkdown : a: fileDownloadLinkRenderer
 *
 * Règles de détection :
 *   - Chemins préfixés par workspace/ ou ~/.openclaw/ → téléchargement via filemanager/download
 *   - Chemins absolus (ex. /root/.agent-browser/tmp/xxx.png) → téléchargement/aperçu via filemanager/serve
 *   - Les chemins en texte brut sont automatiquement convertis en liens par le plugin remark remarkFileLinks
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { Download, FileText, FileSpreadsheet, FileImage, File, Loader2, ZoomIn, ZoomOut, X, RotateCcw } from 'lucide-react'
import { getAccessToken } from '../lib/api'

// ---------------------------------------------------------------------------
// Détection des chemins
// ---------------------------------------------------------------------------

/** Extensions de fichiers courantes */
const FILE_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx',
  'txt', 'md', 'json', 'xml', 'yaml', 'yml', 'toml',
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp',
  'zip', 'tar', 'gz', 'rar', '7z',
  'mp3', 'wav', 'mp4', 'avi', 'mov',
  'py', 'js', 'ts', 'html', 'css',
])

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'])

/** Correspond aux chemins relatifs sous .openclaw (workspace, media, etc.) */
const OPENCLAW_PATH_RE =
  /(?:(?:\/[\w.-]+)*\/\.openclaw\/|~\/\.openclaw\/)?(?:workspace(?:-[\w-]+)?|media(?:\/[\w.-]+)*)\/\S+\.\w{1,10}/

/** Correspond aux chemins absolus (commençant par / ou ~, avec extension, ex. /tmp/file.png ou ~/docs/file.pdf) */
const ABSOLUTE_PATH_RE =
  /~?(?:\/[\w._-]+)+\/[\w.\-\u4e00-\u9fff]+\.\w{1,10}/

/** Détermine si un href est un chemin de fichier téléchargeable */
export function isFilePath(href: string): boolean {
  if (!href) return false
  if (/^https?:\/\//i.test(href)) return false
  // ReactMarkdown encode en URL certains caractères — décode avant de matcher
  let decoded = href
  try { decoded = decodeURIComponent(href) } catch { /* keep original */ }
  // Chemin workspace
  if (OPENCLAW_PATH_RE.test(decoded)) return true
  // Chemin absolu avec extension connue
  if (ABSOLUTE_PATH_RE.test(decoded)) {
    const ext = getExt(decoded)
    return FILE_EXTENSIONS.has(ext)
  }
  return false
}

/** Détermine si le chemin est sous .openclaw (API download) ou absolu (API serve) */
function isOpenclawPath(href: string): boolean {
  let decoded = href
  try { decoded = decodeURIComponent(href) } catch { /* keep original */ }
  return OPENCLAW_PATH_RE.test(decoded)
}

/**
 * Extrait le chemin relatif (par rapport à ~/.openclaw/) pour l'API download.
 * Prend en charge les sous-répertoires workspace/... et media/... etc.
 */
function toDownloadPath(href: string): string {
  let decoded = href
  try {
    let prev = ''
    while (decoded !== prev && decoded.includes('%')) {
      prev = decoded
      decoded = decodeURIComponent(decoded)
    }
  } catch { /* ignore */ }
  const match = decoded.match(/(?:workspace(?:-[\w-]+)?|media(?:\/[\w.-]+)*)\/\S+/)
  return match ? match[0] : decoded
}

/**
 * Décode le chemin, en gérant les encodages URL multiples
 */
function decodePath(href: string): string {
  let decoded = href
  try {
    let prev = ''
    while (decoded !== prev && decoded.includes('%')) {
      prev = decoded
      decoded = decodeURIComponent(decoded)
    }
  } catch { /* ignore */ }
  return decoded
}

/** Récupère l'extension depuis un nom de fichier */
function getExt(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : ''
}

/** Choisit l'icône selon l'extension */
function FileIcon({ ext }: { ext: string }) {
  if (['xls', 'xlsx', 'csv'].includes(ext))
    return <FileSpreadsheet size={18} className="text-green-400" />
  if (IMAGE_EXTENSIONS.has(ext))
    return <FileImage size={18} className="text-purple-400" />
  if (['doc', 'docx', 'pdf', 'txt', 'md'].includes(ext))
    return <FileText size={18} className="text-blue-400" />
  return <File size={18} className="text-gray-400" />
}

/** Construit l'URL de téléchargement/aperçu */
function buildFileUrl(href: string, inline?: boolean): string {
  if (isOpenclawPath(href)) {
    const cleanPath = toDownloadPath(href)
    return `/api/openclaw/filemanager/download?path=${encodeURIComponent(cleanPath)}`
  }
  // Chemin absolu → API serve
  const decoded = decodePath(href)
  let url = `/api/openclaw/filemanager/serve?path=${encodeURIComponent(decoded)}`
  if (inline) url += '&inline=1'
  return url
}

// ---------------------------------------------------------------------------
// Composant lightbox d'image (plein écran, zoom, glisser)
// ---------------------------------------------------------------------------

const MIN_SCALE = 0.5
const MAX_SCALE = 5
const ZOOM_STEP = 0.3

function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const offsetStart = useRef({ x: 0, y: 0 })
  const offsetRef = useRef({ x: 0, y: 0 })

  const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation()
    setScale(prev => clampScale(prev + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)))
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    dragging.current = true
    dragStart.current = { x: e.clientX, y: e.clientY }
    offsetStart.current = { ...offsetRef.current }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    const next = {
      x: offsetStart.current.x + e.clientX - dragStart.current.x,
      y: offsetStart.current.y + e.clientY - dragStart.current.y,
    }
    offsetRef.current = next
    setOffset(next)
  }, [])

  const handlePointerUp = useCallback(() => { dragging.current = false }, [])

  const resetView = useCallback(() => {
    const zero = { x: 0, y: 0 }
    offsetRef.current = zero
    setScale(1)
    setOffset(zero)
  }, [])

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Prevent body scroll while lightbox is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Toolbar */}
      <div className="absolute top-4 right-4 flex items-center gap-1 z-10">
        <button onClick={() => setScale(s => clampScale(s + ZOOM_STEP))}
          className="p-2 rounded-lg bg-dark-bg/80 text-dark-text hover:text-accent-blue transition-colors" title="Zoom avant">
          <ZoomIn size={18} />
        </button>
        <button onClick={() => setScale(s => clampScale(s - ZOOM_STEP))}
          className="p-2 rounded-lg bg-dark-bg/80 text-dark-text hover:text-accent-blue transition-colors" title="Zoom arrière">
          <ZoomOut size={18} />
        </button>
        <button onClick={resetView}
          className="p-2 rounded-lg bg-dark-bg/80 text-dark-text hover:text-accent-blue transition-colors" title="Réinitialiser">
          <RotateCcw size={18} />
        </button>
        <button onClick={onClose}
          className="p-2 rounded-lg bg-dark-bg/80 text-dark-text hover:text-accent-red transition-colors" title="Fermer">
          <X size={18} />
        </button>
      </div>
      {/* Scale indicator */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-dark-text-secondary bg-dark-bg/80 px-3 py-1 rounded-full">
        {Math.round(scale * 100)}%
      </div>
      {/* Image */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="select-none"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          cursor: dragging.current ? 'grabbing' : 'grab',
          maxWidth: '90vw',
          maxHeight: '90vh',
          objectFit: 'contain',
        }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Composant d'aperçu d'image
// ---------------------------------------------------------------------------

function ImagePreviewCard({ href, children }: { href: string; children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const decoded = decodePath(href)
  let filename = decoded.split('/').pop() || decoded
  try { filename = decodeURIComponent(filename) } catch { /* ignore */ }
  const ext = getExt(filename)

  const token = getAccessToken()
  const previewUrl = buildFileUrl(href, true) + (token ? `&token=${encodeURIComponent(token)}` : '')

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (downloading) return
    setDownloading(true)
    try {
      const url = buildFileUrl(href)
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(url, { headers })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl)
        document.body.removeChild(a)
      }, 1000)
    } catch {
      // fallback: open in new tab
      window.open(previewUrl, '_blank')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="my-2 rounded-lg border border-dark-border bg-dark-bg/60 overflow-hidden inline-block max-w-md">
      {!error && (
        <div className="relative">
          {loading && (
            <div className="flex items-center justify-center py-8 px-12">
              <Loader2 size={20} className="animate-spin text-accent-blue" />
            </div>
          )}
          <img
            src={previewUrl}
            alt={filename}
            className={`max-w-full max-h-[300px] object-contain cursor-zoom-in ${loading ? 'hidden' : 'block'}`}
            onClick={() => setLightboxOpen(true)}
            onLoad={() => setLoading(false)}
            onError={() => { setLoading(false); setError(true) }}
          />
        </div>
      )}
      <button
        onClick={handleDownload}
        disabled={downloading}
        className="flex items-center gap-2 w-full px-3 py-2 border-t border-dark-border hover:bg-dark-bg hover:border-accent-blue/40 transition-all cursor-pointer group disabled:opacity-60"
        title={decoded}
      >
        <FileIcon ext={ext} />
        <span className="text-xs text-dark-text group-hover:text-accent-blue transition-colors truncate max-w-[200px]" title={decoded}>
          {typeof children === 'string' ? children : filename}
        </span>
        {downloading ? (
          <Loader2 size={14} className="ml-auto animate-spin text-accent-blue shrink-0" />
        ) : (
          <Download size={14} className="ml-auto text-dark-text-secondary group-hover:text-accent-blue transition-colors shrink-0" />
        )}
      </button>
      {lightboxOpen && <ImageLightbox src={previewUrl} alt={filename} onClose={() => setLightboxOpen(false)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Composant carte de téléchargement
// ---------------------------------------------------------------------------

function FileDownloadCard({ href, children }: { href: string; children: React.ReactNode }) {
  const [downloading, setDownloading] = useState(false)
  const [dlError, setDlError] = useState('')
  const decoded = decodePath(href)
  let filename = decoded.split('/').pop() || decoded
  try { filename = decodeURIComponent(filename) } catch { /* ignore */ }
  const ext = getExt(filename)

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (downloading) return

    setDownloading(true)
    setDlError('')
    try {
      const token = getAccessToken()
      const url = buildFileUrl(href)
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch(url, { headers })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(detail || `HTTP ${res.status}`)
      }

      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl)
        document.body.removeChild(a)
      }, 1000)
    } catch (err: any) {
      console.error('Échec du téléchargement du fichier :', err)
      setDlError('Échec du téléchargement')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      title={decoded}
      className="inline-flex items-center gap-2 my-1 px-3 py-2 rounded-lg border border-dark-border bg-dark-bg/60 hover:bg-dark-bg hover:border-accent-blue/40 transition-all cursor-pointer group disabled:opacity-60"
    >
      <FileIcon ext={ext} />
      <span className="text-xs text-dark-text group-hover:text-accent-blue transition-colors truncate max-w-[200px]">
        {typeof children === 'string' ? children : filename}
      </span>
      {downloading ? (
        <Loader2 size={14} className="animate-spin text-accent-blue shrink-0" />
      ) : dlError ? (
        <span className="text-[10px] text-accent-red shrink-0">{dlError}</span>
      ) : (
        <Download size={14} className="text-dark-text-secondary group-hover:text-accent-blue transition-colors shrink-0" />
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Export : renderer du <a> pour ReactMarkdown
// ---------------------------------------------------------------------------

export function fileDownloadLinkRenderer({
  href,
  children,
}: {
  href?: string
  children?: React.ReactNode
}) {
  if (href && isFilePath(href)) {
    const ext = getExt(decodePath(href))
    if (IMAGE_EXTENSIONS.has(ext)) {
      return <ImagePreviewCard href={href}>{children}</ImagePreviewCard>
    }
    return <FileDownloadCard href={href}>{children}</FileDownloadCard>
  }

  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-accent-blue hover:underline">
      {children}
    </a>
  )
}

// ---------------------------------------------------------------------------
// Export : plugin remark — convertit automatiquement les chemins de fichiers en texte brut en liens
// ---------------------------------------------------------------------------

/**
 * Plugin remark : parcourt les nœuds texte et convertit automatiquement en liens markdown
 * le texte brut correspondant au motif de chemin de fichier.
 */
export function remarkFileLinks() {
  // Correspond aux chemins sous .openclaw (workspace, media, etc.) et aux chemins absolus
  const GLOBAL_RE =
    /(?:(?:\/[\w.-]+)*\/\.openclaw\/|~\/\.openclaw\/)?(?:workspace(?:-[\w-]+)?|media(?:\/[\w.-]+)*)\/[\w.\/\-\u4e00-\u9fff]+\.\w{1,10}|~?(?:\/[\w._-]+)+\/[\w.\-\u4e00-\u9fff]+\.\w{1,10}/g

  return (tree: any) => {
    // Traite les nœuds texte ordinaires
    visit(tree, 'text', (node: any, index: number | null, parent: any) => {
      if (!parent || index === null) return
      if (parent.type === 'link') return

      const value: string = node.value
      GLOBAL_RE.lastIndex = 0
      const matches = [...value.matchAll(GLOBAL_RE)]
      if (matches.length === 0) return

      const children: any[] = []
      let lastEnd = 0

      for (const match of matches) {
        const start = match.index!
        const end = start + match[0].length
        const filePath = match[0]
        const ext = getExt(filePath)

        if (!FILE_EXTENSIONS.has(ext)) continue

        if (start > lastEnd) {
          children.push({ type: 'text', value: value.slice(lastEnd, start) })
        }

        const filename = filePath.split('/').pop() || filePath
        children.push({
          type: 'link',
          url: filePath,
          children: [{ type: 'text', value: filename }],
        })

        lastEnd = end
      }

      if (children.length === 0) return

      if (lastEnd < value.length) {
        children.push({ type: 'text', value: value.slice(lastEnd) })
      }

      parent.children.splice(index, 1, ...children)
    })

    // Traite les nœuds de code en ligne (l'IA entoure souvent les chemins de backticks)
    visit(tree, 'inlineCode', (node: any, index: number | null, parent: any) => {
      if (!parent || index === null) return
      const value: string = node.value
      GLOBAL_RE.lastIndex = 0
      const match = GLOBAL_RE.exec(value)
      if (!match) return
      const filePath = match[0]
      const ext = getExt(filePath)
      if (!FILE_EXTENSIONS.has(ext)) return
      const filename = filePath.split('/').pop() || filePath
      parent.children.splice(index, 1, {
        type: 'link',
        url: filePath,
        children: [{ type: 'text', value: filename }],
      })
    })

    // Traite les nœuds de blocs de code (l'IA entoure parfois les chemins de blocs ```)
    visit(tree, 'code', (node: any, index: number | null, parent: any) => {
      if (!parent || index === null) return
      const value: string = node.value?.trim()
      if (!value) return
      GLOBAL_RE.lastIndex = 0
      const match = GLOBAL_RE.exec(value)
      if (!match) return
      const filePath = match[0]
      const ext = getExt(filePath)
      if (!FILE_EXTENSIONS.has(ext)) return
      // Ne remplace que si le bloc de code est quasiment un chemin seul (évite les faux positifs sur du long code)
      if (value.length > filePath.length + 20) return
      const filename = filePath.split('/').pop() || filePath
      parent.children.splice(index, 1, {
        type: 'paragraph',
        children: [{
          type: 'link',
          url: filePath,
          children: [{ type: 'text', value: filename }],
        }],
      })
    })
  }
}

// ---------------------------------------------------------------------------
// Minimal AST visitor (évite la dépendance supplémentaire unist-util-visit)
// ---------------------------------------------------------------------------

function visit(tree: any, type: string, fn: (node: any, index: number | null, parent: any) => void) {
  function walker(node: any, index: number | null, parent: any) {
    if (node.type === type) {
      fn(node, index, parent)
    }
    if (node.children) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        walker(node.children[i], i, node)
      }
    }
  }
  walker(tree, null, null)
}

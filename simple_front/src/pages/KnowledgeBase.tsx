import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useOutletContext } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowLeft,
  BookOpen,
  Bot,
  ChevronRight,
  Download,
  FilePlus,
  FileText,
  Folder,
  FolderPlus,
  GitBranch,
  Link,
  Loader2,
  PencilLine,
  RefreshCw,
  Save,
  Search,
  Tags,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import ClearableInput from '../components/ui/ClearableInput.tsx'
import IconButton from '../components/ui/IconButton.tsx'
import Popconfirm from '../components/ui/Popconfirm.tsx'
import { useToast } from '../components/ui/Toast.tsx'
import {
  browseFiles,
  createDirectory,
  deleteFile,
  downloadManagedFile,
  getKnowledgeGraph,
  listKnowledge,
  readKnowledge,
  searchKnowledge,
  uploadFile,
  writeManagedFile,
} from '../lib/api.ts'
import type {
  AgentInfo,
  BrowseFileResult,
  FileEntry,
  KnowledgeGraphResult,
  KnowledgeListResult,
  KnowledgePageMeta,
  KnowledgeReadResult,
  KnowledgeSearchResult,
} from '../lib/api.ts'
import type { LayoutOutletContext } from '../components/Layout.tsx'

const maxUploadSizeLabel = '50MB'
const t = {
  menu: 'Menu',
  knowledge: 'Base de connaissances',
  subtitle: 'Organisez les connaissances de vos agents en Markdown : recherche, aperçu, liens entrants et rappel en conversation',
  refresh: 'Rafraîchir la base de connaissances',
  graph: 'Graphe de connaissances',
  newDoc: 'Nouveau document',
  newFolder: 'Nouveau dossier',
  upload: 'Téléverser',
  hint: 'Astuce : ',
  hintBody: "Cette version indexe les fichiers Markdown. Les autres fichiers téléversés restent sauvegardés ; les documents `.md` entrent dans la recherche, les liens entrants et le rappel en conversation.",
  chooseAgent: 'Choisir un agent',
  defaultAgent: 'Assistant principal',
  search: 'Rechercher dans la base de connaissances',
  noMatch: 'Aucun résultat correspondant',
  retry: 'Réessayer',
  noFiles: 'Aucun fichier',
  noMarkdown: 'Aucun document Markdown',
  attachments: 'Pièces jointes / fichiers non indexés',
  chooseDoc: 'Choisir un document de connaissances',
  editDoc: 'Modifier le document',
  downloadDoc: 'Télécharger le document',
  deleteDoc: 'Supprimer le document',
  deleteFolder: 'Supprimer le dossier',
  deleteTitle: 'Supprimer ce document ?',
  deleteFolderTitle: 'Supprimer ce dossier ?',
  deleteConfirm: 'Supprimer',
  reading: 'Lecture du document',
  loadingGraph: 'Chargement du graphe',
  emptyAfterCreate: "La base de connaissances s'affichera ici dès que vous téléverserez ou créerez un document Markdown.",
  metadata: 'Métadonnées',
  backlinks: 'Liens entrants',
  noTags: 'Aucune étiquette',
  noBacklinks: 'Aucun lien entrant',
  selectDocForMeta: "Les propriétés s'affichent après sélection d'un document",
  type: 'Type',
  domain: 'Domaine',
  status: 'Statut',
  updated: 'Mis à jour',
  closeGraph: 'Fermer le graphe de connaissances',
  editDialog: 'Modifier le document de la base de connaissances',
  closeEditor: "Fermer l'éditeur",
  unsaved: 'Non enregistré',
  unsavedChanges: "Des modifications non enregistrées existent — enregistrez-les avant de fermer.",
  lastSaved: 'Dernière sauvegarde',
  notSavedYet: 'Pas encore enregistré',
  save: 'Enregistrer',
  cancel: 'Annuler',
  create: 'Créer',
  clearFolder: 'Effacer le nom du dossier',
  folderPlaceholder: 'Saisissez le nom du dossier',
  clearDoc: 'Effacer le nom du document',
  docPlaceholder: 'Saisissez le nom du document Markdown',
  emptyFolder: 'Dossier vide',
  loadFailed: 'Échec du chargement de la base de connaissances',
  readFailed: 'Échec de la lecture du document',
  searchFailed: 'Échec de la recherche',
  uploadFailed: 'Échec du téléversement',
  createFailed: 'Échec de la création',
  createDocFailed: 'Échec de la création du document',
  saveFailed: 'Échec de la sauvegarde',
  deleteFailed: 'Échec de la suppression',
  graphFailed: 'Échec du chargement du graphe',
  readFileFailed: 'Impossible de lire le fichier',
  unsupportedEdit: "Ce fichier ne prend pas encore en charge l'édition en ligne",
  uploaded: "Fichier téléversé ; les documents Markdown entrent dans l'index de la base de connaissances.",
  createdFolder: 'Dossier créé',
  created: 'Créé',
  saved: 'Enregistré',
  deleted: 'Supprimé',
}

type KnowledgeDirectoryMeta = {
  path: string
  name: string
  modified: string
}

type TreeNode = {
  name: string
  path: string
  folders: TreeNode[]
  pages: KnowledgePageMeta[]
}

type EditorFileState = {
  path: string
  name: string
  content: string
  originalContent: string
  lastSavedAt: string | null
}

function trimSlashes(value: string): string {
  return value.replace(/[\\/]+$/, '')
}

function knowledgeRoot(agent: AgentInfo | undefined, agentId: string): string {
  const workspace = agent?.workspace?.trim()
  if (workspace) return `${trimSlashes(workspace)}/knowledge`
  return `profiles/${agentId}/workspace/knowledge`
}

function fullPath(agent: AgentInfo | undefined, agentId: string, subPath = ''): string {
  const root = knowledgeRoot(agent, agentId)
  return subPath ? `${root}/${subPath}` : root
}

function getAgentName(agent: { id: string; name?: string | null; identity?: { name?: string } }): string {
  if (agent.id === 'main') return t.defaultAgent
  return agent.identity?.name || agent.name || agent.id
}

function formatSize(bytes: number | null | undefined): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso?: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
}

function normalizeWikiToken(value: string): string {
  return value.trim().toLowerCase().replace(/\\/g, '/').replace(/\.md$/i, '')
}

function buildTree(pages: KnowledgePageMeta[], directories: KnowledgeDirectoryMeta[] = []): TreeNode {
  const root: TreeNode = { name: 'root', path: '', folders: [], pages: [] }
  const ensureFolder = (parts: string[]) => {
    let cursor = root
    for (const folder of parts) {
      let child = cursor.folders.find(item => item.name === folder)
      if (!child) {
        child = {
          name: folder,
          path: cursor.path ? `${cursor.path}/${folder}` : folder,
          folders: [],
          pages: [],
        }
        cursor.folders.push(child)
      }
      cursor = child
    }
    return cursor
  }
  directories.forEach(directory => ensureFolder(directory.path.split('/').filter(Boolean)))
  for (const page of pages) {
    const parts = page.path.split('/').filter(Boolean)
    ensureFolder(parts.slice(0, -1)).pages.push(page)
  }
  const sortNode = (node: TreeNode) => {
    node.folders.sort((a, b) => a.name.localeCompare(b.name))
    node.pages.sort((a, b) => a.title.localeCompare(b.title))
    node.folders.forEach(sortNode)
  }
  sortNode(root)
  return root
}

function highlight(text: string, query: string) {
  const needle = query.trim()
  if (!needle) return text
  const match = text.toLowerCase().indexOf(needle.toLowerCase())
  if (match < 0) return text
  return (
    <>
      {text.slice(0, match)}
      <mark className="rounded bg-accent-yellow/30 px-0.5 text-light-text">{text.slice(match, match + needle.length)}</mark>
      {text.slice(match + needle.length)}
    </>
  )
}

function GraphPreview({ graph, onSelect }: { graph: KnowledgeGraphResult; onSelect: (path: string) => void }) {
  const nodes = graph.nodes.slice(0, 18)
  if (nodes.length === 0) {
    return <div className="rounded-lg border border-dashed border-light-border p-6 text-center text-sm text-light-text-secondary">No graph data</div>
  }
  const width = 520
  const height = 260
  const radius = 96
  const layout = nodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / nodes.length
    return {
      ...node,
      x: width / 2 + Math.cos(angle) * radius,
      y: height / 2 + Math.sin(angle) * radius,
    }
  })
  const byId = new Map(layout.map(node => [node.id, node]))
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full rounded-lg border border-light-border bg-light-card-hover">
      {graph.edges.map((edge, index) => {
        const source = byId.get(edge.source)
        const target = byId.get(edge.target)
        if (!source || !target) return null
        return <line key={`${edge.source}-${edge.target}-${index}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke="#94a3b8" strokeOpacity="0.55" />
      })}
      {layout.map(node => (
        <g key={node.id} className="cursor-pointer" onClick={() => onSelect(node.id)}>
          <circle cx={node.x} cy={node.y} r="15" className="fill-accent-blue/15 stroke-accent-blue" strokeWidth="1.5" />
          <text x={node.x} y={node.y + 32} textAnchor="middle" className="fill-light-text text-[11px]">
            {node.title.length > 12 ? `${node.title.slice(0, 12)}...` : node.title}
          </text>
        </g>
      ))}
    </svg>
  )
}

export default function KnowledgeBase() {
  const { agents, agentsLoading, refreshAgents, openMobileSidebar } = useOutletContext<LayoutOutletContext>()
  const [selectedAgent, setSelectedAgent] = useState('')
  const [knowledge, setKnowledge] = useState<KnowledgeListResult | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [pageData, setPageData] = useState<KnowledgeReadResult | null>(null)
  const [graph, setGraph] = useState<KnowledgeGraphResult | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<KnowledgeSearchResult[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pageLoading, setPageLoading] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [graphOpen, setGraphOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState<{ type: 'folder' | 'file'; parentPath: string } | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [newDocName, setNewDocName] = useState('')
  const [deletingPath, setDeletingPath] = useState<string | null>(null)
  const [editorFile, setEditorFile] = useState<EditorFileState | null>(null)
  const [editorSaving, setEditorSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editorLineNumbersRef = useRef<HTMLDivElement>(null)
  const selectedPathRef = useRef<string | null>(null)
  const knowledgeRequestSeq = useRef(0)
  const pageRequestSeq = useRef(0)
  const toast = useToast()

  const availableAgents = useMemo(() => {
    const list = agents.filter(agent => agent.id)
    return [...list].sort((a, b) => {
      if (a.id === 'main') return -1
      if (b.id === 'main') return 1
      return getAgentName(a).localeCompare(getAgentName(b), 'zh-Hans')
    })
  }, [agents])
  const selectedAgentInfo = availableAgents.find(agent => agent.id === selectedAgent)
  const pages = knowledge?.pages ?? []
  const directories = knowledge?.directories ?? []
  const attachments = knowledge?.attachments ?? []
  const tree = useMemo(() => buildTree(pages, directories), [directories, pages])
  const folderPaths = useMemo(() => {
    const paths: string[] = []
    const collect = (node: TreeNode) => {
      node.folders.forEach(folder => {
        paths.push(folder.path)
        collect(folder)
      })
    }
    collect(tree)
    return paths
  }, [tree])
  const selectedPage = pageData?.page?.path === selectedPath ? pageData.page : pages.find(page => page.path === selectedPath) ?? null
  const selectedContent = pageData?.page?.path === selectedPath ? pageData.content : ''
  const pageLookup = useMemo(() => {
    const map = new Map<string, string>()
    for (const page of pages) {
      const basename = page.path.split('/').pop() || page.name
      ;[page.path, page.name, page.title, basename, basename.replace(/\.md$/i, '')].forEach(value => {
        map.set(normalizeWikiToken(value), page.path)
      })
    }
    return map
  }, [pages])
  const editorLineNumbers = useMemo(() => {
    const lineCount = Math.max(1, (editorFile?.content.match(/\n/g)?.length ?? 0) + 1)
    return Array.from({ length: lineCount }, (_, index) => index + 1)
  }, [editorFile?.content])
  const editorHasUnsavedChanges = Boolean(editorFile && editorFile.content !== editorFile.originalContent)

  useEffect(() => {
    if (selectedAgent || availableAgents.length === 0) return
    const mainAgent = availableAgents.find(agent => agent.id === 'main')
    setSelectedAgent((mainAgent || availableAgents[0]).id)
  }, [availableAgents, selectedAgent])

  useEffect(() => {
    selectedPathRef.current = selectedPath
  }, [selectedPath])

  useEffect(() => {
    setExpandedFolders(current => {
      const next = new Set(current)
      folderPaths.forEach(path => next.add(path))
      return next
    })
  }, [folderPaths])

  const loadKnowledge = useCallback(async (agentId: string, options: { keepSelection?: boolean } = {}) => {
    if (!agentId) return
    const requestId = ++knowledgeRequestSeq.current
    setLoading(true)
    setLoadError(null)
    try {
      const data = await listKnowledge(agentId)
      if (requestId !== knowledgeRequestSeq.current) return
      setKnowledge(data)
      setGraph(null)
      const currentPath = selectedPathRef.current
      if (!options.keepSelection || !currentPath || !data.pages.some(page => page.path === currentPath)) {
        setSelectedPath(data.pages[0]?.path ?? null)
      }
    } catch (err) {
      if (requestId !== knowledgeRequestSeq.current) return
      const message = err instanceof Error ? err.message : t.loadFailed
      setLoadError(message)
      toast.error(message)
      setKnowledge(null)
    } finally {
      if (requestId === knowledgeRequestSeq.current) setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (selectedAgent) void loadKnowledge(selectedAgent)
  }, [loadKnowledge, selectedAgent])

  const selectKnowledgePage = useCallback((path: string) => {
    setSelectedPath(current => {
      if (current === path) return current
      setPageData(null)
      setPageError(null)
      return path
    })
    setQuery('')
  }, [])

  useEffect(() => {
    if (!selectedAgent || !selectedPath) {
      pageRequestSeq.current += 1
      setPageData(null)
      setPageError(null)
      setPageLoading(false)
      return
    }
    const requestId = ++pageRequestSeq.current
    let cancelled = false
    setPageData(null)
    setPageError(null)
    setPageLoading(true)
    readKnowledge(selectedAgent, selectedPath)
      .then(data => {
        if (!cancelled && requestId === pageRequestSeq.current) setPageData(data)
      })
      .catch(err => {
        if (!cancelled && requestId === pageRequestSeq.current) {
          const message = err instanceof Error ? err.message : t.readFailed
          setPageError(message)
          toast.error(message)
        }
      })
      .finally(() => {
        if (!cancelled && requestId === pageRequestSeq.current) setPageLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedAgent, selectedPath, toast])

  useEffect(() => {
    const trimmed = query.trim()
    if (!selectedAgent || !trimmed) {
      setResults([])
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = window.setTimeout(() => {
      searchKnowledge(selectedAgent, trimmed)
        .then(data => {
          if (!cancelled) setResults(data.results)
        })
        .catch(err => {
          if (!cancelled) toast.error(err instanceof Error ? err.message : t.searchFailed)
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 220)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, selectedAgent, toast])

  const retryRead = () => {
    if (!selectedAgent || !selectedPath) return
    const requestId = ++pageRequestSeq.current
    setPageError(null)
    setPageLoading(true)
    readKnowledge(selectedAgent, selectedPath)
      .then(data => {
        if (requestId === pageRequestSeq.current) setPageData(data)
      })
      .catch(err => {
        if (requestId === pageRequestSeq.current) setPageError(err instanceof Error ? err.message : t.readFailed)
      })
      .finally(() => {
        if (requestId === pageRequestSeq.current) setPageLoading(false)
      })
  }

  const openCreateForm = (type: 'folder' | 'file', parentPath = '') => {
    if (parentPath) {
      setExpandedFolders(current => new Set(current).add(parentPath))
    }
    setCreating({ type, parentPath })
    setNewFolderName('')
    setNewDocName('')
    setQuery('')
  }

  const closeCreateForm = () => {
    setCreating(null)
    setNewFolderName('')
    setNewDocName('')
  }

  const handleSelectAgent = (agentId: string) => {
    if (agentId === selectedAgent) return
    pageRequestSeq.current += 1
    setSelectedAgent(agentId)
    setKnowledge(null)
    setSelectedPath(null)
    setPageData(null)
    setPageError(null)
    setPageLoading(false)
    setGraph(null)
    setQuery('')
    setResults([])
    closeCreateForm()
  }

  const toggleFolder = (path: string) => {
    setExpandedFolders(current => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const childPath = (parentPath: string, name: string) => parentPath ? `${parentPath}/${name}` : name

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0 || !selectedAgent) return
    setUploading(true)
    try {
      let latestMarkdown: string | null = null
      for (const file of Array.from(files)) {
        const uploaded = await uploadFile(file, fullPath(selectedAgentInfo, selectedAgent))
        if (uploaded.name.toLowerCase().endsWith('.md')) latestMarkdown = uploaded.name
      }
      if (latestMarkdown) selectKnowledgePage(latestMarkdown)
      await loadKnowledge(selectedAgent, { keepSelection: true })
      if (latestMarkdown) setPageData(await readKnowledge(selectedAgent, latestMarkdown))
      toast.success(t.uploaded)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.uploadFailed)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleNewFolder = async () => {
    const folderName = newFolderName.trim()
    if (!folderName || !selectedAgent) return
    const parentPath = creating?.type === 'folder' ? creating.parentPath : ''
    const relativePath = childPath(parentPath, folderName)
    try {
      await createDirectory(fullPath(selectedAgentInfo, selectedAgent, relativePath))
      closeCreateForm()
      await loadKnowledge(selectedAgent, { keepSelection: true })
      toast.success(`${t.createdFolder} ${relativePath}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.createFailed)
    }
  }

  const handleNewDocument = async () => {
    let fileName = newDocName.trim()
    if (!fileName || !selectedAgent) return
    if (!fileName.toLowerCase().endsWith('.md')) fileName = `${fileName}.md`
    const title = fileName.replace(/\.md$/i, '')
    const parentPath = creating?.type === 'file' ? creating.parentPath : ''
    const relativePath = childPath(parentPath, fileName)
    const path = fullPath(selectedAgentInfo, selectedAgent, relativePath)
    try {
      await writeManagedFile(path, `---\ntitle: ${title}\ntags: []\nsummary: \n---\n\n# ${title}\n\n`)
      closeCreateForm()
      selectKnowledgePage(relativePath)
      await loadKnowledge(selectedAgent, { keepSelection: true })
      setPageData(await readKnowledge(selectedAgent, relativePath))
      toast.success(`${t.created} ${relativePath}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.createDocFailed)
    }
  }

  const handleEditFile = async () => {
    if (!selectedPage) return
    setPageLoading(true)
    const path = fullPath(selectedAgentInfo, selectedAgent, selectedPage.path)
    try {
      const result = await browseFiles(path)
      const fileResult = result as BrowseFileResult
      if (fileResult.content === undefined) throw new Error(t.unsupportedEdit)
      setEditorFile({
        path,
        name: selectedPage.name,
        content: fileResult.content,
        originalContent: fileResult.content,
        lastSavedAt: selectedPage.updated || selectedPage.modified || null,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.readFileFailed)
    } finally {
      setPageLoading(false)
    }
  }

  const handleSaveEditor = async () => {
    if (!editorFile || editorSaving) return
    setEditorSaving(true)
    try {
      await writeManagedFile(editorFile.path, editorFile.content)
      const savedAt = new Date().toISOString()
      setEditorFile(current => current ? {
        ...current,
        originalContent: current.content,
        lastSavedAt: savedAt,
      } : current)
      await loadKnowledge(selectedAgent, { keepSelection: true })
      if (selectedPath) setPageData(await readKnowledge(selectedAgent, selectedPath))
      toast.success(`${t.saved} ${editorFile.name}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.saveFailed)
    } finally {
      setEditorSaving(false)
    }
  }

  const requestCloseEditor = () => {
    if (editorHasUnsavedChanges) {
      toast.error(t.unsavedChanges)
      return
    }
    setEditorFile(null)
  }

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      void handleSaveEditor()
    }
  }

  const handleEditorScroll = (event: React.UIEvent<HTMLTextAreaElement>) => {
    if (editorLineNumbersRef.current) {
      editorLineNumbersRef.current.scrollTop = event.currentTarget.scrollTop
    }
  }

  const handleDeletePage = async (page: KnowledgePageMeta) => {
    const path = fullPath(selectedAgentInfo, selectedAgent, page.path)
    setDeletingPath(path)
    try {
      await deleteFile(path)
      if (selectedPath === page.path) {
        setSelectedPath(null)
        setPageData(null)
      }
      await loadKnowledge(selectedAgent)
      toast.success(`${t.deleted} ${page.name}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.deleteFailed)
    } finally {
      setDeletingPath(null)
    }
  }

  const handleDeleteFolder = async (folderPath: string) => {
    if (!selectedAgent) return
    const path = fullPath(selectedAgentInfo, selectedAgent, folderPath)
    setDeletingPath(path)
    try {
      await deleteFile(path)
      if (selectedPath?.startsWith(`${folderPath}/`)) {
        setSelectedPath(null)
        setPageData(null)
      }
      await loadKnowledge(selectedAgent)
      toast.success(`${t.deleted} ${folderPath}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.deleteFailed)
    } finally {
      setDeletingPath(null)
    }
  }

  const handleDownload = async () => {
    if (!selectedPage) return
    const entry: FileEntry = {
      name: selectedPage.name,
      path: fullPath(selectedAgentInfo, selectedAgent, selectedPage.path),
      type: 'file',
      size: selectedPage.size,
      modified: selectedPage.modified,
      content_type: 'text/markdown',
    }
    await downloadManagedFile(entry)
  }

  const openGraph = async () => {
    if (!selectedAgent) return
    setGraphOpen(true)
    if (graph) return
    try {
      setGraph(await getKnowledgeGraph(selectedAgent))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.graphFailed)
    }
  }

  const resolveWikiPath = (href: string) => pageLookup.get(normalizeWikiToken(decodeURIComponent(href)))

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-light-bg">
      <div className="flex min-h-0 w-full flex-col px-4 py-5 sm:px-5 lg:px-6">
        <header className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <button type="button" onClick={openMobileSidebar} className="mb-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-light-border bg-light-card px-3 py-2 text-sm text-light-text-secondary shadow-sm transition-colors hover:bg-light-card-hover hover:text-light-text lg:hidden">
              <ArrowLeft size={16} />
              {t.menu}
            </button>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-blue/10 text-accent-blue">
                <BookOpen size={22} />
              </span>
              <div>
                <h1 className="text-2xl font-bold leading-tight tracking-normal text-light-text sm:text-[28px]">{t.knowledge}</h1>
                <p className="mt-1 text-sm text-light-text-secondary">{t.subtitle}</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <IconButton label={t.refresh} onClick={() => {
              void refreshAgents({ force: true })
              if (selectedAgent) void loadKnowledge(selectedAgent, { keepSelection: true })
            }} tone="primary" className="border border-light-border bg-light-card shadow-sm">
              <RefreshCw size={17} />
            </IconButton>
            <button type="button" onClick={openGraph} className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-light-border bg-light-card px-4 py-2.5 text-sm font-medium text-light-text transition-colors hover:bg-light-card-hover">
              <GitBranch size={17} className="text-accent-purple" />
              {t.graph}
            </button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-accent-blue px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-cyan-700">
              {uploading ? <Loader2 size={17} className="animate-spin" /> : <Upload size={17} />}
              {t.upload}
              <input ref={fileInputRef} type="file" multiple className="hidden" title={`Max file size ${maxUploadSizeLabel}`} onChange={handleUpload} />
            </label>
          </div>
        </header>

        <div className="mb-4 rounded-lg border border-accent-blue/20 bg-accent-blue/5 px-4 py-3 text-sm leading-6 text-light-text-secondary">
          <span className="font-medium text-light-text">{t.hint}</span>
          {t.hintBody}
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden xl:grid-cols-[520px_minmax(0,1fr)_300px] 2xl:grid-cols-[560px_minmax(0,1fr)_300px]">
          <aside className="grid min-h-0 gap-4 md:grid-cols-[180px_minmax(0,1fr)] xl:grid-cols-[170px_minmax(0,1fr)]">
            <section className="min-h-0 rounded-lg border border-light-border bg-light-card p-3 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-light-text">
                <Bot size={16} className="text-accent-blue" />
                {t.chooseAgent}
              </div>
              {agentsLoading ? (
                <div className="space-y-2">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="skeleton-shimmer h-8 rounded-xl" />)}</div>
              ) : (
                <div className="max-h-48 space-y-1 overflow-y-auto pr-1 md:max-h-[calc(100vh-18rem)]">
                  {availableAgents.map(agent => (
                    <button key={agent.id} type="button" onClick={() => handleSelectAgent(agent.id)} className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${agent.id === selectedAgent ? 'bg-accent-blue text-white shadow-sm' : 'text-light-text-secondary hover:bg-light-card-hover hover:text-light-text'}`}>
                      <Bot size={15} />
                      <span className="min-w-0 flex-1 truncate">{getAgentName(agent)}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-light-border bg-light-card p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-2 border-b border-light-border pb-2">
                <div className="min-w-0 text-xs font-semibold uppercase tracking-normal text-light-text-secondary">Explorer</div>
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton label={`${t.newDoc} (${knowledge?.knowledgeRoot || t.knowledge})`} onClick={() => openCreateForm('file')} tone="primary" surface="plain" className="h-7 w-7">
                    <FilePlus size={15} />
                  </IconButton>
                  <IconButton label={`${t.newFolder} (${knowledge?.knowledgeRoot || t.knowledge})`} onClick={() => openCreateForm('folder')} tone="primary" surface="plain" className="h-7 w-7">
                    <FolderPlus size={15} />
                  </IconButton>
                </div>
              </div>
              <div className="relative mb-3">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-light-text-secondary" />
                <input value={query} onChange={event => setQuery(event.target.value)} placeholder={t.search} className="w-full rounded-xl border border-light-border bg-light-card px-9 py-2 text-sm text-light-text outline-none transition-colors placeholder:text-light-text-secondary focus:border-accent-blue" />
                {searching && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-accent-blue" />}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
                {query.trim() ? (
                  <div className="space-y-2">
                    {results.length === 0 && !searching ? <div className="rounded-lg border border-dashed border-light-border px-3 py-6 text-center text-sm text-light-text-secondary">{t.noMatch}</div> : null}
                    {results.map((result, index) => (
                      <button key={`${result.path}-${result.line}-${index}`} type="button" onClick={() => selectKnowledgePage(result.path)} className="w-full rounded-lg border border-light-border bg-light-card-hover/60 px-3 py-2 text-left transition-colors hover:border-accent-blue/50">
                        <div className="truncate text-xs font-medium text-accent-blue">{result.path}:{result.line}</div>
                        <div className="mt-1 line-clamp-2 text-xs leading-5 text-light-text-secondary">{highlight(result.text, query)}</div>
                      </button>
                    ))}
                  </div>
                ) : loading ? (
                  <div className="space-y-2">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="skeleton-shimmer h-10 rounded-lg" />)}</div>
                ) : loadError ? (
                  <div className="rounded-lg border border-accent-red/25 bg-accent-red/5 px-3 py-5 text-center text-sm text-light-text-secondary">
                    <p className="mb-3 text-accent-red">{loadError}</p>
                    <button type="button" onClick={() => selectedAgent && void loadKnowledge(selectedAgent, { keepSelection: true })} className="rounded-lg bg-accent-blue px-3 py-1.5 text-xs font-medium text-white">{t.retry}</button>
                  </div>
                ) : pages.length === 0 && directories.length === 0 && attachments.length === 0 ? (
                  <>
                    <CreateTreeForm
                      creating={creating}
                      parentPath=""
                      newFolderName={newFolderName}
                      newDocName={newDocName}
                      onFolderNameChange={setNewFolderName}
                      onDocNameChange={setNewDocName}
                      onCreateFolder={handleNewFolder}
                      onCreateDocument={handleNewDocument}
                      onCancel={closeCreateForm}
                    />
                    <div className="rounded-lg border border-dashed border-light-border px-3 py-8 text-center text-sm text-light-text-secondary">{t.noFiles}</div>
                  </>
                ) : (
                  <>
                    <CreateTreeForm
                      creating={creating}
                      parentPath=""
                      newFolderName={newFolderName}
                      newDocName={newDocName}
                      onFolderNameChange={setNewFolderName}
                      onDocNameChange={setNewDocName}
                      onCreateFolder={handleNewFolder}
                      onCreateDocument={handleNewDocument}
                      onCancel={closeCreateForm}
                    />
                    {pages.length > 0 || directories.length > 0 ? (
                      <TreeSection
                        node={tree}
                        selectedPath={selectedPath}
                        expandedFolders={expandedFolders}
                        creating={creating}
                        newFolderName={newFolderName}
                        newDocName={newDocName}
                        onSelect={selectKnowledgePage}
                        onCreateAt={openCreateForm}
                        onDeletePage={handleDeletePage}
                        onDeleteFolder={handleDeleteFolder}
                        onToggleFolder={toggleFolder}
                        deletingPath={deletingPath}
                        fullPathForNode={(path) => fullPath(selectedAgentInfo, selectedAgent, path)}
                        onFolderNameChange={setNewFolderName}
                        onDocNameChange={setNewDocName}
                        onCreateFolder={handleNewFolder}
                        onCreateDocument={handleNewDocument}
                        onCancelCreate={closeCreateForm}
                      />
                    ) : (
                      <div className="rounded-lg border border-dashed border-light-border px-3 py-5 text-center text-sm text-light-text-secondary">{t.noMarkdown}</div>
                    )}
                    {attachments.length > 0 && (
                      <section className="mt-4 border-t border-light-border pt-3">
                        <div className="mb-2 px-2 text-xs font-semibold text-light-text-secondary">{t.attachments}</div>
                        <div className="space-y-1">
                          {attachments.map(file => (
                            <div key={file.path} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-light-text-secondary">
                              <FileText size={15} className="shrink-0 text-slate-400" />
                              <span className="min-w-0 flex-1 truncate" title={file.path}>{file.name}</span>
                              <span className="shrink-0 text-xs">{formatSize(file.size)}</span>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                  </>
                )}
              </div>
            </section>
          </aside>

          <main className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-light-border bg-light-card shadow-sm">
            <div className="flex min-h-14 items-center justify-between gap-3 border-b border-light-border px-4 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-light-text">{selectedPage?.title || t.chooseDoc}</h2>
                <p className="mt-0.5 truncate text-xs text-light-text-secondary">{selectedPage ? `${selectedPage.path} - ${formatSize(selectedPage.size)} - ${formatDate(selectedPage.updated || selectedPage.modified)}` : knowledge?.knowledgeRoot || ''}</p>
              </div>
              {selectedPage && (
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton label={t.editDoc} onClick={() => void handleEditFile()} tone="primary" surface="plain"><PencilLine size={16} /></IconButton>
                  <IconButton label={t.downloadDoc} onClick={() => void handleDownload()} tone="primary" surface="plain"><Download size={16} /></IconButton>
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {pageLoading ? (
                <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-light-text-secondary"><Loader2 size={18} className="animate-spin text-accent-blue" />{t.reading}</div>
              ) : pageError ? (
                <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center text-sm text-light-text-secondary">
                  <p className="max-w-md text-accent-red">{pageError}</p>
                  <button type="button" onClick={retryRead} className="rounded-lg bg-accent-blue px-3 py-1.5 text-xs font-medium text-white">{t.retry}</button>
                </div>
              ) : selectedPath && pageData?.page?.path !== selectedPath ? (
                <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-light-text-secondary"><Loader2 size={18} className="animate-spin text-accent-blue" />{t.reading}</div>
              ) : !selectedPage ? (
                <div className="flex min-h-64 flex-col items-center justify-center text-center text-light-text-secondary">
                  <BookOpen size={54} strokeWidth={1.5} className="mb-3 opacity-50" />
                  <p className="text-sm">{t.emptyAfterCreate}</p>
                </div>
              ) : (
                <article className="prose prose-slate max-w-none text-[13px] leading-6 text-slate-600 prose-headings:text-slate-800 prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-p:my-2.5 prose-li:my-0.5 prose-a:text-accent-blue prose-code:rounded prose-code:bg-light-card-hover prose-code:px-1 prose-code:py-0.5 prose-code:text-[12px] prose-code:text-accent-purple">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                    a({ href, children }) {
                      if (href?.startsWith('#wiki=')) {
                        const resolved = resolveWikiPath(href.slice('#wiki='.length))
                        return <button type="button" onClick={() => resolved && selectKnowledgePage(resolved)} className="inline-flex cursor-pointer items-center gap-1 text-accent-blue underline decoration-accent-blue/30 underline-offset-4 hover:decoration-accent-blue"><Link size={14} />{children}</button>
                      }
                      return <a href={href} target="_blank" rel="noreferrer">{children}</a>
                    },
                  }}>
                    {selectedContent.replace(/\[\[([^\]]+)\]\]/g, (_match, rawLink) => {
                      const [target, label] = String(rawLink).split('|')
                      return `[${label?.trim() || target.trim()}](#wiki=${encodeURIComponent(target.trim())})`
                    })}
                  </ReactMarkdown>
                </article>
              )}
            </div>
          </main>

          <aside className="min-h-0 space-y-4 overflow-y-auto pr-1">
            <section className="rounded-lg border border-light-border bg-light-card p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-light-text">
                <Tags size={16} className="text-accent-blue" />
                {t.metadata}
              </div>
              {selectedPage ? (
                <div className="space-y-3 text-sm">
                  <MetaRow label={t.type} value={selectedPage.type} />
                  <MetaRow label={t.domain} value={selectedPage.domain} />
                  <MetaRow label={t.status} value={selectedPage.status} />
                  <MetaRow label={t.updated} value={formatDate(selectedPage.updated || selectedPage.modified)} />
                  {selectedPage.summary && <p className="rounded-lg bg-light-card-hover px-3 py-2 text-xs leading-5 text-light-text-secondary">{selectedPage.summary}</p>}
                  <div className="flex flex-wrap gap-2">
                    {selectedPage.tags.length ? selectedPage.tags.map(tag => <span key={tag} className="rounded-full bg-accent-blue/10 px-2 py-1 text-xs font-medium text-accent-blue">#{tag}</span>) : <span className="text-xs text-light-text-secondary">{t.noTags}</span>}
                  </div>
                </div>
              ) : <p className="text-sm text-light-text-secondary">{t.selectDocForMeta}</p>}
            </section>

            <section className="rounded-lg border border-light-border bg-light-card p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-light-text">
                <Link size={16} className="text-accent-purple" />
                {t.backlinks}
              </div>
              {pageData?.page?.path === selectedPath && pageData.backlinks.length ? (
                <div className="space-y-2">
                  {pageData.backlinks.map(backlink => <button key={backlink} type="button" onClick={() => selectKnowledgePage(backlink)} className="block w-full truncate rounded-lg border border-light-border px-3 py-2 text-left text-xs text-light-text-secondary transition-colors hover:border-accent-blue hover:text-light-text">{backlink}</button>)}
                </div>
              ) : <p className="text-sm text-light-text-secondary">{t.noBacklinks}</p>}
            </section>
          </aside>
        </div>
      </div>

      {graphOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-5">
          <button type="button" className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]" aria-label={t.closeGraph} onClick={() => setGraphOpen(false)} />
          <section className="relative w-full max-w-3xl rounded-lg border border-light-border bg-light-card p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-light-text">{t.graph}</h2>
              <IconButton label={t.closeGraph} onClick={() => setGraphOpen(false)}><X size={17} /></IconButton>
            </div>
            {graph ? <GraphPreview graph={graph} onSelect={path => { selectKnowledgePage(path); setGraphOpen(false) }} /> : <div className="flex h-64 items-center justify-center gap-2 text-sm text-light-text-secondary"><Loader2 size={18} className="animate-spin text-accent-blue" />{t.loadingGraph}</div>}
          </section>
        </div>
      )}

      {editorFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-3 py-4 sm:px-6 sm:py-6">
          <button type="button" className="absolute inset-0 cursor-default bg-slate-950/55 backdrop-blur-[2px]" aria-label={t.closeEditor} onClick={requestCloseEditor} />
          <section role="dialog" aria-modal="true" aria-label={t.editDialog} className="relative flex h-[min(88vh,900px)] w-full max-w-[min(1440px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-light-border bg-light-card shadow-2xl shadow-slate-950/25">
            <header className="flex min-h-14 items-center justify-between gap-3 border-b border-light-border px-4 py-3">
              <div className="min-w-0">
                <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold text-light-text">
                  {editorHasUnsavedChanges && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-label={t.unsaved} />}
                  <span className="truncate">{editorFile.name}</span>
                </h2>
                <p className="mt-0.5 truncate text-xs text-light-text-secondary">{editorFile.path}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="hidden text-xs text-light-text-secondary sm:inline">
                  {t.lastSaved}: {editorFile.lastSavedAt ? formatDateTime(editorFile.lastSavedAt) : t.notSavedYet}
                </span>
                <button type="button" disabled={editorSaving} onClick={() => void handleSaveEditor()} className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-accent-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-700 disabled:opacity-60">
                  {editorSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {t.save}
                </button>
                <IconButton label={t.closeEditor} onClick={requestCloseEditor} className="border border-light-border"><X size={17} /></IconButton>
              </div>
            </header>
            <div className="grid min-h-0 flex-1 grid-cols-[56px_minmax(0,1fr)] bg-slate-950">
              <div
                ref={editorLineNumbersRef}
                aria-hidden="true"
                className="select-none overflow-hidden border-r border-slate-800 bg-slate-900/95 px-3 py-4 text-right font-mono text-[13px] leading-6 text-slate-500"
              >
                {editorLineNumbers.map(line => (
                  <div key={line} className="h-6 tabular-nums">{line}</div>
                ))}
              </div>
              <textarea
                value={editorFile.content}
                onChange={event => setEditorFile(current => current ? { ...current, content: event.target.value } : current)}
                onKeyDown={handleEditorKeyDown}
                onScroll={handleEditorScroll}
                spellCheck={false}
                autoFocus
                className="min-h-0 resize-none border-0 bg-slate-950 px-4 py-4 font-mono text-[13px] leading-6 text-slate-100 caret-cyan-300 outline-none selection:bg-cyan-400/25 placeholder:text-slate-500"
              />
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex justify-between gap-3 border-b border-light-border/70 pb-2 text-xs last:border-b-0">
      <span className="text-light-text-secondary">{label}</span>
      <span className="truncate font-medium text-light-text">{value}</span>
    </div>
  )
}

type CreateTarget = { type: 'folder' | 'file'; parentPath: string } | null

type CreateTreeFormProps = {
  creating: CreateTarget
  parentPath: string
  newFolderName: string
  newDocName: string
  onFolderNameChange: (value: string) => void
  onDocNameChange: (value: string) => void
  onCreateFolder: () => void
  onCreateDocument: () => void
  onCancel: () => void
}

function CreateTreeForm({
  creating,
  parentPath,
  newFolderName,
  newDocName,
  onFolderNameChange,
  onDocNameChange,
  onCreateFolder,
  onCreateDocument,
  onCancel,
}: CreateTreeFormProps) {
  if (!creating || creating.parentPath !== parentPath) return null
  const isFolder = creating.type === 'folder'
  const value = isFolder ? newFolderName : newDocName
  const submit = isFolder ? onCreateFolder : onCreateDocument
  return (
    <div className="mb-1 grid min-w-0 grid-cols-[18px_minmax(0,1fr)_auto_24px] items-center gap-1 rounded-md border border-accent-blue/30 bg-accent-blue/5 px-1.5 py-1">
      {isFolder ? <Folder size={15} className="shrink-0 text-amber-500" /> : <FileText size={15} className="shrink-0 text-accent-blue" />}
      <ClearableInput
        value={value}
        onValueChange={isFolder ? onFolderNameChange : onDocNameChange}
        onKeyDown={event => {
          if (event.key === 'Enter') submit()
          if (event.key === 'Escape') onCancel()
        }}
        autoFocus
        clearLabel={isFolder ? t.clearFolder : t.clearDoc}
        placeholder={isFolder ? t.folderPlaceholder : t.docPlaceholder}
        className="min-w-0 border-0 bg-transparent px-1 py-1 font-mono text-sm text-light-text outline-none placeholder:text-light-text-secondary"
      />
      <button type="button" onClick={() => submit()} className="shrink-0 cursor-pointer rounded-md bg-accent-blue px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-cyan-700">
        {t.create}
      </button>
      <IconButton label={t.cancel} onClick={onCancel} surface="plain" size="sm">
        <X size={14} />
      </IconButton>
    </div>
  )
}

type TreeSectionProps = {
  node: TreeNode
  selectedPath: string | null
  expandedFolders: Set<string>
  creating: CreateTarget
  newFolderName: string
  newDocName: string
  onSelect: (path: string) => void
  onCreateAt: (type: 'folder' | 'file', parentPath: string) => void
  onDeletePage: (page: KnowledgePageMeta) => void
  onDeleteFolder: (path: string) => void
  onToggleFolder: (path: string) => void
  deletingPath: string | null
  fullPathForNode: (path: string) => string
  onFolderNameChange: (value: string) => void
  onDocNameChange: (value: string) => void
  onCreateFolder: () => void
  onCreateDocument: () => void
  onCancelCreate: () => void
  depth?: number
}

function TreeSection({
  node,
  selectedPath,
  expandedFolders,
  creating,
  newFolderName,
  newDocName,
  onSelect,
  onCreateAt,
  onDeletePage,
  onDeleteFolder,
  onToggleFolder,
  deletingPath,
  fullPathForNode,
  onFolderNameChange,
  onDocNameChange,
  onCreateFolder,
  onCreateDocument,
  onCancelCreate,
  depth = 0,
}: TreeSectionProps) {
  const indentSize = 20
  const isRoot = !node.path
  const rowIndent = depth * indentSize
  const childDepth = isRoot ? depth : depth + 1
  const childIndent = childDepth * indentSize
  const isExpanded = isRoot || expandedFolders.has(node.path)
  const hasChildren = node.folders.length > 0 || node.pages.length > 0 || Boolean(creating && creating.parentPath === node.path)
  return (
    <div className="min-w-0 space-y-0.5">
      {node.path && (
        <div className="group grid min-w-0 grid-cols-[18px_18px_minmax(0,1fr)_78px] items-center gap-1 rounded-md px-1.5 py-1.5 text-sm text-light-text-secondary transition-colors hover:bg-light-card-hover hover:text-light-text" style={{ marginLeft: rowIndent }}>
          <button
            type="button"
            onClick={() => onToggleFolder(node.path)}
            className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-light-text-secondary transition-colors hover:bg-light-card hover:text-light-text"
            aria-label={isExpanded ? `Réduire ${node.name}` : `Déplier ${node.name}`}
          >
            <ChevronRight size={14} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
          </button>
          <Folder size={15} className={`shrink-0 ${isExpanded ? 'text-amber-500' : 'text-amber-600'}`} />
          <button type="button" onClick={() => onToggleFolder(node.path)} className="min-w-0 cursor-pointer text-left">
            <span className="block truncate font-medium" title={node.path}>{node.name}</span>
          </button>
          <div className="flex shrink-0 items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <IconButton label={`${t.newDoc} - ${node.path}`} onClick={() => onCreateAt('file', node.path)} tone="primary" surface="plain" size="sm">
              <FilePlus size={14} />
            </IconButton>
            <IconButton label={`${t.newFolder} - ${node.path}`} onClick={() => onCreateAt('folder', node.path)} tone="primary" surface="plain" size="sm">
              <FolderPlus size={14} />
            </IconButton>
            <Popconfirm title={t.deleteFolderTitle} description={`"${node.path}" will be deleted from the knowledge base.`} confirmText={t.deleteConfirm} danger onConfirm={() => onDeleteFolder(node.path)}>
              <button type="button" disabled={deletingPath === fullPathForNode(node.path)} className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-light-text-secondary transition-colors hover:bg-accent-red/10 hover:text-accent-red disabled:opacity-50" aria-label={t.deleteFolder}>
                {deletingPath === fullPathForNode(node.path) ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              </button>
            </Popconfirm>
          </div>
        </div>
      )}
      {hasChildren && isExpanded && (
        <>
          <div style={{ marginLeft: childIndent }}>
            <CreateTreeForm
              creating={creating}
              parentPath={node.path}
              newFolderName={newFolderName}
              newDocName={newDocName}
              onFolderNameChange={onFolderNameChange}
              onDocNameChange={onDocNameChange}
              onCreateFolder={onCreateFolder}
              onCreateDocument={onCreateDocument}
              onCancel={onCancelCreate}
            />
          </div>
          {node.pages.map(page => (
            <div
              key={page.path}
              className={`group grid min-w-0 grid-cols-[18px_18px_minmax(0,1fr)_28px] items-center gap-1 rounded-md px-1.5 py-1.5 text-left transition-colors ${selectedPath === page.path ? 'border border-accent-blue/20 bg-accent-blue/10 text-light-text shadow-sm shadow-cyan-900/5' : 'border border-transparent text-light-text-secondary hover:bg-light-card-hover hover:text-light-text'}`}
              style={{ marginLeft: childIndent }}
            >
              <span className="h-5 w-5" />
              <FileText size={15} className="shrink-0 text-accent-blue" />
              <button type="button" onClick={() => onSelect(page.path)} className="min-w-0 cursor-pointer truncate text-left font-mono text-sm" title={page.path}>
                {page.name}
              </button>
              <Popconfirm title={t.deleteTitle} description={`"${page.name}" will be deleted from the knowledge base.`} confirmText={t.deleteConfirm} danger onConfirm={() => onDeletePage(page)}>
                <button type="button" disabled={deletingPath === fullPathForNode(page.path)} className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-light-text-secondary opacity-0 transition-colors hover:bg-accent-red/10 hover:text-accent-red group-hover:opacity-100 group-focus-within:opacity-100 disabled:opacity-50" aria-label={t.deleteDoc}>
                  {deletingPath === fullPathForNode(page.path) ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </Popconfirm>
            </div>
          ))}
          {node.folders.map(child => (
            <TreeSection
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              expandedFolders={expandedFolders}
              creating={creating}
              newFolderName={newFolderName}
              newDocName={newDocName}
              onSelect={onSelect}
              onCreateAt={onCreateAt}
              onDeletePage={onDeletePage}
              onDeleteFolder={onDeleteFolder}
              onToggleFolder={onToggleFolder}
              deletingPath={deletingPath}
              fullPathForNode={fullPathForNode}
              onFolderNameChange={onFolderNameChange}
              onDocNameChange={onDocNameChange}
              onCreateFolder={onCreateFolder}
              onCreateDocument={onCreateDocument}
              onCancelCreate={onCancelCreate}
              depth={childDepth}
            />
          ))}
        </>
      )}
    </div>
  )
}
